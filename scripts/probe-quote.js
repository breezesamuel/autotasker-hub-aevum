// probe-quote.js — find a keyless quote API that works from this network.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const H = { 'user-agent': UA, accept: 'application/json' };
const URLS = [
  ['dummyjson', 'https://dummyjson.com/quotes/random'],
  ['stoic', 'https://stoic-quotes.com/api/quote'],
  ['quotable', 'https://api.quotable.io/random?maxLength=120'],
  ['typefit', 'https://type.fit/api/quotes'],
  ['zenquotes', 'https://zenquotes.io/api/today'],
  ['forismatic', 'https://api.forismatic.com/api/1.0/?method=getQuote&format=json&lang=en'],
  ['kanye', 'https://api.kanye.rest/'],
];
(async () => {
  for (const [name, url] of URLS) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(10000) });
      const txt = await r.text();
      console.log(`${String(r.status).padEnd(4)} ${name.padEnd(11)} ${String(Date.now() - t0).padStart(5)}ms ${txt.slice(0, 180).replace(/\s+/g, ' ')}`);
    } catch (e) {
      console.log(`ERR  ${name.padEnd(11)} ${String(Date.now() - t0).padStart(5)}ms ${String(e.message).slice(0, 80)}`);
    }
  }
})();
