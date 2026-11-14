/**
 * channel-tracker.js — 渠道归因与ROI追踪
 *
 * 跟踪每个获客渠道的关键指标：
 *   - organic（自然搜索）
 *   - referral（推荐码点击）
 *   - social（社交媒体外链）
 *   - direct（直接访问）
 *   - api（API 调用者）
 *
 * 由 middleware 记录每次请求的 channel，按天/周聚合，
 * 配合 export-weekly-report.js 导出。
 *
 * 用法：
 *   node scripts/channel-tracker.js            # 运行一次，打印报告
 *   node scripts/channel-tracker.js --init     # 初始化数据库
 *   node scripts/channel-tracker.js --ingest   # 从日志提取数据
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CHANNEL_DB = path.join(ROOT, 'data', 'channel-stats.json');
const LOG_FILE = path.join(ROOT, 'data', 'service.log');

// 渠道定义
const CHANNELS = ['organic', 'referral', 'social', 'direct', 'api', 'unknown'];
const UA_PATTERNS = {
  googlebot: /googlebot/i,
  bingbot: /bingbot/i,
  baiduspider: /baiduspider/i,
  telegrambot: /telegrambot/i,
  slackbot: /slackbot/i,
  discord: /discord/i,
  twitterbot: /twitterbot/i,
  linkedininbot: /linkedinbot/i,
  applebot: /applebot/i,
};
const SOCIAL_DOMAINS = [
  'weibo.com', 'zhihu.com', 'bilibili.com', 'douban.com', 'tieba.baidu.com',
  't.co', 'twitter.com', 'facebook.com', 'linkedin.com', 'reddit.com',
  'hn.algolia.com', 'news.ycombinator.com', 'discordapp.com', 'slack.com',
  't.me', 'qq.com', 'wechat.com',
];

function loadDb() {
  try { return JSON.parse(fs.readFileSync(CHANNEL_DB, 'utf8')); }
  catch (e) { return { version: 1, createdAt: new Date().toISOString(), channels: {}, daily: {} }; }
}
function saveDb(db) {
  try { fs.mkdirSync(path.dirname(CHANNEL_DB), { recursive: true }); fs.writeFileSync(CHANNEL_DB, JSON.stringify(db, null, 2)); }
  catch (e) { console.error('[channels] save failed:', e.message.slice(0, 80)); }
}

function classifyRequest(headers, url) {
  const ua = headers['user-agent'] || '';
  const referer = headers.referer || '';
  const path_lower = (url || '').toLowerCase();

  // 1. 机器人/爬虫（搜索引擎、社交引擎）
  for (const [name, re] of Object.entries(UA_PATTERNS)) {
    if (re.test(ua)) return name + '-bot';
  }
  // Apple bot, etc.
  if (/^mozilla\/5\.0.*applewebkit/i.test(ua) && /mobile/i.test(ua) && !/chrome/i.test(ua)) {
    return 'apple-bot';
  }

  // 2. 推荐码归因
  if (/^\/r\//.test(path_lower)) return 'referral-landing';
  if (referer && referer.includes('autotasker.highkingflower.com/r/')) return 'referral-link';

  // 3. 社媒引荐
  for (const dom of SOCIAL_DOMAINS) {
    if (referer && referer.includes(dom)) return 'social:' + dom;
  }

  // 4. API 调用（有 payment-header 的）
  if (headers['payment-signature'] || headers['payment-required']) return 'api-paid';
  if (path_lower.startsWith('/api/') || path_lower.startsWith('/mcp')) return 'api-free';

  // 5. 搜索引擎引荐
  const searchEngines = ['google.com', 'bing.com', 'baidu.com', 'yandex.com', 'duckduckgo.com'];
  for (const se of searchEngines) {
    if (referer && referer.includes(se)) return 'search:' + se;
  }

  // 6. 直接访问
  if (!referer || referer === '') return 'direct';

  return 'other:' + (referer || 'unknown').slice(0, 50);
}

function ingestFromLog() {
  if (!fs.existsSync(LOG_FILE)) {
    console.log('[channels] no service.log found, run with server first');
    return;
  }
  const log = fs.readFileSync(LOG_FILE, 'utf8');
  const db = loadDb();
  let lines = 0;
  for (const line of log.split('\n')) {
    // nginx-style: parse IP, timestamp, method, path, status, referer, user-agent
    const m = line.match(/^\[([^\]]+)\]\s+"(\w+)\s+([^"]+)"\s+(\d+)\s+"([^"]*)"\s+"([^"]*)"/);
    if (!m) continue;
    lines++;
    const [, ts, , url, status, referer, ua] = m;
    if (parseInt(status) !== 200) continue; // 只计成功请求
    const channel = classifyRequest({ 'user-agent': ua, referer }, url);
    const day = ts.slice(0, 10);
    if (!db.daily[day]) db.daily[day] = {};
    if (!db.daily[day][channel]) db.daily[day][channel] = 0;
    db.daily[day][channel]++;
  }
  console.log(`[channels] ingested ${lines} log lines from service.log`);
  saveDb(db);
}

function printReport(days = 7) {
  const db = loadDb();
  const days_keys = Object.keys(db.daily || {}).sort().reverse().slice(0, days);
  if (!days_keys.length) {
    console.log('[channels] no data yet — run --ingest after server has been live');
    return;
  }
  console.log('\n=== 渠道归因报告（近 ' + days + ' 天）===\n');
  const totals = {};
  for (const ch of CHANNELS) totals[ch] = 0;

  for (const day of days_keys) {
    console.log(`\n【${day}】`);
    const d = db.daily[day] || {};
    const sorted = Object.entries(d).sort((a, b) => b[1] - a[1]);
    for (const [ch, count] of sorted) {
      totals[ch] = (totals[ch] || 0) + count;
      const bar = '█'.repeat(Math.min(40, Math.round(count / Math.max(1, sorted[0][1]) * 40)));
      console.log(`  ${ch.padEnd(20)} ${String(count).padStart(6)}  ${bar}`);
    }
  }

  console.log('\n--- 总计 ---');
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);
  for (const [ch, count] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
    const pct = grandTotal ? ((count / grandTotal) * 100).toFixed(1) : '0.0';
    console.log(`  ${ch.padEnd(20)} ${String(count).padStart(6)}  ${pct}%`);
  }
  console.log(`\n总请求数: ${grandTotal}`);
}

const cmd = process.argv[2];
if (cmd === '--init') { saveDb(loadDb()); console.log('[channels] db initialized at', CHANNEL_DB); }
else if (cmd === '--ingest') { ingestFromLog(); console.log('[channels] done'); }
else { printReport(parseInt(process.argv[2]) || 7); }
