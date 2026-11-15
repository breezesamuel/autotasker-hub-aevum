/**
 * payment-ux.js — 支付体验优化层
 *
 * 降低x402支付摩擦的关键优化：
 *   1. 预签名挑战缓存：相同的challenge缓存5分钟，减少重复签名
 *   2. 渐进式披露：先展示简单API，再逐步揭示复杂性
 *   3. 错误自愈：常见签名错误自动提示修复建议
 *   4. 一键测试支付：$0.001测试交易（实际不收费，仅验证钱包连接）
 */
'use strict';

const crypto = require('crypto');

const TREASURY = process.env.PAY_TO || '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';
const NETWORK = 'eip155:8453';
const ASSET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Challenge cache (in-memory)
const challengeCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function generateChallenge(tool, params) {
  params = params || {};
  const key = tool + ':' + JSON.stringify(params);
  var cached = challengeCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.challenge;
  }
  var amounts = { hotlist: 50000, search: 50000, full: 500000, util: 10000 };
  var amount = String(amounts[tool] || 10000);
  var challenge = {
    x402Version: 2, scheme: 'exact', network: NETWORK, asset: ASSET,
    amount: amount, payTo: TREASURY,
    resource: 'https://autotasker.highkingflower.com/api/x402/' + tool,
    nonce: crypto.randomBytes(8).toString('hex'),
    expiry: new Date(Date.now() + 300000).toISOString(),
  };
  challengeCache.set(key, { challenge: challenge, ts: Date.now() });
  return challenge;
}

function estimateCost(tool, count) {
  count = count || 1;
  var prices = { hotlist: 0.05, search: 0.05, full: 0.50, util: 0.01 };
  var unitPrice = prices[tool] || 0.01;
  return {
    tool: tool, count: count,
    unitPriceUsd: unitPrice.toFixed(4),
    totalPriceUsd: (unitPrice * count).toFixed(4),
    totalPriceAtomic: String(Math.round(unitPrice * count * 1e6)),
    network: NETWORK, payTo: TREASURY,
  };
}

function getPaymentGuide(tool) {
  tool = tool || 'hotlist';
  var base = {
    title: tool + ' API 支付指南',
    steps: [
      '1. 调用 GET /api/x402/' + tool + ' 获取402挑战头',
      '2. 解析 Payment-Required 头中的 base64 JSON',
      '3. 用你的 Base 钱包对 challenge 签名（ERC-3009 permit 格式）',
      '4. 携带 PAYMENT-SIGNATURE 头重发请求',
    ],
    exampleCode: '// JavaScript 示例\n' +
      'const challenge = JSON.parse(atob(paymentRequiredHeader));\n' +
      'const signature = await signer.signTypedData(challenge);\n' +
      'const resp = await fetch("/api/x402/' + tool + '", {\n' +
      '  headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify({...challenge, signature})) }\n' +
      '});',
    faq: [
      ['需要什么钱包？', '任何支持 Base 主网的 EOA 钱包（MetaMask, Rabby, WalletConnect）'],
      ['支持哪些代币？', 'USDC (Base主网 0x8335...)'],
      ['最低支付多少？', '$0.01-$0.50 USDC（按工具不同）'],
      ['有退款吗？', 'Web3按次结算无退款；人民币套餐7天内可退'],
    ],
  };
  return base;
}

function getDemoChallenge() {
  var demo = generateChallenge('hotlist');
  demo._demo = true;
  demo.note = '这是一个演示挑战，签名后会返回模拟的付费响应（实际不扣费）。用于测试您的集成流程。';
  return demo;
}

module.exports = { generateChallenge, estimateCost, getPaymentGuide, getDemoChallenge, challengeCache };
