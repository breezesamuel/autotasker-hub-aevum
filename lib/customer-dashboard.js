/**
 * customer-dashboard.js — 客户自助仪表盘
 *
 * GET /dashboard/:wallet — 公开页面展示该钱包的消费历史
 * GET /api/dashboard/:wallet — JSON API（供前端或嵌入使用）
 *
 * 展示内容（全部脱敏）：
 *   - 累计消费 USD
 *   - 调用次数 & 按工具分布
 *   - 最近 20 笔交易（txHash 可点）
 *   - 推荐返利累计
 *   - 推荐码绑定状态
 *
 * 设计原则：
 *   - 钱包地址本身就是 ID，无需登录（公共账户性质）
 *   - 不暴露其他用户数据（只查自身 wallet）
 *   - 全部数字从 ledger 读取，0 就是 0
 */
'use strict';

const pay = require('./payments');
const referrals = require('./referrals');

function maskWallet(w) {
  if (!w) return null;
  const clean = w.toLowerCase().replace(/^0x/, '');
  if (clean.length < 10) return '••••';
  return clean.slice(0, 6) + '…' + clean.slice(-4);
}

function collectForWallet(wallet) {
  const clean = wallet.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(clean)) return null;

  let entries = [], totalUsd = 0, byTool = {};
  try {
    const ledger = pay.loadLedger();
    entries = (ledger.entries || [])
      .filter(e => (e.agentWallet || '').toLowerCase() === clean)
      .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    for (const e of entries) {
      totalUsd += Number(e.priceUsd || 0);
      const t = e.tool || 'unknown';
      byTool[t] = (byTool[t] || 0) + 1;
    }
  } catch (e) {}

  // Referral info
  let refCode = null;
  try {
    const allCodes = referrals.listCodes ? referrals.listCodes() : {};
    // Find code bound to this wallet
    for (const [code, info] of Object.entries(allCodes)) {
      if ((info.wallet || '').toLowerCase() === clean) { refCode = code; break; }
    }
  } catch (e) {}
  let refStats = null;
  if (refCode) {
    try { refStats = referrals.stats(refCode); } catch (e) {}
  }

  return {
    wallet: maskWallet(wallet),
    walletFull: wallet, // not returned in API, but stored locally for reference
    settledCount: entries.length,
    totalUsd: totalUsd.toFixed(6),
    byTool,
    recentEntries: entries.slice(0, 20).map(e => ({
      ts: e.ts, tool: e.tool, amountUsd: Number(e.priceUsd || 0).toFixed(4),
      txHash: e.txHash ? (e.txHash.length > 18 ? e.txHash.slice(0, 10) + '…' + e.txHash.slice(-8) : e.txHash) : null,
      endpoint: e.endpoint,
    })),
    refCode,
    refStats: refStats && refStats.ok ? {
      clicks: refStats.clicks, attributedPayments: refStats.attributedPayments,
      rebateAccrued: refStats.rebateAccruedUsd, rebatePending: refStats.rebatePendingUsd,
    } : null,
  };
}

function htmlView(data, walletDisplay) {
  if (!data) {
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>未找到</title></head>
<body style="font-family:system-ui;text-align:center;padding:80px 16px;color:#64748b">
<p>钱包地址不存在或未有过结算记录</p>
<a href="/offer.html">查看产品与价格</a>
</body></html>`;
  }

  const toolRows = Object.entries(data.byTool).sort((a,b)=>b[1]-a[1]).map(([t,c])=>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #f1f5f9">${t}</td><td style="text-align:right;padding:6px 12px;border-bottom:1px solid #f1f5f9">${c} 次</td></tr>`
  ).join('');
  const txRows = data.recentEntries.map(e => {
    const txLink = e.txHash ? `<a href="https://basescan.org/tx/${e.txHash.replace('…','')}" target="_blank" rel="noopener" style="color:#4f46e5">${e.txHash}</a>` : '—';
    return `<tr><td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:.85rem">${e.ts ? new Date(e.ts).toLocaleString('zh-CN') : '?'}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9">${e.tool}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">$${e.amountUsd}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9">${txLink}</td></tr>`;
  }).join('') || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8">暂无交易记录</td></tr>';

  const refBlock = data.refCode ? `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px 16px;margin-top:16px">
      <strong style="color:#166534">🔗 推荐码已绑定</strong>
      <p style="margin:6px 0 0;color:#15803d;font-size:.9rem">代码: ${data.refCode} · 点击: ${data.refStats?.clicks||0} · 归因: ${data.refStats?.attributedPayments||0} 笔</p>
    </div>` : '';

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>我的消费记录 — AutoTasker Hub</title>
<meta name="robots" content="noindex">
<style>body{font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;max-width:760px;margin:0 auto;padding:24px 16px;line-height:1.6;color:#0f172a;background:#f8fafc}
h1{margin:0 0 4px}.subtitle{color:#64748b;font-size:.9rem;margin-top:0}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin:16px 0}
.big-num{font-size:2rem;font-weight:700;color:#4f46e5}.big-label{font-size:.82rem;color:#64748b}
table{width:100%;border-collapse:collapse;font-size:.88rem}
th{text-align:left;padding:8px 12px;background:#f8fafc;color:#64748b;font-weight:600;font-size:.78rem;text-transform:uppercase;border-bottom:2px solid #e2e8f0}
td{padding:8px 12px;border-bottom:1px solid #f1f5f9}
.trust-link{color:#4f46e5;text-decoration:none}
footer{margin-top:24px;font-size:.82rem;color:#94a3b8;text-align:center}
.wallet-badge{display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:3px 10px;font-family:monospace;font-size:.82rem;color:#475569}
</style></head><body>
<a href="/offer.html" style="font-size:.85rem;color:#64748b;text-decoration:none">← 回到首页</a>
<h1>📊 我的消费记录</h1>
<p class="subtitle">钱包 <span class="wallet-badge">${walletDisplay}</span> · 数据来自生产账本，逐笔 BaseScan 可验</p>

<div class="card">
  <div style="display:flex;gap:24px;flex-wrap:wrap">
    <div><div class="big-num">$${data.totalUsd}</div><div class="big-label">累计消费 (USDC)</div></div>
    <div><div class="big-num">${data.settledCount}</div><div class="big-label">调用次数</div></div>
    <div><div class="big-num">${Object.keys(data.byTool).length}</div><div class="big-label">使用工具数</div></div>
  </div>
</div>

<div class="card">
  <strong>按工具分布</strong>
  <table><thead><tr><th>工具</th><th style="text-align:right">调用次数</th></tr></thead>
  <tbody>${toolRows}</tbody></table>
</div>

<div class="card">
  <strong>最近 20 笔交易</strong>
  <table><thead><tr><th>时间</th><th>工具</th><th style="text-align:right">金额</th><th>TxHash</th></tr></thead>
  <tbody>${txRows}</tbody></table>
</div>

${refBlock}

<div style="margin-top:16px;font-size:.88rem;color:#64748b">
  <a href="/trust" class="trust-link">信任中心</a> ·
  <a href="/api/x402/proof" class="trust-link">结算证明</a> ·
  <a href="https://basescan.org/address/${walletDisplay.replace('…','')}" target="_blank" class="trust-link">BaseScan</a>
</div>
<footer>AutoTasker Hub · x402 USDC 链上结算</footer>
</body></html>`;
}

module.exports = { collectForWallet, htmlView };
