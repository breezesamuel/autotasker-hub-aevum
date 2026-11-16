#!/usr/bin/env node
/**
 * aevum-watch.js — 金库直通线保活器 (0xb9A9-only revenue line)
 *
 * 职责:
 *   1. 健康: http://127.0.0.1:8797/api/status —— 挂了用 detached 子进程重起 serve-aevum.js
 *   2. 隧道: public-urls.json 的 aevumTreasury URL 公网可达 —— 挂了重起 cloudflared quick tunnel,
 *      抓新 URL 登记。不动旧的 hub/x402 隧道。
 *   3. 只观测、只拉起自己的线; 旧金库 0x367F 线完全不碰。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, exec } = require('child_process');

const ROOT = 'F:\\2026\\第二次点子';
const DATA = path.join(ROOT, 'data');
const URLS_FILE = path.join(DATA, 'public-urls.json');
const LOG = path.join(DATA, 'aevum-watch.log');
const SERVE_SCRIPT = 'F:/2026/第二次点子/repos/autotasker-hub-aevum/scripts/serve-aevum.js';
const PORT = 8797;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n', 'utf8'); } catch (e) { }
}
function get(url, ms = 10000) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https:') ? require('https') : http;
    const req = mod.get(url, { timeout: ms }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
function readUrls() { try { return JSON.parse(fs.readFileSync(URLS_FILE, 'utf8')); } catch (e) { return {}; } }
function saveUrls(patch) {
  const j = { ...readUrls(), ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(URLS_FILE, JSON.stringify(j, null, 2));
}
function detached(cmd, args) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return child.pid;
}

(async () => {
  let acted = [];
  // 1) local service health (wait longer: facilitator init can take ~10s)
  const local = await get(`http://127.0.0.1:${PORT}/api/status`);
  if (!local || local.status !== 200) {
    log('local :8797 DOWN -> respawning server');
    detached(process.execPath, [SERVE_SCRIPT]);
    acted.push('respawn-server');
    let up = false;
    for (let i = 0; i < 6 && !up; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const s = await get(`http://127.0.0.1:${PORT}/api/status`);
      up = !!(s && s.status === 200);
    }
    log(up ? 'server back UP after respawn' : 'server still DOWN after 30s — will retry next cycle');
  } else {
    log(`local :8797 ok (${local.status})`);
  }

  // 2) tunnel health: only restart cloudflared if OUR tunnel PROCESS is gone
  //    (a dead origin makes the public URL fail too — restarting the tunnel then
  //    would needlessly rotate the domain and invalidate all listings)
  const urls = readUrls();
  const pub = urls.aevumTreasury;
  const tunnelProc = await new Promise((resolve) => {
    exec('powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name=\'cloudflared.exe\'\\" | Where-Object { $_.CommandLine -match \'8797\' } | Measure-Object).Count"', (err, so) => {
      const n = err ? 0 : parseInt(String(so).trim(), 10);
      resolve(Number.isFinite(n) ? n : 0);
    });
  });
  let pubOk = false;
  if (tunnelProc > 0 && pub) {
    for (let i = 0; i < 3 && !pubOk; i++) {
      const pubResp = await get(pub + '/api/status', 15000);
      pubOk = !!(pubResp && pubResp.status === 200);
      if (!pubOk) await new Promise(r => setTimeout(r, 5000));
    }
  }
  if (tunnelProc === 0) {
    log('cloudflared (8797) PROCESS GONE -> restarting quick tunnel');
    const LOGF = path.join(DATA, 'tunnel-aevum.log');
    try { fs.writeFileSync(LOGF, '', 'utf8'); } catch (e) { }
    detached('C:/Users/Think/cloudflared.exe', ['tunnel', '--url', `http://localhost:${PORT}`, '--logfile', LOGF, '--loglevel', 'info']);
    acted.push('respawn-tunnel');
    let newUrl = null;
    for (let i = 0; i < 10 && !newUrl; i++) {
      await new Promise(r => setTimeout(r, 4000));
      try {
        const t = fs.readFileSync(LOGF, 'utf8');
        const m = t.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m) newUrl = m[0];
      } catch (e) { }
    }
    if (newUrl) {
      saveUrls({ aevumTreasury: newUrl });
      log('tunnel UP, new URL registered: ' + newUrl);
      acted.push('url=' + newUrl);
    } else {
      log('tunnel URL not found in log after 40s');
    }
  } else if (pubOk) {
    log('tunnel ok: ' + pub);
  } else {
    log(`tunnel process alive (${tunnelProc}) but public URL failing — leaving it alone (origin may be warming)`);
  }

  log('watch cycle done' + (acted.length ? ' — actions: ' + acted.join(', ') : ''));
})();
