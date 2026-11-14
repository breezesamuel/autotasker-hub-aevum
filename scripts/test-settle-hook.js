/**
 * test-settle-hook.js — 本地全链路验证 onAfterSettle 记账钩子
 *
 * 隔离措施：LEDGER_DIR 指向临时目录（payments 账本不落 repo data/）；
 * referrals.json 会在测试前备份、测试后恢复。
 *
 * 流程：
 *   1. 起 mock facilitator（/supported /verify /settle 全部成功）
 *   2. 起 server.js（FACILITATOR_URL 指向 mock，PORT=8797）
 *   3. REST 路径：GET /api/x402/hotlist + X-PAYMENT 头 → 中间件结算 → 钩子应记账
 *   4. MCP 路径：POST /mcp tools/call get_hotlist + PAYMENT-SIGNATURE → 钩子应记账
 *   5. 断言：临时账本出现 mock txHash 条目；/api/ref/stats 显示归因与返利
 */
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8797;
const MOCK = 8899;
const APP = `http://127.0.0.1:${PORT}`;
const TREASURY = '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';
const PAYER = '0xA11CE00000000000000000000000000000000001';

const ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-ledger-'));
const refBackup = path.join(os.tmpdir(), 'referrals-backup-' + Date.now() + '.json');
const refFile = path.join(__dirname, '..', 'data', 'referrals.json');

