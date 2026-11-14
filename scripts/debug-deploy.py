"""debug-deploy.py — 诊断生产服务器上的模块加载问题"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'cd /www/autotasker/app && node -e "require(\'./lib/i18n\');console.log(\'i18n_ok\')" 2>&1',
    'cd /www/autotasker/app && node -e "require(\'./lib/partner-page\');console.log(\'partner_ok\')" 2>&1',
    'cd /www/autotasker/app && node lib/x402-v4.js 2>&1 | head -5',
    'systemctl status autotasker --no-pager 2>&1 | head -10',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=30)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(f'--- {cmd[:60]} ---')
    print(out[:500])
c.close()
