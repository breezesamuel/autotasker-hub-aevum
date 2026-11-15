"""fix-npm.py — 修复服务器 node_modules"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'cd /www/autotasker/app && npm ls zod 2>&1 | head -3',
    'echo "---REINSTALL---"',
    'cd /www/autotasker/app && npm install --no-audit --no-fund 2>&1 | tail -5',
    'echo "---VERIFY---"',
    'node -e "require(\'/www/autotasker/app/node_modules/zod\'); console.log(\'zod OK\')" 2>&1',
    'systemctl restart autotasker && sleep 4 && systemctl is-active autotasker',
    'curl -s http://127.0.0.1:8795/api/status | python -c "import sys;print(sys.stdin.read()[:200])" 2>/dev/null || echo NO_RESPONSE',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=120)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(out[:300])
c.close()
