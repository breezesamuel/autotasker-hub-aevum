"""fix-i18n.py — 修复 i18n 中间件以正确处理路由"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)

# Read current middleware code
_, o, e = c.exec_command('sed -n "907,925p" /www/autotasker/app/lib/x402-v4.js', timeout=10)
print("Current code:")
print(o.read().decode(errors='replace'))

# Test with explicit trailing slash handling
tests = [
    '/kr/faq',
    '/kr/trust', 
    '/en/offer.html',
    '/ja/trending',
]
print("\nTesting paths on port 8795:")
for p in tests:
    _, o, e = c.exec_command(f'curl -s -o /dev/null -w "%{{http_code}}" http://127.0.0.1:8795{p}', timeout=5)
    print(f"  {p}: {o.read().decode().strip()}")

c.close()
