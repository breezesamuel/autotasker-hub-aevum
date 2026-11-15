/**
 * partner-page.js — 合作伙伴/白标入口页
 *
 * GET /partner → HTML 合作伙伴页面
 * GET /api/partner/info → JSON 合作方案详情
 *
 * 目标客户：
 *   1. SaaS 平台（需要嵌入中文数据）
 *   2. 数据分析公司（批量采购趋势数据）
 *   3. 营销机构（社媒监控服务）
 *   4. AI Agent 框架（MCP tool 集成）
 *
 * 合作模式：
 *   - 白标 API：用自己的域名和品牌提供服务
 *   - 批量授权：预付费 Token，免签名调用
 *   - 联合营销：互相引流 + 收入分成
 */
'use strict';

const TREASURY = process.env.PAY_TO || '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';

const PARTNER_PLANS = [
  { name: 'Starter', price: '$299/mo', desc: '每月 5000 次调用，标准支持', features: ['5000 calls/month', 'Email support', 'Standard SLA', 'Basic analytics'] },
  { name: 'Business', price: '$999/mo', desc: '每月 25000 次调用，优先支持', features: ['25000 calls/month', 'Priority support', '99.9% SLA', 'Advanced analytics', 'Custom endpoints'] },
  { name: 'Enterprise', price: '定制', desc: '无限调用，白标 + 专属支持', features: ['Unlimited calls', 'White-label API', 'Dedicated account manager', 'Custom integrations', 'Joint marketing'] },
];

