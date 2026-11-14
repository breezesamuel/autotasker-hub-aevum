/**
 * api-directory-submit.js — API目录自动提交引擎
 *
 * 目标平台：
 *   1. RapidAPI Hub — 最大API市场
 *   2. Hugging Face Spaces — ML/AI社区
 *   3. Postman Public Workspaces
 *   4. GitHub Repositories (auto-readme更新)
 *
 * 策略：每个平台提交一次后记录到 submissions.json，避免重复提交。
 * 失败不阻塞主流程。
 */
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUB_FILE = path.join(ROOT, 'data', 'api-submissions.json');
const BASE_URL = 'https://autotasker.highkingflower.com';

function loadState() {
  try { return JSON.parse(fs.readFileSync(SUB_FILE, 'utf8')); }
  catch (e) { return { version: 1, submissions: [], updatedAt: null }; }
}
function saveState(st) { st.updatedAt = new Date().toISOString(); try { fs.mkdirSync(path.dirname(SUB_FILE), { recursive: true }); fs.writeFileSync(SUB_FILE, JSON.stringify(st, null, 2)); } catch (e) {} }

function alreadySubmitted(platform, endpoint) {
  const st = loadState();
  return st.submissions.some(s => s.platform === platform && s.endpoint === endpoint && s.status === 'submitted');
}
function recordSubmission(platform, endpoint, status, extra) {
  const st = loadState();
  const idx = st.submissions.findIndex(s => s.platform === platform && s.endpoint === endpoint);
  const rec = { platform, endpoint, status, submittedAt: new Date().toISOString(), ...extra };
  if (idx >= 0) st.submissions[idx] = rec;
  else st.submissions.push(rec);
  saveState(st);
}

// ── RapidAPI (via public API if available, otherwise just log) ────────────────
async function submitToRapidAPI() {
  if (alreadySubmitted('rapidapi', BASE_URL)) { console.log('[rapidapi] already submitted'); return; }
  // RapidAPI doesn't have a public auto-submit API — manual review required.
  // Instead, we prepare the listing data and log it for later manual submission.
  const listing = {
    name: 'AutoTasker Hub - Chinese Social Media Trending API',
    description: 'Real-time trending data from Weibo, Zhihu, Douban, Bilibili, Tieba. x402 USDC payment on Base mainnet.',
    tags: ['trending', 'china', 'social-media', 'data', 'x402', 'web3'],
    baseUrl: BASE_URL,
    pricingModel: 'pay-per-call',
    exampleEndpoint: `${BASE_URL}/api/x402/hotlist?board=weiboHot&limit=3`,
    supportedFormats: ['JSON', 'XML/RSS'],
    languages: ['Chinese', 'English', 'Japanese', 'Korean'],
    createdAt: new Date().toISOString(),
  };
  console.log('[rapidapi] Listing prepared (manual submission recommended):', JSON.stringify(listing, null, 2).slice(0, 400));
  recordSubmission('rapidapi', BASE_URL, 'prepared', listing);
}

// ── Hugging Face (via gradio space if configured) ────────────────────────────
async function submitToHuggingFace() {
  if (alreadySubmitted('huggingface', BASE_URL)) { console.log('[huggingface] already submitted'); return; }
  // Hugging Face has an API for dataset/model listing but not direct API marketplace.
  // Prepare markdown for README update instead.
  const readme = `# AutoTasker Hub — Chinese Social Media Trending API

\`\`\`python
import requests

response = requests.get('${BASE_URL}/api/x402/hotlist', params={
  'board': 'weiboHot',
  'limit': 10
})
print(response.json())
\`\`\`

## Features
- Real-time trending from Weibo, Zhihu, Douban, Bilibili, Tieba
- x402 USDC on-chain settlement
- MCP protocol support
- Free sample: GET ${BASE_URL}/api/x402/sample?limit=5

## Pricing
- Hot list: $0.05/call
- Search: $0.05/call  
- Full export: $0.50/call
- Utilities: $0.01/call
`;
  console.log('[huggingface] README prepared for space integration');
  console.log(readme);
  recordSubmission('huggingface', BASE_URL, 'prepared', { readmeLength: readme.length });
}

// ── Postman (generate collection JSON) ───────────────────────────────────────
function generatePostmanCollection() {
  const collection = {
    info: { name: 'AutoTasker Hub API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: [
      { name: 'Hot List', request: { method: 'GET', url: { raw: `${BASE_URL}/api/x402/hotlist?board=weiboHot&limit=10`, host: [BASE_URL.replace('https://', '')], path: ['api', 'x402', 'hotlist'], query: [{ key: 'board', value: 'weiboHot' }, { key: 'limit', value: '10' }] } } },
      { name: 'Search', request: { method: 'GET', url: { raw: `${BASE_URL}/api/x402/search?q=test&limit=5`, host: [BASE_URL.replace('https://', '')], path: ['api', 'x402', 'search'], query: [{ key: 'q', value: 'test' }, { key: 'limit', value: '5' }] } } },
      { name: 'Free Sample', request: { method: 'GET', url: { raw: `${BASE_URL}/api/x402/sample?limit=3`, host: [BASE_URL.replace('https://', '')], path: ['api', 'x402', 'sample'], query: [{ key: 'limit', value: '3' }] } } },
      { name: 'Status', request: { method: 'GET', url: { raw: `${BASE_URL}/api/status`, host: [BASE_URL.replace('https://', '')], path: ['api', 'status'] } } },
    ],
  };
  return JSON.stringify(collection, null, 2);
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const argv = process.argv.slice(2);
  const targets = argv.filter(a => !a.startsWith('--'));
  const force = argv.includes('--force');

  console.log('[api-directory] running submissions...\n');

  if (!targets.length || targets.includes('all') || targets.includes('rapidapi')) {
    await submitToRapidAPI();
  }
  if (!targets.length || targets.includes('all') || targets.includes('huggingface')) {
    await submitToHuggingFace();
  }

  // Always generate Postman collection (file output, no network needed)
  const postmanJson = generatePostmanCollection();
  const postmanFile = path.join(ROOT, 'public', 'postman-collection.json');
  fs.mkdirSync(path.dirname(postmanFile), { recursive: true });
  fs.writeFileSync(postmanFile, postmanJson, 'utf8');
  console.log(`\n[postman] Collection saved to public/postman-collection.json`);
  recordSubmission('postman', BASE_URL, 'generated', { file: postmanFile, endpoints: 4 });

  const st = loadState();
  console.log(`\n[summary] ${st.submissions.length} directories tracked:`);
  for (const s of st.submissions) console.log(`  ${s.platform}: ${s.status} (${s.endpoint})`);
})();

module.exports = { generatePostmanCollection, submitToRapidAPI, submitToHuggingFace, alreadySubmitted };
