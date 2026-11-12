#!/usr/bin/env node
/**
 * P1 — DEMO VIDEO PREP
 * Generates a complete shot list with timestamps, screen content, and narration
 * that you can follow while recording. This replaces manual planning with a
 * production-ready script.
 */
const fs = require('fs');
const path = require('path');
const b = require('../data/deployments/float-velocity-benchmark.json');
const r = b.reconciled;
const d = require('../data/deployments/qday-capitalmobilizer-v2.json');
const usd6 = v => Number(require('ethers').formatUnits(BigInt(v), 6)).toFixed(2);

const ROOT = __dirname + '/..';

const shots = [
  {
    time: '0:00–0:15',
    screen: 'Vercel landing page: https://autotasker-hub.vercel.app',
    action: 'Open browser, show hero section with live stats',
    narrate: `"AutoTasker Hub is a machine-payable data marketplace built on x402. Real settlements, real splits, all verifiable on chain."`,
    note: 'Already deployed at autotasker-hub.vercel.app'
  },
  {
    time: '0:15–0:35',
    screen: 'Terminal: curl free sample endpoint',
    action: 'Run: curl https://autotasker-hub.vercel.app/api/x402/sample?limit=3',
    narrate: `"This is the free sample endpoint — no payment required. Real China public market data, returned instantly."`,
    note: 'Shows the API works without payment'
  },
  {
    time: '0:35–1:00',
    screen: 'Terminal: curl paid endpoint (gets 402)',
    action: 'Run: curl https://autotasker-hub.vercel.app/api/x402/hotlist',
    narrate: `"Now hit the paid endpoint. We get a 402 Payment Required, and inside accepts[0] you see three things named in three places: the facilitator, the asset tUSD8, the amount. That triple-naming is an x402 requirement."`,
    note: 'Facilitator must appear in root, accepts[0].facilitator, accepts[0].extra.facilitator'
  },
  {
    time: '1:00–1:25',
    screen: 'Block explorer: contract address',
    action: 'Navigate to https://explorer-test.qday.info/address/0xDf75267820b1Cc631723bB00da97e7642518e917',
    narrate: `"The settlement layer is CapitalMobilizerV2, deployed on QDay Aevum testnet. It's not a simulation — every number here is a real transaction hash you can click into."`,
    note: 'Contract address: 0xDf752678...8e917'
  },
  {
    time: '1:25–1:55',
    screen: 'Block explorer: batch transaction detail',
    action: 'Click into tx 0xc04c1631... (the 10-payment batch), point out gas per payment',
    narrate: `"A single charge costs about 221k gas. But batch ten charges into one transaction and it drops to 23,745 gas per payment. At one gwei that fraction of a cent makes sub-five-cent API pricing actually viable."`,
    note: 'Batch tx: 0xc04c16314286a30d985d8d45a59ad8f3e0eff73398c70ef4c9be9e279175509a'
  },
  {
    time: '1:55–2:20',
    screen: 'Terminal: show float-velocity benchmark record',
    action: 'cat data/deployments/float-velocity-benchmark.json | head -50',
    narrate: `"Here's the proof: 988 real settlements on official tUSD8. Same 47.95 token carried eight hundred five dollars gross. System float conserved at one hundred percent because gas is paid in tQDAY, not in the settlement token. And every single transaction passes the invariant check."`,
    note: 'Key numbers: 988 payments, $805.40 gross, 16.8x velocity, 100% conserved'
  },
  {
    time: '2:20–2:45',
    screen: 'Terminal: run commission-proof or wallet status',
    action: 'node scripts/float-status.js',
    narrate: `"Three ledgers, three destinations. House wallet received zero point six eight zero five eight. Referrer received zero point zero seven five six two. Treasury received zero point zero zero three eight. And the router balance is exactly zero because everything that came in was paid out."`,
    note: 'Runs float-status.js showing real balances'
  },
  {
    time: '2:45–3:10',
    screen: 'GitHub: docs/CAPITAL-POLICY.md or docs/ONCHAIN-EVIDENCE.md',
    action: 'Scroll to the realized revenue = $0 line',
    narrate: `"One honest line in the documentation: realized revenue is zero dollars. tUSD8 has no market value. What we proved is the rail works and the arithmetic is exact. That's the difference between a hackathon project and a product."`,
    note: 'Critical honesty moment — builds judge trust'
  },
  {
    time: '3:10–3:30',
    screen: 'Quick scroll through GitHub repo structure',
    action: 'Show README.md top section with real contract address',
    narrate: `"Everything is reproduced from the repo. Anyone can clone, deploy against their own token, and verify the same split arithmetic. The deployment guide takes about one command."`,
    note: 'Shows reproducibility and open-source credibility'
  },
  {
    time: '3:30–3:45',
    screen: 'Back to Vercel landing page or DoraHacks submission form',
    action: 'Final shot of the live site',
    narrate: `"Machine pays, provider gets paid in the same transaction, platform and referrer shares are provable on chain, and the whole thing costs a fraction of a cent per sale. This is what machine-payable infrastructure looks like."`,
    note: 'Close with the pitch one-liner'
  },
];

// Write shot list
const shotLines = shots.map(s =>
  `[${s.time}] ${s.screen}\n  Action: ${s.action}\n  Narration: "${s.narrate}"\n  Note: ${s.note}\n`
).join('\n');

const fullScript = `# AutoTasker Hub — Demo Video Script
# Total runtime target: ~3:45
# Generate with: node scripts/p1-demo-video-prep.js

## How to use this script
1. Open OBS or your preferred screen recorder
2. Switch to each screen location at the timestamp shown
3. Read the narration line aloud (or use TTS)
4. Keep camera off or use a simple facecam inset if desired

## Shot List
${shotLines}
## Technical requirements
- MetaMask set to QDay Aevum testnet (chainId 44005) before recording
- Terminal open in the project root
- Browser tabs pre-opened to:
  - https://autotasker-hub.vercel.app
  - https://explorer-test.qday.info/address/0xDf75267820b1Cc631723bB00da97e7642518e917
- Node scripts pre-installed: npm install (once)
- The .env with QDAY_PRIVATE_KEY set to the testnet deployer key

## Tips
- Do NOT rush the 402 response reveal — let the terminal output read clearly
- When showing the float-conservation number, pause for 2 seconds
- The "realized revenue is zero" line is the most important honesty moment — say it slowly
- Export as MP4, target size under 100 MB for DoraHacks upload
`.trim();

fs.writeFileSync(path.join(ROOT, 'data', 'recon', 'demo-video-script.txt'), fullScript);
fs.writeFileSync(path.join(ROOT, 'data', 'recon', 'demo-shot-list.json'), JSON.stringify({ shots, totalRuntimeSec: 225, targetRuntimeMin: 3.75 }, null, 2));

console.log('\n' + '='.repeat(74));
console.log('  P1 — DEMO VIDEO SCRIPT GENERATED');
console.log('='.repeat(74));
console.log('\nShot count:', shots.length);
console.log('Target runtime:', Math.round(shots.length * 225 / shots.length / 60 * 10) / 10, 'minutes');
console.log('Output files:');
console.log('  data/recon/demo-video-script.txt   — full narration script');
console.log('  data/recon/demo-shot-list.json     — structured shot list (for future automation)');
console.log('\nTo record: open the .txt file and follow each shot at its timestamp.\n');
console.log('The script is designed to run both the Superteam Earn bounty AND the');
console.log('Aevum Challenge submission with the same footage.\n');

process.exit(0);
