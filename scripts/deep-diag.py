"""deep-diag.py — 诊断为什么POST返回404"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'curl -sv http://127.0.0.1:8795/api/content/stats 2>&1 | grep -E "< HTTP|{"',
    'echo "---"',
    'curl -sv -X POST http://127.0.0.1:8795/api/content/generate -H "content-type: application/json" -d "{\"topic\":{\"title\":\"t\"},\"board\":\"weiboHot\",\"lang\":\"zh\"}" 2>&1 | grep -E "< HTTP|{"',
    'echo "---"',
    'grep -n "content-generate\\|content-stats\\|growth-share\\|payment-estimate" /www/autotasker/app/lib/x402-v4.js | head -10',
    'echo "---"',
    'systemctl status autotasker --no-pager 2>&1 | head -8',
    'echo "---ERR---"',
    'tail -20 /www/autotasker/data/service.err.log 2>/dev/null',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=10)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(out[:500])
c.close()
