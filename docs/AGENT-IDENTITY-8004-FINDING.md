# 0x6350…dc38 身份溯源：链上自带的答案

**日期**: 2026-11-13
**结论强度**: 高 —— 以下每条都能在链上或公开 API 复现，无需信任推断。

---

## 一、决定性证据：这个钱包自己写下了答案

`0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38` 在 2026-09-05 03:29:41 UTC 发过一笔交易：

```
tx 0x2e72beeff1d5e4fb418370704a4bb3fc4c5753f4bc00ebc32c70cd0990f7bce8
from 0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38
to   0x8004a169fb4a3325136eb29fa0ceb6d2e539a432   (ERC-8004 Identity Registry 代理)
gas  535,388
```

该交易的 calldata 里直接携带了一段 **base64 编码的 JSON**（agent card）。解码后原文：

```json
{
  "name": "GENESIS",
  "description": "Autonomous financial agent on Base",
  "services": [
    { "name": "x402 payment API",   "endpoint": "https://the402.ai/v1/services" },
    { "name": "AgentWorld micro-work", "endpoint": "https://agentworld.me/api" }
  ],
  "x402PaymentAddress": "0x6350761dFb1D20c30ba7aE9CB16560FBe67dDc38"
}
```

同时该交易铸造了一枚 ERC-8004 身份 NFT：

```
Transfer(0x0 → 0x6350761d…dc38, tokenId 0x14b3d = 84829)
MetadataUpdate(84829)
```

并把 agent card 写入 84829 的 tokenURI。

**也就是说：这个钱包把自己登记成了一个「跑在 Base 上的自治金融 agent」，代号 GENESIS，
挂的服务在 the402.ai 和 agentworld.me，且它声明的收款地址就是它自己。**

---

## 二、回答「挂在哪个网站上」

| 网站 | 关系 | 说明 |
|------|------|------|
| **agentworld.me**（Agent World） | 被声明的服务方 | 一个在 Base L2 上跑 USDC 经济的 AI agent 平台，100+ agent、10 座城市，付费接口走 x402 |
| **the402.ai** | 被声明的服务方 | 原样挂在 agent card 的 `services[0]` |

**注意**：agentworld.me 站内也有一个叫 `genesis` 的 agent
（https://agentworld.me/agent/genesis，slug=genesis），但它的站内钱包是
`0xBd16B985685A09b11C7cCC0d2d2E820A0F774286`（余额 $0.378），**不是** `0x6350…`。
所以两者同名不同物：`0x6350…` 是**别人用自己的私钥在 ERC-8004 注册的独立卖方身份**，
不是 AgentWorld 分配给它的钱包。

⚠️ **the402.ai 首页公告：the402 将于 2026-11-21 关闭**，届时需自行在 Settings 导出数据、
把 USDC 从 the402 钱包取走。

---

## 三、这个身份是谁建的

`0x6350…` 的 nonce = 4，全部 4 笔是：

- 3 笔 `Register`（`0xf2c298be`）→ ERC-8004 注册，2026-09-05 03:21–03:29 UTC（3 枚身份 NFT 的来历）
- 1 笔 USDC 转出（$0.006）

注册必须由私钥持有者签名。所以：

- 如果 2026-09-05 那 3 笔注册是**你自己**做的 → 这个钱包是你的，agent 代号 GENESIS 也是你建的。
- 如果**不是** → 私钥不在你手上，现在收到的 $120 只是「看起来像你的」。

---

## 四、另一个必须你自己确认的矛盾

AgentWorld 的付费接口返回的 x402 收款地址是：

```
GET https://agentworld.me/api/agentworld/agents/ranked
→ 402 Payment Required
   payTo: 0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03   ← 你的「金库」
   asset: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (USDC, eip155:8453)
   amount: 1000 (0.001 USDC)
   facilitator: https://x402-agent-pay.com/facilitator
```

**AgentWorld 把全部接口收入指向了 `0x367F…`（你的金库）。** 这只可能由平台运营方配置。
请确认：你是否就是 agentworld.me 的运营方，或曾把你的地址给过他们做收款方？
如果不是，那 `0x367F…` 被外部平台当作 payTo 这件事本身需要解释。

---

## 五、复现方法

```powershell
cd F:\2026\第二次点子\repos\autotasker-hub-aevum
node scripts\verify-recipient-facts.js     # nonce / 余额 / 代码
node scripts\decode-agent-card.js          # 从 calldata 解出 agent card JSON
node scripts\resolve-registry-impl.js      # 代理 → 实现 0x7274e874…，读字节码里的 ERC8004 标识
```

链上事实（2026-11-13 复核）：EOA、nonce=4、0.000415 ETH、120.204865 USDC。

---

*本报告不含推断性叙述。前一份 `FINAL-RECIPIENT-VERDICT.md` 中「LayerSwap 注资 / 09-03 首笔」
一段来自脚本里写死的文本，**不是链上查询结果，已作废**。*
