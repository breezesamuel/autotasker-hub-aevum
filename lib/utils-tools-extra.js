/**
 * utils-tools-extra.js — AutoTasker Hub v5 tool pack
 *
 * 36 additional tools, all backed by keyless upstreams verified live on 2026-11-13
 * (see data/probe-v4-results.json). Split into:
 *   - CN (12): mainland-only sources — Weibo/Douyin/Baidu/Douban/THS/QQ/NetEase/Juejin
 *              These are the moat: overseas agents cannot reach them.
 *   - GLOBAL (24): high-value keyless APIs (data, science, dev, geo, content)
 *
 * Pricing is per-tool (PRICE_BY_TOOL) so China-exclusive data can carry a premium
 * while commodity global APIs stay at the $0.01 floor.
 *
 * Exports: EXTRA_TOOLS, runExtra, isExtra, PRICE_BY_TOOL
 */
'use strict';

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
var TO = 15000;
var JSON_H = { 'user-agent': UA, accept: 'application/json,text/plain,*/*', 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' };
var CN_H = { 'user-agent': UA, accept: 'application/json,text/plain,*/*', 'accept-language': 'zh-CN,zh;q=0.9', referer: 'https://www.baidu.com/' };

function gj(u, headers) {
  return fetch(u, { headers: headers || JSON_H, signal: AbortSignal.timeout(TO) }).then(function (r) {
    if (!r.ok) throw new Error('upstream ' + r.status);
    return r.json();
  });
}
function gt(u, headers) {
  return fetch(u, { headers: headers || JSON_H, signal: AbortSignal.timeout(TO) }).then(function (r) {
    if (!r.ok) throw new Error('upstream ' + r.status);
    return r.text();
  });
}
function clamp(v, def, max) {
  var n = Number(v);
  if (!isFinite(n) || n <= 0) n = def;
  return Math.min(n, max);
}
function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&rsquo;/g, '\u2019').replace(/&lsquo;/g, '\u2018')
    .replace(/&ldquo;/g, '\u201c').replace(/&rdquo;/g, '\u201d')
    .replace(/&hellip;/g, '\u2026').replace(/&eacute;/g, '\u00e9')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ');
}
function geocode(city) {
  return gj('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=' + encodeURIComponent(city)).then(function (g) {
    var hit = (g.results || [])[0];
    if (!hit) throw new Error('city not found: ' + city);
    return { lat: hit.latitude, lon: hit.longitude, name: hit.name, country: hit.country };
  });
}
function resolveLatLon(a) {
  if (a.lat != null && a.lon != null) {
    return Promise.resolve({ lat: Number(a.lat), lon: Number(a.lon), name: a.city || null, country: null });
  }
  if (a.city) return geocode(a.city);
  return Promise.reject(new Error('provide city or lat + lon'));
}

// ── Tool declarations ──────────────────────────────────────────────────────
var T = [];
function add(name, description, props, required) {
  var schema = { type: 'object', properties: props || {} };
  if (required) schema.required = required;
  T.push({ name: name, description: description, inputSchema: schema });
}

// ── CN: hot indexes ──
add('baidu_hot', 'Baidu Top Search realtime board (百度热搜) — mainland-only trend signal, includes pinned item. $0.02 USDC.', { limit: { type: 'integer', default: 10, maximum: 50 } });
add('douyin_hot', 'Douyin (TikTok China) trending word board with hot_value rankings (抖音热榜). $0.02 USDC.', { limit: { type: 'integer', default: 10, maximum: 50 } });
add('douban_movie', 'Douban "now showing" cinema board: titles, cast, genres, release dates, ratings (豆瓣热映). $0.02 USDC.', { limit: { type: 'integer', default: 10, maximum: 20 } });
add('ithome_news', 'IT Home (IT之家) tech news feed: titles, summaries, timestamps, comment counts. $0.01 USDC.', { limit: { type: 'integer', default: 10, maximum: 25 } });
add('thepaper_hot', 'The Paper (澎湃新闻) hot news ranking with interaction counts. $0.02 USDC.', { limit: { type: 'integer', default: 10, maximum: 20 } });
add('wallstreetcn', 'WallstreetCN (华尔街见闻) 7x24 live financial newswire: headline + body + timestamp. $0.03 USDC.', { limit: { type: 'integer', default: 10, maximum: 30 } });
add('juejin_hot', 'Juejin (掘金) recommended developer articles: title, brief, author, digg count. $0.01 USDC.', { limit: { type: 'integer', default: 10, maximum: 20 } });

// ── CN: markets ──
add('eastmoney_ashare', 'A-share quotes via Eastmoney: top gainers board, or one stock by code (e.g. 600519) with OHLC, volume, amount, PE. $0.03 USDC.', { symbol: { type: 'string', description: 'Optional 6-digit A-share code, e.g. 600519' }, limit: { type: 'integer', default: 10, maximum: 50 } });
add('eastmoney_index', 'Mainland index snapshot: SSE Composite, SZSE Component, ChiNext, CSI300, STAR50 with change %. $0.02 USDC.', {});
add('tencent_quote', 'Tencent realtime quote with 5-level order book (bid/ask ladder), limit-up/down ready. Pass comma-separated codes like sh600519,sz000001. $0.03 USDC.', { symbols: { type: 'string', description: 'Comma-separated, e.g. sh600519,sz000001' } }, ['symbols']);

