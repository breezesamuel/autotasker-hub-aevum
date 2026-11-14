"""debug-url.py — 检查URL处理和中间件执行"""
import os, sys, paramiko
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
KEY = os.path.join(os.environ.get('USERPROFILE',''),'.ssh','id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=20)
cmds = [
    'node -e "const fs=require(\\\"fs\\\");let c=fs.readFileSync(\\\"lib/x402-v4.js\\\",\\\"utf8\\\");let i=c.indexOf(\\\"LANG_PREFIXES\\\");console.log(c.slice(i,i+400))"',
    'echo "---"',
    'curl -s http://127.0.0.1:8795/kr/faq; echo ""; curl -s http://127.0.0.1:8795/kr/trust | head -c 50',
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=15)
    out = o.read().decode(errors='replace') + e.read().decode(errors='replace')
    print(out[:600])
c.close()
