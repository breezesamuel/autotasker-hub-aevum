import paramiko, os, io, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
SRC = r'F:\2026\第二次点子\repos\autotasker-hub-aevum'
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

# Upload only the changed file via SFTP
with open(os.path.join(SRC, 'lib', 'x402-v4.js'), 'rb') as f:
    sftp = c.open_sftp()
    sftp.putfo(f, '/www/autotasker/app/lib/x402-v4.js')
    sftp.close()
    print("Uploaded x402-v4.js")

# Restart
chan = c.get_transport().open_session()
chan.exec_command('''
systemctl restart autotasker && sleep 3
echo "=== status ==="; systemctl is-active autotasker
echo "=== local ==="; curl -s http://127.0.0.1:8795/api/status
echo "=== err tail ==="; tail -5 /www/autotasker/data/service.err.log 2>/dev/null || echo no-err
''')
t0 = time.time()
while not chan.exit_status_ready() and time.time() - t0 < 15:
    time.sleep(0.3)
out = chan.recv(1000).decode(errors='replace')
print(out)
c.close()
