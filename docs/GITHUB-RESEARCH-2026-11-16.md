# GitHub/全网深挖 — 24/7 全自动赚钱平台扩展路线图 (2026-11-16)

> 调研方法: GitHub Search API + README 深读（token 认证）。所有结论均有仓库链接佐证。

## 一、核心判断

我们的 x402 **结算能力已经齐了**（PayAI facilitator 主网可用 + settle-self.js 自托管兜底），
真正的缺口是**分发/被发现**：全球 AI agent 买家找不到我们、不知道可以付钱。
本轮挖到的所有仓库都指向同一个答案 —— **发现协议栈 + 市场上架**。

## 二、x402 卖家生态（按直接可用性排序）

| 仓库 | ★ | 是什么 | 对我们的用途 |
|------|---|--------|--------------|
| `x402-foundation/x402` | 6813 | 官方协议 + 全套 SDK（@x402/express, @x402/mcp, @x402/paywall） | 用官方中间件替换自研 402 装配，接 v2 spec |
| `qntx/facilitator` | 150 | 生产级 x402 facilitator（Apache/MIT 双许可） | PayAI 不可达时的第二外部 facilitator；或自托管 |
| `Dhaiwat10/x402-sovereign` | 62 | 自托管 facilitator npm 包 `@x402-sovereign/core`，Express/Hono 适配器，EVM/Base | 完全摆脱第三方：把 facilitator 变成自己 app 的一条路由 |
| `devlab-group/agent-commerce` | 75 | 自托管非托管网关：YAML 描述端点 → 自动暴露 MCP/x402/A2A/ACP，资金直达商家钱包 | **最快上架路径**：包住现有 API，立即获得 agent 发现+收款 |
| `MikeyPetrillo/Agent402` | 51 | 500+ 工具按次付费市场（agent402.tools），MCP 原生，自托管可复用 | 定价基准 + 模仿其 catalog/proof/status 页面 |
| `auscahq/ausca` | 38 | 按次付费基础设施 API（OCR/转录/浏览器），USDC/Base | 上架 MCP registry + Smithery 的模板 |
| `vAPI-Network/vapi-network` | 4751 | 买家侧"一个钱包付遍 x402 API"，含 SKILL.md + Router 生产网络 | 去 vapinetwork.ai 登记为 provider，被 Router 收录 |
| `internet-court/internet-court-skill` | 7127 | **开放 SKILL**：agent 对 agent 合同 + 仲裁（ERC-8004/ERC-7710/x402 vendored） | 可直接装进 OpenCode skills，让我们的 agent 参与对等交易 |
| `yayashuxue/agent-marketplace-proxy` | 0 | 80 行把任意 REST API 包成 x402 收费端点的参考实现 | 复制该模式扩品（SERP $0.001/次 验证了微付费市场存在） |
| `atr-one/x402-audit` / `fardinvahdat/x402trace` | 0 | x402 卖家合规自检/调试 CLI | 上线前用它们做 conformance 自检 |

## 三、发现协议栈（照抄 Octodamus 模板 — 33 个收费端点全被 Bazaar 收录）

来自 awesome-x402 的实证模板（api.octodamus.com）：
1. `/.well-known/x402.json` — 机器可读产品清单 ✅（已有，需对齐 census 检查器口径）
2. `/llms.txt` — agent 可读文档 ✅（已有）
3. MCP server + Smithery 注册 ⬜（有 /.well-known/mcp，缺 Smithery 提交）
4. CDP x402 Bazaar 收录 ⬜
5. Ed25519 签名响应（`magentixai/x402-signed-manifest-ref`）⬜
6. payment-identifier 回执 ⬜

## 四、定价校准（awesome-x402 实测数据带）

- 微工具/单次数据: **$0.001–$0.02**（SERP $0.001、gas oracle $0.005、market facts $0.01–0.02）
- 重计算/风险分析: **$0.05**（rug-scanner）
- 成品报告: **$2–5**（Agent402 报告按卡卖）← 我们 market-report $5 落带内
- 行动: 给 hotlist/search 加 $0.001–0.005 高频档，报告保留 $3–5，中间加 $0.05–0.25 分析档

## 五、24/7 不断线（ watchdog 层）

- 已有: `uptime.yml` GitHub Actions 每 15min 探活 /api/status + x402 402 面（外部视角报警）✅
- 待做: ECS systemd `WatchdogSec` + `Restart=always`；cron-job.org/UptimeRobot 免费层 5min 打点；
  自托管参考 `louislam/uptime-kuma`(★94464) 或 `MizuchiLabs/beacon`(★5, 轻量)
- 冻结根因待查: 8.155.53.12 需 Aliyun 控制台重启后 `dmesg`/`journalctl -b -1` 取证

## 六、链上资金动作（BaseScan/RPC 实测 2026-11-16 晚）

- **dripper 仍在烧**: 0x367F USDC 14.18 → **12.69**（prod 冻结期间仍在发交易 → 签名者在云端，
  本机 2409 文件全盘 key 推导扫描**零命中**，仅有金库 0xb9A9 key 在 config/keys/pay-to-new.json）
- Vercel CLI 未登录（auth.json 不存在）→ 用户侧确认: `npx vercel login` 后跑
  `npx vercel env ls` 查有无 RELAYER_PRIVATE_KEY 类 env（0x367F 疑似在其中）
- 燃烧量可控（每次 0.21–0.29 USDC，gas ≈$0.01）；**MetaMask 5 笔扫款手册仍是止损失 fastest 路径**

## 七、执行顺序（一旦 SSH 恢复）

1. deploy-v6 同步 alipay sign 修复（GitHub 已有 8ca1b33e1a）
2. 跑 `x402-audit`/`x402trace` 对自检 → 修 conformance
3. 上 `agent-commerce` 网关（YAML 包现有付费端点）或直接 @x402/express v2 中间件
4. Smithery + Bazaar + vAPI 三处上架
5. CNY 兜底页（个人收款码 payload 已验证）上线
6. awesome-x402 提 PR 收录我们（免费高质量外链）
