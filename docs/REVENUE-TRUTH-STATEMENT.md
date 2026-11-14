# AutoTasker Hub 收入真实性说明（Revenue Truth Statement）

**版本**: 2026-11-14
**服务**: https://autotasker.highkingflower.com （x402-v5, Base 主网）
**金库**: `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`（单一收款地址）

---

## 1. 我们对外报告的唯一收入数字

```
真实外部收入（external_usdc）= $10.829 USDC（266 笔外部买家结算）
```

- 来源：x402-agent-pay.com facilitator 的 `settlement-pulse` / `recent-settlements` 端点
- 定义：**非自有钱包**付款、经 facilitator 在 Base 主网验证并上链的 USDC 结算
- 校验：`node scripts/check-facilitator-consistency.js`（INV-1a/1b 保证 external + house_e2e = 终身总计）

## 2. 明确排除的数字（禁止对外引用）

| 数字 | 是什么 | 为什么不算收入 |
|------|--------|---------------|
| $80.173 / 125 笔（house_e2e_usdc） | 自有 settler 钱包的 e2e 检查与种子交易 | 自己付给自己 |
| $91.002（usdc_lifetime） | external + house_e2e 合计 | 含自付 |
| $103.931 / 1911 笔（demand 汇总） | 48h 轮转窗口内 facilitator 全部产品的结算 | 混杂其他产品与自付，口径不同 |
| `$224.70`、`ledger.fabricated-20261113.json` | 已归档的伪造账本 | 作废，仅存档备查 |

## 3. 链上证据

- 最近一笔外部结算（2026-11-13 07:08 UTC）:
  https://basescan.org/tx/0x443794b413a864569a9be77f882ed7a96025ecc1ad968ffc4253b25ac4833794
- facilitator 公开数据: https://x402-agent-pay.com/facilitator/settlement-pulse
- 一致性校验报告: `docs/FACILITATOR-CONSISTENCY-SPEC.md`（10 pass / 1 warn / 0 fail）

## 4. 付费链路（v5, 2026-11-14 上线）

```
买家（AI agent）
  → GET https://autotasker.highkingflower.com/api/x402/hotlist   （402 + x402 accepts）
  → 签名 EIP-3009 授权（from=买家, to=金库, amount=价格）
  → 带 PAYMENT-SIGNATURE 重放
  → 服务端 @x402/express paymentMiddleware + PayAI facilitator
      verify（验签/额度/余额） → settle（链上 transferWithAuthorization）
  → 返回数据 + PAYMENT-RESPONSE（txHash 可在 basescan 核验）
```

- REST 路由（73 条）与 MCP 工具（74 个）均走完整 verify→settle；
- MCP 伪造 header 会被 facilitator 拒绝（实测：假 payload → 402 verification failed）；
- 无 RELAYER 私钥在服务器上，买家自广播或 facilitator 代广播，资金直达金库。

## 5. 金库与扫款（进行中）

| 地址 | USDC | 状态 |
|------|------|------|
| `0xb9A9…4773C` 金库 | $0.00 | 等待扫款 |
| `0x367F…1a03` | $33.42 + 0.058 ETH | 待扫入金库（用户持钥） |
| `0x6350…dc38` | $121.37 | 待扫入金库（用户持钥） |
| `0xFC24…eBB3` | $8.30 | 待扫入金库（用户持钥） |

扫款入账用 `node scripts/treasury-allocate.js --record <bucket> <amount> <txHash>` 记录（internalTransfer，不算收入）。扫款完成后按 30/60/10（储蓄/复利/稳定盘）分配，复利白名单：aave-v3、morpho-blue、compound-v3、moonwell。

## 6. 结论

- 截至本说明发布，AutoTasker Hub 的**真实、链上可验证的外部收入为 $10.829 USDC**。
- 除此之外的任何数字（含历史 $91/$103/$224）均不代表本项目收入。
- 本说明引用的每个数字都能通过上述脚本与链上链接独立复核。
