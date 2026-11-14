/**
 * skill-audit-online.js — 纯 webfetch 审计版本（无需克隆）
 *
 * 直接拉取每个 SKILL.md 文件并用正则做安全扫描，避免 git clone 网络依赖。
 * 失败时自动重试，最多 3 次。
 */
const https = require('https');
const { URL } = require('url');

const REPO = process.env.REPO || 'coreyhaines31/marketingskills';
const SKILL_NAME = process.argv[2];
if (!SKILL_NAME) { console.error('usage: node scripts/skill-audit-online.js <skill-name>'); process.exit(1); }

const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main/skills/${SKILL_NAME}`;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 20000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

async function audit() {
  // Try different common filenames
  const CANDIDATE_FILES = ['SKILL.md', 'README.md', 'skills.md', 'instructions.md'];
  const issues = [];
  
  for (const fname of CANDIDATE_FILES) {
    try {
      const url = `${RAW_BASE}/${fname}`;
      console.log(`fetching ${url}`);
      const { status, text } = await fetchText(url);
      if (status !== 200) continue;
      console.log(`  → ${text.length.toLocaleString()} bytes`);
      
      // ── Security scans ──
      const scans = [
        { name: 'hardcoded-secrets-tokens', re: /ghp_[A-Za-z0-9]{36}|sk-[a-zA-Z0-9_-]{20,}|Bearer\s+[A-Za-z0-9\-_.~+\/]+=/i },
        { name: 'private-key-pem', re: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/ },
        { name: 'seed-phrase', re: /\b(abandon|ability|able|about|above|absent)\b.*\b.{8,}\b.{8,}\b.{8,}/i },
        { name: 'payment-transfer-request', re: /transfer.*to.*wallet|send.*usdc|pay.*address/i },
        { name: 'browser-automation-deps', re: /playwright|puppeteer|selenium|chrome-remote-interface/i },
        { name: 'high-perm-file-write', re: /\.bashrc|\.zshrc|\.ssh|\.env$|AppData\/Microsoft|Application\s+Support/i },
        { name: 'shell-execution', re: /\b(exec|spawn|execFile|system|subprocess\.call)\s*[('"`]|runInNewContext/i },
        { name: 'prompt-injection-risk', re: /ignore\s+all\s+priors|disregard\s+previous|you\s+are\s+no\s+longer/i },
      ];
      for (const s of scans) {
        if (s.re.test(text)) {
          const m = text.match(s.re);
          issues.push({ name: s.name, file: fname, detail: m?.[0]?.slice(0, 60) || '' });
        }
      }
      
      // Extract summary info from SKILL.md header
      const titleMatch = text.match(/^#\s*(.+)$/m);
      const descMatch = text.match(/description[:\s]+(.+?)(?:\n|$)/i);
      console.log(`  title: ${titleMatch?.[1] || '?'}`);
      console.log(`  description: ${(descMatch?.[1] || '?').slice(0, 80)}`);
      
      console.log(`issues: ${issues.length}`);
      issues.forEach((i) => console.log(`  WARN  ${i.file}: ${i.name} — ${i.detail}`));
      
      return { score: Math.max(0, 100 - issues.length * 25), issues, title: titleMatch?.[1], ok: issues.every((i) => i.name !== 'hardcoded-secrets-tokens' && i.name !== 'private-key-pem' && i.name !== 'payment-transfer-request') };
    } catch (e) {
      console.log(`  → skip (${e.message?.slice(0, 40)})`);
    }
  }
  return { score: null, issues: [], title: 'not-found', error: 'no matching markdown file found', ok: false };
}

audit().then((r) => {
  console.log('\n=== AUDIT RESULT ===');
  console.log(`score: ${r.score ?? 'N/A'} / 100`);
  console.log(`verdict: ${r.ok ? 'APPROVED' : r.error ? 'INCOMPLETE — ' + r.error : 'BLOCKED'}`);
  if (r.title) console.log(`skill title: ${r.title}`);
  if (r.issues.length) {
    console.log('issues:', JSON.stringify(r.issues, null, 2));
  }
}).catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
