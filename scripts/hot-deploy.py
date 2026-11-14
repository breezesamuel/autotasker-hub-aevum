import paramiko, os, io, tarfile, sys

SRC = r'F:\2026\第二次点子\repos\autotasker-hub-aevum'
REMOTE_TAR = '/root/autotasker-src.tar.gz'
REMOTE_APP = '/www/autotasker/app'
KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')

# Create proper tar.gz with Python
print("Creating tar.gz...")
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode='w:gz') as tf:
    for name in ['server.js', 'index.js', 'package.json', 'package-lock.json',
                  'lib', 'data', 'public', 'config']:
        full = os.path.join(SRC, name)
        if os.path.exists(full):
            tf.add(full, arcname=name)
            print(f"  + {name}")
        else:
            print(f"  ! MISSING: {full}")

tar_bytes = buf.getvalue()
print(f"Created {len(tar_bytes):,} bytes")

# Upload via SFTP
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)
sftp = c.open_sftp()
sftp.putfo(io.BytesIO(tar_bytes), REMOTE_TAR)
stat = sftp.stat(REMOTE_TAR)
print(f"Uploaded: {stat.st_size:,} bytes")

# Verify extract
chan = c.get_transport().open_session()
chan.exec_command(f'tar tzf {REMOTE_TAR} | head -10 && echo MEMBER_COUNT:$(tar tzf {REMOTE_TAR} | wc -l)')
out = chan.recv(500).decode(errors='replace')
print(out.strip())

# Deploy
print("\n=== Extracting ===")
chan2 = c.get_transport().open_session()
chan2.exec_command(f'''
rm -rf {REMOTE_APP}/* {REMOTE_APP}/.[!.]* 2>/dev/null
mkdir -p {REMOTE_APP}
cd /tmp && rm -rf atst3 && mkdir atst3 && cd atst3
tar xzf {REMOTE_TAR}
cp -r * {REMOTE_APP}/
echo FILES:$(ls {REMOTE_APP})
''')
t0 = __import__('time').time()
while not chan2.exit_status_ready() and __import__('time').time() - t0 < 15:
    __import__('time').sleep(0.3)
print(chan2.recv(1000).decode(errors='replace'))
print(f"EXIT={chan2.recv_exit_status()}")

print("\n=== npm install ===")
chan3 = c.get_transport().open_session()
chan3.exec_command(f'cd {REMOTE_APP} && npm ci --omit=dev --registry=https://registry.npmmirror.com --no-audit --no-fund 2>&1 | tail -3; echo NPM_EXIT:$?')
t0 = __import__('time').time()
while not chan3.exit_status_ready() and __import__('time').time() - t0 < 90:
    __import__('time').sleep(0.5)
print(chan3.recv(500).decode(errors='replace'))
print(f"NPM_EXIT={chan3.recv_exit_status()}")

print("\n=== Restart ===")
chan4 = c.get_transport().open_session()
chan4.exec_command('systemctl restart autotasker && sleep 2 && systemctl is-active autotasker && curl -s http://127.0.0.1:8795/api/status')
t0 = __import__('time').time()
while not chan4.exit_status_ready() and __import__('time').time() - t0 < 15:
    __import__('time').sleep(0.3)
print(chan4.recv(500).decode(errors='replace'))
ec = chan4.recv_exit_status() if chan4.exit_status_ready() else '?'
print(f"EXIT={ec}")
c.close()
print('\nDEPLOY DONE')
