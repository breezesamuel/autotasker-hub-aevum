/**
 * agent-onboard.js — AI Agent 自动入驻引导
 *
 * 目标：让 Claude/Copilot/GPT/Cursor 等 Agent 一眼看懂怎么付钱、怎么用。
 *
 * 流程：
 *   1. Agent 访问 /agent → 看到「一键接入」页
 *   2. 点击「生成示例请求」→ 浏览器自动生成 x402 签名 payload（含金额、payTo、network）
 *   3. Agent 调用 /api/x402/hotlist → 看到 402 challenge → 签名支付 → 拿到数据
 *   4. 同时生成专属 referral code → Agent 分享给其他用户
 *
 * 这个模块不依赖任何外部 SDK，纯浏览器端 JS 生成 x402 v2 payload，
 * 让任何有 JS 环境的 Agent 都能自助完成首次支付。
 */
'use strict';

const TREASURY = process.env.PAY_TO || '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';
const NETWORK = 'eip155:8453';
const ASSET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const HOST = 'autotasker.highkingflower.com';

function buildPayload(board, limit) {
  return {
    x402Version: 2,
    scheme: 'exact',
    network: NETWORK,
    asset: ASSET,
    amount: '50000', // $0.05 in atomic USDC
    payTo: TREASURY,
    resource: 'https://' + HOST + '/api/x402/hotlist?board=' + board + '&limit=' + limit,
    signature: null, // client signs this
    authorization: {
      from: null, // payer wallet address (filled by browser extension or manual entry)
      validFrom: Math.floor(Date.now() / 1000) - 300,
      validUntil: Math.floor(Date.now() / 1000) + 3600,
    },
  };
}

