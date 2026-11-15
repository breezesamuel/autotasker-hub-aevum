/**
 * content-factory.js — 多语言内容工厂
 *
 * 为每个热门话题自动生成：
 *   1. SEO landing page（CN/EN/JP/KR四语）
 *   2. Social media copy（微博/Twitter/Reddit/LinkedIn）
 *   3. Blog post draft（Markdown格式）
 *
 * 产出文件存入 data/content/:board/:slug/ 目录，由 cron 定期批量生成。
 *
 * 端点：
 *   POST /api/content/generate — 触发单个话题的内容生成
 *   GET  /api/content/batch    — 批量生成今日所有热点内容
 *   GET  /api/content/stats    — 已生成内容统计
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'data', 'content');
const STATS_FILE = path.join(ROOT, 'data', 'content-stats.json');

const LANGUAGES = ['zh', 'en', 'ja', 'ko'];
const PLATFORMS = ['weibo', 'twitter', 'reddit', 'linkedin'];

// ---- Template Engine ----

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function generateSocialCopy(title, url, platform, lang) {
  const templates = {
    zh: {
      weibo: `【#热搜#】${title}\n💡 数据来源：AutoTasker Hub 实时社媒监测\n📊 ${url}`,
      twitter: `🔥 ${title}\nReal-time Chinese social media trends from AutoTasker Hub.\n${url}`,
      reddit: `Title: [Trending] ${title}\nBody: Check out this trending topic on Chinese social media. Source: ${url}`,
      linkedin: `Interesting trend emerging in Chinese social media: "${title}". Real-time API access available via AutoTasker Hub.\n${url}`,
    },
    en: {
      weibo: `[Trending] ${title} — live Chinese social data\nSource: https://autotasker.highkingflower.com`,
      twitter: `🇨🇳 ${title}\nReal-time trending from China's social graph. API by AutoTasker Hub.\n${url}`,
      reddit: `Title: Trending in China right now: ${title}\nBody: See real-time Chinese social media trends powered by x402 payments. ${url}`,
      linkedin: `What's trending in China's social media ecosystem right now: "${title}". Track it live.\n${url}`,
    },
    ja: {
      weibo: `【トレンド】${title}\n中国のソーシャルメディア実時データ\nソース: ${url}`,
      twitter: `🇨🇳 ${title}\nReal-time Chinese social trends.\n${url}`,
      reddit: `Title: China social trends: ${title}\nBody: Live trending data from China. ${url}`,
      linkedin: `中国のソーシャルメディアトレンド: 「${title}」。リアルタイムAPIアクセス可能。\n${url}`,
    },
    ko: {
      weibo: `【트렌드】${title}\n중국 소셜미디어 실시간 데이터\n소스: ${url}`,
      twitter: `🇨🇳 ${title}\nReal-time Chinese social trends.\n${url}`,
      reddit: `Title: China trending: ${title}\nBody: Live Chinese social data. ${url}`,
      linkedin: `중국 소셜 미디어 트렌드: 「${title}」。실시간 API 제공.\n${url}`,
    },
  };
  return (templates[lang] || templates.zh)[platform] || templates.zh.weibo;
}

function generateBlogPost(title, description, board, lang) {
  const dateStr = new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja-JP' : lang === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  return `---
title: "${title}"
date: ${new Date().toISOString()}
board: ${board}
language: ${lang}
tags: [trending, china-social, ${board}]
---

# ${title}

${description || '分析当前中文社交媒体热点事件，追踪热度走势与用户情绪。'}

## 数据来源
本内容由 **AutoTasker Hub** 自动采集，通过 x402 协议以 USDC 在 Base 链上按次结算。

## 相关洞察
- 该话题来自 ${board} 板块
- 建议在 ${lang === 'zh' ? '微博/知乎' : lang === 'ja' ? 'X/Twitter Japan' : lang === 'ko' ? 'Twitter Korea' : 'English platforms'} 同步推广
- 实时监控接口: \`GET /api/x402/${board === 'weiboHot' ? 'hotlist' : 'search'}?board=${board}\`
`;
}

function generateLandingPage(title, board, lang) {
  const slug = slugify(title);
  // Public HTML for /topic/:slug (served by x402-v4.js route)
  const htmlPublic = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<title>${lang === 'zh' ? '实时热点' : lang === 'ja' ? 'トレンド' : lang === 'ko' ? '트렌드' : 'Trending'} — ${escHtml(title)}</title>
<meta name="description" content="${escHtml(truncate(title, 120))}">
<link rel="canonical" href="https://autotasker.highkingflower.com/topic/${slug}">
${LANGUAGES.map(l => `<link rel="alternate" hreflang="${l}" href="https://autotasker.highkingflower.com/${l === 'zh' ? '' : l + '/'}topic/${slug}">`).join('\n')}
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"NewsArticle","headline":"${escJs(title)}","datePublished":"${new Date().toISOString()}","publisher":{"@type":"Organization","name":"AutoTasker Hub"}}
</script>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;background:#0a0a0f;color:#e0e0e0;}h1{color:#fff;font-size:1.5rem;}a{color:#818cf8;text-decoration:none;}a:hover{text-decoration:underline;}.badge{display:inline-block;padding:2px 8px;border-radius:4px;background:#1e1e2e;color:#64748b;font-size:.8rem;margin-right:6px;}.cta{display:inline-block;margin-top:1rem;padding:0.5rem 1rem;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:6px;font-size:.9rem;}</style>
</head>
<body>
<h1>${escHtml(title)}</h1>
<p><span class="badge">${board}</span> <span class="badge">${lang.toUpperCase()}</span></p>
<p style="color:#888;margin-top:.5rem">Real-time trending topic from Chinese social media · Powered by AutoTasker Hub</p>
<a class="cta" href="/">← Back to Trends</a> · <a href="/offer.html">Pricing</a>
<hr style="border-color:#1e1e2e;margin:1.5rem 0">
<p style="color:#64748b;font-size:.85rem">API: <code>GET /api/x402/hotlist?board=${board === 'weiboHot' ? 'weiboHot' : 'search'}&limit=10</code> (x402 USDC)</p>
</body>
</html>`;
  return { slug, htmlPublic };
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escJs(s)   { return String(s||'').replace(/'/g,"\\'").replace(/\n/g,'\\n'); }

// ---- Public API ----

function generateForTopic(topic, board, lang) {
  const slug = slugify(topic.title || topic.headline || 'untitled');
  const dir = path.join(CONTENT_DIR, board, slug);
  const publicDir = path.join(ROOT, 'public', 'topic');

  // Generate all outputs
  const landing = generateLandingPage(topic.title || topic.headline, board, lang);
  const outputs = {
    blog_md: generateBlogPost(topic.title || topic.headline, topic.description, board, lang),
    landing_html: landing.htmlPublic,
    social_copies: {},
  };
  for (const pl of PLATFORMS) {
    outputs.social_copies[pl] = generateSocialCopy(topic.title || topic.headline, `https://autotasker.highkingflower.com/topic/${slug}`, pl, lang);
  }

  // Write files — data/ for archive + public/topic/ for production serving
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `blog.${lang}.md`), outputs.blog_md, 'utf8');
    fs.writeFileSync(path.join(dir, `index.html`), outputs.landing_html, 'utf8');
    fs.writeFileSync(path.join(dir, `social.${lang}.txt`), JSON.stringify(outputs.social_copies, null, 2), 'utf8');
    // Also deploy to public/topic/ so /topic/:slug route serves it immediately
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, slug + '.html'), outputs.landing_html, 'utf8');
  } catch (e) {
    return { error: e.message, dir, slug };
  }

  return { ok: true, slug, lang, board, dir, publicPath: path.join(publicDir, slug + '.html') };
}

function generateBatch(board, items, languages) {
  languages = languages || LANGUAGES;
  const results = { generated: 0, skipped: 0, errors: [] };
  for (const topic of (items || [])) {
    for (const lang of languages) {
      try {
        const r = generateForTopic(topic, board, lang);
        if (r.ok) results.generated++;
        else results.errors.push(r.error);
      } catch (e) {
        results.errors.push(e.message);
      }
    }
  }
  // Update stats
  updateStats(results);
  return results;
}

function updateStats(batch) {
  try {
    let s;
    try { s = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); }
    catch (e) { s = { version: 1, totals: { generated: 0, batches: 0 }, byLang: {}, byBoard: {} }; }
    s.totals.generated += batch.generated || 0;
    s.totals.batches += 1;
    if (!s.byLang['zh']) s.byLang['zh'] = 0;
    s.byLang['zh'] += (batch.generated || 0) / 4; // approx per-lang
    fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(s, null, 2));
  } catch (e) {}
}

function getStats() {
  try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); }
  catch (e) { return { version: 1, totals: { generated: 0, batches: 0 }, message: 'no content generated yet' }; }
}

module.exports = {
  LANGUAGES, PLATFORMS, slugify, generateForTopic, generateBatch, getStats,
  generateSocialCopy, generateBlogPost, generateLandingPage,
};
