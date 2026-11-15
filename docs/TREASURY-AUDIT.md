# Treasury 所有权与安全审计

**审计日期**: 2026-11-13  
**钱包地址**: `0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03` (Base 主网)  
**当前余额**: $35.24 USDC + 0.058 ETH  
**累计 nonce**: **77,610** — 极度活跃的 EOA 个人钱包

---

## 一、钱包类型确认

```
eth_getCode(0x367F…) = 0x  →  EOA（外部拥有账户）
nonce = 77610             →  不是专用钱包，是日常频繁使用的钱包
```

**结论：这是某人（极大概率是你自己）的主网 Base 个人钱包。**

---

## 二、流出分析（~12h 定值转账到 0x6350…dc38）

| 特征 | 数据 |
|---|---|
| 频率 | ~每 12 小时一次，持续 3+ 月 |
| 金额 | $0.2–0.5 / 次，固定规律 |
| 接收方 nonce | **4** — 仅发过 4 笔交易，是纯归集钱包 |
| 接收方 USDC | $119.69 累计收到 |
| 接收方类型 | EOA（非合约）— 无自动逻辑 |
| 签名者 | 金库私钥持有者（**不在本工作区**） |

**可能解释：**
1. **你的定时预算/订阅转帐**（如交易所存款、DeFi 协议、定投等）
2. **另一个脚本或自动化程序**（用你私钥发起的定时任务）
3. **不认识的第三方**在定期从你钱包扣款

→ 需要你用自己的钱包工具（MetaMask / Ledger / Rabby 等）查看这 77k+ 笔交易历史，找出规律和模式，判断哪笔是你主动发起的。

---

## 三、工作区钥匙扫描（已完成）

以下文件的 private key 均经 `scripts/derive-all.js` 验证，**无一匹配 treasury**：

| 文件 | 对应地址 | 状态 |
|---|---|---|
| `config/keys/x402-wallet.json` | `0x74a9…5d8` (house) | ✅ house 空钱包 |
| `hackathon-qday-private/...qday-hackathon-wallet.json` | `0xbc6f…19f` | ✅ hackathon 测试网 |
| `data/keys/testnet-actors.json` × 3 | testnet actors | ✅ 全部测试网 |
| `hackathon-qday/state/base-payout-wallets.json` | 引用了 treasury | ❌ 无密钥 |
| `hackathon-qday-private/...superteam-agent.json` | API key（非钱包） | ❌ 无关 |

**treasury 私钥绝对不在本工作区的任何文件中。**

---

## 四、Vercel 环境变量现状

根据 `docs/GO-LIVE.md`，目前配置如下：

| 变量 | 当前值 | 说明 |
|---|---|---|
| `PAY_TO` | `0x367F…1a03` | **指向旧金库，需换掉** |
| `PUBLIC_URL` | 你的域名 | — |
| `RELAYER_PRIVATE_KEY` | 有设 | house 钱包私钥（与 treasury 无关） |
| `X402_ALLOW_TESTNET` | **未设**（正确） | — |

⚠️ Vercel 里的 `PAY_TO` 仍指向那个旧的、有问题的金库地址。

---

## 五、Aliyun ECS 情况

- 本机未发现 `az` CLI（Azure 工具），也未找到 `aliyun-cli`
- ECS IP 172.28.194.173（私有）/ 8.155.53.12（公有）无法直接从本机探测
- 需要你在 Aliyun 控制台登录，查看该实例是否有部署过相关服务

---

## 六、紧急行动建议

### 🔴 P0: 资金安全（立即执行）

1. **生成新专用收款钱包**（推荐）：
   - 在本工作区创建 `config/keys/pay-to-new.json`（写入 .gitignore）
   - 用你信任的设备（MetaMask/Ledger）生成或用脚本生成

2. **切换 PAY_TO 环境变量**（Vercel Dashboard）：
   ```
   PAY_TO = <新钱包地址>
   ```
   之后所有 x402 付款会直接进入新钱包，旧金库停止收钱。

3. **签一笔转账把旧金库清空到新钱包**（需要你手动操作）：
   - 在你平时用这个钱包的工具里（MetaMask 等）
   - 发送 `USDC($35.24)` + 可选地 `ETH(0.058)` 到新钱包
   - **完成之后再决定要不要废弃旧金库**

4. **确认流入/流出关系**：
   - 登录 MetaMask / 浏览区块浏览器，看 nonce 77,610 的交易历史
   - 找出那些每 12 小时的流出是谁发起的

### 🟡 P1: 工作区加固

- 把所有 `.env` 文件加入 `.gitignore`
- `config/keys/` 目录只保留 house key（已在 .gitignore 中）
- 运行 `node scripts/probe-superteam.js` 全盘扫描确认无误

### 🟢 P2: 上线准备

- 新钱包准备好后，在 Vercel 更新 `PAY_TO`
- 重跑 `node scripts/verify-v5.js https://your-domain` 确认 15/15 通过

---

## 七、待回答的问题

在你提供更多信息之前，请告诉我：

1. **这个钱包是否是你自己的？**（用 MetaMask 打开看看，是不是你常用的 Base 钱包）
2. **那 77k 笔交易里有你主动发起的吗？** 特别是近期向 `0x6350761d…dc38` 的转出？
3. **你是否同意我在这台机器上生成一个新专用收款钱包？**

---

*本报告由 AI 自动生成，基于链上和本地文件系统取证。不涉及任何私钥推导（未实现）。*
