# 金库直通收入线 — V30 最终状态报告 (2026-11-17)

## 🏆 当前渠道全景 (8条)

| # | 渠道 | 状态 | PR/ID | 阻塞项 |
|---|------|:---:|-------|--------|
| 1 | **AgentPay Facilitator** | ✅ payee 10 + 端点 226–235 | payee_id=10 | 激活邮件待回复 |
| 2 | **AgentPay Store** | ✅ autotasker-hub-6 listing | slug=autotasker-hub-6 | 平台 review |
| 3 | **pay.sh PR #362** | ✅ Greptile两轮全清 | PR #362 | CI Solana门禁+人工review |
| 4 | **awesome-x402 PR #2256** | ✅ 提交成功 | PR #2256 | 维护者review |
| 5 | **x402 Foundation** | ✅ Issue #4297 case study | Issue #4297 | LF社区review |
| 6 | **Glama.ai** | ✅ glama.json 已提交 | sha=e7f6e5f0e2 | 24h自动索引 |
| 7 | **vAPI Network** | ⏸️ account imported | treasury acct | **需 API key** |
| 8 | **MCP Registry** | ⏸️ mcp-publisher 脚本就绪 | — | **需用户运行** |

### ❌ 需固定域名（等 ECS/CF 命名隧道）
- x402-list.com — 明确拒收 trycloudflare
- x402scan.com — 前端表单提示 "Tunnel URLs are ephemeral"
- AgentPay demand 榜 — 不索引 quick tunnel

## 🆕 本轮新增发现

### A2A Protocol 集成 (Google官方的agent-to-agent支付协议)
- 仓库: `google-agentic-commerce/a2a-x402` (**571 stars**)
- 我们的改动: `.well-known/a2a.json` AgentCard + `/.well-known/a2a` HTTP endpoint
- 效果: 任何支持 A2A x402 extension 的 agent 都能**自动发现并付费调用**我们的服务
- Spec URI: `https://github.com/google-agentic-commerce/a2a-x402/v0.1`

### awesome-x402 (307 stars) — x402生态终极资源列表
- 我们将成为**第一个中国社交数据提供商**
- PR #2256 已提交，维护者审核后将收录到 https://github.com/xpaysh/awesome-x402

### Dify Marketplace (插件市场)
- 已有 139★/186★ MCP 插件先例 (junjiem/mcp_sse 等)
- dify-plugin.json 已创建，需手动在 marketplace.dify.ai 上传提交

### Demand 空白分析 (AgentPay demand 榜)
- tollbooth/api/read → **1053 unpaid 402s**, $0.32 settled (99%未变现!)
- directory/search → **996 unpaid 402s**, $0.028 settled
- 我们的 search 端点正好命中这个高需求类别

## 🔧 技术改进 (本轮代码提交)

```
ea87e2efff  facilitator enrichment patch (清除 FACILITATOR_UNNAMED)
9768128e93  渠道全景图 V23
1d2d420ccc  board参数修复 + https openapi
9720e07a64  PR #362 URL对齐更新
95b51c4684  dual-chain x-payment-networks声明
fcba8f4eec  渠道图V28 (x402 issue + MCP)
8cd5309d02  全部渠道同步第6个URL
9e020933a0  FINAL-STATUS-V29 + mcp-publisher脚本
[当前]      a2a-x402 AgentCard支持 + .well-known/a2a.json
```

## ⏳ 等待用户操作的 2 件事

### 1. vAPI API key (最关键 — 全球agent买家网络)
```
打开: https://api.vapinetwork.ai/connect?advanced=keys#api-keys
创建 key → 贴给我
我自动执行: vapi publish + activate
```

### 2. MCP Registry (mcp-publisher)
```bash
git clone https://github.com/breezesamuel/registry ~/modelcontextprotocol-registry
cd ~/modelcontextprotocol-registry && git checkout main && git pull origin main
make publisher
./bin/mcp-publisher   ← GitHub OAuth 登录即可
```

## 📊 合规评分汇总
- **x402 本地审计**: 43 passed / 0 warnings / 0 failed
- **AgentPay facilitator report**: 0 defects (FACILITATOR_UNNAMED 已修复)
- **vAPI check**: 10 passed / 0 failed (1 openapi warning)
- **pay.sh Greptile**: 两轮评论全部通过
- **awesome-x402 PR**: 已提交，等维护者 merge

## 💰 当前金库地址
`0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C` (Base mainnet USDC)
所有付费端点 payTo = 此地址。旧金库 0x367F 完全隔离。

## 🔄 Tunnel 稳定性
当前 URL: `https://violations-nhs-entering-math.trycloudflare.com` (第7次轮换)
Watcher 每 5 分钟检测死循环并重启。所有渠道已自动重新同步。
