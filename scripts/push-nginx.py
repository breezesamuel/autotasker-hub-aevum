import paramiko, os

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

sftp = c.open_sftp()
# Upload nginx conf
conf_content = open(r'F:\2026\第二次点子\repos\autotasker-hub-aevum\deploy\nginx-autotasker.conf', 'rb').read()
sftp.putfo(__import__('io').BytesIO(conf_content), '/www/server/panel/vhost/nginx/autotasker.highkingflower.com.conf')
print(f"Uploaded nginx conf ({len(conf_content)} bytes)")
sftp.close()

# Test + reload nginx
chan = c.get_transport().open_session()
chan.exec_command('nginx -t 2>&1 && systemctl reload nginx && sleep 1 && echo NGINX_OK')
out = chan.recv(500).decode(errors='replace')
print(out)

# Verify auto-vhost is now serving
chan2 = c.get_transport().open_session()
chan2.exec_command('curl -sk https://autotasker.highkingflower.com/api/status')
out2 = chan2.recv(500).decode(errors='replace')
print('Public /api/status:', out2[:300])
c.close()
print("DONE")
