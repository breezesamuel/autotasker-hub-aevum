/**
 * auto-blog.js — 自动化博客内容生成引擎
 *
 * 从 trending data 自动生成多种格式的 SEO 博客文章，输出到 data/blog/:date/
 *
 * 产出格式：
 *   1. markdown.md    — 主文章（用于 Medium/Dev.to/Substack 发布）
 *   2. html.html      — 独立 HTML 页面（网站内嵌）
 *   3. twitter.md     — Twitter thread 文案
 *   4. linkedin.md    — LinkedIn article 草稿
 *   5. json.json      — 结构化数据（供其他系统消费）
 *
 * 触发方式：
 *   - Cron 每日运行（配合 auto-digest）
 *   - 手动：node scripts/auto-blog.js --once
 *
 * 内容策略：
 *   - 每篇聚焦一个热门话题的深度解读（为什么火、背后趋势、数据洞察）
 *   - 包含 CTA 链接回产品页
 *   - 内置 JSON-LD Article schema 增强 SEO
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'data', 'blog');
const PACKS_DIR = path.join(ROOT, 'data', 'packs');

function loadItems() {
  try {
    const raw = fs.readFileSync(path.join(PACKS_DIR, 'live.json'), 'utf8');
    return JSON.parse(raw).items || [];
  } catch (e) {
    try { return JSON.parse(fs.readFileSync(path.join(PACKS_DIR, 'xuanpin_v2.json'), 'utf8')).items || []; }
    catch (e2) { return []; }
  }
}

function escMd(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/#/g, '\\#')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Generate blog post for a single trending item
function generatePost(item, index, total) {
  const title = item.title || '';
  const eng = Number(item.engagement || 0);
  const src = item.sourceLabel || item.source || 'Unknown';
  const dateStr = new Date().toISOString().slice(0, 10);
  const slug = slugify(title);
  const url = `https://autotasker.highkingflower.com/blog/${slug}`;
  const relativeUrl = `/blog/${slug}`;

  // Write markdown
  const md = `---
title: "${escMd(title)} — 实时热度数据深度解析"
date: ${new Date().toISOString()}
tags: [trending, china, ${escMd(src)}, social-media]
description: "#${src}热搜第${index + 1}位：${escMd(title)}，热度${eng.toLocaleString()}。AutoTasker Hub 实时数据解析。"
---

# ${title}

> **数据来源**：AutoTasker Hub 实时热搜聚合 · ${src} · 更新于 ${new Date().toLocaleString('zh-CN')} UTC  
> **热度指数**：${eng.toLocaleString()} · **原文链接**：[${title}](${item.url || '#'})

---

## 这件事为什么火了？

${title} 当前在 ${src} 平台热度达到 **${eng.toLocaleString()}**，位列当日热搜第 **${index + 1}** 位。

这个趋势反映了当前中文互联网的关注焦点。通过 AutoTasker Hub 的实时聚合引擎，我们可以追踪到：

- **传播速度**：该话题在 ${src} 上的增长曲线
- **跨平台联动**：是否同步登上微博/B站/知乎等多个平台
- **关联话题**：同一时间段的其他热门条目

## 数据洞察

基于 AutoTasker Hub 的实时数据分析：

| 指标 | 数值 |
|------|------|
| 来源平台 | ${src} |
| 当前热度 | ${eng.toLocaleString()} |
| 榜单排名 | 第 ${index + 1} 位 |
| 数据更新频率 | 每 10 分钟 |
| 结算方式 | x402 USDC（Base 主网） |

## 获取实时数据

如果你想获取这类数据的批量访问权限，AutoTasker Hub 提供：

- **REST API**：\$0.05/次，支持 hotlist/search/export
- **MCP 协议**：直接集成 Claude/Cursor/AutoGPT
- **API Key**：企业预付费方案，免签名调用
- **人民币套餐**：日报 ¥29/月，全量导出 ¥99/次

👉 [查看所有价格方案 →](/offer.html)  
👉 [免费试用 3 条样例 →](/api/x402/sample?limit=3)  
👉 [AI Agent 一键接入 →](/agent)

---

*本文由 AutoTasker Hub 自动生成 · 数据每 10 分钟更新 · 链上可验*  
[${relativeUrl}](${url})
`;

  // Write HTML version
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escMd(title)} — 实时热度数据深度解析 | AutoTasker Hub Blog</title>
<meta name="description" content="#${escMd(src)}热搜：${escMd(title)}，热度${eng.toLocaleString()}。实时数据深度分析。">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${escMd(title)} — 深度解析">
<meta property="og:description" content="热度${eng.toLocaleString()} · ${escMd(src)}热搜实时数据">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: title,
  description: `#${src}热搜：${title}，热度${eng.toLocaleString()}`,
  datePublished: new Date().toISOString(),
  author: { '@type': 'Organization', name: 'AutoTasker Hub' },
  publisher: { '@type': 'Organization', name: 'AutoTasker Hub', logo: { '@type': 'ImageObject', url: 'https://autotasker.highkingflower.com/favicon.ico' } },
  mainEntityOfPage: url,
}).replace(/</g, '\\u003c')}</script>
<style>body{font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.8;color:#1a1a2e}
h1{font-size:1.5rem;margin-bottom:8px}h2{font-size:1.15rem;margin:28px 0 10px;color:#1e293b}
.meta{color:#64748b;font-size:.88rem;margin-bottom:20px}blockquote{border-left:3px solid #4f46e5;padding-left:16px;color:#475569;margin:16px 0}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:.9rem}th,td{padding:8px 12px;border:1px solid #e2e8f0;text-align:left}th{background:#f8fafc;font-weight:600}
.cta{background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px;margin:20px 0}
.cta a{color:#4f46e5;font-weight:600}
a{color:#4f46e5}footer{margin-top:32px;font-size:.82rem;color:#94a3b8;text-align:center}</style></head><body>
<a href="/blog" style="font-size:.85rem;color:#64748b;text-decoration:none">← 返回博客列表</a>
<h1>${escMd(title)}</h1>
<div class="meta">#${escMd(src)}热搜 · 热度 ${eng.toLocaleString()} · ${new Date().toLocaleDateString('zh-CN')}</div>
${md.split('\n').filter(l => !l.startsWith('---') && !l.startsWith('title:') && !l.startsWith('date:') && !l.startsWith('tags:') && !l.startsWith('description:')).map(l => {
  if (l.startsWith('## ')) return `<h2>${l.slice(3)}</h2>`;
  if (l.startsWith('|')) return l.replace(/\|/g, (m, i, s) => { const parts = s.split('|'); return parts.length > 2 ? `<td>${parts[1]?.trim()}</td>` : m; }).replace(/<\/?td>/g, m => m);
  if (l.includes('>')) return `<blockquote>${l.slice(1)}</blockquote>`;
  if (l.startsWith('- ')) return `<li>${l.slice(2)}</li>`;
  if (l.startsWith('👉')) return `<p style="margin:8px 0">${l}</p>`;
  if (l.trim() === '---') return '<hr>';
  return l.trim() ? `<p>${l}</p>` : '';
}).join('')}
<div class="cta">
<strong>📊 想要这类数据的实时 API 访问？</strong><br>
<a href="/offer.html">查看价格方案</a> ·
<a href="/api/x402/sample?limit=3">免费试用</a> ·
<a href="/agent">AI Agent 接入</a>
</div>
<footer>AutoTasker Hub Blog · 自动生成 · <a href="/trust">信任中心</a> · <a href="/api/x402/proof">链上可验</a></footer>
</body></html>`;

  return { title, slug, url, md, html, item, dateStr };
}

function generateAll(maxItems = 10) {
  const items = loadItems().slice(0, maxItems);
  if (!items.length) return { skipped: maxItems, reason: 'no items' };

  const dateStr = new Date().toISOString().slice(0, 10);
  const dayDir = path.join(BLOG_DIR, dateStr);
  fs.mkdirSync(dayDir, { recursive: true });

  const results = { generated: 0, skipped: 0 };
  for (let i = 0; i < items.length; i++) {
    const post = generatePost(items[i], i, items.length);
    const baseName = post.slug;

    // Write MD
    fs.writeFileSync(path.join(dayDir, baseName + '.md'), post.md, 'utf8');
    // Write HTML to public/blog/
    const htmlDir = path.join(ROOT, 'public', 'blog', baseName);
    fs.mkdirSync(htmlDir, { recursive: true });
    fs.writeFileSync(path.join(htmlDir, 'index.html'), post.html, 'utf8');

    results.generated++;
  }

  // Also write a blog index page
  const indexHtml = `<h1>📝 AutoTasker Hub Blog</h1><p>自动生成深度解析文章</p>`;
  fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), indexHtml, 'utf8');

  return results;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const once = argv.includes('--once');
  const max = parseInt(argv.find(a => a.startsWith('--max='))?.split('=')[1]) || 10;
  console.log(`[auto-blog] generating for up to ${max} items...`);
  const r = generateAll(max);
  console.log(`[auto-blog] done: ${r.generated} posts generated, ${r.skipped} skipped`);
  if (once) process.exit(0);
}

module.exports = { generatePost, generateAll };
