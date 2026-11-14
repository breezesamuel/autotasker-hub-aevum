/**
 * auto-digest.js — 每日热搜简报生成器
 *
 * 产出三种格式：
 *   1. JSON     → data/digest/YYYY-MM-DD.json       （机器可读，供 Bot 使用）
 *   2. Markdown → data/digest/YYYY-MM-DD.md          （供邮件/博客）
 *   3. Tweet thread → data/digest/YYYY-MM-DD-tweet.md（供 Twitter/X）
 *
 * 由 cron 每6小时执行（0:00, 6:00, 12:00, 18:00 UTC+8 = 16:00/22:00/04:00/10:00 UTC）
 *
 * 用法：
 *   node scripts/auto-digest.js                          # 生产（写盘 + 推送）
 *   node scripts/auto-digest.js --dry-run                # 只打印不写盘
 *   node scripts/auto-digest.js --formats json,md,tweet  # 指定格式
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIGEST_DIR = path.join(ROOT, 'data', 'digest');
const ITEMS_FILE = path.join(ROOT, 'data', 'packs', 'live.json');
const PACKS_ALT = path.join(ROOT, 'data', 'packs', 'xuanpin_v2.json');

// ── 配置（全部可通过环境变量覆盖）──────────────────────────────────────────
const TELEGRAM_WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL || null;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || null;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || null;
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || null;
const FORMATS = process.env.DIGEST_FORMATS || 'json,md,tweet';
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_FORMATS = (() => {
  const i = process.argv.indexOf('--formats');
  return i >= 0 ? process.argv[i + 1].split(',').map(s => s.trim()) : null;
})();

// ── 数据加载 ────────────────────────────────────────────────────────────────
function loadItems() {
  try {
    const raw = fs.readFileSync(ITEMS_FILE, 'utf8');
    const pack = JSON.parse(raw);
    return (pack.items || []).slice(0, 50);
  } catch (e) {
    try {
      const raw = fs.readFileSync(PACKS_ALT, 'utf8');
      return JSON.parse(raw).items.slice(0, 50);
    } catch (e2) { return []; }
  }
}

// ── 格式化工具 ───────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escMd(s) {
  return String(s || '').replace(/[#*`_\[\]()]/g, '\\$&');
}

function formatJson(items, dateStr) {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    date: dateStr,
    totalItems: items.length,
    topItems: items.map((it, i) => ({
      rank: i + 1,
      title: it.title,
      engagement: Number(it.engagement || 0),
      source: it.sourceLabel || it.source,
      url: it.url,
    })),
    bySource: (() => {
      const m = {};
      for (const it of items) { const k = it.sourceLabel || it.source; m[k] = (m[k] || 0) + 1; }
      return m;
    })(),
    meta: {
      domain: 'autotasker.highkingflower.com',
      baseUrl: 'https://autotasker.highkingflower.com',
    },
  }, null, 2);
}

function formatMarkdown(items, dateStr) {
  const lines = [
    `# 🔥 今日热搜 · ${dateStr}`,
    '',
    `> 数据来源：AutoTasker Hub · 共 ${items.length} 条实时上榜`,
    `> 更新时间：${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`,
    '',
    '---',
    '',
  ];
  // 按来源分组
  const bySource = {};
  for (const it of items) {
    const src = it.sourceLabel || it.source;
    (bySource[src] = bySource[src] || []).push(it);
  }
  let rank = 0;
  for (const [src, list] of Object.entries(bySource)) {
    lines.push(`## ${src}`);
    lines.push('');
    for (const it of list.slice(0, 10)) {
      rank++;
      const eng = Number(it.engagement || 0).toLocaleString();
      lines.push(`${rank}. [${escMd(it.title)}](${it.url}) — 🔥 ${eng}`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push(`📊 [查看全部热搜](https://autotasker.highkingflower.com/trending)`);
  lines.push(`💰 [API/MCP 接入](https://autotasker.highkingflower.com/offer.html)`);
  lines.push(`🔗 [信任中心](https://autotasker.highkingflower.com/trust)`);
  return lines.join('\n');
}

function formatTweetThread(items, dateStr) {
  const top5 = items.slice(0, 5);
  const tweets = [];
  tweets.push(`🔥 ${top5.length} 个热搜正在引爆中文互联网（${dateStr}）\n\n` +
    top5.map((it, i) => `${i + 1}. ${it.title}`).join('\n') +
    `\n\n👇 想看完整榜单 + 获取 API 数据？`);
  for (let i = 5; i < Math.min(top5.length + 5, items.length); i++) {
    tweets.push(`Continued…\n\n${i + 1}. ${items[i].title}`);
  }
  tweets.push(`\n\n📈 实时更新 + 免费样例：https://autotasker.highkingflower.com/trending`);
  tweets.push(`💰 企业级 API：https://autotasker.highkingflower.com/offer.html`);
  tweets.push(`\n#${dateStr.replace(/-/g, '')} #HotSearch #Weibo #ChinaTech`);
  return tweets.join('\n\n---\n\n');
}

// ── 推送（fire-and-forget）───────────────────────────────────────────────────
function pushWebhooks(payload) {
  if (!payload) return;
  const targets = [
    TELEGRAM_WEBHOOK_URL && { url: TELEGRAM_WEBHOOK_URL, body: { text: payload.text, parse_mode: 'Markdown' } },
    DISCORD_WEBHOOK_URL && { url: DISCORD_WEBHOOK_URL, body: { content: payload.text } },
    SLACK_WEBHOOK_URL && { url: SLACK_WEBHOOK_URL, body: { text: payload.text } },
    ALERT_WEBHOOK_URL && { url: ALERT_WEBHOOK_URL, body: payload.full },
  ].filter(Boolean);
  if (!targets.length) return;
  const https = require('https');
  for (const t of targets) {
    try {
      const data = JSON.stringify(t.body);
      const u = new URL(t.url);
      const req = https.request({
        host: u.hostname, path: u.pathname + u.search, method: 'POST', timeout: 10000,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
      }, (res) => { console.log(`[digest] pushed ${t.url.slice(0, 30)} → ${res.statusCode}`); });
      req.on('error', (e) => console.log(`[digest] push failed:`, e.message.slice(0, 80)));
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.write(data); req.end();
    } catch (e) { /* never block */ }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
