/**
 * Configure payment keys from user-provided RSA certificate files.
 * Keys are raw base64 — must wrap in PEM headers for Node.js crypto.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function b64toPem(b64, type) {
  // type: 'public' | 'private' | 'cert'
  const lines = b64.trim().match(/.{1,64}/g).join('\n');
  const header = type === 'public'    ? '-----BEGIN PUBLIC KEY-----'
               : type === 'private'  ? '-----BEGIN PRIVATE KEY-----'
               : type === 'cert'     ? '-----BEGIN CERTIFICATE-----'
               : '-----BEGIN PUBLIC KEY-----';
  const footer = header.replace('BEGIN', 'END');
  return `${header}\n${lines}\n${footer}`;
}
function fp(s) { return crypto.createHash('md5').update(s).digest('hex').slice(0, 8); }

// ── Read raw base64 keys ──────────────────────────────────────────────────────
const base = 'C:/Users/Think/Documents/支付宝开放平台密钥工具/密钥20261015165203';
const wxBase = 'C:/Users/Think/Documents/支付宝开放平台密钥工具/微信密钥';

const rawAppPub    = fs.readFileSync(base + '/应用公钥RSA2048.txt',       'utf8').trim();
const rawAppPriv   = fs.readFileSync(base + '/应用私钥RSA2048-敏感数据，请妥善保管.txt', 'utf8').trim();
const rawAlipayPub = fs.readFileSync(base + '/支付宝公钥.txt',            'utf8').trim();

const rawWxCert    = fs.readFileSync(wxBase + '/1751774473_20261018_cert/apiclient_cert.pem',  'utf8').trim();
const rawWxKey     = fs.readFileSync(wxBase + '/1751774473_20261018_cert/apiclient_key.pem',   'utf8').trim();
const rawWxPub     = fs.readFileSync(wxBase + '/pub_key (2).pem', 'utf8').trim();

// ── Alipay config ─────────────────────────────────────────────────────────────
const ALIPAY_PATH = 'config/keys/alipay.json';
let alipay = {};
try { alipay = JSON.parse(fs.readFileSync(ALIPAY_PATH, 'utf8')); } catch (_) {}

alipay.version = 2;
alipay.storedAt = new Date().toISOString();
alipay.gateway = 'https://openapi.alipay.com/gateway.do';
alipay.signType = 'RSA2';
alipay.appId = alipay.appId || '2021001192614567'; // placeholder — verify on dashboard
// Store as PEM-wrapped (Node.js crypto requires PEM)
alipay.appPublicKey   = b64toPem(rawAppPub,    'public');
alipay.appPrivateKey  = b64toPem(rawAppPriv,   'private');
alipay.alipayPublicKey = b64toPem(rawAlipayPub, 'public');
alipay.fingerprints = {
  appPublic:   fp(alipay.appPublicKey),
  appPrivate:  fp(alipay.appPrivateKey),
  alipayPublic: fp(alipay.alipayPublicKey),
};

// Verify keys parse correctly
try {
  crypto.createPublicKey(alipay.appPublicKey);
  crypto.createPrivateKey(alipay.appPrivateKey);
  crypto.createPublicKey(alipay.alipayPublicKey);
  console.log('[alipay] ✓ All 3 keys parse successfully');
} catch (e) {
  console.error('[alipay] ✗ Key validation failed:', e.message.slice(0, 100));
  process.exit(1);
}

console.log('[alipay] appId =', alipay.appId, '(verify at https://open.alipay.com → API Gateway)');
fs.writeFileSync(ALIPAY_PATH, JSON.stringify(alipay, null, 2), 'utf8');

// ── WeChat config ─────────────────────────────────────────────────────────────
const WX_PATH = 'config/keys/wxpay/wxpay.json';
let wx = {};
try { wx = JSON.parse(fs.readFileSync(WX_PATH, 'utf8')); } catch (_) {}

wx.version = 2;
wx.storedAt = new Date().toISOString();
wx.mchid = '1751774473';
wx.appid = '1751774473';           // Same as mchid per key file
wx.apiV3Key = 'Lxybingdashan2002133742youwin001';
wx.apiV2Key = 'Lxybingdashan2002133742youwin002';
wx.serialNo = '3B41B3F156F4A6F6EF761F96B894189158F8115B'.toLowerCase();
wx.certNotBefore = '2026-10-15T23:55:50Z';
wx.certNotAfter = '2031-10-14T23:55:50Z';
wx.certExpiresInDays = 1795;
wx.privateKeyPath = 'config/keys/wxpay/apiclient_key.pem';
wx.certPath = 'config/keys/wxpay/apiclient_cert.pem';
wx.platformPublicKeyPath = 'config/keys/wxpay/wechat-pay-public.pem';
wx.fingerprints = {
  cert:      fp(rawWxCert),
  privateKey: fp(rawWxKey),
  apiV3Key:  fp(wx.apiV3Key),
  platformPublic: fp(rawWxPub),
};

// Verify WeChat keys parse
try {
  crypto.createPrivateKey(rawWxKey);
  crypto.createPublicKey(rawWxCert);
  console.log('[wxpay] ✓ Cert and key parse successfully');
} catch (e) {
  console.error('[wxpay] ✗ Key validation failed:', e.message.slice(0, 100));
  process.exit(1);
}

fs.writeFileSync(WX_PATH, JSON.stringify(wx, null, 2), 'utf8');
console.log('[wxpay] mchid=', wx.mchid, 'appid=', wx.appid);
console.log('\n✓ Both payment configs updated successfully');
