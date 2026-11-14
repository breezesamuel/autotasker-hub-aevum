// deep-scan.cjs — Character-by-character analysis of utils-tools.js for balanced braces/parens
const fs = require('fs');
const code = fs.readFileSync('api/utils-tools.js', 'utf8');
const lines = code.split('\n');

// For each line, track brace depth and paren depth
let globalDepth = { brace: 0, paren: 0 };
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let bDepth = 0, pDepth = 0;
  let inStr = false, strCh = '';
  for (let j = 0; j < line.length; j++) {
    const c = line[j];
    if (!inStr) {
      if (c === '{') bDepth++;
      else if (c === '}') bDepth--;
      else if (c === '(') pDepth++;
      else if (c === ')') pDepth--;
    }
    if (c === '"' || c === "'") {
      if (!inStr) { inStr = true; strCh = c; }
      else if (c === strCh) { inStr = false; }
    }
  }
  globalDepth.brace += bDepth;
  globalDepth.paren += pDepth;
  if (globalDepth.brace < 0 || globalDepth.paren < 0 || 
      (i >= 235 && i <= 245)) {
    console.log(`L${i+1}: brace=${globalDepth.brace} paren=${globalDepth.paren} | ${line.trim().slice(0,90)}`);
  }
}
console.log(`\nFinal: brace=${globalDepth.brace} paren=${globalDepth.paren}`);
console.log(globalDepth.brace !== 0 || globalDepth.paren !== 0 ? 'IMBALANCED!' : 'Balanced!');
