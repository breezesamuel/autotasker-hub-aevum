/**
 * skill-audit.js — GitHub 技能源码安全审计 + 自动审查报告
 *
 * 对候选技能执行以下检查：
 *   [X] prompt injection: LLM 是否在 SKILL.md 中注入危险指令
 *   [X] network calls: 是否调用外部敏感 API / 上传数据
 *   [X] crypto keys: 是否包含私钥/seed/访问 token
 *   [X] file ops: 是否要求读取/写入用户敏感文件
 *   [Y] execution: 是否允许 shell/mkdir/rm 等高危操作
 *   [Y] payment: 是否要求任何链上转账或资金操作
 *   [Y] auth: 是否索要认证凭据或 OAuth scope
 *
 * Usage: node scripts/skill-audit.js <repo-owner/repo> <skill-name>
 * Example: node scripts/skill-audit.js coreyhaines31/marketingskills ai-seo
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = process.argv[2];
const SKILL_NAME = process.argv[3];
if (!REPO || !SKILL_NAME) {
  console.error('usage: node scripts/skill-audit.js <owner/repo> <skill-folder>');
  process.exit(1);
}

// Safe temp dir in user's home (outside any repo)
const CLONE_DIR = path.join(process.env.TEMP || '/tmp', 'skill-audit-' + Date.now());

try {
  console.log(`== auditing ${REPO}/${SKILL_NAME} ==`);
  console.log(`cloning to ${CLONE_DIR}`);
  
  // 只克隆目标技能文件夹（稀疏 checkout 不可靠时简化处理）
  try {
    // Use spawnSync (safer than execSync with backticks on Windows)
    const { spawnSync } = require('child_process');
    const gitOut = spawnSync('git', ['clone', '--depth=1', `https://github.com/${REPO}.git`, CLONE_DIR], { stdio: 'pipe' });
    if (gitOut.status !== 0) throw new Error(gitOut.stderr?.toString() || gitOut.stdout?.toString() || 'git clone failed');
  } catch (e) {
    console.error('clone failed:', e.message?.slice(0, 200));
    process.exit(1);
  }
  
  const skillDir = path.join(CLONE_DIR, SKILL_NAME);
  if (!fs.existsSync(skillDir)) {
    console.error(`skill dir not found: ${skillDir}`);
    process.exit(1);
  }
  
  // Find all markdown files under skill directory
  function findFiles(dir, ext) {
    let out = [];
    for (const f of fs.readdirSync(dir, { recursive: true })) {
      if (f.endsWith(ext)) out.push(path.join(dir, f));
    }
    return out;
  }
  
  const allFiles = findFiles(skillDir, '.md');
  const skills = allFiles.filter((f) => {
    const b = path.basename(f).toLowerCase();
    return b === 'skill.md' || b === 'readme.md' || b === 'skills.md';
  });
  
  // Read all source/code files too
  const codeFiles = findFiles(skillDir, '.js').concat(findFiles(skillDir, '.py'))
    .filter((f) => !f.includes('node_modules'));
  
  console.log(`files: ${allFiles.length} md, ${codeFiles.length} code`);
  
  const risks = [];
  const issues = [];
  const summary = { ok: true, score: 100 };
  
  function check(label, pattern, msg, severity = 'warn') {
    for (const fp of [...skills, ...codeFiles]) {
      const content = fs.readFileSync(fp, 'utf8');
      if (pattern.test(content)) {
        issues.push({ label, file: path.relative(skillDir, fp), severity, match: pattern.source.slice(0, 60) });
        if (severity === 'blocker') {
          risks.push({ label, file: path.relative(skillDir, fp), msg });
          summary.ok = false;
          summary.score -= 40;
        } else if (severity === 'warn') {
          summary.score -= 10;
        }
      }
    }
  }
  
  // ── Checks ───────────────────────────────────────────────────────────────
  check('prompt-inject-hardcoded',
    /prompts?\s*=\s*['"`][^'"`]{50,}/i, 'hardcoded long prompt string', 'warn');
  check('exec-shell',
    /\b(exec|spawn|system|subprocess\.call)\s*[('"`]|new\s+ChildProcess/i, 'shell command execution in code', 'blocker');
  check('network-sensitive-apis',
    /(api\.github\.com\/v4|graph\.facebook\.com|stripe\.com|openai\.com\/v1)/i, 'calls to sensitive third-party APIs', 'warn');
  check('private-key-pattern',
    /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/, 'contains PEM private key blocks', 'blocker');
  check('seed-phrase',
    /\b(abandon|ability|able|about|above|absent|absorb)\b.*\b.{6,}\b.{6,}\b.{6,}/i, 'possible BIP39 seed phrase', 'blocker');
  check('wallet-address-patterns',
    /0x[a-fA-F0-9]{40}|bc1q[a-zA-HJ-NP-Z0-9]{39,59}|base16\w{64,}/, 'crypto wallet address literals', 'warn');
  check('auth-tokens',
    /ghp_|sk-proj-|AIzaSy|Bearer\s+[a-zA-Z0-9\-_.~+/]+=*/, 'looks like auth token patterns', 'blocker');
  check('file-write-to-home',
    /\.bashrc|\.zshrc|\.ssh|\.env|config\/keys|AppData|Application\s+Support/i, 'writes to sensitive user paths', 'warn');
  check('payment-request',
    /transfer.*to|send.*usdc|pay.*wallet|wire.*address|mint.*token/i, 'requests payment transfer', 'blocker');
  check('oauth-scope-high',
    /repo|admin:org|read:user|user:email|gist/i, 'requests broad OAuth scopes', 'warn');
  check('browser-automation',
    /playwright|puppeteer|selenium/i, 'uses browser automation tooling', 'warn');
  check('rate-limit-violations',
    /scrape|crawl|spider|harvest|aggregat/i, 'web scraping / aggregation logic', 'info');
  check('instructional-prompts',
    /you must|do not skip|never say|always do|critical instruction/i, 'strong instructional tone (check for manipulation)', 'info');
  check('data-exfiltration',
    /curl.*POST.*-d.*secret|fetch\(.*body.*JSON.*secret|upload.*external/i, 'uploads data to external endpoint', 'blocker');
  
  // Also scan for dangerous file permissions patterns
  for (const fp of codeFiles) {
    const c = fs.readFileSync(fp, 'utf8');
    // Check for suspicious require/import chains
    const reqs = c.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g) || [];
    const mods = new Set(reqs.map((r) => r.replace(/[require\(\)"']/g, '').trim()));
    // Flag if it requires fs + http together (can read files AND send over network)
    if (mods.has('fs') && mods.has('http')) {
      issues.push({ label: 'fs+http combined', file: path.relative(skillDir, fp), severity: 'warn',
        match: 'requires both fs and http modules' });
    }
  }
  
  // ── Report ────────────────────────────────────────────────────────────────
  console.log('');
  console.log(`audit score: ${Math.max(0, summary.score)} / 100`);
  console.log(`verdict: ${summary.ok ? 'APPROVED' : 'BLOCKED'} (${issues.length} issues)`);
  console.log('');
  if (issues.length === 0) {
    console.log('no issues found — clean install recommended');
  } else {
    console.log('ISSUES:');
    issues.forEach((i, idx) => {
      console.log(`  ${idx + 1}. [${i.severity.toUpperCase().padEnd(8)}] ${i.label} | ${i.file} | ${i.match.slice(0, 80)}`);
    });
  }
  console.log('');
  console.log('FILES REVIEWED:');
  [...skills, ...codeFiles].forEach((fp) => console.log('  ' + path.relative(skillDir, fp)));
  
  // Cleanup clone (Windows-safe)
  try {
    const { spawnSync } = require('child_process');
    spawnSync('rmdir', ['/s', '/q', CLONE_DIR], { stdio: 'pipe' });
  } catch (e) {}
  
} catch (e) {
  console.error('AUDIT FAILED:', e.message);
  process.exit(1);
}
