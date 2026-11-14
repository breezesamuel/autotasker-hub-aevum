# 上线清单 (GO-LIVE)

从"本地验证通过"到"真实收款到账"，只剩这几步。按顺序做，每步都有验收标准。

---

## 步骤 1：部署（你来做，约 3 分钟）

```powershell
cd F:\2026\第二次点子\repos\autotasker-hub-aevum
npx vercel --prod
```

**验收**：命令输出一个 `https://...vercel.app` 地址。
把它记下来，下面叫 `$URL`。

> 为什么必须你来：本机 AI 网络到 `vercel.com` 是连不通的（`ECONNREFUSED`），
> 我无法代替登录和部署。

---

## 步骤 2：配环境变量（你来做，约 2 分钟）

在 Vercel 项目 → Settings → Environment Variables 里加：

| 变量 | 值 | 作用 |
|---|---|---|
| `PAY_TO` | `0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03` | 钱收到哪个地址（金库） |
| `PUBLIC_URL` | `https://你的域名` | `llms.txt`/`openapi.json` 里的绝对链接 |
| `RELAYER_PRIVATE_KEY` | 金库私钥，或任意有 Base ETH 的钱包私钥 | 打开"我们代付 gas"的结算模式 |
| `X402_NETWORK` | `eip155:8453`（默认值，可不填） | 主网 |

`X402_ALLOW_TESTNET` **不要设**（设了会把零价值的测试网 USDC 也列进 402）。

**验收**：

```powershell
curl.exe "$URL/api/status"
```

应该看到 `"network":"eip155:8453"`、`"payTo":"0x367F..."`、`"relayerConfigured":true`。

> **换收款钱包？** `PAY_TO` 填新钱包地址即可，代码不用改。推荐用一个全新的
> 专用收款钱包（只进不出，与个人钱包隔离）：新钱包里不需要放任何 gas——
> x402 是"别人打钱给你"，收款侧永远不发起交易。

---

## 步骤 3：验证线上付费墙（我来做，你给我 URL 就行）

```powershell
node scripts\verify-v5.js https://你的域名
```

必须 **15/15 通过**。重点看这三条：

- `challenge network is Base mainnet`
- `challenge asset is real Base USDC`
- `forged signature is rejected (no free data)`

---

## 步骤 4：真金实测（你来做，约 1 分钟，花 $0.02）

这一步是唯一能证明"100% 到账"的实验。两种方式选一种：

### 方式 A（推荐，需要 `RELAYER_PRIVATE_KEY` 已配）

用任意有 USDC 的 Base 钱包，按 402 响应里的 `accepts` 签一个 EIP-3009 授权，
带 `PAYMENT-SIGNATURE` 头重新请求。钱会直接从你的钱包转到金库，我们只付 gas。

### 方式 B（不需要我们持有私钥）

自己广播 `transferWithAuthorization` 到 Base USDC 合约，然后：

```powershell
# txHash = 你刚广播的交易
curl.exe -X POST "$URL/mcp" -H "content-type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"baidu_hot\",\"arguments\":{},\"_meta\":{\"x402/payment\":{\"txHash\":\"0x...\"}}}}"
```

**验收**：响应里有数据 + `settlement.txHash`，并且
`https://basescan.org/tx/0x...` 能看到这笔 USDC 进了金库。

---

## 步骤 5：让 AI 找到你

```powershell
node scripts\gh-submit-listings.js --check   # 确认线上可达
node scripts\gh-submit-listings.js --submit  # 提交到 x402 目录
```

同时确认这几个文件线上可用（部署后自动生成，无需额外配置）：

```
$URL/llms.txt
$URL/openapi.json
$URL/pricing.json
$URL/robots.txt
$URL/.well-known/x402
$URL/.well-known/mcp.json
```

---

## 已知约束（不要踩）

| 约束 | 说明 |
|---|---|
| Vercel Hobby 只能有 12 个 Serverless Function | 所以 `api/` 已整体改名为 `lib/`，只留 `index.js` 一个函数 |
| 服务端不能 `app.listen()` | `index.js` 只 `module.exports = app` |
| `x402.org` facilitator 只支持测试网 | 已完全不依赖它，改为自己结算 |
| 金库有 0.058 ETH | 够 ~1000 次 gas，暂时不用充值 |
| 账本写到 `/tmp` | 无状态函数里会丢；链上 tx 才是真相 |

---

## 钱在哪里、怎么核

```powershell
node scripts\ledger-truth.js
```

```
house     0x74a9...5d8   USDC 0          ETH 0.000000
treasury  0x367F...1a03  USDC 35.757525  ETH 0.057962
REALIZED (on-chain, spendable): 35.757525 USD
```

每次有人调付费工具，`data/payments/ledger.json` 会新增一条带真实 `txHash` 的记录，
`https://basescan.org/tx/<txHash>` 可查。**没有 txHash 的记录一律视为不存在。**
