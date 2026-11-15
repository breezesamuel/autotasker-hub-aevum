"""test-airdrop.py — direct server test of airdrop create"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)

cmd1 = "node -e \"var d=require('/www/autotasker/app/lib/airdrop-distributor'); console.log(JSON.stringify(d.createDrop('test-v12',{source:'all'},5),null,2))\" 2>&1"
_, o, e = c.exec_command(cmd1, timeout=15)
print('=== node require ===')
print(o.read().decode(errors='replace')[:600])
print(e.read().decode(errors='replace')[:300])

cmd2 = 'curl -s -w "\\nHTTP:%{http_code}" -X POST http://127.0.0.1:8795/api/airdrop/create -H "content-type: application/json" -d \'{"name":"test-v12","criteria":{"source":"all"},"budgetUsd":5}\' 2>&1'
_, o, e = c.exec_command(cmd2, timeout=10)
print('\n=== curl ===')
print(o.read().decode(errors='replace')[:400])
print(e.read().decode(errors='replace')[:200])

# Also check tail of err log
_, o, e = c.exec_command('tail -10 /www/autotasker/data/service.err.log 2>/dev/null || echo clean')
print('\n=== err tail ===')
print((o.read()+e.read()).decode(errors='replace')[:300])
c.close()
