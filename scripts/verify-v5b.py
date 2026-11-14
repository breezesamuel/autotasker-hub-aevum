import paramiko, os, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

def run(cmd, timeout=25, tail=500):
    ch = c.get_transport().open_session()
    ch.exec_command(cmd)
    t0 = time.time()
    while not ch.exit_status_ready() and time.time() - t0 < timeout:
        time.sleep(0.3)
    return ch.recv(tail).decode(errors='replace').strip(), (ch.recv_exit_status() if ch.exit_status_ready() else '?')

# When did the service restart?
out, _ = run('systemctl show autotasker -p ActiveEnterTimestamp')
print('service started:', out)

# Any malformed warnings AFTER restart? (err log is append; check post-restart tail)
out, _ = run('tail -5 /www/autotasker/data/service.err.log 2>/dev/null || echo no-err-log')
print('err tail:', out.replace('\n', ' | '))

# Public HTTPS tests
tests = [
    ('public status',   'curl -sk https://autotasker.highkingflower.com/api/status | head -c 200'),
    ('hotlist 402',     'curl -sk -o /dev/null -w "%{http_code}" "https://autotasker.highkingflower.com/api/x402/hotlist?board=weiboHot&limit=2"'),
    ('mcp no-header',   'curl -sk -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d \'{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_hotlist","arguments":{}}}\' https://autotasker.highkingflower.com/mcp'),
    ('mcp fake-header', 'curl -sk -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "payment-signature: ZmFrZQ==" -d \'{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_hotlist","arguments":{}}}\' https://autotasker.highkingflower.com/mcp'),
    ('mcp tools/list',  'curl -sk -X POST -H "Content-Type: application/json" -d \'{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\' https://autotasker.highkingflower.com/mcp | head -c 120'),
    ('well-known',      'curl -sk https://autotasker.highkingflower.com/.well-known/x402 | head -c 160'),
]
for label, cmd in tests:
    out, _ = run(cmd, timeout=20, tail=260)
    print(f'[{label:<15}] {out[:200]}')
c.close()
print('PUBLIC VERIFICATION COMPLETE')
