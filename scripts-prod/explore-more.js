/**
 * explore-more.js — 多源探测：加密货币、体育、影视、GitHub生态、RSS、公开数据集等。
 * 每个类别测 3-5 个候选，快速判断可达性。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const R = [];

async function probe(label, url, timeout = 8000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json,text/html,*/*' }, signal: ctrl.signal });
    clearTimeout(t);
    let ok = false, info = '';
    try {
      const txt = await r.text();
      let d;
      try { d = JSON.parse(txt); } catch(e) {
        info = `HTML ${r.status} ${(txt.match(/<title>([^<]+)<\/title>/i)||[])[1] || txt.slice(0,60)}`;
        ok = r.status >= 200 && r.status < 400;
      }
      if (d !== null && d !== undefined) {
        if (Array.isArray(d)) { info = `array len=${d.length}`; ok = true; }
        else if (typeof d === 'object') {
          if (d.message && !d.total) { info = d.message; ok = false; }
          else { info = Object.keys(d).slice(0,4).join(','); ok = true; }
        }
      }
    } catch(e) {
      info = 'parse-fail';
    }
    console.log(`[${label}] HTTP ${r.status} | ${info}`);
    R.push({ category: label, url, status: r.status, ok });
  } catch(e) {
    console.log(`❌ [${label}] ERR: ${e.message.slice(0,70)}`);
    R.push({ category: label, url, status: 0, ok: false, error: e.message });
  }
}

