"""ssh-run.py — run a shell command on the ECS box via paramiko.

Windows OpenSSH sometimes hangs after the remote command finishes (stdin/console
issues), so ops scripts use paramiko instead. Reads the command from argv[1].

Usage:
  python scripts/ssh-run.py "ls /www/autotasker/app | head"
"""
import os
import sys
import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HOST = "8.155.53.12"
KEY = os.path.join(os.environ.get("USERPROFILE", ""), ".ssh", "id_ed25519")


def main():
    if len(sys.argv) < 2:
        print("usage: python scripts/ssh-run.py \"<command>\"")
        sys.exit(2)
    cmd = sys.argv[1]
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", key_filename=KEY, timeout=20)
    _, o, e = c.exec_command(cmd, timeout=600)
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    rc = o.channel.recv_exit_status()
    sys.stdout.write(out)
    if err.strip():
        sys.stdout.write("\n[stderr]\n" + err)
    print(f"\n[exit {rc}]")
    c.close()
    sys.exit(0 if rc == 0 else 1)


if __name__ == "__main__":
    main()