(function main() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const hourCn = now.getUTCHours() + 8; // 粗略UTC+8
  const label = `日报 #${hourCn}h (${dateStr})`;
  console.log(`[digest] generating ${label}`);

  const items = loadItems();
  if (!items.length) {
    console.log('[digest] no items available, skipping');
    return;
  }

  const fmts = FORCE_FORMATS || FORMATS.split(',').map(s => s.trim());
  const outputs = {};

  if (fmts.includes('json')) outputs.json = formatJson(items, dateStr);
  if (fmts.includes('md')) outputs.md = formatMarkdown(items, dateStr);
  if (fmts.includes('tweet')) outputs.tweet = formatTweetThread(items, dateStr);

  // 写入磁盘
  if (!DRY_RUN) {
    fs.mkdirSync(DIGEST_DIR, { recursive: true });
    for (const [fmt, content] of Object.entries(outputs)) {
      const suffix = fmt === 'tweet' ? '-tweet.md' : `.${fmt}`;
      const file = path.join(DIGEST_DIR, `${dateStr}${suffix}`);
      fs.writeFileSync(file, content, 'utf8');
      console.log(`[digest] written ${file} (${content.length} bytes)`);
    }
  } else {
    for (const [fmt, content] of Object.entries(outputs)) {
      console.log(`\n--- ${fmt.toUpperCase()} ---\n${content.slice(0, 600)}`);
    }
  }

  // 推送
  const pushPayload = outputs.md
    ? { text: `[${label}] ${items.length} 条热搜已更新 · https://autotasker.highkingflower.com/trending`, full: outputs }
    : null;
  pushWebhooks(pushPayload);

  console.log(`[digest] done · ${Object.keys(outputs).length} formats · ${items.length} items`);
})();
