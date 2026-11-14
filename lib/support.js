/**
 * support.js — 自助客服引擎 (self-service support)
 *
 * POST /api/support/ticket {contact?, topic, message}
 *   -> ticket stored + keyword-matched FAQ auto-reply (instant, zero human)
 * GET  /api/support/ticket/:id -> status + replies (self-serve loop)
 *
 * Rate limited by the caller (5 tickets / hour / IP). No email sending —
 * contact is optional and only used for a human follow-up if FAQ misses.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'support-tickets.json');
const CAP = 2000;

// Keyword -> canned answer. First match wins. Extend freely.
const FAQ = [
  { kw: ['价格', '多少钱', 'pricing', 'price'], a: '价格：Web3 侧 hotlist/search $0.05、full $0.50、工具 $0.01（USDC on Base，x402 协议）。人民币套餐见落地页（日报 ¥29/月、全量导出 ¥99/次、API 包月 ¥299/月）。' },
  { kw: ['怎么付', '支付', '付款', 'pay', 'alipay', '支付宝', '微信'], a: 'Web3：任意 x402 客户端，USDC (Base) 结算，facilitator 免费代验。人民币：支付宝/微信商户号（开通后扫码即付）。' },
  { kw: ['退款', 'refund'], a: 'Web3 单次调用按次结算、不预充值，无需退款。人民币套餐 7 天内未使用可全额退款。' },
  { kw: ['api', '文档', '接口', 'docs'], a: '接口文档：GET /llms.txt（agent 可读）、GET /.well-known/x402（发现文档）、GET /api/x402/sample?limit=5 免费试用。' },
  { kw: ['mcp', 'claude', 'agent'], a: 'MCP 端点：POST /mcp，先 initialize 再 tools/list。工具：get_hotlist / search_chinese_social / export_full_dataset / sample_free 等。' },
  { kw: ['推荐', '返利', 'referral', 'invite'], a: '推荐返利：被推荐者支付的 10% 作为返利。生成链接 POST /api/ref/new，绑定钱包 POST /api/ref/claim，返利由金库链上直付（≥$1 可提）。' },
  { kw: ['数据', '来源', 'source'], a: '数据来源：微博热搜、豆瓣、知乎、B站、贴吧等中文社媒榜单，定时抓取聚合。' },
  { kw: ['故障', '报错', 'error', '500'], a: '先看 GET /api/status。若正常但调用失败，把请求样例和时间点发到本工单，系统会在下一个工作窗口人工跟进。' },
  { kw: ['更新', '新鲜', '延迟', '多久', 'fresh', 'delay'], a: '数据每 10 分钟聚合刷新一次（页面/接口同步更新）。榜单数据本身来自各平台公开榜单，存在平台侧几分钟到几十分钟的自然延迟。' },
  { kw: ['限频', '配额', '限制', 'rate', 'limit', 'quota'], a: 'Web3 按次结算天然无配额（每笔付 $0.05）。免费接口有轻量限频；推荐码生成 5 个/小时/IP，工单 5 单/小时/IP，防滥用不影响正常调用。' },
  { kw: ['提现', '返利结算', '什么时候', 'payout', 'withdraw'], a: '返利由金库从 Base 主网 USDC 直付到你绑定的钱包地址，累计 ≥$1 即可提，结算后链上 txHash 可查。每笔返利按 FIFO 累计，金库直付不经任何第三方资金池。' },
  { kw: ['验证', '核验', '凭证', 'verify', 'proof', 'tx'], a: '每笔支付都是 Base 主网真实 USDC 转账：GET /api/x402/proof 返回累计结算笔数与 payTo 地址，可到 basescan.org 用该地址核对全部历史入账。' },
  { kw: ['发票', '合同', '对公', 'invoice', 'company'], a: '人民币套餐支持开票与对公合作，提交工单写明「发票/合同」并留联系方式，人工窗口会在 1 个工作日内响应。' },
  { kw: ['注册', '账号', '登录', 'register', 'signup', 'api key'], a: 'Web3 侧无需注册：x402 协议按次结算，无账号无 API key。企业套餐开通后会提供专属访问凭证。' },
];

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    const db = { version: 1, createdAt: new Date().toISOString(), tickets: [] };
    save(db);
    return db;
  }
}
function save(db) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  } catch (e) { console.error('[support] persist failed:', e.message); }
}

function matchFaq(text) {
  const t = String(text || '').toLowerCase();
  for (const f of FAQ) {
    if (f.kw.some((k) => t.includes(k.toLowerCase()))) return f.a;
  }
  return null;
}

function createTicket({ contact, topic, message }, ip) {
  const db = load();
  const id = 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const autoReply = matchFaq((topic || '') + ' ' + (message || ''));
  const t = {
    id,
    at: new Date().toISOString(),
    ipHash: require('./referrals').ipHash(ip),
    contact: String(contact || '').slice(0, 120) || null,
    topic: String(topic || '').slice(0, 80) || 'general',
    message: String(message || '').slice(0, 2000),
    status: autoReply ? 'auto-answered' : 'open',
    replies: autoReply ? [{ at: new Date().toISOString(), by: 'faq-bot', text: autoReply }] : [],
  };
  db.tickets.push(t);
  if (db.tickets.length > CAP) db.tickets.splice(0, db.tickets.length - CAP);
  save(db);
  return { ticket: { id: t.id, status: t.status, replies: t.replies } };
}

function getTicket(id) {
  const db = load();
  const t = db.tickets.find((x) => x.id === id);
  if (!t) return null;
  return { id: t.id, at: t.at, topic: t.topic, status: t.status, replies: t.replies };
}

module.exports = { createTicket, getTicket, matchFaq };
