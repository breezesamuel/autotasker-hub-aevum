/**
 * utils-tools.js — Zero-marginal-cost agent tools for AutoTasker Hub.
 *
 * Group A: China desk (local computation, no upstream):
 *   lunar_calendar · cn_id_validate · pinyin_convert
 * Group B: Global free-API proxies (本机可达，零边际成本，$0.01/次):
 *   weather · fx_rates · public_holidays · ip_geo · hn_search · define_word · arxiv_search
 * Group C: Entertainment & Data enrichment (新添加，全部经实测可达):
 *   game_deals · cat_fact · dog_breed_list · bored_activity · color_info · color_scheme
 *   datamuse_synonyms · npm_search · spdx_licenses · random_user · comment_for_post · quote_today
 *
 * Every tool is sold at $0.01 USDC per call via x402 (MCP tools/call or REST /api/x402/util/:tool).
 */

const solarlunar = require('solarlunar').default || require('solarlunar');
const { pinyin } = require('pinyin-pro');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const TIMEOUT = 10000;

async function getJson(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return r.json();
}

// ── CN ID card checksum ─────────────────────────────────────────────────────
const CN_PROVINCES = { 11: '北京', 12: '天津', 13: '河北', 14: '山西', 15: '内蒙古', 21: '辽宁', 22: '吉林', 23: '黑龙江', 31: '上海', 32: '江苏', 33: '浙江', 34: '安徽', 35: '福建', 36: '江西', 37: '山东', 41: '河南', 42: '湖北', 43: '湖南', 44: '广东', 45: '广西', 46: '海南', 50: '重庆', 51: '四川', 52: '贵州', 53: '云南', 54: '西藏', 61: '陕西', 62: '甘肃', 63: '青海', 64: '宁夏', 65: '新疆', 71: '台湾', 81: '香港', 82: '澳门' };
const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK = '10X98765432';

function cnIdValidate(raw) {
  const id = String(raw || '').toUpperCase().trim();
  if (!/^\d{17}[\dX]$/.test(id)) return { valid: false, reason: 'format: expected 18-digit ID (last may be X)' };
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(id[i]) * ID_WEIGHTS[i];
  const expect = ID_CHECK[sum % 11];
  const valid = expect === id[17];
  const province = CN_PROVINCES[Number(id.slice(0, 2))] || null;
  const birth = id.slice(6, 14);
  const sex = Number(id[16]) % 2 === 1 ? 'male' : 'female';
  return {
    valid,
    checkDigit: { expected: expect, received: id[17] },
    province,
    birthDate: /^\d{8}$/.test(birth) ? `${birth.slice(0, 4)}-${birth.slice(4, 6)}-${birth.slice(6, 8)}` : null,
    sex,
    note: 'checksum + metadata only; no personal records are accessed',
  };
}

