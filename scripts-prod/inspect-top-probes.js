/**
 * inspect-top-probes.js — Deep-dive the most promising reachable APIs to learn their response shapes.
 */
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const fetchJson = async (url, label) => {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const txt = await r.text();
    let d;
    try { d = JSON.parse(txt); } catch(e) { console.log(`[${label}] NOT JSON (${r.status}): ${txt.slice(0, 80)}`); return null; }
    console.log(`\n=== ${label} (${d?.length || typeof d}) ===`);
    if (Array.isArray(d)) {
      console.log('array len:', d.length);
      if (d[0] && typeof d[0] === 'object') console.log('sample keys:', Object.keys(d[0]).join(', '));
      if (d[0]) console.log('sample:', JSON.stringify(d[0]).slice(0, 300));
    } else if (typeof d === 'object') {
      console.log('top keys:', Object.keys(d).join(', ').slice(0, 200));
      // print each top-level key's shape (first item of arrays, or first value of objects)
      for (const k of Object.keys(d).slice(0, 5)) {
        const v = d[k];
        if (Array.isArray(v)) console.log(`  .${k}[]:`);
        if (v && typeof v === 'object') {
          if (Array.isArray(v) && v.length > 0) {
            console.log('   sample keys:', Object.keys(v[0]).join(', ').slice(0, 150));
            console.log('   sample:', JSON.stringify(v[0]).slice(0, 200));
          } else {
            console.log(`  .${k}:`, JSON.stringify(v).slice(0, 200));
          }
        }
      }
    }
    return d;
  } catch(e) {
    console.log(`[${label}] ERR: ${e.message.slice(0, 80)}`);
    return null;
  }
};

(async () => {
  // GAME APIs — high demand
  await fetchJson('https://www.cheapshark.com/api/1.0/deals?upperPrice=5&onSale=1', 'CheapShark (game deals <$5)');
  await fetchJson('https://www.balldontlie.io/v1/games?per_page=2', 'balldontlie'); // might need auth, skip
  await fetchJson('https://api.playerdb.co/v3/player/steam/730/', 'PlayerDB Steam');
  await fetchJson('https://openlibrary.org/search/authors.json?q=j.r.r.+tolkien&limit=1', 'OpenLibrary Auth');

  // ENTERTAINMENT / ANIME
  await fetchJson('https://nekos.best/api/v2/neko', 'NekosBest (neko)');
  await fetchJson('https://nekos.best/api/v2/waifu', 'NekosBest (waifu)');
  await fetchJson('https://anime-chan.vercel.app/api/anime/quotes?max_results=3', 'anime-chan quotes');

  // DEVELOPMENT / TEST DATA
  await fetchJson('https://jsonplaceholder.typicode.com/posts/1', 'JSONPlaceholder post');
  await fetchJson('https://randomuser.me/api/?results=1', 'RandomUser');
  await fetchJson('https://yesno.wtf/api', 'YesNoWTF');

  // HEALTH / DATASETS
  await fetchJson('https://disease.sh/v3/covid-19/cases/china?lastdays=3', 'COVID-19 Tracker CH');

  // OTHER HIGH-VALUE
  await fetchJson('https://zenquotes.io/api/today', 'ZenQuotes today');
  await fetchJson('https://official-joke-api.appspot.com/random_joke', 'OfficialJokeAPI');
})();
