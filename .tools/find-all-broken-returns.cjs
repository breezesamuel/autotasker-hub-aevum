// find-all-broken-returns.cjs — locate every return with mismatched braces in utils-tools.js
const fs = require('fs');
const code = fs.readFileSync('api/utils-tools.js', 'utf8');
const lines = code.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Look for "return {" that contains ".map(function" and ends without proper closing
  if (/return\s*\{/.test(line) && /\.map\(function/.test(line)) {
    // Check if this line or next few lines properly close the return object
    let buf = line;
    for (let j = i+1; j < Math.min(i+5, lines.length); j++) {
      buf += lines[j];
      if (buf.trim().endsWith('};') || buf.trim().endsWith('});')) break;
    }
    // Simple check: does line end with }; or }); after containing .map( ?
    const stripped = line.replace(/\/\/.*$/, '').trim();
    if (stripped.endsWith(';') && !stripped.endsWith('}};') && !stripped.endsWith('});') && stripped.includes('.map(function')) {
      console.log(`L${i+1}: ${stripped.slice(0,120)}`);
    }
  }
}

console.log('\n--- Trying to require ---');
try {
  delete require.cache[require.resolve('./api/utils-tools')];
  const m = require('./api/utils-tools');
  console.log('OK tools:', m.UTIL_TOOLS.length);
} catch(e) {
  const m2 = e.stack.match(/utils-tools\.js:(\d+)/);
  console.log('ERR line:', m2 ? m2[1] : 'unknown', '| msg:', e.message.slice(0, 120));
  if (m2) {
    const ln = parseInt(m2[1]);
    for (let k = Math.max(0, ln-4); k < Math.min(lines.length, ln+3); k++) {
      console.log(`${k+1}: ${lines[k]}`);
    }
  }
}
