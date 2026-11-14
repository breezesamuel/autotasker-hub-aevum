import paramiko, os, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

chan = c.get_transport().open_session()
cmd = (
    'cd /tmp && rm -rf atst-test && mkdir atst-test && cd atst-test '
    '&& tar xzf /root/autotasker-src.tar.gz 2>/tmp/tar.err; '
    'echo EXIT:$?; ls; echo --- ERRORS ---; cat /tmp/tar.err'
)
chan.exec_command(cmd)

t0 = time.time()
while not chan.exit_status_ready() and time.time() - t0 < 25:
    time.sleep(0.5)

out = chan.recv(4096).decode(errors='replace') if chan.recv_ready() else ''
err = chan.recv_stderr(4096).decode(errors='replace') if chan.recv_stderr_ready() else ''
ec = chan.recv_exit_status() if chan.exit_status_ready() else '?'
print(f'EXIT={ec}')
print(out[:1500])
if err.strip():
    print(f'STDERR:\n{err[:500]}')
c.close()