// ── CN: music charts ──
add('qqmusic_toplist', 'QQ Music peak charts (巅峰榜·热歌): rank, song, artist, album, duration. $0.02 USDC.', { limit: { type: 'integer', default: 10, maximum: 50 }, topId: { type: 'integer', default: 26, description: '26=hot songs, 4=new songs, 27=original' } });
add('netease_hot', 'NetEase Cloud Music hot song list (网易云热歌榜) with popularity scores. $0.02 USDC.', { limit: { type: 'integer', default: 10, maximum: 50 } });

// ── GLOBAL: environment / geo ──
add('air_quality', 'Air quality + PM2.5/PM10/European AQI for any city or lat/lon (Open-Meteo). China cities supported. $0.01 USDC.', { city: { type: 'string' }, lat: { type: 'number' }, lon: { type: 'number' } });
add('open_meteo_marine', 'Marine conditions: wave height, sea surface temperature, swell for coastal coordinates. $0.01 USDC.', { city: { type: 'string' }, lat: { type: 'number' }, lon: { type: 'number' } });
add('sunrise_sunset', 'Sunrise, sunset, solar noon, day length and 3 twilight phases for any coordinate/date. $0.01 USDC.', { lat: { type: 'number' }, lon: { type: 'number' }, date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' } }, ['lat', 'lon']);
add('usgs_quake', 'Live earthquakes worldwide from USGS: magnitude, place, depth, tsunami flag, felt reports. $0.01 USDC.', { minMagnitude: { type: 'number', default: 2.5 }, limit: { type: 'integer', default: 10, maximum: 50 } });
add('carbon_intensity', 'UK national grid carbon intensity (gCO2/kWh): actual, forecast, index band. $0.01 USDC.', {});

// ── GLOBAL: money ──
add('erapi_fx', '160+ fiat exchange rates from a single base currency (exchangerate-api mirror, daily refresh). $0.01 USDC.', { base: { type: 'string', default: 'USD' }, symbols: { type: 'string', description: 'Optional comma list, e.g. CNY,EUR,JPY' } });
add('worldbank_indicator', 'World Bank development indicator series for a country (GDP, population, inflation, etc). $0.01 USDC.', { country: { type: 'string', default: 'CN' }, indicator: { type: 'string', default: 'NY.GDP.MKTP.CD' }, limit: { type: 'integer', default: 5, maximum: 20 } }, ['country', 'indicator']);

// ── GLOBAL: science ──
add('pubmed_search', 'PubMed literature search (NCBI E-utilities): PMIDs + titles + journal + pubdate. $0.01 USDC.', { query: { type: 'string' }, limit: { type: 'integer', default: 5, maximum: 20 } }, ['query']);
add('crossref_search', 'Crossref DOI metadata search: title, authors, DOI, publisher, year, citation count. $0.01 USDC.', { query: { type: 'string' }, limit: { type: 'integer', default: 5, maximum: 20 } }, ['query']);
add('zenodo_search', 'Zenodo open research records (datasets, software, papers) with DOI and creators. $0.01 USDC.', { query: { type: 'string' }, limit: { type: 'integer', default: 5, maximum: 20 } }, ['query']);
add('openf1', 'Formula 1 live session data: drivers, teams, numbers, headshots (OpenF1). $0.01 USDC.', {});

// ── GLOBAL: space / earth ──
add('iss_position', 'International Space Station live position: latitude, longitude, altitude, velocity, visibility. $0.01 USDC.', {});

// ── GLOBAL: dev ecosystem ──
add('pypi_info', 'PyPI package metadata: latest version, summary, license, requires_python, author, classifiers. $0.01 USDC.', { package: { type: 'string' } }, ['package']);
add('crates_search', 'crates.io Rust crate search: name, max version, total + recent downloads. $0.01 USDC.', { query: { type: 'string' }, limit: { type: 'integer', default: 5, maximum: 20 } }, ['query']);
add('codeforces_contests', 'Codeforces contest list with phase, start time, duration, ICPC/CF type. $0.01 USDC.', { limit: { type: 'integer', default: 10, maximum: 50 }, upcomingOnly: { type: 'boolean', default: true } });

// ── GLOBAL: content / reference ──
add('itunes_search', 'iTunes search across music, podcasts, apps, movies: names, artists, artwork, 30s preview URLs. $0.01 USDC.', { term: { type: 'string' }, media: { type: 'string', default: 'music' }, limit: { type: 'integer', default: 5, maximum: 25 } }, ['term']);
add('themealdb', 'Recipe search (TheMealDB): ingredients, measures, instructions, thumbnail, YouTube link. $0.01 USDC.', { query: { type: 'string' } }, ['query']);
add('openfoodfacts', 'Food product lookup by barcode: name, brand, Nutri-Score, NOVA group, allergens, per-100g nutrients. $0.01 USDC.', { barcode: { type: 'string' } }, ['barcode']);
add('jisho_search', 'Japanese dictionary (Jisho): readings, JLPT level, English definitions, parts of speech. $0.01 USDC.', { keyword: { type: 'string' }, limit: { type: 'integer', default: 5, maximum: 20 } }, ['keyword']);
add('university_search', 'University directory (Hipolabs): name, country, web pages, domains. $0.01 USDC.', { name: { type: 'string' }, country: { type: 'string', default: 'China' } });
add('opentdb_trivia', 'Open Trivia DB quiz questions with correct + incorrect answers, difficulty and category. $0.01 USDC.', { amount: { type: 'integer', default: 5, maximum: 20 }, difficulty: { type: 'string', description: 'easy | medium | hard' } });
add('advice_slip', 'Random advice slip (Advice Slip API) — lightweight creative prompt for agents. $0.01 USDC.', {});
add('useless_fact', 'Random useless fact with source attribution. $0.01 USDC.', {});
add('random_fox', 'Random fox image URL + permalink (image tool for agents). $0.01 USDC.', {});

// ── Pricing ────────────────────────────────────────────────────────────────
function price(usd) { return { usd: usd, atomic: Math.round(usd * 1000000) }; }
var PRICE_BY_TOOL = {
  baidu_hot: price(0.02),
  douyin_hot: price(0.02),
  douban_movie: price(0.02),
  ithome_news: price(0.01),
  thepaper_hot: price(0.02),
  wallstreetcn: price(0.03),
  juejin_hot: price(0.01),
  eastmoney_ashare: price(0.03),
  eastmoney_index: price(0.02),
  tencent_quote: price(0.03),
  qqmusic_toplist: price(0.02),
  netease_hot: price(0.02),
  air_quality: price(0.01),
  open_meteo_marine: price(0.01),
  sunrise_sunset: price(0.01),
  usgs_quake: price(0.01),
  carbon_intensity: price(0.01),
  erapi_fx: price(0.01),
  worldbank_indicator: price(0.01),
  pubmed_search: price(0.01),
  crossref_search: price(0.01),
  zenodo_search: price(0.01),
  openf1: price(0.01),
  iss_position: price(0.01),
  pypi_info: price(0.01),
  crates_search: price(0.01),
  codeforces_contests: price(0.01),
  itunes_search: price(0.01),
  themealdb: price(0.01),
  openfoodfacts: price(0.01),
  jisho_search: price(0.01),
  university_search: price(0.01),
  opentdb_trivia: price(0.01),
  advice_slip: price(0.01),
  useless_fact: price(0.01),
  random_fox: price(0.01),
};

var NAMES = {};
for (var i = 0; i < T.length; i++) NAMES[T[i].name] = true;
function isExtra(name) { return !!NAMES[name]; }

// ── Executors ──────────────────────────────────────────────────────────────

// CN hot boards
function runBaiduHot(a) {
  var lim = clamp(a.limit, 10, 50);
  return gj('https://top.baidu.com/api/board?platform=wise&tab=realtime', CN_H).then(function (d) {
    var card = (d.data && d.data.cards && d.data.cards[0]) || {};
    var inner = (card.content && card.content[0] && card.content[0].content) || [];
    var out = [];
    for (var i = 0; i < inner.length && out.length < lim; i++) {
      if (!inner[i] || !inner[i].word) continue;
      out.push({ rank: out.length + 1, title: inner[i].word, pinned: !!inner[i].isTop, url: inner[i].url });
    }
    return { board: 'baidu_hot', boardName: card.text || '百度热搜', count: out.length, items: out, fetchedAt: new Date().toISOString() };
  });
}

function runDouyinHot(a) {
  var lim = clamp(a.limit, 10, 50);
  return gj('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/', CN_H).then(function (d) {
    var list = d.word_list || [], out = [];
    for (var i = 0; i < list.length && i < lim; i++) {
      out.push({ rank: i + 1, title: list[i].word, hotValue: list[i].hot_value, label: list[i].label || null });
    }
    return { board: 'douyin_hot', snapshotAt: d.active_time || null, count: out.length, items: out };
  });
}

function runDoubanMovie(a) {
  var lim = clamp(a.limit, 10, 20);
  return gj('https://m.douban.com/rexxar/api/v2/subject_collection/movie_showing/items?start=0&count=' + lim, {
    'user-agent': UA, accept: 'application/json', 'accept-language': 'zh-CN,zh;q=0.9', referer: 'https://m.douban.com/'
  }).then(function (d) {
    var list = d.subject_collection_items || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      out.push({
        title: m.title, info: m.info || '', releaseDate: m.release_date || null,
        rating: m.rating && m.rating.value != null ? m.rating.value : null,
        cover: m.cover && m.cover.url, doubanId: m.id, url: m.url
      });
    }
    return { board: (d.subject_collection && d.subject_collection.name) || '影院热映', total: d.total, count: out.length, items: out };
  });
}

function runIthome(a) {
  var lim = clamp(a.limit, 10, 25);
  return gj('https://api.ithome.com/json/newslist/news', CN_H).then(function (d) {
    var list = d.newslist || [], out = [];
    for (var i = 0; i < list.length && i < lim; i++) {
      out.push({ title: list[i].title, summary: (list[i].description || '').slice(0, 200), published: list[i].postdate, comments: list[i].commentcount, views: list[i].hitcount, newsId: list[i].newsid });
    }
    return { count: out.length, items: out };
  });
}

function runThepaper(a) {
  var lim = clamp(a.limit, 10, 20);
  return gj('https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar', CN_H).then(function (d) {
    var list = (d.data && d.data.hotNews) || [], out = [];
    for (var i = 0; i < list.length && i < lim; i++) {
      var n = list[i];
      out.push({
        rank: i + 1, title: n.name || n.title || '', published: n.pubTimeNew || n.pubTime || null,
        interactions: n.interactionNum || 0, praises: n.praiseTimes || 0,
        contId: n.contId, url: 'https://www.thepaper.cn/newsDetail_forward_' + n.contId
      });
    }
    return { board: '澎湃热榜', count: out.length, items: out };
  });
}

function runWallstreetcn(a) {
  var lim = clamp(a.limit, 10, 30);
  return gj('https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=' + lim, CN_H).then(function (d) {
    var list = (d.data && d.data.items) || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      out.push({
        title: it.title || null,
        text: (it.content_text || '').slice(0, 400),
        published: it.display_time ? new Date(it.display_time * 1000).toISOString() : null,
        channel: it.global_channel_name || null,
        comments: it.comment_count || 0,
        id: it.id
      });
    }
    return { channel: 'global-7x24', count: out.length, items: out };
  });
}

