import paramiko, os, time

KEY = os.path.join(os.environ.get('USERPROFILE', ''), '.ssh', 'id_ed25519')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('8.155.53.12', username='root', key_filename=KEY)

steps = [
    ("=== 2a/7 npm ci ===",
     "cd /www/autotasker/app && npm ci --omit=dev --registry=https://registry.npmmirror.com --no-audit --no-fund 2>&1 | tail -5; echo NPM_EXIT:$?"),
    ("=== 3/7 env file ===",
     "cat > /www/autotasker/app/.env.production <<'ENV'\n"
     "NODE_ENV=production\n"
     "PORT=8795\n"
     "HOST=127.0.0.1\n"
     "PAY_TO=0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C\n"
     "X402_NETWORK=eip155:8453\n"
     "PUBLIC_URL=https://autotasker.highkingflower.com\n"
     "BASE_RPC_URL=https://base.drpc.org\n"
     "ENV\n"
     "chmod 600 /www/autotasker/app/.env.production\n"
     "echo ENV_OK && cat /www/autotasker/app/.env.production"),
    ("=== 4/7 systemd unit ===",
     "cat > /etc/systemd/system/autotasker.service <<'UNIT'\n"
     "[Unit]\n"
     "Description=AutoTasker Hub (x402 paid data, single treasury)\n"
     "After=network-online.target\n"
     "Wants=network-online.target\n"
     "\n"
     "[Service]\n"
     "Type=simple\n"
     "WorkingDirectory=/www/autotasker/app\n"
     "EnvironmentFile=/www/autotasker/app/.env.production\n"
     "ExecStart=/usr/bin/env node /www/autotasker/app/server.js\n"
     "Restart=always\n"
     "RestartSec=3\n"
     "NoNewPrivileges=true\n"
     "PrivateTmp=true\n"
     "ProtectSystem=full\n"
     "ProtectHome=true\n"
     "ReadWritePaths=/www/autotasker/app /www/autotasker/data\n"
     "StandardOutput=append:/www/autotasker/data/service.log\n"
     "StandardError=append:/www/autotasker/data/service.err.log\n"
     "\n"
     "[Install]\n"
     "WantedBy=multi-user.target\n"
     "UNIT\n"
     "systemctl daemon-reload\n"
     "systemctl enable autotasker >/dev/null 2>&1 || true\n"
     "echo UNIT_OK"),
    ("=== 5/7 start + wait ===",
     "systemctl restart autotasker && sleep 3 && curl -fsS -m 5 http://127.0.0.1:8795/api/status || echo WAITING..."),
]

for label, cmd in steps:
    print(label)
    chan = c.get_transport().open_session()
    chan.exec_command(cmd)
    t0 = time.time()
    while not chan.exit_status_ready() and time.time() - t0 < 120:
        time.sleep(0.5)
    out = chan.recv(3000).decode(errors='replace')
    print(out[:800])
    ec = chan.recv_exit_status() if chan.exit_status_ready() else '?'
    print(f"  EXIT={ec}")
    print()

# Final check
print("=== FINAL STATUS ===")
chan = c.get_transport().open_session()
chan.exec_command('systemctl is-active autotasker; systemctl status autotasker --no-pager 2>/dev/null | tail -8')
t0 = time.time()
while not chan.exit_status_ready() and time.time() - t0 < 10:
    time.sleep(0.3)
out = chan.recv(2000).decode(errors='replace')
print(out)
c.close()
print("DONE")
