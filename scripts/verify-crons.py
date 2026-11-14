"""verify-crons.py — 验证生产服务器 cron 已就位（只读）"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
_, o, e = c.exec_command('crontab -l', timeout=30)
out = o.read().decode(errors='replace')
our = [l.strip() for l in out.splitlines() if 'autotasker-hub' in l]
other = [l.strip() for l in out.splitlines() if l.strip() and 'autotasker-hub' not in l]
print(f'autotasker tasks: {len(our)}')
for ln in our: print('  ' + ln)
print(f'\nother projects preserved: {len(other)} tasks')
for ln in other: print('  ' + ln)
print('\n[OK]' if len(our) == 6 else f'[WARN] expected 6 got {len(our)}')
c.close()
