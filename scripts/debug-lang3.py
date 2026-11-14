"""debug-lang3.py"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'sed -n "908,925p" /www/autotasker/app/lib/x402-v4.js',
    'echo "---"; curl -s http://127.0.0.1:8795/en/offer.html | head -c 50',
    'echo "---"; curl -s http://127.0.0.1:8795/ja/trending | head -c 50',
    'echo "---"; systemctl is-restart-count autotasker 2>/dev/null || echo "no restart count"',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=10)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(f'--- {cmd[:50]} ---')
    print(out[:400])
c.close()
