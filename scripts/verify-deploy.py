import paramiko, os, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

tests = [
    ('service active',          'systemctl is-active autotasker'),
    ('local /api/status',       'curl -s http://127.0.0.1:8795/api/status'),
    ('public /api/status',      'curl -sk https://autotasker.highkingflower.com/api/status'),
    ('well-known/x402',         'curl -sk https://autotasker.highkingflower.com/.well-known/x402 | python -c "import sys,json; d=json.load(sys.stdin); print(d.get(\"service\",\"?\"),d.get(\"payTo\",\"?\"))" 2>/dev/null || echo parse-failed'),
    ('x402/hotlist 402',        'curl -sk -o /dev/null -w "hotlist=%{http_code}\\n" https://autotasker.highkingflower.com/api/x402/hotlist?board=weiboHot&limit=3'),
    ('mcp initialize',          'echo \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\' | curl -sk -X POST -H "Content-Type: application/json" -d @- https://autotasker.highkingflower.com/mcp | head -c 200'),
    ('err count today',         'grep -c "malformed" /www/autotasker/data/service.err.log 2>/dev/null || echo 0'),
]

for label, cmd in tests:
    chan = c.get_transport().open_session()
    chan.exec_command(cmd)
    t0 = time.time()
    while not chan.exit_status_ready() and time.time() - t0 < 10:
        time.sleep(0.3)
    out = chan.recv(400).decode(errors='replace').strip()
    print(f'[{label}] {out[:100]}')
c.close()
