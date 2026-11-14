import paramiko, os, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

chan = c.get_transport().open_session()
chan.exec_command('''
echo "=== nginx config ===" && head -20 /www/server/panel/vhost/nginx/autotasker.highkingflower.com.conf
echo "=== nginx error ===" && tail -5 /www/wwwlogs/autotasker.highkingflower.com.error.log 2>/dev/null || echo none
echo "=== test local after nginx ===" && curl -sk https://autotasker.highkingflower.com/api/status
echo "=== reload nginx ===" && nginx -t 2>&1 | tail -2 && systemctl reload nginx && sleep 1 && curl -sk https://autotasker.highkingflower.com/api/status
''')
t0 = time.time()
while not chan.exit_status_ready() and time.time() - t0 < 15:
    time.sleep(0.3)
out = chan.recv(2000).decode(errors='replace')
print(out)
c.close()
