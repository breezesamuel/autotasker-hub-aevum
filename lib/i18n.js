/**
 * i18n.js — 多语言本地化引擎
 *
 * 支持 CN(默认)/EN/JP/KR 四种语言，通过 URL 前缀选择：
 *   /en/offer.html → English version
 *   /ja/trending   → Japanese trending
 *
 * 设计原则：
 *   - 翻译文本集中在 translation.json，新增语言只需加文件
 *   - hreflang 标签自动生成，告诉搜索引擎有哪个语言的版本
 *   - 零态诚实：翻译缺失时回退到中文原文（不会显示乱码）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TRANSLATIONS_FILE = path.join(ROOT, 'config', 'translations.json');
const DEFAULT_LANG = 'cn';
const SUPPORTED_LANGS = ['cn', 'en', 'ja', 'kr'];

// Default fallback translations (Chinese)
const FALLBACK = {
  siteName: 'AutoTasker Hub',
  siteDesc: '实时中文社媒热搜数据 API · x402 USDC 链上结算',
  nav: { trending: '热搜', boards: '板块', trust: '信任中心', faq: '常见问题', pricing: '价格', agent: 'Agent接入', live: '交易直播', leaderboard: '排行榜', blog: '博客' },
  hero: { title: '中文社媒热搜数据 API', subtitle: '微博/知乎/豆瓣/B站/贴吧实时聚合，x402 USDC 链上结算', cta: '查看价格', sample: '免费试用' },
  features: { realtime: '实时', x402: 'x402支付', mcp: 'MCP支持', refund: '7天退款', support: '自动客服' },
  pricing: { hotlist: '热搜榜单', search: '关键词搜索', full: '全量导出', util: '工具调用', perCall: '按次计费', monthly: '包月套餐' },
};

function loadTranslations() {
  try { return JSON.parse(fs.readFileSync(TRANSLATIONS_FILE, 'utf8')); }
  catch (e) { return {}; }
}

// Get text for a key, falling back to Chinese then English
function t(lang, key) {
  const translations = loadTranslations();
  // Navigate nested key like "nav.trending"
  const parts = key.split('.');
  let val = translations[lang] || {};
  for (const p of parts) {
    if (val && val[p] !== undefined) val = val[p];
    else { val = null; break; }
  }
  if (val && typeof val === 'string' && val.trim()) return val;
  // Fallback chain: lang → en → cn → key
  for (const fallback of ['en', 'cn']) {
    let v = translations[fallback] || {};
    for (const p of parts) {
      if (v && v[p] !== undefined) v = v[p];
      else { v = null; break; }
    }
    if (v && typeof v === 'string' && v.trim()) return v;
  }
  return key; // Last resort: return the key itself
}

function detectLang(req) {
  // Check URL prefix first: /en/... or /ja/...
  const urlPath = req.originalUrl || req.url || '';
  for (const lang of SUPPORTED_LANGS) {
    if (urlPath.startsWith('/' + lang + '/')) return lang;
  }
  // Check Accept-Language header
  const acceptLang = (req.headers['accept-language'] || '').toLowerCase();
  if (acceptLang.includes('ja')) return 'ja';
  if (acceptLang.includes('ko')) return 'kr';
  if (acceptLang.includes('en')) return 'en';
  return DEFAULT_LANG;
}

function stripLangPrefix(url, lang) {
  if (lang === DEFAULT_LANG) return url;
  const prefix = '/' + lang + '/';
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  return url;
}

function addLangPrefix(url, lang) {
  if (lang === DEFAULT_LANG) return url;
  const prefix = '/' + lang + '/';
  return prefix + url.replace(/^\//, '');
}

function generateHreflangLinks(currentLang, baseUrl) {
  const links = SUPPORTED_LANGS.map((lang) => {
    const href = baseUrl + (lang === DEFAULT_LANG ? '' : '/' + lang);
    return `<link rel="alternate" hreflang="${lang}" href="${href}">`;
  }).join('\n  ');
  // Also add x-default for language-agnostic access
  return links + `\n  <link rel="alternate" hreflang="x-default" href="${baseUrl}">`;
}

function generateMetaTags(lang, customTitle, customDesc) {
  const title = customTitle || t(lang, 'siteName');
  const desc = customDesc || t(lang, 'siteDesc');
  return `
<meta name="description" content="${desc}">
<meta property="og:locale" content="${lang === 'cn' ? 'zh_CN' : lang === 'en' ? 'en_US' : lang === 'ja' ? 'ja_JP' : 'ko_KR'}">
<meta property="og:site_name" content="${t(lang, 'siteName')}">`;
}

module.exports = { t, detectLang, stripLangPrefix, addLangPrefix, generateHreflangLinks, generateMetaTags, SUPPORTED_LANGS, DEFAULT_LANG };