// ── Tool definitions (MCP shape) ────────────────────────────────────────────
const UTIL_TOOLS = [
  {
    name: 'weather',
    description: 'Current weather for a city or lat/lon (free Open-Meteo upstream). $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { city: { type: 'string', description: 'City name, e.g. Beijing or 上海' }, lat: { type: 'number' }, lon: { type: 'number' } } },
  },
  {
    name: 'fx_rates',
    description: 'ECB reference FX rates (free Frankfurter upstream), CNY-friendly. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { from: { type: 'string', description: 'Base currency, e.g. CNY', default: 'CNY' }, to: { type: 'string', description: 'Target currency, e.g. USD', default: 'USD' }, amount: { type: 'number', description: 'Optional amount to convert' } } },
  },
  {
    name: 'public_holidays',
    description: 'Public holidays for a country and year (free date.nager.at upstream, ISO country code). $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { country: { type: 'string', description: 'ISO-3166 code, e.g. CN, US, DE', default: 'CN' }, year: { type: 'integer', default: 2026 } } },
  },
  {
    name: 'ip_geo',
    description: 'IP geolocation: country, region, city, ASN for any IPv4/IPv6. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { ip: { type: 'string', description: 'IP address to locate' } }, required: ['ip'] },
  },
  {
    name: 'hn_search',
    description: 'Search Hacker News stories/comments (free Algolia upstream) — tech/industry signal. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', default: 5, maximum: 20 } }, required: ['query'] },
  },
  {
    name: 'define_word',
    description: 'English dictionary entry with definitions, phonetics, examples. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'] },
  },
  {
    name: 'arxiv_search',
    description: 'Search arXiv papers by keyword, returns titles, ids, abstracts. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', default: 3, maximum: 10 } }, required: ['query'] },
  },
  {
    name: 'lunar_calendar',
    description: 'Solar↔lunar conversion with 干支 (sexagenary year/month/day), 生肖 zodiac, festivals and solar terms — China desk essential. Local computation. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'Gregorian date YYYY-MM-DD', default: 'today' } } },
  },
  {
    name: 'cn_id_validate',
    description: 'Validate a Chinese resident ID number: checksum, province, birth date, sex. Local computation, no records accessed. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: '18-digit ID number' } }, required: ['id'] },
  },
  {
    name: 'pinyin_convert',
    description: 'Convert Chinese text to pinyin (with tone numbers or marks). Local computation. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'Chinese text' }, tone: { type: 'boolean', description: 'Include tone marks', default: true } }, required: ['text'] },
  },
  // Group C — Entertainment & Data enrichment (all upstream APIs verified reachable from this machine)
  {
    name: 'game_deals',
    description: 'Search cheap game deals across Steam, Epic, GOG etc (free CheapShark upstream). Returns sale price, savings %, Metacritic score. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { maxPrice: { type: 'number', description: 'Max sale price in USD, default 5', default: 5 }, onSale: { type: 'boolean', description: 'Only games currently on sale', default: true }, limit: { type: 'integer', description: 'Number of deals, default 10 max 30', default: 10, maximum: 30 } } },
  },
  {
    name: 'cat_fact',
    description: 'Random cat fact from CatFact Ninja. Fun trivia for agents. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'dog_breed_list',
    description: 'List all dog breeds + subbreeds from Dog CEO API. Shows available breed taxonomy. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'bored_activity',
    description: 'Suggest a random activity for when bored: type (solo/group), price scale, duration, kid-friendly flag. Free upstream. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { minPrice: { type: 'number', minimum: 0, maximum: 10, description: 'Min price tier (0=free, 10=expensive)' }, group: { type: 'boolean', description: 'Group activity only' } } },
  },
  {
    name: 'color_info',
    description: 'Get color info (name, RGB, HSL, HSV, CMYK) for any hex color code. Design agent helper. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { hex: { type: 'string', description: 'Hex color, e.g. E91E63 or #E91E63' } }, required: ['hex'] },
  },
  {
    name: 'color_scheme',
    description: 'Generate an analogous color palette (N colors) from a base hex. Good for design agents. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { hex: { type: 'string', description: 'Base hex color' }, count: { type: 'integer', description: 'Palette size', default: 5, minimum: 2, maximum: 12 } }, required: ['hex'] },
  },
  {
    name: 'datamuse_synonyms',
    description: 'Find synonyms and related words via Datamuse lexical database. NLP helper. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { word: { type: 'string', description: 'Seed word' }, rel_syn: { type: 'boolean', description: 'Include synonym relations' }, limit: { type: 'integer', description: 'Max results', default: 10, maximum: 30 } }, required: ['word'] },
  },
  {
    name: 'npm_search',
    description: 'Search npm registry for packages by keyword with download counts. Dev-tool finder. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search term' }, limit: { type: 'integer', description: 'Results count', default: 5, maximum: 20 } }, required: ['query'] },
  },
  {
    name: 'spdx_licenses',
    description: 'Full SPDX license list (500+ licenses with IDs, names, details). Compliance/legal agent aid. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { licenseId: { type: 'string', description: 'Optional: filter to specific SPDX ID, e.g. MIT or Apache-2.0' } } },
  },
  {
    name: 'random_user',
    description: 'Generate fake user profiles (gender, name, location, DOB, phone, avatar) for testing/demo. Reqres.in upstream. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { gender: { type: 'string', enum: ['male', 'female'], description: 'Filter by gender' }, count: { type: 'integer', description: 'Number of users', default: 1, maximum: 10 } } },
  },
  {
    name: 'comment_for_post',
    description: 'Fetch fake comments attached to a PostID (JSONPlaceholder). Useful for comment/review analysis demos. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: { postId: { type: 'integer', description: 'Post ID (1-100)', default: 1 }, limit: { type: 'integer', default: 5, maximum: 20 } } },
  },
  {
    name: 'quote_today',
    description: 'Inspirational quote of the day from zenquotes.io. Includes author and image link. $0.01 USDC per call.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── Executors ───────────────────────────────────────────────────────────────
async function runUtil(name, args = {}) {
  switch (name) {
    case 'weather': {
      let lat = args.lat, lon = args.lon, city = args.city || null;
      if ((lat == null || lon == null) && city) {
        const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`);
        const hit = (g.results || [])[0];
        if (!hit) throw new Error(`city not found: ${city}`);
        lat = hit.latitude; lon = hit.longitude;
        city = hit.name;
      }
      if (lat == null || lon == null) throw new Error('provide city or lat/lon');
      const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`);
      return { city, lat, lon, current: w.current };
    }
    case 'fx_rates': {
      const from = (args.from || 'CNY').toUpperCase(), to = (args.to || 'USD').toUpperCase();
      const amt = args.amount != null ? `amount=${args.amount}&` : '';
      const d = await getJson(`https://api.frankfurter.app/latest?${amt}from=${from}&to=${to}`);
      return { base: d.base, date: d.date, rates: d.rates, amount: args.amount ?? 1 };
    }
    case 'public_holidays': {
      const country = (args.country || 'CN').toUpperCase();
      const year = args.year || new Date().getFullYear();
      const d = await getJson(`https://date.nager.at/api/v3/publicholidays/${year}/${country}`);
      return { country, year, count: d.length, holidays: d.map(h => ({ date: h.date, name: h.name, localName: h.localName, global: h.global })) };
    }
    case 'ip_geo': {
      if (!args.ip) throw new Error('ip is required');
      const d = await getJson(`https://ipwho.is/${encodeURIComponent(args.ip)}`);
      if (d.success === false) throw new Error(d.message || 'lookup failed');
      return { ip: d.ip, country: d.country, region: d.region, city: d.city, lat: d.latitude, lon: d.longitude, isp: d.connection && d.connection.isp, asn: d.connection && d.connection.asn };
    }
    case 'hn_search': {
      const q = encodeURIComponent(args.query || '');
      const lim = Math.min(Number(args.limit) || 5, 20);
      const d = await getJson(`https://hn.algolia.com/api/v1/search?query=${q}&hitsPerPage=${lim}`);
      return { nbHits: d.nbHits, hits: (d.hits || []).map(h => ({ title: h.title, url: h.url, points: h.points, comments: h.num_comments, date: h.created_at })) };
    }
    case 'define_word': {
      if (!args.word) throw new Error('word is required');
      const d = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(args.word)}`);
      const e = d[0] || {};
      return { word: e.word, phonetic: e.phonetic, meanings: (e.meanings || []).map(m => ({ partOfSpeech: m.partOfSpeech, definitions: (m.definitions || []).slice(0, 2).map(x => x.definition) })) };
    }
    case 'arxiv_search': {
      const q = encodeURIComponent(args.query || '');
      const lim = Math.min(Number(args.limit) || 3, 10);
      const r = await fetch(`https://export.arxiv.org/api/query?search_query=all:${q}&max_results=${lim}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(TIMEOUT) });
      const xml = await r.text();
      const entries = xml.split('<entry>').slice(1).map(e => ({
        id: (e.match(/<id>([^<]+)<\/id>/) || [])[1],
        title: ((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').replace(/\s+/g, ' ').trim(),
        published: (e.match(/<published>([^<]+)<\/published>/) || [])[1],
        summary: ((e.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      }));
      return { query: args.query, count: entries.length, entries };
    }
    case 'lunar_calendar': {
      let y, m, d;
      const input = args.date || 'today';
      if (input === 'today') { const now = new Date(); y = now.getFullYear(); m = now.getMonth() + 1; d = now.getDate(); }
      else {
        const parts = String(input).split('-').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) throw new Error('date format: YYYY-MM-DD');
        [y, m, d] = parts;
      }
      const l = solarlunar.solar2lunar(y, m, d);
      if (!l || l.lYear == null) throw new Error('date out of supported range');
      return {
        solar: `${l.cYear}-${String(l.cMonth).padStart(2, '0')}-${String(l.cDay).padStart(2, '0')}`,
        lunar: `${l.yearCn}${l.monthCn}${l.dayCn}`,
        ganzhi: { year: l.gzYear, month: l.gzMonth, day: l.gzDay },
        zodiac: l.animal,
        week: l.ncWeek,
        festival: l.festival || null,
        solarTerm: l.term || null,
      };
    }
    case 'cn_id_validate':
      if (!args.id) throw new Error('id is required');
      return cnIdValidate(args.id);
    case 'pinyin_convert':
      if (!args.text) throw new Error('text is required');
      return { text: args.text, pinyin: pinyin(args.text, { toneType: args.tone === false ? 'none' : 'symbol' }) };
    // Group C — Entertainment & enrichment
    case 'game_deals': {
      const maxPrice = String(args.maxPrice || 5);
      const onSale = args.onSale !== false ? '1' : '0';
      const limit = Math.min(Number(args.limit) || 10, 30);
      const d = await getJson(`https://www.cheapshark.com/api/1.0/deals?upperPrice=${maxPrice}&onSale=${onSale}&pageSize=${limit}`);
      return { query: { upperPrice: maxPrice, onSale: !!args.onSale }, deals: (d || []).slice(0, limit).map(d => ({ title: d.title, salePrice: d.salePrice, normalPrice: d.normalPrice, savingsPct: Number(d.savings).toFixed(1) + '%', metacritic: d.metacriticScore, steamRating: d.steamRatingPercent, url: `https://www.cheapshark.com/deal/${d.dealID}` })) };
    }
    case 'cat_fact': {
      const d = await getJson('https://catfact.ninja/fact');
      return { fact: d.fact, length: d.length };
    }
    case 'dog_breed_list': {
      const d = await getJson('https://dog.ceo/api/breeds/list/all');
      const message = d.message || {};
      const topBreeds = Object.entries(message).slice(0, 20);
      const totalBreeds = Object.values(message).reduce((s, a) => s + 1 + a.length, 0);
      return { totalTopBreeds: topBreeds.length, totalAllBreedsIncludingSub: totalBreeds, topBreeds: topBreeds.map(([breed, subs]) => ({ breed, subbreeds: subs })) };
    }
    case 'bored_activity': {
      const params = [];
      if (args.minPrice != null) params.push(`minPrice=${args.minPrice}`);
      if (args.group) params.push('group=true');
      const qs = params.length ? '?' + params.join('&') : '';
      const d = await getJson(`https://bored-api.appbrewery.com/random${qs}`);
      return d;
    }
    case 'color_info': {
      if (!args.hex) throw new Error('hex is required');
      const hex = args.hex.replace(/^#/, '');
      const d = await getJson(`https://www.thecolorapi.com/id?hex=${hex}`);
      return {
        hex: d.hex.value, hexClean: d.hex.clean,
        rgb: d.rgb.value, hsl: d.hsl.value, hsv: d.hsv.value, cmyk: d.cmyk?.value,
        name: d.name?.value, contrastWithWhite: d.contrast?.white?.contrast.toFixed(2),
      };
    }
    case 'color_scheme': {
      if (!args.hex) throw new Error('hex is required');
      const hex = args.hex.replace(/^#/, '');
      const count = Math.min(Number(args.count) || 5, 12);
      const d = await getJson(`https://www.thecolorapi.com/scheme?hex=${hex}&count=${count}`);
      return { base: d.baseColor?.hex?.value, mode: d.mode, colors: (d.colors || []).map(c => ({ hex: c.hex.value, rgb: c.rgb.value, name: c.name?.value })) };
    }
    case 'datamuse_synonyms': {
      if (!args.word) throw new Error('word is required');
      const w = encodeURIComponent(args.word);
      const lim = Math.min(Number(args.limit) || 10, 30);
      const d = await getJson(`https://api.datamuse.com/words?rel_syn=${w}&max=${lim}`);
      return { word: args.word, count: d.length, synonyms: d.map(x => x.word) };
    }
    case 'npm_search': {
      if (!args.query) throw new Error('query is required');
      const q = encodeURIComponent(args.query);
      const lim = Math.min(Number(args.limit) || 5, 20);
      const d = await getJson(`https://registry.npmjs.org/-/v1/search?text=${q}&size=${lim}`);
      return { query: args.query, total: d.total, packages: (d.objects || []).map(o => ({ name: o.package.name, version: o.package.version, description: o.package.description?.slice(0, 80), downloads: o.downloads?.lastMonth, updatedAt: o.updated })) };
    }
    case 'spdx_licenses': {
      const d = await getJson('https://spdx.org/licenses/licenses.json');
      if (args.licenseId) {
        const match = d.licenses.find(l => l.licenseId.toLowerCase() === args.licenseId.toLowerCase());
        return match ? { found: true, ...match } : { found: false, searched: args.licenseId };
      }
      return { total: d.licenses.length, version: d.licenseListVersion, sample: d.licenses.slice(0, 10).map(l => l.licenseId) };
    }
    case 'random_user': {
      const gender = args.gender ? `&gender=${args.gender}` : '';
      const count = Math.min(Number(args.count) || 1, 10);
      const d = await getJson(`https://randomuser.me/api/?results=${count}${gender}`);
      return { results: (d.results || []).map(u => ({ gender: u.gender, name: `${u.name.first} ${u.name.last}`, dob: u.dob.date, age: u.dob.age, location: `${u.location.city}, ${u.location.country}`, email: u.email, phone: u.phone, pictureThumb: u.picture.thumbnail })), info: d.info };
    }
    case 'comment_for_post': {
      const postId = args.postId || 1;
      const limit = Math.min(Number(args.limit) || 5, 20);
      const d = await getJson(`https://jsonplaceholder.typicode.com/comments?postId=${postId}&_page=1&_limit=${limit}`);
      return { postId, count: d.length, comments: d };
    }
    case 'quote_today': {
      const d = await getJson('https://zenquotes.io/api/today');
      if (!d?.[0]) throw new Error('no quote today');
      return { quote: d[0].q, author: d[0].a, image: d[0].i, date: d[0].date };
    }
    default:
      throw new Error(`unknown util: ${name}`);
  }
}

module.exports = { UTIL_TOOLS, runUtil, UTIL_PRICE: { usd: 0.01, atomic: 10000 } };
