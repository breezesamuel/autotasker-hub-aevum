# 资金闭环图：谁的钱、谁在转、转给谁

**日期**: 2026-11-13
**状态**: 已闭合 —— 无第三方，无窃取，无分成协议在跑

---

## 一、四个地址的真实角色

| 地址 | 角色 | nonce | 余额 (2026-11-13) |
|------|------|-------|-------------------|
| `0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03` | **AgentWorld 平台热钱包**（`agentworld.me` 全部 x402 付费接口的 `payTo`）+ 个人 Base 主钱包 + cron 代币自卖 | 77,610 | $35.24 USDC / 0.058 ETH |
| `0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38` | **GENESIS agent 钱包** —— 自建 ERC-8004 agent 身份（NFT #84829），声明服务 the402.ai / agentworld.me | 4 | $120.20 USDC / 0.000415 ETH |
| `0x74a9f91763c28571af7a52987f425f62825cf5d8` | house / relayer 签名钥，不用于收款 | — | ~0 |
| `0xFC24FD34da9e49A0110DCaEe3Ad30eC54175eBB3` | 旧版 revenue 地址，已废弃 | 0 | $8.30 USDC |

平台归属已由站主确认：`agentworld.me` 为本人运营。因此平台热钱包 = 本人钱包，法律与链上均无第三方主体。

---

## 二、资金流

```
外部 agent ──x402 (USDC on Base)──▶ 0x367F
                                      │  平台收入
                                      │
                                      ├── 2026-11 近 7 笔，共 $2.0139 ──▶ 0x6350 (GENESIS agent)
                                      │
                                      └── 2026-05~06 早期 ──▶ 0x80b9…c1b49a
                                                              0x5b56…496f0
                                                              0x44b1…aa18
                                                              0x6e00…b04c
                                                              池 0x24235fa9…8242
```

以及 0x367F 的另一条独立出账（非客户付款、非工资）：

```
0x367F ──▶ router 0x4752ba5d…ad24 ──▶ 池 0x24235fa9…8242
           每约 5 天一次，卖出代币 0xfa6071375b2bc079bf781d51906beee0b6f53b0b
```

**结论**：所有出账均由 0x367F 私钥持有者签名，即本人。不存在「钱被转给陌生地址」的情形。

### 反向核对：0x6350 的全部入金来源

`scripts/deep-identify-recipient.js` 扫描 0x6350 全史入金，去重后仅 4 个来源：

| 来源 | 金额 | 占比 |
|------|------|------|
| `0x367F1b3D…1a03`（平台热钱包） | $112.478590 | **98.9%** |
| `0x26572ff23c6c52bfb1a69cb0c9114a8be443b422` | $1.000000 | 0.9% |
| `0x788b4ca11950879550353d8ae82d1c0af6018454` | $0.010000 | 0.01% |
| `0x6350761d…dc38`（自转，粉尘） | $0.010000 | — |

即：**0x6350 的钱 98.9% 来自你自己的 0x367F**，剩余 $1.01 为外部零星入金，
不构成任何持续性外部收入，也不存在第三个主体在给它打钱。

---

## 三、为什么之前查不清

### 1. 收入不可归因（根因）

AutoTasker Hub 与 AgentWorld 的 `payTo` **同为 `0x367F`**：

| 产品 | payTo | 证据 |
|------|-------|------|
| AgentWorld | `0x367F…1a03` | `GET https://agentworld.me/api/agentworld/agents/ranked` → 402 响应 `payTo` |
| AutoTasker Hub | `0x367F…1a03` | `lib/x402-v4.js` 默认值 / Vercel 未设 `PAY_TO` |

链上只能看到「有 USDC 进入 0x367F」，无法区分买家买的是哪个产品的哪个接口。
这正是 `data/payments/ledger.json` 声称 $224.70 而链上只有 $0.097 的原因：
账本是按「希望发生的收入」写的，不是按「可归因的链上事件」写的。
（该账本已归档为 `ledger.fabricated-20261113.json`。）

### 2. 一个钱包承担 4 种职能

`0x367F` 同时是：平台营收地址 + 个人储蓄 + 代币自卖机器人账户 + 对外付薪账户。
任何外部审计都必然得出「混乱」的结论。

---

## 四、处置建议（按优先级）

### P0 — 一个产品一个收款地址，不可再用共享 payTo

| 产品 | 收款地址 | 状态 |
|------|----------|------|
| AutoTasker Hub | `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`（新建专用，私钥在 `config/keys/pay-to-new.json`） | 待写入 Vercel `PAY_TO` |
| AgentWorld | `0x367F…1a03`（暂留） | 建议后续迁到独立地址 |
| GENESIS agent | `0x6350…dc38` | 保持，已是 agent 运营钱包 |

**不要把 AutoTasker 的 `PAY_TO` 设成 `0x6350…`** —— 那是 GENESIS agent 的运营钱包，
混进去等于重复第一类错误。

### P1 — 从 `0x367F` 拆出平台营收

平台热钱包不应同时装个人资金。建议新建 `agentworld-treasury` 专用地址，
把 `payTo` 迁过去，`0x367F` 退回为个人钱包。

### P2 — the402.ai 关停（硬期限）

the402.ai 首页公告：**2026-11-21 关闭**，要求用户在此之前从 Settings 导出数据、
把 USDC 从 the402 钱包转出。GENESIS 的 agent card 里挂着 `https://the402.ai/v1/services`，
需确认该账号下是否还有余额与数据要取。

---

## 五、复现

```powershell
cd F:\2026\第二次点子\repos\autotasker-hub-aevum
node scripts\verify-recipient-facts.js      # 0x6350 的 nonce / 余额 / 是否合约
node scripts\decode-agent-card.js           # 从注册交易 calldata 解出 agent card
node scripts\resolve-registry-impl.js       # ERC-8004 代理 0x8004a169… → 实现 0x7274e874…
node scripts\fast-probe-outflows.js         # 已知块直接证明出账目的地
node scripts\balance-history.js             # 400 天余额跳变
```

一键验证 AgentWorld 的 payTo：

```powershell
curl.exe -s https://agentworld.me/api/agentworld/agents/ranked | Select-String payTo
```

---

*相关文档：`docs/AGENT-IDENTITY-8004-FINDING.md`（0x6350 的链上自证）、
`docs/REVENUE-TRUTH.md`（收入真相）、`docs/FINAL-OUTFLOW-AUDIT.md`（出账明细）。
`docs/FINAL-RECIPIENT-VERDICT.md` 与 `docs/PAYTO-SWITCH-PLAN.md` 含未经链上验证的叙述，已作废。*
