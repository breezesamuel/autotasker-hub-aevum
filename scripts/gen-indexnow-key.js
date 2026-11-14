/** gen-indexnow-key.js — 生成 IndexNow key（密钥本身是公开的，规范要求放在 /<key>.txt） */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const KEY_FILE = path.join(ROOT, 'config', 'indexnow.json');
let key = null;
try { key = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')).key; } catch (e) {}
if (!key || !/^[a-f0-9]{16,128}$/i.test(key)) {
  key = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(KEY_FILE, JSON.stringify({ key, note: 'IndexNow key — public by design, served at /<key>.txt' }, null, 2));
}
fs.writeFileSync(path.join(ROOT, 'public', key + '.txt'), key);
console.log('indexnow key:', key, '(file public/' + key + '.txt)');
