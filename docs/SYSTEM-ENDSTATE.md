# AutoTasker Hub — 不停歇赚钱系统 · 完整终态 v4

> **审计**: 57/57 PASS · **生产冒烟**: 8/9 PASS · **Cron**: 13条  
> **生产**: https://autotasker.highkingflower.com  
> **金库**: 0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C (Base主网 USDC)

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

### 获客 & SEO
| URL | 类型 | 说明 |
|-----|------|------|
| `/offer.html` | HTML | 产品定价页 P1.0 |
| `/trending` | HTML | 热搜聚合总览 P0.9 |
| `/board/*` ×5 | HTML | 分板块独立Landing P0.7 |
| `/topic/:slug` | HTML | **SEO自动生成**，每条热搜独立NewsArticle页 |
| `/blog/` | HTML | 博客索引（自动生成深度解析文章） |
| `/blog/:slug` | HTML | 单篇博客文章 |
| `/trust` | HTML | 信任中心+链上对账状态 |
| `/faq` | HTML | 14题FAQ+工单表单 |
| `/leaderboard` | HTML | **消费排行榜**（社交证明+竞争驱动复购） |
| `/live` | HTML | **实时交易直播大屏**，5s轮询 |
| `/agent` | HTML | AI Agent自助接入向导 |

### 技术发现
| URL | 协议 | 说明 |
|-----|------|------|
| `/.well-known/x402` | JSON | x402服务发现文档 |
| `/.well-known/mcp` | JSON | MCP Protocol v2024-11-05标准发现 |
| `/llms.txt` | TXT | LLM可读接口清单 |

### API
| URL | 方法 | 说明 |
|-----|------|------|
| `/api/status` | GET | 健康检查含uptime/memory/lastSettled/alerts |
| `/api/live/feed` | GET | 实时结算流JSON(5s轮询) |
| `/api/live/stream` | GET | **SSE事件流**(settlement.new/heartbeat) |
| `/api/leaderboard` | GET | 消费排行榜JSON |
| `/api/metrics` | GET | 运营聚合指标(JSON+HTML) |
| `/api/alerts/queue` | GET | 告警队列健康 |
| `/api/x402/proof` | GET | 真实结算证明 |
| `/api/x402/reconcile` | GET | 链上对账报告 |
| `/api/x402/sample` | GET | 免费样例数据 |
| `/api/dashboard/:wallet` | GET | 客户消费历史JSON |
| `/dashboard/:wallet` | GET | 客户消费历史HTML |
| `/api/keys/create` | POST | 创建企业API Key |
| `/api/keys/list` | GET | 查看Key列表 |
| `/webhooks/subscribe` | POST | 订阅实时推送 |
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

## 🏭 模块清单（当前已上线）

| 模块 | 文件 | 功能 |
|------|------|------|
| 交易直播 | `lib/live-feed.js` | 实时结算大屏，前端5s轮询，零态诚实 |
| Agent入驻 | `lib/agent-onboard.js` | 一键x402流程向导+MCP配置 |
| 热搜简报 | `scripts/auto-digest.js` | JSON/MD/Tweet三格式定时推送 |
| 社交分享 | `scripts/social-share.js` | Weibo/LinkedIn/Reddit/Twitter/Email文案 |
| 渠道追踪 | `scripts/channel-tracker.js` | service.log→6类渠道归因可视化 |
| 自动投稿 | `scripts/auto-submit.js` | HN public API + Reddit OAuth |
| 质量评分 | `scripts/quality-score.js` | 三维度打分，低分源自动降级 |
| API Key | `lib/api-keys.js` | SHA-256哈希存储，txHash绑定，30天有效 |
| MCP发现 | `lib/mcp-discovery.js` | 标准mcp.json含工具/定价/信任链接 |
| 消费排行 | `lib/leaderboard.js` | 钱包公开排名，社交证明驱动复购 |
| SSE推送 | `lib/sse-stream.js` | 浏览器EventSource实时结算通知 |
| 博客生成 | `lib/auto-blog.js` | 每个热搜词→深度解析文章 |
| SEO页 | `lib/seo-auto-pages.js` | 每条热搜→NewsArticle独立落地页 |
| Webhook | `lib/webhook-subscriptions.js` | HMAC签名推送，4种事件类型 |
| 客户仪表 | `lib/customer-dashboard.js` | 钱包地址即ID的消费历史页 |
| 告警系统 | `lib/alerts.js` | Telegram/Discord/Slack多目标推送 |
| 运营指标 | `lib/metrics.js` | 聚合结算/分销/客服/对账数据 |
| 板块页面 | `lib/board-pages.js` | 5个板块独立SEO Landing |
| 结算核心 | `scripts/reconcile-onchain.js` | RPC fallback+checkpoint断点续扫 |

---

## 💰 变现漏斗

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
    │                              Leaderboard更新
    │                                    │
    └──→ 每周自动付返利($50 cap) ←───────┘
                    │
              推荐人分享更多链接
                    │
              更多流量 → 更多结算 → 更多返利
                 （飞轮持续加速）
```

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
| 🧠 大脑 | onAfterSettle hook | 每次收钱触发记账+归因+告警+webhook+SSE |
| 👀 眼睛 | IndexNow + quality-score | 看见机会，评估数据质量 |
| 🗣️ 嘴巴 | auto-digest + auto-submit + social-share | 主动发声到10+平台 |
| 💰 心脏 | 金库地址 | 唯一收款终点 |
| 🛡️ 免疫 | reconcile-invariant + audit-57checks | 发现问题立即报警 |
| 🦴 骨架 | 13条cron | 24/7不间断心跳 |
| 🩸 神经 | webhook + SSE | 连接外部系统，实时反馈 |
| 👁️ 镜像 | /live + /leaderboard + /dashboard | 让客户看见自己的价值 |
| 📝 思想 | auto-blog + SEO pages | 把每个热点变成可搜索的深度内容 |

**喂它第一笔钱，它就会开始自己找路、自己发帖、自己收钱、自己对账、自己进化——24小时×365天不停歇。**
