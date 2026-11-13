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
| 过去 30 天真实入账 | **$0.949183**（40 笔，11 个付款方） | ✅ 真实存在链上 |
| 金库当前余额（Base 主网） | **35.757525 USDC + 0.057962 ETH** | ✅ 可动用，两条独立 RPC 交叉确认 |
| 订阅墙佣金账目 | $202.23 声称 / **$0 可验证** | ❌ 和主账本同源，同样不可信 |

**一句话**：`data/payments/ledger.json` 是模拟数据，不要拿它对外报收入。
真实的钱只有金库里那 35.757525 USDC，而且其中可确认的近期真实付款是 $0.949183。

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

## 4. 那 40 笔钱是谁付的

`scripts/trace-inflows.js 30` 扫出 40 笔入账，全部 ≤ $1（x402 付款的典型形态），
来自 11 个地址。频次最高的是 `0x24235fa9…8242`，多笔 $0.05–$0.08，约每 7–10 天一次。

```
USDC 0.05      <- 0xa19f6215…accc  block 55915181
USDC 0.001     <- 0x82cef1cd…6f86  block 55962830
USDC 0.069189  <- 0x24235fa9…8242  block 56022170
USDC 0.082067  <- 0x24235fa9…8242  block 56166177
...
USDC 0.052033  <- 0x24235fa9…8242  block 56814478
```

这证明**真实的 x402 微支付在这条链上确实会到账**，只是量小。
$35.76 与 30 天 $0.95 的差额来自更早的入账（240 天扫描见 `data/inflows.json`）。

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
