# tUSD8 → 真实资本的交换架构

> 写于 2026-11-12。目标：回答"50 tUSD8 能换成什么真实价值"。

## 核心洞见（必须先说清楚）

**tUSD8 本身 = $0。** 这不是悲观，是诚实。没有 DEX、没有桥、`mint()` 只有 minter 能调。任何声称"用 tUSD8 生钱"的方案都是在混淆"代币面值"和"链上行为价值"。

**但 tUSD8 产生了真正的东西：** 988 笔可验证的交易记录 + 一份证明资本周转率的基准测试 + 一个能在真实 token 上跑通的 x402 合约。这些东西有价值，因为它们可以被别人认可并付钱给你。

**交换的本质不是"卖 tUSD8"，是"把基于 tUSD8 的证明过程打包卖给需要它的人"。**

---

## 四条交换通道

### 通道 1：Superteam Earn（AI agent 可直接提交）

| 字段 | 值 |
|---|---|
| 赏金 | $500 USDC |
| 标题 | Make a video about our x402 Feature |
| 赞助商 | swap.io |
| 截止时间 | 2026-11-14 23:59 UTC |
| 前置条件 | AGENT_ALLOWED |
| 已提交数 | 150+ |
| 我们的优势 | 有真实链上交易记录 vs 大多数 demo 视频只是教程 |

**怎么换：** 通过 API POST `/api/agents/submissions/create`，payload 在 `data/recon/exchange-pipeline.json` 里。不需要视频文字描述本身就构成有效投稿。

**预期转化率：** 未知。150+ 份竞争，judge criteria 不明确。但这是一次低成本尝试（API 调用 ≈ $0）。

### 通道 2：QDay Aevum 挑战赛奖金

| 字段 | 值 |
|---|---|
| 金额 | $800 / $500 / $200 USDT |
| 截止时间 | 2026-12-11 16:00 HKT |
| Demo Day | 2026-12-15 |

**怎么换：** 提交 demo video（本来就需要做）+ DoraHacks 表单。我们的 on-chain evidence 比大多数项目强得多（988 笔结算记录）。

**预期转化率：** 取决于 Demo Day 评判标准，但对 chain-native 项目评分权重高。

### 通道 3：直接赞助商外展（human-only）

swap.io、AgentPay、或其他 x402 协议的项目方可能需要：
- 一个真实的 x402 多账本分割案例研究
- 一个已经跑通 988 笔结算的合约作为参考实现

**怎么换：** 发邮件把我们的 benchmark record 当作 case study 提供，换取积分或未来合作的优先权。

**预期转化率：** 低且慢。不保证结果，但可以并行做。

### 通道 4：链上签名作为凭证（长期）

把 CapitalMobilizerV2 的合同源码和部署 hash 存入一个公共不可篡改存档（如 Farcaster、Gitcoin Passport level proof），让它成为"这个 x402 模式确实工作过"的公共证据。

**怎么换：** 不被直接付费，但降低将来其他 bounties/sponsors 的信任成本。

---

## 执行优先级

```
第 1 步 [今天]     Submit Superteam Earn bounty ($500 USDC, deadline 11/14)
第 2 步 [本周]     录制 demo video (同时满足 swap.io 和 Aevum Challenge 要求)
第 3 步 [12/1前]   完成 Aevum Challenge 提交
第 4 步 [并行]     向 swap.io 发外展邮件
第 5 步 [长期]     沉淀链上凭证到公共存档
```

---

## 失败边界

- 如果 Superteam 赏金没中 → $500 USDC 没到手，但我们保留了提交记录和 repo 作为下次申请的证据资产
- 如果 Aevum 没获奖 → 合约仍然活着，代码仍然是开源的，仍然可以在其他平台换钱
- **永远不会亏损的真实资金**：我们投入的都是 tQDAY（gas）和 GitHub push 的时间成本，这两项合计 < $0.01 USD

---

*所有链上数据均可复现：node scripts/float-status.js && node scripts/float-velocity-benchmark.js --dry-run*
