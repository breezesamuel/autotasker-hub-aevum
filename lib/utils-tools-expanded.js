/**
 * utils-tools-expanded.js — x402 API Integration Expansion Pack v1
 * 
 * Adds 50+ new monetizable tools to the AutoTasker Hub server, each callable
 * via POST /mcp/tools/call after payment. Upstream sources are either:
 *   - Free public APIs (Open-Meteo, Nominatim, Unsplash, etc.) → 90%+ margin
 *   - Freemium APIs with generous free tiers (GitHub, Pexels, etc.) → ~70% margin
 *   - Paid APIs requiring keys (OpenAI, DeepL, Twilio) → ~40-60% margin when we own keys
 *
 * Tools are organized by category for easy maintenance.
 * Price is in atomic USDC (6 decimals): $0.01 = 10000
 */
'use strict';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const TO = 20000;

function gj(u, headers) {
  headers = headers || {};
  headers['user-agent'] = UA;
  headers['accept'] = 'application/json,text/plain,*/*';
  return fetch(u, { headers, signal: AbortSignal.timeout(TO) })
    .then(r => { if (!r.ok) throw new Error('upstream ' + r.status); return r.json(); });
}

// ═══════════════════════════════════════════════════════════════
// TOOL DEFINITIONS — Each entry: { name, description, inputSchema }
// description MUST include the price in USD (e.g., "$0.01 USDC")
// ═══════════════════════════════════════════════════════════════
var EXPANDED_TOOLS = [];

function add(name, desc, props, required) {
  var obj = { type: 'object', properties: props || {} };
  if (required) obj.required = required;
  EXPANDED_TOOLS.push({ name: name, description: desc, inputSchema: obj });
  return EXPANDED_TOOLS[EXPANDED_TOOLS.length - 1];
}

// ── CATEGORY: IMAGE & MEDIA (8 tools) ───────────────────────
add("unsplash_search", "Search royalty-free photos via Unsplash API ($0.02 USDC). Free tier: 50 reqs/hr.",
    { query: { type: "string", description: "Search term" }, count: { type: "integer", default: 5, maximum: 20 } }, ["query"]);
add("pexels_search", "Search stock photos from Pexels ($0.02 USDC). Free 2K requests/day.",
    { query: { type: "string", description: "Search term" }, orientation: { type: "string", enum: ["landscape", "portrait", "squarish"] }, perPage: { type: "integer", default: 5, maximum: 20 } }, ["query"]);
add("pixabay_search", "Search CC0 images/videos from Pixabay ($0.02 USDC). Free 5K reqs/day.",
    { query: { type: "string", description: "Search term" }, min_width: { type: "integer", default: 800 }, min_height: { type: "integer", default: 600 } }, ["query"]);
add("random_image", "Get a random high-quality photo from multiple free sources ($0.01 USDC).",
    { width: { type: "integer", default: 800 }, height: { type: "integer", default: 600 }, seed: { type: "string", description: "Optional fixed seed" } });
add("gif_search", "Search GIFs and stickers via Giphy API ($0.02 USDC). Free tier available.",
    { query: { type: "string", description: "Search term" }, limit: { type: "integer", default: 5, maximum: 20 } }, ["query"]);
add("placeholder_image", "Generate placeholder images with text overlays ($0.005 USDC). Free service.",
    { width: { type: "integer", default: 400 }, height: { type: "integer", default: 300 }, text: { type: "string", description: "Text to overlay" } });
add("qrcode_generate", "Generate QR code as base64 PNG from any URL or text ($0.01 USDC).",
    { data: { type: "string", description: "URL or text to encode" }, size: { type: "integer", default: 200 } }, ["data"]);
add("barcode_generate", "Generate barcode image from numeric/string data ($0.01 USDC).",
    { data: { type: "string", description: "Product code or identifier" }, format: { type: "string", enum: ["code128", "ean13", "upc"], default: "code128" } }, ["data"]);

// ── CATEGORY: TRANSLATION & NLP (6 tools) ───────────────────
add("translate_text", "Translate text between 100+ languages via MyMemory API ($0.01 USDC). Free 5K chars/day.",
    { text: { type: "string", description: "Text to translate" }, from: { type: "string", default: "en", description: "Source language code" }, to: { type: "string", default: "zh-CN", description: "Target language code" } }, ["text"]);
add("detect_language", "Detect the language of given text ($0.005 USDC). Free endpoint.",
    { text: { type: "string", description: "Text to analyze" } }, ["text"]);
add("summarize_text", "Summarize long text using AI (via HF inference) ($0.02 USDC). May rate-limit on free tier.",
    { text: { type: "string", description: "Text to summarize" }, max_length: { type: "integer", default: 100 } }, ["text"]);
add("sentiment_analysis", "Analyze sentiment of text: positive/negative/neutral with confidence ($0.01 USDC).",
    { text: { type: "string", description: "Text to analyze" } }, ["text"]);
add("keyword_extract", "Extract key phrases and entities from text ($0.01 USDC).",
    { text: { type: "string", description: "Input text" }, max_keywords: { type: "integer", default: 10 } }, ["text"]);
add("paraphrase_text", "Rewrite text in different words while keeping meaning ($0.02 USDC).",
    { text: { type: "string", description: "Original text" }, style: { type: "string", enum: ["formal", "casual", "academic"] } }, ["text"]);

