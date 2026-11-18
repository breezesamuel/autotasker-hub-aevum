/** Quick inspector for downloaded raw asset sources. */
'use strict';
const fs = require('fs');
const path = require('path');
const DATA = path.resolve(__dirname, '..', '..', '..', 'data');

for (const f of fs.readdirSync(DATA).filter(x => x.startsWith('src-'))) {
  const p = path.join(DATA, f);
  let j;
  try { j = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.log(f, 'BAD JSON', e.message); continue; }
  if (Array.isArray(j)) {
    console.log(f, 'ARRAY len=' + j.length, 'sample=' + JSON.stringify(j.slice(0, 2)).slice(0, 300));
  } else {
    console.log(f, 'OBJ keys=' + Object.keys(j).slice(0, 8).join(','),
      'tokens=' + (Array.isArray(j.tokens) ? j.tokens.length : 'n/a'));
  }
}
