/**
 * onchain-token-scan.js — Base 主网全量代币清点
 *
 * 对每个地址：扫 ERC20 Transfer 日志（topic2/3 = 地址），发现其历史收到过的
 * 所有代币合约，然后逐个 balanceOf，报出非零余额。补齐 onchain-balance.js
 * 只查 USDC 的盲区（"USDC 等"的"等"）。
 */
const https = require('https');

const RPC = 'https://mainnet.base.org';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';
const ADDRS = {
  TREASURY: '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C',
  LEGACY_FACILITATOR: '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03',
  GENESIS_ID: '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38',
  LEGACY_PAYTO: '0xFC24FD34da9e49A0110DCaEe3Ad30eC54175eBB3',
};
const KNOWN = { [USDC.toLowerCase()]: 'USDC', [WETH.toLowerCase()]: 'WETH' };

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const r = https.request(RPC, {
      method: 'POST', timeout: 30000,
      headers: { 'content-type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        try { const j = JSON.parse(b); j.error ? reject(new Error(JSON.stringify(j.error))) : resolve(j.result); }
        catch (e) { reject(new Error('bad rpc: ' + b.slice(0, 150))); }
      });
    });
    r.on('error', reject); r.on('timeout', () => r.destroy(new Error('timeout')));
    r.write(body); r.end();
  });
}
const pad = (a) => a.replace(/^0x/i, '').toLowerCase().padStart(64, '0');

async function balanceOf(token, addr) {
  try {
    const r = await rpc('eth_call', [{ to: token, data: '0x70a08231' + pad(addr) }, 'latest']);
    const v = BigInt(r);
    return v; // raw
  } catch (e) { return null; }
}
async function decimals(token) {
  try {
    const r = await rpc('eth_call', [{ to: token, data: '0x313ce567' }, 'latest']);
    return parseInt(r, 16);
  } catch (e) { return 18; }
}
async function symbol(token) {
  // symbol() can revert for non-standard tokens — best effort
  try {
    const r = await rpc('eth_call', [{ to: token, data: '0x95d89b41' }, 'latest']);
    if (r === '0x' || !r) return null;
    const data = r.slice(2);
    if (data.length >= 128) {
      const len = parseInt(data.slice(64, 128), 16);
      const hex = data.slice(128, 128 + len * 2);
      return Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
    }
    return Buffer.from(data, 'hex').toString('utf8').replace(/\0/g, '').slice(0, 12);
  } catch (e) { return null; }
}

(async () => {
  const latest = await rpc('eth_blockNumber', []);
  const head = parseInt(latest, 16);
  console.log('Base head block:', head, '\n');

  for (const [label, addr] of Object.entries(ADDRS)) {
    console.log('── ' + label + ' ' + addr);
    const eth = parseInt(await rpc('eth_getBalance', [addr, 'latest']), 16) / 1e18;
    console.log('   ETH: ' + eth.toFixed(8));

    // discover tokens via Transfer logs (chunked by 450k blocks, coverage ~last 1.8M blocks)
    const tokens = new Set([USDC.toLowerCase()]);
    const from = Math.max(0, head - 1_800_000);
    // explicit: tokens RECEIVED by addr (topic2=addr) and tokens SENT by addr (topic1=addr)
    for (let start = from; start <= head; start += 450_000) {
      const end = Math.min(head, start + 449_999);
      const specs = [
        [TRANSFER_TOPIC, null, pad(addr)],   // received
        [TRANSFER_TOPIC, pad(addr), null],   // sent
      ];
      for (const topics of specs) {
        try {
          const logs = await rpc('eth_getLogs', [{
            fromBlock: '0x' + start.toString(16), toBlock: '0x' + end.toString(16),
            topics,
          }]);
          for (const l of logs || []) if (l.address) tokens.add(l.address.toLowerCase());
        } catch (e) {
          // public RPC getLogs may rate-limit; shrink range once
          try {
            const half = Math.floor((start + end) / 2);
            for (const s2 of [start, half + 1]) {
              const e2 = Math.min(head, s2 + 224_999);
              const logs = await rpc('eth_getLogs', [{ fromBlock: '0x' + s2.toString(16), toBlock: '0x' + e2.toString(16), topics }]);
              for (const l of logs || []) if (l.address) tokens.add(l.address.toLowerCase());
            }
          } catch (e2) { console.log('   (getLogs skip: ' + String(e2.message).slice(0, 60) + ')'); }
        }
      }
    }

    let printed = 0;
    for (const t of tokens) {
      const raw = await balanceOf(t, addr);
      if (raw === null || raw === 0n) continue;
      const dec = await decimals(t);
      const sym = KNOWN[t] || (await symbol(t)) || '?';
      const human = Number(raw) / 10 ** dec;
      console.log('   ' + sym.padEnd(10) + ' ' + human.toFixed(6) + '   (' + t + (KNOWN[t] ? '' : ' [未知合约]') + ')');
      printed++;
    }
    if (!printed) console.log('   (ERC20 零余额)');
    console.log('');
  }
  console.log('提示：[未知合约] 需在 basescan.org 查代币标识后再决定处置；USDC/ETH 扫金库，其他代币先看是什么。');
})().catch(e => { console.error('SCAN ERROR:', e.message); process.exit(1); });
