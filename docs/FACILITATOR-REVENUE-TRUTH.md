# Facilitator 收入真相：x402-agent-pay.com

**日期**: 2026-11-13
**数据来源**: 本域公开 JSON 端点，可随时复现
**用途**: 判断「真实链上可验证收入」到底是多少

---

## 一、聚合口径（`/facilitator/settlement-pulse`）

```json
{
  "settled_lifetime": 391,
  "usdc_lifetime": 91.002,
  "external_settled": 266,   "external_usdc": 10.829,
  "house_e2e_settled": 125,  "house_e2e_usdc": 80.173,
  "settled_24h": 1,
  "source": "on-chain x402 USDC settlements on Base L2 settled by this facilitator",
  "privacy": "aggregate counts only ... house_e2e = settlements from our own settler wallet (e2e checks and seeds), external = all other payers"
}
```

| 指标 | 数值 |
|------|------|
| 生命周期总结算 | 391 笔 / **$91.002** |
| 其中自家 settler 铺量（house_e2e） | 125 笔 / $80.173（**88.1%**） |
| 其中外部真实付款 | 266 笔 / **$10.829** |
| 最近 24h | 1 笔 |
| 最近成交距今 | 362 分钟（空转 6 小时） |

**对外可引用的外部真实收入只有 $10.83，不是 $91，更不是 $103.9。**

---

## 二、按主机归因（`/facilitator/demand`，211 endpoints）

| host | 收入 | 结算数 | endpoint | 未支付 402 |
|------|------|--------|----------|-----------|
| agentpaystore.com | $89.853 | 309 | 39 | 12,923 |
| agentworld.me | $11.021 | 1,473 | 35 | 0 |
| (无 host) | $1.908 | 40 | 122 | 25,527 |
| x402-agent-pay.com | $0.664 | 18 | 9 | 2,828 |
| gibbr.app | $0.198 | 50 | 3 | 0 |
| aiarena.lol | $0.160 | 8 | 1 | 0 |
| siexchange.lol | $0.120 | 6 | 1 | 0 |
| solvscore.com | $0.002 | 2 | 1 | 0 |
| **autotasker-hub（任何域名）** | **不在索引内** | — | **0** | — |
| 合计 | $103.926 | 1,906 | 211 | 41,278 |

### 关键判断

1. **AutoTasker Hub 在本 facilitator 的归因里完全不存在。**
   211 条 endpoint 中无一条属于它。此前统计的「26 笔 / $0.097 真实 x402 收入（打入 0x367F）」，
   在 facilitator 侧找不到对应归因，来源需重新认定，不能算作 AutoTasker 的收入。

2. **agentpaystore.com 的 $89.85 是历史存量，不是活水。**
   其收入前三条 endpoint：
   | endpoint | 收入 | 最后付款 |
   |---|---|---|
   | `/agentic-arena/aiarena/api/ads/activate/30d` | $40.00 | 50.3 天前 |
   | `/agentic-arena/aiarena/api/ads/activate/7d` | $12.00 | 49.5 天前 |
   | `/agentic-arena/aiarena/api/tournament/entry` | $10.00 | 52.5 天前 |
   近两个月无新成交。

3. **唯一还算活的是 agentworld.me**，但它是自有产品，且 1,473 笔结算合计仅 $11.02
   （均价 $0.0075），属自家 agent 生态内部循环，不能作为「外部市场验证」。

4. **转化率极低。** 全站 41,278 次 402 challenge，1,906 次成交 ≈ 4.6%；
   其中 agentpaystore 的 feeds / trek 两条 endpoint 分别 1,073 / 910 次 402 才成交 63 / 62 笔。

5. **119 条 endpoint 收入为 0。**

---

## 三、必须先修的三个口径问题

### 1. 隐私声明与实现冲突

- `/facilitator/recent-settlements`：`"privacy": "tx hash, timestamp, amount only - payer and resource stay private"`
- `/facilitator/demand`：逐条公开 `host`、`path`、`revenue_usdc`、`payments_settled`

后者已经公开了「resource + 精确金额」。要么改声明，要么把 demand 的金额做桶化（`<$1` / `$1–10` / …）。
hackathon 评委或合作方对照两端点即可发现矛盾。

### 2. 总量对不上

`settled_lifetime = 391 笔 / $91.002`，而 `demand` 汇总 = 1,906 笔 / $103.926。
差 4.9 倍笔数、$12.9 金额。两者很可能口径不同（链上结算 vs 记账请求），
但没有任何字段说明差异，必须在对外的任何材料里先统一定义。

### 3. 「收入」不能混入 house_e2e

$80.17 自家铺量必须单列。对外只报 `external_usdc`。
否则与已归档的伪造账本 `ledger.fabricated-20261113.json`（声称 $224.70）属同一类错误。

---

## 四、复现

```powershell
curl.exe -s https://x402-agent-pay.com/facilitator/settlement-pulse
curl.exe -s https://x402-agent-pay.com/facilitator/demand
curl.exe -s https://x402-agent-pay.com/facilitator/recent-settlements
curl.exe -s https://x402-agent-pay.com/api/agentpay/ecosystem
curl.exe -s https://x402-agent-pay.com/.well-known/x402
```

生态伙伴（`/api/agentpay/ecosystem`）当前仅 2 家：`agentworld`、`Tate Programs`。
AutoTasker 的 partner id `autotaskerpublicdata` 未出现在该列表。

---

*相关：`docs/MONEY-FLOW-CLOSED-LOOP.md`、`docs/AGENT-IDENTITY-8004-FINDING.md`、
`docs/REVENUE-TRUTH.md`*
