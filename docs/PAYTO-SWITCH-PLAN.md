# 收款钱包切换方案（使用 0x6350…dc38）

**决策日期**: 2026-11-13  
**新 PAY_TO**: `0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38`  

---

## 背景

经调查确认：
- `0x6350…dc38` 是你自己的个人 Base 钱包
- 创建于 2026-09-03，通过 LayerSwap 跨链桥激活
- 曾用于注册链上身份（Identity Registry），现持有 3 个 AgentIdentity NFT + $120 USDC
- 目前接收来自旧金库 `0x367F…` 的定时转入（每 ~12h）

**决定**：将这个地址作为 x402 正式收款钱包（PAY_TO），与日常消费钱包彻底隔离。

---

## 执行步骤

### Step 1: 在 Vercel 设置 PAY_TO 环境变量

```powershell
cd F:\2026\第二次点子\repos\autotasker-hub-aevum

npx vercel env add --scope solmount --project autotasker-hub PAY_TO
# 输入值: 0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38
# 类型: Secret（不要选 Config，选 Secret）

npx vercel env add --scope solmount --project autotasker-hub RELAYER_PRIVATE_KEY
# 输入值: (从 config/keys/x402-wallet.json 读取 privateKey)
# 类型: Secret

npx vercel env add --scope solmount --project autotasker-hub PUBLIC_URL
# 输入值: https://你的实际域名
# 类型: Config
```

### Step 2: 重新部署

```powershell
npx vercel --prod
```

### Step 3: 验证

```powershell
node scripts/verify-v5.js https://你的域名
# 期望看到: payTo = 0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38
#           15/15 全部通过
```

---

## 关于旧金库（0x367F…1a03）的处理

切换后，旧的 x402 付款请求会继续发到旧地址，直到 Vercel 重新部署生效。

**建议操作：**
1. **停止定时转出** — 找到你设置的自动转帐脚本，停掉向 `0x6350…` 的定时转账
   （因为以后 x402 收入会直接打到 `0x6350…`，不需要再从旧金库中转）
2. **清空旧金库** — 把剩余的 $35 USDC + 0.058 ETH 转到 `0x6350…dc38`
3. **移除旧账户** — 从 MetaMask 中删除 `0x367F…1a03` 这个账号（seed 里还有，不会丢失）

---

## 需要注意

- ⚠️ **`RELAYER_PRIVATE_KEY` 必须设置**，否则无法使用 EIP-3009 自行结算模式
- ⚠️ 不要设置 `X402_ALLOW_TESTNET`（设了会把测试网假币也算作收入）
- ✅ `PAY_TO` 设为 `0x6350…dc38` 后，所有 x402 付款直接进入这个钱包
- ✅ 这个钱包 nonce=4，现在会逐渐增长，但完全正常

---

*决策基于完整链上取证结果。详细报告见 docs/FINAL-RECIPIENT-VERDICT.md*