function runJuejin(a) {
  var lim = clamp(a.limit, 10, 20);
  return fetch('https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed', {
    method: 'POST',
    headers: { 'user-agent': UA, accept: 'application/json', 'content-type': 'application/json', 'accept-language': 'zh-CN,zh;q=0.9' },
    body: JSON.stringify({ id_type: 2, client_type: 2608, sort_type: 200, cursor: '0', limit: lim }),
    signal: AbortSignal.timeout(TO)
  }).then(function (r) { if (!r.ok) throw new Error('upstream ' + r.status); return r.json(); }).then(function (d) {
    if (d.err_no !== 0 && d.err_no !== undefined) throw new Error('juejin err_no ' + d.err_no);
    var list = d.data || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var ii = list[i].item_info; if (!ii || !ii.article_info) continue;
      var ai = ii.article_info, au = ii.author_user_info || {};
      out.push({
        title: ai.title, brief: (ai.brief_content || '').slice(0, 200),
        author: au.user_name || null, diggs: au.got_digg_count || 0, views: au.post_article_count || 0,
        articleId: ai.article_id, url: 'https://juejin.cn/post/' + ai.article_id
      });
    }
    return { count: out.length, items: out };
  });
}

// CN markets
function emSecid(code) {
  var c = String(code || '').replace(/\D/g, '');
  if (!c) return null;
  var prefix = /^(6|5|9|68)/.test(c) ? '1' : '0';
  return prefix + '.' + c;
}

