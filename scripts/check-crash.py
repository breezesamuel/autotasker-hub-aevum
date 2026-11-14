"""check-crash.py — 检查崩溃原因"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'systemctl is-active autotasker; echo "exit=$?"',
    'tail -5 /www/autotasker/data/service.err.log 2>/dev/null',
    'journalctl -u autotasker --no-pager -n 5 2>/dev/null | tail -5',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=10)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(f'--- {cmd[:40]} ---')
    print(out[:300])
c.close()
