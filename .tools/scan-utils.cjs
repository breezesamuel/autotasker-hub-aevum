// scan-utils.cjs — Find ALL syntax issues in utils-tools.js before requiring it
const fs = require('fs');
const code = fs.readFileSync('api/utils-tools.js', 'utf8');
const lines = code.split('\n');

// Count open/close braces per line and track running depth
let depth = 0;
const issues = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '{') depth++;
    else if (line[j] === '}') depth--;
    else if (line[j] === '(') ; // skip parens for now
    else if (line[j] === ')') ;
  }
  if (depth < 0) {
    issues.push({ line: i + 1, char: j, depth, text: line.trim().slice(0, 80) });
    depth = 0;
  }
}
console.log('Final brace depth:', depth);
console.log('Issues:', JSON.stringify(issues, null, 2));

// Also find all return statements that end with semicolons inside objects (common source of errors)
const badReturns = lines.map((l, i) => ({ line: i + 1, text: l })).filter(x => /return.*};\s*$/.test(x.text) && !x.text.includes('//'));
console.log('Suspicious returns:', badReturns.map(x => `L${x.line}: ${x.text.slice(0,100)}`));
