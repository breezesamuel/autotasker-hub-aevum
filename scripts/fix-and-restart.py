import paramiko, os, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

sftp = c.open_sftp()
# Write .env.production
env_content = b"NODE_ENV=production\nPORT=8795\nHOST=127.0.0.1\nPAY_TO=0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C\nX402_NETWORK=eip155:8453\nPUBLIC_URL=https://autotasker.highkingflower.com\nBASE_RPC_URL=https://base.drpc.org\nFACILITATOR_URL=https://facilitator.payai.network\n"
sftp.putfo(__import__('io').BytesIO(env_content), '/www/autotasker/app/.env.production')
sftp.chmod('/www/autotasker/app/.env.production', 0o600)
print("Wrote .env.production")
sftp.close()

# Restart
chan = c.get_transport().open_session()
chan.exec_command('''
systemctl restart autotasker
sleep 3
echo "=== status ==="; systemctl is-active autotasker
echo "=== local ==="; curl -s http://127.0.0.1:8795/api/status
echo "=== logs ==="; journalctl -u autotasker --no-pager -n 10
''')
t0 = time.time()
while not chan.exit_status_ready() and time.time() - t0 < 15:
    time.sleep(0.3)
out = chan.recv(2000).decode(errors='replace')
print(out)
c.close()
print('DONE')
