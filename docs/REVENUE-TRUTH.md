# 收入真相对账表 (REVENUE TRUTH)

生成时间：2026-11-13
审计脚本：`scripts/ledger-truth.js` · `scripts/audit-payments.js` · `scripts/trace-inflows.js` · `scripts/self-settle-e2e.js`

这份文件回答一个问题：**钱到底有没有真的到账？**

---

## 1. 结论先说

| 项目 | 数字 | 状态 |
|---|---|---|
| 本地记账声称的收入 | **$224.70**（1315 笔） | ❌ 全部不可验证 |
| 链上真实存在的 tx | **0 / 1315** | ❌ 账本里有未来日期（到 2026-11-18） |
| 过去 30 天全部入账 | $0.949183（40 笔） | ✅ 真实存在链上 |
| ↳ 其中**真实 x402 客户付款** | **$0.097**（26 笔，EIP-3009 实锤） | ✅ 这才是真收入 |
| ↳ 其中自家 DEX 卖币 | $0.852183（13 笔，金库自己签的 swap） | ⚠️ 不是收入 |
| ↳ 零值转账（地址投毒） | 1 笔 $0 | 🚫 垃圾，勿复制其地址 |
| 金库当前余额（Base 主网） | **35.555125 USDC + 0.058 ETH** | ✅ 可动用（随流出在减少） |
| 订阅墙佣金账目 | $202.23 声称 / **$0 可验证** | ❌ 和主账本同源，同样不可信 |

**一句话**：`data/payments/ledger.json` 是模拟数据，不要拿它对外报收入。
真实 x402 收入是 30 天 $0.097（26 笔，平均 $0.0037/笔，约每天 1 单）。
链上余额 $35.55 是真实的、可动用的，但它混着个人交易资金且正以 ~$0.5/天 流出（见 §4.4）。

---

## 2. 为什么会这样（根因）

1. `lib/x402-v4.js` 的 `accepts` 全部指向 **Base Sepolia（eip155:84532）** 和 **Solana Devnet**。
   测试网 USDC 价值为 0，所以"成交"再多也不产生收入。
2. 结算依赖 `https://x402.org/facilitator`，而该服务**只支持测试网**
   （`GET /facilitator/supported` 返回 `network: eip155:84532`）。
3. Coinbase 的主网 facilitator `api.cdp.coinbase.com` 从本网络**完全不可达**（`fetch failed`，
   与 Solana 主网 RPC 一起超时）。所以主网结算从来没有通过过。
4. 账本写入点没有校验 `txHash`，于是产生了 1315 条"看起来成功"的假记录。

网络探测结果（`scripts/net-probe.js`）：

```
200  Base mainnet RPC        {"result":"0x2105"}        ✅
200  Base Sepolia RPC        {"result":"0x14a34"}       ✅
ERR  CDP x402 facilitator    fetch failed               ❌
200  x402.org facilitator    network: eip155:84532      ⚠️ 仅测试网
ERR  Solana mainnet RPC      fetch failed               ❌
```

---

## 3. 已经修好的部分（本次改动）

### 3.1 换成真钱轨道

