// fix-utils-syntax.cjs — Fix syntax errors in utils-tools.js without corrupting UTF-8
const fs = require('fs');
let code = fs.readFileSync('api/utils-tools.js', 'utf8');

// Fix defillama_pools: ends with })); -> should be })) };
code = code.replace(
  /ilRisk: p\.ilRisk \}\)\);/,
  'ilRisk: p.ilRisk }))'
);

// Fix extra closing brace before default
code = code.replace(/\n    }\n    }\n    default:/, '\n    }\n    default:');

fs.writeFileSync('api/utils-tools.js', code, 'utf8');
console.log('Fixed. Lines after:', code.split('\n').length);

// Verify
const { UTIL_TOOLS } = require('./api/utils-tools');
console.log(`UTIL_TOOLS count: ${UTIL_TOOLS.length}`);
console.log('Tools with new ones:', UTIL_TOOLS.map(t => t.name).filter(n => ['defillama_chains','defillama_pools','espn_sports_news','hn_front_page','gh_repo_info','translate_text'].includes(n)).join(', '));