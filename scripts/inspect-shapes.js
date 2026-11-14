/**
 * inspect-shapes.js — Dump compact JSON skeletons for every new candidate we plan to ship,
 * so the parser code matches reality.
 */
const out = [];
function sk(v, depth = 0, maxDepth = 3) {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return `[${v.length}x ${depth < maxDepth ? sk(v[0], depth + 1, maxDepth) : (typeof v[0])}]`;
  }
  if (typeof v === 'object') {
    if (depth >= maxDepth) return `{${Object.keys(v).slice(0, 12).join(',')}}`;
    const parts = Object.keys(v).slice(0, 14).map(k => `${k}:${sk(v[k], depth + 1, maxDepth)}`);
    return `{${parts.join(', ')}}`;
  }
  const s = String(v);
  return typeof v === 'number' ? 'num' : typeof v === 'boolean' ? 'bool' : `"${s.slice(0, 40)}"`;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const H = { 'user-agent': UA, accept: 'application/json,text/plain,*/*', 'accept-language': 'zh-CN,zh;q=0.9' };

const TARGETS = [
  // China
  ['baidu_hot', 'https://top.baidu.com/api/board?platform=wise&tab=realtime'],
  ['douyin_hot', 'https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/'],
  ['douban_movie', 'https://m.douban.com/rexxar/api/v2/subject_collection/movie_showing/items?start=0&count=10', { referer: 'https://m.douban.com/' }],
  ['eastmoney_ashare', 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f1,f2,f3,f4,f12,f14,f15,f16,f5,f6'],
  ['eastmoney_index', 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399001,0.399006&fields=f2,f3,f4,f12,f14'],
  ['tencent_quote', 'https://qt.gtimg.cn/q=sh600519,sz000001'],
  ['qqmusic_toplist', 'https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?topid=26&format=json&page=detail&type=top&song_begin=0&song_num=5'],
  ['netease_hot', 'https://music.163.com/api/playlist/detail?id=3778678'],
  ['ithome_news', 'https://api.ithome.com/json/newslist/news'],
  ['thepaper_hot', 'https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar'],
  ['wallstreetcn', 'https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=5'],
  ['juejin_hot', 'https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed', null, 'POST', '{"id_type":2,"client_type":2608,"sort_type":200,"cursor":"0","limit":3}'],
  ['cctv_news', 'https://api.cntv.cn/NewArticle/getNewArticleList?serviceId=tvcctv&columnId=&pageSize=5'],
  // Global
  ['air_quality', 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=39.9&longitude=116.4&current=pm10,pm2_5,european_aqi'],
  ['open_meteo_marine', 'https://marine-api.open-meteo.com/v1/marine?latitude=22.3&longitude=114.2&current=wave_height,sea_surface_temperature'],
  ['erapi_fx', 'https://open.er-api.com/v6/latest/USD'],
  ['carbon_intensity', 'https://api.carbonintensity.org.uk/intensity'],
  ['restcountries', 'https://restcountries.com/v3.1/name/japan?fields=name,capital,population,currencies,region,languages,flags'],
  ['worldbank', 'https://api.worldbank.org/v2/country/CN/indicator/NY.GDP.MKTP.CD?format=json&per_page=3'],
  ['openfoodfacts', 'https://world.openfoodfacts.org/api/v0/product/737628064502.json'],
  ['themealdb', 'https://www.themealdb.com/api/json/v1/1/search.php?s=chicken'],
  ['usgs_quake', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'],
  ['iss_position', 'https://api.wheretheiss.at/v1/satellites/25544'],
  ['openf1', 'https://api.openf1.org/v1/drivers?session_key=latest'],
  ['pubmed', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=covid&retmax=3&retmode=json'],
  ['crossref', 'https://api.crossref.org/works?query=kubernetes&rows=2'],
  ['pypi', 'https://pypi.org/pypi/requests/json'],
  ['itunes', 'https://itunes.apple.com/search?term=lofi&media=music&limit=2'],
  ['opentdb', 'https://opentdb.com/api.php?amount=2&type=multiple'],
  ['advice', 'https://api.adviceslip.com/advice'],
  ['useless_facts', 'https://uselessfacts.jsph.pl/api/v2/facts/random'],
  ['sunrise_sunset', 'https://api.sunrise-sunset.org/json?lat=39.9&lng=116.4&formatted=0'],
  ['universities', 'http://universities.hipolabs.com/search?country=China&name=tsinghua'],
  ['jisho', 'https://jisho.org/api/v1/search/words?keyword=%E7%8C%AB'],
  ['randomfox', 'https://randomfox.ca/floof/'],
  ['zenodo', 'https://zenodo.org/api/records?size=2'],
  ['crates', 'https://crates.io/api/v1/crates?q=serde&per_page=2'],
  ['codeforces', 'https://codeforces.com/api/contest.list?gym=false'],
];

(async () => {
  for (const [name, url, extra, method, body] of TARGETS) {
    try {
      const opts = { method: method || 'GET', headers: { ...H, ...(extra || {}) }, signal: AbortSignal.timeout(15000) };
      if (body) { opts.body = body; opts.headers['content-type'] = 'application/json'; }
      const r = await fetch(url, opts);
      const txt = await r.text();
      let d;
      try { d = JSON.parse(txt); } catch (e) { console.log(`\n### ${name} (${r.status}) NON-JSON: ${txt.slice(0, 200).replace(/\s+/g, ' ')}`); continue; }
      console.log(`\n### ${name} (${r.status})`);
      if (name === 'tencent_quote') { console.log(d.v_sh600519 ? d.v_sh600519.slice(0, 200) : JSON.stringify(d).slice(0, 200)); continue; }
      console.log(sk(d, 0, 4).slice(0, 1200));
    } catch (e) {
      console.log(`\n### ${name} ERROR ${String(e.message).slice(0, 60)}`);
    }
  }
})();
