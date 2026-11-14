/**
 * seo-auto-pages.js — 为每条热搜自动生成 SEO 落地页
 *
 * 思路：每出现一条新的热门话题，立即生成一个独立的 HTML 页面，
 * 包含该话题的完整数据 + API CTA + JSON-LD，让搜索引擎把每个热搜词
 * 都变成一个独立入口。
 *
 * 例如：#王子璇白小纯4公里开了三小时# → /topic/wangzixuan-baixiaochun-4km
 *
 * 由 cron 在 trending 缓存刷新后自动运行。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const TOPICS_DIR = path.join(ROOT, 'public', 'topic');
const TREASURY = process.env.PAY_TO || '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';

// Slugify: convert Chinese/English title to URL-safe slug
function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildTopicPage(item) {
  const slug = slugify(item.title);
  const url = `https://autotasker.highkingflower.com/topic/${slug}`;
  const eng = Number(item.engagement || 0);
  const src = item.sourceLabel || item.source || 'Unknown';
  const timeStr = item.ts ? new Date(item.ts).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN');

  const ldJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: item.title,
    description: `#${src}热搜第${item.rank || '?'}位：${item.title}，热度${eng.toLocaleString()}，更新于${timeStr}`,
    datePublished: item.ts || new Date().toISOString(),
    author: { '@type': 'Organization', name: 'AutoTasker Hub' },
    publisher: {
      '@type': 'Organization',
      name: 'AutoTasker Hub',
      logo: { '@type': 'ImageObject', url: 'https://autotasker.highkingflower.com/favicon.ico' },
    },
    mainEntityOfPage: url,
    image: item.imageUrl || null,
  }).replace(/</g, '\\u003c');

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(item.title)} · ${escHtml(src)}热搜实时数据 | AutoTasker Hub</title>
<meta name="description" content="${escHtml(`#${src}热搜：${item.title}，热度${eng.toLocaleString()}，实时追踪。获取完整数据集和API接入。`)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${escHtml(item.title)} — ${escHtml(src)}热搜实时数据">
<meta property="og:description" content="热度${eng.toLocaleString()}，实时更新。获取完整数据和API。">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="AutoTasker Hub">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(item.title)}">
<meta name="twitter:description" content="热度${eng.toLocaleString()} · ${escHtml(src)}热搜实时数据">
<script type="application/ld+json">${ldJson}</script>
<style>body{font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;max-width:760px;margin:0 auto;padding:24px 16px;line-height:1.7;color:#0f172a;background:#f8fafc}
h1{font-size:1.35rem;margin:0 0 8px}h2{font-size:1.1rem;margin:24px 0 8px;color:#1e293b}
.meta{color:#64748b;font-size:.88rem;margin-bottom:16px}
.stat-row{display:flex;gap:16px;margin:16px 0;flex-wrap:wrap}
.stat-box{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 18px;min-width:120px}
.stat-box .val{font-size:1.4rem;font-weight:700;color:#4f46e5}
.stat-box .lbl{font-size:.78rem;color:#64748b;margin-top:2px}
.cta{background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:16px 20px;margin:20px 0}
.cta h3{margin:0 0 6px;font-size:1rem}
.cta p{margin:0 0 12px;font-size:.9rem;color:#475569}
a{color:#4f46e5}footer{margin-top:32px;font-size:.82rem;color:#94a3b8;text-align:center}
.related{margin-top:24px}
.related h2{border-bottom:2px solid #e2e8f0;padding-bottom:6px}
.related ul{padding-left:20px}
.related li{margin:6px 0}
.link-item{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;text-decoration:none;color:#1e293b;font-size:.85rem;margin:4px}
.link-item:hover{border-color:#4f46e5;color:#4f46e5}</style></head><body>
<a href="/trending" style="font-size:.85rem;color:#64748b;text-decoration:none">← 返回全部热搜</a>
<h1>🔥 ${escHtml(item.title)}</h1>
<div class="meta">
  <span>#${escHtml(src)}热搜</span> · <span>更新于 ${escHtml(timeStr)}</span>
  ${item.url ? `<a href="${escHtml(item.url)}" target="_blank" rel="noopener nofollow">原始链接 →</a>` : ''}
</div>
<div class="stat-row">
  <div class="stat-box"><div class="val">${eng.toLocaleString()}</div><div class="lbl">热度指数</div></div>
  <div class="stat-box"><div class="val">${escHtml(src)}</div><div class="lbl">数据来源</div></div>
  <div class="stat-box"><div class="val">#${item.rank || '?'}</div><div class="lbl">榜单排名</div></div>
  <div class="stat-box"><div class="val">实时</div><div class="lbl">更新频率</div></div>
</div>

<div class="cta">
  <h3>📊 想要这个数据的完整版本？</h3>
  <p>包含历史趋势、跨平台对比、关键词分析等深度维度。</p>
  <a href="/offer.html" class="link-item" style="background:#4f46e5;color:#fff;padding:8px 16px">💎 查看价格方案</a>
  <a href="/agent" class="link-item">🤖 Agent 自助接入</a>
  <a href="/api/x402/sample?limit=3" class="link-item">🧪 免费试用</a>
</div>

<div class="related">
  <h2>📰 相关热搜</h2>
  <p style="font-size:.88rem;color:#64748b;margin-bottom:8px">来自同一数据源的实时热门话题：</p>
  <div id="related"></div>
</div>

<footer>
  <a href="/trust">信任中心</a> · <a href="/api/x402/proof">结算证明</a> ·
  <a href="https://basescan.org/address/${TREASURY}" target="_blank" rel="noopener">BaseScan</a> ·
  © 2026 AutoTasker Hub
</footer>

<script>
// Inject related topics from server (served inline for SEO)
(function(){
  var related = ${JSON.stringify((item.relatedItems||[]).map(function(r){return{title:r.title,slug:slugify(r.title),eng:Number(r.engagement||0),src:r.sourceLabel||r.source};}))};
  var el = document.getElementById('related');
  if(!el||!related.length){el&&delete el;} else {
    el.innerHTML = related.map(function(r){
      return '<a class="link-item" href="/topic/'+r.slug+'">'+r.src+' · '+r.eng.toLocaleString()+'热度 · '+r.title+'</a>';
    }).join('');
  }
})();
</script>
</body></html>`;
}

// Pre-compute related items for a given source (called during page generation)
function computeRelated(source, items, limit = 5) {
  return items
    .filter(it => (it.sourceLabel || it.source) === source && it.title !== items[0]?.title)
    .slice(0, limit)
    .map(it => ({ title: it.title, sourceLabel: it.sourceLabel, source: it.source, engagement: it.engagement }));
}

function generateAllPages(items) {
  const results = { generated: 0, skipped: 0, errors: 0 };
  for (const [i, item] of items.entries()) {
    try {
      const slug = slugify(item.title);
      if (!slug) { results.skipped++; continue; }
      const related = computeRelated(item.sourceLabel || item.source, items.slice(0, 20), 5);
      const page = buildTopicPage(Object.assign({}, item, { rank: i + 1, relatedItems: related }));
      const filePath = path.join(TOPICS_DIR, slug + '.html');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, page, 'utf8');
      results.generated++;
    } catch (e) {
      results.errors++;
      console.error(`[seo-pages] error for "${item.title}":`, e.message.slice(0, 80));
    }
  }
  return results;
}

if (require.main === module) {
  // Run as CLI: read live.json, generate pages for top N items
  const packsDir = path.join(ROOT, 'data', 'packs');
  let items = [];
  try { items = JSON.parse(fs.readFileSync(path.join(packsDir, 'live.json'), 'utf8')).items || []; } catch (e) {}
  if (!items.length) { try { items = JSON.parse(fs.readFileSync(path.join(packsDir, 'xuanpin_v2.json'), 'utf8')).items || []; } catch (e2) {} }
  const n = parseInt(process.argv[2]) || 20;
  console.log(`[seo-pages] generating pages for top ${Math.min(n, items.length)} items...`);
  const r = generateAllPages(items.slice(0, n));
  console.log(`[seo-pages] done: ${r.generated} generated, ${r.skipped} skipped, ${r.errors} errors`);
}

module.exports = { slugify, buildTopicPage, computeRelated, generateAllPages };