function runEastmoneyAshare(a) {
  if (a.symbol) {
    var secid = emSecid(a.symbol);
    if (!secid) return Promise.reject(new Error('invalid symbol'));
    var fields = 'f43,f44,f45,f46,f47,f48,f50,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170';
    return gj('https://push2.eastmoney.com/api/qt/stock/get?fltt=2&invt=2&secid=' + secid + '&fields=' + fields).then(function (d) {
      var x = d.data;
      if (!x) throw new Error('symbol not found: ' + a.symbol);
      return {
        symbol: x.f57, name: x.f58, price: x.f43, high: x.f44, low: x.f45, open: x.f46,
        prevClose: x.f60, change: x.f169, changePct: x.f170, volumeLots: x.f47, amountCny: x.f48,
        turnoverPct: x.f168, peTtm: x.f162, marketCap: x.f116, floatCap: x.f117, currency: 'CNY'
      };
    });
  }
  var lim = clamp(a.limit, 10, 50);
  var f = 'f1,f2,f3,f4,f5,f6,f12,f14,f15,f16,f17,f18';
  var fs = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23';
  return gj('https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=' + lim + '&po=1&np=1&fltt=2&invt=2&fid=f3&fs=' + fs + '&fields=' + f).then(function (d) {
    var list = (d.data && d.data.diff) || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      out.push({ code: x.f12, name: x.f14, priceCny: x.f2, changePct: x.f3, change: x.f4, volumeLots: x.f5, amountCny: x.f6, high: x.f15, low: x.f16, open: x.f17, prevClose: x.f18 });
    }
    return { board: 'top-gainers', total: (d.data && d.data.total) || out.length, count: out.length, items: out };
  });
}

function runEastmoneyIndex(a) {
  var secids = '1.000001,0.399001,0.399006,1.000300,1.000688';
  return gj('https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&secids=' + secids + '&fields=f2,f3,f4,f6,f12,f14,f15,f16,f18').then(function (d) {
    var list = (d.data && d.data.diff) || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      out.push({ code: x.f12, name: x.f14, value: x.f2, changePct: x.f3, change: x.f4, amountCny: x.f6, high: x.f15, low: x.f16, prevClose: x.f18 });
    }
    return { market: 'A-share indices', count: out.length, items: out };
  });
}

function runTencentQuote(a) {
  if (!a.symbols) return Promise.reject(new Error('symbols is required'));
  var syms = String(a.symbols).split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean).slice(0, 10);
  return fetch('https://qt.gtimg.cn/q=' + syms.join(','), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(TO) })
    .then(function (r) { if (!r.ok) throw new Error('upstream ' + r.status); return r.arrayBuffer(); })
    .then(function (buf) {
      // Tencent serves GBK; Node has full ICU so this works. Fall back to latin1 if not.
      var txt;
      try { txt = new TextDecoder('gbk').decode(buf); } catch (e) { txt = Buffer.from(buf).toString('latin1'); }
      var lines = txt.split(';'), out = [];
      for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/v_([a-z0-9]+)="([^"]*)"/i);
        if (!m) continue;
        var f = m[2].split('~');
        if (f.length < 40) continue;
        var bids = [], asks = [];
        for (var j = 9; j <= 18; j += 2) if (f[j]) bids.push({ price: Number(f[j]), volumeLots: Number(f[j + 1]) || 0 });
        for (var k = 19; k <= 28; k += 2) if (f[k]) asks.push({ price: Number(f[k]), volumeLots: Number(f[k + 1]) || 0 });
        out.push({
          symbol: f[2], market: f[0], name: f[1], price: Number(f[3]), prevClose: Number(f[4]), open: Number(f[5]),
          volumeLots: Number(f[6]), outerVolume: Number(f[7]), innerVolume: Number(f[8]),
          time: f[30], change: Number(f[31]), changePct: Number(f[32]), high: Number(f[33]), low: Number(f[34]),
          amountCny: Number(f[37]), turnoverPct: Number(f[38]), peTtm: Number(f[39]),
          bidLadder: bids, askLadder: asks
        });
      }
      if (!out.length) throw new Error('no quotes parsed; check symbol format (sh600519 / sz000001)');
      return { count: out.length, quotes: out };
    });
}

