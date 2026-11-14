"""verify-boot-log.py — confirm the after-settle hook armed on the running prod process."""
import paramiko, os

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)
i, o, e = c.exec_command("grep -E 'after-settle|listening|payTo' /www/autotasker/data/service.log | tail -6")
print(o.read().decode(errors='replace'))
c.close()
