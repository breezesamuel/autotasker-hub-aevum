/**
 * deep-dive-v2.js — Targeted probes for HIGH-VALUE categories we haven't covered yet.
 * Focus: Finance, Sports Live, Music, Movies, Climate/Environment, Science.
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const R = [];
async function probe(label, url, timeout = 8000) {
  try {
    const r = await fetch(url, { headers: {'user-agent':UA,'accept':'application/json,text/html,*/*'}, signal:AbortSignal.timeout(timeout), redirect:'follow' });
    const txt = await r.text();
    let info=''; let ok=false;
    try{const d=JSON.parse(txt);info=d&&d.length?`array(${d.length})`:JSON.stringify(d).slice(0,120);ok=true;}catch(e){info=(txt.match(/<title>([^<]+)<\/title>/i)||[])[1]||txt.slice(0,60);ok=r.status>=200&&r.status<400&&!/blocked|error/i.test(txt)&&!txt.includes('403');}
    console.log(`${ok?'✅':'❌'} ${label}: HTTP${r.status} | ${String(info).slice(0,120)}`);
    R.push({name:label,url,status:r.status,ok});
  } catch(e){console.log(`❌ ${label}: ${e.message.slice(0,60)}`);R.push({name:label,url,status:0,ok:false});}
}

(async()=>{
  // ── FINANCE / CRYPTO LIVE DATA ──
  await probe('CoinGecko-trending','https://api.coingecko.com/api/v3/search/trending',12000);
  await probe('CoinGecko-coins-page1','https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=3&page=1&sparkline=false',12000);
  await probe('CoinGecko-BTC-historical','https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1',12000);
  await probe('CryptoCompare-top','https://min-api.cryptocompare.com/data/top/totalmarcks?limit=5&tsym=USD',null);
  await probe('CoinRanking-coins','https://api.coinranking.com/v2/coins?limit=3',null);

  // ── SPORTS LIVE SCORES ──
  await probe('Football-data-PL-table','https://www.football-data.org.uk/merchandise/docs/2024/league_tables/E1_2024_CL.png',null);
  await probe('API-Sports-free','https://v3.football.api-sports.io/standings?league=39&season=2024',null);
  await probe('Sportmonks-demo','https://sdk.sportmonks.com/',null);
  await probe('LiveScore-API','https://livescores.dev/documentation/',null);
  await probe('TheSportsDB-all','https://www.thesportsdb.com/api/v1/json/3/query_all_players.php?s=Nadal',null);

  // ── MUSIC / ENTERTAINMENT ──
  await probe('Spotify-web-api-search','https://api.spotify.com/v1/search?q=lofi&type=track&limit=2',null);
  await probe('Deezer-search','https://api.deezer.com/search?q=lofi&limit=2',null);
  await probe('Jamendo-search','https://api.jamendo.com/v3.0/tracks/?client_id=demo&format=json&limit=3&musicclass=pop',null);
  await probe('iTunes-search','https://itunes.apple.com/search?term=lofi&media=music&limit=3');
  await probe('Billboard-hot100','https://api.billboard.com/v1/charts/hot-100',null);

  // ── MOVIES / TV ──
  await probe('TMDB-popular-movies','https://api.themoviedb.org/3/movie/popular?api_key=demo&page=1',null);
  await probe('OMDb-search','http://www.omdbapi.com/?s=matrix&r=json',null);
  await probe('Metacritic-featured','https://www.metacritic.com/browse/game/',null);

  // ── CLIMATE / ENVIRONMENT ──
  await probe('OpenAQ-air-quality','https://api.openaq.org/v2/latest?limit=3&city=Beijing',null);
  await probe('Windy-api-demo','https://embed.v2.windy.com/',null);
  await probe('NASA-EO','https://earthobservatory.nasa.gov/rest-api/?table=globalbiogeochemistry',null);

  // ── SCIENCE / ACADEMIC ──
  await probe('Crossref-search','https://api.crossref.org/works?query=kubernetes&rows=3');
  await probe('ORCID-search','https://pub.orcid.org/v3.0/search/?q=author-name:last-name%3ADoe',null);
  await probe('PubMed-search','https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=covid+19&retmax=3&retmode=json');
  await probe('Zenodo-search','https://zenodo.org/api/records?page=1&size=3');
  await probe('ArXiv-recent-CS','https://export.arxiv.org/api/query?search_query=cat:cs.AI&max_results=3&sortBy=submittedDate&sortOrder=descending');

  // ── TRAVEL / TRANSPORTATION ──
  await probe('AviationAPI-demo','https://avs-website-production.s3.amazonaws.com/',null);
  await probe('FlightAware-free','https://flightaware.com/public/flights/search?where1=&where2=',null);
  await probe('OpenSky-network-latest','https://opensky-network.org/api/states/all',null);

  // ── SOCIAL / NEWS AGGREGATION ──
  await probe('Reddit-hot','https://www.reddit.com/r/technology/hot.json?limit=3');
  await probe('HackerNews-best','https://hn.algolia.com/api/v1/search_by_date?tags=front_page&hitsPerPage=3&numericFilters=points>100');
  await probe('DevTo-articles','https://dev.to/api/articles?per_page=3&tag=node');
  await probe('Medium-top-writers','https://medium.com/feed/tag/javascript');

  // ── HEALTH / WELLNESS ──
  await probe('CalorieAPI','https://caloapi.herokuapp.com/foods/search?query=apple',null);
  await probe('Edamam-nutrition','https://api.edamam.com/api/recipes/v2?type=public&q=chicken',null);
  await probe('RecipeAPI-demo','https://api.worldathletics.org/',null);

  // ── TIME / CALENDAR SPECIALIZED ──
  await probe('TimezoneDB','https://timedate1.timeapi.io/timezone/?country=cn&city=beijing',null);
  await probe('WorldTimeAPI-specific','https://worldtimeapi.org/api/timezone/America/New_York',null);
  await probe('CalendarLayer','https://calendarlayer.apis.google.com/calendar/v3/calendars/en.usa%23holiday%40group.v.calendar.google.com/events',null);

  const fs = require('fs');
  fs.writeFileSync(require('path').resolve(__dirname, '..', 'data', 'probe-v3-results.json'), JSON.stringify(R, null, 2));
  const ok = R.filter(r => r.ok).length;
  console.log(`\n=== SUMMARY: ${ok}/${R.length} OK ===`);
  R.filter(r => r.ok).forEach(r => console.log(`  ✅ ${r.name}`));
})();
