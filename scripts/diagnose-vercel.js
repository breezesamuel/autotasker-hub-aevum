/**
 * diagnose-vercel.js — Check what's wrong with the Vercel deployment
 */
const { execSync } = require('child_process');
const https = require('https');

console.log('=== VERCEL DEPLOYMENT DIAGNOSTIC ===\n');

// 1. Check Vercel CLI status
try {
  const output = execSync('npx vercel whoami', { encoding: 'utf8', timeout: 30000 });
  console.log('Vercel CLI:', output.trim().slice(0, 100));
} catch(e) {
  console.log('Vercel CLI error:', e.message.slice(0, 100));
}

// 2. List deployments
try {
  const output = execSync('npx vercel list --limit 5', { encoding: 'utf8', timeout: 30000 });
  console.log('\nRecent deployments:');
  console.log(output);
} catch(e) {
  console.log('List error:', e.message.slice(0, 100));
}

// 3. Check if our domain exists
console.log('\n=== DOMAIN CHECKS ===');
const domains = [
  'autotasker-hub.vercel.app',
  'autotasker-kyn9q3c2c-solmount.vercel.app',
];
for (const d of domains) {
  try {
    const output = execSync(`nslookup ${d} 2>&1`, { encoding: 'utf8', timeout: 10000 });
    const hasIp = output.includes('Address:') && /\d+\.\d+\.\d+\.\d+/.test(output);
    console.log(`${d}: ${hasIp ? '✅ DNS resolved' : '❌ No DNS record'}`);
  } catch(e) {
    console.log(`${d}: ❌ DNS lookup failed`);
  }
}

// 4. Try to curl the endpoints directly
console.log('\n=== ENDPOINT TESTS ===');
const tests = [
  'https://autotasker-hub.vercel.app/api/status',
  'https://autotasker-hub.vercel.app/',
];
for (const url of tests) {
  try {
    const output = execSync(`curl.exe -s -o NUL -w "HTTP %{http_code} | Time: %{time_total}s" "${url}" --max-time 15 2>&1`, { encoding: 'utf8', timeout: 20000 });
    console.log(`${url}`);
    console.log(`  -> ${output.trim()}`);
  } catch(e) {
    console.log(`${url}: ❌ Connection failed`);
  }
}

// 5. Check the actual Vercel project URL from vercel.json or env
console.log('\n=== PROJECT CONFIG ===');
try {
  const vercelJson = require('./vercel.json');
  console.log('vercel.json:', JSON.stringify(vercelJson, null, 2));
} catch(e) {
  console.log('No vercel.json or parse error');
}

try {
  const pkg = require('./package.json');
  console.log('package.json name:', pkg.name);
} catch(e) {
  console.log('No package.json');
}

// 6. Check if there's a .vercel directory with project info
const fs = require('fs');
if (fs.existsSync('.vercel')) {
  console.log('\n=== .VERCEL DIRECTORY ===');
  const files = fs.readdirSync('.vercel');
  console.log('Files:', files.join(', '));
  const projFile = '.vercel/project.json';
  if (fs.existsSync(projFile)) {
    const proj = JSON.parse(fs.readFileSync(projFile, 'utf8'));
    console.log('Project slug:', proj.slug);
    console.log('Org slug:', proj.orgSlug);
    console.log('Team slug:', proj.teamSlug);
  }
} else {
  console.log('\nNo .vercel directory found');
}

console.log('\n=== SUGGESTED NEXT STEPS ===');
console.log('1. Run: npx vercel login (if not already logged in)');
console.log('2. Run: npx vercel link (to connect to existing project)');
console.log('3. Run: npx vercel --prod (re-deploy)');
console.log('4. If "12 function limit" error persists, check that no extra .js files exist in root');
console.log('5. Check Vercel dashboard: https://vercel.com/solmount/autotasker-hub');
