# 资金统一与分配（单一金库 0xb9A9…4773C）

> 生成时间：2026-11-13
> 政策文件：`config/treasury-policy.json`（唯一权威）
> 分配器：`scripts/treasury-allocate.js`
> 收益率实测：`scripts/yield-scan.js` → `data/yield-candidates.json`

---

## 1. 结论先说

| 项目 | 状态 |
|---|---|
| 单一金库 | `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`（Base / USDC） |
| 该地址当前 USDC | **$0.00**（实测，`eth_call balanceOf`） |
| 真实可分配收入 | **$0.00** — 全部收入还在旧地址上，需人工扫款 |
| 分配比例 | 30% 储蓄 / 60% 复利 / 10% 稳定盘 |
| 分配门槛 | 可分配额 ≥ $10.00 才出手（低于此手续费吃掉全部收益） |
| 私钥位置 | 用户外部持有，不在任何仓库/服务器文件中 |
| 支付宝直连 USDC | **不存在合规通道**，见 §6 |

分配器当前输出（真实运行结果，不是示意）：

```
on-chain USDC        $0.00
realized external    $10.83   (2 payments)
house self-pay       $81.03   (excluded from revenue)
allocatable capital  $0.00
BLOCKED: allocatable $0.00 is below the $10.00 floor
```

**卡点不是代码，是钱不在金库里。** 见 §5 的三步人工动作。

---

## 2. 旧地址清单（待扫入金库）

| 地址 | 角色 | 余额 | 私钥 | 动作 |
|---|---|---|---|---|
| `0x367F…1a03` | 平台热钱包 / AgentWorld payTo | **$35.24 USDC + 0.058 ETH** | 待你确认 | 全部扫入金库，然后从所有配置里删除 |
| `0x6350…dc38` | ERC-8004 agent "GENESIS" 身份钱包 | **$120.20 USDC** | 待你确认 | USDC 扫入金库；NFT 身份保留（不影响收款） |
| `0xFC24…eBB3` | legacy 收款 | **$8.30 USDC** | 待你确认 | 扫入金库后废弃 |
| `0x74a9…5cf5d8` | house relayer（自付测试） | 仅留 gas | 待你确认 | 不作为收入地址，不扫 |

合计可归集：**约 $163.74 USDC + 0.058 ETH**。

> 这 $163.74 是**历史沉淀**，不是新收入。对外报收入时永远不包含它。

### 为什么必须扫
一个产品一个 `payTo`。旧地址继续挂着 = 三处口径矛盾 + 四份余额分散 + 无法统一分配。扫完之后：
- 所有接口 `PAY_TO` 只有 `0xb9A9…4773C`
- 余额只在一处，分配器可算
- 对账只看一个地址的链上流水

---

## 3. 30 / 60 / 10 怎么落地

| 桶 | 比例 | 去处 | 风险预算 |
|---|---|---|---|
| `savings` 储蓄 | 30% | 金库内独立子账，**不进任何合约** | 0 |
| `compound` 复利 | 60% | Base 上单币稳定币借贷池（白名单见下） | 中：合约风险 + 利率浮动 |
| `stable` 稳定盘 | 10% | 金库内留存 USDC，随时可动 | 0 |

硬约束（写进 policy，分配器强制读）：
- 只对 `external` 收入分配，`house_self_pay` 永久单列、永不并入
- 单池不超过复利仓位的 40%
- 只允许 `exposure: single` + `stablecoin: true`
- 禁止杠杆、禁止锁仓/定期、禁止 HFT、禁止任何"承诺收益"
- 每 7 天复核一次利率

### 复利白名单
- `aave-v3` — Base 最大借贷市场，USDC 单币，可随时取
- `morpho-blue` — curated vault，单币 USDC
- `compound-v3` — 老牌借贷
- `moonwell` — Base 原生借贷

### 实测收益率（2026-11-13T14:03Z 抓取 DefiLlama）

筛选：Base · USDC · 单币 · TVL ≥ $5M · APY ≥ 5%

