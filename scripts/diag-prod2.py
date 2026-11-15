"""diag-prod2.py — deeper diagnostics."""
import paramiko, os, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

def run(cmd, timeout=30, tail=600):
    ch = c.get_transport().open_session()
    ch.exec_command(cmd)
    t0 = time.time()
    while not ch.exit_status_ready() and time.time() - t0 < timeout:
        time.sleep(0.3)
    return ch.recv(tail).decode(errors='replace').strip(), ch.recv_exit_status()

# 1. What process is listening on 8795?
out, ec = run("ss -tlnp | grep 8795; echo '---'; ps aux | grep autotasker | grep -v grep")
print('=== port/process ===')
print(out, f'EXIT={ec}')

# 2. Check if referrals module loads without error on server
out, ec = run("""cd /www/autotasker/app && node -e "const r=require('./lib/referrals.js'); console.log(JSON.stringify({ok:true,codes:Object.keys(r.newCode('test').code),err:null}));" 2>&1""")
print('\n=== referrals import test ===')
print(out[:400], f'EXIT={ec}')

# 3. Direct curl to specific endpoint with full output
out, ec = run("""curl -s -w '\\nHTTP:%{http_code}\\nSIZE:%{size_download}' -X POST https://autotasker.highkingflower.com/api/ref/new -H 'content-type: application/json' -d '{}'""")
print('\n=== direct POST curl ===')
print(out[:600], f'EXIT={ec}')

# 4. Check what Nginx might be intercepting
out, ec = run("nginx -T 2>/dev/null | grep -A5 'location ~* /api/' | head -20 || echo 'no-named-rule'")
print('\n=== nginx rules for /api/ ===')
print(out[:600], f'EXIT={ec}')

# 5. Actually verify the running app serves /api/ref/new by checking stderr of service
out, ec = run("journalctl -u autotasker --since '5 min ago' --no-pager -n 30 2>/dev/null")
print('\n=== recent journal ===')
print(out[:400], f'EXIT={ec}')

c.close()