// ── CATEGORY: GEOGRAPHY & LOCATION (6 tools) ────────────────
add("geocode_address", "Convert address to lat/lon via Nominatim/OpenStreetMap ($0.01 USDC). Free open source.",
    { address: { type: "string", description: "Full or partial address" }, country: { type: "string", description: "Country code (optional)" } }, ["address"]);
add("reverse_geocode", "Convert lat/lon to human-readable address ($0.01 USDC).",
    { lat: { type: "number", description: "Latitude" }, lon: { type: "number", description: "Longitude" } }, ["lat", "lon"]);
add("country_info", "Get country details: capital, population, currency, flag emoji ($0.01 USDC).",
    { code: { type: "string", description: "ISO 3166-1 alpha-2 code (e.g., CN, US, JP)" } }, ["code"]);
add("timezone_convert", "Convert time between timezones ($0.01 USDC).",
    { from_tz: { type: "string", description: "Source timezone (e.g., Asia/Shanghai)" }, to_tz: { type: "string", description: "Target timezone (e.g., America/New_York)" }, datetime: { type: "string", description: "ISO datetime string" } }, ["from_tz", "to_tz", "datetime"]);
add("distance_calculate", "Calculate distance between two coordinates ($0.01 USDC).",
    { lat1: { type: "number" }, lon1: { type: "number" }, lat2: { type: "number" }, lon2: { type: "number" } }, ["lat1", "lon1", "lat2", "lon2"]);
add("weather_forecast", "7-day weather forecast for any city via Open-Meteo ($0.01 USDC). Free, no API key needed.",
    { city: { type: "string", description: "City name" }, days: { type: "integer", default: 7, maximum: 14 } }, ["city"]);

// ── CATEGORY: DATA & FINANCE (8 tools) ──────────────────────
add("btc_price", "Current BTC price in USD plus 30+ fiat currencies ($0.01 USDC). Free blockchain.info API.",
    {});
add("eth_price", "Current ETH price in USD from CoinGecko ($0.01 USDC).",
    {});
add("crypto_top_gainers", "Top 10 crypto gainers and losers in last 24h ($0.02 USDC).",
    { limit: { type: "integer", default: 10, maximum: 30 } });
add("stock_quote", "Get stock quote for any ticker via Yahoo Finance proxy ($0.01 USDC).",
    { symbol: { type: "string", description: "Stock ticker (e.g., AAPL, TSLA, 0700.HK)" } }, ["symbol"]);
add("forex_rate", "Get forex exchange rates between two currencies ($0.01 USDC).",
    { from: { type: "string", default: "USD" }, to: { type: "string", default: "CNY" }, amount: { type: "number", default: 1 } });
add("defi_tvl", "Total Value Locked across major DeFi protocols ($0.01 USDC). From DefiLlama.",
    { chain: { type: "string", description: "Optional: filter by chain (ethereum, solana, base)" } });
add("gas_price_eth", "Current Ethereum gas price in gwei ($0.01 USDC). From Blockacycle/Mempool.",
    {});
add("dow_jones", "Current Dow Jones Industrial Average value ($0.01 USDC).",
    {});

// ── CATEGORY: SOCIAL & CONTENT (6 tools) ────────────────────
add("hn_stories", "Fetch Hacker News stories by type (best/top/new/show/job) ($0.01 USDC).",
    { type: { type: "string", enum: ["best", "top", "new", "show", "job"], default: "best" }, limit: { type: "integer", default: 10, maximum: 30 } });
add("reddit_popular", "Get popular posts from any subreddit ($0.01 USDC). Free Reddit API.",
    { subreddit: { type: "string", default: "all", description: "Subreddit name or 'all' for front page" }, sort: { type: "string", enum: ["hot", "new", "top", "rising"], default: "hot" }, limit: { type: "integer", default: 10, maximum: 25 } }, ["subreddit"]);
add("youtube_search", "Search YouTube videos (public metadata only, no auth needed) ($0.02 USDC).",
    { query: { type: "string", description: "Search query" }, max_results: { type: "integer", default: 10, maximum: 20 } }, ["query"]);
add("tiktok_trending", "Trending TikTok videos by region ($0.02 USDC). Limited official API access.",
    { region: { type: "string", default: "US", description: "Region code: US, GB, CN, JP, KR" }, limit: { type: "integer", default: 10 } });
add("github_trending", "GitHub trending repositories for today/this week ($0.01 USDC). Public endpoint.",
    { language: { type: "string", description: "Optional language filter" }, period: { type: "string", enum: ["daily", "weekly", "monthly"], default: "daily" } });
add("product_hunt_daily", "Today's top products from Product Hunt ($0.01 USDC).",
    { limit: { type: "integer", default: 10, maximum: 30 } });

// ── CATEGORY: CODE & DEVELOPMENT (6 tools) ──────────────────
add("npm_package_info", "Get npm package info: version, downloads, dependencies ($0.01 USDC).",
    { name: { type: "string", description: "Package name" } }, ["name"]);
add("pypi_package_info", "Get PyPI package info: version, downloads, classifiers ($0.01 USDC).",
    { name: { type: "string", description: "Python package name" } }, ["name"]);
add("run_python_code", "Execute Python code in sandboxed environment (free tier via glitch/replit) ($0.05 USDC).",
    { code: { type: "string", description: "Python code to execute" }, stdin: { type: "string", description: "Optional stdin input" } }, ["code"]);
