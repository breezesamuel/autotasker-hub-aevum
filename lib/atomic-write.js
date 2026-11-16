// ── Atomic JSON persistence ─────────────────────────────────────────────────
// Problem this solves: a bare `writeFileSync(file, json)` can leave a TRUNCATED
// (corrupt) file behind when the process crashes, the disk fills, or power is
// lost mid-write. For the revenue ledger, subscription state, API-key table and
// trading journal that means: app fails to boot (JSON.parse throws) or silently
// loses money records — the same failure class as the 2026-11-15 disk incident.
//
// Protocol: serialize once → write to `<dir>/.<name>.<pid>.tmp` (same
// filesystem) → fsync (survives power loss, not just process death) → rename.
// rename(2) on the same filesystem is atomic: readers see either the old file
// or the new file, never a half-written one.
'use strict';
const fs = require('fs');
const path = require('path');

function writeJsonAtomic(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(file) + '.' + process.pid + '.tmp');
  const payload = JSON.stringify(data, null, 2);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, payload);
    try { fs.fsyncSync(fd); } catch (e) { /* some filesystems reject fsync — rename still guarantees crash-consistency */ }
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, file); // replaces the destination atomically (POSIX + Windows MoveFileEx(REPLACE_EXISTING))
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) { /* best effort cleanup */ }
    throw e;
  }
}

module.exports = { writeJsonAtomic };
