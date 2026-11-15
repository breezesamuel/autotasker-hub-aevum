/**
 * trading-loop.js — v16: paper-first decision loop (cron / --once / --report).
 *
 * Every tick:
 *   1. SCAN     — zero-key public market data (CoinGecko → Binance fallback).
 *   2. THESIS   — build a momentum research probe (no execution).
 *   3. POLICY   — edge-calibration: blocked categories + confidence haircut.
 *   4. GATE     — edge-gate.evaluate (circuit breaker + discipline + Kelly).
 *   5. LEDGER   — journal.openThesis (paper) or journal.gateOut (kept for gate
 *                 calibration). NEVER a real order; no exchange keys exist.
 *   6. SETTLE   — open theses older than HOLD_HOURS are evaluated against the
 *                 plan (target +2R / stop −1R) using 24h high/low as an
 *                 approximation of since-open extremes (documented limitation).
 *
 * Honest math: this loop is a RESEARCH PROBE generator. It earns the right to
 * size up only through the forward-only record (Brier + expectancy net of
 * fees). Costs (feesR default 0.02R) are charged on every settle.
 */
'use strict';

const path = require('path');
const https = require('https');
const journal = require('../lib/trading-journal');
const edgeGate = require('../lib/edge-gate');
const calibration = require('../lib/edge-calibration');

const HOLD_HOURS = 24;
const FEES_R = 0.02;
const MOMENTUM_PROBE_PCT = 8;      // |24h change| threshold for a probe
const PROBE_CONFIDENCE = 0.4;      // deliberately humble — research probe
const RISK_PCT = 1;                // planned risk; gate may resize via Kelly

function httpsJSON(url, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const req = https.get({ hostname: new URL(url).hostname, path: new URL(url).pathname + new URL(url).search, rejectUnauthorized: false, timeout: timeoutMs || 12000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { if (!done) { done = true; try { resolve(JSON.parse(b)); } catch (e) { resolve(null); } } });
    });
    req.on('error', () => { if (!done) { done = true; resolve(null); } });
    req.on('timeout', () => { if (!done) { done = true; req.destroy(); resolve(null); } });
  });
}

/** zero-key market data: Gate.io (GFW-reachable) primary, then CoinGecko →
 *  Binance → OKX → Bybit fallbacks.
 *  NOTE: from a mainland-China ECS, CoinGecko/Binance/OKX/Bybit are all GFW-blocked,
 *  so Gate.io is the ONLY source that reliably returns data there — it MUST stay
 *  first. The `sources[]` array reports per-source reachability for ops.
 */
async function scan() {
  const sources = [];
  const trySource = (name, ok) => { sources.push({ name, ok: !!ok }); };

  // Gate.io — reachable from mainland China, no key, 2156 spot tickers
  const gate = await httpsJSON('https://api.gateio.ws/api/v4/spot/tickers');
  if (Array.isArray(gate) && gate.length) {
    const usdt = gate.filter(t => /_USDT$/.test(t.currency_pair) && !/_USDC$/.test(t.currency_pair));
    if (usdt.length) {
      trySource('gate', true);
      return {
        quotes: usdt
          .filter(t => Number(t.quote_volume) > 0)
          .sort((a, b) => Number(b.quote_volume) - Number(a.quote_volume)).slice(0, 20)
          .map(t => ({ id: t.currency_pair, symbol: t.currency_pair.replace(/_USDT$/, ''), price: Number(t.last), change24h: Number(t.change_percentage), high24h: Number(t.high_24h), low24h: Number(t.low_24h), source: 'gate' })),
        sources,
      };
    }
  }
  trySource('gate', false);

  const cg = await httpsJSON('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h');
  trySource('coingecko', Array.isArray(cg) && cg.length);
  if (Array.isArray(cg) && cg.length) {
    return {
      quotes: cg.map(c => ({ id: c.id, symbol: (c.symbol || '').toUpperCase(), price: Number(c.current_price), change24h: Number(c.price_change_percentage_24h), high24h: Number(c.high_24h), low24h: Number(c.low_24h), source: 'coingecko' })),
      sources,
    };
  }
  const bn = await httpsJSON('https://api.binance.com/api/v3/ticker/24hr');
  trySource('binance', Array.isArray(bn));
  if (Array.isArray(bn)) {
    return {
      quotes: bn.filter(t => /USDT$/.test(t.symbol) && !/(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol))
        .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume)).slice(0, 20)
        .map(t => ({ id: t.symbol, symbol: t.symbol.replace(/USDT$/, ''), price: Number(t.lastPrice), change24h: Number(t.priceChangePercent), high24h: Number(t.highPrice), low24h: Number(t.lowPrice), source: 'binance' })),
      sources,
    };
  }
  const okx = await httpsJSON('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
  trySource('okx', !!(okx && Array.isArray(okx.data)));
  if (okx && Array.isArray(okx.data)) {
    return {
      quotes: okx.data.filter(t => /-USDT$/.test(t.instId))
        .map(t => ({ id: t.instId, symbol: t.instId.replace(/-USDT$/, ''), price: Number(t.last), change24h: Number(t.open24h) ? (Number(t.last) - Number(t.open24h)) / Number(t.open24h) * 100 : 0, high24h: Number(t.high24h), low24h: Number(t.low24h), source: 'okx' }))
        .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 20),
      sources,
    };
  }
  const bb = await httpsJSON('https://api.bybit.com/v5/market/tickers?category=spot');
  trySource('bybit', !!(bb && bb.result && Array.isArray(bb.result.list)));
  if (bb && bb.result && Array.isArray(bb.result.list)) {
    return {
      quotes: bb.result.list.filter(t => /USDT$/.test(t.symbol) && Number(t.turnover24h) > 0)
        .sort((a, b) => Number(b.turnover24h) - Number(a.turnover24h)).slice(0, 20)
        .map(t => ({ id: t.symbol, symbol: t.symbol.replace(/USDT$/, ''), price: Number(t.lastPrice), change24h: Number(t.price24hPercent), high24h: Number(t.highPrice24h), low24h: Number(t.lowPrice24h), source: 'bybit' })),
      sources,
    };
  }
  return { quotes: [], sources };
}

