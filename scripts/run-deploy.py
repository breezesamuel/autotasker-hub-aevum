import paramiko, os, select, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=15)

chan = c.invoke_shell(width=160, height=40)
# Send commands via stdin-like mechanism through invoke_shell
chan.send("sed -i 's/\\r$//' /root/deploy-ecs-autotasker.sh && bash /root/deploy-ecs-autotasker.sh\n")

out_buf = b''
deadline = time.time() + 240

while time.time() < deadline:
    if chan.recv_ready():
        d = chan.recv(4096)
        out_buf += d
        print(d.decode('utf-8', errors='replace'), end='', flush=True)
    if chan.exit_status_ready():
        break
    time.sleep(0.3)

if not chan.exit_status_ready():
    # Try exec_command as fallback (more reliable for one-shot scripts)
    pass

print(f'\n--- END OUTPUT ---')
print(out_buf.decode('utf-8', errors='replace'))
c.close()
