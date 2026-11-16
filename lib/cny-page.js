/**
 * cny-page.js — /pay/cny 人民币兜底收款页
 *
 * 背景: 支付宝 API 通道等用户在开放平台配好应用公钥 (40003 isv.missing-signature-config)、
 * 微信等 appid-mchid 绑定 (403 NO_AUTH)。在 API 通道打通前，用已验证的个人收款码
 * (jsQR 核验过 payload, sha256 与 config/app.json 记录一致) 提供立即可用的 CNY 收款面。
 *
 * 路由:
 *   GET /pay/cny            — 收款页 (两码 + 套餐 + 说明)
 *   GET /api/pay/cny/status — 渠道状态 JSON (含 payload 验证记录)
 *
 * 兜底原则: 二维码为静态图片 (public/img/*-clean.png)，payload 内嵌 + 可被
 * config/cny.json 覆盖 (换码时只改那个文件, 页面自动跟随)。
 */
'use strict';

const fs = require('fs');
const path = require('path');

// jsQR-verified personal collection payloads (config/app.json, verifiedAt 2026-10-21)
const DEFAULTS = {
  alipay: {
    payload: 'https://qr.alipay.com/2m616059wjpz9pdsuxvy8ba',
    verifiedAt: '2026-10-21T06:48:45.757Z',
    img: '/img/alipay-clean.png',
    sha256: 'f9f8ed2a1f5098dfd998d85ebcbc35f4275d8399c7354696a233020022ff8e58',
  },
  wechat: {
    payload: 'https://payapp.wechatpay.cn/sjt/qr/AQLWk0PH5V1cyDr0Y_eV8v4t',
    verifiedAt: '2026-10-21T06:48:45.759Z',
    img: '/img/wechat-clean.png',
    sha256: 'a4738159353e34e9c3a6b2ed8416e963e9d65f0d8f85b6774e12e6b995667a74',
  },
};

function loadOverrides() {
  try {
    const p = path.join(__dirname, '..', 'config', 'cny.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) { return {}; }
}

function channels() {
  const o = loadOverrides();
  const alipay = { ...DEFAULTS.alipay, ...(o.alipay || {}) };
  const wechat = { ...DEFAULTS.wechat, ...(o.wechat || {}) };
  return {
    ok: true,
    note: 'CNY fallback rails — personal collection QRs, payload jsQR-verified. API channels (alipay/wechat v3) pending console setup.',
    alipay: { label: '支付宝 (个人收款码)', ...alipay },
    wechat: { label: '微信支付 (个人收款码)', ...wechat },
    packs: [
      { id: 'starter', name: '入门包', priceCny: 9.9, grants: 'hotlist/search 各 500 次调用额度' },
      { id: 'pro', name: '专业包', priceCny: 29, grants: 'hotlist/search 各 2000 次 + daily_report 7 天' },
      { id: 'business', name: '商用包', priceCny: 99, grants: '全量端点 30 天 + 定制对接支持' },
    ],
    contact: '付款后把转账单号发到网站联系入口即可开通',
  };
}

function page() {
  const c = channels();
  const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const packs = c.packs.map((p) =>
    `<div class="pack"><h3>${esc(p.name)} <span class="price">¥${p.priceCny}</span></h3><p>${esc(p.grants)}</p></div>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>人民币收款 — AutoTasker Hub</title>
<meta name="description" content="支付宝/微信个人收款码直接付款开通 API 套餐，USDC x402 通道之外的 CNY 兜底通道。">
<link rel="canonical" href="https://autotasker.highkingflower.com/pay/cny">
<style>
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;margin:0;background:#0b1220;color:#e2e8f0;line-height:1.6}
main{max-width:880px;margin:0 auto;padding:24px 16px}
h1{font-size:1.5rem;color:#fff} .sub{color:#94a3b8;margin-bottom:24px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:640px){.grid{grid-template-columns:1fr}}
.card{background:#111a2e;border:1px solid #1e293b;border-radius:14px;padding:18px;text-align:center}
.card img{width:210px;height:210px;border-radius:10px;background:#fff;padding:6px}
.card .label{font-weight:600;margin-top:10px} .card .payload{word-break:break-all;font-size:.72rem;color:#64748b;margin-top:6px}
.packs{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:28px 0}
.pack{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:14px}
.price{color:#fbbf24;font-size:1.2rem} .steps{background:#111a2e;border-radius:12px;padding:16px}
.steps ol{padding-left:20px;margin:8px 0} a{color:#7dd3fc}
.note{color:#64748b;font-size:.85rem;margin-top:18px}
</style></head><body><main>
<h1>¥ 人民币付款通道</h1>
<p class="sub">x402/USDC 链上通道之外的 CNY 直付入口 — 扫码即付，无需注册。</p>
<div class="grid">
<div class="card"><img src="${esc(c.alipay.img)}" alt="支付宝收款码"><div class="label">${esc(c.alipay.label)}</div><div class="payload">${esc(c.alipay.payload)}</div></div>
<div class="card"><img src="${esc(c.wechat.img)}" alt="微信收款码"><div class="label">${esc(c.wechat.label)}</div><div class="payload">${esc(c.wechat.payload)}</div></div>
</div>
<h2>套餐与额度</h2>
<div class="packs">${packs}</div>
<div class="steps"><h3>开通步骤</h3><ol>
<li>扫码付款（金额 = 套餐价）</li>
<li>备注/转账留言填写你的联系邮箱</li>
<li>把「转账单号 + 邮箱 + 所选套餐」发送到 <a href="mailto:service@highkingflower.com">service@highkingflower.com</a></li>
<li>额度人工确认后开通（工作日 1 小时内）</li>
</ol></div>
<p class="note">API 收款码通道（对公）正在配置：支付宝 isv.missing-signature-config → 等待开放平台应用公钥设置；微信 NO_AUTH → 等待 appid-mchid 绑定。本页二维码 payload 已通过 jsQR 双版本核验（2026-10-21）。</p>
<p class="note"><a href="/offer.html">USDC x402 支付 →</a> · <a href="/api/status">系统状态</a></p>
</main></body></html>`;
}

function mount(app) {
  app.get('/pay/cny', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=600');
    res.send(page());
  });
  app.get('/api/pay/cny/status', (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json(channels());
  });
}

module.exports = { mount, channels, page };
