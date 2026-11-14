// find-current-error.cjs
const fs = require('fs');
let code = fs.readFileSync('api/utils-tools.js', 'utf8');
const lines = code.split('\n');

console.log('Total lines:', lines.length);
for (let i = 0; i < lines.length; i++) {
  if (i >= 238 && i <= 260) {
    console.log(`L${i+1}: ${lines[i].trim().slice(0,100)}`);
  }
}

try {
  delete require.cache[require.resolve('./api/utils-tools')];
  const m = require('./api/utils-tools');
  console.log(`OK tools: ${m.UTIL_TOOLS.length}`);
} catch(e) {
  const lm = e.stack.match(/utils-tools\.js:(\d+)/);
  if(lm){
    const ln=parseInt(lm[1]);
    console.log(`ERR at L${ln}: ${e.message.slice(0,150)}`);
    for(let k=Math.max(0,ln-3);k<Math.min(lines.length,ln+3);k++) console.log(`${k+1}: ${lines[k]}`);
  }
}
