"""debug-lang4.py — 检查具体的i18n中间件代码"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'sed -n "910,930p" /www/autotasker/app/lib/x402-v4.js',
    'echo "=== test direct ==="',
    'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8795/offer.html',
    'echo ""',
    'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8795//offer.html',
    'echo ""',
    'curl -s http://127.0.0.1:8795/en/index.html | head -c 80',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=10)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(out[:400])
    print('---')
c.close()
