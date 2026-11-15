/** test-v12.js — local smoke test for games engine + solana scanner */
process.env.NODE_ENV = process.env.NODE_ENV || 'dev';
const games = require('../lib/games-engine');
const pi = require('../lib/payment-integration');

(async () => {
  // 1. catalog
  const cat = games.getCatalog();
  console.log('games:', cat.games.length, 'seedHash:', cat.currentSeedHash.slice(0, 12) + '…');

  // 2. play guess-number
  const r1 = games.play('guess-number', '0xTestWallet000000000000000000000000000001', { clientSeed: 'v12test', guess: 7 });
  console.log('play:', r1.ok, 'won:', r1.won, 'points:', r1.playerPoints, 'proof:', !!r1.fairness);

  // 3. play daily-spin
  const r2 = games.play('daily-spin', '0xTestWallet000000000000000000000000000001', { clientSeed: 'v12test' });
  console.log('spin:', r2.ok, 'awarded:', r2.pointsAwarded);

  // 4. cooldown enforcement
  const r3 = games.play('daily-spin', '0xTestWallet000000000000000000000000000001', { clientSeed: 'v12test' });
  console.log('spin-cooldown-blocked:', r3.ok === false && r3.reason === 'cooldown');

  // 5. verify round
  const v = games.verify(r1.playId);
  console.log('verify:', v.ok, 'verdict:', v.verdict, 'hashOk:', v.seedHashMatches, 'hmacOk:', v.hmacMatches);

  // 6. leaderboard
  const lb = games.leaderboard(5);
  console.log('leaderboard entries:', lb.leaderboard.length);

  // 7. solana status
  const ss = pi.getSolanaStatus();
  console.log('solana status:', ss.mode, ss.rpc);

  // 8. solana live scan (a known active address — Binance hot wallet)
  try {
    const scan = await pi.scanSolanaAssets(['5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9']);
    console.log('solana scan ok:', scan.ok, 'sol:', scan.summary ? scan.summary.totalSol.toFixed(4) : '?', 'usdc:', scan.summary ? scan.summary.totalUsdc.toFixed(2) : '?');
  } catch (e) { console.log('solana scan err:', e.message); }

  // 9. dormant assets real data
  const dorm = pi.findDormantAssets();
  console.log('dormant:', dorm.status, 'totals:', JSON.stringify(dorm.totals));

  // 10. payment-integration still exports old API (backward compat)
  console.log('exports ok:', typeof pi.playGame === 'function', typeof pi.getTonGames === 'function');
})();