function htmlView() {
  const jsSnippet = `// 1. 获取挑战（402 Payment Required 头）
const challengeResp = await fetch('${HOST}/api/x402/hotlist?board=weiboHot&limit=3');
const paymentRequired = challengeResp.headers.get('Payment-Required');
const challenge = JSON.parse(atob(paymentRequired));

// 2. 构建支付 payload（你的钱包地址填入 from）
const payload = {
  ...challenge,
  authorization: {
    from: 'YOUR_WALLET_ADDRESS',  // ← 换成你的 Base 钱包地址
    validFrom: Math.floor(Date.now()/1000) - 300,
    validUntil: Math.floor(Date.now()/1000) + 3600,
  }
};

// 3. 用你的私钥签名（需要 viem 或 ethers）
// const signature = await signer.signTypedData(...)

// 4. 带着签名再调一次
const paidResp = await fetch('${HOST}/api/x402/hotlist?board=weiboHot&limit=3', {
  headers: { 'PAYMENT-SIGNATURE': btoa(JSON.stringify(payload)) }
});
const data = await paidResp.json();`;

  const mcpJson = JSON.stringify({
    name: 'chinese-trending-data',
    url: `https://${HOST}/mcp`,
    description: 'Real-time Chinese social media trending data via x402 USDC payment on Base mainnet',
    tools: [
      { name: 'get_hotlist', description: 'Get trending posts from Weibo/Zhihu/Douban/Bilibili/Tieba', price: '$0.05' },
      { name: 'search_chinese_social', description: 'Search across Chinese social platforms', price: '$0.05' },
      { name: 'export_full_dataset', description: 'Export complete dataset', price: '$0.50' },
    ],
  }, null, 2);

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agent 接入指南 — AutoTasker Hub</title>
<meta name="description" content="AI Agent 一键接入中文社媒数据 API，x402 USDC 链上支付，Base 主网结算">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,'Segoe UI','Microsoft YaHei',sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.6}
.container{max-width:800px;margin:0 auto;padding:32px 20px}
h1{font-size:1.6rem;margin-bottom:8px}
.subtitle{color:#94a3b8;font-size:.95rem;margin-bottom:32px}
.card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:24px;margin-bottom:20px}
.card h2{font-size:1.1rem;color:#818cf8;margin-bottom:12px}
.card p{color:#94a3b8;font-size:.9rem;margin-bottom:12px}
.step{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}
.step-num{background:#4f46e5;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85rem;flex-shrink:0}
.step-text{flex:1}
.step-text strong{color:#f1f5f9}
pre{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px;overflow-x:auto;font-size:.82rem;color:#a5f3fc;line-height:1.5;white-space:pre-wrap}
code{font-family:'JetBrains Mono','Fira Code',monospace}
.badge{display:inline-block;background:#1e3a5f;color:#60a5fa;padding:3px 10px;border-radius:20px;font-size:.78rem;margin-right:6px}
.cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
.btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:8px;font-size:.9rem;font-weight:600;text-decoration:none;cursor:pointer;border:none}
.btn-primary{background:#4f46e5;color:#fff}
.btn-primary:hover{background:#4338ca}
.btn-secondary{background:#1e293b;color:#94a3b8;border:1px solid #334155}
.btn-secondary:hover{background:#334155;color:#e2e8f0}
.pricing-table{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:12px}
.pricing-item{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px;text-align:center}
.pricing-item .name{font-size:.85rem;color:#94a3b8}
.pricing-item .price{font-size:1.3rem;font-weight:700;color:#22c55e;margin-top:4px}
.footer{margin-top:32px;font-size:.82rem;color:#475569;text-align:center}
.footer a{color:#818cf8}
</style></head><body>
<div class="container">
<h1>🤖 Agent 一键接入</h1>
<p class="subtitle">Claude · Cursor · Copilot · Windsurf · 任意支持 x402 的 Agent</p>

<div class="card">
  <h2>💰 定价一览</h2>
  <div class="pricing-table">
    <div class="pricing-item"><div class="name">热搜榜单</div><div class="price">$0.05</div></div>
    <div class="pricing-item"><div class="name">关键词搜索</div><div class="price">$0.05</div></div>
    <div class="pricing-item"><div class="name">全量导出</div><div class="price">$0.50</div></div>
    <div class="pricing-item"><div class="name">工具调用</div><div class="price">$0.01</div></div>
  </div>
  <p style="margin-top:12px;font-size:.82rem;color:#64748b">全部通过 x402 协议在 Base 主网以 USDC 结算 · 每笔可在 BaseScan 查验</p>
</div>

<div class="card">
  <h2>⚡ 三步接入</h2>
  <div class="step">
    <div class="step-num">1</div>
    <div class="step-text"><strong>免费试用</strong><br><a href="/api/x402/sample?limit=3" class="badge" style="display:inline-block;margin-top:4px">GET /api/x402/sample?limit=3</a> 无需任何配置，直接获取样例数据</div>
  </div>
  <div class="step">
    <div class="step-num">2</div>
    <div class="step-text"><strong>发起支付请求</strong><br>调用付费接口，服务端返回 402 + Payment-Required 挑战头</div>
  </div>
  <div class="step">
    <div class="step-num">3</div>
    <div class="step-text"><strong>签名并支付</strong><br>用你的 Base 钱包签名 payload，携带 PAYMENT-SIGNATURE 头重发请求</div>
  </div>
</div>

<div class="card">
  <h2>📋 JavaScript 完整示例</h2>
  <pre>${jsSnippet}</pre>
</div>

<div class="card">
  <h2>🔌 MCP 配置（Claude Desktop / Cursor）</h2>
  <p>将以下 JSON 添加到你的 MCP config：</p>
  <pre>${mcpJson}</pre>
</div>

<div class="card">
  <h2>🛡️ 信任与验证</h2>
  <p style="font-size:.88rem;color:#94a3b8">
    <span class="badge">金库</span> ${TREASURY.slice(0,10)}…${TREASURY.slice(-6)}
    <span class="badge">BaseScan</span>
    <a href="https://basescan.org/address/${TREASURY}" target="_blank" style="color:#60a5fa">查看链上数据</a>
    <span class="badge">对账</span>
    <a href="/api/x402/reconcile" style="color:#60a5fa">/api/x402/reconcile</a>
  </p>
</div>

<div class="cta-row">
  <a href="/offer.html" class="btn btn-primary">💎 查看所有产品与价格</a>
  <a href="/api/x402/sample?limit=5" class="btn btn-secondary">🧪 免费试用</a>
  <a href="/llms.txt" class="btn btn-secondary">📖 Agent 文档</a>
  <a href="/trust" class="btn btn-secondary">🔐 信任中心</a>
</div>

<div class="footer">
  <a href="/faq">常见问题</a> ·
  <a href="/ref/new">成为推广员赚 10% 返利</a> ·
  <a href="https://basescan.org/address/${TREASURY}" target="_blank">BaseScan</a>
</div>
</div>
</body></html>`;
}

module.exports = { buildPayload, htmlView };