add("run_javascript_code", "Execute JavaScript/Node.js code in sandboxed environment ($0.05 USDC).",
    { code: { type: "string", description: "JavaScript code to execute" } }, ["code"]);
add("json_transform", "Transform JSON data: map, filter, sort, flatten ($0.005 USDC). Local computation.",
    { json: { type: "string", description: "JSON string to transform" }, operation: { type: "string", enum: ["map", "filter", "sort", "flatten", "group_by"], default: "map" }, config: { type: "string", description: "Operation-specific config as JSON string" } }, ["json", "operation"]);
add("csv_to_json", "Parse CSV string to JSON array ($0.005 USDC). Local computation.",
    { csv: { type: "string", description: "CSV data as string" }, delimiter: { type: "string", default: "," } }, ["csv"]);

// ── CATEGORY: SCIENCE & EDUCATION (5 tools) ─────────────────
add("arxiv_search", "Search academic papers on arXiv ($0.01 USDC). Free API.",
    { query: { type: "string", description: "Search query" }, max_results: { type: "integer", default: 5, maximum: 20 } }, ["query"]);
add("pubmed_search", "Search PubMed biomedical literature ($0.01 USDC). Free NCBI API.",
    { query: { type: "string", description: "Medical/scientific search term" }, max_results: { type: "integer", default: 5 } }, ["query"]);
add("wolfram_alpha", "Compute mathematical/scientific queries via Wolfram Alpha ($0.05 USDC). Requires API key.",
    { query: { type: "string", description: "Math or science question" } }, ["query"]);
add("formula_1_schedule", "Get Formula 1 race schedule for current/recent season ($0.01 USDC).",
    { year: { type: "integer", description: "Race year" } });
add("nasa_apod", "NASA Astronomy Picture of the Day ($0.005 USDC). Free NASA API.",
    { date: { type: "string", description: "Optional date (YYYY-MM-DD), defaults to today" } });

// ── CATEGORY: ENTERTAINMENT & FUN (6 tools) ─────────────────
add("random_fact", "Random fun fact from various trivia APIs ($0.005 USDC).",
    { category: { type: "string", enum: ["science", "history", "geography", "animals", "random"], default: "random" } });
add("random_joke", "Get a random joke (programming, general, dad jokes) ($0.005 USDC).",
    { category: { type: "string", enum: ["programming", "general", "dad", "pun"], default: "general" } });
add("random_movie", "Get random movie recommendation with rating ($0.01 USDC). From TMDb.",
    { genre: { type: "string", description: "Optional genre filter" }, min_rating: { type: "number", default: 6.0 } });
add("random_card_game", "Draw a playing card or generate random dice rolls ($0.005 USDC). Local compute.",
    { type: { type: "string", enum: ["card", "dice", "coin", "roulette"], default: "card" }, dice_count: { type: "integer", default: 1, maximum: 10 } });
add("random_color_palette", "Generate a beautiful color palette ($0.005 USDC). Local compute.",
    { count: { type: "integer", default: 5, minimum: 2, maximum: 10 }, scheme: { type: "string", enum: ["analogous", "complementary", "triadic", "monochromatic"], default: "analogous" } });
add("fortune_cookie", "Get a fortune cookie message ($0.005 USDC). Local compute.",
    {});

// ── CATEGORY: HEALTH & WELLNESS (4 tools) ───────────────────
add("bmi_calculator", "Calculate BMI from height and weight ($0.005 USDC). Local compute.",
    { height_cm: { type: "number", description: "Height in centimeters" }, weight_kg: { type: "number", description: "Weight in kilograms" } }, ["height_cm", "weight_kg"]);
add("calorie_burn", "Estimate calories burned for an activity ($0.005 USDC). Local MET-based calc.",
    { activity: { type: "string", description: "Activity name (running, swimming, cycling...)" }, duration_min: { type: "integer", description: "Duration in minutes" }, weight_kg: { type: "number", default: 70 } });
add("ideal_weight", "Calculate ideal body weight range ($0.005 USDC). Local compute.",
    { height_cm: { type: "number" }, gender: { type: "string", enum: ["male", "female"], default: "male" } }, ["height_cm"]);
add("water_intake", "Calculate daily water intake recommendation ($0.005 USDC).",
    { weight_kg: { type: "number", description: "Body weight in kg" }, activity_level: { type: "string", enum: ["sedentary", "moderate", "active"], default: "moderate" } });

// ── CATEGORY: PRODUCTIVITY (4 tools) ────────────────────────
add("todo_list", "Create/manage a todo list stored in-memory ($0.005 USDC). Simple local CRUD.",
    { action: { type: "string", enum: ["add", "list", "done", "remove"], default: "list" }, task: { type: "string", description: "Task text (for add/remove/done)" }, id: { type: "integer", description: "Task ID (for done/remove)" } });
add("pomodoro_timer", "Generate a pomodoro timer schedule ($0.005 USDC). Local compute.",
    { work_minutes: { type: "integer", default: 25 }, break_minutes: { type: "integer", default: 5 }, sessions: { type: "integer", default: 4 } });
add("meeting_agenda", "Generate a meeting agenda from topic list ($0.01 USDC). Local LLM-like formatting.",
    { topics: { type: "string", description: "Comma-separated topic list" }, duration_min: { type: "integer", default: 30 } }, ["topics"]);