(async () => {
  // ── CRYPTO & WEB3 ──
  await probe('CoinGecko-trending', 'https://api.coingecko.com/api/v3/search/trending');
  await probe('CoinMarketCap-top10', 'https://api.coinmarketcap.com/datafeed/v1/popular.json'); // may need key
  await probe('Cryptocompare', 'https://min-api.cryptocompare.com/data/pricemultifull?fsyms=BTC,ETH&tsyms=USD,CNY');
  await probe('DeFiLlama-chains', 'https://api.llama.fi/chains');
  await probe('DefiLlama-pools', 'https://yields.llama.fi/pools?page=0&limit=3');

  // ── GITHUB ECOSYSTEM ──
  await probe('GH-Trending-Repos', 'https://api.github.com/search/repositories?q=created:>today&sort=stars&per_page=3');
  await probe('GH-Trending-Developers', 'https://github.com/trending?since=daily');
  await probe('GH-Org-AutoTasker', 'https://api.github.com/users/breezesamuel/orgs');
  await probe('GH-Repo-autotasker', 'https://api.github.com/repos/breezesamuel/autotasker-hub-aevum');
  await probe('GH-Issues-x402', 'https://api.github.com/search/issues?q=repo:x402-foundation/x402+created:>2026-11-01&sort=updated&per_page=5');

  // ── SPORTS (REAL-TIME) ──
  await probe('SportODDS-free', 'https://the-odds-api.com/free-odds-rss', 5000);
  await probe('ESPN-API-baseball', 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news');
  await probe('ESPN-API-football', 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news');
  await probe('FootballData-PL', 'https://www.football-data.org.uk/', 5000);

  // ── MOVIES / TV / ENTERTAINMENT ──
  await probe('TMDB-Discover', 'https://api.themoviedb.org/3/discover/movie?api_key=test&page=1'); // needs key
  await probe('IMDb-search-title', 'https://imdb-api.com/', 5000);
  await probe('Letterboxd-API', 'https://letterboxd.com/api/');
  await probe('Trakt-movies-popular', 'https://api.trakt.tv/movies/popular?limits=3');

  // ── KNOWLEDGE / WIKI / DATA ──
  await probe('WikidataSPARQL-sun', 'https://query.wikidata.org/sparql?query=SELECT%20%3Fitem%20%3FitemLabel%20WHERE%20%7B%3Fitem%20wdt%3AP31%20wd%3AQ5.%20SERVICE%20kbd%3Awikibase%3Amalaka%20%7B%7D%20%7D&limit=3', 8000);
  await probe('WikiPedia-random', 'https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=3&format=json');
  await probe('WikiMedia-images', 'https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Featured_pictures&cmlimit=3&format=json');
  await probe('OpenStreetMapNominatim-search', 'https://nominatim.openstreetmap.org/search?q=London&format=json&limit=1', 8000);
  await probe('Quandl-dataset', 'https://data.nasdaq.com/api/v3/datasets/BSE/ALLSHARE.csv'); // CSV endpoint

  // ── RSS / NEWS ──
  await probe('TechCrunch-RSS-json', 'https://techcrunch.com/feed/');
  await probe('Reuters-RSS', 'https://www.reutersagency.com/feed/?best-regions=world', 5000);
  await probe('HackerNewsFrontPage', 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=3');

  // ── MATH / SCIENCE CALCULATORS ──
  await probe('WolframAlpha-demo', 'https://api.wolframalpha.com/v2/query?appid=demo&q=what+is+pi+in+radians'); // needs appid
  await probe('Symbolab-demo', 'https://api.symbolab.com/', 5000);
  await probe('OpenCalc-solvers', 'https://open-watson.com/api/equation/solve?equation=x%5E2+%3D+4');
  await probe('Desmos-API', 'https://api.desmos.com/api/v1/graphs', 5000);
  await probe('NumPy-online-calc', 'https://numpy.org/', 5000);

  // ── LANGUAGE / TRANSLATION ──
  await probe('MyMemory-translator', 'https://api.mymemory.translated.net/get?q=hello&langpair=en|es');
  await probe('GoogleTranslate-demo', 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=hello');
  await probe('LibreTranslate-demo', 'https://libretranslate.de/translate', 5000);
  await probe('TranslateShell', 'https://mymemory.translated.net/api/demo');

  // ── DOCUMENT / FILE CONVERSION ──
  await probe('ConvertAPI-docs', 'https://v2.convertapi.com/test/convert/pdf/to/docx', 5000);
  await probe('CloudConvert-demo', 'https://cloudconvert.com/api/v2/convert', 5000);
  await probe('Zamzar', 'https://zAMZAR.COM/api/', 5000);

  // ── IMAGE GENERATION / MANIPULATION ──
  await probe('Imgur-upload-demo', 'https://api.imgur.com/3/image', 5000);
  await probe('CrafterAI', 'https://crafterai.com/', 5000);
  await probe('Pixabay-search', 'https://pixabay.com/api/docs/#search-photos');
  await probe('Unsplash-random', 'https://source.unsplash.com/random/400x300');

  // ── GEO / MAP ──
  await probe('MapsGeoCode-nominatim', 'https://nominatim.openstreetmap.org/search?q=Tokyo&format=json&limit=1');
  await probe('OverpassQuery-Tokyo', 'https://overpass-api.de/api/interpreter?data=[out:json];node["name"="Tokyo"];out;', 10000);
  await probe('OpenTripPlanner', 'https://otp.demo.transit.app/', 5000);
  await probe('MapboxDemo', 'https://docs.mapbox.com/help/examples/', 5000);

  // ── PRODUCTIVITY TOOLS ──
  await probe('DateConvert', 'https://dateutil.readthedocs.io/', 5000);
  await probe('RegexHelper', 'https://regex101.com/', 5000);
  await probe('Base64Encode', 'https://www.base64encode.org/', 5000);
  await probe('JSONLint', 'https://jsonlint.com/', 5000);
  await probe('DiffChecker', 'https://diffchecker.com/', 5000);

  // ── MISC FUN ──
  await probe('BoredAPI-multi', 'https://bored-api.appbrewery.com/random');
  await probe('QuoteAPI', 'https://quotable.io/quotes?limit=1');
  await probe('FactOfTheDay', 'https://catfact.ninja/fact');
  await probe('RandomDogURL', 'https://dog.ceo/api/breeds/image/random');
  await probe('PlaceBear', 'https://placebear.com/200/200');

  console.log('\n=== SUMMARY ===');
  console.log(`Total probed: ${R.length}`);
  console.log(`Reachable: ${R.filter(r=>r.ok).length}`);
  console.log(`Failed: ${R.filter(r=>!r.ok).length}`);
  const byCat = {};
  for (const r of R) {
    if (!byCat[r.category]) byCat[r.category] = { total: 0, ok: 0 };
    byCat[r.category].total++;
    if (r.ok) byCat[r.category].ok++;
  }
  for (const [cat, v] of Object.entries(byCat).sort((a,b)=>b[1].ok-a[1].ok)) {
    console.log(`  ${cat}: ${v.ok}/${v.total}`);
  }

  const fs = require('fs');
  const path = require('path');
  fs.writeFileSync(path.resolve(__dirname, '..', 'data', 'explore-more-results.json'), JSON.stringify(R, null, 2));
  console.log('\n-> data/explore-more-results.json');
})();
