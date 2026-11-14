// cross-line-scan.cjs — Track brace/paren depth ACROSS lines (no reset)
const fs = require('fs');
const code = fs.readFileSync('api/utils-tools.js', 'utf8');
const lines = code.split('\n');

let brace = 0, paren = 0;
for (let i = 0; i < lines.length; i++) {
  const oldB = brace, oldP = paren;
  for (const c of lines[i]) {
    if (c === '{') brace++;
    else if (c === '}') brace--;
    else if (c === '(') paren++;
    else if (c === ')') paren--;
  }
  if (brace < 0 || paren < 0) {
    console.log(`L${i+1}: b=${oldB}->${brace} p=${oldP}->${paren} | ${lines[i].trim().slice(0,90)}`);
  }
}
console.log(`\nFinal: brace=${brace}, paren=${paren}`);
console.log(brace===0 && paren===0 ? 'BALANCED!' : 'IMBALANCED');
