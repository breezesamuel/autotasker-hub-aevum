/**
 * yield-scan.js — real, live yield data for the treasury's "60% compound" bucket.
 *
 * Reads DefiLlama's public yields feed (no key, no cost) and keeps only pools that
 * are actually credible for a small USDC book on Base:
 *   - chain: Base
 *   - single-asset exposure (no impermanent loss / LP risk)
 *   - stablecoin only
 *   - TVL >= MIN_TVL
 *   - APY >= MIN_APY
 *
 * Nothing here is invented: every APY/tvl number comes from the feed at run time.
 * Output: data/yield-candidates.json  (+ a printable table)
 *
 * Usage: node scripts/yield-scan.js [--min-apy 5] [--min-tvl 5000000] [--chain Base]
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function arg(name, dflt) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const MIN_APY = Number(arg('min-apy', '5'));
const MIN_TVL = Number(arg('min-tvl', '5000000'));
const CHAIN = arg('chain', 'Base');

const OUT = path.resolve(__dirname, '..', 'data', 'yield-candidates.json');

(async () => {
  const res = await fetch('https://yields.llama.fi/pools', { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('yields feed HTTP ' + res.status);
  const body = await res.json();
  const pools = body.data || [];

  const rows = pools
    .filter((p) => p.chain === CHAIN)
    .filter((p) => p.stablecoin === true)
    .filter((p) => (p.exposure || '') === 'single')
    .filter((p) => Number(p.tvlUsd) >= MIN_TVL)
    .filter((p) => Number(p.apy) >= MIN_APY)
    .filter((p) => typeof p.symbol === 'string' && /usdc/i.test(p.symbol))
    .map((p) => ({
      project: p.project,
      pool: p.pool,
      symbol: p.symbol,
      apy: Number(Number(p.apy).toFixed(2)),
      apyBase: p.apyBase == null ? null : Number(Number(p.apyBase).toFixed(2)),
      apyReward: p.apyReward == null ? null : Number(Number(p.apyReward).toFixed(2)),
      tvlUsd: Math.round(Number(p.tvlUsd)),
      ilRisk: p.ilRisk || null,
      stablecoin: p.stablecoin,
      exposure: p.exposure,
      rewardTokens: (p.rewardTokens || []).length,
      outlier: !!p.outlier,
      predictions: p.predictions || null,
    }))
    .filter((p) => !p.outlier)
    .sort((a, b) => b.apy - a.apy);

  const payload = {
    fetchedAt: new Date().toISOString(),
    source: 'https://yields.llama.fi/pools',
    filters: { chain: CHAIN, minApy: MIN_APY, minTvlUsd: MIN_TVL, singleAsset: true, stablecoin: true },
    note: 'APY is variable and can change or fall to zero; TVL is pool size, not a safety guarantee. Reward-APY is token emissions, not cash.',
    count: rows.length,
    pools: rows,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));

  console.log(`Base · USDC · single-asset · stablecoin · TVL>=$${MIN_TVL.toLocaleString()} · APY>=${MIN_APY}%`);
  console.log(`fetched ${new Date().toISOString()}  pools=${rows.length}`);
  console.log('');
  const head = ['APY%', 'base%', 'reward%', 'TVL $M', 'project', 'symbol'];
  const w = [6, 6, 8, 7, 22, 18];
  console.log(head.map((h, i) => h.padEnd(w[i])).join(''));
  for (const p of rows.slice(0, 25)) {
    const cols = [
      p.apy.toFixed(2),
      p.apyBase == null ? '-' : p.apyBase.toFixed(2),
      p.apyReward == null ? '-' : p.apyReward.toFixed(2),
      (p.tvlUsd / 1e6).toFixed(1),
      p.project,
      p.symbol,
    ];
    console.log(cols.map((c, i) => String(c).padEnd(w[i])).join(''));
  }
  console.log('');
  console.log('saved -> ' + OUT);
})().catch((e) => {
  console.error('FAILED: ' + e.message);
  process.exit(1);
});