| APY | 基础 | 奖励 | TVL | 项目 | 说明 |
|---|---|---|---|---|---|
| 27.89% | 27.89% | — | $9.6M | veranta | TVL 偏小、利率不可持续，**不选** |
| 9.00% | 7.00% | 2.00% | $10.5M | zerobase-cedefi | CeDeFi 托管方风险，观察 |
| 7.48% | 7.48% | — | $104.1M | midas-rwa | RWA，含发行方风险 |
| **6.71%** | 4.01% | 2.70% | $26.0M | **morpho-blue ETHENAUSDC** | 分配器默认选它（白名单内最高） |
| 6.07% | 4.67% | 1.40% | $35.1M | morpho-blue CSCBUSDC | 奖励占比高 |
| 5.76% | 5.76% | — | $14.9M | aave-v3 | 最稳，纯基础利率 |
| 5.61% | 3.34% | 2.28% | $458.1M | morpho-blue SIRLOINUSDC | 深度最好 |
| 5.41% | 5.41% | — | $22.8M | centrifuge-protocol | RWA |
| 5.11% | 5.11% | — | $25.4M | morpho-blue BBQUSDC | — |

**5% 目标可达**，但注意：
- 表里带"奖励"的部分是**代币排放**，不是现金，币价跌了就没了。只看"基础"列，稳定在 4.0–5.8%。
- 上述 APY 是**当下快照**，会变，可以变成 0。每周重跑 `node scripts/yield-scan.js` 即可刷新。
- 本金约 $155 时，5% 年化 ≈ **$7.75/年**。这是真实量级，不要指望它改变现金流。

---

## 4. 为什么否决"高频交易提高复利"

已明确写进 policy：`forbidHft: true`。理由是可算的，不是道德判断：

1. **本金太小**。$155 本金，即使做到年化 30%，也是 $46/年。而 Base 上一笔 swap 的 gas + 滑点约 $0.01–0.05，一天 100 笔就是 $1–5/天 = $365–1825/年成本，**成本是收益目标的 8–40 倍**。
2. **期望值为负**。高频方向性交易在无信息优势前提下，扣掉点差与 gas 后期望收益为负。这不是"能不能赚"，是"数学上必然亏"。
3. **对手是专业做市商**。Base 上的 USDC 交易对点差被 MEV 机器人压到极限，散户高频是给它们送钱。
4. **与"复利"定义冲突**。复利要求本金不回撤；高频带来回撤。二者不能同时成立。

替代方案（已在做）：**把精力放在提高 external 收入笔数上**，那才是真正的"复利本金来源"。详见 §7。

---

## 5. 你需要手动做的三步（私钥在你这，我签不了）

### 第 1 步：扫款（一次性）
对 `0x367F…1a03`、`0x6350…dc38`、`0xFC24…eBB3` 三个地址，各发一笔 USDC 转账到：

```
0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C
```

注意事项：
- 先在 Base 上确认地址，**不要从交易历史里复制地址**（有零值转账投毒 `0x20667d…c865`）
- 三个地址都要留一点 ETH 付 gas（`0x6350`、`0xFC24` 上如果没有 ETH，先各打 0.0005 ETH）
- 转完把三笔 txHash 发我，我写进 `data/revenue-ledger.json` 的 `internalTransfer` 类（**不算收入**）

### 第 2 步：确认金库私钥可用
用你的钱包对金库地址做一次签名测试（签个空消息即可），确认能控制它。之后所有分配动作都由你签。

### 第 3 步：跑一次分配器
```bash
node scripts/treasury-allocate.js
```
它会打印：
- 链上真实余额
- 30/60/10 各自的目标额与需要移动的差额
- 复利桶应该进哪个池（含当前实测 APY）

确认无误后，你自己执行转账 / 入池，然后把 txHash 回填：
```bash
node scripts/treasury-allocate.js --record compound 93.00 0xTXHASH
```

---

## 6. 支付宝：现实与合规路径