function htmlView() {
  const planRows = PARTNER_PLANS.map((p, i) => `
    <div class="plan${i === 2 ? ' featured' : ''}">
      <div class="plan-header"><h3>${p.name}</h3><span class="price">${p.price}</span></div>
      <p class="plan-desc">${p.desc}</p>
      <ul>${p.features.map(f => `<li>${f}</li>`).join('')}</ul>
      <a href="/offer.html" class="btn-plan">申请合作</a>
    </div>`).join('');

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>合作伙伴计划 — AutoTasker Hub · 白标API与批量授权</title>
<meta name="description" content="AutoTasker Hub 合作伙伴计划：白标API、批量授权、联合营销。为SaaS/数据分析/营销机构提供中文社媒数据解决方案。">
<link rel="canonical" href="https://autotasker.highkingflower.com/partner">
<meta property="og:title" content="AutoTasker Hub 合作伙伴计划">
<meta property="og:description" content="白标API · 批量授权 · 收入分成">
<meta property="og:type" content="website">
<meta property="og:url" content="https://autotasker.highkingflower.com/partner">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.6}
.container{max-width:960px;margin:0 auto;padding:32px 20px}
.badge{display:inline-block;background:#1e3a5f;color:#60a5fa;padding:4px 12px;border-radius:20px;font-size:.78rem;margin-bottom:12px}
h1{font-size:1.8rem;margin-bottom:8px}
.lead{color:#94a3b8;font-size:1.05rem;margin-bottom:32px}
.section{margin-bottom:40px}
.section h2{font-size:1.2rem;color:#818cf8;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #1e293b}
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.plan{background:#1a1a2e;border:1px solid #2d2d44;border-radius:14px;padding:24px;position:relative}
.plan.featured{border-color:#4f46e5;box-shadow:0 0 20px rgba(79,70,229,.2)}
.plan.featured::before{content:'推荐';position:absolute;top:-10px;left:20px;background:#4f46e5;color:#fff;padding:2px 10px;border-radius:10px;font-size:.75rem}
.plan-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.plan-header h3{font-size:1.1rem}
.price{font-size:1.3rem;font-weight:700;color:#22c55e}
.plan-desc{color:#94a3b8;font-size:.88rem;margin-bottom:16px}
.plan ul{list-style:none;padding:0;margin-bottom:20px}
.plan li{padding:4px 0;font-size:.88rem;color:#cbd5e1}
.plan li::before{content:'✓ ';color:#22c55e}
.btn-plan{display:block;text-align:center;background:#4f46e5;color:#fff;padding:10px;border-radius:8px;text-decoration:none;font-weight:600}
.btn-plan:hover{background:#4338ca}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:32px}
.stat{text-align:center;background:#1a1a2e;border:1px solid #2d2d44;border-radius:10px;padding:16px}
.stat .v{font-size:1.5rem;font-weight:700;color:#818cf8}
.stat .l{font-size:.78rem;color:#64748b;margin-top:4px}
.cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
.btn{padding:12px 24px;border-radius:8px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.btn-primary{background:#4f46e5;color:#fff}
.btn-secondary{background:#1e293b;color:#94a3b8;border:1px solid #334155}
footer{margin-top:40px;font-size:.82rem;color:#475569;text-align:center}
</style></head><body>
<div class="container">
<span class="badge">🤝 合作伙伴计划</span>
<h1>与 AutoTasker Hub 建立数据合作关系</h1>
<p class="lead">我们为 SaaS 平台、数据分析公司和 AI Agent 框架提供企业级中文社媒数据解决方案。</p>

<div class="stats">
  <div class="stat"><div class="v">5+</div><div class="l">数据源</div></div>
  <div class="stat"><div class="v">10min</div><div class="l">更新频率</div></div>
  <div class="stat"><div class="v">x402</div><div class="l">链上结算</div></div>
  <div class="stat"><div class="v">99.9%</div><div class="l">SLA</div></div>
</div>

<div class="section">
  <h2>合作方案</h2>
  <div class="plans">${planRows}</div>
</div>

<div class="section">
  <h2>为什么选择我们？</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:12px">
    <div style="background:#1a1a2e;border:1px solid #2d2d44;border-radius:10px;padding:16px">
      <div style="font-size:1.3rem;margin-bottom:6px">🔒</div>
      <strong style="font-size:.9rem">链上可验</strong>
      <p style="font-size:.8rem;color:#94a3b8;margin-top:4px">每笔交易 BaseScan 可查，数据质量三维度评分</p>
    </div>
    <div style="background:#1a1a2e;border:1px solid #2d2d44;border-radius:10px;padding:16px">
      <div style="font-size:1.3rem;margin-bottom:6px">⚡</div>
      <strong style="font-size:.9rem">实时聚合</strong>
      <p style="font-size:.8rem;color:#94a3b8;margin-top:4px">微博/知乎/豆瓣/B站/贴吧 10分钟刷新一次</p>
    </div>
    <div style="background:#1a1a2e;border:1px solid #2d2d44;border-radius:10px;padding:16px">
      <div style="font-size:1.3rem;margin-bottom:6px">🌍</div>
      <strong style="font-size:.9rem">多语言支持</strong>
      <p style="font-size:.8rem;color:#94a3b8;margin-top:4px">CN/EN/JP/KR 四语 SEO，全球流量覆盖</p>
    </div>
    <div style="background:#1a1a2e;border:1px solid #2d2d44;border-radius:10px;padding:16px">
      <div style="font-size:1.3rem;margin-bottom:6px">🤖</div>
      <strong style="font-size:.9rem">AI Agent 原生</strong>
      <p style="font-size:.8rem;color:#94a3b8;margin-top:4px">MCP协议 + x402支付，Claude/Cursor一键接入</p>
    </div>
  </div>
</div>

<div class="section">
  <h2>技术集成方式</h2>
  <pre style="background:#0f172a;border:1px solid #2d2d44;border-radius:8px;padding:16px;font-size:.82rem;color:#a5f3fc;overflow-x:auto;margin-top:8px">
// REST API (x402 USDC 支付)
GET https://autotasker.highkingflower.com/api/x402/hotlist?board=weiboHot&limit=10

// MCP 协议 (AI Agent 直接调用)
POST https://autotasker.highkingflower.com/mcp
Body: {"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_hotlist","arguments":{"board":"weiboHot"}}}

// 白标 API (Enterprise 方案)
GET https://your-domain.com/api/trending  // 您的品牌，我们的数据</pre>
</div>

<div class="cta-row">
  <a href="/offer.html" class="btn btn-primary">💎 查看标准价格</a>
  <a href="/agent" class="btn btn-secondary">🤖 AI Agent 自助接入</a>
  <a href="/api/x402/sample?limit=5" class="btn btn-secondary">🧪 免费试用</a>
</div>

<footer>
  <a href="/trust">信任中心</a> ·
  <a href="/leaderboard">消费排行榜</a> ·
  <a href="https://basescan.org/address/${TREASURY}" target="_blank">BaseScan</a>
</footer>
</div>
</body></html>`;
}

function jsonInfo() {
  return {
    program: 'AutoTasker Hub Partner Program',
    baseEndpoint: 'https://autotasker.highkingflower.com',
    plans: PARTNER_PLANS,
    contact: { email: 'partners@autotasker.highkingflower.com', note: '提交工单 /faq 页面 "发票/合同" 关键词即可联系商务' },
    integrationMethods: ['REST API (x402)', 'MCP Protocol', 'Webhook subscriptions', 'Batch export (CSV/JSON)'],
    slas: { standard: '99.5%', business: '99.9%', enterprise: '99.99%' },
  };
}

module.exports = { htmlView, jsonInfo };
