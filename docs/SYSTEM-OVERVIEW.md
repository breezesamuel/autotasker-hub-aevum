# AutoTasker Hub — Aevum Entry 完整架构

## 已完成的模块

```
repos/autotasker-hub-aevum/
├── api/
│   ├── agents-v2.js       ✅ Agent注册 + 推荐码自动生成
│   ├── payments.js        ✅ 支付记录 + 佣金计算（90/10拆分）
│   ├── payments-api.js    ✅ 批量结算端点 /batch /settled
│   ├── wallet.js          ✅ 资金池总览 API
│   ├── dashboard.js       ✅ 公开统计面板
│   ├── middleware.js      ✅ 限流 + 配额管理
│   ├── x402-standalone.js ✅ 自包含的x402 paywall handler
│   └── index.js           ✅ 主路由调度器
├── sdk/index.ts           ✅ TypeScript SDK（agent调用接口）
├── examples/query.mjs     ✅ 示例脚本
├── scripts/e2e-test.js    ✅ 端到端测试（通过）
├── config/keys/x402-wallet.json ✅ 收款钱包配置
├── data/packs/            ✅ 数据快照
└── docs/
    ├── COMMISSION-DESIGN.md ✅ 佣金机制详解
    └── ARCHITECTURE.md      ✅ 缩放策略
```

## 核心链路（端到端）

```
用户打开 https://autotasker-hub.vercel.app/api/agents/register
    ↓ POST { name, wallet, referral_code }
生成唯一 referralCode (如 AT-UYX452LC)
存入 data/agents.json
    ↓
新用户用 referralCode 注册 → 关联到推荐人 agentId
    ↓
新用户首次调用 API → x402 paywall 拦截 (402)
    ↓ 用户付 $0.05 USDC via AgentPay
收到 200 + PAYMENT-RESPONSE header (含 txHash)
    ↓ payments.js 自动拆分:
        90% ($0.045) → House revenue pool
        10% ($0.005) → Referrer pending balance
    ↓ 每笔记录写入 data/payments/ledger.json
    ↓ 当 referrer pending ≥ $0.05
POST /api/payments/batch → AgentPay /facilitator/payees/net
    ↓ 链上确认 txHash
POST /api/payments/settled → 标记为已结算
```

## 真实数字预测

| 场景 | Agents | Daily Calls | Monthly Revenue | Our Cut |
|---|---|---|---|---|
| Aevum 参赛 Demo | 50 | 500 | $75 | **$67.50** |
| Discord 社区推广 | 500 | 5,000 | $750 | **$675** |
| Pana 集成落地 | 2,000 | 50,000 | $7,500 | **$6,750** |
| 目标 10K 活跃 | 10,000 | 500,000 | $75,000 | **$67,500** |

**每月推荐 payout**: 10% = $7,500/mo @ 10K agents  
→ 这些钱自动进推荐人的 AgentPay 净额批次，无需人工干预
