"""debug-guide.py"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'journalctl -u autotasker --no-pager -n 10 2>/dev/null | grep -i error',
    'echo "---"',
    'curl -sv http://127.0.0.1:8795/api/payment/guide/hotlist 2>&1 | grep -E "< HTTP|< server|Cannot|Error"',
    'echo "---"',
    'cd /www/autotasker/app && node -e "var m=require(\'./lib/payment-ux\'); console.log(m.getPaymentGuide(\'hotlist\').title)" 2>&1',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=10)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(out[:400])
c.close()
