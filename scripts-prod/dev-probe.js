/**
 * dev-probe.js — Targeted probes for developer/tech free APIs.
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const probe = async (label, url) => {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json,text/html' }, signal: AbortSignal.timeout(8000) });
    const txt = await r.text();
    let d; try { d = JSON.parse(txt); } catch(e) { console.log(`  [${label}] HTML/status=${r.status} title=${(txt.match(/<title>([^<]+)<\/title>/i)||[])[1]||''}`); return; }
    if (Array.isArray(d)) {
      console.log(`  [${label}] OK array len=${d.length}`);
      if (d[0]) console.log('       sample keys:', Object.keys(d[0]).join(', ').slice(0, 100));
    } else if (typeof d === 'object') {
      console.log(`  [${label}] OK object`, Object.keys(d).join(', '));
      // show first nested item structure
      for (const k of Object.keys(d).slice(0,2)) {
        const v = d[k];
        if (Array.isArray(v) && v.length > 0) console.log(`  .${k}[]:`, Object.keys(v[0]).join(', ').slice(0, 80));
        else if (v && typeof v === 'object') console.log(`  .${k}:`, JSON.stringify(v).slice(0, 120));
      }
    }
  } catch(e) { console.log(`  [${label}] ERR: ${e.message.slice(0,60)}`); }
};

(async () => {
  // DEV / TECH
  await probe('GitHubTrendingRepos', 'https://api.github.com/search/repositories?q=created:>today&sort=stars&order=desc&per_page=3');
  await probe('NPMRegistry-search-mcp', 'https://registry.npmjs.org/-/v1/search?text=mcp+server&size=3');
  await probe('SPDX-Licenses', 'https://spdx.org/licenses/licenses.json'); // might be big
  await probe('OpenAPI-Spec', 'https://spec.openapis.org/oas/v3.1.0/spec.json');
  await probe('GitHunt-API-Home', 'https://www.githunt.com/api/feed?limit=2');
  await probe('GIPHY-Trending', 'https://api.giphy.com/v1/gifs/trending?limit=3&rating=g'); // no key needed
  await probe('Cataas-Facts-via-cat', 'https://cataas.com/cat');
  await probe('HTTPCat-status', 'https://http.cat/');
  await probe('Mocky-test', 'https://run.mocky.io/v3/fake-endpoint-sample');
  await probe('Reqres-random-user', 'https://reqres.in/api/users?page=1&per_page=2');
  await probe('JSONPlaceholder-comments', 'https://jsonplaceholder.typicode.com/comments?postId=1&limit=2');
  await probe('DogeAPI-breed-list', 'https://dog.ceo/api/breeds/list/all');
  await probe('CatFact-fact', 'https://catfact.ninja/fact');
  await probe('Bored-API-activity', 'https://bored-api.appbrewery.com/random');
  await probe('ColorAPI-hex', 'https://www.thecolorapi.com/id?hex=E91E63');
  await probe('ColorAPI-rand', 'https://www.thecolorapi.com/scheme?hex=FF5733&count=5');
  await probe('Datamuse-word-rel', 'https://api.datamuse.com/words?rel_jjb=funny&max=5');
  await probe('Datamuse-synonyms', 'https://api.datamuse.com/words?ml=treatise&max=3');
  await probe('WitAI-quote', 'https://api.wit.ai/say?q=is+there+a+cat'); // needs auth
})();
