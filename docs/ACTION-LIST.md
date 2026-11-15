# AutoTasker Hub v4 — 最终行动清单

## 🔴 现在必须做（影响收入启动）

### Step 1: 重新部署到 Vercel
上次部署因 23+ 个 JS 文件导致超过 12-function 限制失败。已修复。

**你的命令（复制粘贴）：**
```powershell
cd F:\2026\第二次点子\repos\autotasker-hub-aevum
npx vercel --prod
```
等待 "Deployment completed" ✓ 然后告诉我。

### Step 2: 我自动提交的 PR（等部署成功后）
```powershell
node scripts/gh-submit-listings.js --check   # 先验证
node scripts/gh-submit-listings.js --submit  # 自动 fork + 提 PR
```

---

## 🟡 本周内完成（竞赛奖金）

### Step 3: swap.io Bonus 视频（截止 Nov 15）
```powershell
node scripts/swap-io-x402-bonus-demo.js
```
录屏 30 秒终端输出 → YouTube unlisted → X tag @swapdotio → Edit submission

### Step 4: DoraHacks QDay（Nov 16 开放）
```
GitHub 登录: https://dorahacks.io/hackathon/qday/register
选择 "Continue with GitHub"
提交: github.com/breezesamuel/autotasker-hub-aevum + demo video
```

---

## 🟢 长期被动收入

### Step 5: 上线后立即生效
一旦 Vercel 部署成功：
- `autotasker-hub.vercel.app/mcp` → 全球 AI Agent 可访问
- `/.well-known/x402` → Bazaar 自动收录
- 每个调用 = $0.01–$0.50 USDC 进入 house wallet

---

## 💰 收入预测汇总

| 来源 | 金额 | 启动时间 |
|------|------|---------|
| Bazaar 被动流量 | $50–500+/月 | 部署后立刻 |
| AgentKit 自动发现 | $20–200+/月 | 生态成熟后 |
| swap.io 赏金 | $200–500 USDC | Nov 25 |
| DoraHacks QDay | $800–3,000 USDT | Dec 11 |
| B2B 集成合同 | $1,500+/单 | 持续跟进 |

**首月保守合计: $300–2,000+**  
**年度 recurring: $600–6,000+（仅被动部分）**
