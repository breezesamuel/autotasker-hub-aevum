"""debug-lang2.py — 直接测试端口和nginx行为"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8795/en/offer.html',
    'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8795/offer.html',
    'curl -s -o /dev/null -w "%{http_code}" https://autotasker.highkingflower.com/en/offer.html',
    'curl -s -o /dev/null -w "%{http_code}" https://autotasker.highkingflower.com/offer.html',
    'curl -s http://127.0.0.1:8795/en/offer.html | head -c 100',
    'ls -la /www/autotasker/app/public/offer.html',
    'grep -n "en\\|lang" /www/server/panel/vhost/nginx/autotasker.highkingflower.com.conf | head -10',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=10)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(f'{cmd[:50]}: {out.strip()[:150]}')
c.close()