function post(port, p, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const r = http.request({ hostname: '127.0.0.1', port, path: p, method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, headers || {}) }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: p }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  let pass = 0, fail = 0;
  const check = (name, cond, detail) => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  | ' + String(detail).slice(0, 90) : '')); };

  // backup referrals
  try { fs.copyFileSync(refFile, refBackup); } catch (e) { console.log('(no referrals.json to back up)'); }

  // ── 1. mock facilitator ────────────────────────────────────────────────
  const mockTx = { hotlist: '0xmock-rest-' + Date.now(), mcp: '0xmock-mcp-' + Date.now() };
  let settleCalls = 0;
  const mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
      if (req.url === '/supported') return json({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }], extensions: ['bazaar'] });
      if (req.url === '/verify') return json({ isValid: true, payer: PAYER });
      if (req.url === '/settle') {
        settleCalls++;
        return json({ success: true, transaction: mockTx[req.headers['x-mock-tx'] || 'hotlist'] || ('0xmock-' + Date.now()), network: 'eip155:8453', payer: PAYER, amount: '50000' });
      }
      res.statusCode = 404; json({ error: 'not found', url: req.url });
    });
  });
  await new Promise(r => mock.listen(MOCK, '127.0.0.1', r));

  // ── 2. app with mock facilitator ───────────────────────────────────────
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT), HOST: '127.0.0.1',
      FACILITATOR_URL: `http://127.0.0.1:${MOCK}`,
      LEDGER_DIR: ledgerDir,
      NODE_ENV: 'test',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', d => bootLog += d);
  child.stderr.on('data', d => bootLog += d);

  let up = false;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try { const s = await get(PORT, '/api/status'); if (s.status === 200) { up = true; break; } } catch (e) {}
  }
  check('app boots with hook armed', up, bootLog.split('\n').find(l => /after-settle/.test(l)));

  // ── 3. REST path through paymentMiddleware (real-client two-step dance) ──
  async function get2(port, p, headers) {
    return new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: p, headers }, res => {
        let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
      }).on('error', reject);
    });
  }
  const url = '/api/x402/hotlist?board=weiboHot&limit=1';
  const rest402 = await get2(PORT, url, {});
  check('REST unpaid probe returns 402', rest402.status === 402, rest402.status);
  let challenge = null;
  try {
    challenge = JSON.parse(Buffer.from(rest402.headers['payment-required'], 'base64').toString('utf8'));
  } catch (e) {}
  check('402 challenge decodes from payment-required header', !!(challenge && challenge.accepts && challenge.accepts[0]),
    challenge ? 'accepts[0] amount=' + (challenge.accepts[0].amount || challenge.accepts[0].maxAmountRequired) : 'header missing');
  const accepted = challenge && challenge.accepts && challenge.accepts[0];
  const payload = accepted ? {
    x402Version: 2,
    accepted,
    resource: challenge.resource,
    payload: {
      signature: '0x' + 'ab'.repeat(65),
      authorization: {
        from: PAYER, to: TREASURY, value: '50000',
        validAfter: '0', validBefore: String(Math.floor(Date.now() / 1000) + 300),
        nonce: '0x' + '11'.repeat(32),
      },
    },
  } : null;
  const rest = payload
    ? await get2(PORT, url, { 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify(payload)).toString('base64'), 'X-MOCK-TX': 'hotlist' })
    : { status: 0, body: '(skipped — no challenge)' };
  check('REST paid call returns 200', rest.status === 200, rest.status + ' ' + rest.body.slice(0, 120));
  const restJson = (() => { try { return JSON.parse(rest.body); } catch (e) { return null; } })();
  check('REST paid call serves real data', !!(restJson && restJson.items && restJson.items.length), restJson ? restJson.items.length + ' items' : rest.body.slice(0, 100));

  // ── 4. MCP path (manual verify→settle→hook) ─────────────────────────────
  const codeRes = await post(PORT, '/api/ref/new', {});
  const code = (JSON.parse(codeRes.body) || {}).code;
  await post(PORT, '/api/ref/claim', { code, wallet: PAYER });
  const mcpPayload = {
    x402Version: 2, scheme: 'exact', network: 'eip155:8453',
    resource: 'mcp://tool/get_hotlist',
    payload: { signature: '0x' + 'cd'.repeat(65), payer: PAYER },
  };
  const mcp = await post(PORT, '/mcp', {
    jsonrpc: '2.0', id: 7, method: 'tools/call',
    params: { name: 'get_hotlist', arguments: { board: 'weiboHot', limit: 3 } },
  }, { 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify(mcpPayload)).toString('base64'), 'X-MOCK-TX': 'mcp' });
  check('MCP paid call returns 200', mcp.status === 200, mcp.status + ' ' + mcp.body.slice(0, 120));
  const mp = (() => { try { return JSON.parse(mcp.body); } catch (e) { return null; } })();
  check('MCP paid call serves data', !!(mp && mp.result && mp.result.content), mp ? JSON.stringify(mp).slice(0, 100) : '(unparseable)');

  // ── 5. ledger + attribution assertions ──────────────────────────────────
  await sleep(600);
  const ledgerFile = path.join(ledgerDir, 'ledger.json');
  let entries = [];
  try { entries = (JSON.parse(fs.readFileSync(ledgerFile, 'utf8')) || {}).entries || []; } catch (e) {
    check('ledger written by hook', false, e.message);
  }
  const restTx = entries.filter(e => e.txHash === mockTx.hotlist);
  const mcpTx = entries.filter(e => e.txHash === mockTx.mcp);
  check('REST settle recorded in ledger', restTx.length === 1, entries.map(e => e.txHash).join(' | '));
  check('MCP settle recorded in ledger', mcpTx.length === 1, 'entries=' + entries.length);
  if (restTx.length) check('REST ledger price correct ($0.05)', Number(restTx[0].priceUsd) === 0.05, 'priceUsd=' + restTx[0].priceUsd);

  const stats = await get(PORT, '/api/ref/stats/' + code);
  const st = (() => { try { return JSON.parse(stats.body); } catch (e) { return {}; } })();
  check('referral attribution accrued (REST+MCP)', Number(st.attributedRevenueUsd) >= 0.09, 'revenue=$' + st.attributedRevenueUsd);
  check('rebate liability accrued (10%)', Math.abs(Number(st.rebatePendingUsd) - 0.01) < 0.001, 'pending=$' + st.rebatePendingUsd);

  check('mock facilitator settled exactly twice', settleCalls === 2, 'calls=' + settleCalls);

  // ── cleanup ─────────────────────────────────────────────────────────────
  child.kill();
  mock.close();
  try { if (fs.existsSync(refBackup)) fs.copyFileSync(refBackup, refFile); } catch (e) {}
  console.log(`\nSETTLE-HOOK TEST: ${pass} PASS / ${fail} FAIL`);
  console.log('(referrals.json restored from backup; ledger kept at ' + ledgerDir + ')');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('TEST ERROR:', e.message); process.exit(1); });
