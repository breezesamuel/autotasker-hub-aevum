/**
 * business-loop-audit.js — 自运行赚钱系统 7 阶段商业闭环审计（纯 HTTP，可打生产）
 *
 * 阶段：
 *   1 获客  ACQUISITION  /trending 200 + JSON-LD/canonical、/robots.txt、/sitemap.xml
 *   2 触达  REACH        /feed.xml 有效 RSS、trending RSS alternate、offer og/twitter 标签
 *   3 转化  CONVERSION   付费端点返回规范 402 挑战（Payment-Required 头、accepts[0].payTo=金库）、
 *                        免费样例可用、MCP /api/status 协议在线
 *   4 收钱  SETTLEMENT   /api/x402/proof 返回真实 settledCount + payTo + revenue（诚实口径）
 *   5 分销  REFERRAL     生成码 → /r/:code 跳转+cookie → /ref/:code 仪表盘渲染 → claim 绑定 → stats
 *   6 留存  RETENTION    工单创建（FAQ 自动回复）→ 查单闭环
 *   7 自愈  SELF-HEAL    /api/status operational；trending/feed 最新（内容新鲜度可测）
 *
 * Usage:
 *   node scripts/business-loop-audit.js                     # 审计生产
 *   node scripts/business-loop-audit.js --base http://127.0.0.1:8795   # 审计本地
 * 退出码：全绿 0；有 FAIL 1。
 */
'use strict';

const http = require('http');
const https = require('https');

const baseIdx = process.argv.indexOf('--base');
const BASE = (baseIdx >= 0 ? process.argv[baseIdx + 1] : 'https://autotasker.highkingflower.com').replace(/\/+$/, '');
const TREASURY = '0xb9a9e6d9c4ad1635aa685bba2e235a515a94773c';
const crypto = require('crypto');

function req(method, url, { headers = {}, body = null, timeout = 25000 } = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const r = lib.request({
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search, method, timeout, rejectUnauthorized: false,
      headers: { ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}), ...headers },
    }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', (e) => resolve({ status: 0, headers: {}, body: '', error: e.message }));
    if (body) r.write(body);
    r.end();
  });
}

const results = [];
function stage(n, name, checks) { const st = { stage: n, name, checks }; results.push(st); return st; }
async function check(stageObj, desc, pass, detail) {
  stageObj.checks.push({ desc, pass: !!pass, detail: String(detail || '').slice(0, 160) });
}