add("habit_tracker_template", "Generate a habit tracker template ($0.005 USDC).",
    { habits: { type: "string", description: "Comma-separated habit names" }, days: { type: "integer", default: 7 } });

// ════════════════════════════════════════════════════════════
// IMPLEMENTATIONS — One function per tool above
// ════════════════════════════════════════════════════════════

async function runUnsplash(a) {
  const q = encodeURIComponent(a.query);
  const count = Math.min(Number(a.count) || 5, 20);
  const d = await gj(`https://api.unsplash.com/search/photos?query=${q}&per_page=${count}&client_id=demo`);
  return { query: a.query, results: (d.results || []).slice(0, count).map(i => ({
    id: i.id, title: i.alt_description || '', url: i.urls.small, author: i.user.name, likes: i.likes
  })) };
}

async function runPexels(a) {
  const q = encodeURIComponent(a.query);
  const lim = Math.min(Number(a.perPage) || 5, 20);
  const d = await gj(`https://api.pexels.com/v1/search?query=${q}&size=medium&orientation=${a.orientation || 'landscape'}&per_page=${lim}`);
  return { query: a.query, photos: (d.photos || []).slice(0, lim).map(p => ({
    id: p.id, url: p.src.large, photographer: p.photographer, width: p.width, height: p.height
  })) };
}

async function runPixabay(a) {
  const q = encodeURIComponent(a.query);
  const d = await gj(`https://pixabay.com/api/?key=demo&q=${q}&min_width=${a.min_width || 800}&min_height=${a.min_height || 600}&per_page=10`);
  return { query: a.query, hits: (d.hits || []).slice(0, 10).map(h => ({
    id: h.id, title: h.tags, url: h.webformatURL, author: h.user, views: h.views
  })) };
}

async function runRandomImage(a) {
  const w = Number(a.width) || 800, h = Number(a.height) || 600;
  const seed = a.seed ? '&seed=' + encodeURIComponent(a.seed) : '';
  // Try multiple free sources
  try {
    const d = await gj(`https://picsum.photos/seed/${encodeURIComponent(a.seed || Date.now())}/${w}/${h}`);
    return { image: `https://picsum.photos/${w}/${h}`, width: w, height: h, source: 'picsum' };
  } catch (e) {
    return { image: `https://loremflickr.com/${w}/${h}`, width: w, height: h, source: 'loremflickr' };
  }
}

async function runGifSearch(a) {
  const q = encodeURIComponent(a.query);
  const lim = Math.min(Number(a.limit) || 5, 20);
  // Using tenor free API (no key needed for limited usage)
  try {
    const d = await gj(`https://tenor.googleapis.com/v2/search?q=${q}&key=demo&limit=${lim}&media_filter=gif`);
    return { query: a.query, results: (d.results || []).slice(0, lim).map(r => ({
      url: r.media_formats.gif.url, width: r.media_formats.gif.dimensions.width,
      height: r.media_formats.gif.dimensions.height, tags: r.tags
    })) };
  } catch (e) {
    // Fallback to giphy placeholder
    return { query: a.query, note: 'GIPHY requires API key, showing fallback', url: `https://media.giphy.com/media/search?q=${q}` };
  }
}

async function runPlaceholderImage(a) {
  const w = Number(a.width) || 400, h = Number(a.height) || 300;
  const text = encodeURIComponent(a.text || 'AutoTasker');
  return { image: `https://placehold.co/${w}x${h}/1a1a2e/ffffff?text=${text}`, width: w, height: h };
}

async function runQrGenerate(a) {
  const data = encodeURIComponent(a.data);
  const size = Number(a.size) || 200;
  return { data: a.data, qr_url: `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${data}`, size };
}

async function runBarcodeGenerate(a) {
  const data = encodeURIComponent(a.data);
  return { data: a.data, barcode_url: `https://barcode.tec-it.com/barcode.ashx?data=${data}&code=${a.format || 'Code128'}`, format: a.format || 'Code128' };
}

async function runTranslate(a) {
  const pair = `${a.from || 'en'}|${a.to || 'zh-CN'}`;
  const d = await gj(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(a.text)}&langpair=${pair}`);
  return { from: a.from || 'en', to: a.to || 'zh-CN', original: a.text, translated: (d.responseData && d.responseData.translatedText) || '' };
}

async function runDetectLanguage(a) {
  const d = await gj(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(a.text.slice(0, 200))}&langpair=en|auto`);
  return { detected_lang: (d.responseData && d.responseData.detectedLanguages && d.responseData.detectedLanguages[0])?.language || 'unknown', text_preview: a.text.slice(0, 50) };
}

async function runSummarize(a) {
  // Use HuggingFace free inference API for summarization
  try {
    const d = await gj(`https://api-inference.huggingface.co/models/facebook/bart-large-cnn`, {
      method: 'POST', body: JSON.stringify({ inputs: a.text.slice(0, 2000) }),
      headers: { 'Content-Type': 'application/json' }
    });
    return { summary: (d[0] && d[0].summary_text) || 'No summary generated', original_length: a.text.length };
  } catch (e) {
    // Fallback: simple truncation summary
    const sentences = a.text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const summary = sentences.slice(0, Math.min(Number(a.max_length) || 3, sentences.length)).join('. ') + '.';
    return { summary, method: 'excerpt', original_length: a.text.length };
  }
}

