// precise-scan.cjs — Show exact content of problematic lines with char counts
const fs = require('fs');
const code = fs.readFileSync('api/utils-tools.js', 'utf8');
const lines = code.split('\n');

// Show lines 244-255 with precise formatting
for (let i = 243; i <= 255 && i < lines.length; i++) {
  const l = lines[i];
  // Count braces/parens per line
  let b = 0, p = 0;
  for (const c of l) { if(c==='{')b++; else if(c==='}')b--; else if(c==='(')p++; else if(c===')')p--; }
  console.log(`L${i+1} [b=${b} p=${p}] len=${l.length}: ${l}`);
}

// Also show char-by-char around the ; on L247
console.log('\n--- L247 detail ---');
const l247 = lines[246];
for (let j = Math.max(0, l247.length - 30); j < l247.length; j++) {
  process.stdout.write(`${j}:${l247[j]}(`);
}
console.log('\n');
