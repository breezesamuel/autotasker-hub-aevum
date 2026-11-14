/**
 * quick-pick-probe.js — Fast targeted probes for highest-value reachable endpoints.
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const probe = async (label, url, pick) => {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json,text/html,*/*' }, signal: AbortSignal.timeout(7000), redirect: 'follow' });
    const txt = await r.text();
    let d; try { d = JSON.parse(txt); } catch(e) { console.log(`  [${label}] NOT_JSON: ${txt.slice(0,80)}`); return; }
    console.log(`  [${label}] ${r.status} | ${pick(d).slice(0,120)}`);
  } catch(e) { console.log(`  [${label}] ERR: ${e.message.slice(0,60)}`); }
};
(async () => {
  // Entertainment/Game
  await probe('PokéAPI', 'https://pokeapi.co/api/v2/pokemon/ditto', d => `name=${d.name},abilities:${(d.abilities||[]).map(a=>a.ability.name).join(',')}`);
  await probe('PokeTypes', 'https://pokeapi.co/api/v2/type/1', d => `name=${d.name},moves:${(d.moves||[]).slice(0,3).map(m=>m.move.name).join(',')}`);
  await probe('MinecraftItems', 'https://minecraft-api.com/api/items?limit=3', d => JSON.stringify(Object.keys(d||{})).slice(0,80));
  await probe('MinecraftEnchants', 'https://minecraft-api.com/api/enchantments?limit=3', d => JSON.stringify(d).slice(0,80));
  await probe('MCStatsSearch', 'https://api.mcstats.org/search?q=creeper', d => `${d?.length||'?'} results`);

  // Anime/Danmachi
  await probe('Kitsu-search-anime', 'https://kitsu.io/api/edge/anime?filter[text]=naruto&page%5Blimit%5D=1', null);
  await probe('AnimeQuotes-random', 'https://animechan.xyz/api/random', d => JSON.stringify((Array.isArray(d)?d:[d])?.[0]||{}).slice(0,100));
  await probe('AnimeChan-random', 'https://api.animechan.xyz/api/random', d => JSON.stringify(d).slice(0,100));
  await probe('AniList-recommendation', 'https://graphql.anilist.co', 'graphql-endpoint-skip');
  await probe('Mal-api-movie', 'https://api.jikan.moe/v4/anime/1/suggestions', d => `${(d?.data||[]).length} suggestions`);

  // Data/Text
  await probe('Color-API', 'https://www.thecolorapi.com/id?hex=AABBCC', d => `name=${d.name?.value},rgb=${d.rgb.value}`);
  await probe('Datamuse', 'https://api.datamuse.com/words?rel_syn=treatise&max=3', d => `${(d||[]).length} synonyms`);
  await probe('RhymeDB', 'https://rhymebin.com/api/suggest/?word=test&max=3', d => JSON.stringify(Array.isArray(d)?d:null).slice(0,80));
  await probe('Numble-emoji', 'https://numble.one/api/number', d => JSON.stringify(d).slice(0,60));
  await probe('BoredAPI', 'https://bored-api.appbrewery.com/random', d => d?.activity);

  // More Sports
  await probe('FootballData', 'https://api.football-data.org/v4/competitions/TP?fields=id,name,currentMatchday', null); // likely needs key
  await probe('SportRadar-free', 'https://api.sportradar.us/football/trial/v7/en/leagues/8/stats.json', null); // trial key

  // Misc
  await probe('Imgur-random', 'https://api.imgur.com/3/gallery/random/hot?sort=top&window=week&page=1&rscan=true&show_viral=false&limit=1', null); // may need client id
  await probe('Cat Facts', 'https://catfact.ninja/fact', d => JSON.stringify(d).slice(0,100));
  await probe('PlaceBear', 'https://placebear.com/400/300', 'image-endpoint');
  await probe('HTTP Cat', 'https://http.cat/200', 'image-endpoint');
  await probe('Dog CEO', 'https://dog.ceo/api/breeds/image/random/3', d => (d?.message||[]).slice(0,2).map(u=>u.slice(0,50)).join(', '));
  await probe('Cataas Fact', 'https://cataas.com/cat/says', d => d?.text || JSON.stringify(d).slice(0,60));
  await probe('Dogs-v1', 'https://dogapi.dog/api/v1/breed/list?limit=1', d => JSON.stringify(d).slice(0,80));
})();
