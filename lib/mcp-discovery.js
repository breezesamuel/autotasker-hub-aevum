/**
 * mcp-discovery.js — MCP Protocol Discovery Document
 *
 * 标准路径: GET /.well-known/mcp.json
 *
 * 让 Claude Desktop / Cursor / Windsurf / Continue 等编辑器自动发现
 * 并注册我们的 MCP server。
 *
 * 协议规范参考: https://modelcontextprotocol.io/specification/2024-11-05/basic/discovery
 */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const TREASURY = '0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';
const NETWORK = 'eip155:8453';
const ASSET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const FACILITATOR = 'https://facilitator.payai.network';

// 从 payments.js 读取价格配置（如果可用）
let PRICE_MAP = {};
try {
  const pay = require('./payments');
  const summary = pay.getSummary();
  PRICE_MAP = { usd: 0.05, atomic: 50000 }; // default fallback
} catch (e) {}

const TOOLS = [
  {
    name: 'get_hotlist',
    description: 'Get trending posts from Chinese social media platforms (Weibo, Zhihu, Douban, Bilibili, Tieba)',
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string',
          enum: ['weiboHot', 'zhihu', 'douban', 'bilibili', 'tieba'],
          description: 'Which board to query. Default: weiboHot',
          default: 'weiboHot',
        },
        limit: {
          type: 'integer',
          description: 'Number of items to return (max 20)',
          default: 10,
          minimum: 1,
          maximum: 20,
        },
      },
      required: ['board'],
    },
    price: { usd: 0.05, atomic: 50000, asset: ASSET, network: NETWORK, payTo: TREASURY },
    tags: ['trending', 'china', 'social-media', 'hot-list'],
  },
  {
    name: 'search_chinese_social',
    description: 'Search across Chinese social media platforms for keywords, topics, or events',
    inputSchema: {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description: 'Search query (Chinese or English keywords)',
        },
        limit: {
          type: 'integer',
          description: 'Max results (1-20)',
          default: 10,
        },
      },
      required: ['q'],
    },
    price: { usd: 0.05, atomic: 50000, asset: ASSET, network: NETWORK, payTo: TREASURY },
    tags: ['search', 'keyword', 'china', 'social-media'],
  },
  {
    name: 'export_full_dataset',
    description: 'Export the complete current dataset with all fields and metadata',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    price: { usd: 0.50, atomic: 500000, asset: ASSET, network: NETWORK, payTo: TREASURY },
    tags: ['export', 'dataset', 'full', 'batch'],
  },
];

// Utility tools (dynamically loaded if available)
try {
  const utils = require('./utils-tools');
  for (const tool of (utils.UTIL_TOOLS || []).slice(0, 20)) {
    TOOLS.push({
      name: tool.name,
      description: tool.description || `Utility tool: ${tool.name}`,
      inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      price: { usd: 0.01, atomic: 10000, asset: ASSET, network: NETWORK, payTo: TREASURY },
      tags: ['utility', 'tool'],
    });
  }
} catch (e) { /* utils not available */ }

function buildDiscoveryDoc(host) {
  return {
    // MCP protocol version
    schema_version: '2024-11-05',
    // Server metadata
    server: {
      name: 'AutoTasker Hub',
      version: '5.0.0',
      description: 'Real-time Chinese social media trending data API with x402 USDC settlement on Base mainnet.',
      icon: 'https://autotasker.highkingflower.com/favicon.ico',
      author: 'AutoTasker Team',
      url: `https://${host}`,
    },
    // How to connect (for IDEs/editors)
    transport: {
      type: 'http',
      endpoint: `https://${host}/mcp`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
    },
    // Payment configuration (x402)
    payment: {
      protocol: 'x402-v2',
      network: NETWORK,
      networkName: 'Base',
      asset: ASSET,
      payTo: TREASURY,
      facilitator: FACILITATOR,
      minAtomic: 10000, // $0.01
      verifyUrl: `https://basescan.org/address/${TREASURY}`,
    },
    // Available tools
    tools: TOOLS,
    // Free endpoints (no payment required)
    freeEndpoints: [
      'GET /api/status',
      'GET /api/x402/sample',
      'GET /api/x402/summary',
      'POST /mcp (initialize, tools/list)',
      'GET /.well-known/mcp.json',
      'GET /.well-known/x402',
      'GET /api/x402/proof',
      'GET /trust',
      'GET /faq',
    ],
    // Paid endpoints summary
    pricing: {
      hotlist: '$0.05 USD',
      search: '$0.05 USD',
      fullExport: '$0.50 USD',
      utilities: '$0.01 USD each',
    },
    // Trust & verification
    trust: {
      treasuryAddress: TREASURY,
      basescan: `https://basescan.org/address/${TREASURY}`,
      proofApi: `https://${host}/api/x402/proof`,
      reconcileApi: `https://${host}/api/x402/reconcile`,
      referralProgram: { rebateBps: 1000, minPayoutUsd: 1 },
    },
    // Documentation links
    docs: {
      llmsTxt: `https://${host}/llms.txt`,
      offer: `https://${host}/offer.html`,
      trust: `https://${host}/trust`,
      faq: `https://${host}/faq`,
      metrics: `https://${host}/api/metrics`,
    },
    // Rate limits (transparent)
    limits: {
      referrerCreationPerHourPerIp: 5,
      supportTicketsPerHourPerIp: 5,
      apiCallsPerMinutePerWallet: 'unlimited (pay-per-use)',
    },
    // Policy highlights
    policies: {
      noHft: true,
      inboundOnly: true,
      zeroInflation: true,
      treasunityDirectPay: true,
      auditInvariant: 'ledger.settledCount <= on-chain.inboundCount',
    },
  };
}

module.exports = { buildDiscoveryDoc, TOOLS };
