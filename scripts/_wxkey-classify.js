/**
 * wxkey-classify.js — classify 密钥.txt WITHOUT printing its content.
 * Compares normalized DER fingerprints against the known files and detects
 * PEM block type. Prints only structure + fingerprints.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(process.env.USERPROFILE || '', 'Documents', '支付宝开放平台密钥工具', '微信密钥');

function derFp(txt) {
  const b64 = String(txt).replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '');
  const der = Buffer.from(b64, 'base64');
  return { len: der.length, fp: crypto.createHash('sha256').update(der).digest('hex').slice(0, 16), b64 };
}
function headers(txt) {
  return (String(txt).match(/-----BEGIN [^-]+-----/g) || []).map((h) => h.slice(11, -6));
}
function tryParse(b64) {
  const kinds = [];
  const pem = (type) => `-----BEGIN ${type}-----\n${b64.replace(/(.{64})/g, '$1\n').trim()}\n-----END ${type}-----\n`;
  for (const t of ['PRIVATE KEY', 'RSA PRIVATE KEY', 'PUBLIC KEY', 'RSA PUBLIC KEY', 'CERTIFICATE']) {
    try { crypto.createPublicKey(pem(t)); kinds.push('public-key-as-' + t); } catch (e) {}
    try { crypto.createPrivateKey(pem(t)); kinds.push('private-key-as-' + t); } catch (e) {}
  }
  return kinds;
}

const raw = fs.readFileSync(path.join(SRC, '密钥.txt'), 'utf8');
const cls = derFp(raw);
console.log('密钥.txt           headers:', JSON.stringify(headers(raw)), 'DER len:', cls.len, 'fp:', cls.fp, 'kinds:', tryParse(cls.b64).join(',') || 'none');

const apik = fs.readFileSync(path.join(SRC, '1751774473_20261018_cert', 'apiclient_key.pem'), 'utf8');
const a = derFp(apik);
console.log('apiclient_key.pem  headers:', JSON.stringify(headers(apik)), 'DER len:', a.len, 'fp:', a.fp);

const pub = fs.readFileSync(path.join(SRC, 'pub_key (2).pem'), 'utf8');
const p = derFp(pub);
console.log('pub_key(2).pem     headers:', JSON.stringify(headers(pub)), 'DER len:', p.len, 'fp:', p.fp);

console.log('密钥.txt == apiclient_key?', cls.fp === a.fp, '| == pub_key?', cls.fp === p.fp);
