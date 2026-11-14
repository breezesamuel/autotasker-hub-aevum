/**
 * offer-referral-kit.js — 分销传播素材一键生成器
 *
 * 为每个推荐人自动生成：
 *   1. 纯文案版本（微信/飞书/微博/小红书适用）
 *   2. Markdown 技术文档（GitHub issue / HackerNews）
 *   3. HTML 落地预览页（可截图分享）
 *   4. QR Code SVG（指向 https://autotasker.highkingflower.com/r/:code）
 *
 * Usage:
 *   node scripts/offer-referral-kit.js <referral-code> [output-dir]
 *   Example: node scripts/offer-referral-kit.js ATXXXXXX dist/referral-kit-ATXXXXXX
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const referrals = require('../lib/referrals');

const CODE = String(process.argv[2] || '').toUpperCase();
const OUT_DIR = process.argv[3] || path.join(__dirname, '..', 'public', 'referral-kit-' + CODE);
const BASE_URL = 'https://autotasker.highkingflower.com';
const TRACKING_LINK = `${BASE_URL}/r/${CODE}`;

if (!CODE.match(/^AT[A-Z0-9]{6}$/)) {
  console.error('usage: node scripts/offer-referral-kit.js <referral-code>');
  process.exit(1);
}

// ── Copywriting templates (multiple tone variants) ───────────────────────
const COPYWRITES = {
  'short-snapshot': `Chinese social media trending data at your fingertips.\nWeibo hot search · Zhihu · Douban · Bilibili · Tieba\n\n🤖 Agent-ready MCP endpoints: $0.05 USDC per call on Base\n💰 Referral rebate: 10% back to your wallet\n🔗 Try free sample: ${TRACKING_LINK}\n\nNo sign-up. No pre-pay. Pay-per-use via x402 protocol.`,

  'product-hunt': `Found a great Chinese social-data API for AI agents: it streams Weibo/Zhihu/Douban/Bilibili/Tieba rankings and costs only $0.05/call on-chain (USDC on Base).\n\nRuns as an MCP server so you can drop it into any Claude/Cursor/AutoGPT session.\n\nTheir referral program gives 10% cashback to your own wallet — I used my link below:\n👉 ${TRACKING_LINK}`,

  'wechat-formal': `分享一个很有用的数据API：AutoTasker Hub — 中文社媒热搜实时聚合（微博/知乎/豆瓣/B站/贴吧）。\n\n✅ AI Agent 可直接用 MCP 协议接入\n✅ 按次付费 $0.05 USDC，链上结算零预充\n✅ 10% 推荐返利到你的钱包地址\n\n免费试用链接：${TRACKING_LINK}`,

  'social-short': `想抓微博/知乎/豆瓣热搜？这个 MCP 数据源超便宜：$0.05/次，支持 x402 链上支付 + 推荐返利 10%。\n\n试试：${TRACKING_LINK}`,

  'reddit-post': `## r/China_Updates or r/SaaS — SEO-friendly angle\n\n**Title:** Building a Weibo/Zhihu trending aggregator — sold $10+ in first week using x402 paywall\n\n**Body:**\nI built AutoTasker Hub: a real-time Chinese social media trends API that aggregates Weibo hot search, Zhihu, Douban, Bilibili, and Tieba.\n\nKey design choices:\n- **x402 protocol**: every paid call settles directly to treasury (no custodial risk)\n- **MCP endpoint**: plug into any agent framework in 3 lines\n- **Base USDC micro-pricing**: $0.05/hotlist, $0.50/full export\n- **Referral rebates**: 10% of every referred payment goes to referrer's wallet\n\nRevenue truth: external_usdc=$10.83 from 266 verified payments (see revenue-ledger.json). No house self-pay inflating the number.\n\nTry the free sample:\n${TRACKING_LINK}`,
};

// ── QR code SVG generator (inline TinySVG, no dependency) ────────────────
function qrSvg(data, size = 400) {
  // Use qrcode-generator if available, otherwise fallback to simple pattern
  try {
    const QRCODE = require('qrcode-generator');
    const q = QRCODE(1, 'M');
    q.addData(data);
    q.make();
    const cellSize = Math.round(size / (q.getModuleCount() * 2));
    const modCount = q.getModuleCount();
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;
    svg += `<rect width="${size}" height="${size}" fill="white"/>`;
    for (let row = 0; row < modCount; row++) {
      for (let col = 0; col < modCount; col++) {
        if (q.isDark(row, col)) {
          const x = col * cellSize * 2 + cellSize;
          const y = row * cellSize * 2 + cellSize;
          svg += `<rect x="${x}" y="${y}" width="${cellSize * 2}" height="${cellSize * 2}" fill="#0f172a"/>`;
        }
      }
    }
    // center logo placeholder circle
    const cx = size / 2, cy = size / 2, r = size * 0.12;
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white"/>`;
    svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dy=".35em" font-family="system-ui" font-size="${Math.round(r * 0.8)}" fill="#4f46e5" font-weight="bold">A</text>`;
    svg += '</svg>';
    return svg;
  } catch (e) {
    // Fallback: plain ASCII QR proxy URL image
    return `<img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(TRACKING_LINK)}&size=${size}x${size}&bgcolor=ffffff" alt="QR: ${TRACKING_LINK}"/>`;
  }
}

// ── Build outputs ────────────────────────────────────────────────────────
function buildMarkdown() {
  return `# AutoTasker Hub — 中文社媒热点数据

**一句话**：微博/知乎/豆瓣/B站/贴吧实时榜单 → MCP 接口 → AI Agent 直连调用

## 为什么选它
- **按次计费**：每次调用 $0.05（USDC on Base），无预充值、无订阅浪费
- **MCP 原生**：3 行配置接进任何 Claude/Cursor/AutoGPT 会话
- **推荐返利 10%**：通过下方链接访问并完成首次支付，推荐人自动获得返利到钱包
- **账本公开透明**：每笔外部收入带 txHash，全可在 chain explorer 验证

## 快速开始
1. 点击推广链接：[${TRACKING_LINK}](${TRACKING_LINK})
2. 页面顶部「免费样例」按钮直接查看 JSON 返回结构
3. 调用 \`GET /api/x402/hotlist?board=weiboHot&limit=5\`（需携带 x402 signature）
4. 或走 MCP：先 \`POST /mcp initialize\` → \`tools/list\` → \`tools/call get_hotlist\`

## 价格表
| 产品 | 价格 | 说明 |
|------|------|------|
| hotlist / search | \$0.05 | 单次榜单或关键词检索 |
| full export | \$0.50 | 全量数据导出（含元数据） |
| utility tools | \$0.01 起 | 数据分析辅助工具集 |
| 人民币套餐 | ¥29~299 | 日报/导出/API 包月（支付宝/微信商户号） |

## 推广码
复制以下链接发给任何人，他们通过此链接注册并完成支付后，你自动获得 10% 返利：
\`\`\`
${TRACKING_LINK}
\`\`\`

查询我的推广战绩：\`${BASE_URL}/api/ref/stats/${CODE}\`
`;
}

function buildHtmlPage(title = 'AutoTasker Hub') {
  return `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — 中文社媒热点数据</title>
<style>
*{box-sizing:border-box}body{font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;max-width:720px;margin:0 auto;padding:20px;color:#0f172a;background:#f8fafc}
h1{color:#4f46e5;margin-bottom:4px}.tag{color:#64748b;font-size:.9rem;margin-bottom:20px}
.code{background:#1e293b;color:#e2e8f0;padding:10px 14px;border-radius:8px;font-family:monospace;font-size:.85rem;overflow-x:auto;white-space:pre}
.card{border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#fff;margin:12px 0}
.btn{display:inline-block;background:#4f46e5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600}
.btn:hover{background:#4338ca}
.qr{text-align:center;margin:20px 0;padding:20px;background:#fff;border-radius:12px;border:1px solid #e2e8f0}
.qr img,.qr svg{max-width:200px;height:auto}
table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:left}th{background:#f1f5f9;font-weight:600}
footer{margin-top:30px;font-size:.8rem;color:#94a3b8;text-align:center}
</style></head><body>
<h1>AutoTasker Hub</h1>
<p class="tag">微博热搜 · 知乎热榜 · 豆瓣 · B站 · 贴吧 — AI Agent 实时数据源</p>

<div class="card">
  <h3 style="margin-top:0">免费试用 · 先看再决定</h3>
  <p style="font-size:.92rem;color:#334155">JSON 样例直接展示实际数据结构与字段，无需登录。</p>
  <a class="btn" href="${BASE_URL}/api/x402/sample?limit=5">🧪 获取免费样例 JSON</a>
</div>

<div class="card">
  <h3 style="margin-top:0">推广链接 — 分享给朋友</h3>
  <p style="font-size:.92rem;color:#334155">对方通过你的链接注册并产生第一笔支付后，10% 返利自动进入你的钱包。</p>
  <div class="code">${TRACKING_LINK}</div>
  <div class="qr"><strong>扫码直达</strong><br/>${qrSvg(TRACKING_LINK)}</div>
  <p style="font-size:.82rem;color:#94a3b8;margin-top:8px">📱 手机截屏二维码即可发朋友圈 / 微信群</p>
</div>

<div class="card">
  <h3 style="margin-top:0">定价一览</h3>
  <table>
    <tr><th>产品</th><th>价格</th><th>适合场景</th></tr>
    <tr><td>hotlist / search</td><td>$0.05 / 次</td><td>单次榜单查询，Agent 按需调用</td></tr>
    <tr><td>full export</td><td>$0.50 / 次</td><td>研究、竞品分析、整库导出</td></tr>
    <tr><td>MCP 工具集</td><td>$0.01 起 / 次</td><td>数据分析、清洗、格式化等辅助工具</td></tr>
    <tr><td>人民币日报订阅</td><td>¥29 / 月</td><td>每日 8:30 推送完整五大平台榜单</td></tr>
    <tr><td>API 包月</td><td>¥299 / 月</td><td>无限次 REST/MCP 调用 + 技术支持</td></tr>
  </table>
</div>

<div class="card">
  <h3 style="margin-top:0">如何赚返利</h3>
  <ol style="font-size:.92rem;color:#334155;padding-left:1.2em">
    <li>把上方推广链接发给任何人（微信/邮件/社区帖都行）</li>
    <li>对方点击后浏览器会记住你的推荐码（30 天 cookie）</li>
    <li>对方完成 x402 支付后，系统自动归因到你的码</li>
    <li>累计返利 ≥ $1 时，可从金库链上直接提现到你的钱包</li>
  </ol>
  <p style="font-size:.82rem;color:#94a3b8">我的战绩：<a href="${BASE_URL}/api/ref/stats/${CODE}">点击查看</a></p>
</div>

<footer>
  AutoTasker Hub · 数据来自公开榜单聚合 · USDC 链上结算可验证<br/>
  <a href="${BASE_URL}/llms.txt">Agent 文档</a> · <a href="${BASE_URL}/feed.xml">RSS</a> · <a href="${BASE_URL}/trending">实时快照</a>
</footer>
</body></html>`;
}

function buildTxtFiles() {
  return {
    'whatsapp-broadcast.txt': `🚀 发现一个很酷的 API！\n自动抓取微博/知乎/豆瓣/B站/贴吧热搜\nAI Agent 直接接 MCP，每次只要 $0.05！\n还能拿 10% 返利。\n试试：${TRACKING_LINK}`,
    'twitter-short.txt': `🇨🇳 中国社媒热搜聚合 API\n→ Weibo/Zhihu/Douban/Bilibili/Tieba\n→ MCP 直连，Agent 可用\n→ $0.05/次 USDC 结算，10% 推荐返利\n\n${TRACKING_LINK}`,
    'linkedin-post.txt': `刚发现一个很有意思的数据产品 —— AutoTasker Hub，一个面向 AI Agent 的中文社交媒体热门数据 API。\n\n它同时提供 Weibo Hot Search、Zhihu、Douban、Bilibili 和 Tieba 的实时榜单聚合，并且有 MCP 端点可以直接接入 Cursor/Claude/AutoGPT 这类工具，每次调用只需 $0.05 USDC（走 Base 链上 x402 协议）。\n\n最值得提的是他们的推荐计划：通过我下方链接注册并完成首单后，你可以拿到 10% 的现金返利到你自己的钱包地址，这对开发者来说是个不错的被动收入通道。\n\n🔗 免费试用链接：${TRACKING_LINK}\n\n如果你也在关注中国市场情报或者在做 Agent 相关的商业化探索，值得试一下。`,
  };
}

// ── Write all files ──────────────────────────────────────────────────────
try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  
  // 1. Markdown doc
  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), buildMarkdown());
  
  // 2. HTML landing preview (shareable screenshot target)
  fs.writeFileSync(path.join(OUT_DIR, 'preview.html'), buildHtmlPage());
  
  // 3. Plain-text copy variants
  Object.entries(buildTxtFiles()).forEach(([name, content]) => {
    fs.writeFileSync(path.join(OUT_DIR, name), content);
  });
  
  // 4. Copy-paste blocks for each platform
  const COPY_FILE = 'COPY-PASTE.md';
  const copyLines = [];
  for (const [key, body] of Object.entries(COPYWRITES)) {
    copyLines.push(`### ${key}\n\`\`\`\n${body}\n\`\`\`\n`);
  }
  fs.writeFileSync(path.join(OUT_DIR, COPY_FILE), copyLines.join('\n---\n'));
  
  // 5. Meta
  fs.writeFileSync(path.join(OUT_DIR, 'META.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    code: CODE,
    trackingLink: TRACKING_LINK,
    statsEndpoint: `${BASE_URL}/api/ref/stats/${CODE}`,
  }, null, 2));
  
  console.log(`kit written to ${OUT_DIR}`);
  console.log('files:', ['README.md', 'preview.html', COPY_FILE].concat(Object.keys(buildTxtFiles())).join(', '));
} catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
}
