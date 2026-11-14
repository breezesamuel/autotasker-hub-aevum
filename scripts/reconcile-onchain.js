/**
 * reconcile-onchain.js — 账本 vs 链上入账对账（审计级控制）
 *
 * 不变式（只能单向校验）：
 *   链上金库 USDC 入账 = x402 结算 + 用户手动扫款 + 其他转入，所以永远 ≥ 账本。
 *     1) ledger.settledCount ≤ on-chain distinct tx count
 *     2) ledger.revenueUsd   ≤ on-chain inbound USDC
 *   账本一旦大于链上，说明出现了链上无凭证的「收入」——立即报警 exit 1。
 *
 * 数据源（按优先级自动选）：
 *   a) Blockscout Base v2 API（免费、全历史、分页）——部分网络环境 DNS 被劫持不可达
 *   b) Base JSON-RPC eth_getLogs 分块扫描（publicnode / drpc），带 checkpoint 增量
 *      首跑回溯 5,000,000 blocks（≈115 天，覆盖项目全生命周期），之后只扫新增块
 *
 * 用法：
 *   node scripts/reconcile-onchain.js               # 人读
 *   node scripts/reconcile-onchain.js --json        # 机器可读
 *   node scripts/reconcile-onchain.js --source rpc  # 强制 RPC
 *   node scripts/reconcile-onchain.js --reset       # 清 checkpoint 重扫
 */
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const pay = require('../lib/payments');

const TREASURY = '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BLOCKSCOUT = 'https://base.blockscout.com/api/v2';
const RPC_HOSTS = ['base-rpc.publicnode.com', 'base.drpc.org'];
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TO_TOPIC = '0x000000000000000000000000' + TREASURY.slice(2).toLowerCase();
const STATE_FILE = path.join(__dirname, '..', 'data', 'onchain-reconcile.json');
// 最近一次对账报告：由 cron 每日写，服务端 /api/x402/reconcile 只读暴露，
// 审计脚本因此可以「纯 HTTP」校验链上对账状态，不必自己连链。
const REPORT_FILE = path.join(__dirname, '..', 'data', 'onchain-reconcile-report.json');
const CHUNK = 50000;
const FIRST_RUN_LOOKBACK = Number(process.env.ONCHAIN_LOOKBACK || 0) || 5000000;
const EPS = 1e-9;

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const SOURCE = (() => { const i = argv.indexOf('--source'); return i >= 0 ? argv[i + 1] : 'auto'; })();
const RESET = argv.includes('--reset');

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function httpsJson({ host, path: p, method = 'GET', body, timeout = 25000 }) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      host, path: p, method, timeout, family: 4,
      headers: Object.assign(
        { accept: 'application/json', 'user-agent': 'autotasker-hub-reconcile/2' },
        data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}
      ),
    }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' ' + host + p));
        try { resolve(JSON.parse(b)); } catch (e) { reject(new Error('bad JSON from ' + host + p)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout ' + host + p)));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const hex = (n) => '0x' + n.toString(16);

// ── Source A: Blockscout (full history, paginated) ───────────────────────────
function blockscoutUrl(params) {
  const qs = new URLSearchParams({ type: 'ERC-20' });
  if (params) for (const [k, v] of Object.entries(params)) if (v != null) qs.set(k, String(v));
  return '/api/v2/addresses/' + TREASURY + '/token-transfers?' + qs.toString();
}
async function viaBlockscout() {
  let p = blockscoutUrl(null);
  const seenTx = new Set();
  let transfers = 0, usd = 0, pages = 0;
  while (p && pages < 30) {
    const page = await httpsJson({ host: 'base.blockscout.com', path: p });
    pages++;
    for (const it of page.items || []) {
      const token = String((it.token && it.token.address) || it.token_address_hash || '').toLowerCase();
      if (token !== USDC.toLowerCase()) continue;
      const to = String((it.to && it.to.hash) || '').toLowerCase();
      if (to !== TREASURY.toLowerCase()) continue;
      const dec = it.token && it.token.decimals != null ? it.token.decimals : 6;
      usd += Number((it.total && it.total.value) || 0) / Math.pow(10, dec);
      transfers++;
      const tx = String(it.transaction_hash || (it.transaction && it.transaction.hash) || '');
      if (tx) seenTx.add(tx);
    }
    p = page.next_page_params ? blockscoutUrl(page.next_page_params) : null;
  }
  return { source: 'blockscout', count: seenTx.size, transfers, usd: Number(usd.toFixed(6)), pages, fullHistory: true };
}

// ── Source B: JSON-RPC eth_getLogs (chunked + checkpoint) ────────────────────
async function rpcCall(method, params) {
  let lastErr;
  for (const host of RPC_HOSTS) {
    try {
      const r = await httpsJson({ host, path: '/', method: 'POST', body: { jsonrpc: '2.0', id: 1, method, params }, timeout: 30000 });
      if (r && r.error) throw new Error(host + ': ' + String(r.error.message).slice(0, 120));
      return r.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('all RPC hosts failed');
}
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return null; }
}
function saveState(st) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2));
  } catch (e) { /* checkpoint is best-effort; losing it only causes a rescan */ }
}
async function viaRpc() {
  const latest = Number(await rpcCall('eth_blockNumber', []));
  if (!Number.isFinite(latest)) throw new Error('bad eth_blockNumber');
  let st = RESET ? null : loadState();
  if (!st || !Number.isFinite(st.lastBlock)) {
    st = { startBlock: Math.max(0, latest - FIRST_RUN_LOOKBACK), lastBlock: latest - FIRST_RUN_LOOKBACK - 1, transfers: 0, txHashes: [] };
  }
  const from = Math.max(st.startBlock, st.lastBlock + 1);
  const seenTx = new Set(st.txHashes || []);
  let transfers = st.transfers || 0;
  let usd = st.usd || 0;
  let chunks = 0;
  for (let start = from; start <= latest; start += CHUNK) {
    const end = Math.min(latest, start + CHUNK - 1);
    const logs = await rpcCall('eth_getLogs', [{
      address: USDC,
      fromBlock: hex(start),
      toBlock: hex(end),
      topics: [TRANSFER_TOPIC, null, TO_TOPIC],
    }]);
    for (const lg of logs || []) {
      if (String(lg.address).toLowerCase() !== USDC.toLowerCase()) continue;
      if (String(lg.topics && lg.topics[2]).toLowerCase() !== TO_TOPIC) continue;
      usd += Number(BigInt(lg.data)) / 1e6;
      transfers++;
      if (lg.transactionHash) seenTx.add(String(lg.transactionHash));
    }
    st.lastBlock = end;
    chunks++;
    if (chunks % 10 === 0) saveState(Object.assign({}, st, { usd: Number(usd.toFixed(6)), txHashes: [...seenTx], updatedAt: new Date().toISOString() }));
  }
  saveState({
    startBlock: st.startBlock, lastBlock: latest,
    transfers, usd: Number(usd.toFixed(6)), txHashes: [...seenTx],
    updatedAt: new Date().toISOString(),
  });
  return {
    source: 'rpc', count: seenTx.size, transfers, usd: Number(usd.toFixed(6)),
    pages: chunks, fullHistory: st.startBlock === 0,
    coveredFrom: st.startBlock, coveredTo: latest,
  };
}

