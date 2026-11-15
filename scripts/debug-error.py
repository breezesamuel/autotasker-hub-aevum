"""debug-error.py — 诊断启动错误"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'journalctl -u autotasker --no-pager -n 20 2>/dev/null',
    'echo "---ERR---"',
    'tail -30 /www/autotasker/data/service.err.log 2>/dev/null',
    'echo "---MOD CHECK---"',
    'cd /www/autotasker/app && node -e "require(\'./lib/smart-pricing\');console.log(\'smart OK\')" 2>&1',
    'node -e "require(\'./lib/customer-health\');console.log(\'health OK\')" 2>&1',
    'node -e "require(\'./lib/payment-ux\');console.log(\'payment UX OK\')" 2>&1',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=15)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(f'--- {cmd[:40]} ---')
    print(out[:500])
c.close()
