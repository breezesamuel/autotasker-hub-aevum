/**
 * live-feed.js — 实时交易直播流
 *
 * 两个端点：
 *   GET /live          — HTML 直播大屏（公开，可嵌入第三方页面）
 *   GET /api/live/feed — JSON 最近 N 笔结算（用于前端轮询或嵌入）
 *
 * 设计原则：
 *   - 只展示**已结算**的交易（不展示待确认/测试流量）
 *   - 钱包地址打码（前4+…+后4），txHash 完整（链上可验）
 *   - 实时更新：前端每5秒轮询一次 JSON API
 *   - 零态诚实：0 笔就显示 "试运行中，第一笔等你来"
 */
'use strict';

const fs = require('fs');
const path = require('path');
const pay = require('./payments');

const TREASURY = process.env.PAY_TO || '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';

function maskWallet(w) {
  if (!w) return 'anonymous';
  const clean = w.toLowerCase().replace(/^0x/, '');
  if (clean.length < 10) return '••••';
  return clean.slice(0, 4) + '…' + clean.slice(-4);
}

function formatTxHash(h) {
  if (!h) return null;
  return h.length > 18 ? h.slice(0, 10) + '…' + h.slice(-8) : h;
}

function collectFeed(limit = 20) {
  try {
    const ledger = pay.loadLedger();
    const entries = (ledger.entries || []).filter(e => e.txHash).slice(-limit).reverse();
    return entries.map((e, i) => ({
      rank: limit - i,
      ts: e.ts || null,
      tool: e.tool || 'unknown',
      amountUsd: Number(e.priceUsd || 0).toFixed(4),
      amountAtomic: e.priceAtomic || '0',
      wallet: maskWallet(e.agentWallet),
      txHash: e.txHash || null,
      refCode: e.referrerId || null,
    }));
  } catch (e) {
    return [];
  }
}

function collectStats() {
  let settledCount = 0, revenueUsd = '0.000000', firstAt = null, latestAt = null;
  try {
    const s = pay.getSummary();
    settledCount = Number(s.settledCount || 0);
    revenueUsd = s.revenueUsd || '0.000000';
  } catch (e) {}
  try {
    const ledger = pay.loadLedger();
    const ts = (ledger.entries || []).map(e => e.ts).filter(Boolean).sort();
    firstAt = ts[0] || null;
    latestAt = ts[ts.length - 1] || null;
  } catch (e) {}
  return { settledCount, revenueUsd, firstAt, latestAt };
}

