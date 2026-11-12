#!/usr/bin/env node
/**
 * Record/verify an already-deployed CapitalMobilizerV2 without broadcasting.
 *
 * node scripts/record-deployment.js --address=0x... --tx=0x... --block=123 --token=0x...
 */
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { JsonRpcProvider, Wallet, Contract, formatUnits } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'contracts', 'CapitalMobilizerV2.sol');
const { loadKey } = require('./_wallet');
const OUTDIR = path.join(ROOT, 'data', 'deployments');

const RPC = 'https://rpc-test.qday.info';
const CHAIN = 44005;

const arg = (k, d) => {
  const hit = process.argv.find(a => a.startsWith('--' + k + '='));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

function compile() {
  const source = fs.readFileSync(SRC, 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'CapitalMobilizerV2.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      outputSelection: { '*': { '*': ['abi'] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (out.errors || []).filter(e => e.severity === 'error');
  if (errs.length) throw new Error('compile failed');
  return out.contracts['CapitalMobilizerV2.sol']['CapitalMobilizerV2'].abi;
}

(async () => {
  const address = arg('address');
  if (!address) throw new Error('--address is required');

  const provider = new JsonRpcProvider(RPC, CHAIN, { staticNetwork: true });
  const kf = { privateKey: loadKey() };
  const wallet = new Wallet(kf.privateKey, provider);
  const abi = compile();
  const c = new Contract(address, abi, wallet);

  const code = await provider.getCode(address);
  if (code === '0x') throw new Error('no contract at ' + address);

  console.log('address      :', address);
  console.log('bytecode size:', (code.length - 2) / 2, 'bytes');
  console.log('owner        :', await c.owner());
  console.log('houseWallet  :', await c.houseWallet());
  console.log('treasury     :', await c.treasury());
  console.log('token        :', await c.token());
  console.log('accounted    :', (await c.accountedBalance()).toString());
  console.log('channels     :');
  const n = Number(await c.CHANNEL_COUNT());
  for (let i = 0; i < n; i++) {
    const [bps, active] = await c.getChannel(i);
    console.log(`  [${i}] ${String(await c.channelName(i)).padEnd(26)} ${(Number(bps) / 100).toFixed(2)}% ${active ? 'active' : 'OFF'}`);
  }
  const gs = await c.globalStats();
  console.log('globalStats  : ops=' + gs.ops + ' gross=' + formatUnits(gs.gross, 6) + ' commission=' + formatUnits(gs.commission, 6));

  const record = {
    network: 'QDay Aevum Testnet',
    chainId: CHAIN,
    rpc: RPC,
    explorer: 'https://explorer-test.qday.info',
    contract: 'CapitalMobilizerV2',
    canonical: true,
    address,
    txHash: arg('tx', null),
    blockNumber: Number(arg('block', 0)) || null,
    token: await c.token(),
    houseWallet: await c.houseWallet(),
    treasury: await c.treasury(),
    owner: await c.owner(),
    abi,
    deployedAt: new Date().toISOString(),
    explorerUrl: 'https://explorer-test.qday.info/address/' + address,
  };
  fs.mkdirSync(OUTDIR, { recursive: true });
  const file = path.join(OUTDIR, 'qday-capitalmobilizer-v2.json');
  fs.writeFileSync(file, JSON.stringify(record, null, 2));
  console.log('\nrecord saved:', file);
})().catch(e => { console.error('FAILED:', e.shortMessage || e.message); process.exit(1); });
