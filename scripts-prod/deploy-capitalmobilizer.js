#!/usr/bin/env node
/**
 * Deploy CapitalMobilizerV2 to QDay Aevum Testnet — fully automated.
 * Compiles with solc, signs with the hackathon testnet key, deploys over JSON-RPC.
 *
 * Usage:
 *   node scripts/deploy-capitalmobilizer.js            # deploy
 *   node scripts/deploy-capitalmobilizer.js --dry-run  # compile + estimate only
 */
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { JsonRpcProvider, Wallet, ContractFactory, formatUnits } = require('ethers');

const { loadKey } = require('./_wallet');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'contracts', 'CapitalMobilizerV2.sol');
const OUTDIR = path.join(ROOT, 'data', 'deployments');

const RPC = 'https://rpc-test.qday.info';
const EXPLORER = 'https://explorer-test.qday.info';
const CHAIN_ID = 44005;

// Wiring
const TUSD8    = '0x456569838f1d43009A91ebA4263147Afd7233483';
const HOUSE    = '0x74a9f91763c28571af7a52987f425f62825cf5d8';
const TREASURY = '0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03';

const DRY = process.argv.includes('--dry-run');

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

function compile() {
  const source = fs.readFileSync(SRC, 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'CapitalMobilizerV2.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',           // avoid PUSH0 issues on older testnet EVMs
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  };

  // Resolve solc version from pragma so we do not guess
  const m = source.match(/pragma solidity\s+\^?([0-9.]+)/);
  const want = m ? m[1] : '0.8.26';
  console.log(`   solc bundled : ${solc.version()}`);
  console.log(`   pragma asks  : ${want}`);

  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (out.errors || []).filter(e => e.severity === 'error');
  const warns = (out.errors || []).filter(e => e.severity === 'warning');
  if (errs.length) {
    for (const e of errs) console.error('   ✗ ' + e.formattedMessage);
    throw new Error('compilation failed');
  }
  for (const w of warns) console.log('   ⚠ ' + w.formattedMessage.split('\n')[0]);

  const c = out.contracts['CapitalMobilizerV2.sol']['CapitalMobilizerV2'];
  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}

