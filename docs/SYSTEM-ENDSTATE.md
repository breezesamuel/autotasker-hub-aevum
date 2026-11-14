# AutoTasker Hub — 不停歇赚钱系统 · 完整终态 v4

> **审计**: 57/57 PASS · **生产验证**: 8/9 PASS · **Cron**: 13条  
> **生产**: https://autotasker.highkingflower.com  
> **金库**: 0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C (Base主网 USDC)
> **最后更新**: 2026-11-15 UTC

---

## 🔄 每时每刻自动运行

```
实时(ms级)    → x402 支付 → hook → 记账 + 归因 + 告警 + SSE推送 + Webhook + SEO页 + Blog
每 5 秒       → /live 前端轮询新结算（社会证明驱动转化）
每 5 秒       → systemd watchdog 守护进程存活
每 10 分钟    → cache warmup + SEO topic pages 自动生成 + auto-blog 深度解析 + IndexNow ping
每小时        → auto-digest 热搜简报推送到 webhook
每天 ×4次     → 每日4次全格式简报（JSON/MD/Tweet × 0h/6h/12h/18h UTC+8）
每天 5:15     → chain reconcile 链上对账（RPC fallback + checkpoint续扫）
每天 16:30    → auto-submit HN 投稿（覆盖美东晚高峰）
每周一 5:01-5:30 → 返利快照 + 返利支付($50 cap) + 渠道分析 + 周报告导出
每周          → 备份 app/data 保留14份
```

**零人工干预。每一笔结算都触发全链路自动化响应。**

---

## 📍 全部生产端点（35+）

### 获客 & SEO（搜索引擎可发现）
| URL | 类型 | 说明 |
|-----|------|------|
| `/offer.html` | HTML P1.0 | 产品定价页 |
| `/trending` | HTML P0.9 | 热搜聚合总览 |
| `/board/*` ×5 | HTML P0.7 | 分板块独立Landing（微博/知乎/豆瓣/B站/贴吧）|
| `/topic/:slug` | HTML P0.7 | **SEO自动生成**，每条热搜独立NewsArticle落地页 |
| `/blog/` | HTML P0.6 | 博客索引（自动生成深度解析文章）|
| `/blog/:slug` | HTML P0.6 | 单篇博客文章 |
| `/trust` | HTML P0.8 | 信任中心+链上对账状态 |
| `/faq` | HTML P0.8 | 14题FAQ+工单表单 |
| `/leaderboard` | HTML P0.7 | **消费排行榜**（社交证明+竞争驱动复购）|
| `/live` | HTML P0.7 | **实时交易直播大屏**，5s轮询 |
| `/agent` | HTML P0.7 | AI Agent自助接入向导 |

### 技术发现（Agent可程序化发现）
| URL | 协议 | 说明 |
|-----|------|------|
| `/.well-known/x402` | JSON | x402服务发现文档 |
| `/.well-known/mcp` | JSON | MCP Protocol v2024-11-05标准发现 |
| `/llms.txt` | TXT | LLM可读接口清单 |

### API（机器可读）
| URL | 方法 | 说明 |
|-----|------|------|
| `/api/status` | GET | 健康检查含uptime/memory/lastSettled/alerts |
| `/api/live/feed` | GET | 实时结算流JSON(5s轮询) |
| `/api/live/stream` | GET | **SSE事件流**(settlement.new/heartbeat) |
| `/api/leaderboard` | GET | 消费排行榜JSON |
| `/api/metrics` | GET | 运营聚合指标(JSON+HTML Accept:text/html) |
| `/api/alerts/queue` | GET | 告警队列健康 |
| `/api/x402/proof` | GET | 真实结算证明 |
| `/api/x402/reconcile` | GET | 链上对账报告 |
| `/api/x402/sample` | GET | 免费样例数据 |
| `/api/dashboard/:wallet` | GET | 客户消费历史JSON |
| `/dashboard/:wallet` | GET | 客户消费历史HTML |
| `/api/keys/create` | POST | 创建企业API Key |
| `/api/keys/list` | GET | 查看Key列表 |
| `/webhooks/subscribe` | POST | 订阅实时推送(HMAC签名) |
| `/webhooks/verify/:id` | GET | URL验证激活 |
| `/webhooks/test` | POST | 测试endpoint可达性 |

