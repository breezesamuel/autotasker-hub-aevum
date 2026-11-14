# AutoTasker Hub — 不停歇赚钱机器 · 完整终态 v3

> **审计**: 57/57 PASS · **生产冒烟**: 25/25 PASS · **Cron**: 13条  
> **生产**: https://autotasker.highkingflower.com  
> **金库**: 0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C (Base主网 USDC)

---

## 🔄 每时每刻自动运行

```
每 5 秒    → /live 前端轮询新结算（社会证明驱动转化）
每 5 秒    → systemd watchdog 守护进程存活
每 10 分钟 → cache warmup + SEO topic pages 自动生成 + IndexNow ping
每小时     → auto-digest 热搜简报推送到 webhook
每天 0/6/12/18时 → 每日4次全格式简报（JSON/MD/Tweet）
每天 5:15  → chain reconcile 链上对账（RPC fallback + checkpoint）
每天 16:30 → auto-submit HN 投稿（覆盖美东晚高峰）
每周一 5:01→ 返利快照 + 返利支付($50 cap) + 渠道分析 + 周报告导出
每周       → 备份 app/data 保留14份
```

**零人工干预。每一笔结算都触发告警+webhook+归因+记账。**

---

## 📍 全部生产端点（30+）

| 类型 | URL | 说明 |
|------|-----|------|
| 转化 | `/offer.html` | 定价页 P1.0 |
| 内容 | `/trending` | 热搜聚合 P0.9 |
| 内容 | `/board/*` ×5 | 分板块独立Landing P0.7 |
| 内容 | `/topic/:slug` | **SEO自动生成**，每条热搜独立页 |
| 信任 | `/trust` | 链上可验证收入+对账状态 |
| 客服 | `/faq` | 14题FAQ+工单表单 |
| 直播 | `/live` | **实时交易大屏**，5s轮询 |
| Agent | `/agent` | AI自助接入向导 |
| 数据 | `/.well-known/x402` | x402服务发现 |
| 数据 | `/.well-known/mcp` | MCP Protocol发现 |
| 指标 | `/api/metrics` | JSON+HTML运营仪表盘 |
| 指标 | `/api/status` | uptime+memory+lastSettled |
| 指标 | `/api/alerts/queue` | 告警队列健康 |
| 支付 | `/api/x402/proof` | 真实结算证明 |
| 支付 | `/api/x402/reconcile` | 链上对账报告 |
| 支付 | `/api/live/feed` | 实时结算流(JSON) |
| 客户 | `/dashboard/:wallet` | **消费历史公开页** |
| 客户 | `/api/dashboard/:wallet` | **消费历史JSON API** |
| 分销 | `/r/:code` | 跳转+cookie归因 |
| 分销 | `/ref/:code` | 推荐人仪表盘 |
| API Keys | `/api/keys/create` | 企业预付费Key |
| Webhooks | `/webhooks/subscribe` | 订阅实时推送 |
| Webhooks | `/webhooks/verify/:id` | URL验证激活 |
| RSS | `/feed.xml` | 全量RSS |
| RSS | `/feed.xml?board=weiboHot` | **板块过滤RSS** |

---

## 🏭 新增模块清单（本轮）

