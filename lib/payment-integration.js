/**
 * payment-integration.js — Real Alipay + WeChat Pay v3 integration
 *
 * Now supports:
 *   - Alipay QR code (alipay.trade.precreate via RSA-SHA256 sign)
 *   - WeChat Pay v3 prepay_id (wxaapp/native via APIv3 certificate auth)
 *   - Status endpoints show real key presence + connectivity hints
 *
 * Key files:
 *   config/keys/alipay.json      — appId, RSA keys (alipay public too)
 *   config/keys/wxpay/wxpay.json — mchid, apiV3Key, cert paths
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const KEYS_DIR = path.join(ROOT, 'config', 'keys');
// ── Helpers ───────────────────────────────────────────────────────────────────
function loadKeyFile(name) {
  try { return JSON.parse(fs.readFileSync(path.join(KEYS_DIR, name), 'utf8')); }
  catch (e) { return null; }
}
function hasKey(name) { return loadKeyFile(name) !== null; }

function httpPostJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
      timeout: 15000,
    }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(b), raw: b }); }
        catch (_) { resolve({ status: res.statusCode, body: null, raw: b.slice(0, 300) }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('http timeout')); });
    req.write(data); req.end();
  });
}

// ── Alipay ────────────────────────────────────────────────────────────────────
function getAlipayStatus() {
  const k = loadKeyFile('alipay.json');
  if (!k || !k.appId) return { enabled: false, note: 'alipay.json missing or appId=null — configure from open.alipay.com' };
  return {
    enabled: true,
    appId: k.appId,
    gateway: k.gateway || 'https://openapi.alipay.com/gateway.do',
    signType: k.signType || 'RSA2',
    supportedCurrencies: ['CNY'],
    minAmount: '¥0.01',
    fingerprints: k.fingerprints,
  };
}

/**
 * Generate Alipay QR code via alipay.trade.precreate API.
 * Returns qrCodeUrl that user scans to pay.
 */
