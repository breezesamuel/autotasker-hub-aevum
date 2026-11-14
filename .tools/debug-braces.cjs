const fs = require('fs');
let code = fs.readFileSync('api/utils-tools.js', 'utf8');
console.log('Total lines:', code.split('\n').length);

// Show raw content of lines 33-40 with char codes
const lines = code.split('\n');
for (let i = 32; i <= 40; i++) {
  const l = lines[i];
  console.log(`L${i+1} len=${l.length}: ${l}`);
  // Find positions of all braces and brackets
  let depth = 0;
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '{') { depth++; process.stdout.write(`{$j `); }
    else if (l[j] === '}') { depth--; process.stdout.write(`}$j(${depth}) `); }
    else if (l[j] === '[') { process.stdout.write(`[${j} `); }
    else if (l[j] === ']') { process.stdout.write(`]${j} `); }
    else if (l[j] === ',') { process.stdout.write(`/${j} `); }
  }
  console.log();
}
