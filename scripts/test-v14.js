/** test-v14.js — unit tests for bounty-matching engine (offline) */
const fs = require('fs');
const path = require('path');
// reset local test state (module state persists across runs)
try { fs.unlinkSync(path.join(__dirname, '..', 'data', 'bounty-matching.json')); } catch (e) {}
try {
  var _bf = path.join(__dirname, '..', 'data', 'bounties.json');
  var _bd = JSON.parse(fs.readFileSync(_bf, 'utf8'));
  _bd.bounties = _bd.bounties.filter(b => b.posterWallet !== '0xposterwallet0000000000000000000000000001');
  fs.writeFileSync(_bf, JSON.stringify(_bd, null, 2));
} catch (e) {}
const bm = require('../lib/bounty-matching');
const bp = require('../lib/bounty-platform');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('[OK] ' + name + (extra ? ' | ' + extra : '')); }
  else { fail++; console.log('[FAIL] ' + name + (extra ? ' | ' + extra : '')); }
}

// ── worker registration ──────────────────────────────────────────────────────
var W1 = '0xMatchWorkerA0000000000000000000000001';
var W2 = '0xMatchWorkerB0000000000000000000000002';
var W3 = '0xMatchWorkerC0000000000000000000000003';

var r1 = bm.registerWorker(W1, ['translation', 'writing', 'zh-en'], ['content']);
check('register W1', r1.ok === true && r1.profile.reputation === 50, 'cold-start rep=' + r1.profile.reputation);

var r2 = bm.registerWorker(W2, ['coding', 'solidity', 'testing'], ['dev']);
check('register W2', r2.ok === true);

var r3 = bm.registerWorker(W3, ['translation', 'seo'], ['content', 'marketing']);
check('register W3', r3.ok === true);

var rBad = bm.registerWorker('not-a-wallet', ['x']);
check('register invalid rejected', rBad.ok === false);

// ── bounty creation (local test data) ────────────────────────────────────────
var created = bp.createBounty('Translate README to Chinese', 'Translate 300 lines', '5.00', '0xPosterWallet0000000000000000000000000001', { tags: ['translation', 'writing'], category: 'content' });
check('bounty created', created.ok === true, 'id=' + created.id);

// ── matching ─────────────────────────────────────────────────────────────────
var m = bm.matchTask(created.id);
check('match ran', m.ok === true && m.candidatesScored >= 2, 'candidates=' + m.candidatesScored);
// W1: overlap 2/2=1 *0.5 + rep 50/100*0.3=0.15 + cat 1*0.2=0.2 → 0.85
// W3: overlap 1/2=0.5*0.5=0.25 + 0.15 + 0.2 → 0.60
// W2: overlap 0 + 0.15 + 0 → 0.15
check('match order W1>W3>W2',
  m.topMatches.length >= 3 && m.topMatches[0].score === 0.85 && m.topMatches[1].score === 0.6 && m.topMatches[2].score === 0.15,
  'top=' + JSON.stringify(m.topMatches.map(x => x.score)));

// ── reputation EMA + sybil cap ───────────────────────────────────────────────
var u1 = bm.updateReputation(W1, 5); // target 100 → 50*0.7+100*0.3 = 65
check('rep EMA 5-star', u1.ok && u1.reputation === 65, 'rep=' + u1.reputation);

// jump cap: from 65 a single 5-star EMA = 75.5 (jump 10.5 < 20 ok). Force bigger: set rep manually low then rate high
var MATCH_FILE = path.join(__dirname, '..', 'data', 'bounty-matching.json');
var s = JSON.parse(fs.readFileSync(MATCH_FILE, 'utf8'));
s.workers[W1.toLowerCase()].reputation = 30;
fs.writeFileSync(MATCH_FILE, JSON.stringify(s, null, 2));
var u2 = bm.updateReputation(W1, 5); // 30*0.7+100*0.3 = 51 → jump 21 > 20 → capped at 50
check('sybil cap +20', u2.ok && u2.reputation === 50, 'rep=' + u2.reputation + ' (30 + 20 cap)');

// ── stale bump ───────────────────────────────────────────────────────────────
// age the bounty to 96h
var bd = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'bounties.json'), 'utf8'));
var bn = bd.bounties.find(b => b.id === created.id);
bn.createdAt = new Date(Date.now() - 96 * 3600000).toISOString();
fs.writeFileSync(path.join(__dirname, '..', 'data', 'bounties.json'), JSON.stringify(bd, null, 2));

var b1 = bm.bumpStale();
check('stale bump found', b1.ok === true && b1.staleCount >= 1, 'stale=' + b1.staleCount);

var b2 = bm.bumpStale();
check('stale bump idempotent-24h', b2.ok === true && b2.stale.every(x => x.bountyId !== created.id), 'no re-bump within 24h');

// ── report ───────────────────────────────────────────────────────────────────
var rep = bm.report();
check('report shape', rep.stats.workersRegistered >= 3 && rep.workers.avgReputation > 0, 'workers=' + rep.workers.total + ' avgRep=' + rep.workers.avgReputation);

// ── v15 airdrop autoExecute dry-run gates (offline, moves nothing) ──────────
(async () => {
  var ad = require('../lib/airdrop-distributor');
  var dry = await ad.autoExecute({ real: false });
  check('airdrop dry-run shape', dry.dryRun === true && Array.isArray(dry.gates) && dry.gates.length >= 5,
    'gates=' + dry.gates.length + ' allPass=' + dry.allGatesPass);
  var forced = await ad.autoExecute({ real: true }); // no env + missing gates → must stay dry-run (fail-closed)
  check('airdrop real-without-gates-stays-dry', forced.dryRun === true && forced.realRequested === true && forced.allGatesPass !== true,
    'allPass=' + forced.allGatesPass);

  console.log('\nTotal:' + (pass + fail) + ' PASS:' + pass + ' FAIL:' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('[FAIL] airdrop test crashed: ' + String(e && e.message).slice(0, 120)); process.exit(1); });
