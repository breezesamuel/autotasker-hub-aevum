"""wipe-smoke-data.py — remove smoke-test artifacts from prod ledgers (clean business start)."""
import paramiko, os, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

def run(cmd, timeout=60, tail=300):
    ch = c.get_transport().open_session()
    ch.exec_command(cmd)
    t0 = time.time()
    while not ch.exit_status_ready() and time.time() - t0 < timeout:
        time.sleep(0.3)
    return ch.recv(tail).decode(errors='replace').strip(), ch.recv_exit_status()

out, ec = run(
    'systemctl stop autotasker && '
    'rm -f /www/autotasker/app/data/referrals.json /www/autotasker/app/data/support-tickets.json && '
    'systemctl start autotasker && sleep 3 && systemctl is-active autotasker && '
    'curl -s http://127.0.0.1:8795/api/ref/health && echo && '
    'curl -s -o /dev/null -w "offer=%{http_code}" http://127.0.0.1:8795/offer.html'
)
print(out, 'EXIT=' + str(ec))
c.close()
