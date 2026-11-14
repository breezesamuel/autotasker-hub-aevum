/**
 * reencode-utils.cjs — Fix UTF-8 corruption and syntax errors in utils-tools.js
 */
const fs = require('fs');
let code = fs.readFileSync('api/utils-tools.js', 'utf8');

// Step 1: Fix corrupted Chinese characters in CN_PROVINCES
const PROVINCES = {
  11: '北京', 12: '天津', 13: '河北', 14: '山西', 15: '内蒙古',
  21: '辽宁', 22: '吉林', 23: '黑龙江', 31: '上海', 32: '江苏',
  33: '浙江', 34: '安徽', 35: '福建', 36: '江西', 37: '山东',
  41: '河南', 42: '湖北', 43: '湖南', 44: '广东', 45: '广西',
  46: '海南', 50: '重庆', 51: '四川', 52: '贵州', 53: '云南',
  54: '西藏', 61: '陕西', 62: '甘肃', 63: '青海', 64: '宁夏',
  65: '新疆', 71: '台湾', 81: '香港', 82: '澳门',
};
const provLine = "const CN_PROVINCES = { " +
  Object.entries(PROVINCES).map(([k,v]) => `${k}: '${v}'`).join(', ') +
  " };";
code = code.replace(/const CN_PROVINCES = \{[^}]+\};/, provLine);

// Step 2: Fix defillama_pools closing - should be })) }; not })); 
// Pattern: ilRisk: p.ilRisk })) followed by ); on next line or same line
code = code.replace(/ilRisk: p\.ilRisk \}\)\)\;/g, 'ilRisk: p.ilRisk }))');
code = code.replace(/ilRisk: p\.ilRisk \}\)\n/   , 'ilRisk: p.ilRisk }))\n');

// Step 3: Remove extra closing brace before default
// Look for }\n    }\n    default: and replace with }\n    default:
code = code.replace(/\n    }\n    }\n    default:/g, '\n    }\n    default:');

// Step 4: Also ensure hn_front_page return is properly closed
// It should end with: }) ) };  not }) ) ;
code = code.replace(
  /createdAt: h\.created_at \}\) \);/,
  'createdAt: h.created_at }))'
);

fs.writeFileSync('api/utils-tools.js', code, 'utf8');
console.log('Re-encoded and syntax-fixed.');

// Verify
try {
  const mod = require('./api/utils-tools');
  console.log('UTIL_TOOLS count:', mod.UTIL_TOOLS.length);
  const names = mod.UTIL_TOOLS.map(t => t.name);
  console.log('All tools:', names.join(', '));
  const newOnes = ['defillama_chains','defillama_pools','espn_sports_news','hn_front_page','gh_repo_info','translate_text'];
  for (const n of newOnes) {
    console.log(`  ${n}: ${names.includes(n) ? 'OK' : 'MISSING'}`);
  }
} catch(e) {
  console.error('Require failed:', e.message);
}
