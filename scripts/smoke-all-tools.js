/**
 * smoke-all-tools.js — Call every registered tool for real and report pass/fail.
 * Usage: node scripts/smoke-all-tools.js [--json]
 */
const path = require('path');
const { UTIL_TOOLS, runUtil, PRICE_BY_TOOL } = require('../lib/utils-tools.js');

const ARGS = {
  // core
  weather: { city: 'Beijing' },
  fx_rates: { from: 'CNY', to: 'USD', amount: 1000 },
  public_holidays: { country: 'CN', year: 2026 },
  ip_geo: { ip: '8.8.8.8' },
  hn_search: { query: 'x402', limit: 3 },
  define_word: { word: 'serendipity' },
  arxiv_search: { query: 'transformer', limit: 2 },
  lunar_calendar: { date: 'today' },
  cn_id_validate: { id: '11010519491231002X' },
  pinyin_convert: { text: '自动化任务中心' },
  game_deals: { maxPrice: 5, limit: 3 },
  cat_fact: {},
  dog_breed_list: {},
  bored_activity: {},
  color_info: { hex: '#3366ff' },
  color_scheme: { hex: '#3366ff', count: 4 },
  datamuse_synonyms: { word: 'fast', limit: 5 },
  npm_search: { query: 'express', limit: 3 },
  spdx_licenses: { licenseId: 'MIT' },
  random_user: { count: 1 },
  comment_for_post: { postId: 1, limit: 3 },
  quote_today: {},
  defillama_chains: { limit: 5 },
  defillama_pools: { limit: 3 },
  espn_sports_news: { sport: 'nba', count: 2 },
  hn_front_page: { limit: 3 },
  gh_repo_info: { owner: 'coinbase', repo: 'agentkit' },
  translate_text: { text: 'hello world', from: 'en', to: 'zh-CN' },
  bitcoin_fees: {},
  btc_usd_rate: {},
  random_cat_image: {},
  random_dog_image: {},
  random_bear_image: {},
  random_dog_placeholder: {},
  // extra: CN
  baidu_hot: { limit: 5 },
  douyin_hot: { limit: 5 },
  douban_movie: { limit: 5 },
  ithome_news: { limit: 5 },
  thepaper_hot: { limit: 5 },
  wallstreetcn: { limit: 5 },
  juejin_hot: { limit: 5 },
  eastmoney_ashare: { limit: 5 },
  eastmoney_index: {},
  tencent_quote: { symbols: 'sh600519,sz000001' },
  qqmusic_toplist: { limit: 5 },
  netease_hot: { limit: 5 },
  // extra: global
  air_quality: { city: 'Beijing' },
  open_meteo_marine: { lat: 22.3, lon: 114.2 },
  sunrise_sunset: { lat: 39.9, lon: 116.4 },
  usgs_quake: { minMagnitude: 2.5, limit: 5 },
  carbon_intensity: {},
  erapi_fx: { base: 'USD', symbols: 'CNY,EUR,JPY' },
  worldbank_indicator: { country: 'CN', indicator: 'NY.GDP.MKTP.CD', limit: 3 },
  pubmed_search: { query: 'x402 payment', limit: 3 },
  crossref_search: { query: 'x402 protocol', limit: 3 },
  zenodo_search: { query: 'climate dataset', limit: 3 },
  openf1: {},
  iss_position: {},
  pypi_info: { package: 'requests' },
  crates_search: { query: 'serde', limit: 3 },
  codeforces_contests: { limit: 5, upcomingOnly: false },
  itunes_search: { term: 'lofi', media: 'music', limit: 3 },
  themealdb: { query: 'chicken' },
  openfoodfacts: { barcode: '737628064502' },
  jisho_search: { keyword: '猫', limit: 3 },
  university_search: { name: 'tsinghua', country: 'China' },
  opentdb_trivia: { amount: 3 },
  advice_slip: {},
  useless_fact: {},
  random_fox: {},
};

function preview(v) {
  try {
    const s = JSON.stringify(v);
    return s.length > 110 ? s.slice(0, 110) + '...' : s;
  } catch (e) { return String(v); }
}

(async () => {
  const results = [];
  const queue = UTIL_TOOLS.slice();
  const t0 = Date.now();

  async function worker() {
    while (queue.length) {
      const tool = queue.shift();
      const args = ARGS[tool.name] || {};
      const started = Date.now();
      try {
        const out = await runUtil(tool.name, args);
        const bytes = JSON.stringify(out || {}).length;
        const empty = bytes < 25;
        results.push({ name: tool.name, ok: !empty, ms: Date.now() - started, bytes, preview: preview(out) });
        console.log(`${empty ? 'WARN' : 'OK  '} ${tool.name.padEnd(24)} ${String(Date.now() - started).padStart(5)}ms ${String(bytes).padStart(6)}B  ${preview(out).slice(0, 80)}`);
      } catch (e) {
        results.push({ name: tool.name, ok: false, ms: Date.now() - started, error: String(e.message).slice(0, 140) });
        console.log(`FAIL ${tool.name.padEnd(24)} ${String(Date.now() - started).padStart(5)}ms  ${String(e.message).slice(0, 90)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));

  const ok = results.filter(r => r.ok);
  const fail = results.filter(r => !r.ok);
  console.log(`\n=== ${ok.length}/${results.length} PASS  (${((Date.now() - t0) / 1000).toFixed(1)}s) ===`);
  if (fail.length) {
    console.log('FAILURES:');
    for (const f of fail) console.log(`  - ${f.name}: ${f.error || 'empty response'}`);
  }
  const priced = Object.keys(PRICE_BY_TOOL).length;
  console.log(`Priced overrides: ${priced} | Tools: ${UTIL_TOOLS.length}`);

  if (process.argv.includes('--json')) {
    require('fs').writeFileSync(path.resolve(__dirname, '..', 'data', 'smoke-results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
    console.log('Saved data/smoke-results.json');
  }
  process.exit(fail.length ? 1 : 0);
})();
