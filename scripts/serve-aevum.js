// Boot aevum server on :8797 as a long-running child; write pid/log handles.
// This file stays alive as the parent so the server keeps running in background shells.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = 'F:/2026/第二次点子/repos/autotasker-hub-aevum';
const LOG = 'F:/2026/第二次点子/data/svc-aevum-treasury.log';

const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
  cwd: ROOT,
  env: { ...process.env, PORT: '8797', NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const line = (s) => { try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${s}`, 'utf8'); } catch (e) {} };
line('server spawning (pid ' + child.pid + '), PAY_TO=0xb9A9 (treasury-only line)\n');
child.stdout.on('data', d => line('[out] ' + d));
child.stderr.on('data', d => line('[err] ' + d));
child.on('exit', (code, sig) => line(`[exit] code=${code} sig=${sig}\n`));
// keep parent alive
setInterval(() => {}, 1 << 30);
