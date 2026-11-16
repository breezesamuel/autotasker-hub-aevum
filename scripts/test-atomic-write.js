// atomic-write regression: temp+fsync+rename must survive overwrite, large
// payloads, nested dirs, and leave zero .tmp litter. Guards the revenue ledger,
// subscription state, API-key table and trading journal against the
// half-written-JSON corruption class (crash/disk-full/power-loss mid-write).
'use strict';
const { writeJsonAtomic } = require('../lib/atomic-write');
const fs = require('fs');
const path = require('path');
const os = require('os');
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS', name, extra || ''); }
  else { fail++; console.log('FAIL', name, extra || ''); }
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awt-'));
try {
  const f = path.join(dir, 't.json');
  writeJsonAtomic(f, { a: 1 });
  check('first write parses', JSON.parse(fs.readFileSync(f, 'utf8')).a === 1);
  writeJsonAtomic(f, { a: 2 });
  check('overwrite existing (rename-replace)', JSON.parse(fs.readFileSync(f, 'utf8')).a === 2);
  check('no tmp litter left', fs.readdirSync(dir).filter(x => x.includes('.tmp')).length === 0);
  writeJsonAtomic(path.join(dir, 'sub', 'x.json'), { ok: true });
  check('nested dir auto-create', JSON.parse(fs.readFileSync(path.join(dir, 'sub', 'x.json'), 'utf8')).ok === true);
  const big = { items: Array.from({ length: 5000 }, (_, i) => ({ i, s: 'y'.repeat(24) })) };
  writeJsonAtomic(f, big);
  check('large payload integrity (5k items)', JSON.parse(fs.readFileSync(f, 'utf8')).items.length === 5000);
  // corrupt-old-file replacement: atomic write must fully replace a corrupt file
  fs.writeFileSync(f, '{BROKEN');
  writeJsonAtomic(f, { fixed: true });
  check('replaces corrupt file', JSON.parse(fs.readFileSync(f, 'utf8')).fixed === true);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`Total:${pass + fail} PASS:${pass} FAIL:${fail}`);
process.exit(fail ? 1 : 0);
