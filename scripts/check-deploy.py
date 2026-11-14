"""check-deploy.py — 验证部署状态"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
tests = ['/en/offer.html', '/ja/trending', '/kr/faq', '/partner', '/api/partner/info']
for p in tests:
    _, o, e = c.exec_command(f'curl -s -o /dev/null -w "%{{http_code}}" http://127.0.0.1:8795{p}', timeout=5)
    print(f'{p}: {o.read().decode().strip()}')
_, o, e = c.exec_command('systemctl is-active autotasker')
print(f'service: {o.read().decode().strip()}')
c.close()
