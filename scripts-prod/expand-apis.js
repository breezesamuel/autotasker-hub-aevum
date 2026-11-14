/**
 * expand-apis.js — Probe 50+ additional high-value free APIs from public-apis catalog.
 * Targeting categories where we have NO tools yet: AI, Blockchain, Video, Books, Transportation.
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const R = [];
async function probe(label, url, pick) {
  try {
    const r = await fetch(url, { headers: {'user-agent':UA,'accept':'application/json,text/html'}, signal:AbortSignal.timeout(8000), redirect:'follow' });
    const txt = await r.text();
    let info=''; let ok=false;
    try{const d=JSON.parse(txt);info=pick?pick(d):`keys:${Object.keys(d||{}).join(',')}`;ok=true;}catch(e){info=(txt.match(/<title>([^<]+)<\/title>/i)||[])[1]||txt.slice(0,50);ok=r.status>=200&&r.status<400&&!/blocked|error/i.test(txt);}
    console.log(`${ok?'✅':'❌'} ${label}: HTTP${r.status} | ${String(info).slice(0,100)}`);
    R.push({name:label,url,status:r.status,ok});
  } catch(e){console.log(`❌ ${label}: ${e.message.slice(0,60)}`);R.push({name:label,url,status:0,ok:false});}
}

(async()=>{
  // AI & ML
  await probe('OpenAI-models','https://api.openai.com/v1/models',null); // needs key
  await probe('HuggingFace-tasks','https://huggingface.co/api/tasks');
  await probe('HuggingFace-spaces','https://huggingface.co/api/spaces?limit=3&sort=likes');
  await probe('TogetherAI-demo','https://api.together.xyz/v1/models',null);
  await probe('OLLAMA-list','http://localhost:11434/api/tags',null); // likely localhost-only

  // Blockchain / Crypto live data
  await probe('CoinGecko-BTC-price','https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,cny');
  await probe('CoinGecko-ETH-price','https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
  await probe('MempoolBTC-fees','https://mempool.space/api/v1/fees/recommended');
  await probe('Blockchain-info-btc','https://blockchain.info/ticker',null);

  // Transportation / Travel
  await probe('FlightRadar-free','https://registry.flightradar24.com/flights.json',null);
  await probe('FlightStats-free','https://developer.flightstats.com/',null);
  await probe('OpenRailwayMap','https://operations.osm.wales/api/v1/features?type=routes',null);
  await probe('BusAPI-DK','https://www.au.dk/busapi/v1/stops/?format=json',null); // random country transit
  await probe('TransitAPI-NY','https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-hts',null);

  // Video / Media
  await probe('Pexels-search','https://api.pexels.com/v1/search?query=nature&per_page=2',null); // needs key
  await probe('Pixabay-search','https://pixabay.com/api/?key=demo&q=nature&page=1',null);
  await probe('Imgur-random-gallery','https://api.imgur.com/3/gallery/random/hot?sort=viral&time=week&limit=1&rscan=true',null);

  // Books / Literature
  await probe('OpenLibrary-search','https://openlibrary.org/search/authors.json?q=j.KING&limit=2');
  await probe('Gutenberg-search','https://www.gutenberg.org/cache/epub//pg36547/pg36547-images.html');

  // News aggregation (more sources)
  await probe('NewsAPI-free','https://newsapi.org/v2/top-headlines?country=us&pageSize=2',null); // needs key
  await probe('MediaStack','https://api.medastack.com/v1/news?countries=US&category=technology&limit=2&api_key=demo',null);
  await probe('Newscatcher-demos','https://newsapi.g.newscatcherapi.com/docs/demo',null);
  await probe('Currents-API','https://currentsapi.services/api/v1/latest_news?language=en&last_news=24&apikey=demo',null);

  // Health / Fitness
  await probe('BMI-calculator-API','https://api.bmi-api.com/',null);
  await probe('CalorieNG','https://calories.ninjaword.com/calories.php?q=apple',null);
  await probe('FitnessDB','https://api.api-ninjas.com/v1/exercises?limit=3',null); // needs key

  // Miscellaneous useful
  await probe('RandomUser-US','https://randomuser.me/api/?nat=us&results=1');
  await probe('RandomUser-EU','https://randomuser.me/api/?nat=gb&results=1');
  await probe('PoemAPI','https://api.quotable.io/quotes?limit=1&minLength=50');
  await probe('RandomDog-url','https://dog.ceo/api/breeds/image/random/3');
  await probe('RandomCat-url','https://api.thecatapi.com/v1/images/search?limit=1',null);
  await probe('PlaceDog','https://place.dog/300/300');
  await probe('PlaceBear','https://placebear.com/300/200');

  const fs=require('fs');
  fs.writeFileSync(require('path').resolve(__dirname,'..','data','explore-more-results2.json'),JSON.stringify(R,null,2));
  const ok=R.filter(r=>r.ok).length;
  console.log(`\n=== SUMMARY: ${ok}/${R.length} OK ===`);
  for(const r of R.filter(r=>r.ok)){console.log(`  ✅ ${r.name}`);}
})();
