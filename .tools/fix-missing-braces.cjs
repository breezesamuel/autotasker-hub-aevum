// fix-missing-braces.cjs — Find and fix lines with .map(... ending with ); instead of });
const fs = require('fs');
let code = fs.readFileSync('api/utils-tools.js', 'utf8');
const fixes = [];

// Pattern: "...map(function(...){" ... "})" followed by ");" (missing closing })
// Correct: "})" followed by "};" 
code = code.replace(/\.map\(function\([^)]*\)\{return [^;]+;\}\);\n/g, '.map(function($1){return $2;})});\n');

// Simpler: find any line that has .map(function(x){...});) — i.e., ends with ");}" 
// Actually let me just do direct string replacements
const patterns = [
  // L253: spdx_licenses
  { old: 'sample:d.licenses.slice(0,10).map(function(l){return l.licenseId;});', new: 'sample:d.licenses.slice(0,10).map(function(l){return l.licenseId;})}}' },
  // L277: defillama_chains  
  { old: 'chains:top.map(function(c){return {name:c.name,symbol:c.tokenSymbol,tvlUsd:c.tvl,geckoId:c.gecko_id,chainId:c.chainId;});', new: 'chains:top.map(function(c){return {name:c.name,symbol:c.tokenSymbol,tvlUsd:c.tvl,geckoId:c.gecko_id,chainId:c.chainId}});' },
  // L284: defillama_pools
  { old: 'pools:items.slice(0,limit).map(function(p){return {pool:p.pool,chain:p.chain,project:p.project,symbol:p.symbol,tvlUsd:p.tvlUsd,apy:p.apy,apyBase:p.apyBase,apyReward:p.apyReward,ilRisk:p.ilRisk;});', new: 'pools:items.slice(0,limit).map(function(p){return {pool:p.pool,chain:p.chain,project:p.project,symbol:p.symbol,tvlUsd:p.tvlUsd,apy:p.apy,apyBase:p.apyBase,apyReward:p.apyReward,ilRisk:p.ilRisk}});' },
  // L297: hn_front_page
  { old: 'stories:(d.hits||[]).map(function(h){return {title:h.title,points:h.points,comments:h.num_comments,url:h.url,author:h.author,createdAt:h.created_at;});', new: 'stories:(d.hits||[]).map(function(h){return {title:h.title,points:h.points,comments:h.num_comments,url:h.url,author:h.author,createdAt:h.created_at}});' },
];

for (const p of patterns) {
  if (code.includes(p.old)) {
    const count = (code.match(p.old.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')) || []).length;
    console.log(`Found ${count} occurrence(s) of: ${p.old.slice(0,60)}...`);
    code = code.split(p.old).join(p.new);
    fixes.push(p.old.slice(0, 50));
  } else {
    console.log(`NOT FOUND: ${p.old.slice(0, 60)}...`);
  }
}

fs.writeFileSync('api/utils-tools.js', code, 'utf8');
console.log('\nApplied fixes:', fixes.length);

try {
  delete require.cache[require.resolve('./api/utils-tools')];
  const m = require('./api/utils-tools');
  console.log(`OK — ${m.UTIL_TOOLS.length} tools loaded`);
} catch(e) {
  console.error('STILL ERR:', e.message.slice(0, 200));
  const lm = e.stack.match(/utils-tools\.js:(\d+)/);
  if(lm){const ln=parseInt(lm[1]);const ls=code.split('\n');for(let k=Math.max(0,ln-4);k<Math.min(ls.length,ln+3);k++)console.log(`${k+1}: ${ls[k]}`);}
}
