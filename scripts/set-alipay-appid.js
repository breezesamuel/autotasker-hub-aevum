// Update Alipay appId to the real value found in config/app.json, then verify key parse.
const fs = require('fs');
const path = require('path');
const REAL_APP_ID = '2021006197622702';

// 1) local repo copy
const localPath = path.resolve(__dirname, '..', 'config', 'keys', 'alipay.json');
const k = JSON.parse(fs.readFileSync(localPath, 'utf8'));
const before = k.appId;
k.appId = REAL_APP_ID;
k.appIdVerifiedSource = 'F:/2026/第二次点子/config/app.json (user-provided config)';
k.storedAt = new Date().toISOString();
fs.writeFileSync(localPath, JSON.stringify(k, null, 2), 'utf8');
console.log('[local] appId', before, '->', REAL_APP_ID);

// 2) print prod patch command for the server (do not embed key material here)
console.log('[prod] run: node -e "set appId" on server + restart autotasker');