async function onchainInbound() {
  if (SOURCE === 'rpc') return viaRpc();
  if (SOURCE === 'blockscout') return viaBlockscout();
  try { return await viaBlockscout(); }
  catch (e) {
    const r = await viaRpc();
    r.fallbackReason = 'blockscout unreachable: ' + String(e.message).slice(0, 80);
    return r;
  }
}

// ── Ledger side ──────────────────────────────────────────────────────────────
function ledgerSide() {
  try {
    const s = pay.getSummary();
    return {
      ok: true,
      settledCount: Number(s.settledCount || 0),
      revenueUsd: Number(s.revenueUsd || 0),
      pendingPayouts: (s.pendingPayouts || []).length,
      generatedAt: s.generatedAt,
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message).slice(0, 160) };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const out = {
    ok: false, treasury: TREASURY, usdc: USDC,
    checkedAt: new Date().toISOString(),
    onchain: null, ledger: null, checks: [],
  };
  try {
    out.ledger = ledgerSide();
    if (!out.ledger.ok) throw new Error('ledger unreadable: ' + out.ledger.error);
    out.onchain = await onchainInbound();

    const lc = out.ledger.settledCount, oc = out.onchain.count;
    const lr = out.ledger.revenueUsd, or = out.onchain.usd;

    out.checks.push({ name: 'ledger settled count <= on-chain inbound tx', pass: lc <= oc, detail: lc + ' <= ' + oc });
    out.checks.push({ name: 'ledger revenue <= on-chain inbound USDC', pass: lr <= or + EPS, detail: '$' + lr.toFixed(6) + ' <= $' + or.toFixed(6) });
    if (out.onchain.source === 'rpc') {
      out.checks.push({ name: 'RPC scan reached chain head', pass: out.onchain.coveredTo != null, detail: 'blocks ' + out.onchain.coveredFrom + '..' + out.onchain.coveredTo });
    }
    out.ok = out.checks.every((c) => c.pass);
    out.verdict = out.ok
      ? 'OK: every ledger dollar has on-chain backing (upper-bound invariant holds)'
      : 'MISMATCH: ledger claims revenue with no on-chain backing';
  } catch (e) {
    out.error = String(e && e.message).slice(0, 240);
  }

  // 落盘报告供 /api/x402/reconcile 读取（失败也写，让审计看到真实状态）
  try {
    fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  } catch (e) { /* best effort */ }

  if (AS_JSON) {
    console.log(JSON.stringify(out, null, 2));
  } else {    console.log('== on-chain reconciliation ==');
    console.log('treasury :', out.treasury);
    if (out.error) console.log('ERROR    :', out.error);
    if (out.onchain) {
      console.log('source   :', out.onchain.source + (out.onchain.fallbackReason ? ' (fallback: ' + out.onchain.fallbackReason + ')' : ''));
      console.log('on-chain :', out.onchain.count + ' distinct tx / ' + out.onchain.transfers + ' transfers / $' + out.onchain.usd.toFixed(6));
      if (out.onchain.coveredFrom != null) console.log('coverage : blocks ' + out.onchain.coveredFrom + '..' + out.onchain.coveredTo + ' (chunks=' + out.onchain.pages + ')');
    }
    if (out.ledger && out.ledger.ok) {
      console.log('ledger   :', out.ledger.settledCount + ' settled / $' + out.ledger.revenueUsd.toFixed(6) + ' / pending payouts=' + out.ledger.pendingPayouts);
    }
    for (const c of out.checks) console.log('  [' + (c.pass ? 'OK' : 'FAIL') + '] ' + c.name + '  (' + c.detail + ')');
    if (out.verdict) console.log('verdict  :', out.verdict);
  }
  process.exit(out.ok ? 0 : out.error ? 2 : 1);
})();
