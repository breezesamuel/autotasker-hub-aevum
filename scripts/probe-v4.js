/**
 * probe-v4.js — Wide, robust probe of no-key APIs.
 * Fixes the old `timeout=null` bug (AbortSignal.timeout(null) throws).
 * Priority: China-exclusive sources (highest moat) + high-value global free APIs.
 * Concurrency 6, per-request 9s timeout, retries once on timeout.
 */
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HDRS = {
  'user-agent': UA,
  'accept': 'application/json,text/html,application/xml,*/*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const CANDIDATES = [
  // ─────────── A. CHINA EXCLUSIVE (moat) ───────────
  { cat: 'CN', name: 'baidu_hot', url: 'https://top.baidu.com/api/board?platform=wise&tab=realtime', note: '百度热搜' },
  { cat: 'CN', name: 'zhihu_hot', url: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=20', note: '知乎热榜', headers: { referer: 'https://www.zhihu.com/hot' } },
  { cat: 'CN', name: 'douyin_hot', url: 'https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/', note: '抖音热榜' },
  { cat: 'CN', name: 'douban_movie', url: 'https://m.douban.com/rexxar/api/v2/subject_collection/movie_showing/items?start=0&count=10', note: '豆瓣正在上映', headers: { referer: 'https://m.douban.com/' } },
  { cat: 'CN', name: '36kr_newsflash', url: 'https://36kr.com/api/newsflash?per_page=10', note: '36氪快讯' },
  { cat: 'CN', name: 'eastmoney_ashare', url: 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=10&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f1,f2,f3,f4,f12,f14,f15,f16,f5,f6', note: 'A股行情' },
  { cat: 'CN', name: 'eastmoney_index', url: 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399001,0.399006&fields=f2,f3,f4,f12,f14', note: '上证/深成/创业板指数' },
  { cat: 'CN', name: 'eastmoney_fund', url: 'https://fundgz.1234567.com.cn/js/000001.js', note: '基金估值' },
  { cat: 'CN', name: 'tencent_quote', url: 'https://qt.gtimg.cn/q=sh600519,sz000001', note: '腾讯行情' },
  { cat: 'CN', name: 'sina_quote', url: 'https://hq.sinajs.cn/list=sh600519', note: '新浪行情' },
  { cat: 'CN', name: 'qqmusic_toplist', url: 'https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?topid=26&format=json&page=detail&type=top&song_begin=0&song_num=10', note: 'QQ音乐热歌榜' },
  { cat: 'CN', name: 'netease_hot', url: 'https://music.163.com/api/playlist/detail?id=3778678', note: '网易云热歌榜' },
  { cat: 'CN', name: 'ithome_news', url: 'https://api.ithome.com/json/newslist/news', note: 'IT之家' },
  { cat: 'CN', name: 'thepaper_hot', url: 'https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar', note: '澎湃新闻' },
  { cat: 'CN', name: 'wallstreetcn', url: 'https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=10', note: '华尔街见闻' },
  { cat: 'CN', name: 'juejin_hot', url: 'https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed', note: '掘金(需POST)', method: 'POST', body: '{"id_type":2,"client_type":2608,"sort_type":200,"cursor":"0","limit":10}' },
  { cat: 'CN', name: 'gitee_trending', url: 'https://gitee.com/api/v5/search/repositories?q=stars%3A%3E100&sort=stars&order=desc&per_page=10', note: 'Gitee 热门' },
  { cat: 'CN', name: 'csdn_hot', url: 'https://blog.csdn.net/phoenix/web/blog/hot-rank?page=0&pageSize=10', note: 'CSDN 热榜' },
  { cat: 'CN', name: 'cctv_news', url: 'https://api.cntv.cn/NewArticle/getNewArticleList?serviceId=tvcctv&columnId=&pageSize=10', note: '央视新闻' },
  { cat: 'CN', name: 'amap_regeo', url: 'https://restapi.amap.com/v3/geocode/regeo?key=&location=116.481488,39.990464', note: '高德(需key)' },

  // ─────────── B. CRYPTO / FINANCE ───────────
  { cat: 'FIN', name: 'binance_price', url: 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT' },
  { cat: 'FIN', name: 'okx_price', url: 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT' },
  { cat: 'FIN', name: 'coincap_assets', url: 'https://api.coincap.io/v2/assets?limit=5' },
  { cat: 'FIN', name: 'blockchain_ticker', url: 'https://blockchain.info/ticker' },
  { cat: 'FIN', name: 'erapi_fx', url: 'https://open.er-api.com/v6/latest/USD' },
  { cat: 'FIN', name: 'carbon_intensity', url: 'https://api.carbonintensity.org.uk/intensity' },
  { cat: 'FIN', name: 'yahoo_chart', url: 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1h' },
  { cat: 'FIN', name: 'stooq_csv', url: 'https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv' },

  // ─────────── C. SCIENCE / ACADEMIC ───────────
  { cat: 'SCI', name: 'crossref', url: 'https://api.crossref.org/works?query=kubernetes&rows=3' },
  { cat: 'SCI', name: 'pubmed', url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=covid&retmax=3&retmode=json' },
  { cat: 'SCI', name: 'zenodo', url: 'https://zenodo.org/api/records?size=3' },
  { cat: 'SCI', name: 'openalex', url: 'https://api.openalex.org/works?search=graph%20neural%20network&per-page=3' },
  { cat: 'SCI', name: 'semanticscholar', url: 'https://api.semanticscholar.org/graph/v1/paper/search?query=attention&limit=3&fields=title,year,citationCount' },
  { cat: 'SCI', name: 'nasa_apod', url: 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY' },
  { cat: 'SCI', name: 'usgs_quake', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson' },
  { cat: 'SCI', name: 'iss_position', url: 'https://api.wheretheiss.at/v1/satellites/25544' },
  { cat: 'SCI', name: 'spacex_latest', url: 'https://api.spacexdata.com/v4/launches/latest' },
  { cat: 'SCI', name: 'openf1', url: 'https://api.openf1.org/v1/drivers?session_key=latest' },

  // ─────────── D. DEV / DATA ───────────
  { cat: 'DEV', name: 'pypi', url: 'https://pypi.org/pypi/requests/json' },
  { cat: 'DEV', name: 'crates', url: 'https://crates.io/api/v1/crates?q=serde&per_page=3' },
  { cat: 'DEV', name: 'packagist', url: 'https://packagist.org/search.json?q=laravel' },
  { cat: 'DEV', name: 'huggingface', url: 'https://huggingface.co/api/models?search=llama&limit=3' },
  { cat: 'DEV', name: 'dockerhub', url: 'https://hub.docker.com/v2/repositories/library/nginx/' },
  { cat: 'DEV', name: 'devto', url: 'https://dev.to/api/articles?per_page=3' },
  { cat: 'DEV', name: 'reddit_hot', url: 'https://www.reddit.com/r/technology/hot.json?limit=3' },
  { cat: 'DEV', name: 'gitlab', url: 'https://gitlab.com/api/v4/projects?search=x402&per_page=3' },
  { cat: 'DEV', name: 'codeforces', url: 'https://codeforces.com/api/contest.list?gym=false' },
  { cat: 'DEV', name: 'nuget', url: 'https://azuresearch-usnc.nuget.org/query?q=newtonsoft&take=3' },

  // ─────────── E. REFERENCE / GEO / UTILITY ───────────
  { cat: 'UTL', name: 'restcountries', url: 'https://restcountries.com/v3.1/name/japan?fields=name,capital,population,currencies,region' },
  { cat: 'UTL', name: 'worldbank', url: 'https://api.worldbank.org/v2/country/CN/indicator/NY.GDP.MKTP.CD?format=json&per_page=3' },
  { cat: 'UTL', name: 'wikipedia_summary', url: 'https://en.wikipedia.org/api/rest_v1/page/summary/China' },
  { cat: 'UTL', name: 'openlibrary', url: 'https://openlibrary.org/search.json?q=dune&limit=3' },
  { cat: 'UTL', name: 'gutendex', url: 'https://gutendex.com/books?search=dickens' },
  { cat: 'UTL', name: 'themealdb', url: 'https://www.themealdb.com/api/json/v1/1/search.php?s=chicken' },
  { cat: 'UTL', name: 'cocktaildb', url: 'https://www.thecocktaildb.com/api/json/v1/1/search.php?s=margarita' },
  { cat: 'UTL', name: 'agify', url: 'https://api.agify.io?name=michael' },
  { cat: 'UTL', name: 'ipapi_co', url: 'https://ipapi.co/8.8.8.8/json/' },
  { cat: 'UTL', name: 'sunrise_sunset', url: 'https://api.sunrise-sunset.org/json?lat=39.9&lng=116.4&formatted=0' },
  { cat: 'UTL', name: 'nominatim', url: 'https://nominatim.openstreetmap.org/search?q=paris&format=json&limit=2' },
  { cat: 'UTL', name: 'air_quality', url: 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=39.9&longitude=116.4&current=pm10,pm2_5,european_aqi' },
  { cat: 'UTL', name: 'open_meteo_marine', url: 'https://marine-api.open-meteo.com/v1/marine?latitude=22.3&longitude=114.2&current=wave_height,sea_surface_temperature' },
  { cat: 'UTL', name: 'openfoodfacts', url: 'https://world.openfoodfacts.org/api/v0/product/737628064502.json' },
  { cat: 'UTL', name: 'universities', url: 'http://universities.hipolabs.com/search?country=China&name=tsinghua' },
  { cat: 'UTL', name: 'opennotify_iss', url: 'http://api.open-notify.org/iss-now.json' },
  { cat: 'UTL', name: 'uk_police', url: 'https://data.police.uk/api/crimes-street/all-crime?lat=52.629729&lng=-1.131592&date=2023-01' },

  // ─────────── F. FUN / CONTENT ───────────
  { cat: 'FUN', name: 'thesportsdb', url: 'https://www.thesportsdb.com/api/v1/json/3/all_leagues.php' },
  { cat: 'FUN', name: 'opentdb', url: 'https://opentdb.com/api.php?amount=3&type=multiple' },
  { cat: 'FUN', name: 'jokeapi', url: 'https://v2.jokeapi.dev/joke/Any?type=single' },
  { cat: 'FUN', name: 'official_joke', url: 'https://official-joke-api.appspot.com/random_joke' },
  { cat: 'FUN', name: 'quotable', url: 'https://api.quotable.io/random?maxLength=100' },
  { cat: 'FUN', name: 'advice', url: 'https://api.adviceslip.com/advice' },
  { cat: 'FUN', name: 'numbers_api', url: 'http://numbersapi.com/42/trivia?json' },
  { cat: 'FUN', name: 'useless_facts', url: 'https://uselessfacts.jsph.pl/api/v2/facts/random' },
  { cat: 'FUN', name: 'random_word', url: 'https://random-word-api.herokuapp.com/word?number=3' },
  { cat: 'FUN', name: 'jisho', url: 'https://jisho.org/api/v1/search/words?keyword=%E7%8C%AB' },
  { cat: 'FUN', name: 'shibe', url: 'https://shibe.online/api/shibes?count=3' },
  { cat: 'FUN', name: 'randomfox', url: 'https://randomfox.ca/floof/' },
  { cat: 'FUN', name: 'itunes', url: 'https://itunes.apple.com/search?term=lofi&media=music&limit=3' },
  { cat: 'FUN', name: 'deezer', url: 'https://api.deezer.com/search?q=lofi&limit=3' },
  { cat: 'FUN', name: 'horoscope', url: 'https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=aries' },
  { cat: 'FUN', name: 'wikiquote', url: 'https://en.wikiquote.org/api/rest_v1/page/summary/Albert_Einstein' },
];

async function probeOne(c) {
  const started = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const opts = {
        method: c.method || 'GET',
        headers: { ...HDRS, ...(c.headers || {}) },
        signal: AbortSignal.timeout(9000),
        redirect: 'follow',
      };
      if (c.body) {
        opts.body = c.body;
        opts.headers['content-type'] = 'application/json';
      }
      const r = await fetch(c.url, opts);
      const txt = await r.text();
      let kind = 'text', preview = '';
      try {
        const d = JSON.parse(txt);
        kind = 'json';
        if (Array.isArray(d)) preview = `array(${d.length})`;
        else if (d && typeof d === 'object') preview = `keys:${Object.keys(d).slice(0, 6).join(',')}`;
        else preview = String(d).slice(0, 80);
      } catch (e) {
        const t = (txt.match(/<title>([^<]*)<\/title>/i) || [])[1];
        preview = t ? `html:${t.slice(0, 60)}` : `text:${txt.slice(0, 60).replace(/\s+/g, ' ')}`;
      }
      const blocked = /access denied|forbidden|not available in your|blocked|captcha|人机验证|验证码/i.test(txt.slice(0, 800));
      const ok = r.status >= 200 && r.status < 400 && !blocked && txt.length > 20;
      return { ...c, status: r.status, ok, ms: Date.now() - started, bytes: txt.length, kind, preview, blocked, attempt };
    } catch (e) {
      if (attempt === 2) {
        return { ...c, status: 0, ok: false, ms: Date.now() - started, error: String(e.message).slice(0, 80), attempt };
      }
    }
  }
}

(async () => {
  const results = [];
  const queue = [...CANDIDATES];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const c = queue.shift();
      const res = await probeOne(c);
      results.push(res);
      const tag = res.ok ? 'OK  ' : 'FAIL';
      console.log(`${tag} [${res.cat}] ${res.name.padEnd(20)} ${String(res.status).padEnd(4)} ${String(res.ms).padStart(5)}ms  ${(res.preview || res.error || '').slice(0, 70)}`);
    }
  });
  await Promise.all(workers);

  results.sort((a, b) => (a.cat + a.name).localeCompare(b.cat + b.name));
  const outPath = path.resolve(__dirname, '..', 'data', 'probe-v4-results.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), total: results.length, results }, null, 2), 'utf8');

  const ok = results.filter(r => r.ok);
  console.log(`\n=== SUMMARY: ${ok.length}/${results.length} OK ===`);
  const byCat = {};
  for (const r of ok) (byCat[r.cat] = byCat[r.cat] || []).push(r.name);
  for (const [k, v] of Object.entries(byCat)) console.log(`  ${k} (${v.length}): ${v.join(', ')}`);
  console.log(`\nSaved -> ${outPath}`);
})();
