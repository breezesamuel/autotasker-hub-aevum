/**
 * batch-audit.js — 批量审计营销增长类候选技能，输出可安装清单
 */
const { execSync, spawnSync } = require('child_process');
const path = require('path');

const REPO = 'coreyhaines31/marketingskills';
// Ordered by relevance to our project (中文社媒数据 + Web3分销)
const CANDIDATES = [
  { id: 'ai-seo',            label: 'AI SEO optimization for OpenAI Perplexity visibility' },
  { id: 'seo-audit',         label: 'Technical + on-page SEO audit with action plan' },
  { id: 'schema-markup',     label: 'Structured data for rich results / AI search' },
  { id: 'programmatic-seo',  label: 'Large-scale programmatic SEO content at volume' },
  { id: 'referrals',         label: 'Referral/affiliate marketing framework' },
  { id: 'copywriting',       label: 'Persuasive copy across all formats' },
  { id: 'social-content',    label: 'Platform-native social content (LinkedIn/X/Instagram)' },
  { id: 'landing-page-cro',  label: 'Landing page CRO and conversion psychology' },
  { id: 'content-strategy',  label: 'Topic planning and editorial frameworks' },
  { id: 'analytics-tracking',label: 'Event tracking, GA4 setup, attribution' },
  { id: 'email-sequence',    label: 'Multi-touch email sequences with personalization' },
  { id: 'competitor-alternatives', label: 'Competitive positioning pages' },
];

const results = [];
for (const c of CANDIDATES) {
  try {
    console.log(`\n== ${c.id} ==`);
    const out = execSync(
      `node scripts/skill-audit.js ${REPO} ${c.id}`,
      { encoding: 'utf8', timeout: 120000 }
    );
    // Parse score from output
    const scoreLine = out.match(/audit score:\s*(\d+)\s*\/\s*100/);
    const verdict = out.match(/verdict:\s*(\w+)/);
    const issues = (out.match(/\[(WARN|BLOCKER)\]/g) || []).length;
    const ok = verdict && verdict[1] === 'APPROVED';
    results.push({ ...c, score: scoreLine ? Number(scoreLine[1]) : null, verdict: verdict ? verdict[1] : 'unknown', issues, pass: ok });
    // Print just the relevant part
    console.log(out.slice(-500));
  } catch (e) {
    results.push({ ...c, error: e.message?.slice(0, 100), pass: false });
    console.log(`FAIL: ${e.message?.slice(0, 80)}`);
  }
}

console.log('\n\n=== SUMMARY ===');
const approved = results.filter((r) => r.pass);
const rejected = results.filter((r) => !r.pass);
console.log(`APPROVED (${approved.length}):`, approved.map((a) => a.id).join(', ') || 'none');
console.log(`REJECTED/BLOCKED (${rejected.length}):`, rejected.map((r) => `${r.id}(${r.error || r.verdict})`).join(', '));
console.log('\nINSTALL ORDER (by relevance for AutoTasker Hub):');
results.filter((r) => r.pass).forEach((r, i) => console.log(`  ${(i+1)}. ${r.id} — ${r.label}`));
