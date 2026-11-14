"""deploy-v6.py — deploy the growth-engine build to ECS.

Same proven pipeline as deploy-v5b.py (Python tarfile + paramiko SFTP + BytesIO),
with one safety change: data/payments/ and data/revenue-ledger.json are NOT
pushed from local — the remote copies are the accumulating source of truth and
must never be rolled back by a deploy.
"""
import paramiko, os, io, tarfile, time

SRC = r'F:\2026\第二次点子\repos\autotasker-hub-aevum'
REMOTE_TAR = '/root/autotasker-src.tar.gz'
REMOTE_APP = '/www/autotasker/app'
KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
REMOTE_ONLY = ('data/payments', 'data/revenue-ledger.json', 'data/referrals.json',
               'data/support-tickets.json', 'data/treasury-state.json')

# 1. tar.gz in memory (Python tarfile only — Windows tar is broken)
print("Creating tar.gz...")
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode='w:gz') as tf:
    for name in ['server.js', 'index.js', 'package.json', 'package-lock.json',
                 'lib', 'data', 'public', 'config']:
        full = os.path.join(SRC, name)
        if os.path.exists(full):
            tf.add(full, arcname=name)
print(f"Created {buf.tell():,} bytes (in memory)")

tar_bytes = buf.getvalue()

# 2. Upload via SFTP (fresh BytesIO — original buf sits at EOF)
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)
sftp = c.open_sftp()
sftp.putfo(io.BytesIO(tar_bytes), REMOTE_TAR)
remote_size = sftp.stat(REMOTE_TAR).st_size
print(f"Uploaded: {remote_size:,} bytes")
assert remote_size == len(tar_bytes), 'upload size mismatch!'
sftp.close()

def run(cmd, timeout=120, tail=600):
    ch = c.get_transport().open_session()
    ch.exec_command(cmd)
    t0 = time.time()
    while not ch.exit_status_ready() and time.time() - t0 < timeout:
        time.sleep(0.4)
    out = ch.recv(tail).decode(errors='replace')
    return out.strip(), (ch.recv_exit_status() if ch.exit_status_ready() else '?')

# 3. Extract — replace app code; keep remote-only data intact
out, ec = run(f'''
rm -rf /tmp/atx && mkdir /tmp/atx && cd /tmp/atx && tar xzf {REMOTE_TAR} 2>/dev/null || true
for d in $(ls /tmp/atx); do
  if [ "$d" = "data" ]; then
    cd /tmp/atx/data
    find . -type f | grep -v -E "(payments/|revenue-ledger|referrals.json|support-tickets.json|treasury-state.json)" | while read f; do
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
    print('>', out[:220], f'EXIT={ec}')

out, ec = run('tail -5 /www/autotasker/data/service.err.log 2>/dev/null || echo no-err-log', timeout=15, tail=400)
print('err log tail:', out[:400])
c.close()
print('DEPLOY DONE')