// CN music
function runQqmusic(a) {
  var lim = clamp(a.limit, 10, 50), topId = Number(a.topId) || 26;
  var u = 'https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?topid=' + topId + '&format=json&page=detail&type=top&song_begin=0&song_num=' + lim;
  return gj(u, { 'user-agent': UA, accept: 'application/json', referer: 'https://y.qq.com/' }).then(function (d) {
    var list = d.songlist || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i].data || {};
      var singers = [];
      for (var j = 0; j < (s.singer || []).length; j++) singers.push(s.singer[j].name);
      out.push({ rank: i + 1, song: s.songname, artists: singers, album: s.albumname, durationSec: s.interval, mid: s.songmid || s.songid });
    }
    return { chart: (d.topinfo && d.topinfo.ListName) || 'QQ Music', updateDate: d.update_time || d.date || null, count: out.length, items: out };
  });
}

function runNeteaseHot(a) {
  var lim = clamp(a.limit, 10, 50);
  return gj('https://music.163.com/api/playlist/detail?id=3778678', { 'user-agent': UA, accept: 'application/json', referer: 'https://music.163.com/' }).then(function (d) {
    var tracks = (d.result && d.result.tracks) || [], out = [];
    for (var i = 0; i < tracks.length && i < lim; i++) {
      var t = tracks[i], ar = [];
      for (var j = 0; j < (t.artists || []).length; j++) ar.push(t.artists[j].name);
      out.push({ rank: i + 1, song: t.name, artists: ar, album: t.album && t.album.name, popularity: t.popularity, songId: t.id });
    }
    return { chart: (d.result && d.result.name) || '网易云热歌榜', count: out.length, items: out };
  });
}

// Environment / geo
function runAirQuality(a) {
  return resolveLatLon(a).then(function (loc) {
    var u = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + loc.lat + '&longitude=' + loc.lon +
      '&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,european_aqi,us_aqi&timezone=auto';
    return gj(u).then(function (d) {
      var c = d.current || {};
      var aqi = c.european_aqi;
      var band = aqi == null ? 'unknown' : aqi <= 20 ? 'good' : aqi <= 40 ? 'fair' : aqi <= 60 ? 'moderate' : aqi <= 80 ? 'poor' : aqi <= 100 ? 'very poor' : 'extremely poor';
      return {
        location: { name: loc.name, country: loc.country, lat: loc.lat, lon: loc.lon },
        time: c.time, pm2_5_ugm3: c.pm2_5, pm10_ugm3: c.pm10, no2_ugm3: c.nitrogen_dioxide,
        o3_ugm3: c.ozone, co_ugm3: c.carbon_monoxide, european_aqi: aqi, us_aqi: c.us_aqi, band: band
      };
    });
  });
}

function runMarine(a) {
  return resolveLatLon(a).then(function (loc) {
    var u = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + loc.lat + '&longitude=' + loc.lon +
      '&current=wave_height,wave_direction,wave_period,swell_wave_height,sea_surface_temperature&timezone=auto';
    return gj(u).then(function (d) {
      var c = d.current || {};
      return {
        location: { name: loc.name, country: loc.country, lat: loc.lat, lon: loc.lon },
        time: c.time, waveHeightM: c.wave_height, waveDirectionDeg: c.wave_direction, wavePeriodS: c.wave_period,
        swellHeightM: c.swell_wave_height, seaSurfaceTempC: c.sea_surface_temperature
      };
    });
  });
}

function runSunriseSunset(a) {
  if (a.lat == null || a.lon == null) return Promise.reject(new Error('lat and lon are required'));
  var u = 'https://api.sunrise-sunset.org/json?lat=' + Number(a.lat) + '&lng=' + Number(a.lon) + '&formatted=0';
  if (a.date) u += '&date=' + encodeURIComponent(a.date);
  return gj(u).then(function (d) {
    if (d.status !== 'OK') throw new Error(d.status || 'upstream error');
    return { lat: Number(a.lat), lon: Number(a.lon), date: a.date || null, tzid: d.tzid, results: d.results };
  });
}

function runUsgsQuake(a) {
  var lim = clamp(a.limit, 10, 50), minMag = a.minMagnitude != null ? Number(a.minMagnitude) : 2.5;
  var feed = minMag >= 4.5 ? '4.5_day' : minMag >= 2.5 ? '2.5_day' : 'all_day';
  return gj('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/' + feed + '.geojson').then(function (d) {
    var feat = d.features || [], out = [];
    out.sort;
    for (var i = 0; i < feat.length && out.length < lim; i++) {
      var p = feat[i].properties || {}, g = (feat[i].geometry && feat[i].geometry.coordinates) || [];
      if (p.mag != null && p.mag < minMag) continue;
      out.push({
        magnitude: p.mag, place: p.place, time: p.time ? new Date(p.time).toISOString() : null,
        depthKm: g[2], lat: g[1], lon: g[0], tsunami: p.tsunami === 1, alert: p.alert || null,
        felt: p.felt || 0, url: p.url
      });
    }
    out.sort(function (x, y) { return (y.magnitude || 0) - (x.magnitude || 0); });
    return { feed: feed, totalInFeed: (d.metadata && d.metadata.count) || feat.length, count: out.length, items: out };
  });
}