async function generateAlipayQr(orderId, amountCny, subject) {
  const k = loadKeyFile('alipay.json');
  if (!k || !k.appId) return { ok: false, error: 'alipay not configured' };

  // Alipay requires timestamp format "yyyy-MM-dd HH:mm:ss" in GMT+8
  const nowCn = new Date(Date.now() + 8 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${nowCn.getUTCFullYear()}-${pad(nowCn.getUTCMonth() + 1)}-${pad(nowCn.getUTCDate())} ${pad(nowCn.getUTCHours())}:${pad(nowCn.getUTCMinutes())}:${pad(nowCn.getUTCSeconds())}`;
  const charset = 'UTF-8';
  const bizContent = JSON.stringify({
    out_trade_no: orderId,
    total_amount: String(amountCny),
    subject: subject || 'AutoTasker Hub API调用',
  });

  // Build signed params (alphabetical order)
  const params = {
    app_id: k.appId,
    method: 'alipay.trade.precreate',
    charset,
    sign_type: k.signType || 'RSA2',
    timestamp,
    version: '1.0',
    biz_content: bizContent,
  };
  const sortedKeys = Object.keys(params).sort();
  let signStr = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
  // Sign with app private key
  const privateKey = k.appPrivateKey;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signStr, 'utf8');
  const sign = signer.sign(privateKey, 'base64');
  params.sign = sign;

  // Build query string
  const queryString = sortedKeys.map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
  const gatewayUrl = (k.gateway || 'https://openapi.alipay.com/gateway.do') + '?' + queryString;

  try {
    const resp = await httpPostJson(gatewayUrl, {});
    if (resp.status !== 200) return { ok: false, error: `alipay API ${resp.status}`, raw: resp.raw };
    const rsp = resp.body;
    const respKey = 'alipay_trade_precreate_response';
    const inner = rsp[respKey] || {};
    if (inner.code !== '10000') {
      return {
        ok: false,
        error: inner.msg || 'alipay precreate failed',
        code: inner.code,
        subMsg: inner.sub_msg || null,
        raw: JSON.stringify(rsp).slice(0, 400),
      };
    }
    return {
      ok: true,
      orderId,
      amountCny,
      qrCode: inner.qr_code,              // QR code URL to display
      qrCodeUrl: inner.qr_code,           // same — scan with Alipay app
      outTradeNo: inner.out_trade_no,
      tradeNo: inner.trade_no,            // Alipay transaction ID (if immediately assigned)
      note: '扫码 ¥' + amountCny + ' CNY 完成支付',
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── WeChat Pay v3 ─────────────────────────────────────────────────────────────
function getWechatPayStatus() {
  // Try both possible filenames
  const k = loadKeyFile('wxpay/wxpay.json') || loadKeyFile('wecom.json');
  if (!k || !k.mchid || !k.apiV3Key) return { enabled: false, note: 'wxpay.json missing mchid/apiV3Key — configure from pay.weixin.qq.com' };
  return {
    enabled: true,
    mchid: k.mchid,
    appid: k.appid,
    serialNo: k.serialNo,
    apiVersion: 'v3',
    supportedCurrencies: ['CNY'],
    minAmount: '¥0.01',
  };
}

/**
 * Create WeChat Pay v3 native order → returns prepay_id + QR code URL.
 * Uses APIv3 certificate-based authentication (mch private key signs request).
 */
async function generateWechatPay(orderId, amountYuan, description) {
  const k = loadKeyFile('wxpay/wxpay.json') || loadKeyFile('wecom.json');
  if (!k || !k.mchid || !k.apiV3Key) return { ok: false, error: 'wechat pay not configured' };

  const now = Math.floor(Date.now() / 1000);
  const url = 'https://api.mch.weixin.qq.com/v3/pay/transactions/native';

  // Build request body
  const body = {
    appid: k.appid || k.mchid,
    mchid: k.mchid,
    description: description || 'AutoTasker Hub API调用',
    out_trade_no: orderId,
    amount: { total: Math.round(amountYuan * 100), currency: 'CNY' }, // amount in fen
    notify_url: 'https://autotasker.highkingflower.com/api/pay/wechat/notify',
  };

  // WeChat v3 auth: Authorization: WECHATPAY2-SHA256-RSA2048 serial="...",nonce="...",timestamp="...",signature="..."
  const nonce = crypto.randomBytes(16).toString('hex');
  const message = `POST\n${new URL(url).pathname}\n${now}\n${nonce}\n${JSON.stringify(body)}\n`;

  // Sign with merchant private key. privateKeyPath in config may be absolute or
  // relative to KEYS_DIR; strip redundant "config/keys/" prefix if present.
  let privKeyPath = k.privateKeyPath;
  if (!path.isAbsolute(privKeyPath)) {
    // Relative: resolve against KEYS_DIR, not ROOT
    const stripped = privKeyPath.replace(/^config[\/\\]keys[\/\\]/, '');
    privKeyPath = path.join(KEYS_DIR, stripped);
  }
  const privPem = fs.readFileSync(privKeyPath, 'utf8');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  const signature = signer.sign(privPem, 'base64');

  const authHeader = `WECHATPAY2-SHA256-RSA2048 mchid="${k.mchid}",nonce_str="${nonce}",timestamp="${now}",serial_no="${k.serialNo.toUpperCase()}",signature="${signature}"`;

  try {
    const resp = await httpPostJson(url, body, {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'AutoTasker-Hub/1.0',
    });
    if (resp.status === 200 && resp.body && resp.body.prepay_id) {
      // Generate QR code URL from prepay_id
      const qrUrl = `weixin://wxpay/bizpayurl?sr=${Buffer.from(resp.body.prepay_id).toString('base64')}`;
      return {
        ok: true,
        orderId,
        amountYuan,
        prepayId: resp.body.prepay_id,
        qrCodeUrl: qrUrl,
        codeUrl: resp.body.code_url,     // direct QR code URL for native payment
        note: '扫码 ¥' + amountYuan + ' CNY 完成支付',
      };
    }
    return { ok: false, error: `wechat API ${resp.status}`, detail: resp.raw?.slice(0, 200) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Stripe (placeholder — no keys provided) ───────────────────────────────────
function getStripeStatus() {
  const k = loadKeyFile('stripe.json');
  if (!k) return { enabled: false, note: 'Missing config/keys/stripe.json' };
  return { enabled: true, publicKey: (k.publishable_key || '').slice(0, 8) + '…' };
}

function createStripePaymentLink(amountUsd, description) {
  const k = loadKeyFile('stripe.json');
  if (!k) return { ok: false, error: 'stripe not configured' };
  return { ok: false, error: 'Stripe requires live API key — add config/keys/stripe.json' };
}

// ── Cashback Partners ─────────────────────────────────────────────────────────
const CASHBACK_PARTNERS = [
  { id: 'amazon', name: 'Amazon', rateBps: 200, region: 'US', apiReady: false },
  { id: 'taobao', name: '淘宝', rateBps: 500, region: 'CN', apiReady: false },
  { id: 'jd', name: '京东', rateBps: 300, region: 'CN', apiReady: false },
];
function getCashbackPartners() {
  return CASHBACK_PARTNERS.map(p => ({ ...p, status: p.apiReady ? 'live' : 'coming-soon' }));
}
function trackCashback(orderId, partnerId, amountUsd, wallet) {
  const partner = CASHBACK_PARTNERS.find(p => p.id === partnerId);
  if (!partner) return { ok: false, reason: 'unknown partner' };
  const rebateUsd = (amountUsd * partner.rateBps / 10000).toFixed(6);
  return { ok: true, partnerId, amountUsd, rebateUsd, wallet: wallet?.slice(0, 10) + '…' || null };
}

module.exports = {
  // Status
  getAlipayStatus, getWechatPayStatus, getStripeStatus, getCashbackPartners,
  // Generation
  generateAlipayQr, generateWechatPay, createStripePaymentLink,
  // Tracking
  trackCashback,
  // Helpers
  loadKeyFile, hasKey,
  KEYS_DIR,
};
