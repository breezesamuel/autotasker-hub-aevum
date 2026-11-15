"""diag-prod.py — check what code is actually running on ECS."""
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

# 1. Which commit SHA is deployed? Check git log on server
out, ec = run("cd /www/autotasker/app && git log --oneline -3 2>&1")
print('=== git log ===')
print(out, f'EXIT={ec}')

# 2. Does x402-v4.js contain /api/ref/new?
out, ec = run("grep -n \"api/ref\" /www/autotasker/app/lib/x402-v4.js | head -10")
print('\n=== ref routes in x402-v4.js ===')
print(out, f'EXIT={ec}')

# 3. Service uptime & restart time
out, ec = run("systemctl show autotasker --property=ActiveEnterTimestamp,MainPID")
print('\n=== service status ===')
print(out, f'EXIT={ec}')

# 4. Check if app crashed/restarted recently
out, ec = run("journalctl -u autotasker --since '1 hour ago' --no-pager -n 20 2>/dev/null || tail -20 /www/autotasker/data/service.err.log")
print('\n=== recent logs ===')
print(out[:600], f'EXIT={ec}')

# 5. curl test real endpoint with verbose headers
out, ec = run("curl -sv -X POST https://autotasker.highkingflower.com/api/ref/new -H 'content-type: application/json' -d '{}' 2>&1 | head -30")
print('\n=== curl POST /api/ref/new ===')
print(out[:600], f'EXIT={ec}')

c.close()