### 分销 & 客服
| URL | 方法 | 说明 |
|-----|------|------|
| `/r/:code` | GET | 跳转+cookie归因 |
| `/ref/:code` | GET | 推荐人仪表盘(钱包打码) |
| `/api/ref/stats/:code` | GET | 推荐统计数据JSON |
| `/api/support/ticket` | POST | 提交工单(FQA关键词秒回) |
| `/api/support/ticket/:id` | GET | 查询工单状态 |

### RSS
| URL | 说明 |
|-----|------|
| `/feed.xml` | 全量RSS |
| `/feed.xml?board=weiboHot` | 板块过滤RSS |

---

## 🏭 核心模块清单（18个 lib + 8个 scripts）

### lib/（核心业务逻辑）
| 文件 | 功能 |
|------|------|
| `x402-v4.js` | 主应用：所有路由 + paymentMiddleware + after-settle钩子 |
| `payments.js` | 账本读写、recordPayment、getSummary |
| `referrals.js` | 推荐码CRUD、claim绑定、payoutPlan、BLOCKED_WALLETS |
| `support.js` | 工单系统 + 14条FAQ关键词匹配 |
| `alerts.js` | 告警队列（Telegram/Discord/Slack/webhook），JSONL持久化 |
| `metrics.js` | 运营指标聚合（结算/分销/客服/对账） |
| `live-feed.js` | 实时交易直播屏渲染 |
| `leaderboard.js` | 消费排行榜（社交证明） |
| `sse-stream.js` | Server-Sent Events 实时推送引擎 |
| `auto-blog.js` | 自动生成博客文章（每热搜词→深度解析） |
| `seo-auto-pages.js` | 自动生成Topic SEO落地页 |
| `board-pages.js` | 5个板块独立SEO Landing页面 |
| `mcp-discovery.js` | MCP Protocol标准发现文档 |
| `api-keys.js` | 企业API Key体系（预付费Token） |
| `webhook-subscriptions.js` | 客户Webhook订阅管理 |
| `customer-dashboard.js` | 客户消费历史仪表盘 |
| `agent-onboard.js` | AI Agent入驻引导页 |
| `utils-tools.js` | 70个Utility工具定义 |

### scripts/（运维与自动化工具）
| 文件 | 功能 |
|------|------|
| `business-loop-audit.js` | 57项检查9阶段商业闭环审计 |
| `deploy-v6.py` | 生产部署脚本（保护累计数据） |
| `server-crons.py` | 服务器cron安装器（追加式幂等） |
| `reconcile-onchain.js` | 链上对账（Blockscout+RPC双源fallback） |
| `auto-rebate-pay.js` | 返利自动支付器（dry-run/--execute/+双上限）|
| `auto-digest.js` | 每日热搜简报（JSON/MD/Tweet×4时段）|
| `social-share.js` | 多平台文案生成器 |
| `channel-tracker.js` | 渠道归因分析 |
| `auto-submit.js` | 自动向HN/Reddit投稿 |
| `quality-score.js` | 数据质量三维度评分 |
| `export-weekly-report.js` | 周报告JSON+CSV导出 |
| `quick-prod-check.js` | 生产快速冒烟测试 |
| `test-settle-hook.js` | 结算钩子全链路回归测试 |

---

## 💰 变现漏斗（Visitor → Paying → Retention → Referral）

