/**
 * alipay-key-intake.js — 支付宝密钥安全入库（不打印私钥内容）
 *
 * Reads the three files from the Alipay key tool, validates the app key pair
 * by a sign/verify round-trip, and writes config/keys/alipay.json (gitignored).
 *
 * SECURITY:
 *   - app private key is written to config/keys/ only (git-ignored dir)
 *   - this script prints only fingerprints + pass/fail, never key material
 *   - PEM is normalized to PKCS#8 single-line base64 for the runtime signer
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOOL_DIR = path.join(process.env.USERPROFILE || '', 'Documents', '支付宝开放平台密钥工具', '密钥20261015165203');
const FILES = {
  appPublic: path.join(TOOL_DIR, '应用公钥RSA2048.txt'),
  appPrivate: path.join(TOOL_DIR, '应用私钥RSA2048-敏感数据，请妥善保管.txt'),
  alipayPublic: path.join(TOOL_DIR, '支付宝公钥.txt'),
};

function readB64(p) {
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '').trim();
  const der = Buffer.from(s, 'base64');
  return { b64: s, der, bytes: der.length };
}
function fp(der) {
  return crypto.createHash('sha256').update(der).digest('hex').slice(0, 16);
}

try {
  const appPub = readB64(FILES.appPublic);
  const appPriv = readB64(FILES.appPrivate);
  const aliPub = readB64(FILES.alipayPublic);
  console.log('app public key :', appPub.bytes, 'bytes DER, sha256:', fp(appPub.der));
  console.log('app PRIVATE key:', appPriv.bytes, 'bytes DER, sha256:', fp(appPriv.der), '(content NOT printed)');
  console.log('alipay public  :', aliPub.bytes, 'bytes DER, sha256:', fp(aliPub.der));

  // ── pair validation: sign with private, verify with app public ──
  const privPem = '-----BEGIN PRIVATE KEY-----\n' +
    appPriv.b64.replace(/(.{64})/g, '$1\n').trim() + '\n-----END PRIVATE KEY-----\n';
  const pubPem = '-----BEGIN PUBLIC KEY-----\n' +
    appPub.b64.replace(/(.{64})/g, '$1\n').trim() + '\n-----END PUBLIC KEY-----\n';
  const msg = 'autotasker-alipay-intake-' + Date.now();
  const sig = crypto.createSign('RSA-SHA256').update(msg).sign(privPem);
  const ok = crypto.createVerify('RSA-SHA256').update(msg).verify(pubPem, sig);
  console.log('key pair sign/verify:', ok ? 'PASS (app private <-> app public match)' : 'FAIL — DO NOT USE');

  // ── alipay public key usable? ──
  const aliPem = '-----BEGIN PUBLIC KEY-----\n' +
    aliPub.b64.replace(/(.{64})/g, '$1\n').trim() + '\n-----END PUBLIC KEY-----\n';
  let aliOk = false;
  try { aliOk = !!crypto.createPublicKey(aliPem).asymmetricKeyType; } catch (e) {}
  console.log('alipay public parses as RSA key:', aliOk ? 'PASS' : 'FAIL');

  if (!ok) process.exit(1);

  // ── store (gitignored dir) ──
  const out = {
    version: 1,
    storedAt: new Date().toISOString(),
    gateway: 'https://openapi.alipay.com/gateway.do',
    signType: 'RSA2',
    appId: null, // user must supply from open.alipay.com console
    appPublicKey: appPub.b64,
    appPrivateKey: appPriv.b64,
    alipayPublicKey: aliPub.b64,
    fingerprints: { appPublic: fp(appPub.der), appPrivate: fp(appPriv.der), alipayPublic: fp(aliPub.der) },
  };
  const dest = path.join(__dirname, '..', 'config', 'keys', 'alipay.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log('stored ->', dest, '(git-ignored)');
} catch (e) {
  console.error('INTAKE FAILED:', e.message);
  process.exit(1);
}
