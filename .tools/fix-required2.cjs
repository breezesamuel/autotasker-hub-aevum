// fix-required2.cjs — Fix 'required' arrays that are outside inputSchema
const fs = require('fs');
let code = fs.readFileSync('api/utils-tools.js', 'utf8');

// Strategy: find all "}},required:[" patterns and restructure them
// The bad pattern: inputSchema:{...,properties:{...}}},required:[...]}
//                       ^^^^^^^^^^^^^^^^^^^^^^^^     ^^^  ^^^
//                       properties close             req  tool close
// Correct:           inputSchema:{...,properties:{...}, required:[...]}},
//                                       ^insert here^
code = code.replace(/\}\},required:\[(.*?)\]\}/g, function(match, arr) {
  // match is like: }},required:[...]}
  // We want:      } ,required:[...]}  <- but that's still wrong
  // Actually we need to insert required INTO the inputSchema object
  // The pattern before this replace was: inputSchema:{type:'object',properties:{...}}},required:[...]
  // We need to change to:                  inputSchema:{type:'object',properties:{...},required:[...]}
  
  // This regex won't work with simple replace because the nesting is complex.
  // Let's use a line-by-line approach instead.
  return null; // will handle differently
});

// Actually, let's do a smarter replacement using position-based logic
const lines = code.split('\n');
const fixedLines = [];
for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  // Find lines that have trailing },required:...}, 
  // These are in the UTIL_TOOLS array definition
  const m = line.match(/inputSchema:\{([^}]+)\}\},required:\[(.*?)\]\}/);
  if (m) {
    // Rewrite: move required inside inputSchema
    const innerProps = m[1];
    const reqArr = m[2];
    // Replace the whole line section around inputSchema
    const old = line.substring(line.indexOf('inputSchema:'));
    const newPart = `inputSchema:{${innerProps}},required:[${reqArr}]}`;
    // Need to also remove the extra }} before required from the outer context
    // Simpler: just rebuild the line
    const prefix = line.substring(0, line.indexOf('inputSchema:'));
    const suffix = line.substring(line.indexOf('inputSchema:') + old.length);
    // The suffix after the matched part might contain ',} }' which closes the tool def
    line = prefix + newPart + suffix;
  }
  fixedLines.push(line);
}
code = fixedLines.join('\n');

// Now check for any remaining patterns
const remaining = (code.match(/\}\},required:/g)||[]).length;
console.log(`Remaining bad patterns: ${remaining}`);

fs.writeFileSync('api/utils-tools.js', code, 'utf8');
console.log('Written.');

try {
  const m = require('./api/utils-tools');
  console.log(`OK — ${m.UTIL_TOOLS.length} tools loaded`);
  console.log('All names:', m.UTIL_TOOLS.map(t=>t.name).join(', '));
} catch(e) {
  console.error('FAILED:', e.message.slice(0,200));
  const lm = e.stack.match(/utils-tools\.js:(\d+)/);
  if(lm){const ln=parseInt(lm[1]);const ls=code.split('\n');for(let i=Math.max(0,ln-4);i<Math.min(ls.length,ln+3);i++)console.log(`${i+1}: ${ls[i]}`);}
}
