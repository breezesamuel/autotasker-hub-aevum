"""deploy-v6.py — deploy the growth-engine build to ECS.

Same proven pipeline as deploy-v5b.py (Python tarfile + paramiko SFTP + BytesIO),
with one safety change: data/ files are NOT pushed from local — the remote copies
are the accumulating source of truth and must never be rolled back by a deploy.
"""
import paramiko, os, io, sys, tarfile, time

SRC = r'F:\2026\第二次点子\repos\autotasker-hub-aevum'
REMOTE_TAR = '/root/autotasker-src.tar.gz'
REMOTE_APP = '/www/autotasker/app'
KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')

# Data directories/files to NEVER overwrite from local (remote is source of truth)
REMOTE_ONLY = ('data/payments', 'data/revenue-ledger.json', 'data/referrals.json',
               'data/support-tickets.json', 'data/treasury-state.json',
               'data/onchain-reconcile.json', 'data/onchain-reconcile-report.json',
               'data/alert-queue.jsonl', 'data/reconcile.log', 'data/rebates/',
               'data/reports/', 'data/api-keys.json', 'data/channel-stats.json',
               'data/digest/', 'data/content/', 'data/blog/', 'data/webhook-subs.json',
               'data/funnel/', 'data/ab-results.json', 'data/growth-stats.json',
               'data/pricing-state.json', 'data/pricing-history.json',
               'data/customer-health.json', 'data/health-actions.json',
               'data/fraud-blocklist.json', 'data/fraud-alarms.json',
               'data/trend-history.json', 'data/trend-predictions.json',
               'data/content-stats.json', 'data/sweep-monitor.json',
               'data/airdrops.json', 'data/games.json',
               'data/attribution.json', 'data/pricing-bandit.json',
               'data/bounties.json', 'data/bounty-matching.json',
               'data/social-queue/',
               'data/trading-journal.json', 'data/edge-policy.json', 'data/trading-loop.json')

# 1. tar.gz in memory (Python tarfile only — Windows tar is broken)
print("Creating tar.gz...")
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode='w:gz') as tf:
    for name in ['server.js', 'index.js', 'package.json', 'package-lock.json',
                 'lib', 'data', 'public', 'config', 'scripts']:
        full = os.path.join(SRC, name)
        if os.path.exists(full):
            tf.add(full, arcname=name)
print(f"Created {buf.tell():,} bytes (in memory)")

tar_bytes = buf.getvalue()

# 2. Upload via SFTP (fresh BytesIO — original buf sits at EOF)
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
def _connect(client):
    last = None
    for attempt in range(4):
        try:
            client.connect('8.155.53.12', username='root', key_filename=KEY,
                           timeout=60, banner_timeout=60, auth_timeout=60)
            return
        except Exception as e:
            last = e
            print(f"SSH attempt {attempt+1} failed: {type(e).__name__}: {str(e)[:80]}; retrying in 20s...")
            time.sleep(20)
    raise last
_connect(c)

def run(cmd, timeout=120, tail=600):
    ch = c.get_transport().open_session()
    ch.exec_command(cmd)
    t0 = time.time()
    while not ch.exit_status_ready() and time.time() - t0 < timeout:
        time.sleep(0.4)
    out = ch.recv(tail).decode(errors='replace')
    return out.strip(), (ch.recv_exit_status() if ch.exit_status_ready() else '?')

# 2b. PREFLIGHT (2026-11-15 outage lesson: "TCP accepts, no app data" is what a
#     full disk / frozen snapshot looks like from outside. Diagnose BEFORE adding
#     a 10MB upload + npm ci on top of an unhealthy box, and free safe space).
out, ec = run('echo "== disk =="; df -hP / /www 2>/dev/null; echo "== load =="; uptime; '
              'echo "== mem =="; free -m | head -2; echo "== big dirs =="; '
              'du -sh /www/autotasker/data /www/autotasker/backups /www/autotasker/app 2>/dev/null; '
              'echo "== log sizes =="; ls -lhS /www/autotasker/data/*.log 2>/dev/null | head -5',
              timeout=60, tail=1600)
print('PREFLIGHT:\n' + out, f'EXIT={ec}')

out, ec = run(r'''
# safe, idempotent cleanups - never touches ledger/state files
rm -rf /tmp/atx /tmp/atx.* 2>/dev/null
find /www/autotasker/backups -type f -name 'appdata-*.tar.gz' | sort | head -n -14 | xargs -r rm -f
find /root -maxdepth 1 -name 'autotasker-src*.tar.gz' -mtime +1 -delete 2>/dev/null
for f in /www/autotasker/data/*.log; do
  [ -f "$f" ] || continue
  sz=$(stat -c%s "$f" 2>/dev/null || echo 0)
  if [ "$sz" -gt 50000000 ]; then
    tail -c 3000000 "$f" > "$f.tmp" && mv "$f.tmp" "$f" && echo "trimmed $(basename $f) from $sz"
  fi
done
journalctl --vacuum-size=200M >/dev/null 2>&1 || true
apt-get clean >/dev/null 2>&1 || true
df -P / | awk 'NR==2 {print "FREE_MB=" int($4/1024) "  USE=" $5}'
''', timeout=180, tail=600)
print('PREFLIGHT-CLEAN:\n' + out, f'EXIT={ec}')
free_mb = 0
for line in out.splitlines():
    if line.startswith('FREE_MB='):
        free_mb = int(line.split('FREE_MB=')[1].split()[0])
