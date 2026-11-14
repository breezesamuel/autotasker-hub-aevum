// fix-all-missing-parens.cjs — Find and fix all lines missing a closing paren after .map()
const fs = require('fs');
let code = fs.readFileSync('api/utils-tools.js', 'utf8');
const lines = code.split('\n');
const fixes = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // A line that has .map(function... or .map(c=> or similar AND ends with ); 
  // but does NOT have a matching closing paren for an earlier open one
  if (/\.map\(/.test(line) && /return\s*\{/.test(line)) {
    // Count parens in the return expression part (after "return {")
    const retIdx = line.indexOf('return ');
    if (retIdx >= 0) {
      const expr = line.slice(retIdx + 7);
      let pd = 0;
      for (let c of expr) { if (c === '(') pd++; else if (c === ')') pd--; }
      // If parens don't balance and line ends with );  it's likely missing a )
      if (pd > 0 && line.trim().endsWith(';')) {
        fixes.push({ line: i+1, text: line.trim().slice(0,100), pd });
      }
    }
  }
}

console.log('Suspicious lines:', JSON.stringify(fixes, null, 2));

// Now try requiring to find actual errors
try {
  delete require.cache[require.resolve('./api/utils-tools')];
  const m = require('./api/utils-tools');
  console.log('OK tools:', m.UTIL_TOOLS.length);
} catch(e) {
  const lm = e.stack.match(/utils-tools\.js:(\d+)/);
  if (lm) {
    const ln = parseInt(lm[1]);
    console.log(`\nERR at line ${ln}: ${e.message.slice(0,150)}`);
    const snippet = lines.slice(Math.max(0,ln-4), Math.min(lines.length, ln+3)).join('\n');
    console.log(snippet);
  }
}
