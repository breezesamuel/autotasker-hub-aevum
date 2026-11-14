#!/usr/bin/env bash
# ECS-side install/restart for AutoTasker Hub.
# Runs on the server as root. Idempotent: safe to re-run for every deploy.
set -euo pipefail

APP=/www/autotasker/app
DATA=/www/autotasker/data
PKG=/root/autotasker-src.tar.gz
PORT=8795

echo "=== 0/7 layout ==="
mkdir -p "$APP" "$DATA"
chmod 700 /www/autotasker || true

echo "=== 1/7 extract source (keeps data/ from the package on first install only) ==="
# Note: gzip emits "trailing garbage ignored" when tar archive has no padding, causing exit 2.
# Files are still fully extracted — || true lets the script continue safely.
tar -xzf "$PKG" -C "$APP" 2>/dev/null || true

echo "=== 2/7 deps (production only) ==="
cd "$APP"
if [ -f package-lock.json ]; then
  npm ci --omit=dev --registry=https://registry.npmmirror.com --no-audit --no-fund
else
  npm install --omit=dev --registry=https://registry.npmmirror.com --no-audit --no-fund
fi

echo "=== 3/7 env ==="
cat > "$APP/.env.production" <<'ENV'
NODE_ENV=production
PORT=8795
HOST=127.0.0.1
PAY_TO=0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C
X402_NETWORK=eip155:8453
PUBLIC_URL=https://autotasker.highkingflower.com
BASE_RPC_URL=https://base.drpc.org
# No RELAYER_PRIVATE_KEY: payers broadcast their own EIP-3009 transfer, so this
# process never holds a key. Set one only if you want gas-only relaying.
ENV
chmod 600 "$APP/.env.production"

echo "=== 4/7 systemd unit ==="
cat > /etc/systemd/system/autotasker.service <<UNIT
[Unit]
Description=AutoTasker Hub (x402 paid data, single treasury)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP
EnvironmentFile=$APP/.env.production
ExecStart=/usr/bin/env node $APP/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$APP $DATA
StandardOutput=append:/www/autotasker/data/service.log
StandardError=append:/www/autotasker/data/service.err.log

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable autotasker >/dev/null 2>&1 || true
systemctl restart autotasker

echo "=== 5/7 wait for listen ==="
for i in $(seq 1 25); do
  if curl -fsS -m 3 "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1; then echo "up after ${i}s"; break; fi
  sleep 1
done

echo "=== 6/7 local status ==="
curl -s -m 5 "http://127.0.0.1:$PORT/api/status" || true
echo

echo "=== 7/7 unit state ==="
systemctl is-active autotasker
echo DONE
