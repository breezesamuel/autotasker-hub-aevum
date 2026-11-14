const fs = require('fs');
let code = fs.readFileSync('api/utils-tools.js', 'utf8');
// Find all remaining bad patterns: "} },required:" or "} ,required:" etc
const before = code.match(/inputSchema:[^}]*\}\s*,required:/g) || [];
console.log('remaining bad patterns:', before.length);
before.forEach((p,i)=>console.log(`  ${i+1}: ${p.slice(0,80)}...`));
if(before.length>0){ console.log('STILL BROKEN - manual fix needed'); } else { console.log('all fixed'); }
