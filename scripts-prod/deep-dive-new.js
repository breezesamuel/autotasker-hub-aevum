/**
 * deep-dive-new.js — 深入探测新增的高价值可达 API 的响应结构。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
async function probe(label, url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const txt = await r.text();
    let d;
    try { d = JSON.parse(txt); } catch(e) { console.log(`[${label}] NOT JSON\n${txt.slice(0,100)}\n---\n`); return; }
    console.log(`\n=== ${label} ===`);
    if (Array.isArray(d)) {
      console.log('array len:', d.length);
      if (d[0]) console.log('sample keys:', Object.keys(d[0]).join(', '));
      if (d[0]) console.log('sample:', JSON.stringify(d[0]).slice(0, 250));
    } else if (typeof d === 'object') {
      console.log('top keys:', Object.keys(d).join(', '));
      for (const k of Object.keys(d).slice(0, 4)) {
        const v = d[k];
        if (Array.isArray(v)) console.log(`  .${k}[]: ${v.length} items, first keys: ${Object.keys(v[0]||{}).join(', ').slice(0,100)}`);
        else console.log(`  .${k}: ${JSON.stringify(v).slice(0,200)}`);
      }
    }
  } catch(e) { console.log(`[${label}] ERR: ${e.message.slice(0,80)}`); }
}
(async () => {
  // DeFiLlama chains
  await probe('DeFiLlama_chains', 'https://api.llama.fi/chains');
  // ESPN NFL news
  await probe('ESPN_NFL', 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news');
  // ESPN MLB news
  await probe('ESPN_MLB', 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news');
  // HN Algolia front page
  await probe('HN_FrontPage', 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=5');
  // GitHub repo
  await probe('GH_repos_autotasker', 'https://api.github.com/repos/breezesamuel/autotasker-hub-aevum');
  // MyMemory translate EN->ZH
  await probe('MyMemory_en_zh', 'https://api.mymemory.translated.net/get?q=hello%20world&langpair=en|zh-CN');
  // MyMemory translate ZH->EN
  await probe('MyMemory_zh_en', 'https://api.mymemory.translated.net/get?q=%E4%BD%A0%E5%A5%BD&langpair=zh|en');
  // DeFiLlama pools
  await probe('DeFiLlama_pools', 'https://yields.llama.fi/pools?page=0&limit=3');
})();
