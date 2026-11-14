"""diag-prod3.py — server-side: logging visibility, nginx XFF, data files, cert."""
import paramiko, os, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

def run(cmd, timeout=30, tail=1500):
    ch = c.get_transport().open_session()
    ch.exec_command(cmd)
    t0 = time.time()
    out = b''
    while time.time() - t0 < timeout:
        if ch.recv_ready():
            out += ch.recv(4096)
        if ch.exit_status_ready():
            break
        time.sleep(0.1)
    try:
        while ch.recv_ready(): out += ch.recv(4096)
    except Exception: pass
    return out.decode(errors='replace').strip(), ch.recv_exit_status()

print('=== 1. systemd unit (logging + restart policy) ===')
out, _ = run('cat /etc/systemd/system/autotasker.service 2>/dev/null || systemctl cat autotasker 2>/dev/null')
print(out[:900])

print('\n=== 2. nginx proxy headers for the app ===')
out, _ = run("grep -rn 'proxy_set_header' /etc/nginx/ 2>/dev/null | head -12")
print(out)

print('\n=== 3. data files on server ===')
out, _ = run('ls -la /www/autotasker/app/data/ 2>/dev/null; ls -la /www/autotasker/app/data/payments/ 2>/dev/null')
print(out[:1200])

print('\n=== 4. referrals.json / support-tickets.json health ===')
out, _ = run("cd /www/autotasker/app && node -e \"const r=require('./data/referrals.json');console.log('referrals keys:',Object.keys(r).join(','),'codes:',(r.codes||[]).length,'clicks:',(r.clicks||[]).length,'claims:',(r.claims||[]).length)\" 2>&1; node -e \"const t=require('./data/support-tickets.json');console.log('tickets:',(t.tickets||[]).length)\" 2>&1")
print(out[:600])

print('\n=== 5. TLS cert expiry ===')
out, _ = run("echo | openssl s_client -servername autotasker.highkingflower.com -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null; systemctl list-timers --no-pager 2>/dev/null | grep -i -E 'certbot|acme' | head -3")
print(out[:400])

print('\n=== 6. crontab (existing automation) ===')
out, _ = run('crontab -l 2>/dev/null | head -10')
print(out if out else '(empty)')

print('\n=== 7. disk + mem headroom ===')
out, _ = run('df -h / | tail -1; free -m | head -2')
print(out)

c.close()
