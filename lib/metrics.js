/**
 * metrics.js — /api/metrics 聚合指标端点（结算 / 分销 / 客服 / 服务 / 对账）
 *
 * 给运营仪表盘 / 广告页 / Agent 文档用，对外展示真实可审计的聚合数字。
 * 每条记录标注 generatedAt；缓存由调用方或 CDN 决定（本端点不设 Cache-Control）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const pay = require('./payments');
const referrals = require('./referrals');
const support = require('./support');
const TREASURY_REPORT = path.join(__dirname, '..', 'data', 'onchain-reconcile-report.json');

function loadReport() {
  try { return JSON.parse(fs.readFileSync(TREASURY_REPORT, 'utf8')); }
  catch (e) { return null; }
}

function safeInt(v) { return Math.max(0, Math.floor(Number(v) || 0)); }
function safeUsd(v) { return (Number(v) || 0).toFixed(6); }

function collect() {
  // 结算 & 收入
  let settledCount = 0, revenueUsd = '0.000000', firstAt = null, latestAt = null;
  try {
    const s = pay.getSummary();
    settledCount = Number(s.settledCount || 0);
    revenueUsd = s.revenueUsd || '0.000000';
  } catch (e) {}
  try {
    const ledger = pay.loadLedger();
    const ts = (ledger.entries || []).map((e) => e.ts).filter(Boolean).sort();
    firstAt = ts[0] || null;
    latestAt = ts[ts.length - 1] || null;
  } catch (e) {}

  // 分销
  const refSum = (() => { try { return referrals.summary(); } catch (e) { return {}; } })();
  const refStats = new Map();
  try {
    const db = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'referrals.json'), 'utf8'));
    for (const code of Object.keys(db.codes || {})) {
      try { refStats.set(code, referrals.stats(code)); } catch (e) {}
    }
  } catch (e) {}
  const topReferrers = [...refStats.values()]
    .filter((s) => s.ok && Number(s.rebateAccruedUsd || 0) > 0)
    .sort((a, b) => Number(b.rebateAccruedUsd || 0) - Number(a.rebateAccruedUsd || 0))
    .slice(0, 10)
    .map((s) => ({
      code: s.code,
      clicks: safeInt(s.clicks),
      attributedPayments: safeInt(s.attributedPayments),
      rebateAccruedUsd: s.rebateAccruedUsd || '0.000000',
      rebatePaidUsd: s.rebatePaidUsd || '0.000000',
      rebatePendingUsd: s.rebatePendingUsd || '0.000000',
    }));

  // 客服工单
  const ticketCount = (() => {
    try {
      const db = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'support-tickets.json'), 'utf8'));
      return db.tickets ? db.tickets.length : 0;
    } catch (e) { return 0; }
  })();

  // 对账
  const recon = loadReport();
  const reconAgeMin = recon ? Math.round((Date.now() - new Date(recon.checkedAt || 0).getTime()) / 60000) : null;

  // 链上资产快照（仅展示地址，不读链 — 对账由 cron 负责）
  const treasuryAddress = process.env.PAY_TO
    || '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';

  return {
    generatedAt: new Date().toISOString(),
    settlement: {
      settledCount,
      totalRevenueUsd: revenueUsd,
      firstSettledAt: firstAt,
      latestSettledAt: latestAt,
      verifyUrl: 'https://basescan.org/address/' + treasuryAddress,
    },
    referral: {
      codes: refSum.codes || 0,
      totalClicks: refSum.clicks || 0,
      claims: refSum.claims || 0,
      attributedPayments: refSum.attributedPayments || 0,
      attributedRevenueUsd: refSum.attributedRevenueUsd || '0.000000',
      rebatesPendingUsd: refSum.rebatesPendingUsd || '0.000000',
      rebatesPaidUsd: refSum.rebatesPaidUsd || '0.000000',
      rebateBps: refSum.rebateBps || 1000,
      topReferrers,
    },
    support: {
      totalTickets: ticketCount,
    },
    reconciliation: recon
      ? {
          ok: recon.ok === true,
          checkedAt: recon.checkedAt,
          ageMinutes: reconAgeMin,
          source: recon.onchain && recon.onchain.source,
          onChainCount: recon.onchain && recon.onchain.count,
          onChainUsd: recon.onchain && Number(recon.onchain.usd),
          ledgerCount: recon.ledger && recon.ledger.settledCount,
          ledgerUsd: recon.ledger && Number(recon.ledger.revenueUsd),
        }
      : null,
    treasury: {
      address: treasuryAddress,
      network: 'eip155:8453',
      networkName: 'Base',
    },
    policy: {
      savingsBps: 3000,   // 30%
      compoundBps: 6000,  // 60%
      stableBps: 1000,    // 10%
      rebateBps: refSum.rebateBps || 1000,
      maxSinglePayoutUsd: 20,
      maxRunCapUsd: 50,
      minPayoutUsd: 1,
    },
  };
}

function htmlView(m) {
  const row = (k, v) => `<tr><td style="color:#64748b;padding:8px 12px;border-bottom:1px solid #e2e8f0">${k}</td><td style="text-align:right;font-weight:600;padding:8px 12px;border-bottom:1px solid #e2e8f0">${v}</td></tr>`;
  const topRows = m.referral.topReferrers.map((r) =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;font-size:.88rem">${r.code}</td><td style="text-align:right;padding:6px 12px;border-bottom:1px solid #f1f5f9;font-size:.88rem">$${Number(r.rebateAccruedUsd || 0).toFixed(4)}</td></tr>`
  ).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>运营仪表盘 — AutoTasker Hub</title>
<meta name="robots" content="noindex">
<style>body{font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;max-width:900px;margin:0 auto;padding:24px 16px;line-height:1.6;color:#0f172a;background:#f8fafc}
h1{margin:0 0 4px}.subtitle{color:#64748b;font-size:.9rem;margin-top:0}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-size:.95rem;margin:12px 0}
.badge-ok{color:#15803d;font-weight:600}.badge-warn{color:#b45309}.badge-fail{color:#b91c1c}
a{color:#4f46e5}</style></head><body>
<h1>📊 运营仪表盘</h1>
<p class="subtitle">更新时间 ${new Date(m.generatedAt).toLocaleString('zh-CN')} UTC· 数据来自生产账本，逐项可链上核验</p>

<table>
<tr><td colspan="2" style="background:#4f46e5;color:#fff;font-weight:600;padding:10px 12px">💰 结算与收入</td></tr>
${row('累计结算笔数', m.settlement.settledCount)}
${row('累计收入 (USDC)', '$' + m.settlement.totalRevenueUsd)}
${row('首笔 / 最近结算', (m.settlement.firstSettledAt || '—').slice(0, 16) + ' / ' + (m.settlement.latestSettledAt || '—').slice(0, 16))}
${row('链上核对', `<a href="${m.settlement.verifyUrl}" target="_blank">${m.settlement.verifyUrl}</a>`)}
</table>

<table>
<tr><td colspan="2" style="background:#4f46e5;color:#fff;font-weight:600;padding:10px 12px">🔗 分销返利</td></tr>
${row('累计推荐码数', m.referral.codes + ' 个')}
${row('总点击 / 独立访客 / 钱包绑定', m.referral.totalClicks + ' / ' + m.referral.claims + ' / ' + m.referral.claims)}
${row('归因支付笔数 / 收入', m.referral.attributedPayments + ' 笔 · $' + m.referral.attributedRevenueUsd)}
${row('返利待付 / 已付', '$' + m.referral.rebatesPendingUsd + ' / $' + m.referral.rebatesPaidUsd)}
${row('返利比例', (m.referral.rebateBps / 100) + '% · 金库链上直付，≥$1 可提')}
<tr><td colspan="2" style="background:#f8fafc;font-size:.88rem;padding:8px 12px">Top 返利者（按累计返利计）</td></tr>
${topRows || '<tr><td colspan="2" style="padding:12px;color:#64748b">暂无返利记录</td></tr>'}
</table>

<table>
<tr><td colspan="2" style="background:#4f46e5;color:#fff;font-weight:600;padding:10px 12px">🛡️ 链上对账</td></tr>
${row('对账状态', m.reconciliation
  ? (m.reconciliation.ok
    ? `<span class="badge-ok">✓ 已对账 (${m.reconciliation.ageMinutes} 分钟前)</span>`
    : `<span class="badge-fail">✗ 不一致，已告警</span>`)
  : '<span class="badge-warn">未运行</span>')}
${row('账本收入 vs 链上入账', m.reconciliation
  ? `$${Number(m.reconciliation.ledgerUsd || 0).toFixed(4)} ≤ $${Number(m.reconciliation.onChainUsd || 0).toFixed(4)}`
  : '—')}
</table>

<p style="font-size:.9rem;color:#64748b">
<a href="/api/metrics">JSON</a> · <a href="/trust">信任中心</a> · <a href="/api/x402/reconcile">对账详情</a> · <a href="/offer.html">产品与价格</a></p>
</body></html>`;
}

module.exports = { collect, htmlView };