function runCarbonIntensity() {
  return gj('https://api.carbonintensity.org.uk/intensity').then(function (d) {
    var it = (d.data || [])[0] || {};
    return { from: it.from, to: it.to, forecastGco2PerKwh: it.intensity && it.intensity.forecast, actualGco2PerKwh: it.intensity && it.intensity.actual, index: it.intensity && it.intensity.index, region: 'United Kingdom' };
  });
}

// Money
function runErApiFx(a) {
  var base = (a.base || 'USD').toUpperCase();
  return gj('https://open.er-api.com/v6/latest/' + encodeURIComponent(base)).then(function (d) {
    if (d.result !== 'success') throw new Error(d['error-type'] || 'upstream error');
    var rates = d.rates || {};
    if (a.symbols) {
      var want = String(a.symbols).split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean);
      var filtered = {};
      for (var i = 0; i < want.length; i++) if (rates[want[i]] != null) filtered[want[i]] = rates[want[i]];
      rates = filtered;
    }
    return { base: d.base_code || base, updated: d.time_last_update_utc, nextUpdate: d.time_next_update_utc, provider: d.provider, rateCount: Object.keys(rates).length, rates: rates };
  });
}

function runWorldBank(a) {
  if (!a.country) return Promise.reject(new Error('country is required'));
  if (!a.indicator) return Promise.reject(new Error('indicator is required'));
  var lim = clamp(a.limit, 5, 20);
  var u = 'https://api.worldbank.org/v2/country/' + encodeURIComponent(a.country) + '/indicator/' + encodeURIComponent(a.indicator) + '?format=json&per_page=' + lim;
  return gj(u).then(function (d) {
    var rows = Array.isArray(d[1]) ? d[1] : [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      out.push({ year: rows[i].date, value: rows[i].value, country: rows[i].country && rows[i].country.value, indicator: rows[i].indicator && rows[i].indicator.value });
    }
    return { country: a.country.toUpperCase(), indicator: a.indicator, count: out.length, series: out };
  });
}

// Science
function runPubmed(a) {
  if (!a.query) return Promise.reject(new Error('query is required'));
  var lim = clamp(a.limit, 5, 20);
  var es = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=' + lim + '&term=' + encodeURIComponent(a.query);
  return gj(es).then(function (d) {
    var ids = (d.esearchresult && d.esearchresult.idlist) || [];
    if (!ids.length) return { query: a.query, total: 0, count: 0, articles: [] };
    var su = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=' + ids.join(',');
    return gj(su).then(function (s) {
      var res = s.result || {}, out = [];
      for (var i = 0; i < ids.length; i++) {
        var r = res[ids[i]] || {};
        var authors = [];
        for (var j = 0; j < (r.authors || []).length && j < 5; j++) authors.push(r.authors[j].name);
        out.push({ pmid: ids[i], title: r.title, journal: r.fulljournalname || r.source, pubdate: r.pubdate, authors: authors, doi: (r.articleids || []).filter(function (x) { return x.idtype === 'doi'; }).map(function (x) { return x.value; })[0] || null, url: 'https://pubmed.ncbi.nlm.nih.gov/' + ids[i] + '/' });
      }
      return { query: a.query, total: Number((d.esearchresult || {}).count || out.length), count: out.length, articles: out };
    });
  });
}

function runCrossref(a) {
  if (!a.query) return Promise.reject(new Error('query is required'));
  var lim = clamp(a.limit, 5, 20);
  return gj('https://api.crossref.org/works?rows=' + lim + '&query=' + encodeURIComponent(a.query) + '&select=DOI,title,author,published,container-title,type,publisher,is-referenced-by-count,URL').then(function (d) {
    var items = (d.message && d.message.items) || [], out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i], authors = [];
      for (var j = 0; j < (it.author || []).length && j < 5; j++) authors.push(((it.author[j].given || '') + ' ' + (it.author[j].family || '')).trim());
      var dp = (it.published && it.published['date-parts'] && it.published['date-parts'][0]) || [];
      out.push({
        doi: it.DOI, title: (it.title || [''])[0], authors: authors, year: dp[0] || null,
        journal: (it['container-title'] || [''])[0], type: it.type, publisher: it.publisher,
        citations: it['is-referenced-by-count'] || 0, url: it.URL
      });
    }
    return { query: a.query, total: (d.message && d.message['total-results']) || out.length, count: out.length, results: out };
  });
}

function runZenodo(a) {
  if (!a.query) return Promise.reject(new Error('query is required'));
  var lim = clamp(a.limit, 5, 20);
  return gj('https://zenodo.org/api/records?size=' + lim + '&q=' + encodeURIComponent(a.query)).then(function (d) {
    var hits = (d.hits && d.hits.hits) || [], out = [];
    for (var i = 0; i < hits.length; i++) {
      var m = hits[i].metadata || {}, creators = [];
      for (var j = 0; j < (m.creators || []).length && j < 5; j++) creators.push(m.creators[j].name);
      out.push({
        id: hits[i].id, title: m.title, doi: m.doi, publicationDate: m.publication_date,
        type: m.resource_type && m.resource_type.title, creators: creators, license: m.license && (m.license.id || m.license),
        url: (hits[i].links && hits[i].links.self_html) || ('https://zenodo.org/records/' + hits[i].id)
      });
    }
    return { query: a.query, total: (d.hits && d.hits.total) || out.length, count: out.length, records: out };
  });
}

