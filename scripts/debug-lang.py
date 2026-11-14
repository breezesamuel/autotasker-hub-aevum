"""debug-lang.py — 诊断语言路由问题"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8795/en/offer.html',
    'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8795/ja/trending',
    'curl -sv http://127.0.0.1:8795/en/offer.html 2>&1 | head -20',
    'grep -n "LANG_PREFIXES\\|lang.*prefix\\|req.lang" /www/autotasker/app/lib/x402-v4.js | head -10',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=15)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(f'--- {cmd[:60]} ---')
    print(out[:400])
    print()
c.close()
