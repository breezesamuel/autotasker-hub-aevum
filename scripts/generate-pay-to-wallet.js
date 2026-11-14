const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Generate fresh EOA wallet for dedicated x402 revenue collection
const wallet = ethers.Wallet.createRandom();
const record = {
  address: wallet.address,
  createdAt: new Date().toISOString(),
  purpose: 'Dedicated x402 revenue collector — replaces legacy treasury 0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03',
  note: [
    'Generate this wallet locally only.',
    'Transfer remaining USDC ($35.24) + ETH (0.058) from treasury 0x367F... via MetaMask/Ledger.',
    'Then update Vercel env vars:',
    '  npx vercel env add --scope solmount --project autotasker-hub PAY_TO ' + wallet.address + ' --type secret',
    '  npx vercel env add --scope solmount --project autotasker-hub RELAYER_PRIVATE_KEY',
    '  (RELAYER_PRIVATE_KEY value is in config/keys/x402-wallet.json)',
    '  npx vercel env add --scope solmount --project autotasker-hub PUBLIC_URL https://your-domain.com',
    'Then redeploy: npx vercel --prod',
  ].join('\n'),
  privateKey: wallet.privateKey, // NEVER commit this file
};

const keyFile = path.resolve(__dirname, '..', 'config', 'keys', 'pay-to-new.json');
fs.mkdirSync(path.dirname(keyFile), { recursive: true });
fs.writeFileSync(keyFile, JSON.stringify(record, null, 2), 'utf8');

console.log(`Generated new revenue wallet`);
console.log(`  Address : ${wallet.address}`);
console.log(`  Created : ${record.createdAt}`);
console.log(`  Key file: ${keyFile.replace(process.cwd(), '')}`);
console.log(``);
console.log(`  PRIVATE KEY IS STORED LOCALLY ONLY (gitignored via config/keys/*.json)`);
console.log(`  DO NOT share this file or commit it.`);
console.log(``);
console.log(`Next: move $35.24 USDC from old treasury (0x367F...) to this address using MetaMask,`);
console.log(`      then update Vercel PAY_TO env var and redeploy.`);
