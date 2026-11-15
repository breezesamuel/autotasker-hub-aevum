/**
 * wxpay-key-intake.js — 微信支付商户证书安全入库（不打印私钥/APIv3密钥内容）
 *
 * Reads the merchant cert bundle + platform public key + API key file,
 * validates the cert/key pair, and stores everything under config/keys/wxpay/
 * (git-ignored). Prints only fingerprints, serials and expiry dates.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(process.env.USERPROFILE || '', 'Documents', '支付宝开放平台密钥工具', '微信密钥');
const CERT_DIR = path.join(SRC, '1751774473_20261018_cert');
const MCHID_FROM_DIR = '1751774473';

function sha(b) { return crypto.createHash('sha256').update(b).digest('hex').slice(0, 16); }

try {
  // ── merchant private key (SENSITIVE — fingerprint only) ──
  const keyPem = fs.readFileSync(path.join(CERT_DIR, 'apiclient_key.pem'));
  const privKey = crypto.createPrivateKey(keyPem);
  console.log('apiclient_key :', privKey.asymmetricKeyType, privKey.asymmetricKeyType === 'rsa' ? privKey.asymmetricDetails?.modulusLength || '' : '', 'fp:' + sha(keyPem), '(content NOT printed)');

  // ── merchant certificate (public — safe to inspect) ──
  const certPem = fs.readFileSync(path.join(CERT_DIR, 'apiclient_cert.pem'));
  const x509 = new crypto.X509Certificate(certPem);
  console.log('apiclient_cert: serial=' + x509.serialNumber.toLowerCase());
  console.log('                subject=' + x509.subject.split('\n').filter((l) => /CN/i.test(l)).join(' '));
  console.log('                valid ' + x509.validFrom.slice(0, 10) + ' -> ' + x509.validTo.slice(0, 10), 'fp:' + sha(certPem));
  const days = Math.floor((new Date(x509.validTo) - new Date(x509.validFrom)) / 86400000);
  const expiresIn = Math.floor((new Date(x509.validTo) - Date.now()) / 86400000);
  console.log('                lifetime ' + days + ' days, expires in ' + expiresIn + ' days');

  // ── cert <-> private key pair check ──
  const certPub = x509.publicKey;
  const msg = 'wxpay-intake-' + Date.now();
  const sig = crypto.createSign('RSA-SHA256').update(msg).sign(privKey);
  const pairOk = crypto.createVerify('RSA-SHA256').update(msg).verify(certPub, sig);
  console.log('cert<->key pair:', pairOk ? 'PASS' : 'FAIL — DO NOT USE');

  // ── WeChat Pay platform public key (used to verify notify signatures) ──
  const pubRaw = fs.readFileSync(path.join(SRC, 'pub_key (2).pem'));
  const payPub = crypto.createPublicKey(pubRaw);
  console.log('wechat pay platform public key:', payPub.asymmetricKeyType, 'fp:' + sha(pubRaw), '(public, safe)');

  // ── API key file (SENSITIVE — classify only) ──
  const keyTxt = fs.readFileSync(path.join(SRC, '密钥.txt'), 'utf8').replace(/\s+/g, '');
  const is32alnum = /^[A-Za-z0-9]{32}$/.test(keyTxt);
  console.log('密钥.txt:', keyTxt.length, 'chars,', is32alnum ? 'matches APIv3 key pattern (32 alnum)' : 'NOT the 32-char APIv3 pattern — verify with user', 'fp:' + sha(Buffer.from(keyTxt)), '(content NOT printed)');

  if (!pairOk) process.exit(1);

  // ── store everything (git-ignored) ──
  const dest = path.join(__dirname, '..', 'config', 'keys', 'wxpay');
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(path.join(CERT_DIR, 'apiclient_key.pem'), path.join(dest, 'apiclient_key.pem'));
  fs.copyFileSync(path.join(CERT_DIR, 'apiclient_cert.pem'), path.join(dest, 'apiclient_cert.pem'));
  fs.copyFileSync(path.join(CERT_DIR, 'apiclient_cert.p12'), path.join(dest, 'apiclient_cert.p12'));
  fs.copyFileSync(path.join(SRC, 'pub_key (2).pem'), path.join(dest, 'wechat-pay-public.pem'));

  const cfg = {
    version: 1,
    storedAt: new Date().toISOString(),
    mchid: MCHID_FROM_DIR,
    appid: null, // user must supply (公众号/小程序/APP appid bound to this mchid)
    apiV3Key: is32alnum ? keyTxt : null,
    serialNo: x509.serialNumber.toLowerCase(),
    certNotBefore: x509.validFrom,
    certNotAfter: x509.validTo,
    certExpiresInDays: expiresIn,
    privateKeyPath: 'config/keys/wxpay/apiclient_key.pem',
    certPath: 'config/keys/wxpay/apiclient_cert.pem',
    platformPublicKeyPath: 'config/keys/wxpay/wechat-pay-public.pem',
    fingerprints: { cert: sha(certPem), privateKey: sha(keyPem), apiV3Key: sha(Buffer.from(keyTxt)), platformPublic: sha(pubRaw) },
  };
  fs.writeFileSync(path.join(dest, 'wxpay.json'), JSON.stringify(cfg, null, 2));
  console.log('stored ->', dest, '(git-ignored)');
} catch (e) {
  console.error('INTAKE FAILED:', e.message);
  process.exit(1);
}