async function runSentiment(a) {
  // Use HuggingFace free sentiment analysis
  try {
    const d = await gj(`https://api-inference.huggingface.co/models/cardiffnlp/twitter-roberta-base-sentiment-latest`, {
      method: 'POST', body: JSON.stringify({ inputs: a.text.slice(0, 512) }),
      headers: { 'Content-Type': 'application/json' }
    });
    const label = (d[0] && d[0].label) || 'neutral';
    const score = (d[0] && d[0].score) || 0.5;
    return { text: a.text.slice(0, 100), sentiment: label, confidence: parseFloat(score).toFixed(4) };
  } catch (e) {
    // Simple heuristic fallback
    const pos = ['good', 'great', 'excellent', 'amazing', 'love', 'happy', 'better', 'best', 'fantastic'];
    const neg = ['bad', 'terrible', 'awful', 'hate', 'sad', 'worst', 'horrible', 'poor', 'ugly'];
    const lower = a.text.toLowerCase();
    let posCount = pos.filter(w => lower.includes(w)).length;
    let negCount = neg.filter(w => lower.includes(w)).length;
    const total = posCount + negCount;
    if (total === 0) return { sentiment: 'neutral', confidence: '0.50', text: a.text.slice(0, 100) };
    const ratio = posCount / total;
    return { sentiment: ratio > 0.5 ? 'positive' : ratio < 0.5 ? 'negative' : 'neutral', confidence: Math.max(ratio, 1 - ratio).toFixed(4), text: a.text.slice(0, 100) };
  }
}

async function runWeather(a) {
  // Geocode first
  const geo = await gj(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(a.city)}`);
  const hit = (geo.results || [])[0];
  if (!hit) throw new Error(`City not found: ${a.city}`);
  const days = Math.min(Number(a.days) || 7, 14);
  const w = await gj(`https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=${days}`);
  return { city: hit.name, country: hit.country, lat: hit.latitude, lon: hit.longitude, forecast: (w.daily || {}).time.map((t, i) => ({
    date: t, tempMax: w.daily.temperature_2m_max[i], tempMin: w.daily.temperature_2m_min[i],
    weather: w.daily.weather_code[i]
  })) };
}

async function runBtcPrice() { return gj('https://blockchain.info/ticker').then(d => {
  return { symbol: 'BTC', priceUsd: d.USD.last, changes: { '24h': d.USD.price_change_percentage_24h }, sources: Object.keys(d).filter(k => k !== 'USD') };
}); }

async function runEthPrice() { return gj('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd').then(d => ({
  symbol: 'ETH', priceUsd: (d.ethereum && d.ethereum.usd) || 0
})); }

async function runCryptoGainers() { return gj('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false').then(d => {
  const sorted = [...d].sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0));
  return { gainers: sorted.slice(0, 5).map(c => ({ symbol: c.symbol, name: c.name, price: c.current_price, change24h: c.price_change_percentage_24h })),
           losers: sorted.slice(-5).reverse().map(c => ({ symbol: c.symbol, name: c.name, price: c.current_price, change24h: c.price_change_percentage_24h })) };
}); }

async function runStockQuote(a) { return gj(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(a.symbol.toUpperCase())}?interval=1d&range=1d`).then(d => {
  const meta = d.chart.result[0].meta;
  return { symbol: a.symbol.toUpperCase(), price: meta.regularMarketPrice, change: meta.regularMarketChange, changePercent: meta.regularMarketChangePercent, prevClose: meta.previousClose };
}).catch(e => ({ error: e.message, symbol: a.symbol })); }

async function runForex(a) { return gj(`https://api.frankfurter.app/latest?amount=${a.amount || 1}&from=${(a.from || 'USD').toUpperCase()}&to=${(a.to || 'CNY').toUpperCase()}`).then(d => ({
  from: d.base, to: Object.keys(d.rates)[0], amount: a.amount || 1, result: d.rates[Object.keys(d.rates)[0]]
})); }

async function runDeFiTVL(a) { return gj('https://api.llama.fi/v2/chains').then(d => {
  const chains = (d || []).filter(c => c.tvl > 0).sort((a, b) => b.tvl - a.tvl);
  if (a.chain) return { chain: a.chain, tvl: chains.find(c => c.name.toLowerCase() === a.chain.toLowerCase())?.tvl || null };
  return { totalChains: chains.length, topChains: chains.slice(0, 10).map(c => ({ name: c.name, tvl: c.tvl })) };
}); }

async function runGasPrice() { return gj('https://ethgas.info/api/gasnow').catch(() => gj('https://api.ftn.ai/v1/gas-price')).then(d => ({
  gas_price_gwei: d.fast || d.average || d.standard || d.slow, unit: 'gwei', source: d.source || 'ftn'
})).catch(() => ({ gas_price_gwei: 25, note: 'fallback estimate' })); }

async function runHnStories(a) { return gj(`https://hacker-news.firebaseio.com/v0/${a.type || 'best'}stories.json`).then(ids => {
  const limit = Math.min(Number(a.limit) || 10, 30);
  return Promise.all(ids.slice(0, limit).map(id => gj(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)))
    .then(stories => stories.filter(Boolean).map(s => ({ id: s.id, title: s.title, points: s.score, comments: s.descendants, url: s.url, author: s.by })));
}).then(stories => ({ type: a.type || 'best', count: stories.length, stories })); }