`accepts` 现在只给一条：**Base 主网 `eip155:8453` + 真 USDC
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` + payTo = 金库**。
测试网只有在 `X402_ALLOW_TESTNET=1` 时才作为第二个 accept 出现。

### 3.2 自己当 facilitator（`lib/settle-self.js`）

x402 的 `exact` EVM 方案本质就是 EIP-3009 `transferWithAuthorization`，不需要任何第三方：

1. 付款方用 EIP-712 签 `from/to/value/validAfter/validBefore/nonce`
2. 我们本地验签（`verifyPayload`）
3. 广播上链（`settle`，中继钱包只出 gas）

**资金流是 payer → payTo 直达**，`to` 写在签名里，中继方无法改道。
自测（`node lib/settle-self.js --self-test`）：两条链验签通过，
错 payTo / 少付 / 过期 / 篡改 **全部拒绝**。

### 3.3 双结算模式（关键：不依赖任何私钥也能收款）

| 模式 | 谁广播 | 需要私钥 |
|---|---|---|
| `relayer-eip3009` | 我们（`RELAYER_PRIVATE_KEY`） | 需要一把有 Base ETH 的 key |
| `payer-broadcast` | 付款方自己广播，把 `txHash` 给我们 | **不需要任何私钥** |

第二种模式让"100% 到账"在还没有中继私钥时就成立：
我们读交易回执，校验 `status=1`、USDC 合约、`Transfer` 到 payTo、金额 ≥ 价格、有确认数，
并做 txHash 重放保护。

对真实链上付款的验证（`node scripts/self-settle-e2e.js`）：**20/20 通过**，
包括"把价格提高 1 个最小单位就必须拒绝"和"换 payTo 必须拒绝"。

### 3.4 付费墙漏洞已修

REST 中间件原先用 `req.path` 判断（在 `app.use('/api/x402', ...)` 里它是相对路径），
导致 `/api/x402/util/baidu_hot` **免费返回数据**。已改为 `req.baseUrl + req.path`。
`node scripts/verify-v5.js`：**15/15 通过**，其中包含"伪造签名不得返回数据"和"未知 txHash 不得返回数据"。

### 3.5 记账只在链上确认后写入

`settlePayment()` 先广播/验回执，成功后才调用 `recordPayment()` 并带上真实 `txHash`。
`settledBy` 标记为 `self-relayer:base` 或 `payer-broadcast`，可反查。

---

## 4. 链上取证：这些钱到底是什么

### 4.1 取证方法

金额形态分类会误判，必须看**交易指纹**：

- `scripts/probe-tx.js <txhash>` — 看 tx.from、调用合约、input 选择子、全部 log；
- `scripts/trace-jump.js <block>` — 对某个余额跳变块，一次性 eth_getLogs 拉出
  USDC/USDT 与金库相关的转账（付款人/收款人/金额/tx）；
- `scripts/balance-history.js [days]` — 用归档节点的 `balanceOf` 二分搜索，
  把 400 天的余额变动还原成精确到块的跳变时间线；
- `scripts/classify-inflows.js` — 对每笔入账读 tx 指纹，按 EIP-3009 / 自卖出 /
  其他 分类汇总。

### 4.2 实锤：真实 x402 客户付款存在

2026-11-13 10:22:38 UTC 的一笔 $0.001 入账，交易 `0xb56876c6…3d667`：

```
tx.from      0xe72f0af4cf41356d433723547f1412ca27fbb1b8   <- 第三方中继（付 gas）
tx.to        USDC 合约
input 首字节  0xe3ee160e                                   <- transferWithAuthorization
log          AuthorizationUsed(owner, nonce)              <- EIP-3009 防重放事件
log          Transfer(0x47e5499c…0b4 -> 0x367F…1a03)      <- 付款人 -> 我们的金库
```

这是 x402 `exact` 方案的标准链上指纹：付款人签 EIP-712 授权、中继代为广播、
钱从付款人直达 payTo。**lib/settle-self.js 支持的正是这条路径** ——
真实生态里已经有 agent 用这条路径给我们付过钱（付款人/中继各不相同）。

### 4.3 重要修正：$0.05–0.08 的"入账"不是客户

逐笔验尸发现，30 天里那些"每 5–10 天一笔、金额带零头"的 $0.05–0.08 入账
（来源 `0x24235fa9…8242`）实际是：

```
tx.from = 金库自己（0x367F…1a03）
tx.to   = 0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24（DEX 路由，swapExactTokensForTokens）
log     Transfer(金库 -> 池) 106448000000000000 个 18 位小数代币   <- 卖出
log     Transfer(池 -> 金库) 0.052033 USDC                        <- 得到
log     Swap / Sync 事件（V2 池特征）
```

即**金库自己在 DEX 上按 AMM 报价卖某个代币**（`0xfa607137…`，无 name/symbol 元数据）。
这个卖币行为从 2026 年 6 月起就在跑（`+$1.15`、`+$0.11` 等大额同类入账都来自该池），
时间戳都落在 `:00:07/:00:09/:00:13` —— 是**定时任务**，不是客户付款。

`scripts/classify-inflows.js` 对 30 天全部 40 笔入账逐笔鉴定的最终结果：

| 分类 | 笔数 | 金额 | 判定依据 |
|---|---|---|---|
| REAL_X402 | **26** | **$0.097** | `transferWithAuthorization`（0xe3ee160e）+ `AuthorizationUsed` 事件 |
| SELF_DEX_SALE | 13 | $0.852183 | tx.from = 金库，目标是 DEX 路由/池 |
| ZERO_VALUE | 1 | $0 | 零值转账（地址投毒指纹） |

26 笔真实付款里有 $0.05、$0.01 的单，付款人与中继地址各不相同 ——
是真实的分布式 agent 流量（约每天 1 单），不是我们自己刷的。
完整明细在 `data/inflow-classification.json`。

### 4.4 400 天全景：这个"金库"其实是个活跃的个人钱包

`node scripts/balance-history.js 400`（结果在 `data/treasury-history-400d.json`）：

| 时期 | 状态 |
|---|---|
| 2026-04 起 | 余额从 0 开始出现，5 月一度到 $38–65 |
| 2026-06–07 | 峰值约 **$110**，同时持续小额流出 |
| 2026-08–10 | 在 $60–108 间大幅波动（大量粗采样未覆盖的进出） |
| 2026-11-07 | 一天内有 +$0.10，11-09 起加速流出 |
| 现在 | **$35.55 USDC + 0.058 ETH** |

三个持续模式（都说明这是个人/机器人钱包，不是纯净收入池）：

1. **~12 小时一次的定值流出**：$0.2–0.5 → 固定地址 `0x6350761d…dc38`（EOA，已累计 119.69 USDC）。
   最近 5 天就有 7 笔：0.2346 / 0.2858 / 0.5000 / 0.3069 / 0.2703 / 0.2129 / 0.2034。
2. **~5 天一次的定时卖币**（见 4.3）。
3. **零值转账骚扰**：`0x20667da7…c865` 曾发 0 金额 USDC 转账（地址投毒/垃圾营销指纹）；
   该地址此前还给过我们 +$0.10。**复制地址时务必从文档/配置复制，不要从交易历史复制。**

### 4.5 ⚠️ 流出的钥匙不在工作区（需要你确认）

- 本工作区**没有**金库私钥：`config/keys/x402-wallet.json`（根目录与仓库内各一份）
  里的 key 经 `scripts/derive-addr.js` 验证只对应 house（`0x74a9…5d8`，空钱包）；
  其余 key 文件（testnet-actors / qday / superteam）也都不对应金库。
- 接收流出地址 `0x6350761d…` 在全工作区 grep 不到。

请确认：这些 ~12 小时一次的流出和今天的 0.2034 是不是你本人（或你自己的另一个钱包/订阅）。
**如果不是**：立即把金库私钥视为泄露 —— 新建钱包、转移剩余资产、更新 `PAY_TO`，
并排查谁接触过这把私钥。

---

## 5. 还差什么才能真正赚钱

按重要性排序，前两项是硬阻塞：

| # | 事项 | 谁做 | 为什么 |
|---|---|---|---|
| 1 | `npx vercel --prod` 重新部署 | **你** | 本次改动还没上线；线上仍是测试网 + 坏掉的付费墙 |
| 2 | 配 `RELAYER_PRIVATE_KEY`（金库有 0.058 ETH 够 gas） | **你** | 打开 `relayer-eip3009` 模式，付款方零 gas 体验 |
| 3 | 域名 + `PUBLIC_URL` | 你 | `llms.txt` / `openapi.json` 里的链接要是绝对地址 |
| 4 | 提交 x402 目录 | 半自动 | `node scripts/gh-submit-listings.js --check` 然后 `--submit` |
| 5 | 真实企业线索 | 你导出 | 见 `scripts/outreach-pipeline.js`，只收公开企业邮箱 |

### 关于"全网找游离的虚拟货币"

这一项**不做**，原因不是能力问题：

- 扫描/领取他人钱包里的资产属于盗窃，在几乎所有司法辖区都是刑事犯罪；
- 会导致 Coinbase / Vercel / GitHub 账号被永久封禁，金库里的钱也会被冻结；
- 真正"无人认领"的资产只有两种合法来源：项目方官方空投（需满足条件）、
  以及你自己地址上被遗忘的余额（即金库这 35.76 USDC）。

合法的等价动作已经做了：把金库余额核实清楚、确认可动用、并把收款路径修到 100% 到账。

### 关于"24 小时不停群发邮件/电话"

也不做。批量抓取个人邮箱/手机并群发违反 CAN-SPAM、GDPR/PECR、PIPL，
域名会被拉黑，收款通道会被支付商关掉——等于把刚修好的收入管道砸了。

替代方案已交付：`scripts/outreach-pipeline.js`
（企业邮箱校验 / 来源与合法性依据 / 去重 / 永久退订 / 人工逐条审批 / 每日 20 封上限 /
同域名每周 1 封 / 真实邮寄地址与 List-Unsubscribe 头）。

---

## 6. 旧账本已归档

`data/payments/ledger.json`（1315 条假记录）已重命名为
`data/payments/ledger.fabricated-20261113.json`，保留作证据，**不再作为收入来源**。
新的 `ledger.json` 从 0 开始，`getSummary()` 现在返回 `totalCalls: 0`，这是真话。

另外 `lib/payments.js` 已改为可写目录回退（Vercel 上写到 `/tmp`），
避免因为只读文件系统导致"链上已到账但接口报错"。

## 7. 复现命令

```bash
node scripts/ledger-truth.js          # 账本 vs 链上余额（10 秒）
node scripts/audit-payments.js --json # 逐笔核验 1315 个 txHash
node scripts/trace-inflows.js 30      # 真实入账扫描
node scripts/self-settle-e2e.js       # 对真实付款验证结算引擎
node lib/settle-self.js --self-test   # EIP-712 验签正反用例
node lib/x402-v4.js                   # 本地起服务（PORT=3077）
node scripts/verify-v5.js             # 15 项付费墙断言
node scripts/outreach-pipeline.js stats
```