function htmlView(feed, stats) {
  const zero = stats.settledCount === 0;
  const rows = feed.map((e, i) => {
    const timeStr = e.ts ? new Date(e.ts).toLocaleString('zh-CN') : '?';
    const txShort = e.txHash ? formatTxHash(e.txHash) : '—';
    const refBadge = e.refCode
      ? `<span class="ref-badge">R:${e.refCode}</span>` : '';
    return `<tr class="${i % 2 === 0 ? 'even' : ''}">
      <td class="rank">#${e.rank}</td>
      <td class="time">${timeStr}</td>
      <td class="tool">${esc(e.tool)}</td>
      <td class="amount">$${e.amountUsd}</td>
      <td class="wallet">${esc(e.wallet)}</td>
      <td class="tx"><a href="https://basescan.org/tx/${e.txHash}" target="_blank" rel="noopener">${esc(txShort)}</a></td>
      <td>${refBadge}</td>
    </tr>`;
  }).join('');

  const liveIndicator = zero
    ? '<span class="live-dot offline"></span> 试运行中'
    : '<span class="live-dot online"></span> 实时结算';

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>实时交易直播 — AutoTasker Hub</title>
<meta name="robots" content="noindex">
<meta property="og:title" content="AutoTasker Hub — 实时链上结算直播">
<meta property="og:description" content="${stats.settledCount} 笔结算 · $${stats.revenueUsd} 累计收入 · 全部 BaseScan 可查">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;background:#0a0a0f;color:#e2e8f0;min-height:100vh;padding:24px 16px}
.container{max-width:960px;margin:0 auto}
h1{font-size:1.4rem;font-weight:700;margin-bottom:4px}
.subtitle{color:#64748b;font-size:.88rem;margin-bottom:20px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px}
.stat-card{background:#1a1a2e;border:1px solid #2d2d44;border-radius:12px;padding:16px;text-align:center}
.stat-value{font-size:1.8rem;font-weight:700;color:#818cf8}
.stat-label{font-size:.78rem;color:#64748b;margin-top:4px}
.live-badge{display:inline-flex;align-items:center;gap:6px;font-size:.82rem;color:#818cf8;margin-bottom:16px}
.live-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.live-dot.online{background:#22c55e;box-shadow:0 0 8px #22c55e;animation:pulse 2s infinite}
.live-dot.offline{background:#64748b}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{text-align:left;padding:10px 12px;background:#1a1a2e;color:#64748b;font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #2d2d44}
td{padding:10px 12px;border-bottom:1px solid #1e1e30;vertical-align:middle}
tr.even{background:#0f0f1a}
tr:hover{background:#1a1a2e}
.amount{color:#22c55e;font-weight:600;font-variant-numeric:tabular-nums}
.wallet{font-family:monospace;color:#818cf8;font-size:.8rem}
.tx a{color:#60a5fa;text-decoration:none}
.tx a:hover{text-decoration:underline}
.ref-badge{background:#1e1b4b;color:#a5b4fc;padding:2px 6px;border-radius:4px;font-size:.75rem;font-family:monospace}
.time{color:#64748b;font-size:.8rem}
.tool{color:#94a3b8}
.footer{margin-top:24px;font-size:.8rem;color:#475569;text-align:center}
.footer a{color:#818cf8}
.new-row{animation:fadeIn .5s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
</style></head><body>
<div class="container">
<h1>📡 实时交易直播</h1>
<p class="subtitle">每一笔都在 Base 主网真实结算 · 全部链上可验</p>
<div class="live-badge">${liveIndicator} · 更新于 ${new Date().toLocaleTimeString('zh-CN')}</div>
<div class="stats-grid">
  <div class="stat-card"><div class="stat-value">${stats.settledCount}</div><div class="stat-label">累计结算笔数</div></div>
  <div class="stat-card"><div class="stat-value">$${stats.revenueUsd}</div><div class="stat-label">累计收入 (USDC)</div></div>
  <div class="stat-card"><div class="stat-value">${stats.firstAt ? new Date(stats.firstAt).toLocaleDateString('zh-CN') : '—'}</div><div class="stat-label">首笔结算日</div></div>
  <div class="stat-card"><div class="stat-value">${stats.latestAt ? new Date(stats.latestAt).toLocaleDateString('zh-CN') : '—'}</div><div class="stat-label">最近结算日</div></div>
</div>
<table>
<thead><tr><th>#</th><th>时间</th><th>工具</th><th>金额</th><th>付款人</th><th>TxHash</th><th>推荐码</th></tr></thead>
<tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#475569;padding:40px">暂无结算记录 — 第一笔等你来创造 ✨</td></tr>'}</tbody>
</table>
<div class="footer">
<a href="/api/live/feed">JSON API</a> ·
<a href="/trust">信任中心</a> ·
<a href="/api/x402/proof">结算证明</a> ·
<a href="https://basescan.org/address/${TREASURY.replace('0x','').toLowerCase()}" target="_blank" rel="noopener">BaseScan</a>
</div>
</div>
<script>
(function(){
  const AUTO_REFRESH = 5000; // 5 秒轮询
  async function fetchFeed() {
    try {
      const r = await fetch('/api/live/feed?limit=20');
      const d = await r.json();
      renderFeed(d.feed || [], d.stats || {});
    } catch(e) {}
  }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
  function renderFeed(feed, stats) {
    const tbody = document.querySelector('tbody');
    const zero = stats.settledCount === 0;
    if (!feed.length && zero) return;
    const rows = feed.map((e,i) => {
      const t = e.ts ? new Date(e.ts).toLocaleString('zh-CN') : '?';
      const tx = e.txHash ? (e.txHash.length>18?e.txHash.slice(0,10)+'…'+e.txHash.slice(-8):e.txHash) : '—';
      const ref = e.refCode ? '<span class="ref-badge">R:'+esc(e.refCode)+'</span>' : '';
      return '<tr class="new-row">'+
        '<td class="rank">#'+e.rank+'</td>'+
        '<td class="time">'+esc(t)+'</td>'+
        '<td class="tool">'+esc(e.tool)+'</td>'+
        '<td class="amount">$'+esc(e.amountUsd)+'</td>'+
        '<td class="wallet">'+esc(e.wallet)+'</td>'+
        '<td class="tx"><a href="https://basescan.org/tx/'+esc(e.txHash||'')+'" target="_blank" rel="noopener">'+esc(tx)+'</a></td>'+
        '<td>'+ref+'</td></tr>';
    }).join('');
    if (tbody) tbody.innerHTML = rows;
    // update stats
    document.querySelectorAll('.stat-value')[0].textContent = stats.settledCount || 0;
    document.querySelectorAll('.stat-value')[1].textContent = '$'+(stats.revenueUsd||'0.000000');
  }
  fetchFeed();
  setInterval(fetchFeed, AUTO_REFRESH);
})();
</script>
</body></html>`;
}

function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

module.exports = { collectFeed, collectStats, htmlView, esc };
