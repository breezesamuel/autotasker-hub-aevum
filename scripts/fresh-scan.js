const { ethers } = require('ethers');

// Use multiple free RPCs with fallback
const rpcs = [
  'https://base.publicnode.com',
  'https://mainnet.base.org',
  'https://base.blockpi.network/v1/rpc/public',
];

const provider = new ethers.JsonRpcProvider(rpcs[0], { chainId: 8453, name: 'base' });

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TREASURY = '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';
const HOT_WALLET = '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03';
const GENESIS = '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38';
const LEGACY = '0xFC24FD34da9e49A0110DCaEe3Ad30eC54175eBB3';
const POISON = '0x20667da73222867b61f2940be40baeaccd5cb865';
const RECV1 = '0xab1fda930d4f35085d471cc78c61fbfdaca37b37';  // $128 recipient
const RECV2 = '0xbd16b985685a09b11c7ccc0d2d2e820a0f774286';  // $36 recipient

async function ethBal(addr) {
  return (await provider.getBalance(addr)).toString();
}
async function usdcBal(addr) {
  const data = '0x70a08231' + addr.slice(2).padStart(64, '0');
  const r = await provider.call({ to: USDC, data });
  if (r === '0x' || r.length < 66) return '0';
  return BigInt(r).toString();
}

async function main() {
  console.log('=== FRESH BALANCE SCAN (using base.publicnode.com) ===\n');
  const targets = [
    ['TREASURY (目标)',   TREASURY],
    ['HOT WALLET',        HOT_WALLET],
    ['GENESIS (身份)',    GENESIS],
    ['LEGACY',            LEGACY],
    ['RECV #1 ($128)',    RECV1],
    ['RECV #2 ($36)',     RECV2],
    ['POISON ADDR',       POISON],
  ];
  for (const [label, addr] of targets) {
    try {
      const [eb, ub] = await Promise.all([ethBal(addr), usdcBal(addr)]);
      const ethVal = (Number(eb) / 1e18).toFixed(6);
      const usdcVal = (Number(ub) / 1e6).toFixed(4);
      console.log(`${label.padEnd(22)} ETH=${ethVal.padStart(10)}  USDC=$${usdcVal}`);
    } catch (e) {
      console.log(`${label.padEnd(22)} ERROR: ${e.message.slice(0, 60)}`);
    }
  }

  // Check if poison address has any outgoing txs (to see if funds can be moved)
  console.log('\n=== POISON ADDRESS ANALYSIS ===');
  try {
    const poisonCode = await provider.getCode(POISON);
    console.log(`Poison addr code size: ${poisonCode.length / 2} bytes (${poisonCode.length === 2 ? 'EOA' : 'CONTRACT'})`);
    const poisonTxs = await provider.getTransactionCount(POISON, 'latest');
    console.log(`Poison nonce (tx count): ${poisonTxs}`);
    // Try checking last few blocks for transfers FROM poison
    const latest = await provider.getBlockNumber();
    let foundOut = false;
    for (let i = 0; i < 5 && !foundOut; i++) {
      const block = await provider.getBlock(latest - i * 1000, true);
      if (!block) continue;
      for (const tx of block.transactions) {
        if (tx.from?.toLowerCase() === POISON.toLowerCase()) {
          console.log(`Found outbound from poison: ${tx.hash} to ${tx.to}`);
          foundOut = true;
          break;
        }
      }
    }
    if (!foundOut) console.log('No recent outbound txs from poison address found.');
  } catch (e) {
    console.log('Error checking poison addr:', e.message.slice(0, 100));
  }

  // Sweepable total
  const hotUsdc = Number(await usdcBal(HOT_WALLET)) / 1e6;
  const genUsdc = Number(await usdcBal(GENESIS)) / 1e6;
  const legUsdc = Number(await usdcBal(LEGACY)) / 1e6;
  const totalSweepable = hotUsdc + genUsdc + legUsdc;
  console.log(`\n=== SWEEPABLE TOTAL ===`);
  console.log(`Hot wallet:    $${hotUsdc.toFixed(4)}`);
  console.log(`Genesis:       $${genUsdc.toFixed(4)}`);
  console.log(`Legacy:        $${legUsdc.toFixed(4)}`);
  console.log(`Total to sweep: $${totalSweepable.toFixed(4)} USDC`);
}

main().catch(console.error);
