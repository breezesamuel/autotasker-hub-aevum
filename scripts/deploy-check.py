"""deploy-check.py — 验证部署状态和新端点"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
endpoints = [
    '/api/pricing/current',
    '/api/pricing/bundles',
    '/api/health/dashboard',
    '/api/payment/demo',
    '/api/payment/guide/hotlist',
    '/api/funnel/stats',
    '/api/status',
]
print('=== Service Status ===')
_, o, e = c.exec_command('systemctl is-active autotasker; echo rc=$?', timeout=5)
print(o.read().decode().strip())
print('\n=== Endpoint Checks (port 8795) ===')
for ep in endpoints:
    _, o, e = c.exec_command(f'curl -s -o /dev/null -w "%{{http_code}}" http://127.0.0.1:8795{ep}', timeout=5)
    code = o.read().decode().strip()
    print(f'  {ep}: {code}')
print('\n=== Error Log Tail ===')
_, o, e = c.exec_command('tail -3 /www/autotasker/data/service.err.log 2>/dev/null || echo "(no errors)"', timeout=5)
print(o.read().decode().strip() or e.read().decode().strip())
c.close()
