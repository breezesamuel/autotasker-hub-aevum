/**
 * refresh-pack.js — Pull LIVE Chinese trending data into data/packs/live.json
 *
 * Sources (all domestic, reachable from a China-network machine):
 *   - Weibo hot search   (weibo.com/ajax/side/hotSearch, needs referer)
 *   - Bilibili hot rank  (api.bilibili.com/x/web-interface/ranking/v2)
 *   - Bilibili hot search(api.bilibili.com/x/web-interface/search/square)
 *   - Toutiao hot board  (toutiao.com/hot-event/hot-board)
 *   - Baidu hot board    (top.baidu.com/api/board)
 *   - Douyin hot search  (douyin.com/aweme/v1/web/hot/search/list)
 *
 * Output schema (stable, consumed by api/x402-v4.js):
 *   { fetchedAt, sources: {...counts}, items: [{ rank, title, source, board, engagement, url }] }
 *
 * Usage: node scripts/refresh-pack.js   (cron-friendly; safe to rerun)
 */

const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const OUT = path.resolve(__dirname, '..', 'data', 'packs', 'live.json');

const SOURCES = [
  {
    id: 'weiboHot',
    label: '微博热搜',
    url: 'https://weibo.com/ajax/side/hotSearch',
    headers: { referer: 'https://s.weibo.com/top/summary', 'x-requested-with': 'XMLHttpRequest' },
    parse: d => (d?.data?.realtime || []).map((x, i) => ({
      rank: x.rank ?? i + 1,
      title: x.word || x.note || '',
      engagement: x.num || x.raw_hot || 0,
      url: x.word_scheme ? `https://s.weibo.com/weibo?q=${encodeURIComponent(x.word_scheme)}` : `https://s.weibo.com/weibo?q=${encodeURIComponent(x.word || '')}`,
      meta: { label: x.label_name || null, isAd: !!x.is_ad },
    })).filter(x => x.title && !x.meta.isAd),
  },
  {
    id: 'bilibiliHot',
    label: 'B站热门',
    url: 'https://api.bilibili.com/x/web-interface/ranking/v2?rid=0',
    parse: d => (d?.data?.list || []).map((x, i) => ({
      rank: i + 1,
      title: x.title || '',
      engagement: (x.stat && (x.stat.view || x.stat.score)) || 0,
      url: x.short_link_v2 || x.bvid ? `https://www.bilibili.com/video/${x.bvid}` : '',
      meta: { up: x.owner?.name || null, tag: (x.tag && String(x.tag).slice(0, 40)) || null },
    })).filter(x => x.title),
  },
  {
    id: 'bilibiliSearch',
    label: 'B站搜索热词',
    url: 'https://api.bilibili.com/x/web-interface/search/square?limit=10',
    parse: d => (d?.data?.trending?.list || []).map((x, i) => ({
      rank: x.position ?? i + 1,
      title: x.keyword || '',
      engagement: x.hot_resource?.heat || 0,
      url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(x.keyword || '')}`,
      meta: { show_name: x.show_name || null },
    })).filter(x => x.title),
  },
  {
    id: 'toutiaoHot',
    label: '头条热榜',
    url: 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc',
    parse: d => (d?.data || []).map((x, i) => ({
      rank: x.Rank ?? i + 1,
      title: x.Title || '',
      engagement: x.HotValue || 0,
      url: x.Url || '',
      meta: { tag: x.Tag || null, clusterId: x.ClusterIdStr || null },
    })).filter(x => x.title),
  },
  {
    id: 'baiduHot',
    label: '百度热搜',
    url: 'https://top.baidu.com/api/board?platform=wise&tab=realtime',
    parse: d => {
      const cards = (d?.data?.cards) || [];
      const content = [];
      for (const c of cards) for (const x of (c.content || [])) content.push(x);
      return content.map((x, i) => ({
        rank: x.rank ?? i + 1,
        title: (x.word || x.query || '').replace(/<[^>]+>/g, ''),
        engagement: x.hotScore || 0,
        url: x.rawUrl || x.url || '',
        meta: { desc: (x.desc || '').slice(0, 120), tag: x.tag || null },
      })).filter(x => x.title);
    },
  },
  {
    id: 'douyinHot',
    label: '抖音热点',
    url: 'https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383',
    parse: d => (d?.data?.word_list || []).map((x, i) => ({
      rank: x.position ?? i + 1,
      title: x.word || '',
      engagement: x.hot_value || 0,
      url: '',
      meta: { event_time: x.event_time || null },
    })).filter(x => x.title),
  },
];

async function fetchOne(src) {
  try {
    const r = await fetch(src.url, { headers: { 'user-agent': UA, accept: 'application/json', ...src.headers }, signal: undefined });
    if (!r.ok) return { id: src.id, ok: false, status: r.status, items: [] };
    const txt = await r.text();
    let d;
    try { d = JSON.parse(txt); } catch (e) { return { id: src.id, ok: false, status: r.status, error: 'non-json', items: [] }; }
    const items = src.parse(d) || [];
    return { id: src.id, ok: items.length > 0, status: r.status, items };
  } catch (e) {
    return { id: src.id, ok: false, error: String(e.message).slice(0, 100), items: [] };
  }
}

(async () => {
  const results = await Promise.all(SOURCES.map(fetchOne));
  const allItems = [];
  const counts = {};
  for (const res of results) {
    counts[res.id] = res.items.length;
    for (const it of res.items) allItems.push({ ...it, source: res.id, sourceLabel: SOURCES.find(s => s.id === res.id).label });
  }
  const pack = {
    fetchedAt: new Date().toISOString(),
    generator: 'scripts/refresh-pack.js',
    totalItems: allItems.length,
    sources: counts,
    items: allItems,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(pack, null, 2), 'utf8');
  const summary = results.map(r => `${r.id}:${r.ok ? 'OK ' + r.items.length : 'FAIL ' + (r.error || r.status)}`).join('  ');
  console.log(`refresh-pack: ${allItems.length} items -> ${OUT}`);
  console.log(summary);
  if (allItems.length === 0) process.exit(1);
})();