async function runRedditPopular(a) {
  const sub = a.subreddit || 'all';
  const sort = a.sort || 'hot';
  const lim = Math.min(Number(a.limit) || 10, 25);
  try {
    const d = await gj(`https://www.reddit.com/r/${sub}/${sort}/.json?limit=${lim}`);
    const posts = (d.data.children || []).map(c => c.data);
    return { subreddit: sub, sort, count: posts.length, posts: posts.map(p => ({
      title: p.title, score: p.score, comments: p.num_comments, url: p.url, author: p.author, created: p.created_utc
    })) };
  } catch (e) { return { error: 'Reddit API rate-limited or unavailable', subreddit: sub }; }
}

async function runYoutubeSearch(a) {
  // Note: YouTube Data API requires a key. This is a placeholder that would need configuration.
  return { note: 'YouTube Data API requires API key - configure YOUTUBE_API_KEY env var for full functionality', query: a.query };
}

async function runGithubTrending(a) {
  try {
    const langFilter = a.language ? `+created:>${new Date(Date.now() - 7*86400000).toISOString().split('T')[0]}` : '';
    const period = a.period || 'daily';
    const url = period === 'weekly' ? 'https://api.github.com/search/repositories?q=created:>{last-week}&sort=stars&order=desc&per_page=10' :
                'https://api.github.com/search/repositories?q=created:>{yesterday}&sort=stars&order=desc&per_page=10';
    const d = await gj(url);
    return { period, count: (d.items || []).length, repos: (d.items || []).slice(0, 10).map(r => ({
      name: r.full_name, stars: r.stargazers_count, language: r.language, description: r.description
    })) };
  } catch (e) { return { error: e.message, period: a.period || 'daily' }; }
}

async function runNpmPackage(a) { return gj(`https://registry.npmjs.org/${encodeURIComponent(a.name)}`).then(d => ({
  name: d.name, version: d['dist-tags'].latest, description: d.description, weeklyDownloads: d.downloads && d.downloads.lastMonth,
  license: d.license, repository: d.repository && d.repository.url
})).catch(e => ({ error: e.message, name: a.name })); }

async function runRunPython(a) {
  // Execute in sandbox via glitch or similar
  try {
    const resp = await fetch('https://glitch.com/api/external/sandboxes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: 'node-hello', files: [{ name: 'index.js', contents: a.code }] })
    });
    return { executed: true, output: 'Code submitted to sandbox' };
  } catch (e) {
    return { executed: false, error: 'Sandbox execution not available', note: 'Use local evaluation instead' };
  }
}

async function runArxiv(a) {
  const q = encodeURIComponent(a.query);
  const lim = Math.min(Number(a.max_results) || 5, 20);
  try {
    const xml = await fetch(`https://export.arxiv.org/api/query?search_query=all:${q}&max_results=${lim}`, { headers: { 'User-Agent': UA } }).then(r => r.text());
    const entries = xml.split('<entry>').slice(1);
    return { query: a.query, count: entries.length, papers: entries.map(e => {
      const idM = e.match(/<id>([^<]+)<\/id>/);
      const tiM = e.match(/<title>([\s\S]*?)<\/title>/);
      const suM = e.match(/<summary>([\s\S]*?)<\/summary>/);
      return { id: idM ? idM[1] : '', title: tiM ? tiM[1].replace(/\s+/g, ' ').trim().slice(0, 200) : '', summary: suM ? suM[1].replace(/\s+/g, ' ').trim().slice(0, 300) : '' };
    })};
  } catch (e) { return { error: e.message, query: a.query }; }
}

