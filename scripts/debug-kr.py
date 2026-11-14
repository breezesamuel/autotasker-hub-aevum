"""debug-kr.py"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
# Test directly on port 8795 (bypass nginx)
cmds = [
    'curl -sv http://127.0.0.1:8795/kr/faq 2>&1 | grep -E "< HTTP|< server|Cannot"',
    'echo "---"',
    'curl -s http://127.0.0.1:8795/faq | head -c 100',
    'echo "---"',
    'curl -s http://127.0.0.1:8795/en/offer.html | head -c 100',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=10)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(out[:300])
c.close()
