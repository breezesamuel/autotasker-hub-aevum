import paramiko, os, io, tarfile, time

SRC = r'F:\2026\第二次点子\repos\autotasker-hub-aevum'
REMOTE_TAR = '/root/autotasker-src.tar.gz'
REMOTE_APP = '/www/autotasker/app'
KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')

# 1. Create tar.gz with Python (Windows tar produces trailing-garbage archives)
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
print(f"Created {len(tar_bytes):,} bytes")

# 2. Upload via SFTP (fresh BytesIO from getvalue — buf position is at EOF)
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

# 3. Extract (replace app code, keep data dir merged)
out, ec = run(f'''
rm -rf /tmp/atx && mkdir /tmp/atx && cd /tmp/atx && tar xzf {REMOTE_TAR} 2>/dev/null || true
for d in $(ls /tmp/atx); do
  if [ "$d" = "data" ]; then
    cp -r /tmp/atx/data/* {REMOTE_APP}/data/ 2>/dev/null || true
  else
    rm -rf "{REMOTE_APP}/$d"
    cp -r "/tmp/atx/$d" "{REMOTE_APP}/"
  fi
done
echo FILES:$(ls {REMOTE_APP} | tr '\n' ' ')
''')
print(out, f'EXIT={ec}')

# 4. npm ci (new dep @x402/mcp)
out, ec = run(f'cd {REMOTE_APP} && npm ci --omit=dev --registry=https://registry.npmmirror.com --no-audit --no-fund 2>&1 | tail -2; echo NPM_DONE', timeout=180, tail=300)
print(out, f'EXIT={ec}')

# 5. Restart service
out, ec = run('systemctl restart autotasker && sleep 3 && systemctl is-active autotasker', timeout=30, tail=100)
print('restart:', out, f'EXIT={ec}')

# 6. Verify
out, ec = run('curl -s http://127.0.0.1:8795/api/status | head -c 260', timeout=15, tail=300)
print('status:', out)
out, ec = run('tail -3 /www/autotasker/data/service.err.log 2>/dev/null | grep -c malformed || echo "malformed=0"', timeout=15, tail=100)
print('malformed check:', out)
c.close()
print('DEPLOY DONE')
