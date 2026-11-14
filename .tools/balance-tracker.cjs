// balance-tracker.cjs v2 — Fixed scoping
const fs = require('fs');
const code = fs.readFileSync('api/utils-tools.js', 'utf8');
const lines = code.split('\n');

function analyze(label, startLine, endLine) {
  let brace = 0, paren = 0;
  const results = [];
  for (let i = startLine - 1; i < Math.min(endLine, lines.length); i++) {
    const line = lines[i];
    let pb = paren, bb = brace;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '(') paren++;
      else if (c === ')') paren--;
      else if (c === '{') brace++;
      else if (c === '}') brace--;
      if ((paren < pb || brace < bb) && (paren < 0 || brace < 0)) {
        results.push({ line: i+1, col: j+1, before: `{b:${bb}p:${pb}}`, after: `{b:${brace}p:${paren}}`, text: line.trim().slice(0,90) });
        pb = paren; bb = brace;
      }
    }
  }
  console.log(`\n=== ${label} (lines ${startLine}-${endLine}) ===`);
  console.log(`Start: brace=${brace-startLine>0?0:0} paren=0  End: brace=${brace} paren=${paren}`);
  results.forEach(r => console.log(`L${r.line}C${r.col}: ${r.before}->${r.after} | ${r.text}`));
  return { endBrace: brace, endParen: paren, issues: results };
}

const r1 = analyze('Lines 1-250', 1, 250);
const r2 = analyze('Lines 250-320', 250, 320);
console.log('\n=== OVERALL ===');
console.log(`Final brace depth: ${r2.endBrace}, Final paren depth: ${r2.endParen}`);
if (r2.endBrace !== 0 || r2.endParen !== 0) {
  // Find where depth diverges from expected
  brace = 0; paren = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j < lines[i].length; j++) {
      const c = lines[i][j];
      if (c === '(') paren++;
      else if (c === ')') paren--;
      else if (c === '{') brace++;
      else if (c === '}') brace--;
      if (i >= 285 && i <= 300 && (paren < -1 || brace < 0)) {
        console.log(`L${i+1}C${j+1}: b=${brace} p=${paren} | ${lines[i].trim().slice(0,100)}`);
      }
    }
  }
}