function buildThesis(quote) {
  const side = quote.change24h > 0 ? 'long' : 'short';
  const dir = side === 'long' ? 1 : -1;
  const entry = quote.price;
  // plan: stop = 1 × (momentum vol proxy: |24h change|/4, floor 2%), target = 2R
  const stopPct = Math.max(2, Math.abs(quote.change24h) / 4);
  return {
    category: 'momentum-probe',
    asset: quote.symbol,
    side,
    confidence: PROBE_CONFIDENCE,
    thesis: (side === 'long' ? 'Continuation' : 'Fade') + ' probe: ' + quote.symbol + ' ' + quote.change24h.toFixed(1) + '% 24h, entry ' + entry + ', stop ' + stopPct.toFixed(1) + '% (-1R), target +2R, fees 0.02R. Data: ' + quote.source + '.',
    hasStop: true,
    plannedRiskPct: RISK_PCT,
    actualRiskPct: RISK_PCT,
    entryRef: entry,
    stopPct: +stopPct.toFixed(2),
    targetR: 2,
    feesR: FEES_R,
    quote,
  };
}

async function runOnce() {
  const t0 = Date.now();
  const scanOut = await scan();
  const quotes = scanOut.quotes || [];
  const out = { at: new Date().toISOString(), scanned: quotes.length, opened: [], gated: [], settled: [], skipped: null, sources: scanOut.sources };
  if (!quotes.length) { out.skipped = 'no market data reachable (all 4 sources failed from this network)'; return out; }

  // 6. settle matured open theses first (close before opening new risk)
  const open = journal.listOpen();
  for (const th of open) {
    if ((Date.now() - new Date(th.ts).getTime()) < HOLD_HOURS * 3600000) continue;
    const q = quotes.find(x => x.symbol === th.asset);
    if (!q || !Number.isFinite(q.price) || !Number.isFinite(q.high24h) || !Number.isFinite(q.low24h)) continue; // no valid data this tick — keep open, retry next
    const stopDist = (th.stopPct || 2) / 100 * th.entryRef;
    const target = th.entryRef + (th.side === 'long' ? 1 : -1) * th.targetR * stopDist;
    const stop = th.entryRef - (th.side === 'long' ? 1 : -1) * stopDist;
    const hi = th.side === 'long' ? q.high24h : q.low24h;   // favorable extreme
    const lo = th.side === 'long' ? q.low24h : q.high24h;   // adverse extreme
    let resultR, outcome;
    const hitTarget = th.side === 'long' ? hi >= target : lo <= target;
    const hitStop = th.side === 'long' ? lo <= stop : hi >= stop;
    if (hitStop && hitTarget) { outcome = 'loss'; resultR = -1; } // worst-case-first (fail-closed accounting)
    else if (hitTarget) { outcome = 'win'; resultR = th.targetR; }
    else if (hitStop) { outcome = 'loss'; resultR = -1; }
    else {
      // neither hit in window → mark-to-market at current price
      const move = (th.side === 'long' ? q.price - th.entryRef : th.entryRef - q.price);
      outcome = move >= 0 ? 'win' : 'loss';
      resultR = move / stopDist;
      if (outcome === 'win' && resultR <= 0) { outcome = 'loss'; resultR = -0.01; }
      if (outcome === 'loss' && resultR >= 0) { outcome = 'loss'; resultR = -0.01; }
    }
    resultR -= FEES_R;
    if (outcome === 'win' && resultR <= 0) { outcome = 'loss'; resultR = Math.min(resultR, -0.01); } // net-of-fees flip must flip the sign too
    const r = journal.closeThesis(th.id, { outcome, resultR, learnings: 'auto-settle after ' + HOLD_HOURS + 'h (24h extremes approximation)' });
    if (r.ok) out.settled.push({ id: th.id, asset: th.asset, outcome, resultR: r.thesis.resultR });
  }

  // 1-5: one probe per tick on the strongest mover (skip if asset already open — anti-correlation)
  const openAssets = new Set(journal.listOpen().map(t => t.asset));
  const top = quotes.slice().sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))[0];
  if (top && openAssets.has(top.symbol)) {
    out.skipped = 'strongest mover ' + top.symbol + ' already has an open thesis (no pyramiding)';
  } else if (top && Math.abs(top.change24h) >= MOMENTUM_PROBE_PCT) {
    const th = buildThesis(top);
    // policy: blocked categories + haircut
    const blocked = calibration.blockedCategories();
    const conf = calibration.haircutConfidence(th.category, th.confidence);
    th.confidence = conf;
    if (blocked.includes(th.category)) {
      journal.gateOut(th, 'BLOCKED', ['category in edge-policy blocked list (expectancy ≤ 0)']);
      out.gated.push({ asset: th.asset, decision: 'BLOCKED', why: 'blocked category' });
    } else {
      const stats = journal.categoryStats(th.category);
      const g = edgeGate.evaluate({
        thesis: th,
        account: journal.accountState(),
        regime: { blocked: false, label: 'unmanaged (paper loop)' },
        edge: { expectancyR: stats.expectancyR, sampleSize: stats.closed, winRate: stats.winRate, payoff: stats.payoff },
      });
      if (g.decision === 'ALLOWED') {
        th.actualRiskPct = Math.max(0.1, Math.min(g.sizing.riskPct, th.plannedRiskPct));
        const r = journal.openThesis(th);
        if (r.ok) out.opened.push({ id: r.thesis.id, asset: r.thesis.asset, side: r.thesis.side, riskPct: r.thesis.actualRiskPct, sizing: g.sizing.method });
        else out.gated.push({ asset: th.asset, decision: 'INVALID', why: r.reason });
      } else {
        journal.gateOut(th, g.decision, g.reasons);
        out.gated.push({ asset: th.asset, decision: g.decision, why: (g.reasons[0] || g.checks.filter(c => !c.pass).map(c => c.name).join(',')) });
      }
    }
  } else {
    out.skipped = 'no mover beyond ±' + MOMENTUM_PROBE_PCT + '% (top: ' + (top ? top.symbol + ' ' + top.change24h.toFixed(1) + '%' : 'n/a') + ')';
  }
  out.ms = Date.now() - t0;
  return out;
}