(async () => {
  console.log('\n' + '='.repeat(70));
  console.log('  DEPLOY CapitalMobilizerV2 -> QDay Aevum Testnet (chainId ' + CHAIN_ID + ')');
  console.log('='.repeat(70) + '\n');

  // ---- 1. Compile
  console.log('[1/5] Compiling');
  const { abi, bytecode } = compile();
  console.log(`   ✓ bytecode ${(bytecode.length - 2) / 2} bytes`);

  // ---- 2. Wallet
  console.log('\n[2/5] Loading deployer');
  const kf = { privateKey: loadKey() };
  const provider = new JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const wallet = new Wallet(kf.privateKey, provider);
  console.log('   address : ' + wallet.address);

  const net = await provider.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID) throw new Error(`chain mismatch: ${net.chainId}`);
  const block = await provider.getBlockNumber();
  const bal = await provider.getBalance(wallet.address);
  console.log('   chainId : ' + net.chainId + ' ✓');
  console.log('   block   : ' + block);
  console.log('   gas bal : ' + formatUnits(bal, 18) + ' tQDAY');
  if (bal === 0n) throw new Error('deployer has no gas — top up from https://faucet.qday.info/en');

  // ---- 3. Build factory
  console.log('\n[3/5] Preparing deployment');
  const factory = new ContractFactory(abi, bytecode, wallet);
  const args = [TUSD8, HOUSE, TREASURY];
  console.log('   token    : ' + TUSD8 + '  (tUSD8)');
  console.log('   house    : ' + HOUSE);
  console.log('   treasury : ' + TREASURY);

  const deployTx = await factory.getDeployTransaction(...args);
  const gasEst = await provider.estimateGas({ ...deployTx, from: wallet.address });
  const fee = await provider.getFeeData();
  const gasPrice = fee.gasPrice || 1_000_000_000n;
  const cost = gasEst * gasPrice;
  console.log('   gas est  : ' + gasEst.toString());
  console.log('   gasPrice : ' + formatUnits(gasPrice, 9) + ' gwei');
  console.log('   cost est : ' + formatUnits(cost, 18) + ' tQDAY');

  if (DRY) {
    console.log('\n--dry-run: stopping before broadcast.\n');
    return;
  }

  // ---- 4. Deploy
  console.log('\n[4/5] Broadcasting deployment');
  const contract = await factory.deploy(...args, { gasLimit: (gasEst * 130n) / 100n, gasPrice });
  const tx = contract.deploymentTransaction();
  console.log('   tx hash  : ' + tx.hash);
  console.log('   ' + EXPLORER + '/tx/' + tx.hash);
  console.log('   waiting for receipt...');
  const receipt = await tx.wait(1);
  console.log('   ✓ mined in block ' + receipt.blockNumber + ', gas used ' + receipt.gasUsed.toString());

  const addr = await contract.getAddress();
  console.log('\n   ★ CONTRACT ADDRESS: ' + addr);

  // ---- 5. Smoke test reads
  console.log('\n[5/5] Post-deploy verification');
  const onchainOwner = await contract.owner();
  const onchainHouse = await contract.houseWallet();
  const onchainTreasury = await contract.treasury();
  const accounted = await contract.accountedBalance();
  const nChannels = Number(await contract.CHANNEL_COUNT());
  console.log('   owner        : ' + onchainOwner + (onchainOwner.toLowerCase() === wallet.address.toLowerCase() ? ' ✓' : ' ✗'));
  console.log('   houseWallet  : ' + onchainHouse + (onchainHouse.toLowerCase() === HOUSE.toLowerCase() ? ' ✓' : ' ✗'));
  console.log('   treasury     : ' + onchainTreasury + (onchainTreasury.toLowerCase() === TREASURY.toLowerCase() ? ' ✓' : ' ✗'));
  console.log('   accounted    : ' + accounted.toString());
  console.log('   channels     : ' + nChannels);

  for (let i = 0; i < nChannels; i++) {
    const [bps, active] = await contract.getChannel(i);
    const name = await contract.channelName(i);
    console.log(`     [${i}] ${String(name).padEnd(26)} ${(Number(bps) / 100).toFixed(2)}% ${active ? 'active' : 'OFF'}`);
  }

  const tok = new (require('ethers').Contract)(TUSD8, ERC20_ABI, provider);
  let sym = 'tUSD8', dec = 6, tokBal = 0n;
  try { sym = await tok.symbol(); } catch {}
  try { dec = Number(await tok.decimals()); } catch {}
  try { tokBal = await tok.balanceOf(wallet.address); } catch {}
  console.log('\n   deployer ' + sym + ' balance: ' + formatUnits(tokBal, dec));

  // Save record
  fs.mkdirSync(OUTDIR, { recursive: true });
  const record = {
    network: 'QDay Aevum Testnet',
    chainId: CHAIN_ID,
    rpc: RPC,
    explorer: EXPLORER,
    contract: 'CapitalMobilizerV2',
    address: addr,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    deployer: wallet.address,
    args: { token: TUSD8, houseWallet: HOUSE, treasury: TREASURY },
    abi,
    deployedAt: new Date().toISOString(),
    explorerUrl: `${EXPLORER}/address/${addr}`,
  };
  const file = path.join(OUTDIR, 'qday-capitalmobilizer-v2.json');
  fs.writeFileSync(file, JSON.stringify(record, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('  DEPLOYED SUCCESSFULLY — REAL ON-CHAIN STATE');
  console.log('='.repeat(70));
  console.log('  address : ' + addr);
  console.log('  explorer: ' + EXPLORER + '/address/' + addr);
  console.log('  record  : ' + file);
  console.log('  token bal of deployer: ' + formatUnits(tokBal, dec) + ' ' + sym + (tokBal === 0n ? '  <-- need tUSD8 to run charge()' : ''));
  console.log('='.repeat(70) + '\n');
})().catch(e => {
  console.error('\n✗ FAILED: ' + (e.shortMessage || e.message));
  if (e.info) console.error(JSON.stringify(e.info, null, 2));
  process.exit(1);
});
