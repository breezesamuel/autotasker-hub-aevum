"""check-deploy.py — 检查部署是否包含新模块"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'ls /www/autotasker/app/lib/smart-pricing.js /www/autotasker/app/lib/customer-health.js /www/autotasker/app/lib/payment-ux.js 2>&1',
    'echo "---"',
    'grep -c "smart-pricing\\|customer-health\\|payment-ux" /www/autotasker/app/lib/x402-v4.js',
    'echo "---"',
    'systemctl restart autotasker && sleep 3 && systemctl is-active autotasker',
    'echo "---"',
    'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8795/api/pricing/current',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=15)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(out[:300])
c.close()
