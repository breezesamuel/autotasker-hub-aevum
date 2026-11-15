"""check-service.py — 快速检查服务状态"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'systemctl is-active autotasker',
    'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8795/api/status',
    'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8795/en/offer.html',
    'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8795/ja/trending',
    'tail -3 /www/autotasker/data/service.err.log 2>/dev/null',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=10)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(f'{cmd[:40]}: {out.strip()[:120]}')
c.close()
