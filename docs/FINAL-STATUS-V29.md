# 金库直通收入线 — 完整状态报告 (V29, 2026-11-17)

## Executive Summary

**核心指标：**
- 所有收入直达 **0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C**（金库）
- 旧金库 0x367F 链完全隔离，不再触碰
- x402 合规审计：43/0 全绿；AgentPay report：0 defects
- vAPI check：10/0（等 API key）

---

## 渠道状态

### ✅ 已提交 / 运行中

| # | 渠道 | 状态 | 阻塞 | 金额潜力 |
|---|------|:---:|------|---------|
| 1 | **AgentPay Facilitator** (payee 9, endpoints 225–230) | held → 待激活 | 邮件回复 (support@x402-agent-pay.com) | $0.05-$0.50/次 |
| 2 | **AgentPay Store** (listing autotasker-hub-6) | official/pending | listing review | 流量分发 |
| 3 | **pay.sh PR #362** | Greptile 两轮全清，待 CI+人工 | 2-3天 review | 76 provider 目录 |
| 4 | **x402 Foundation Issue #4297** | open (case study) | LF review | 协议背书+引流 |
| 5 | **Glama.ai** | glama.json 已提交 (e7f6e5f0e2) | 24h 自动索引 | MCP server 发现 |

### ⏸️ 等待用户操作

| # | 渠道 | 用户操作 | 完成后我自动处理 |
|---|------|---------|---------------|
| A | **vAPI Network** | 贴 API key → `vapi auth set-key` | 我跑 `vapi publish` + `activate`，立即上线全球 agent 买家网络 |
| B | **MCP Registry** | 终端跑 `bash scripts/run-mcp-publisher.sh` | 服务器自动收录至官方 Registry + Smithery/Arcade/PulseMCP/Glama |

### ❌ 需固定域名

以下渠道拒绝 trycloudflare 免费隧道，等 ECS 恢复或 CF 命名隧道后自动解锁：

| 渠道 | 阻塞原因 |
|------|---------|
| x402-list.com | POST /submit 400: "Website URL on a free hosting or dev-tunnel domain is not allowed" |
| x402scan.com | 前端表单: "Tunnel URLs are ephemeral and can't be reliably discovered" |
| AgentPay demand 榜 | 不索引 quick tunnel 域名 |
| RapidAPI | 需人工创建账号 |
| Coinbase Commerce | 已封禁/超时 |

---

## Pay.sh PR #362 详情

- **PR**: https://github.com/solana-foundation/pay-skills/pull/362
- **分支**: breezesamuel:add-china-social-data
- **文件**: providers/breezesamuel/china-social-data/{PAY.md, openapi.json}
- **Greptile**: 两轮评论全修 (P1 Solana → x-payment-networks 双链声明; P2×6 全清)
- **CI 待办**: Solana-compat gate (验证 usdc/usdt 支付兼容性)
- **先例**: arkham/api 支持 "USDC on Solana mainnet or Base (EIP-3009)"

---

## MCP Registry 提交说明 (需用户操作)

```bash
# 步骤 1: Clone 并切换到自己 fork
git clone https://github.com/breezesamuel/registry ~/modelcontextprotocol-registry
cd ~/modelcontextprotocol-registry
git checkout main && git pull origin main

# 步骤 2: 构建并发布 (需要 GitHub OAuth)
make publisher
./bin/mcp-publisher

# 当提示时填入:
#   server-url:    https://<当前tunnel>/mcp
#   display-name:  AutoTasker Hub — China Social Data
#   description:   Real-time Chinese social media trending data with x402 paywall
```

发布成功后自动收录到：
- registry.modelcontextprotocol.io（官方来源）
- Smithery/Arcade（读取官方注册表）
- PulseMCP、Glama.ai（均有间接索引）

> 注意：MCP 端点路径是 `/mcp`（不是 `/api/x402/*`），这是我们的 x402 MCP 服务器。

---

## vAPI 上架说明 (需用户操作)

打开 https://api.vapinetwork.ai/connect?advanced=keys#api-keys  
创建 API key → 粘贴给我 → 我自动完成:

```bash
vapi auth set-key <your-api-key>
vapi publish <url>/api/x402/headline --mode endpoint --account treasury --yes
vapi publish activate autotasker-hub-treasury
```

---

## 代码仓库提交历史 (autotasker-hub-aevum)

```
ea87e2efff  feat: facilitator enrichment (clears FACILITATOR_UNNAMED) + watcher hardening
9768128e93  docs: full revenue channel map V23
1d2d420ccc  fix: board param + https openapi + facilitator naming
9720e07a64  docs: PR #362 alignment update
95b51c4684  fix: dual-chain x-payment-networks + watcher dead-loop self-heal
fcba8f4eec  docs: channel map V28 (x402 issue + MCP + pay.sh)
8cd5309d02  final: all channels synced to 6th tunnel URL
0bd22dddea  feat: treasury-direct revenue line (0xb9A9-only) + runbook
```

---

## 当前技术栈

| 组件 | 端口 | 位置 | 计费方式 |
|------|------|------|---------|
| aevum server.js | :8797 | F:\2026\第二次点子\repos\autotasker-hub-aevum\server.js | x402 v2 per-call |
| cloudflared tunnel | — | C:\Users\Think\cloudflared.exe | trycloudflare.com (轮换) |
| AutoTasker-AevumWatch | schtasks 每5分钟 | scripts\aevum-watch.js | 自愈服务+隧道 |
| AgentPay facilitator | — | https://x402-agent-pay.com | payTo=0xb9A9, netting |
| x402 SDK | — | node_modules/@x402/core | HTTP 402 challenge/response |

---

## 下一步 (按优先级排序)

1. **[你] 提供 vAPI API key** → 我立即 publish + activate（最大单点增量价值）
2. **[你] 运行 mcp-publisher** → MCP 生态全量覆盖（Smithery/PulseMCP/Glama）
3. **[我] 等待 pay.sh PR #362 CI** → Greptile 已过，Solana 门禁待跑
4. **[我] 继续监控 tunnel 稳定性** → 第6次轮换已发生，watcher 死循环检测已启用
5. **[你] 考虑 ECS 恢复或 CF 命名隧道** → 一次性解锁 3 条阻塞渠道
6. **[我] 主动联系 AgentPay support** → 跟进 payee 激活（如 24h 无回复则发第二封）
