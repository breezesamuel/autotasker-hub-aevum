/**
 * key-inventory.js — 安全盘点：哪些钱包密钥在本地？
 *
 * 红线：绝不打印任何私钥/助记词内容；只输出 文件名、字段名、派生地址（地址是公开信息）。
 * 用途：确认 3 个旧钱包（0x367F / 0x6350 / 0xFC24）的私钥是否在本地，能否自动扫款。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = {
  '0x367f1b3d8ca90d1e087481a9a40d585bf3451a03': 'LEGACY_FACILITATOR(平台热钱包) $30.10',
  '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38': 'GENESIS(ERC-8004身份钱包) $124.60',
  '0xfc24fd34da9e49a0110dcaee3ad30ec54175ebb3': 'LEGACY_PAYTO(旧收款) $8.30',
  '0xb9a9e6d9c4ad1635aa685bba2e235a515a94773c': 'TREASURY(金库) $0',
  '0x74a9f91763c28571af7a52987f425f62825cf5d8': 'HOUSE(house relayer)',
};

// viem 在 node_modules（@x402/evm 的传递依赖）
let privateKeyToAccount = null;
try { privateKeyToAccount = require('viem/accounts').privateKeyToAccount; } catch (e) {}

function isPrivish(name) { return /priv|secret|seed|mnemonic|key/i.test(name); }

function scanJson(obj, filePath, hits) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (typeof v === 'string') {
      const hex64 = /^0x[0-9a-fA-F]{64}$/.test(v.trim()) ? v.trim() : (/^[0-9a-fA-F]{64}$/.test(v.trim()) ? '0x' + v.trim() : null);
      if (hex64 && isPrivish(k)) {
        let addr = '(derive-failed)';
        if (privateKeyToAccount) {
          try { addr = privateKeyToAccount(hex64).address; } catch (e) { addr = '(derive-error)'; }
        }
        hits.push({ file: path.relative(ROOT, filePath), field: k, address: addr.toLowerCase(), raw: false });
      } else if (hex64 && !isPrivish(k)) {
        hits.push({ file: path.relative(ROOT, filePath), field: k + ' (64hex,字段名不像私钥)', address: '(未派生)', raw: false });
      } else if (isPrivish(k) && v.length > 8) {
        hits.push({ file: path.relative(ROOT, filePath), field: k, address: `(非hex私钥形态, len=${v.length})`, raw: false });
      }
    } else if (v && typeof v === 'object') {
      scanJson(v, filePath, hits);
    }
  }
}

function walk(dir, hits) {
  for (const f of fs.readdirSync(dir)) {
    if (f === 'node_modules' || f.startsWith('.')) continue;
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, hits);
    else if (/\.json$/i.test(f) && !/package|tsconfig|package-lock/i.test(f)) {
      try { scanJson(JSON.parse(fs.readFileSync(p, 'utf8')), p, hits); } catch (e) {}
    }
  }
}

(async () => {
  const hits = [];
  walk(path.join(ROOT, 'config'), hits);
  walk(path.join(ROOT, 'data'), hits);
  // 根目录孤儿文件
  for (const f of fs.readdirSync(ROOT)) {
    if (!/\.json$/i.test(f) || /package|tsconfig/i.test(f)) continue;
    const p = path.join(ROOT, f);
    try { scanJson(JSON.parse(fs.readFileSync(p, 'utf8')), p, hits); } catch (e) {}
  }

  console.log('=== 本地密钥清单（只显示派生地址） ===');
  const byAddr = {};
  for (const h of hits) {
    console.log(`${h.file}  ::  ${h.field}  →  ${h.address}`);
    if (/^0x[0-9a-f]{40}$/.test(h.address)) (byAddr[h.address] = byAddr[h.address] || []).push(h);
  }

  console.log('\n=== 与目标钱包的匹配 ===');
  let found = 0;
  for (const [addr, label] of Object.entries(TARGETS)) {
    const hit = byAddr[addr];
    if (hit) { found++; console.log(`✅ ${addr} (${label}) 有本地私钥 → ${hit.map(h => h.file + '#' + h.field).join(', ')}`); }
    else console.log(`❌ ${addr} (${label}) 本地无私钥`);
  }
  console.log(`\n${found}/5 个目标钱包可本地签名`);
  console.log(found > 0 ? '→ 可自动扫款（见下步）' : '→ 全部需要用户手动操作');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
