// fix-schema.cjs — Write correct UTIL_TOOLS entries inline
const fs = require('fs');
let code = fs.readFileSync('api/utils-tools.js', 'utf8');

// Fix each broken tool definition line by replacing the whole entry
const fixes = {
  "inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'integer',default:5,maximum:20}} },required:['query']} },":
    "inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'integer',default:5,maximum:20}},required:['query']} },",
  "inputSchema:{type:'object',properties:{word:{type:'string'} },required:['word']} },":
    "inputSchema:{type:'object',properties:{word:{type:'string'}},required:['word']} },",
  "inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'integer',default:3,maximum:10}} },required:['query']} },":
    "inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'integer',default:3,maximum:10}},required:['query']} },",
  "inputSchema:{type:'object',properties:{text:{type:'string'},tone:{type:'boolean',default:true}} },required:['text']} },":
    "inputSchema:{type:'object',properties:{text:{type:'string'},tone:{type:'boolean',default:true}},required:['text']} },",
};

for (const [old, nw] of Object.entries(fixes)) {
  const count = (code.match(old.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))||[]).length;
  if (count > 0) {
    console.log(`Replacing ${count} occurrence(s): ${old.slice(0,60)}...`);
    code = code.split(old).join(nw);
  }
}

// Also fix any remaining patterns: "} },required:["  →  "},required:["  (with space after })
code = code.replace(/\}\s*,required:/g, '},required:');

fs.writeFileSync('api/utils-tools.js', code, 'utf8');
console.log('Done.');

try {
  const m = require('./api/utils-tools');
  console.log(`OK — ${m.UTIL_TOOLS.length} tools loaded`);
} catch(e) {
  console.error('FAILED:', e.message.slice(0,200));
  const lm = e.stack.match(/utils-tools\.js:(\d+)/);
  if(lm){const ln=parseInt(lm[1]);const ls=code.split('\n');for(let i=Math.max(0,ln-4);i<Math.min(ls.length,ln+3);i++)console.log(`${i+1}: ${ls[i]}`);}
}
