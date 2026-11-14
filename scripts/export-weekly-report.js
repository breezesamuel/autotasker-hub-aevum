/**
 * export-weekly-report.js — 每周自动导出运营报告（JSON + CSV）
 *
 * 输出到 data/reports/YYYY-Www.json 与 data/reports/YYYY-Www.csv：
 *   - JSON：聚合指标（结算、分销、客服、对账），供 BI/审计查阅
 *   - CSV：每日 settlement 明细（txHash, tool, amountUsd, wallet, refCode），供财务核对
 *
 * 用法：
 *   node scripts/export-weekly-report.js              # 导出当周（ISO 年第 N 周）
 *   node scripts/export-weekly-report.js --week 45    # 导出指定 ISO 周
 *   node scripts/export-weekly-report.js --json-only  # 只写 JSON，跳过 CSV
 *   node scripts/export-weekly-report.js --dry-run    # 打印而不写入
 *
 * 由 cron 每周一 05:20 执行（在 rebate-pay 之后）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'data', 'reports');
const PAYMENTS_DIR = path.join(ROOT, 'data', 'payments');
const REFERRALS_FILE = path.join(ROOT, 'data', 'referrals.json');
const SUPPORT_FILE = path.join(ROOT, 'data', 'support-tickets.json');
const RECONCILE_REPORT = path.join(ROOT, 'data', 'onchain-reconcile-report.json');

// ── ISO week helpers ─────────────────────────────────────────────────────────
function isoWeek(d) {
  const date = new Date(d);
  date.setUTCDate(date.getUTCDate() + 3 - (date.getUTCDay() + 6) % 7);
  const week = Math.floor((date.getTime() - new Date(Date.UTC(date.getUTCFullYear(), 0, 4)).getTime()) / 86400000 / 7);
  return { year: date.getUTCFullYear(), week };
}
function isoWeekStart(isoYear, isoWeek) {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const monday = new Date(jan4.getTime() + (isoWeek - 1) * 7 * 86400000);
  // roll back to Monday
  const day = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - ((day + 6) % 7));
  return monday;
}
function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

// ── Data loaders ─────────────────────────────────────────────────────────────
function loadLedgerEntries() {
  try {
    const ledger = JSON.parse(fs.readFileSync(path.join(PAYMENTS_DIR, 'ledger.json'), 'utf8'));
    return (ledger.entries || []).filter((e) => e.ts);
  } catch (e) { return []; }
}

function loadReferralSummary() {
  try {
    const db = JSON.parse(fs.readFileSync(REFERRALS_FILE, 'utf8'));
    return db || {};
  } catch (e) { return {}; }
}

function loadTicketCount() {
  try {
    const db = JSON.parse(fs.readFileSync(SUPPORT_FILE, 'utf8'));
    return db.tickets ? db.tickets.length : 0;
  } catch (e) { return 0; }
}

function loadReconReport() {
  try {
    return JSON.parse(fs.readFileSync(RECONCILE_REPORT, 'utf8'));
  } catch (e) { return null; }
}

// ── Main ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const AS_JSON_ONLY = argv.includes('--json-only');
const DRY_RUN = argv.includes('--dry-run');
const WEEK_ARG = argv.indexOf('--week');
const WEEK = WEEK_ARG >= 0 ? Number(argv[WEEK_ARG + 1]) : null;

function emit(label, value) {
  if (DRY_RUN) console.log('[dry-run]', label, '=', value);
  else console.log(label, '=', value);
}

(function main() {
  const now = new Date();
  const sw = WEEK != null ? { year: now.getUTCFullYear(), week: WEEK } : isoWeek(now);
  const start = isoWeekStart(sw.year, sw.week);
  const end = new Date(start.getTime() + 7 * 86400000 - 1);
  emit('report week', `${sw.year}-W${String(sw.week).padStart(2, '0')}  [${start.toISOString().slice(0, 10)} … ${end.toISOString().slice(0, 10)}]`);

  const entries = loadLedgerEntries().filter((e) => {
    const ts = new Date(e.ts);
    return ts >= start && ts <= end;
  });

  const totalCalls = entries.length;
  const totalUsd = entries.reduce((s, e) => s + Number(e.priceUsd || 0), 0);
  const firstAt = entries[0] ? entries[0].ts : null;
  const latestAt = entries[entries.length - 1] ? entries[entries.length - 1].ts : null;

  const byTool = {};
  for (const e of entries) {
    const t = e.tool || 'unknown';
    byTool[t] = (byTool[t] || 0) + 1;
  }

  const refSum = loadReferralSummary();
  const recon = loadReconReport();
  const tickets = loadTicketCount();
  const dailyCsvRows = (() => {
    const dayMap = {};
    for (const e of entries) {
      const d = e.ts.slice(0, 10);
      if (!dayMap[d]) dayMap[d] = { calls: 0, usd: 0 };
      dayMap[d].calls++;
      dayMap[d].usd += Number(e.priceUsd || 0);
    }
    return Object.entries(dayMap).map(([d, v]) => ({ date: d, calls: v.calls, revenueUsd: v.usd.toFixed(6) }));
  })();

  const jsonReport = {
    generatedAt: new Date().toISOString(),
    week: sw,
    range: { from: start.toISOString(), to: end.toISOString() },
    summary: {
      totalSettledCalls: totalCalls,
      totalRevenueUsd: totalUsd.toFixed(6),
      firstSettledAt: firstAt,
      latestSettledAt: latestAt,
      byTool,
    },
    referrals: {
      codes: refSum.codes || 0,
      clicks: refSum.clicks || 0,
      claims: refSum.claims || 0,
      attributedPayments: refSum.attributedPayments || 0,
      attributedRevenueUsd: refSum.attributedRevenueUsd || '0.000000',
      rebatesPendingUsd: refSum.rebatesPendingUsd || '0.000000',
      rebatesPaidUsd: refSum.rebatesPaidUsd || '0.000000',
    },
    supportTickets: tickets,
    reconciliation: recon ? {
      ok: recon.ok === true,
      checkedAt: recon.checkedAt,
      source: recon.onchain && recon.onchain.source,
      chainCount: recon.onchain && recon.onchain.count,
      chainUsd: recon.onchain && Number(recon.onchain.usd),
      ledgerCount: recon.ledger && recon.ledger.settledCount,
      ledgerUsd: recon.ledger && Number(recon.ledger.revenueUsd),
    } : null,
    dailyCsv: dailyCsvRows,
  };

  const csvHeader = 'date,calls,revenue_usd\n';
  const csvBody = dailyCsvRows.map((r) => `${r.date},${r.calls},${r.revenueUsd}`).join('\n');
  const csv = csvHeader + csvBody;

  if (DRY_RUN) {
    console.log('\n-- JSON --');
    console.log(JSON.stringify(jsonReport, null, 2).slice(0, 600));
    console.log('\n-- CSV preview --');
    console.log(csv.slice(0, 300));
    return;
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const prefix = `${sw.year}-W${String(sw.week).padStart(2, '0')}`;
  const jsonFile = path.join(REPORTS_DIR, prefix + '.json');
  const csvFile = path.join(REPORTS_DIR, prefix + '.csv');
  fs.writeFileSync(jsonFile, JSON.stringify(jsonReport, null, 2));
  if (!AS_JSON_ONLY) fs.writeFileSync(csvFile, csv);
  console.log(`\n[OK] written ${jsonFile}`);
  if (!AS_JSON_ONLY) console.log(`[OK] written ${csvFile}`);
})();