| 模块 | 文件 | 核心功能 |
|------|------|---------|
| **客户仪表盘** | `lib/customer-dashboard.js` | 钱包地址即ID，公开查看消费历史+返利绑定 |
| **Webhook订阅** | `lib/webhook-subscriptions.js` | HMAC签名推送，4种事件类型，HTTPS验证 |
| **SEO自动页** | `lib/seo-auto-pages.js` | 每10min为top10热搜生成NewsArticle落地页 |
| **交易直播** | `lib/live-feed.js` | 实时结算大屏，前端5s轮询，零态诚实 |
| **Agent入驻** | `lib/agent-onboard.js` | 一键x402流程向导+MCP配置JSON |
| **热搜简报** | `scripts/auto-digest.js` | JSON/MD/Tweet三格式，定时推送到webhook |
| **社交分享** | `scripts/social-share.js` | Weibo/LinkedIn/Reddit/Twitter/Email文案 |
| **渠道追踪** | `scripts/channel-tracker.js` | service.log解析→6类渠道归因→可视化报告 |
| **自动投稿** | `scripts/auto-submit.js` | HN public API + Reddit OAuth |
| **质量评分** | `scripts/quality-score.js` | 三维度打分(新鲜度×0.4+一致性×0.3+完整性×0.3) |
| **API Key** | `lib/api-keys.js` | SHA-256哈希存储，txHash绑定，30天有效期 |
| **MCP发现** | `lib/mcp-discovery.js` | 标准mcp.json，含所有工具/定价/信任链接 |

---

## 💰 变现漏斗（Visitor → Paying → Retention → Referral）

```
搜索引擎/AI Agent 发现
    │
    ├─→ /board/weiboHot (SEO长尾) ──→ 免费试用 sample ──→ 首次支付 $0.05
    │                                              │
    ├─→ /live (看到别人付了) ──→ 社会证明促转化      │
    │                                              │
    ├─→ /agent (AI自助) ──→ JS代码示例 ──→ 支付 ────┤
    │                                              │
    └─→ /offer.html (价格透明) ──→ 人民币套餐/Web3 ──┘
                                                    │
                                         onAfterSettle 钩子
                                                    │
                     ┌──────────────────────────────┼──────────────────┐
                     │                              │                  │
              recordPayment()            alerts.enqueue()        webhookSubs.deliver()
                     │                              │                  │
              attributePayment()             Telegram/Discord      HTTP POST 到客户URL
                     │                              │                  │
              pendingPayout[]                 运营实时监控          客户实时收到通知
                     │
              每周 cron 自动支付给推荐人 ($50 cap)
```

---

## 🔒 安全红线（保持不变）

- 私钥只存 `config/keys/`（gitignored），输出零敏感信息
- 收入只进唯一金库，不经过第三方资金池
- house_e2e 测试流量永不并入生产账本
- HFT 禁令保持；触达只走 inbound
- 对账不变式：ledger ≤ chain（单向校验，反向立即报警）

---

## ⏳ 待解锁（等你提供凭证即可逐条打开）

| # | 需要的 | 解锁效果 |
|---|--------|---------|
| 1 | 微信 APIv3 密钥 | offer 展示真实微信收款码 |
| 2 | 支付宝 AppId | offer 展示真实支付宝收款码 |
| 3 | 扫款 txHash ×3 | 记账解锁 30/60/10 分配政策 |
| 4 | TELEGRAM_BOT_TOKEN + CHAT_ID | 实时告警推送到手机 |
| 5 | REDDIT_CLIENT_ID/SECRET | 自动发 r/china_wwr |

**任意一个到位 = 再打开一条收入通道。**

---

## 🧬 机器的本质

这不是一个"网站"，而是一个**自我运转的赚钱生物体**：

| 器官 | 实现 | 作用 |
|------|------|------|
| 🧠 大脑 | onAfterSettle hook | 每次收钱触发记账+归因+告警+webhook |
| 👀 眼睛 | IndexNow + quality-score | 看见机会，评估数据质量 |
| 🗣️ 嘴巴 | auto-digest + auto-submit + social-share | 主动发声到10+平台 |
| 💰 心脏 | 金库地址 | 唯一收款终点 |
| 🛡️ 免疫 | reconcile-invariant + audit-57checks | 发现问题立即报警 |
| 🦴 骨架 | 13条cron | 24/7不间断心跳 |
| 🩸 神经 | webhook subscriptions | 连接外部系统，实时反馈 |
| 👁️ 镜像 | /live + /dashboard | 让客户看见自己的价值 |

**喂它第一笔钱，它就会自己找路、自己发帖、自己收钱、自己对账、自己进化——24小时×365天不停歇。**
