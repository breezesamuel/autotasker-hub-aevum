/**
 * probe-apis.js — Mass reachability probe for candidate free APIs (from this machine).
 * Usage: node scripts/probe-apis.js
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const probes = [
  { name: 'air-quality(空气质量)', url: 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=39.9&longitude=116.4&current=pm2_5,pm10', pick: d => `PM2.5=${d?.current?.pm2_5}` },
  { name: 'historical-weather(历史天气)', url: 'https://archive-api.open-meteo.com/v1/archive?latitude=39.9&longitude=116.4&start_date=2026-11-01&end_date=2026-11-10&daily=temperature_2m_max', pick: d => `days=${(d?.daily?.time || []).length}` },
  { name: 'marine(海洋天气)', url: 'https://marine-api.open-meteo.com/v1/marine?latitude=31.2&longitude=121.5&current=wave_height', pick: d => `wave=${d?.current?.wave_height}` },
  { name: 'worldbank(世界银行GDP)', url: 'https://api.worldbank.org/v2/country/CN/indicator/NY.GDP.MKTP.CD?format=json&date=2020:2023', pick: d => `${(d?.[1] || []).length}年, 2023=${((d?.[1] || []).find(x => x.date === '2023') || {}).value}` },
  { name: 'restcountries(国家信息)', url: 'https://restcountries.com/v3.1/all?fields=name,currencies,capital', pick: d => `${(d || []).length}国` },
  { name: 'nager-next(下个假期)', url: 'https://date.nager.at/api/v3/NextPublicHolidays/CN', pick: d => `下一个: ${d?.[0]?.date} ${d?.[0]?.name}` },
  { name: 'frankfurter-ts(汇率历史)', url: 'https://api.frankfurter.app/2026-01-01..2026-11-01?from=CNY&to=USD', pick: d => `${Object.keys(d?.rates || {}).length}天` },
  { name: 'rdap(域名档案)', url: 'https://rdap.org/domain/google.com', pick: d => d?.handle?.slice(0, 40) },
  { name: 'wayback(网页存档)', url: 'https://archive.org/wayback/available?url=github.com', pick: d => d?.archived_snapshots?.closest?.timestamp },
  { name: 'sspai(少数派)', url: 'https://sspai.com/api/v1/index?limit=2', pick: d => (d?.data || []).slice(0, 2).map(x => x.title).join(' | ') },
  { name: 'netease-hot(网易云热歌)', url: 'https://music.163.com/api/playlist/detail?id=3778678', pick: d => `${(d?.result?.tracks || []).length}首, 首曲: ${d?.result?.tracks?.[0]?.name}` },
  { name: 'hitokoto(一言)', url: 'https://v1.hitokoto.cn/', pick: d => d?.hitokoto },
  { name: 'thespacedevs(火箭发射)', url: 'https://ll.thespacedevs.com/2.2.0/launches/next/?limit=1', pick: d => d?.name },
  { name: 'stackexchange(SO问答)', url: 'https://api.stackexchange.com/2.3/questions?order=desc&sort=activity&site=stackoverflow&pagesize=2&filter=default', pick: d => `${(d?.items || []).length}条, quota余${d?.quota_remaining}` },
  { name: 'devto(开发者文章)', url: 'https://dev.to/api/articles?per_page=2', pick: d => (d || []).map(x => x.title).join(' | ').slice(0, 80) },
  { name: '36kr-newsflash(36氪快讯)', url: 'https://36kr.com/api/newsflash?per_page=3', pick: d => JSON.stringify(d).slice(0, 80) },
  { name: 'cma-weather(中国气象局)', url: 'https://weather.cma.cn/api/now/54511', pick: d => `${d?.data?.location?.city}: ${d?.data?.now?.temperature}°C` },
  { name: 'worldtime(世界时间)', url: 'https://worldtimeapi.org/api/timezone/Asia/Shanghai', pick: d => (d?.datetime || '').slice(0, 25) },
  { name: 'bilibili-popular(B站综合热门)', url: 'https://api.bilibili.com/x/web-interface/popular?ps=3', pick: d => (d?.data?.list || []).map(x => x.title).join(' | ').slice(0, 80) },
  { name: 'douban-movie(豆瓣电影周榜)', url: 'https://m.douban.com/rexxar/api/v2/movie/weekly', pick: d => (d?.subjects || []).map(x => x.title).join(' | ') },
  { name: 'baidu-hot-shape(百度结构)', url: 'https://top.baidu.com/api/board?platform=wise&tab=realtime', pick: d => `cards=${(d?.data?.cards || []).length}, keys=${Object.keys((d?.data?.cards || [])[0] || {})}` },
  { name: 'yahoo-jp(日本趋势站)', url: 'https://trends.yahoo.co.jp/', pick: t => (t.match(/<title>([^<]+)<\/title>/) || [])[1] },
  { name: 'naver(韩国)', url: 'https://www.naver.com', pick: t => (t.match(/<title>([^<]+)<\/title>/) || [])[1] },
  { name: 'zenquotes(名言)', url: 'https://zenquotes.io/api/random', pick: d => (d?.[0]?.q || '').slice(0, 60) },
  { name: 'wikipedia(维基百科)', url: 'https://zh.wikipedia.org/api/rest_v1/page/summary/Beijing', pick: d => d?.title },
  { name: 'openlibrary(图书)', url: 'https://openlibrary.org/search.json?q=machine+learning&limit=1', pick: d => (d?.docs || [])[0]?.title },
  { name: 'nominatim(地理编码)', url: 'https://nominatim.openstreetmap.org/search?q=Beijing&format=json&limit=1', pick: d => d?.[0]?.display_name },
  { name: 'phishstats(威胁情报)', url: 'https://phishstats.info:2096/api/phishing?_size=2', pick: d => `${(d || []).length}条` },
  { name: 'whales(鲸鱼?', url: 'https://api.whales.market', pick: d => JSON.stringify(d).slice(0, 60) },
];

(async () => {
  const results = [];
  for (const p of probes) {
    try {
      const r = await fetch(p.url, { headers: { 'user-agent': UA, accept: 'application/json,text/html,*/*' }, signal: AbortSignal.timeout(9000) });
      const txt = await r.text();
      let info;
      try { info = p.pick(JSON.parse(txt)) || 'json-ok'; } catch (e) { info = p.pick(txt) || txt.slice(0, 50); }
      const ok = r.status === 200 && !/blocked|error/i.test(String(info));
      console.log(`${ok ? '✅' : '❓'} ${p.name}: HTTP ${r.status} | ${String(info).slice(0, 100)}`);
      results.push({ name: p.name, url: p.url, status: r.status, ok });
    } catch (e) {
      console.log(`❌ ${p.name}: ${e.message.slice(0, 60)}`);
      results.push({ name: p.name, url: p.url, ok: false });
    }
  }
  const fs = require('fs');
  fs.writeFileSync(require('path').resolve(__dirname, '..', 'data', 'probe-results.json'), JSON.stringify(results, null, 2));
  console.log(`\nsummary: ${results.filter(r => r.ok).length}/${results.length} OK -> data/probe-results.json`);
})();