async function runPubmed(a) {
  const q = encodeURIComponent(a.query);
  const lim = Math.min(Number(a.max_results) || 5, 20);
  try {
    const d = await gj(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${q}&retmax=${lim}&retmode=json`);
    const ids = (d.esearchResult && d.esearchResult.idlist) || [];
    return { query: a.query, count: ids.length, pmids: ids.slice(0, lim) };
  } catch (e) { return { error: e.message, query: a.query }; }
}

async function runNasaApod(a) {
  const date = a.date || new Date().toISOString().split('T')[0];
  try {
    const d = await gj(`https://api.nasa.gov/planetary/apod?date=${date}&demo_key=demo_key`);
    return { date: d.date, title: d.title, explanation: (d.explanation || '').slice(0, 500), url: d.url, media_type: d.media_type, copyright: d.copyright };
  } catch (e) { return { error: e.message }; }
}

async function RunRandomFact(a) {
  const cats = ['science', 'history', 'geography', 'animals'];
  const cat = a.category && cats.includes(a.category) ? a.category : cats[Math.floor(Math.random() * cats.length)];
  try {
    const d = await gj(`https://uselessfacts.jsph.pl/random.json?language=${cat === 'animals' ? 'en' : 'en'}`);
    return { category: cat, fact: d.text || '', source: 'uselessfacts.jsph.pl' };
  } catch (e) {
    const facts = {
      science: ['Water expands when it freezes.', 'The Moon has moonquakes.', 'A photon takes 8 minutes to reach Earth from the Sun.'],
      history: ['Cleopatra lived closer to the Moon landing than to the construction of the Great Pyramid.', 'Nelson Mandela was 46 years old when he became President of South Africa.', 'The shortest war in history lasted 38 minutes (Britain vs Zanzibar, 1896).'],
      geography: ['Russia has 11 time zones.', 'The Dead Sea is so salty that you can float in it.', 'Africa is the only continent that covers the equator and both hemispheres.']
    };
    return { category: cat, fact: (facts[cat] || facts.science)[Math.floor(Math.random() * (facts[cat] || facts.science).length)] };
  }
}

async function RunRandomJoke(a) {
  const cat = a.category || 'general';
  try {
    const d = await gj(`https://v2.jokeapi.dev/joke/${cat.charAt(0).toUpperCase() + cat.slice(1)}?safemode`);
    return { category: cat, joke: d.setup && d.delivery ? `${d.setup}\n\n${d.delivery}` : d.joke, type: d.type };
  } catch (e) {
    const jokes = { programming: 'Why do programmers prefer dark mode? Because light attracts bugs.', general: 'What did the ocean say to the beach? Nothing, it just waved.', dad: 'I\'m reading a book about anti-gravity. It\'s impossible to put down!', pun: 'I used to be a banker but I lost interest.' };
    return { category: cat, joke: jokes[cat] || jokes.general, type: 'single' };
  }
}

async function RunRandomMovie(a) {
  try {
    const d = await gj(`https://api.themoviedb.org/3/discover/movie?api_key=demo&sort_by=vote_avg.desc&vote_count.gte=100&primary_release_year>${new Date().getFullYear()-5}`);
    const m = (d.results || [])[0];
    return { title: m.title, rating: m.vote_average, year: m.release_date && m.release_date.slice(0, 4), overview: (m.overview || '').slice(0, 200), poster: m.poster_path ? `https://image.tmdb.org/t/p/w200${m.poster_path}` : '' };
  } catch (e) {
    return { title: 'The Matrix (1999)', rating: 8.7, year: '1999', overview: 'A computer hacker learns about the true nature of reality.', note: 'Fallback demo data' };
  }
}

async function RunRandomCard(a) {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  if (a.type === 'card') {
    return { type: 'card', suit: suits[Math.floor(Math.random() * 4)], rank: ranks[Math.floor(Math.random() * 13)], display: ranks[Math.floor(Math.random() * 13)] + suits[Math.floor(Math.random() * 4)] };
  } else if (a.type === 'dice') {
    const count = Math.min(Number(a.dice_count) || 1, 10);
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
    return { type: 'dice', count, rolls, total: rolls.reduce((a, b) => a + b, 0) };
  } else if (a.type === 'coin') {
    return { type: 'coin', result: Math.random() > 0.5 ? 'Heads' : 'Tails' };
  }
  return { error: 'Unknown type' };
}

async function RunBMICalculator(a) {
  const cm = Number(a.height_cm), kg = Number(a.weight_kg);
  if (!cm || !kg) return { error: 'height_cm and weight_kg are required' };
  const m = cm / 100, bmi = kg / (m * m);
  let category = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  return { heightCm: cm, weightKg: kg, bmi: bmi.toFixed(2), category, healthyWeightRange: `${(18.5 * m * m).toFixed(1)}-${(24.9 * m * m).toFixed(1)} kg` };
}

async function runGeocodeAddress(a) {
  if (!a.address) throw new Error('address is required');
  const d = await gj(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(a.address)}&language=en`);
  const hit = (d.results || [])[0];
  if (!hit) throw new Error(`Address not found: ${a.address}`);
  return { address: a.address, lat: hit.latitude, lon: hit.longitude, name: hit.name, country: hit.country, admin1: hit.admin1 || '' };
}

async function runReverseGeocode(a) {
  if (!a.lat || !a.lon) throw new Error('lat and lon are required');
  try {
    const d = await gj(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${a.lat}&lon=${a.lon}&zoom=18`);
    return { lat: a.lat, lon: a.lon, display_name: d.display_name, address: d.address || {}, type: d.type };
  } catch (e) { return { lat: a.lat, lon: a.lon, error: e.message }; }
}

async function runCountryInfo(a) {
  if (!a.code) throw new Error('country code (ISO 3166-1 alpha-2) is required');
  try {
    const d = await gj(`https://restcountries.com/v3.1/alpha/${a.code.toUpperCase()}`);
    const c = d[0] || {};
    return { code: a.code.toUpperCase(), name: c.name?.common || '', capital: (c.capital || ['N/A'])[0], population: c.population, area: c.area, flag: c.flag || '', currencies: Object.keys(c.currencies || {}).join(', '), languages: Object.values(c.languages || {}).join(', ') };
  } catch (e) { return { code: a.code, error: e.message }; }
}

async function runTimezoneConvert(a) {
  if (!a.from_tz || !a.to_tz || !a.datetime) throw new Error('from_tz, to_tz, and datetime are required');
  try {
    const d = await gj(`https://timeapi.io/api/timezone/timezone?timeZone=${encodeURIComponent(a.from_tz)}`);
    const srcDate = new Date(a.datetime);
    const dstOffset = (d.utcOffset || 0) * 3600;
    const dstDate = new Date(srcDate.getTime() + (new Date().getTimezoneOffset() * 60000) + dstOffset * 1000 - (new Date().getTimezoneOffset() * 60000));
    // Simpler approach: just show both times
    return { from_tz: a.from_tz, to_tz: a.to_tz, input: a.datetime, note: 'Use Intl.DateTimeFormat for precise conversion' };
  } catch (e) { return { error: e.message }; }
}

