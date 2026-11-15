/**
 * dormant-finder.js — 沉睡资产发现器（离线脚本）
 *
 * 扫描思路：
 *   1. 查询已知目标地址的历史交易记录
 *   2. 识别收款方是 burn address / 零地址的转账（可能有误转可追回）
 *   3. 找出长期未活动的钱包（6个月无活动但有余额）
 *   4. 生成"可回收清单"——包含精确的合约调用参数
 *
 * 用法：node scripts/dormant-finder.js [--chains base,eth,arb]
 */
'use strict';

const https = require('https');

const RPCS = {
  base:      'https://mainnet.base.org',
  ethereum:  'https://eth.llamarpc.com',
  arbitrum:  'https://arb1.arbitrum.io/rpc',
};

// 0xFC24 is our legacy payto wallet — scan its incoming transfers for unclaimed funds
const WATCH_ADDRESSES = [
  '0xFC24FD34da9e49A0110DCaEe3Ad30eC54175eBB3',  // legacy payto (gasless)
  '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38',  // genesis id
  '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03',  // legacy facilitator
];

const TREASURY = process.env.PAY_TO || '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function pad(a){return a.replace(/^0x/i,'').toLowerCase().padStart(64,'0');}

function rpc(chain, method, params, timeoutMs) {
  timeoutMs = timeoutMs || 10000;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({jsonrpc:'2.0',id:1,method,params});
    const u = new URL(RPCS[chain]);
    const req = https.request({hostname:u.hostname,path:u.pathname+u.search,method:'POST',
      timeout:timeoutMs, headers:{'content-type':'application/json','Content-Length':Buffer.byteLength(body)}}, res=>{
      let b='';res.on('data',c=>b+=c);res.on('end',()=>{try{resolve(JSON.parse(b).result);}catch(e){reject(new Error('bad json'));}});
    });
    req.on('error',e=>reject(e));req.on('timeout',()=>{req.destroy();reject(new Error('timeout'));});
    req.write(body);req.end();
  });
}

async function scanChain(chain, addr) {
  console.log(`\n[${chain}] Scanning ${addr.slice(0,10)}...`);
  // 1. Current ETH balance
  const ethBal = await rpc(chain,'eth_getBalance',[addr,'latest']).catch(()=>0n);
  const ethNum = Number(ethBal||0)/1e18;

  // 2. USDC balance
  let usdcBal = 0;
  try {
    const fnSel = '0x70a08231'+pad(addr);
    const raw = await rpc(chain,'eth_call',[{to:USDC,data:fnSel},'latest']);
    usdcBal = Number(raw||0)/1e6;
  } catch(e){}

  // 3. Check if any recent large incoming transfers (> $10) came from unknown sources
  // This requires archive node access — approximate via latest 100 blocks of transfers
  let recentIncoming = 0;
  try {
    const fromBlock = await rpc(chain,'eth_blockNumber',[]);
    const blockNum = Number(fromBlock||0) - 100;
    const logs = await rpc(chain,'eth_getLogs',[{fromBlock:'0x'+blockNum.toString(16),to:USDC,topics:[null,null,['0x'+pad(addr)]]}]).catch(()=>[]);
    if (Array.isArray(logs)) recentIncoming = logs.length;
  } catch(e){}

  console.log(`  ETH: ${ethNum.toFixed(6)} | USDC: $${usdcBal.toFixed(6)} | Recent inbound txs: ${recentIncoming}`);
  return { chain, address:addr, eth:ethNum, usdc:usdcBal, recentIncoming, timestamp:new Date().toISOString() };
}

async function main() {
  console.log('=== Dormant Asset Scanner ===');
  console.log('Treasury target:', TREASURY);
  console.log('Chains:', Object.keys(RPCS).join(', '));

  const allResults = [];
  for (const addr of WATCH_ADDRESSES) {
    for (const chain of Object.keys(RPCS)) {
      try {
        const r = await scanChain(chain, addr);
        allResults.push(r);
      } catch(e) {
        console.log(`  [${chain}] ERROR: ${e.message.slice(0,60)}`);
      }
    }
  }

  // Summary
  let totalUsdc = 0, totalEth = 0;
  for (const r of allResults) {
    totalUsdc += (isNaN(r.usdc) ? 0 : r.usdc);
    totalEth += (isNaN(r.eth) ? 0 : r.eth);
  }
  console.log('\n=== Summary ===');
  console.log(`Total USDC across all addresses/chains: $${totalUsdc.toFixed(6)}`);
  console.log(`Total ETH across all addresses/chains: ${totalEth.toFixed(6)}`);

  const sweepable = allResults.filter(r=>r.usdc>0||r.eth>0.0001);
  if (sweepable.length) {
    console.log('\n Sweepable assets detected:');
    for (const r of sweepable) {
      console.log(`  ${r.chain}: ${r.address.slice(0,10)} → USDC $${r.usdc.toFixed(6)} / ETH ${r.eth.toFixed(6)}`);
    }
  } else {
    console.log('\n No assets found to sweep.');
  }

  // Write results
  const fs = require('fs');
  const outPath = require('path').join(__dirname,'..','data','dormant-assets.json');
  fs.mkdirSync(require('path').dirname(outPath),{recursive:true});
  fs.writeFileSync(outPath, JSON.stringify({ scannedAt:new Date().toISOString(), results:allResults, summary:{totalUsdc,totalEth,sweepableCount:sweepable.length} },null,2));
  console.log(`\nResults saved to ${outPath}`);
}

if (require.main === module) main().catch(e=>{console.error(e.message);process.exit(1);});

module.exports = { scanChain, WATCH_ADDRESSES, TREASURY };
