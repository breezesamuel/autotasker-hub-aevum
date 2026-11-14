import paramiko, os, sys

SRC = r'F:\2026\第二次点子\repos\autotasker-hub-aevum\autotasker-src.tar.gz'
REMOTE_PATH = '/root/autotasker-src.tar.gz'
SH_SRC = r'F:\2026\第二次点子\repos\autotasker-hub-aevum\scripts\deploy-ecs-autotasker.sh'
SH_REMOTE = '/root/deploy-ecs-autotasker.sh'
KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')

def connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect('8.155.53.12', username='root', key_filename=KEY, timeout=15)
    return c

print(f"Local tar size: {os.path.getsize(SRC):,} bytes")

# Upload tar
print("Uploading archive...")
c = connect()
sftp = c.open_sftp()
with open(SRC, 'rb') as f:
    sftp.putfo(f, REMOTE_PATH)
stat = sftp.stat(REMOTE_PATH)
local_md5 = __import__('hashlib').md5(open(SRC,'rb').read()).hexdigest()
remote_md5_ch = c.get_transport().open_session()
remote_md5_ch.exec_command(f'md5sum {REMOTE_PATH}')
print(remote_md5_ch.recv(200).decode(), end='')
if stat.st_size == os.path.getsize(SRC):
    print("Size OK")
else:
    print(f"SIZE MISMATCH local={os.path.getsize(SRC)} remote={stat.st_size}")
sftp.close()
c.close()

# Upload deploy script
print("\nUploading deploy script...")
c = connect()
sftp = c.open_sftp()
with open(SH_SRC, 'rb') as f:
    sftp.putfo(f, SH_REMOTE)
sftp.close()
c.close()

print("\nVerifying extract on remote...")
c = connect()
chan = c.get_transport().open_session()
chan.exec_command(f'''cd /tmp && rm -rf atst-test && mkdir atst-test && cd atst-test && tar -xzf {REMOTE_PATH} 2>&1 && echo "EXTRACT OK" && ls | head -20''')
out = chan.recv(1000).decode(errors='replace')
print(out[:800])
exit_code = chan.recv_exit_status()
print(f"Exit code: {exit_code}")
c.close()
