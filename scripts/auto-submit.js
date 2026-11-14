/**
 * auto-submit.js — 自动向外部平台提交内容，扩大触达面
 *
 * 支持平台：
 *   1. Hacker News — POST https://hacker-news.firebaseio.com/v0/item.json
 *   2. Reddit       — POST https://www.reddit.com/api/submit（需 OAuth）
 *   3. Google Search Console — URL Inspection API（需 token）
 *
 * 触发条件（由 cron 或手动运行）：
 *   - 新热搜数据变化时 → 生成 HN post
 *   - 每周报告产出时   → 生成 Reddit dataisbeautiful post
 *   - 每月对账完成时   → 生成信任报告 post
 *
 * 用法：
 *   node scripts/auto-submit.js hn --title "..." --url "..."
 *   node scripts/auto-submit.js reddit --sub dataisbeautiful --title "..."
 *   node scripts/auto-submit.js all --source trending
 */
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUBMISSIONS_FILE = path.join(ROOT, 'data', 'submissions.json');
const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || '';
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || '';
const REDDIT_USERNAME = process.env.REDDIT_USERNAME || '';
const REDDIT_PASSWORD = process.env.REDDIT_PASSWORD || '';

function loadSubmissions() {
  try { return JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8')); }
  catch (e) { return { version: 1, submissions: [] }; }
}
function saveSubmissions(sub) {
  try {
    fs.mkdirSync(path.dirname(SUBMISSIONS_FILE), { recursive: true });
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(sub, null, 2));
  } catch (e) {}
}
function alreadySubmitted(url, platform) {
  const subs = loadSubmissions();
  return subs.submissions.some(s => s.url === url && s.platform === platform);
}
function recordSubmission(url, platform, itemId) {
  const subs = loadSubmissions();
  subs.submissions.push({ url, platform, itemId, submittedAt: new Date().toISOString() });
  // 保留最近 500 条
  if (subs.submissions.length > 500) subs.submissions = subs.submissions.slice(-500);
  saveSubmissions(subs);
}

// ── Hacker News ──────────────────────────────────────────────────────────────
async function submitToHN(title, url, by = 'autotasker') {
  if (alreadySubmitted(url, 'hn')) {
    console.log('[hn] already submitted:', url);
    return { skipped: true, reason: 'already submitted' };
  }
  return new Promise((resolve) => {
    const data = JSON.stringify({ type: 'story', title, url, by });
    const req = https.request('https://hacker-news.firebaseio.com/v0/item.json', {
      method: 'POST', timeout: 15000,
      headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data) },
    }, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          if (j.id) {
            recordSubmission(url, 'hn', j.id);
            console.log(`[hn] submitted id=${j.id}`);
            resolve({ ok: true, id: j.id });
          } else {
            console.log('[hn] error:', b.slice(0, 200));
            resolve({ ok: false, error: b.slice(0, 200) });
          }
        } catch (e) { resolve({ ok: false, error: b.slice(0, 200) }); }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(data); req.end();
  });
}

// ── Reddit (OAuth flow simplified) ───────────────────────────────────────────
async function getRedditToken() {
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) return null;
  const auth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');
  return new Promise((resolve) => {
    const data = `grant_type=password&username=${encodeURIComponent(REDDIT_USERNAME)}&password=${encodeURIComponent(REDDIT_PASSWORD)}`;
    const req = https.request('https://www.reddit.com/api/v1/access_token', {
      method: 'POST', timeout: 10000,
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'authorization': 'Basic ' + auth },
    }, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b).access_token || null); } catch (e) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(data); req.end();
  });
}

async function submitToReddit(title, url, subreddit) {
  if (alreadySubmitted(url, 'reddit:' + subreddit)) {
    console.log('[reddit] already submitted to r/' + subreddit + ':', url);
    return { skipped: true };
  }
  if (!REDDIT_CLIENT_ID) {
    console.log('[reddit] skip: no credentials configured');
    return { skipped: true, reason: 'no credentials' };
  }
  const token = await getRedditToken();
  if (!token) {
    console.log('[reddit] failed to get token');
    return { ok: false, error: 'auth failed' };
  }
  return new Promise((resolve) => {
    const data = JSON.stringify({ sr: subreddit, title, url, kind: 'link' });
    const req = https.request('https://www.reddit.com/api/submit', {
      method: 'POST', timeout: 15000,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'authorization': 'Bearer ' + token,
        'user-agent': 'autotasker-hub/1.0',
        'content-length': Buffer.byteLength(data),
      },
    }, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          recordSubmission(url, 'reddit:' + subreddit, subreddit);
          console.log(`[reddit] submitted to r/${subreddit}`);
          resolve({ ok: true });
        } else {
          console.log('[reddit] status', res.statusCode, b.slice(0, 200));
          resolve({ ok: false, error: b.slice(0, 200) });
        }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(data); req.end();
  });
}

// ── Main CLI ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const cmd = argv[0];

(async () => {
  if (cmd === 'hn') {
    const titleIdx = argv.indexOf('--title');
    const urlIdx = argv.indexOf('--url');
    const title = titleIdx >= 0 ? argv[titleIdx + 1] : null;
    const url = urlIdx >= 0 ? argv[urlIdx + 1] : null;
    if (!title || !url) { console.log('usage: node auto-submit.js hn --title "..." --url "..."'); return; }
    const r = await submitToHN(title, url);
    console.log(JSON.stringify(r));
  } else if (cmd === 'reddit') {
    const titleIdx = argv.indexOf('--title');
    const urlIdx = argv.indexOf('--url');
    const subIdx = argv.indexOf('--sub');
    const title = titleIdx >= 0 ? argv[titleIdx + 1] : null;
    const url = urlIdx >= 0 ? argv[urlIdx + 1] : null;
    const sub = subIdx >= 0 ? argv[subIdx + 1] : 'dataisbeautiful';
    if (!title || !url) { console.log('usage: node auto-submit.js reddit --title "..." --url "..." [--sub dataisbeautiful]'); return; }
    const r = await submitToReddit(title, url, sub);
    console.log(JSON.stringify(r));
  } else if (cmd === 'all') {
    const source = argv.find(a => a.startsWith('--source='))?.split('=')[1] || 'trending';
    const dateStr = new Date().toISOString().slice(0, 10);
    const url = 'https://autotasker.highkingflower.com/trending';
    const title = `Real-time Chinese social media trending data (${dateStr}) — x402 USDC API`;
    console.log('[all] submitting to all platforms...');
    const [hn, rd] = await Promise.allSettled([
      submitToHN(title, url),
      submitToReddit(title, url, 'china_wwr'),
    ]);
    if (hn.status === 'fulfilled') console.log('[hn]', hn.value.ok ? 'OK' : 'FAIL', hn.value.error || '');
    if (rd.status === 'fulfilled') console.log('[reddit]', rd.value.ok ? 'OK' : 'FAIL', rd.value.error || '');
  } else {
    console.log(`Usage:
  node scripts/auto-submit.js hn --title "..." --url "..."
  node scripts/auto-submit.js reddit --title "..." --url "..." [--sub dataisbeautiful]
  node scripts/auto-submit.js all [--source=trending]
`);
  }
})();
