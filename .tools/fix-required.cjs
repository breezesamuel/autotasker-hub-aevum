// fix-required.cjs — Move stray 'required' arrays inside inputSchema object
const fs = require('fs');
let code = fs.readFileSync('api/utils-tools.js', 'utf8');
const beforeCount = (code.match(/},required:/g)||[]).length;

// Fix: "}},required:[...]}  ->  "} },required:[...]}"
// This moves the closing brace of inputSchema BEFORE the required property
code = code.replace(/\}\},required:\[(.*?)\]\}/g, '} },required:[$1]}');

const afterCount = (code.match(/},required:/g)||[]).length;
console.log(`Fixed ${beforeCount - afterCount} occurrences`);

// Verify no more bad patterns
const remaining = (code.match(/\}\},required:/g)||[]).length;
console.log(`Remaining bad patterns: ${remaining}`);

fs.writeFileSync('api/utils-tools.js', code, 'utf8');

// Try requiring
try {
  const m = require('./api/utils-tools');
  console.log(`OK — ${m.UTIL_TOOLS.length} tools loaded`);
} catch(e) {
  console.error('REQUIRE FAILED:', e.message.slice(0,120));
  // Show context around error line
  const lines = code.split('\n');
  const lineNum = e.stack.match(/utils-tools\.js:(\d+)/)?.[1];
  if (lineNum) {
    for (let i=Math.max(0,parseInt(lineNum)-3);i<Math.min(lines.length,parseInt(lineNum)+3);i++){
      console.log(`${i+1}: ${lines[i]}`);
    }
  }
}