### 硬事实
中国大陆**没有**合规的 USDC → 支付宝直连通道。任何声称能直连的，本质是地下钱庄/对敲：
- 违反《外汇管理条例》与反洗钱规定
- 对方资金来源不明 → 你的卡会被冻结
- 金额一大就是刑事案件

**所以"这个钱包接入支付宝变现"这句话，技术上做不到合规版。** 我给你三条真能走的路：

### 路径 1（推荐）：卖产品收人民币
让客户用支付宝/微信商户号**直接付人民币**买数据，USDC 完全不落地。
- 优点：最干净，零合规风险，到账即用
- 做法：金库地址只用于链上收入；人民币收入走独立商户号，两边各自记账
- 这条路径**今天就能开**，见 §7

### 路径 2：境外持牌交易所出金
USDC → 交易所（Coinbase / Kraken / OKX 海外主体）→ 法币 → 境外银行账户 → 合规结汇 → 支付宝
- 需要：境外银行账户 + 年度 5 万美元结汇额度
- 适合：金额较大时

### 路径 3：香港持牌平台
HashKey / OSL 合规出金至香港账户
- 需要：香港账户
- 适合：有香港主体时

### 三条铁律（写进 policy）
1. 不对个人支付宝账户做 USDC 兑换
2. 不接受第三方代付/代收
3. 每笔留完整链上 + 银行凭证备查

---

## 7. 让链路真正产生收入的下一步（这才是重点）

当前 external 收入 $10.83，266 笔，平均 **$0.041/笔**。要让它长起来，只有三条路：

1. **提高单价**：`full` 数据集 $0.50/笔，卖 20 笔 = $10。比卖 244 笔 $0.05 的热榜更划算。
2. **提高被发现率**：进 x402 Bazaar / facilitator 的目录。目前 facilitator 生态只有 2 家 partner（`agentworld`、`Tate Programs`），`autotasker` 在 facilitator 上 **0 条 endpoint** —— 这就是为什么没人买。已发信 `shawn@x402-agent-pay.com`（flat fee $0.02/tx），等回复。
3. **人民币直销**：路径 1。数据是真的（`data/packs/live.json` 是当日真实抓取），可以直接卖给做舆情/选题的团队。

---

## 8. 数据真实性声明

对外只报这一个数：

```
external_usdc = $10.829
```

来源：facilitator 公开计数 `x402-agent-pay.com/api/settlement-pulse`，external 桶 266 笔，生命周期累计。
**这是上限值**，不是逐笔对账结果（该聚合数无法逐笔拆解）。

不得作为收入的数字：
- `$91.002` — 含 125 笔 `house_e2e`（自己付给自己）$80.173
- `$103.926` — 同上，口径重叠
- `$224.70` — `data/payments/ledger.json` 旧声称值，**已确认伪造**，归档为 `ledger.fabricated-20261113.json`

30 天入账逐笔指纹（`data/inflow-classification.json`）：
- REAL_X402：26 笔 / $0.097
- SELF_DEX_SALE：13 笔 / $0.852183（自家代币卖出，非外部收入）
- ZERO_VALUE：1 笔（投毒探测）

---

## 9. 文件索引

| 文件 | 作用 |
|---|---|
| `config/treasury-policy.json` | 政策：地址、比例、白名单、禁令 |
| `data/revenue-ledger.json` | 账本：external / house_self_pay 分列 |
| `data/treasury-allocation.json` | 分配器输出的当前计划 |
| `data/treasury-state.json` | 各桶已执行金额（`--record` 写入） |
| `data/yield-candidates.json` | 实测收益率快照 |
| `scripts/treasury-allocate.js` | 分配计划器（只读链上，不签名） |
| `scripts/yield-scan.js` | 收益率扫描 |
| `docs/MONEY-FLOW-CLOSED-LOOP.md` | 四地址角色与流向 |
| `docs/FACILITATOR-REVENUE-TRUTH.md` | facilitator 真实收入与三处口径矛盾 |
