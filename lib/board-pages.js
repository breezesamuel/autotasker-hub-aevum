/**
 * board-pages.js — 分板块独立 SEO 子页：/board/weiboHot / /board/zhihu 等
 *
 * 每个板块独立 canonical、og、ItemList JSON-LD、RSS alternate，
 * 让搜索引擎把「微博热搜」「知乎热榜」等不同关键词分别收录。
 * 页面由 items() 实时渲染 + 10min TTL 缓存，内容变化时同步 IndexNow ping。
 */
'use strict';

const crypto = require('crypto');
const boards = ['weiboHot', 'zhihu', 'douban', 'bilibili', 'tieba'];
const BOARD_LABELS = {
  weiboHot: { label: '微博热搜', en: 'Weibo Hot Search', emoji: '🔥' },
  zhihu:    { label: '知乎热榜', en: 'Zhihu Hot List',    emoji: '💡' },
  douban:   { label: '豆瓣小组', en: 'Douban Groups',     emoji: '🎬' },
  bilibili: { label: 'B站热门',  en: 'Bilibili Trending', emoji: '▶️' },
  tieba:    { label: '贴吧热议', en: 'Tieba Discussions', emoji: '💬' },
};

// 共享缓存 key 形如 `{at, html}`，按 board 索引
const cache = new Map();
for (const b of boards) cache.set(b, { at: 0, html: null });

function build(board, itemsFn, indexNowPing) {
  const cfg = BOARD_LABELS[board];
  if (!cfg) return null;

  return function boardHandler(req, res) {
    const genAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const all = itemsFn().slice(0, 60);
    const bySource = {};
    for (const it of all) (bySource[it.sourceLabel || it.source] = bySource[it.sourceLabel || it.source] || []).push(it);
    // 如果该 board 下没有对应板块的数据，回退到全量
    const list = (bySource[cfg.label] || all).slice(0, 40);
    const sections = Object.entries(bySource).map(([label, arr]) => `
      <section><h2>${esc(label)} <span class="n">${arr.length} 条</span></h2><ol>${
        arr.slice(0, 20).map((it) =>
          `<li><a href="${esc(it.url)}" rel="noopener nofollow" target="_blank">${esc(it.title)}</a>` +
          `<span class="eng">${Number(it.engagement || 0).toLocaleString('en-US')} 热度</span></li>`).join('')
      }</ol></section>`).join('');
    const ldItems = list.slice(0, 20).map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: String(it.title || '').slice(0, 80), url: it.url }));
    const ldJson = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: `${cfg.label} — 实时榜单 | AutoTasker Hub`,
      description: `最新${cfg.en}条目，${list.length} 条实时更新，via x402/USDC 链上结算。`,
      itemListElement: ldItems,
    }).replace(/</g, '\\u003c');
    const ogJson = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'WebSite',
      name: cfg.label, url: 'https://autotasker.highkingflower.com/board/' + board,
    }).replace(/</g, '\\u003c');
    const cta = `<div class="cta">${cfg.emoji} 想要<b>全量 ${cfg.label} 数据 + API/MCP 接口</b>？查看 <a href="/offer.html">产品与价格 →</a>（USDC x402 或人民币套餐）</div>`;
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${cfg.label}${all.length ? ' · ' + all.length + ' 条实时上榜' : ''} | AutoTasker Hub</title>
<meta name="description" content="实时${cfg.label}热门话题，${list.length} 条自动更新，提供 API/MCP 接入。x402 USDC 链上结算。">
<link rel="canonical" href="https://autotasker.highkingflower.com/board/${board}">
<link rel="alternate" type="application/rss+xml" title="${cfg.label} RSS" href="/feed.xml?board=${board}">
<meta property="og:title" content="${cfg.label} — 实时热门榜单">
<meta property="og:description" content="最新${cfg.en}，${list.length} 条实时更新。">
<meta property="og:type" content="website">
<meta property="og:url" content="https://autotasker.highkingflower.com/board/${board}">
<script type="application/ld+json">${ldJson}</script>
<script type="application/ld+json">${ogJson}</script>
<style>body{font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;max-width:920px;margin:0 auto;padding:16px;line-height:1.5;color:#1a1a2e}
h1{font-size:1.5rem}section{margin:20px 0}h2{font-size:1.1rem;border-bottom:2px solid #4f46e5;padding-bottom:4px}
.n{font-size:.8rem;color:#888;font-weight:400}li{margin:6px 0}.eng{color:#999;font-size:.8rem;margin-left:8px}
a{color:#4f46e5;text-decoration:none}a:hover{text-decoration:underline}.cta{background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:12px 16px;margin:16px 0}
.updated{color:#888;font-size:.85rem}.nav{font-size:.88rem;margin-bottom:16px}</style></head><body>
<div class="nav"><a href="/trending">全部热搜</a> · <a href="/feed.xml">RSS</a> · <a href="/offer.html">价格</a> · <a href="/trust">信任中心</a></div>
<h1>${cfg.emoji} ${cfg.label}</h1>
<p class="updated">自动更新于 ${esc(genAt)} UTC · ${cfg.en} 实时榜单</p>
${cta}
${sections}
<p style="font-size:.9rem;color:#64748b">想获取批量数据？<a href="/llms.txt">Agent 文档</a> · <a href="/api/x402/sample?limit=5">免费样例</a></p>
</body></html>`;

    // 简单哈希比较决定是否需要刷缓存并 ping
    const h = crypto.createHash('sha1').update(list.map((i) => String(i.title || '')).join('|')).digest('hex').slice(0, 16);
    const cached = cache.get(board);
    const now = Date.now();
    if (!cached.html || h !== cached.hash || now - cached.at > 10 * 60 * 1000) {
      cached.html = html;
      cached.hash = h;
      cached.at = now;
      // ping 板块页本身 + 总 trending
      indexNowPing(['https://autotasker.highkingflower.com/board/' + board, 'https://autotasker.highkingflower.com/trending']);
    }
    res.type('html').send(cached.html);
  };
}

function esc(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

module.exports = { boards, BOARD_LABELS, build };
