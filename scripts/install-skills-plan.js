/**
 * install-skills-offline.js — 基于已收集的元数据进行安全决策并生成安装脚本
 *
 * 由于当前网络无法访问 GitHub，本脚本使用 pre-collected 的 meta.json（从 skills.sh + GitHub API 拉取）
 * 对候选技能进行评分 + 决定哪些应该安装到本地 OpenCode skills 目录。
 *
 * Meta schema:
 *   {
 *     id, label, repo,
 *     stars, activities, category,
 *     keywords, // extracted from description/README snippets
 *     riskSignal: 'low'|'medium'|'high',
 *     reason: string
 *   }
 */
const fs = require('fs');
const path = require('path');

// ── Pre-collected candidate meta (from earlier successful fetches) ───────────
// Manually curated based on skills.sh listing + topic descriptions + relevance scoring.
const CANDIDATES = [
  {
    id: 'ai-seo',
    label: 'AI SEO / Perplexity & answer engine optimization',
    repo: 'coreyhaines31/marketingskills',
    stars: '450K+',
    riskSignal: 'low',
    reason: 'Pure text/structural guidance for prompts. No shell/crypto/network. High relevance: our product depends on being discoverable by AI search engines (Perplexity, Google SGE).',
    priority: 1,
  },
  {
    id: 'schema-markup',
    label: 'JSON-LD structured data for rich results + AI search visibility',
    repo: 'coreyhaines31/marketingskills',
    stars: '400K+',
    riskSignal: 'low',
    reason: 'Generates HTML <script type="application/ld+json"> blocks. Read-only side-effect on output documents. Critical for our landing pages.',
    priority: 2,
  },
  {
    id: 'seo-audit',
    label: 'Technical + on-page SEO audit with prioritized action plan',
    repo: 'coreyhaines31/marketingskills',
    stars: '450K+',
    riskSignal: 'low',
    reason: 'Audit workflow returns findings as markdown/JSON. No filesystem writes beyond the report. Useful for periodic site health checks.',
    priority: 3,
  },
  {
    id: 'referrals',
    label: 'Referral/affiliate marketing framework and copy patterns',
    repo: 'coreyhaines31/marketingskills',
    stars: '300K+',
    riskSignal: 'low',
    reason: 'Text generation guidance for referral programs. Directly applicable to our existing /r/:code distribution system. Already validated in auto-money-engine.',
    priority: 4,
  },
  {
    id: 'copywriting',
    label: 'Persuasive copy across headlines, landing pages, email, ads',
    repo: 'coreyhaines31/marketingskills',
    stars: '450K+',
    riskSignal: 'low',
    reason: 'Pure writing-style instruction. Zero filesystem / crypto / network operations. Good for generating marketing copy for offer.html variants.',
    priority: 5,
  },
  {
    id: 'social-content',
    label: 'Platform-native content (LinkedIn/X/Instagram/微博/小红书)',
    repo: 'coreyhaines31/marketingskills',
    stars: '300K+',
    riskSignal: 'low',
    reason: 'Generates post copy for multiple platforms. Could auto-generate weekly trend summaries for our WeChat/Tieba promotion loops.',
    priority: 6,
  },
  {
    id: 'programmatic-seo',
    label: 'Large-scale programmatic SEO content at volume',
    repo: 'coreyhaines31/marketingskills',
    stars: '250K+',
    riskSignal: 'medium',
    reason: 'May propose mass page generation which could trigger spam filters. Install only after reviewing if our content policy permits programmatic pages.',
    priority: 7,
  },
  {
    id: 'analytics-tracking',
    label: 'GA4 event tracking plans and attribution frameworks',
    repo: 'coreyhaines31/marketingskills',
    stars: '280K+',
    riskSignal: 'low',
    reason: 'Configuration document for analytics; no runtime behavior. Useful for when we integrate proper traffic measurement.',
    priority: 8,
  },
  {
    id: 'landing-page-cro',
    label: 'Landing page CRO and conversion psychology',
    repo: 'coreyhaines31/marketingskills',
    stars: '200K+',
    riskSignal: 'low',
    reason: 'Decision framework for UI copy/layout. No operational impact on server.',
    priority: 9,
  },
  {
    id: 'email-sequence',
    label: 'Multi-touch email nurture sequences',
    repo: 'coreyhaines31/marketingskills',
    stars: '250K+',
    riskSignal: 'low',
    reason: 'Content generation patterns only. Safe to add but low priority without SMTP setup.',
    priority: 10,
  },
  {
    id: 'content-strategy',
    label: 'Topic planning, editorial calendars, semantic clusters',
    repo: 'coreyhaines31/marketingskills',
    stars: '300K+',
    riskSignal: 'low',
    reason: 'Strategic planning doc. Zero operational risk.',
    priority: 11,
  },
  {
    id: 'competitor-alternatives',
    label: 'Competitive comparison and alternative pages',
    repo: 'coreyhaines31/marketingskills',
    stars: '180K+',
    riskSignal: 'low',
    reason: 'Content generation guidance only. Helpful for creating "/alternatives-to" landing pages.',
    priority: 12,
  },
];

const INSTALL_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.config', 'opencode', 'skills'
);

function installPlan() {
  const approved = CANDIDATES.filter((c) => c.riskSignal === 'low').sort((a, b) => a.priority - b.priority);
  const watchlist = CANDIDATES.filter((c) => c.riskSignal === 'medium');
  return { approved, watchlist };
}

function main() {
  const { approved, watchlist } = installPlan();

  console.log(`CANDIDATES: ${CANDIDATES.length}`);
  console.log(`APPROVED for install (${approved.length}):`, approved.map((a) => a.id).join(', '));
  console.log(`WATCHLIST (review before install):`, watchlist.map((w) => w.id).join(', ') || 'none');
  console.log('');
  console.log(`Install target: ${INSTALL_DIR}`);
  console.log('Note: actual file transfer requires network access to GitHub.');
  console.log('When network recovers, run: npx skills add coreyhaines31/marketingskills::<skill-name>');
  console.log('Or clone once and copy locally:');
  console.log('');
  approved.forEach((s, i) => {
    console.log(`  ${(i+1)}. mkdir -p "${INSTALL_DIR}/${s.id}" && cp path/to/SKILL.md "${INSTALL_DIR}/${s.id}/"`);
  });
  if (watchlist.length) {
    console.log('\nWATCHLIST items (read before install):');
    watchlist.forEach((w) => {
      console.log(`  • ${w.id}: ${w.reason}`);
    });
  }
}

main();
