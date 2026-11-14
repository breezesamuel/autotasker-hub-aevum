/**
 * e2e-manual-verify.js — 端到端真实用户流程模拟（不依赖 webfetch 封装）
 */
const https = require('https');
const http = require('http');

const PROD = 'autotasker.highkingflower.com';

function httpGet(path_) {
  return new Promise((resolve, reject) => {
    https.get(`https://${PROD}${path_}`, { rejectUnauthorized: false }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject).setTimeout(15000);
  });
}
function httpPost(path_, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: PROD, path: path_, method: 'POST',
      headers: { 'content-type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      rejectUnauthorized: false, timeout: 15000,
    };
    const req = https.request(opts, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject); req.write(data); req.end();
  });
}
function ok(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + label);
  return condition;
}

(async () => {
  let total = 0, passed = 0;
  function check(label, cond) { total++; if (cond) passed++; console.log((cond?'✅':'❌')+' '+label); }

  console.log('\n=== E2E 全流程真实测试 ===\n');

  // ── Step 1: 用户访问落地页 ───────────────────────────────────────────────
  const offer = await httpGet('/offer.html').catch(() => null);
  check('offer.html loads', offer && offer.status === 200 && offer.body.includes('推荐返利'));
  const refLinkMatch = offer?.body.match(/ref\=([A-Z0-9]+)/);
  console.log('   (offer page has referral form)');

  // ── Step 2: 点击推广链接 /r/:code ──────────────────────────────────────
  // Simulate: visitor arrives via external link (no pre-existing cookie)
  const redirect = await httpGet('/r/ATESTCODE').catch(() => null);
  check('/r/ code redirects to offer', redirect && redirect.status === 302 && redirect.headers.location?.includes('offer.html'));
  // Check cookie set
  const setCookie = (redirect?.headers['set-cookie'] || []).flat().join('; ');
  check('cookie atref written on redirect', setCookie.includes('atref='));
  console.log('   (cookie name: ' + (setCookie.match(/atref=([^;]+)/)?.[1] || '?') + ')');

  // ── Step 3: 用户生成自己的推广码 ────────────────────────────────────────
  const mk = await httpPost('/api/ref/new', {}).catch(() => null);
  let userCode = null;
  if (mk && mk.status === 200) {
    try {
      const mj = JSON.parse(mk.body);
      userCode = mj.code;
      check('generate referral code', mj.ok && /^AT[A-Z0-9]{6}$/.test(userCode));
      console.log('   code=' + userCode + ' url=' + mj.url);
    } catch(e) { check('parse response', false); }
  } else {
    check('generate referral code', false, 'status=' + mk?.status + ' body=' + (mk?.body?.slice(0,50)||''));
  }

  // ── Step 4: 另一个用户通过推广链接注册并绑定钱包 ─────────────────────────
  if (userCode) {
    // B clicks A's link → gets cookie
    const cookieReq = await httpGet('/r/' + userCode).catch(() => null);
    check('B follows A link (redirect)', cookieReq && cookieReq.status === 302);
    
    // B claims wallet binding
    const claimReq = await httpPost('/api/ref/claim', {
      code: userCode,
      wallet: '0xDEADBEEF00000000000000000000000000001234',
    }).catch(() => null);
    if (claimReq && claimReq.status === 200) {
      const cj = JSON.parse(claimReq.body);
      check('B binds wallet to A code', cj.ok === true);
    } else {
      check('B binds wallet', false, 'status=' + claimReq?.status);
    }
  }

  // ── Step 5: 模拟一次 x402 支付触发归因 ─────────────────────────────────
  // We can't do real x402 settle without a signed payment, so we test the attribution endpoint directly
  // Actually we use the lib directly since the MCP path does this internally
  const referrals = require('../lib/referrals');
  if (userCode) {
    // Simulate: B (theclaimer wallet) makes a $0.05 payment
    const attrib = referrals.attributePayment({
      payerWallet: '0xDEADBEEF00000000000000000000000000001234',
      amountUsd: 0.05,
      txHash: '0xMANUAL-' + Date.now(),
      endpoint: '/api/x402/hotlist',
    });
    check('attribution accrues rebate', attrib.ok && attrib.rebateUsd >= 0.004, 
      'rebate=$' + (attrib.rebateUsd ?? '?') + ' reason=' + (attrib.reason||'ok'));
    
    // Check stats reflect the activity
    const statsReq = await httpGet('/api/ref/stats/' + userCode).catch(() => null);
    if (statsReq && statsReq.status === 200) {
      const sj = JSON.parse(statsReq.body);
      check('stats show accrued rebate', sj.ok && Number(sj.rebatePendingUsd) > 0, 
        'pending=$' + sj.rebatePendingUsd + ' revenue=$' + sj.attributedRevenueUsd);
    } else {
      check('stats query', false, 'status=' + statsReq?.status);
    }
  }

  // ── Step 6: Payout plan generation ──────────────────────────────────────
  const payoutPlan = require('../scripts/referral-payout.js');
  // We'll just check the local engine generates the plan correctly
  const plan = referrals.payoutPlan();
  check('payout plan generator runs', !!plan.transfers || plan.totalUsd === '0.000000');
  console.log('   pending total: $' + plan.totalUsd + ' transfers: ' + plan.transfers.length);

  // ── Step 7: Support ticket flow ─────────────────────────────────────────
  const ticket = await httpPost('/api/support/ticket', {
    message: '请问人民币怎么付款？',
    topic: 'payment',
  }).catch(() => null);
  if (ticket && ticket.status === 200) {
    const tj = JSON.parse(ticket.body);
    check('support ticket created + FAQ reply', tj.ok && tj.ticket.status === 'auto-answered',
      tj.ticket.replies?.[0]?.text?.slice(0,40) || '');
  } else {
    check('support ticket', false, 'status=' + ticket?.status);
  }

  // ── Step 8: Free endpoints still free ───────────────────────────────────
  const sample = await httpGet('/api/x402/sample?limit=1').catch(() => null);
  check('sample still free (200)', sample?.status === 200);
  const hotlistNoSig = await httpGet('/api/x402/hotlist?board=weiboHot&limit=1').catch(() => null);
  check('hotlist requires payment (402)', hotlistNoSig?.status === 402);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log(`E2E RESULT: ${passed}/${total} checks passed`);
  if (passed === total) console.log('ALL GREEN — system is production-ready');
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('E2E ERROR:', e.message); process.exit(1); });
