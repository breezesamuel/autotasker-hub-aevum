# 金库 0xb9A9 收入渠道全景图 (V23, 2026-11-16)

> 本文件汇总所有已探明的变现渠道及其状态。收款 100% 直达 `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`。
> 旧金库 0x367F 归集链已归档，不再推进。

## 渠道状态总表

| # | 渠道 | 状态 | 收款到 0xb9A9? | 阻塞项 |
|---|------|------|:-:|------|
| 1 | **AgentPay Store** (agentpaystore.com) | ✅ 已提交 ×2 (autotasker-hub-3, autotasker-hub-4) | ✅ | listing review pending |
| 2 | **AgentPay Facilitator Payee** (x402-agent-pay.com) | ✅ payee 7 + endpoints 209–213 注册 | ✅ | payee activation email sent, awaiting reply |
| 3 | **vAPI Network** (api.vapinetwork.ai) | ⏸️ 10/0 check passed, account imported | ✅ | 需 vAPI API key (console 创建) |
| 4 | **pay.sh / Solana Foundation pay-skills** | ✅ **PR #362 已提交** (CI in review) | ✅ | CI probe + review approval; quick tunnel domain may rotate |
| 5 | **x402-list.com** | ❌ 拒收 trycloudflare (400) | ✅ | 需固定域名 |
| 6 | **MCP Registry** (registry.modelcontextprotocol.io) | 🔍 API 路径未探明 | ✅ | 找注册 API 格式 |
| 7 | **x402 Foundation** (x402.org, LF project) | 📝 case study 可投 | — | LF member/contribution 路径 |
| 8 | **AgentPay demand 榜** | ❌ 不索引 quick tunnel | ✅ | 需固定域名进入 demand 引擎 |

## 各渠道详情

### 1. AgentPay Store (已提交)
- 两条 listing: `autotasker-hub-3` (旧 URL, stale) + `autotasker-hub-4` (当前 URL, active)
- owner_id=30, payee_wallet=0xb9A9, endpoint=当前隧道
- 状态: pending (store review)

### 2. AgentPay Facilitator (payee + endpoints)
- payee_id=7 "AutoTasker Treasury", wallet=0xb9A9, resource_prefix=当前隧道
- 端点 209–213: hotlist $0.05, search $0.05, headline $0.002, daily_report $0.25, probe $0.50
- 激活邮件已发 (support@x402-agent-pay.com + CC x402agentpay@gmail.com)
- 旧 payee 6 (reno-bay prefix) 在邮件中声明为 stale, 请求关闭
- 官方 audit report: **0 defects** (FACILITATOR_UNNAMED 已修复)

### 3. vAPI Network
- `vapi accounts import treasury` → 0xb9A9 已导入
- `vapi check <url>/api/x402/headline` → 10 passed, 0 failed (1 openapi warning)
- 阻塞: 需 vAPI API key (https://api.vapinetwork.ai/connect?advanced=keys#api-keys)
- 命令: `vapi auth set-key` → `vapi publish <url> --mode endpoint --account treasury --yes` → `vapi publish activate <slug>`

### 4. pay.sh / Solana Foundation (PR #362)
- 仓库: github.com/solana-foundation/pay-skills (1.8k stars, 76 providers)
- PR: #362 `feat: add AutoTasker Hub — China Social Data (x402, USDC/Base)`
- 分支: breezesamuel:add-china-social-data
- 文件: providers/breezesamuel/china-social-data/{PAY.md, openapi.json}
- CI: Greptile Review in_progress
- 先例: arkham/api 支持 "USDC on Solana mainnet or on Base (EIP-3009)"
- 风险: service_url 是 quick tunnel (可能漂移); CI probe 可能因 URL 失效而 fail

### 5. x402-list.com
- 目录有 26 个 API 端点 (含 POST /submit, POST /assess $0.25 AI 评分)
- 拒收 trycloudflare: "Website URL on a free hosting or dev-tunnel domain (trycloudflare.com) is not allowed"
- 也拒: ngrok, localhost.run, serveo.net, github.io, surge.sh 等
- 免费主机 (vercel, netlify, railway) 需付 $1 USDC 进 review 队列
- **等固定域名后重新提交**

### 6. MCP Registry
- registry.modelcontextprotocol.io (v0 API)
- 文档: /docs (SPA, 未找到 API 路径)
- 可能注册为 MCP server → agent 通过 MCP 协议直接调用我们的付费端点
- 待探: 注册 API 格式 + 是否支持 x402 paywall

### 7. x402 Foundation (LF)
- x402.org = Linux Foundation 项目
- 合作路径: case study (我们有 988 笔 tUSD8 结算 + Base USDC 新线)
- 工作组: 可参与 (Get Involved → Meeting Calendar → Working Groups)

## 固定域名解锁清单
当 ECS 恢复 (8.155.53.12) 或 CF 命名隧道部署后:
1. x402-list.com → 重新 POST /submit (用固定域名, 不再被 400)
2. AgentPay demand 引擎 → 端点进入 210-endpoint 排行榜
3. pay.sh PR #362 → 更新 service_url 到固定域名 (避免 CI probe 失败)
4. AgentPay Store → listing 端点更新
5. vAPI → publish + activate (如果 vAPI 也要求稳定域名)

## 当前可行动项
- [ ] vAPI: 获取 API key → publish + activate (唯一纯增量渠道)
- [ ] AgentPay payee 7: 等邮件回复 (activation)
- [ ] pay.sh PR #362: 等 CI + review (可能需要 1-2 天)
- [ ] MCP Registry: 探 API 注册格式
- [ ] x402 Foundation: 写 case study 投 x402.org
- [ ] 固定域名: 等 ECS 或 CF 命名隧道 (一次性解锁 4 个渠道)
