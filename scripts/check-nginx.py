"""check-nginx.py — 检查nginx配置和POST路由"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'grep -rn "proxy_pass.*8795\\|location /api" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -20',
    'echo "===TEST POST TO APP==="',
    'curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8795/api/fraud/block -H "content-type: application/json" -d "{\"wallet\":\"0xdead\",\"reason\":\"test\"}"',
    'echo',
    'echo "===TEST POST VIA NGINX==="',
    'curl -s -o /dev/null -w "%{http_code}" -X POST https://autotasker.highkingflower.com/api/fraud/block -H "content-type: application/json" -d "{\"wallet\":\"0xdead\",\"reason\":\"test\"}" --insecure',
    'echo',
    'echo "===POST via https direct==="',
    'curl -sv -X POST http://127.0.0.1:8795/api/content/stats 2>&1 | grep -E "< HTTP|{"',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=10)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(out[:400])
c.close()