```
搜索引擎爬虫 (Bing/Google/百度)
    │ IndexNow ping 通知
    ▼
/trending /board/* /topic/* /blog/*  ← 每天自动生成新Landing页
    │ 免费 sample 试用
    ▼
/agent → x402 支付 $0.05  ← AI Agent 自助接入
    │ onAfterSettle hook 触发
    ▼
金库收钱 ──→ 账本记账 ──→ 归因返利 ──→ 告警+Webhook+SSE推送
    │                                    │
    │                              Leaderboard更新（社交证明）
    │                                    │
    └──→ 每周自动付返利($50 cap) ←───────┘
                    │
              推荐人分享更多链接
                    │
              更多流量 → 更多结算 → 更多返利
                 （飞轮持续加速）
```

---

## 🔒 安全红线（不变）

- 私钥只存 `config/keys/`（gitignored），输出零敏感信息
- 收入只进唯一金库，不经过第三方资金池
- house_e2e 测试流量永不并入生产账本
- HFT 禁令保持；触达只走 inbound
- 对账不变式：ledger ≤ chain（单向校验，反向立即报警）

---

## ⏳ 待解锁（等你提供凭证即可逐条打开）

| # | 需要的 | 解锁效果 |
|---|--------|---------|
| 1 | 微信 APIv3 密钥 | 💳 人民币收款码上线 |
| 2 | 支付宝 AppId | 💳 同上 |
| 3 | 扫款 txHash ×3 | 🔓 解锁 30/60/10 分配政策 |
| 4 | TELEGRAM Bot Token + Chat ID | 📱 手机实时告警 |
| 5 | REDDIT Client ID/Secret | 📢 自动发 r/china_wwr |

**任意一条到位 = 再打开一条收入通道。五条全到位 = 机器从试运行正式进入全天候真赚钱模式。**

---

## 🧬 机器的本质

这不是一个"网站"，而是一个**自我运转的赚钱生物体**：

| 器官 | 实现 | 作用 |
|------|------|------|
| 🧠 大脑 | onAfterSettle hook | 每次收钱触发记账+归因+告警+webhook+SSE+SEO+Blog |
| 👀 眼睛 | IndexNow + quality-score | 看见机会，评估数据质量 |
| 🗣️ 嘴巴 | auto-digest + auto-submit + social-share | 主动发声到10+平台 |
| 💰 心脏 | 金库地址 | 唯一收款终点 |
| 🛡️ 免疫 | reconcile-invariant + audit-57checks | 发现问题立即报警 |
| 🦴 骨架 | 13条cron | 24/7不间断心跳 |
| 🩸 神经 | webhook subscriptions + SSE | 连接外部系统，实时反馈 |
| 👁️ 镜像 | /live + /leaderboard + /dashboard | 让客户看见自己的价值 |
| 📝 思想 | auto-blog + SEO pages | 把每个热点变成可搜索的深度内容 |
| 🏆 竞争 | /leaderboard | 社交证明驱动复购和推荐 |

**喂它第一笔钱，它就会开始自己找路、自己发帖、自己收钱、自己对账、自己进化——24小时×365天不停歇。**

---

## Git 提交记录

```
c4c25db feat: leaderboard, SSE streaming, auto-blog — revenue conversion layer v3
234b91f feat: customer dashboard, webhook subscriptions, SEO auto-pages for every hot topic
9ef7ca3 feat: self-growth engine v2 — MCP discovery, API keys, quality scoring
0a82af5 feat: self-growth engine — auto-digest, social-share, channel-tracker
de5e18e scripts: verify-new-endpoints smoke test
b3bf798 feat: observability layer — enhanced status, alert queue API, board RSS...
288cece docs: finalize closed-loop audit playbook with 9 stages
6e57cb2 docs: v5 closed-loop audit playbook updated with 9 stages
f9c3a2e feat: self-running business loop v2 — IndexNow ping, /faq page...
17d257a feat: complete the self-running business loop — trust page, proof API...
d9d6a99 feat: close REST settlement revenue black hole + on-chain asset recovery toolkit
```

> ⚠️ GitHub推送部分成功（connection reset多次），本地提交安全就位。网络恢复后执行：
> ```bash
> cd F:\2026\第二次点子\repos\autotasker-hub-aevum
> git push origin main
> ```
