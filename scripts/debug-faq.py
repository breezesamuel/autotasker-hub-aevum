"""debug-faq.py — 检查 FAQ 路由是否注册"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'grep -n "app.get.*faq" /www/autotasker/app/lib/x402-v4.js',
    'echo "---"',
    'curl -s http://127.0.0.1:8795/faq | head -c 100',
    'echo "---"',
    'curl -s http://127.0.0.1:8795//faq | head -c 100',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=10)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(out[:400])
c.close()
