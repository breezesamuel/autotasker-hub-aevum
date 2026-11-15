/**
 * auto-rebate-pay.js — 金库自动支付推荐返利（链上直付，不经第三方资金池）
 *
 * 流程：lib/referrals.payoutPlan() 生成待付清单 → 逐个金库签名 USDC transfer →
 *       等待回执 → referrals.recordPayout(wallet, amount, txHash) 清掉负债（FIFO）。
 *
 * 安全门控：
 *   - 默认 DRY-RUN：只打印将要执行的转账，不发交易、不动账本。
 *   - --execute：真正发交易。每次运行总上限 $50（--cap 覆盖），单笔上限 $20。
 *   - 超过单笔上限的负债只付上限部分（FIFO 消费，剩余继续挂账）。
 *   - BLOCKED_WALLETS（金库/house/旧钱包）永不付款。
 *   - 私钥只从 config/keys/pay-to-new.json 读取（gitignored），只输出派生地址，绝不打印密钥。
 *   - 金库必须有 ETH 做 gas：Base 上单笔 transfer ≈ 0.00001-0.00005 ETH。
 *
 * Usage:
 *   node scripts/auto-rebate-pay.js                # dry-run：显示付款计划
 *   node scripts/auto-rebate-pay.js --execute      # 真实付款（含 cap 与 blocked 过滤）
 *   node scripts/auto-rebate-pay.js --execute --cap 100
 *   node scripts/auto-rebate-pay.js --json         # 机器可读输出（供 cron/审计用）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const KEY_FILE = process.env.TREASURY_KEY_FILE || path.join(ROOT, 'config', 'keys', 'pay-to-new.json');
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const RPCS = ['https://mainnet.base.org', 'https://base.publicnode.com', 'https://1rpc.io/base'];
const CHAIN_ID = 8453; // Base

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const JSON_OUT = args.includes('--json');
const capIdx = args.indexOf('--cap');
const RUN_CAP_USD = capIdx >= 0 ? Number(args[capIdx + 1]) || 50 : 50;
const SINGLE_CAP_USD = 20;

const referrals = require(path.join(ROOT, 'lib', 'referrals'));

function fail(msg, extra) {
  if (JSON_OUT) console.log(JSON.stringify({ ok: false, error: msg, ...extra }));
  else console.error('✗ ' + msg);
  process.exit(1);
}

// ---- treasury account ----
let account = null;
try {
  const k = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  const { privateKeyToAccount } = require('viem/accounts');
  account = privateKeyToAccount(k.privateKey);
} catch (e) {
  fail('treasury key unavailable: ' + KEY_FILE + ' (' + e.message + ')');
}

const { createPublicClient, createWalletClient, http } = require('viem');
const baseChain = {
  id: CHAIN_ID,
  name: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPCS[0]] } },
};
const publicClient = createPublicClient({ chain: baseChain, transport: http(RPCS[0], { batch: false }) });
const walletClient = createWalletClient({ account, chain: baseChain, transport: http(RPCS[0], { batch: false }) });

function jsonFetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 20000 }, (r) => {
      let b = '';
      r.on('data', (c) => (b += c));
      r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error('bad json')); } });
    }).on('error', reject);
  });
}

async function ethBalance() {
  for (const u of RPCS) {
    try { return await publicClient.request({ method: 'eth_getBalance', params: [account.address, 'latest'] }); }
    catch (e) { /* next rpc */ }
  }
  throw new Error('all rpc failed for eth_getBalance');
}

const usdcAbi = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ type: 'bool' }],
}];

async function sendUsdc(to, amountAtomic) {
  const hash = await walletClient.writeContract({
    address: USDC, abi: usdcAbi, functionName: 'transfer', args: [to, amountAtomic],
    gas: 80000n, // ERC-20 transfer on Base is well under this; avoids RPC gas estimation flakiness
  });
  const rcpt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000, pollingInterval: 2_000 });
  if (rcpt.status !== 'success') throw new Error('tx reverted: ' + hash);
  return hash;
}

(async () => {
  const plan = referrals.payoutPlan();
  const rows = (plan.rows || []).filter((r) => !referrals.BLOCKED_WALLETS.has(String(r.wallet).toLowerCase()));

  let eth = null;
  try { eth = Number(BigInt(await ethBalance())) / 1e18; } catch (e) {}

  const skipped = [];
  const queue = [];
  let runTotal = 0;
  for (const r of rows) {
    const amt = Number(r.amountUsd);
    if (runTotal + amt > RUN_CAP_USD) { skipped.push({ wallet: r.wallet, amountUsd: r.amountUsd, reason: 'run cap $' + RUN_CAP_USD }); continue; }
    const payUsd = Math.min(amt, SINGLE_CAP_USD);
    if (payUsd < amt) skipped.push({ wallet: r.wallet, amountUsd: +(amt - payUsd).toFixed(6), reason: 'single cap $' + SINGLE_CAP_USD + ' partial' });
    queue.push({ wallet: String(r.wallet).toLowerCase(), code: r.code, payUsd, entries: r.entries.length, full: payUsd >= amt });
    runTotal += payUsd;
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({
      ok: true, mode: EXECUTE ? 'execute' : 'dry-run',
      from: account.address, ethBalance: eth == null ? null : +eth.toFixed(8),
      pendingRows: rows.length, runCapUsd: RUN_CAP_USD, singleCapUsd: SINGLE_CAP_USD,
      queue, skipped, runTotalUsd: +runTotal.toFixed(6),
    }, null, 2));
  } else {
    console.log('== auto-rebate-pay ==');
    console.log('mode:', EXECUTE ? 'EXECUTE（将真实发交易）' : 'dry-run（只打印不发）');
    console.log('from:', account.address, '| ETH:', eth == null ? '?' : eth.toFixed(8));
    console.log('run cap: $' + RUN_CAP_USD, '| single cap: $' + SINGLE_CAP_USD, '| blocked filter:', referrals.BLOCKED_WALLETS.size, 'wallets');
    if (!queue.length) console.log('无待付返利（或全部被过滤）。');
    for (const q of queue) {
      console.log(`  ${q.wallet}  code=${q.code}  pay $${q.payUsd.toFixed(2)}  (${q.entries} 笔返利${q.full ? '' : '，部分付款'})`);
    }
    for (const s of skipped) console.log(`  ⏸ ${s.wallet}  $${s.amountUsd}  → ${s.reason}`);
    console.log('total:', '$' + runTotal.toFixed(2));
  }

  if (!EXECUTE) {
    if (!JSON_OUT) console.log('dry-run 结束。加 --execute 真实付款（请确认金库有 ETH gas）。');
    return;
  }

  if (eth != null && eth < 0.00002) fail('金库无 gas：请先转 ≥0.0001 ETH 到 ' + account.address, { ethBalance: eth });

  const results = [];
  for (const q of queue) {
    const atomic = BigInt(Math.round(q.payUsd * 1e6));
    try {
      const hash = await sendUsdc(q.wallet, atomic);
      const rec = referrals.recordPayout(q.wallet, q.payUsd, hash);
      results.push({ wallet: q.wallet, amountUsd: q.payUsd, txHash: hash, recorded: !!rec.ok });
      console.log('✓ paid $' + q.payUsd.toFixed(2) + ' → ' + q.wallet + '  tx: ' + hash);
    } catch (e) {
      results.push({ wallet: q.wallet, amountUsd: q.payUsd, error: e.message });
      console.error('✗ ' + q.wallet + ' failed: ' + e.message);
    }
  }
  if (JSON_OUT) console.log(JSON.stringify({ ok: true, executed: results }, null, 2));
})().catch((e) => fail(e.message));