if free_mb and free_mb < 300:
    print(f'[ABORT] only {free_mb}MB free after cleanup - fix disk before deploying '
          f'(candidates: /www/autotasker/data, /var/log). Nothing was uploaded.')
    sys.exit(2)

sftp = c.open_sftp()
sftp.putfo(io.BytesIO(tar_bytes), REMOTE_TAR)
remote_size = sftp.stat(REMOTE_TAR).st_size
print(f"Uploaded: {remote_size:,} bytes")
assert remote_size == len(tar_bytes), 'upload size mismatch!'
sftp.close()

# 3. Extract — replace app code; keep remote-only data intact.
# The operative protection is the grep -v ERE below — DERIVE it from REMOTE_ONLY
# so the two can never drift again (previous bug: 6 entries existed only in the
# python list, so a deploy would have clobbered the server's accumulating
# bounties/bounty-matching/social-queue/trading-journal/edge-policy/trading-loop).
import re
ERE = '|'.join(re.escape(p.replace('data/', '', 1)) for p in REMOTE_ONLY)
out, ec = run(f'''
rm -rf /tmp/atx && mkdir /tmp/atx && cd /tmp/atx && tar xzf {REMOTE_TAR} 2>/dev/null || true
for d in $(ls /tmp/atx); do
  if [ "$d" = "data" ]; then
    cd /tmp/atx/data
    find . -type f | grep -v -E "({ERE})" | while read f; do
      mkdir -p "{REMOTE_APP}/data/$(dirname "$f" | sed s/^\\.\\///)"
      cp -r "$f" "{REMOTE_APP}/data/$(dirname "$f" | sed s/^\\.\\///)/" 2>/dev/null || true
    done
    cd /tmp/atx
  else
    rm -rf "{REMOTE_APP}/$d"
    cp -r "/tmp/atx/$d" "{REMOTE_APP}/"
  fi
done
echo FILES:$(ls {REMOTE_APP} | tr '\\n' ' ')
''')
print(out, f'EXIT={ec}')

# 4. npm ci (only if package.json changed it)
out, ec = run(f'cd {REMOTE_APP} && npm ci --omit=dev --registry=https://registry.npmmirror.com --no-audit --no-fund 2>&1 | tail -2; echo NPM_DONE', timeout=180, tail=300)
print(out, f'EXIT={ec}')

# 4b. Log rotation + boot enable. Cron jobs append to data/*.log forever; a
#     disk that fills up wedges the box in the exact way we saw on 2026-11-15.
#     logrotate (daily timer) is the primary defence, diskguard is the backup.
out, ec = run(r'''
if [ ! -f /etc/logrotate.d/autotasker ]; then
cat > /etc/logrotate.d/autotasker <<'EOF'
/www/autotasker/data/*.log /www/autotasker/data/*/*.log {
    size 50M
    rotate 5
    compress
    missingok
    notifempty
    copytruncate
}
EOF
echo LOGROTATE_INSTALLED
else
echo LOGROTATE_PRESENT
fi
if systemctl is-enabled autotasker >/dev/null 2>&1; then echo SERVICE_ENABLED; else systemctl enable autotasker >/dev/null 2>&1 && echo SERVICE_NOW_ENABLED; fi
df -P / | awk 'NR==2 {print "FREE_MB=" int($4/1024) " USE=" $5}'
''', timeout=60, tail=400)
print('post-install:', out, f'EXIT={ec}')

# 5. Restart
out, ec = run('systemctl restart autotasker && sleep 3 && systemctl is-active autotasker', timeout=30, tail=100)
print('restart:', out, f'EXIT={ec}')

# 6. Verify old + new surfaces
for probe in [
    'curl -s http://127.0.0.1:8795/api/status | head -c 200',
    'curl -s http://127.0.0.1:8795/api/ref/health',
    'curl -s -o /dev/null -w "trending=%{http_code}" http://127.0.0.1:8795/trending',
    'curl -s -o /dev/null -w "feed=%{http_code}" http://127.0.0.1:8795/feed.xml',
    'curl -s -o /dev/null -w "offer=%{http_code}" http://127.0.0.1:8795/offer.html',
    'curl -s -o /dev/null -w "robots=%{http_code}" http://127.0.0.1:8795/robots.txt',
    'curl -s -X POST http://127.0.0.1:8795/api/support/ticket -H "content-type: application/json" -d \'{"message":"probe 部署验收 ping"}\' | head -c 120',
]:
    out, ec = run(probe, timeout=15, tail=300)
    print('>', out, f'EXIT={ec}')

err_tail, _ = run('tail -5 /www/autotasker/data/service.err.log 2>/dev/null || echo "(clean)"')
print('err log tail:', err_tail)
print('DEPLOY DONE')
