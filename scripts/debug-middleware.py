"""debug-middleware.py — 检查中间件顺序和实际行为"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'sed -n "900,930p" /www/autotasker/app/lib/x402-v4.js',
    'echo "=== TEST ==="',
    'curl -s http://127.0.0.1:8795/kr/faq 2>&1 | head -5',
    'echo "---"',
    'curl -s http://127.0.0.1:8795/en/offer.html 2>&1 | head -3',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=10)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(f'--- {cmd[:50]} ---')
    print(out[:400])
c.close()