(async () => {
  // ══ 1 获客 ══
  const s1 = stage(1, '获客 ACQUISITION', []);
  const trend = await req('GET', BASE + '/trending');
  await check(s1, '/trending 200', trend.status === 200, 'status=' + trend.status);
  await check(s1, 'trending 含 ItemList JSON-LD', /application\/ld\+json/.test(trend.body) && /ItemList/.test(trend.body));
  await check(s1, 'trending canonical 指向自身', /rel="canonical" href="[^"]*\/trending"/.test(trend.body));
  const robots = await req('GET', BASE + '/robots.txt');
  await check(s1, '/robots.txt 200 + sitemap', robots.status === 200 && /sitemap/i.test(robots.body), robots.body.slice(0, 60));
  const smap = await req('GET', BASE + '/sitemap.xml');
  await check(s1, '/sitemap.xml 200 非空', smap.status === 200 && /<urlset/.test(smap.body), 'urls≈' + (smap.body.match(/<url>/g) || []).length);
  const offer = await req('GET', BASE + '/offer.html');
  await check(s1, '/offer.html 200', offer.status === 200, 'status=' + offer.status);
  const trust = await req('GET', BASE + '/trust');
  await check(s1, '/trust 200 + canonical', trust.status === 200 && /rel="canonical"[^>]*\/trust/.test(trust.body), 'status=' + trust.status);

  // ══ 2 触达 ══
  const s2 = stage(2, '触达 REACH', []);
  const feed = await req('GET', BASE + '/feed.xml');
  await check(s2, '/feed.xml 200 合法 RSS', feed.status === 200 && /<rss/.test(feed.body) && /<item>/.test(feed.body), 'items=' + (feed.body.match(/<item>/g) || []).length);
  await check(s2, 'trending 挂 RSS alternate', /application\/rss\+xml/.test(trend.body) && /\/feed\.xml/.test(trend.body));
  await check(s2, 'offer og:title/og:url/twitter:card', /property="og:title"/.test(offer.body) && /property="og:url"/.test(offer.body) && /name="twitter:card"/.test(offer.body));
  await check(s2, 'offer 含 Product JSON-LD', /"@type":"Product"/.test(offer.body));
  await check(s2, 'offer 含 FAQPage JSON-LD', /"@type":"FAQPage"/.test(offer.body));
  const home = await req('GET', BASE + '/');
  await check(s2, '首页 200', home.status === 200, 'status=' + home.status);

  // ══ 3 转化 ══
  const s3 = stage(3, '转化 CONVERSION', []);
  const sample = await req('GET', BASE + '/api/x402/sample?limit=3');
  const sampleOk = sample.status === 200 && /"sample"/.test(sample.body);
  await check(s3, '免费样例可用', sampleOk, 'status=' + sample.status);
  const gate = await req('GET', BASE + '/api/x402/hotlist?source=weibo&limit=3');
  const challengeB64 = (gate.headers['payment-required'] || gate.headers['Payment-Required'] || '');
  let challenge = null;
  try { challenge = JSON.parse(Buffer.from(challengeB64, 'base64').toString('utf8')); } catch (e) {}
  await check(s3, '付费端点返回 402', gate.status === 402, 'status=' + gate.status);
  await check(s3, 'Payment-Required 挑战头存在且可解析', !!challenge, 'x402Version=' + (challenge && challenge.x402Version));
  await check(s3, '挑战 payTo=金库', !!challenge && String((challenge.accepts && challenge.accepts[0] && challenge.accepts[0].payTo) || '').toLowerCase() === TREASURY,
    challenge && challenge.accepts && challenge.accepts[0] && challenge.accepts[0].payTo);
  await check(s3, '挑战 network=Base', !!challenge && /8453/.test(JSON.stringify((challenge.accepts && challenge.accepts[0]) || {})));
  const accepted = challenge && challenge.accepts && challenge.accepts[0];
  await check(s3, '定价一致性：$0.05 = 50000 原子单位', !!accepted && Number(accepted.amount) === 50000, accepted && accepted.amount);
  const status = await req('GET', BASE + '/api/status');
  await check(s3, '/api/status operational', status.status === 200 && /"operational"/.test(status.body), status.body.slice(0, 80));
  const tl = await req('POST', BASE + '/mcp', { body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  let toolCount = null;
  try { toolCount = (JSON.parse(tl.body).result.tools || []).length; } catch (e) {}
  await check(s3, 'MCP tools/list 可用（≥70 工具）', tl.status === 200 && toolCount >= 70, 'tools=' + toolCount);

  // ══ 4 收钱 ══
  const s4 = stage(4, '收钱 SETTLEMENT', []);
  const proof = await req('GET', BASE + '/api/x402/proof');
  let p = null;
  try { p = JSON.parse(proof.body); } catch (e) {}
  await check(s4, '/api/x402/proof 200 可解析', proof.status === 200 && !!p && p.ok);
  await check(s4, 'proof.payTo=金库', !!p && String(p.payTo || '').toLowerCase() === TREASURY, p && p.payTo);
  await check(s4, 'settledCount 为非负整数', !!p && Number.isInteger(p.settledCount) && p.settledCount >= 0, p && p.settledCount);
  await check(s4, 'revenue 数字诚实（≥0）', !!p && Number(p.totalRevenueUsd) >= 0, p && p.totalRevenueUsd);
  await check(s4, 'verifyUrl 指向 BaseScan', !!p && /basescan\.org\/address\//.test(p.verifyUrl || ''), p && p.verifyUrl);
  await check(s4, 'offer 页挂 proof 徽章脚本', /proofBadge/.test(offer.body));

  // ══ 5 分销 ══
  const s5 = stage(5, '分销 REFERRAL', []);
  const newCode = await req('POST', BASE + '/api/ref/new', { body: JSON.stringify({ note: 'audit' }) });
  let code = null;
  try { code = JSON.parse(newCode.body).code; } catch (e) {}
  await check(s5, '生成推荐码', newCode.status === 200 && !!code, code || newCode.body.slice(0, 60));
  const redir = await req('GET', BASE + '/r/' + code);
  const setCookie = redir.headers['set-cookie'] || '';
  await check(s5, '/r/:code 跳转 offer + atref cookie', redir.status >= 300 && redir.status < 400 && /atref=/.test(setCookie), 'loc=' + (redir.headers.location || '').slice(0, 50));
  const wallet = '0x' + crypto.randomBytes(20).toString('hex');
  const claim = await req('POST', BASE + '/api/ref/claim', { body: JSON.stringify({ code, wallet }) });
  await check(s5, 'claim 绑定钱包', claim.status === 200 && /"ok":true/.test(claim.body), claim.body.slice(0, 60));
  const dash = await req('GET', BASE + '/ref/' + code);
  await check(s5, '/ref/:code 仪表盘 200 渲染', dash.status === 200 && dash.body.includes(code) && /返利|rebate/i.test(dash.body), 'status=' + dash.status);
  const dashLower = dash.body.toLowerCase();
  await check(s5, '仪表盘钱包打码（完整地址不出现）',
    dash.status === 200 && !dashLower.includes(wallet.toLowerCase()) && dashLower.includes(wallet.slice(0, 8).toLowerCase()),
    'prefix-shown=' + dashLower.includes(wallet.slice(0, 8).toLowerCase()));
  const stats = await req('GET', BASE + '/api/ref/stats/' + code);
  await check(s5, 'stats 返回真实计数', stats.status === 200 && /"clicks":\d+/.test(stats.body), stats.body.slice(0, 100));
  const dash404 = await req('GET', BASE + '/ref/ZZZZZZ99');
  await check(s5, '未知码仪表盘 404', dash404.status === 404, 'status=' + dash404.status);

  // ══ 6 留存 ══
  const s6 = stage(6, '留存 RETENTION', []);
  const tk = await req('POST', BASE + '/api/support/ticket', { body: JSON.stringify({ topic: 'audit', message: '价格与发票咨询（自动审计工单 ' + Date.now() + '）' }) });
  let tid = null;
  try { tid = JSON.parse(tk.body).ticket.id; } catch (e) {}
  await check(s6, '工单创建', tk.status === 200 && !!tid, tid || tk.body.slice(0, 50));
  const tget = await req('GET', BASE + '/api/support/ticket/' + tid);
  const autoReply = (() => { try { return JSON.parse(tget.body).ticket.replies.length; } catch (e) { return 0; } })();
  await check(s6, 'FAQ 自动回复（0 人工即时响应）', tget.status === 200 && autoReply > 0, 'replies=' + autoReply);
  await check(s6, 'offer 页含自助工单入口', /btnTicket/.test(offer.body));

  // ══ 7 自愈 ══
  const s7 = stage(7, '自愈 SELF-HEAL', []);
  await check(s7, '服务健康（status operational）', status.status === 200 && /"operational"/.test(status.body));
  await check(s7, 'trending 内容新鲜（非空白缓存）', trend.status === 200 && /<ol>/.test(trend.body) && trend.body.length > 3000, 'len=' + trend.body.length);
  const feedFresh = (feed.body.match(/<item>/g) || []).length >= 5;
  await check(s7, 'feed 内容充足（≥5 items）', feedFresh);
  const proof2 = await req('GET', BASE + '/api/x402/proof');
  await check(s7, 'proof 端点可缓存复用（60s）', proof2.status === 200 && /max-age=60/.test(proof2.headers['cache-control'] || ''), proof2.headers['cache-control']);

  // ══ 汇总 ══
  let pass = 0, fail = 0;
  console.log('\n══ 商业闭环审计 ' + BASE + ' ══');
  for (const st of results) {
    const stPass = st.checks.filter((c) => c.pass).length;
    console.log(`\n[阶段 ${st.stage} ${st.name}]  ${stPass}/${st.checks.length}`);
    for (const c of st.checks) {
      if (c.pass) { pass++; console.log('  [OK] ' + c.desc + (c.detail ? '  (' + c.detail + ')' : '')); }
      else { fail++; console.log('  [FAIL] ' + c.desc + '  -> ' + c.detail); }
    }
  }
  console.log(`\n总计: ${pass} PASS / ${fail} FAIL — ${fail === 0 ? '商业闭环完整' : '存在断点'}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('AUDIT ERROR:', e.message); process.exit(1); });
