"""Upload file(s) to ECS via SFTP and/or run remote commands via SSH.
Usage:
  python upload-ecs.py upload <local_file> <remote_path>
  python upload-ecs.py cmd "<bash command>"
  python upload-ecs.py deploy <local_tar> <local_sh>
"""
import sys, os, paramiko, time

SSH_HOST = '8.155.53.12'
SSH_KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
TIMEOUT = 30


def get_client():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(SSH_HOST, username='root', key_filename=SSH_KEY, timeout=TIMEOUT)
    return c


def upload_file(local_path, remote_path):
    size = os.path.getsize(local_path)
    print(f'Uploading {size:,} bytes -> root@{SSH_HOST}:{remote_path}')
    sftp = paramiko.SFTPClient.from_transport(get_client().get_transport())
    sftp.put(local_path, remote_path)
    sftp.close()
    # verify
    sftp2 = paramiko.SFTPClient.from_transport(get_client().get_transport())
    stat = sftp2.stat(remote_path)
    sftp2.close()
    print(f'Uploaded OK ({stat.st_size:,} bytes)')


def run_cmd(cmd, timeout=120):
    print(f'Running: {cmd[:80]}...')
    c = get_client()
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    exit_code = stdout.channel.recv_exit_status()
    c.close()
    if out:
        print(out.rstrip())
    if err:
        print(err.rstrip(), file=sys.stderr)
    if exit_code != 0:
        raise RuntimeError(f'Remote command failed (exit={exit_code})')
    return out


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(1)

    mode = args[0]

    if mode == 'upload' and len(args) >= 3:
        upload_file(args[1], args[2])

    elif mode == 'cmd' and len(args) >= 2:
        run_cmd(' '.join(args[1:]))

    elif mode == 'deploy':
        local_tar = args[1] if len(args) > 1 else 'autotasker-src.tar.gz'
        local_sh = args[2] if len(args) > 2 else 'scripts/deploy-ecs-autotasker.sh'
        # Resolve relative paths against this script's directory
        script_dir = os.path.dirname(os.path.abspath(__file__))
        tar_abs = os.path.abspath(os.path.join(script_dir, local_tar)) if not os.path.isabs(local_tar) else local_tar
        sh_abs = os.path.abspath(os.path.join(script_dir, local_sh)) if not os.path.isabs(local_sh) else local_sh

        print('=== Phase 1: Upload archive ===')
        upload_file(tar_abs, '/root/autotasker-src.tar.gz')

        print('\n=== Phase 2: Upload installer ===')
        upload_file(sh_abs, '/root/deploy-ecs-autotasker.sh')

        print('\n=== Phase 3: Remote install ===')
        run_cmd("sed -i 's/\\r$//' /root/deploy-ecs-autotasker.sh && bash /root/deploy-ecs-autotasker.sh")

        print('\n=== Phase 4: Public check ===')
        try:
            import urllib.request
            url = 'https://autotasker.highkingflower.com/api/status'
            req = urllib.request.Request(url, headers={'User-Agent': 'HealthCheck/1.0'})
            with urllib.request.urlopen(req, timeout=20) as r:
                body = r.read().decode()
                print(f'Status: {r.status}')
                print(body[:500])
        except Exception as e:
            print(f'Public check failed: {e}')

        print('\nDONE')
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == '__main__':
    main()
