/**
 * social-share.js — 社交分享工具集
 *
 * 为每个热搜条目生成可直接用于各大平台的分享文案：
 *   - Twitter/X thread（已内置于 auto-digest）
 *   - 微博短文案（≤140字）
 *   - 知乎回答开头
 *   - LinkedIn 行业洞察帖
 *   - Reddit post
 *   - 微信推文摘要
 *
 * 也可以作为 CLI 直接使用：
 *   node scripts/social-share.js weibo --rank 1
 *   node scripts/social-share.js twitter-top5
 *   node scripts/social-share.js all --limit 10
 */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const ITEMS_FILE = path.join(ROOT, 'data', 'packs', 'live.json');
const PACKS_ALT = path.join(ROOT, 'data', 'packs', 'xuanpin_v2.json');

function loadItems() {
  try {
    const raw = fs.readFileSync(ITEMS_FILE, 'utf8');
    return JSON.parse(raw).items || [];
  } catch (e) {
    try { return JSON.parse(fs.readFileSync(PACKS_ALT, 'utf8')).items || []; }
    catch (e2) { return []; }
  }
}

// ── 各平台文案生成器 ─────────────────────────────────────────────────────────
function weiboCopy(item, rank) {
  const title = item.title || '';
  const eng = Number(item.engagement || 0);
  const src = item.sourceLabel || item.source || '';
  const url = item.url || '#';
  // 微博限制140字，去掉URL缩短空间
  const base = `[#${src}热搜第${rank}位] ${title}`;
  const tail = eng > 0 ? ` 🔥${eng.toLocaleString()}热度` : '';
  return (base + tail).slice(0, 140) + '\n查看详情: ' + (url.slice(0, 80));
}

function zhihuAnswerOpening(item, keyword) {
  const title = item.title || '';
  const src = item.sourceLabel || item.source || '';
  const eng = Number(item.engagement || 0).toLocaleString();
  return `这是一个关于"${keyword}"的问题。根据我最近抓取到的${src}热搜数据，当前最热门的条目是：《${title}》，热度达到${eng}，远超其他话题。\n\n详细榜单数据可以访问 AutoTasker Hub 的热搜聚合页面获取实时更新。\n\n（以上数据来自公开榜单实时聚合，仅供参考。）`;
}

function linkedinPost(items, dateStr) {
  const top3 = items.slice(0, 3);
  const lines = [
    `📊 中国社媒数据周报 · ${dateStr}`,
    '',
    '刚刚更新了今天的热门话题快照。值得注意的趋势：',
    '',
  ];
  for (const [i, it] of top3.entries()) {
    const eng = Number(it.engagement || 0).toLocaleString();
    lines.push(`${i + 1}. ${it.title}`);
    lines.push(`   热度: ${eng} · 来源: ${it.sourceLabel || it.source}`);
  }
  lines.push('', '这些数据实时聚合自微博、知乎、豆瓣、B站和贴吧。');
  lines.push('想要批量获取或使用 API 接入？查看我们的价格方案。', '');
  lines.push('#DataAPI #ChinaTech #SocialMedia #Trending #AI', '',
    `🔗 https://autotasker.highkingflower.com/trending`);
  return lines.join('\n');
}

function redditPost(items, subs) {
  const top = items.slice(0, 5);
  const title = `Today's Chinese social media trending topics (${top.length} items)`;
  const body = ['Here are the current trending topics across major Chinese platforms:', ''];
  for (const [i, it] of top.entries()) {
    const eng = Number(it.engagement || 0).toLocaleString();
    body.push(`${i + 1}. **${it.title}** — ${eng} engagements (${it.sourceLabel || it.source})`);
  }
  body.push('', 'Full dataset and real-time API: https://autotasker.highkingflower.com/trending');
  body.push('Data refreshed every 10 minutes.');
  return { title, body: body.join('\n'), subs: subs || ['china_wwr', 'ChineseLanguage', 'dataisbeautiful'] };
}

function emailSummary(items, dateStr) {
  const lines = [
    `Subject: 🔥 Today's Hot Topics in China (${dateStr})`,
    '',
    `Hi there,`,
    '',
    `Here are today's top trending topics across Weibo, Zhihu, Douban, Bilibili, and Tieba:`,
    '',
  ];
  for (const [i, it] of items.slice(0, 10).entries()) {
    const eng = Number(it.engagement || 0).toLocaleString();
    lines.push(`[${i + 1}] ${it.title} — 🔥 ${eng} (${it.sourceLabel || it.source})`);
  }
  lines.push('', '---', '',
    `Get real-time access via our x402 API: https://autotasker.highkingflower.com/offer.html`,
    `Free sample: GET /api/x402/sample?limit=5`,
    '',
    '— AutoTasker Hub Team');
  return lines.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const cmd = args[0];
const rankArg = parseInt(args[1]) || 1;

if (cmd === 'weibo') {
  const items = loadItems();
  const item = items[rankArg - 1] || items[0];
  console.log(weiboCopy(item, rankArg));
} else if (cmd === 'twitter' || cmd === 'tweet') {
  const items = loadItems();
  const n = parseInt(args[1]) || 5;
  const top = items.slice(0, n);
  const lines = top.map((it, i) => `${i + 1}. ${it.title}`).join('\n');
  console.log(`🔥 ${n} 个热搜正在引爆中文互联网\n\n${lines}\n\n📈 https://autotasker.highkingflower.com/trending`);
} else if (cmd === 'linkedin') {
  const items = loadItems();
  console.log(linkedinPost(items, new Date().toISOString().slice(0, 10)));
} else if (cmd === 'reddit') {
  const items = loadItems();
  const r = redditPost(items, args[1] ? args[1].split(',') : undefined);
  console.log('TITLE:', r.title);
  console.log('SUBS:', r.subs.join(', '));
  console.log('BODY:\n', r.body);
} else if (cmd === 'email') {
  const items = loadItems();
  console.log(emailSummary(items, new Date().toISOString().slice(0, 10)));
} else if (cmd === 'all') {
  const limit = parseInt(args[1]) || 10;
  const items = loadItems().slice(0, limit);
  const dateStr = new Date().toISOString().slice(0, 10);
  console.log('== WEIBO ==');
  for (let i = 0; i < Math.min(3, items.length); i++) console.log(weiboCopy(items[i], i + 1));
  console.log('\n== LINKEDIN ==');
  console.log(linkedinPost(items, dateStr));
  console.log('\n== REDDIT ==');
  const r = redditPost(items);
  console.log('TITLE:', r.title);
  console.log('BODY:\n', r.body);
  console.log('\n== EMAIL ==');
  console.log(emailSummary(items, dateStr));
} else {
  console.log(`Usage: node scripts/social-share.js <command> [args]
Commands:
  weibo <rank>       — 微博短文案（≤140字）
  twitter [n]        — Twitter/X thread（默认top5）
  linkedin           — LinkedIn 行业洞察帖
  reddit [subs]      — Reddit post（默认 r/china_wwr 等）
  email              — 邮件简报
  all [limit]        — 全部格式预览
`);
}