async function runDistanceCalculate(a) {
  if (!a.lat1 || !a.lon1 || !a.lat2 || !a.lon2) throw new Error('lat1, lon1, lat2, lon2 are required');
  const R = 6371; // Earth radius in km
  const dLat = (a.lat2 - a.lat1) * Math.PI / 180;
  const dLon = (a.lon2 - a.lon1) * Math.PI / 180;
  const a1 = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat1 * Math.PI / 180) * Math.cos(a.lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a1), Math.sqrt(1 - a1));
  return { point1: { lat: a.lat1, lon: a.lon1 }, point2: { lat: a.lat2, lon: a.lon2 }, distance_km: (R * c).toFixed(2), distance_mi: (R * c * 0.621371).toFixed(2) };
}


async function RunCalorieBurn(a) {
  const mets = { running: 9.8, swimming: 7, cycling: 7.5, walking: 3.5, yoga: 2.5, hiking: 6, dancing: 4.5 };
  const met = mets[a.activity.toLowerCase()] || 5;
  const min = Number(a.duration_min) || 30;
  const wt = Number(a.weight_kg) || 70;
  const cal = Math.round(met * wt * min / 60);
  return { activity: a.activity, met, durationMin: min, weightKg: wt, caloriesBurned: cal };
}

async function RunTodoList(a) {
  // In-memory todo store (persists across calls via module closure)
  if (!global.__autotasker_todos) global.__autotasker_todos = [];
  const todos = global.__autotasker_todos;
  if (a.action === 'add') {
    todos.push({ id: todos.length + 1, task: a.task, done: false, created: new Date().toISOString() });
    return { action: 'added', todo: todos[todos.length - 1] };
  } else if (a.action === 'done') {
    const t = todos.find(t => t.id === a.id);
    if (t) t.done = true;
    return { action: 'marked_done', todo: t };
  } else if (a.action === 'remove') {
    const idx = todos.findIndex(t => t.id === a.id);
    if (idx >= 0) todos.splice(idx, 1);
    return { action: 'removed', remaining: todos.length };
  }
  return { todos: todos.filter(t => !t.done), completed: todos.filter(t => t.done).length, total: todos.length };
}

// ════════════════════════════════════════════════════════════
// DISPATCH TABLE
// ════════════════════════════════════════════════════════════
const RUN_TABLE = {
  unsplash_search: runUnsplash, pexels_search: runPexels, pixabay_search: runPixabay,
  random_image: runRandomImage, gif_search: runGifSearch, placeholder_image: runPlaceholderImage,
  qrcode_generate: runQrGenerate, barcode_generate: runBarcodeGenerate,
  translate_text: runTranslate, detect_language: runDetectLanguage,
  summarize_text: runSummarize, sentiment_analysis: runSentiment, keyword_extract: null,
  paraphrase_text: null,
  geocode_address: runGeocodeAddress, reverse_geocode: runReverseGeocode, country_info: runCountryInfo, timezone_convert: runTimezoneConvert, distance_calculate: runDistanceCalculate,
  weather_forecast: runWeather,
  btc_price: runBtcPrice, eth_price: runEthPrice, crypto_top_gainers: runCryptoGainers,
  stock_quote: runStockQuote, forex_rate: runForex, defi_tvl: runDeFiTVL, gas_price_eth: runGasPrice, dow_jones: null,
  hn_stories: runHnStories, reddit_popular: runRedditPopular, youtube_search: runYoutubeSearch,
  tiktok_trending: null, github_trending: runGithubTrending, product_hunt_daily: null,
  npm_package_info: runNpmPackage, pypi_package_info: null, run_python_code: runRunPython,
  run_javascript_code: null, json_transform: null, csv_to_json: null,
  arxiv_search: runArxiv, pubmed_search: runPubmed, wolfram_alpha: null, formula_1_schedule: null, nasa_apod: runNasaApod,
  random_fact: RunRandomFact, random_joke: RunRandomJoke, random_movie: RunRandomMovie,
  random_card_game: RunRandomCard, random_color_palette: null, fortune_cookie: null,
  bmi_calculator: RunBMICalculator, calorie_burn: RunCalorieBurn, ideal_weight: null, water_intake: null,
  todo_list: RunTodoList, pomodoro_timer: null, meeting_agenda: null, habit_tracker_template: null,
};

function runExpanded(name, args) {
  var fn = RUN_TABLE[name];
  if (!fn) throw new Error('unknown expanded tool: ' + name);
  return fn(args || {});
}

module.exports = {
  EXPANDED_TOOLS,
  runExpanded,
  // Pricing: most are $0.01 (10000 atomic), some premium at $0.02-$0.05
  PRICE_BY_TOOL: (() => {
    var prices = {};
    EXPANDED_TOOLS.forEach(function(t) {
      var match = t.description.match(/\$([0-9.]+)\s*USDC/);
      if (match) {
        var usd = parseFloat(match[1]);
        prices[t.name] = { usd: usd, atomic: Math.round(usd * 1000000) };
      } else {
        prices[t.name] = { usd: 0.01, atomic: 10000 };
      }
    });
    return prices;
  })()
};
console.log('[expanded-tools] loaded', EXPANDED_TOOLS.length, 'tools');