function reportText() {
  const r = journal.report();
  const lines = [];
  lines.push('== v16 paper trading report ==');
  lines.push('account: equity $' + r.account.equityUsd + ' / peak $' + r.account.peakEquityUsd + ' / maxDD ' + r.account.maxDrawdownPct + '%');
  lines.push('stats: opened=' + r.stats.opened + ' closed=' + r.stats.closed + ' gated-out=' + r.stats.gatedOut);
  for (const c of r.categories) {
    lines.push('  ' + c.category + ': closed=' + c.closed + ' winRate=' + (c.winRate == null ? 'n/a' : c.winRate) + ' payoff=' + (c.payoff == null ? 'n/a' : c.payoff) + ' expR=' + (c.expectancyR == null ? 'n/a' : c.expectancyR) + ' brier=' + (c.brier == null ? 'n/a' : c.brier));
  }
  for (const o of r.openTheses) lines.push('  open: ' + o.id + ' ' + o.asset + ' ' + o.side + ' risk ' + o.actualRiskPct + '%');
  return lines.join('\n');
}

module.exports = { runOnce, scan, buildThesis, reportText, HOLD_HOURS };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes('--report')) { console.log(reportText()); process.exit(0); }
  runOnce().then((out) => {
    console.log(JSON.stringify(out, null, 2));
    console.log('\n' + reportText());
  }).catch((e) => { console.error('loop failed:', String(e && e.message).slice(0, 120)); process.exit(1); });
}