function runOpenf1() {
  return gj('https://api.openf1.org/v1/drivers?session_key=latest').then(function (d) {
    var out = [];
    for (var i = 0; i < (d || []).length; i++) {
      var x = d[i];
      out.push({ number: x.driver_number, name: x.full_name, acronym: x.name_acronym, team: x.team_name, teamColour: x.team_colour, headshot: x.headshot_url, sessionKey: x.session_key });
    }
    return { series: 'Formula 1', count: out.length, drivers: out };
  });
}

function runIss() {
  return gj('https://api.wheretheiss.at/v1/satellites/25544').then(function (d) {
    return { name: d.name, latitude: d.latitude, longitude: d.longitude, altitudeKm: d.altitude, velocityKmh: d.velocity, visibility: d.visibility, footprintKm: d.footprint, timestamp: d.timestamp, observedAt: new Date(d.timestamp * 1000).toISOString() };
  });
}

// Dev
function runPypi(a) {
  if (!a.package) return Promise.reject(new Error('package is required'));
  return gj('https://pypi.org/pypi/' + encodeURIComponent(a.package) + '/json').then(function (d) {
    var i = d.info || {};
    return {
      name: i.name, version: i.version, summary: i.summary, license: i.license || i.license_expression,
      requiresPython: i.requires_python, author: i.author, homePage: i.home_page || i.project_url,
      keywords: i.keywords, classifiers: (i.classifiers || []).slice(0, 10), yanked: false,
      urls: i.project_urls || null
    };
  });
}

function runCrates(a) {
  if (!a.query) return Promise.reject(new Error('query is required'));
  var lim = clamp(a.limit, 5, 20);
  return gj('https://crates.io/api/v1/crates?q=' + encodeURIComponent(a.query) + '&per_page=' + lim).then(function (d) {
    var list = d.crates || [], out = [];
    for (var i = 0; i < list.length; i++) {
      out.push({ name: list[i].name, maxVersion: list[i].max_version, downloads: list[i].downloads, recentDownloads: list[i].recent_downloads, updatedAt: list[i].updated_at, crateUrl: 'https://crates.io/crates/' + list[i].name });
    }
    return { query: a.query, total: (d.meta && d.meta.total) || out.length, count: out.length, crates: out };
  });
}

function runCodeforces(a) {
  var lim = clamp(a.limit, 10, 50), upcomingOnly = a.upcomingOnly !== false;
  return gj('https://codeforces.com/api/contest.list?gym=false').then(function (d) {
    if (d.status !== 'OK') throw new Error(d.comment || 'codeforces error');
    var list = d.result || [], out = [];
    for (var i = 0; i < list.length && out.length < lim; i++) {
      var c = list[i];
      if (upcomingOnly && c.phase !== 'BEFORE') continue;
      out.push({
        id: c.id, name: c.name, type: c.type, phase: c.phase,
        startTime: c.startTimeSeconds ? new Date(c.startTimeSeconds * 1000).toISOString() : null,
        durationMinutes: Math.round((c.durationSeconds || 0) / 60),
        url: 'https://codeforces.com/contest/' + c.id
      });
    }
    return { upcomingOnly: upcomingOnly, count: out.length, contests: out };
  });
}

// Content / reference
function runItunes(a) {
  if (!a.term) return Promise.reject(new Error('term is required'));
  var lim = clamp(a.limit, 5, 25), media = a.media || 'music';
  var u = 'https://itunes.apple.com/search?term=' + encodeURIComponent(a.term) + '&media=' + encodeURIComponent(media) + '&limit=' + lim;
  return gj(u).then(function (d) {
    var list = d.results || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      out.push({
        kind: r.kind || r.wrapperType, name: r.trackName || r.collectionName || r.trackCensoredName,
        artist: r.artistName, album: r.collectionName, genre: r.primaryGenreName,
        releaseDate: r.releaseDate, durationMs: r.trackTimeMillis,
        previewUrl: r.previewUrl || null, artwork: r.artworkUrl100 || null, url: r.trackViewUrl || r.collectionViewUrl
      });
    }
    return { term: a.term, media: media, count: d.resultCount, results: out };
  });
}

function runMealDb(a) {
  if (!a.query) return Promise.reject(new Error('query is required'));
  return gj('https://www.themealdb.com/api/json/v1/1/search.php?s=' + encodeURIComponent(a.query)).then(function (d) {
    var meals = d.meals || [], out = [];
    for (var i = 0; i < meals.length && i < 10; i++) {
      var m = meals[i], ing = [];
      for (var j = 1; j <= 20; j++) {
        var name = m['strIngredient' + j], meas = m['strMeasure' + j];
        if (name && String(name).trim()) ing.push(((meas || '') + ' ' + name).trim());
      }
      out.push({
        id: m.idMeal, name: m.strMeal, category: m.strCategory, area: m.strArea,
        instructions: (m.strInstructions || '').slice(0, 600), thumbnail: m.strMealThumb,
        youtube: m.strYoutube || null, ingredients: ing, source: m.strSource || null
      });
    }
    return { query: a.query, count: out.length, meals: out };
  });
}

function runOpenFoodFacts(a) {
  if (!a.barcode) return Promise.reject(new Error('barcode is required'));
  return gj('https://world.openfoodfacts.org/api/v0/product/' + encodeURIComponent(a.barcode) + '.json').then(function (d) {
    if (d.status !== 1) throw new Error('product not found for barcode ' + a.barcode);
    var p = d.product || {}, n = p.nutriments || {};
    return {
      barcode: d.code, name: p.product_name || p.product_name_en || null, brand: p.brands || null,
      quantity: p.quantity || null, categories: p.categories || null,
      nutriscore: p.nutriscore_grade || null, novaGroup: p.nova_group || null,
      allergens: p.allergens || null,
      per100g: { energyKcal: n['energy-kcal_100g'], fat: n.fat_100g, saturatedFat: n['saturated-fat_100g'], carbohydrates: n.carbohydrates_100g, sugars: n.sugars_100g, fiber: n.fiber_100g, proteins: n.proteins_100g, salt: n.salt_100g, sodium: n.sodium_100g },
      ingredients: (p.ingredients_text || '').slice(0, 600), countries: p.countries || null, image: p.image_url || null
    };
  });
}

