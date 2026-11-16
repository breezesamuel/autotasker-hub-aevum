/** test-v14b.js — unit tests for social-queue (offline) */
const fs = require('fs');
const path = require('path');
// reset queue state for deterministic test
try { fs.unlinkSync(path.join(__dirname, '..', 'data', 'social-queue', 'queue.json')); } catch (e) {}
const sq = require('../lib/social-queue');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('[OK] ' + name + (extra ? ' | ' + extra : '')); }
  else { fail++; console.log('[FAIL] ' + name + (extra ? ' | ' + extra : '')); }
}

// 1. generate
var g1 = sq.generateQueue();
check('queue generated', g1.ok === true && g1.draftsCreated === 4, 'platforms=' + (g1.platforms || []).join(','));

// 2. idempotent per day
var g2 = sq.generateQueue();
check('idempotent per day', g2.alreadyGenerated === true);

// 3. platform constraints
var list = sq.listQueue('draft').drafts;
var xDraft = list.find(d => d.platform === 'x');
var weiboDraft = list.find(d => d.platform === 'weibo');
var redditDraft = list.find(d => d.platform === 'reddit');
var tgDraft = list.find(d => d.platform === 'telegram');

check('x thread 2 posts ≤280', xDraft && xDraft.payloads.length === 2 && xDraft.payloads.every(p => p.text.length <= 280),
  'lens=' + (xDraft ? xDraft.payloads.map(p => p.text.length).join('/') : '?'));
check('weibo ≤140', weiboDraft && weiboDraft.payloads.every(p => p.text.length <= 140), 'len=' + (weiboDraft ? weiboDraft.payloads[0].text.length : '?'));
check('reddit title ≤120 body ≤1500', redditDraft && redditDraft.payloads[0].title.length <= 120 && redditDraft.payloads[0].body.length <= 1500,
  'title=' + (redditDraft ? redditDraft.payloads[0].title.length : '?'));
check('telegram ≤900', tgDraft && tgDraft.payloads.every(p => p.text.length <= 900), 'len=' + (tgDraft ? tgDraft.payloads[0].text.length : '?'));

// 4. CTAs present
check('x has CTA link', xDraft && xDraft.payloads.some(p => p.text.indexOf('autotasker.highkingflower.com') >= 0));

// 5. mark posted
var m = sq.markPosted(xDraft.id, 'https://x.com/test/status/123');
check('mark posted', m.ok === true && m.platform === 'x');
var m2 = sq.markPosted(xDraft.id, 'again');
check('posted idempotent-block', m2.ok === false && m2.reason === 'already posted');

// 6. dedupe across days (simulate: clear day marker but keep seenTitles)
var sf = path.join(__dirname, '..', 'data', 'social-queue', 'queue.json');
var st = JSON.parse(fs.readFileSync(sf, 'utf8'));
delete st.seenTitles['q:' + new Date().toISOString().slice(0, 10)];
fs.writeFileSync(sf, JSON.stringify(st, null, 2));
var g3 = sq.generateQueue();
// correct behavior: same titles must NOT be redrafted; unseen titles (11-20) MAY be drafted
var prevTitles = new Set((g1.drafts && g1.drafts[0] ? g1.drafts[0].itemRefs || [] : []).map(x => x.title));
var g3refs = (g3.drafts && g3.drafts[0] ? g3.drafts[0].itemRefs : []) || [];
var overlap = g3refs.filter(r => prevTitles.has(r.title)).length;
check('dedupe same titles', g3.ok === false || overlap === 0, 'overlap=' + overlap + ' newRefs=' + g3refs.length);

// 7. report
var rep = sq.report();
check('report shape', rep.byPlatform.x && rep.pending >= 0, 'pending=' + rep.pending + ' posted=' + rep.stats.posted);

