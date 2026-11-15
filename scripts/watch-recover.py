"""watch-recover.py — watch the ECS until it answers, then run the recovery
pipeline exactly once (deploy -> crons -> verify).

Why this exists
---------------
2026-11-15: the box stopped answering the whole world (HK/ID/IR/KZ/RS nodes all
timed out; TCP 22/443 accepted but not a single byte came back — that is what a
hung userspace / full disk looks like from outside). A retry loop that only
waits is useless if nobody runs the pipeline afterwards, and a loop that waits
5 minutes x12 expires long before a console-side reboot happens.

States written to data/ops/recover-state.json on every probe:
    DOWN       — no SSH banner and no HTTP answer
    HTTP-ONLY  — web answers but sshd does not (ssh not restored yet)
    SSH-UP     — banner seen; pipeline starts
    DEPLOYED / CRONS-INSTALLED / RECOVERED / PIPELINE-FAILED

Usage:
    python scripts/watch-recover.py --hours 72 --interval 120
    python scripts/watch-recover.py --once          (single probe, no pipeline)

Exit codes: 0 = recovered + verify green, 1 = gave up, 3 = single probe ok.
"""
import argparse
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_DIR = os.path.join(ROOT, "data", "ops")
STATE_FILE = os.path.join(STATE_DIR, "recover-state.json")
LOG_DIR = os.path.join(ROOT, "logs", "ops")

HOST = "8.155.53.12"
SITE = "https://autotasker.highkingflower.com/api/status"


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def probe_ssh(timeout=8):
    """True only when the SSH banner actually arrives (a bare TCP accept is not
    enough — that is exactly the 2026-11-15 false positive)."""
    s = socket.socket()
    s.settimeout(timeout)
    try:
        s.connect((HOST, 22))
        s.settimeout(timeout)
        data = s.recv(64)
        return data.startswith(b"SSH-"), (data[:48].decode(errors="replace") or "no-banner")
    except Exception as e:
        return False, type(e).__name__
    finally:
        try:
            s.close()
        except Exception:
            pass


def probe_http(timeout=12):
    try:
        req = urllib.request.Request(SITE, headers={"User-Agent": "recover-watch/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(120).decode(errors="replace")
            return True, "HTTP %s %s" % (r.status, body[:60])
    except Exception as e:
        return False, type(e).__name__


def write_state(**kw):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        prev = {}
        if os.path.exists(STATE_FILE):
            try:
                with open(STATE_FILE, "r", encoding="utf-8") as f:
                    prev = json.load(f)
            except Exception:
                prev = {}
        prev.update(kw)
        prev["updatedAt"] = now()
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(prev, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("[WARN] state write failed:", str(e)[:80])


def run_step(name, cmd):
    os.makedirs(LOG_DIR, exist_ok=True)
    log = os.path.join(LOG_DIR, "%s-%s.log" % (datetime.now().strftime("%Y%m%d-%H%M%S"), name))
    print("[STEP] %s -> %s" % (name, log))
    try:
        p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, errors="replace")
        with open(log, "w", encoding="utf-8", errors="replace") as f:
            f.write("$ " + " ".join(cmd) + "\n")
            f.write(p.stdout or "")
            f.write("\n--- stderr ---\n")
            f.write(p.stderr or "")
        tail = (p.stdout or "").strip().splitlines()[-3:]
        print("       rc=%s %s" % (p.returncode, " | ".join(t[-110:] for t in tail)))
        return p.returncode
    except Exception as e:
        print("       [FAIL] %s: %s" % (name, str(e)[:120]))
        return 99


def pipeline():
    steps = [
        ("deploy", [sys.executable, os.path.join("scripts", "deploy-v6.py")]),
        ("crons", [sys.executable, os.path.join("scripts", "server-crons.py")]),
        ("verify", ["node", os.path.join("scripts", "verify-v13.js")]),
    ]
    done = []
    for name, cmd in steps:
        rc = run_step(name, cmd)
        if rc != 0:
            write_state(state="PIPELINE-FAILED", failedStep=name, completedSteps=done)
            print("[STOP] %s failed (rc=%s) — see logs/ops/" % (name, rc))
            return 1
        done.append(name)
        write_state(state=name.upper() + "-OK", completedSteps=done)
    write_state(state="RECOVERED", completedSteps=done)
    print("[OK] full pipeline green: deploy + 20 crons + verify")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=float, default=72.0)
    ap.add_argument("--interval", type=int, default=120)
    ap.add_argument("--once", action="store_true")
    args = ap.parse_args()

    if args.once:
        s_ok, s_info = probe_ssh()
        h_ok, h_info = probe_http()
        print("ssh=%s (%s)  http=%s (%s)" % (s_ok, s_info, h_ok, h_info))
        write_state(state=("SSH-UP" if s_ok else ("HTTP-ONLY" if h_ok else "DOWN")),
                    ssh=s_info, http=h_info)
        return 0 if s_ok else (3 if h_ok else 1)

    deadline = time.time() + args.hours * 3600
    attempt = 0
    while time.time() < deadline:
        attempt += 1
        s_ok, s_info = probe_ssh()
        h_ok, h_info = probe_http()
        stamp = datetime.now().strftime("%H:%M:%S")
        if s_ok:
            print("[%s] #%d SSH banner OK (%s) — running recovery pipeline" % (stamp, attempt, s_info))
            write_state(state="SSH-UP", attempt=attempt, ssh=s_info, http=h_info)
            return pipeline()
        state = "HTTP-ONLY" if h_ok else "DOWN"
        print("[%s] #%d %s  ssh=%s  http=%s" % (stamp, attempt, state, s_info, h_info))
        write_state(state=state, attempt=attempt, ssh=s_info, http=h_info,
                    deadline=datetime.fromtimestamp(deadline, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
        time.sleep(max(30, args.interval))
    write_state(state="GAVE-UP", attempt=attempt)
    print("[WARN] %s hours elapsed without an SSH banner; watcher exits." % args.hours)
    return 1


if __name__ == "__main__":
    sys.exit(main())
