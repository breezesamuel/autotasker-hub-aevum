"""debug-debug.py — 添加临时调试路由"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
# Add a debug route and test
cmds = [
    'echo "Adding debug route..."',
    'cd /www/autotasker/app && node -e "'
    'const m=require(\'./lib/x402-v4\');'
    'console.log(\"module loaded\")'
    '" 2>&1 | head -3',
    'echo "--- Testing various paths ---"',
    'curl -s http://127.0.0.1:8795/kr/trust | head -c 50',
    'echo ""',
    'curl -s http://127.0.0.1:8795/kr/offer.html | head -c 50',
    'echo ""',
    'curl -s http://127.0.0.1:8795/en/faq | head -c 50',
    'echo ""',
    'curl -s http://127.0.0.1:8795/kr/api/status | head -c 50',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=15)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(out[:300])
c.close()