// ── v15b: pre-paid entitlement gate (module-level, no HTTP) ──────────────
var subs = require('../lib/subscription-manager');
var prepaid = require('../lib/prepaid-auth');
// mirrorTarget maps the pre-paid path to the x402 target it mirrors
check('prepaid mirror-target', prepaid.mirrorTarget('/api/prepaid/daily_report') === 'daily_report' &&
  prepaid.mirrorTarget('/api/prepaid/util/fx_rates') === 'util/fx_rates',
  'daily_report / util passthrough');
// consumeCredit: decrement a wallet's pool; all-access is a no-op (unlimited)
var subFile = path.join(__dirname, '..', 'data', 'subscriptions.json');
try {
  fs.writeFileSync(subFile, JSON.stringify({ version: 1, subs: [
    { id: 'sub_cp1', wallet: '0x00000000000000000000000000000000000000c1', tier: 'trend-digest', active: true, creditsRemaining: 2, unlimited: false, endpoints: ['daily_report'] },
    { id: 'sub_cp2', wallet: '0x00000000000000000000000000000000000000c2', tier: 'all-access', active: true, creditsRemaining: 999, unlimited: true, endpoints: ['daily_report'] },
  ], stats: { totalActive: 2, totalPaused: 0, totalRevenueUsd: 0 } }, null, 2));
  var c1 = subs.consumeCredit('0x00000000000000000000000000000000000000C1', 1);
  check('prepaid consume-credit', c1.ok === true && c1.creditsRemaining === 1, 'remaining=' + c1.creditsRemaining);
  var c2 = subs.consumeCredit('0x00000000000000000000000000000000000000C2', 1); // all-access → no-op
  var db = JSON.parse(fs.readFileSync(subFile, 'utf8'));
  var aa = db.subs.find(s => s.tier === 'all-access');
  check('prepaid all-access-unlimited', aa.creditsRemaining === 999, 'all-access pool untouched=' + aa.creditsRemaining);
  // draining to 0 auto-pauses
  subs.consumeCredit('0x00000000000000000000000000000000000000C1', 5);
  db = JSON.parse(fs.readFileSync(subFile, 'utf8'));
  var td = db.subs.find(s => s.tier === 'trend-digest');
  check('prepaid drain-auto-pause', td.creditsRemaining === 0 && td.active === false, 'paused on 0 credits');
  fs.unlinkSync(subFile);
} catch (e) { console.log('[FAIL] prepaid test crashed: ' + e.message); fail++; }

// ── v16c: monetization conversion engine (honest payback math, no bad upsells) ──
var mono = require('../lib/monetization');
// light hotlist user: ppc is cheaper than any sub → recommend null (no bad upsell)
var lightHot = mono.offerFor('hotlist', 30);
check('mono light-hotlist-no-upsell', lightHot.recommend === null, 'ppc $'+lightHot.estPayPerCallMonthly+'/mo < any tier');
// heavy full user: all-access beats $450/mo ppc → recommend all-access
var heavyFull = mono.offerFor('full', 900);
check('mono heavy-full-recs-all-access', heavyFull.recommend && heavyFull.recommend.id === 'all-access', 'ppc $'+heavyFull.estPayPerCallMonthly+'/mo');
// crossover math: full-stack at 300/mo market_scan saves vs $30 ppc
var ms = mono.offerFor('market_scan', 300);
check('mono market-scan-300-sub-saves', ms.recommend && ms.recommend.priceUsd < ms.estPayPerCallMonthly, 'tier $'+(ms.recommend?ms.recommend.priceUsd:'?')+' vs ppc $'+ms.estPayPerCallMonthly);
// pricingConversation shape
var pc = mono.pricingConversation();
check('mono pricing-conversation-shape', pc.payPerCall && pc.tiers.length === 4 && pc.crossover.length === 7, 'tiers=' + pc.tiers.length + ' crossover=' + pc.crossover.length);

console.log('\nTotal:' + (pass + fail) + ' PASS:' + pass + ' FAIL:' + fail);
process.exit(fail === 0 ? 0 : 1);
