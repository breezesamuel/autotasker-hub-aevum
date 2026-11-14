"""diag-prod4.py — find the real vhost config and XFF handling; log sizes."""
import paramiko, os, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

def run(cmd, timeout=30):
    ch = c.get_transport().open_session()
    ch.exec_command(cmd)
    t0 = time.time()
    out = b''
    while time.time() - t0 < timeout:
        if ch.recv_ready(): out += ch.recv(4096)
        if ch.exit_status_ready(): break
        time.sleep(0.1)
    try:
        while ch.recv_ready(): out += ch.recv(4096)
    except Exception: pass
    return out.decode(errors='replace').strip()

print('=== 1. where is 8795 proxied from? ===')
print(run("grep -rln '8795' /etc/nginx /www/server/panel/vhost/nginx /usr/local/nginx/conf 2>/dev/null | head -5"))

print('\n=== 2. the vhost block ===')
print(run("f=$(grep -rln '8795' /etc/nginx /www/server/panel/vhost/nginx /usr/local/nginx/conf 2>/dev/null | head -1); echo \"FILE=$f\"; grep -n -E 'location|proxy_pass|proxy_set_header|real_ip' \"$f\" 2>/dev/null | head -30"))

print('\n=== 3. nginx real-ip modules in main conf ===')
print(run("grep -n -E 'set_real_ip_from|real_ip_header' /etc/nginx/nginx.conf /usr/local/nginx/conf/nginx.conf 2>/dev/null | head -10"))

print('\n=== 4. is XFF actually arriving at the app? (probe via access from outside earlier) ===')
print(run("tail -5 /www/autotasker/data/service.log 2>/dev/null | cut -c1-160"))

print('\n=== 5. log sizes + rotation ===')
print(run("ls -la /www/autotasker/data/service*.log 2>/dev/null; ls /etc/logrotate.d/ 2>/dev/null | head -20"))

c.close()
