/**
 * leaderboard.js — 公共消费排行榜（社交证明 + 竞争驱动复购）
 *
 * GET /leaderboard          — HTML 排行榜页（公开，可被搜索引擎索引）
 * GET /api/leaderboard      — JSON API（供前端或嵌入使用）
 *
 * 逻辑：从 ledger entries 聚合每个 wallet 的消费数据，按 totalUsd 排序展示。
 * 钱包地址打码（前4+…+后4），txHash 完整链上可验。
 * 零态诚实：0 笔 = 显示 "等你来成为第一个"
 */
'use strict';

const pay = require('./payments');

function collectLeaderboard(limit = 20) {
  let entries = [];
  try { entries = (pay.loadLedger().entries || []).filter(e => e.agentWallet); } catch (e) {}

  // Group by wallet
  const byWallet = {};
  for (const e of entries) {
    const w = e.agentWallet.toLowerCase();
    if (!byWallet[w]) byWallet[w] = { wallet: w, count: 0, totalUsd: 0, tools: {}, recentTx: [], firstAt: null, lastAt: null };
    byWallet[w].count++;
    byWallet[w].totalUsd += Number(e.priceUsd || 0);
    byWallet[w].tools[e.tool || 'unknown'] = (byWallet[w].tools[e.tool || 'unknown'] || 0) + 1;
    if (e.ts) {
      if (!byWallet[w].firstAt || e.ts < byWallet[w].firstAt) byWallet[w].firstAt = e.ts;
      if (!byWallet[w].lastAt || e.ts > byWallet[w].lastAt) byWallet[w].lastAt = e.ts;
    }
    if (e.txHash) byWallet[w].recentTx.unshift({ ts: e.ts, tool: e.tool, usd: Number(e.priceUsd || 0), txHash: e.txHash });
  }

  return Object.values(byWallet)
    .sort((a, b) => b.totalUsd - a.totalUsd)
    .slice(0, limit)
    .map((w, i) => ({
      rank: i + 1,
      wallet: w.wallet.slice(0, 6) + '…' + w.wallet.slice(-4),
      walletFull: w.wallet,
      count: w.count,
      totalUsd: w.totalUsd.toFixed(6),
      topTool: Object.entries(w.tools).sort((a, b) => b[1] - a[1])[0]?.[0] || '?',
      recentTx: w.recentTx.slice(0, 3),
      firstAt: w.firstAt,
      lastAt: w.lastAt,
    }));
}

function maskFull(w) {
  const c = w.toLowerCase().replace(/^0x/, '');
  return c.slice(0, 6) + '…' + c.slice(-4);
}

function htmlView(data) {
  const zero = data.length === 0;
  const rows = data.map((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span style="color:#64748b">${String(i + 1).padStart(2, ' ')}</span>`;
    const txRows = r.recentTx.slice(0, 3).map(t =>
      `<div style="font-size:.78rem;color:#64748b;margin-top:2px">${t.tool} $${Number(t.usd || 0).toFixed(4)} · <a href="https://basescan.org/tx/${t.txHash}" target="_blank" rel="noopener" style="color:#818cf8">${t.txHash.slice(0, 10)}…</a></div>`
    ).join('');
    return `<tr class="${i % 2 === 0 ? 'even' : ''}">
      <td style="padding:10px 12px;width:50px">${medal}</td>
      <td style="padding:10px 12px;font-family:monospace;font-size:.82rem;color:#818cf8">${maskFull(r.walletFull)}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;color:#22c55e">$${Number(r.totalUsd || 0).toFixed(4)}</td>
      <td style="padding:10px 12px;text-align:right">${r.count}</td>
      <td style="padding:10px 12px;font-size:.85rem">${esc(r.topTool)}</td>
      <td style="padding:10px 12px">${txRows}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;padding:40px;color:#64748b">还没有结算记录 — 成为第一个 💎</td></tr>';

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>消费排行榜 — AutoTasker Hub · 谁在用中文社媒数据</title>
<meta name="description" content="查看哪些 AI Agent 和企业正在使用 AutoTasker Hub 的中文社媒热搜数据 API，实时 USDC 链上结算">
<link rel="canonical" href="https://autotasker.highkingflower.com/leaderboard">
<meta property="og:title" content="AutoTasker Hub — 消费排行榜">
<meta property="og:description" content="${data.length} 个钱包已结算 · 全部 BaseScan 可查">
<meta property="og:type" content="website">
<meta property="og:url" content="https://autotasker.highkingflower.com/leaderboard">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:24px 16px}
.container{max-width:960px;margin:0 auto}
h1{font-size:1.4rem;margin-bottom:4px}
.subtitle{color:#64748b;font-size:.88rem;margin-bottom:20px}
.card{background:#1a1a2e;border:1px solid #2d2d44;border-radius:14px;padding:20px;margin-bottom:20px}
.card h2{font-size:1rem;color:#818cf8;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:.88rem}
th{text-align:left;padding:10px 12px;background:#0f172a;color:#64748b;font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #2d2d44}
td{padding:10px 12px;border-bottom:1px solid #1e1e30;vertical-align:top}
tr.even{background:#131b2e}
tr:hover{background:#1e293b}
.usd{color:#22c55e;font-weight:700;font-variant-numeric:tabular-nums}
.tx-link{color:#60a5fa;text-decoration:none;font-size:.78rem}
.footer{margin-top:24px;font-size:.82rem;color:#475569;text-align:center}
.footer a{color:#818cf8}
.stats-bar{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.stat-chip{background:#1a1a2e;border:1px solid #2d2d44;border-radius:8px;padding:8px 16px;font-size:.85rem}
.stat-chip .v{color:#818cf8;font-weight:700}
.live-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:6px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
</style></head><body>
<div class="container">
<h1>🏆 消费排行榜</h1>
<p class="subtitle"><span class="live-dot"></span>实时链上数据 · 全部 USDC 结算可 BaseScan 核验</p>
<div class="stats-bar">
  <div class="stat-chip">累计钱包: <span class="v">${data.length}</span></div>
  <div class="stat-chip">累计收入: <span class="v">$${data.reduce((s, r) => s + Number(r.totalUsd || 0), 0).toFixed(4)}</span></div>
  <div class="stat-chip">总调用: <span class="v">${data.reduce((s, r) => s + r.count, 0)}</span> 次</div>
</div>
<div class="card">
<table>
<thead><tr><th>#</th><th>钱包</th><th style="text-align:right">消费</th><th style="text-align:right">次数</th><th>主力工具</th><th>最近交易</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</div>
<div class="footer">
<a href="/offer.html">产品与价格</a> ·
<a href="/trust">信任中心</a> ·
<a href="/api/x402/proof">结算证明</a> ·
<a href="/agent">Agent 接入</a>
</div>
</div>
<script>
// SSE: connect to /api/live/stream for real-time leaderboard updates
(function(){
  var evt = new EventSource('/api/live/stream');
  evt.onmessage = function(e) {
    try {
      var d = JSON.parse(e.data);
      if (d.type === 'settlement') {
        location.reload(); // simple: refresh on new settlement
      }
    } catch(err) {}
  };
  evt.onerror = function() { evt.close(); };
})();
</script>
</body></html>`;
}

function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

module.exports = { collectLeaderboard, htmlView };