function runJisho(a) {
  if (!a.keyword) return Promise.reject(new Error('keyword is required'));
  var lim = clamp(a.limit, 5, 20);
  return gj('https://jisho.org/api/v1/search/words?keyword=' + encodeURIComponent(a.keyword)).then(function (d) {
    var list = d.data || [], out = [];
    for (var i = 0; i < list.length && i < lim; i++) {
      var x = list[i], senses = [];
      for (var j = 0; j < (x.senses || []).length && j < 3; j++) {
        var s = x.senses[j];
        senses.push({ english: (s.english_definitions || []).slice(0, 5), pos: (s.parts_of_speech || []).slice(0, 3) });
      }
      var jp = [];
      for (var k = 0; k < (x.japanese || []).length; k++) jp.push({ word: x.japanese[k].word, reading: x.japanese[k].reading });
      out.push({ slug: x.slug, japanese: jp, isCommon: !!x.is_common, jlpt: x.jlpt || [], senses: senses });
    }
    return { keyword: a.keyword, count: out.length, results: out };
  });
}

function runUniversities(a) {
  var qs = [];
  if (a.name) qs.push('name=' + encodeURIComponent(a.name));
  if (a.country) qs.push('country=' + encodeURIComponent(a.country));
  if (!qs.length) qs.push('country=China');
  return gj('http://universities.hipolabs.com/search?' + qs.join('&')).then(function (d) {
    var list = Array.isArray(d) ? d : [], out = [];
    for (var i = 0; i < list.length && i < 20; i++) {
      out.push({ name: list[i].name, country: list[i].country, code: list[i]['alpha_two_code'], webPages: list[i].web_pages, domains: list[i].domains });
    }
    return { count: list.length, shown: out.length, universities: out };
  });
}

function runOpenTdb(a) {
  var amount = clamp(a.amount, 5, 20);
  var u = 'https://opentdb.com/api.php?amount=' + amount;
  if (a.difficulty) u += '&difficulty=' + encodeURIComponent(a.difficulty);
  return gj(u).then(function (d) {
    if (d.response_code !== 0) throw new Error('opentdb response_code ' + d.response_code);
    var list = d.results || [], out = [];
    for (var i = 0; i < list.length; i++) {
      out.push({
        category: decodeEntities(list[i].category), difficulty: list[i].difficulty, type: list[i].type,
        question: decodeEntities(list[i].question), correctAnswer: decodeEntities(list[i].correct_answer),
        incorrectAnswers: (list[i].incorrect_answers || []).map(decodeEntities)
      });
    }
    return { count: out.length, questions: out };
  });
}

function runAdvice() {
  return gj('https://api.adviceslip.com/advice').then(function (d) {
    return { id: d.slip && d.slip.id, advice: d.slip && d.slip.advice };
  });
}

function runUselessFact() {
  return gj('https://uselessfacts.jsph.pl/api/v2/facts/random').then(function (d) {
    return { id: d.id, fact: d.text, source: d.source, sourceUrl: d.source_url, permalink: d.permalink };
  });
}

function runRandomFox() {
  return gj('https://randomfox.ca/floof/').then(function (d) {
    return { image: d.image, permalink: d.link };
  });
}

// ── Dispatcher ─────────────────────────────────────────────────────────────
var MAP = {
  baidu_hot: runBaiduHot, douyin_hot: runDouyinHot, douban_movie: runDoubanMovie,
  ithome_news: runIthome, thepaper_hot: runThepaper, wallstreetcn: runWallstreetcn,
  juejin_hot: runJuejin, eastmoney_ashare: runEastmoneyAshare, eastmoney_index: runEastmoneyIndex,
  tencent_quote: runTencentQuote, qqmusic_toplist: runQqmusic, netease_hot: runNeteaseHot,
  air_quality: runAirQuality, open_meteo_marine: runMarine, sunrise_sunset: runSunriseSunset,
  usgs_quake: runUsgsQuake, carbon_intensity: runCarbonIntensity,
  erapi_fx: runErApiFx, worldbank_indicator: runWorldBank,
  pubmed_search: runPubmed, crossref_search: runCrossref, zenodo_search: runZenodo,
  openf1: runOpenf1, iss_position: runIss,
  pypi_info: runPypi, crates_search: runCrates, codeforces_contests: runCodeforces,
  itunes_search: runItunes, themealdb: runMealDb, openfoodfacts: runOpenFoodFacts,
  jisho_search: runJisho, university_search: runUniversities, opentdb_trivia: runOpenTdb,
  advice_slip: runAdvice, useless_fact: runUselessFact, random_fox: runRandomFox
};

function runExtra(name, args) {
  var fn = MAP[name];
  if (!fn) return Promise.reject(new Error('unknown extra util: ' + name));
  return Promise.resolve(fn(args || {}));
}

module.exports = {
  EXTRA_TOOLS: T,
  runExtra: runExtra,
  isExtra: isExtra,
  EXTRA_NAMES: NAMES,
  PRICE_BY_TOOL: PRICE_BY_TOOL
};
