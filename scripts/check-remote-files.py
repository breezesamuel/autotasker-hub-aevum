"""check-remote-files.py — 确认远程服务器上有哪些lib文件"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'ls -la /www/autotasker/app/lib/*.js | wc -l',
    'echo "---"',
    'ls /www/autotasker/app/lib/ | grep -E "smart|health|payment-ux|funnel|ab-test|referral-growth" || echo "NOT FOUND"',
    'echo "---"',
    'grep -c "smart-pricing\\|customer-health\\|payment-ux" /www/autotasker/app/lib/x402-v4.js',
    'echo "---"',
    'md5sum /www/autotasker/app/lib/smart-pricing.js 2>/dev/null || echo "smart-pricing.js MISSING"',
    'md5sum lib/smart-pricing.js 2>/dev/null || echo "local smart-pricing.js also missing"',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=10)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(f'{cmd[:50]}: {out.strip()[:200]}')
c.close()
