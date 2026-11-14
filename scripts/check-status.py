import paramiko, os, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

# Check current status and public endpoint
chan = c.get_transport().open_session()
chan.exec_command('''
echo "=== service ==="; systemctl is-active autotasker; systemctl status autotasker --no-pager 2>/dev/null | grep "Active:"
echo "=== local ==="; curl -s http://127.0.0.1:8795/api/status 2>&1 || echo FAIL
echo "=== public https ==="; curl -sk https://autotasker.highkingflower.com/api/status 2>&1 || echo FAIL
''')
t0 = time.time()
while not chan.exit_status_ready() and time.time() - t0 < 15:
    time.sleep(0.3)
out = chan.recv(1500).decode(errors='replace')
print(out)
c.close()
