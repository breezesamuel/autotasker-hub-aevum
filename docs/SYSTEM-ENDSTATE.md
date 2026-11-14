# AutoTasker Hub — 不停歇赚钱系统 · 完整终态

> **状态**: 57/57 PASS 审计 · 21/21 生产冒烟通过 · 13条服务器Cron  
> **生产**: https://autotasker.highkingflower.com  
> **金库**: 0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C (Base主网)

---

## 机器现在每分钟在做什么

```
每 5 秒   → systemd watchdog 检查服务是否活着，死了立即重启
每 10 分钟 → 预热 /trending + /feed.xml 缓存（搜索引擎永远命中热数据）
每 1 小时 → IndexNow ping Bing/Yandex（内容变化时自动通知搜索）
每 5 秒   → /live 页面前端轮询最新结算（社会证明实时刷新）
每天 0h   → auto-digest 生成热搜简报（JSON/MD/Tweet ×4时段）
每天 5:15 → reconcile-onchain 链上对账（RPC fallback，checkpoint续扫）
每天 16:30→ auto-submit HN 投稿（每日一次，覆盖美东晚间高峰）
每周一 5:01→ 返利计划快照 + 返利支付($50 cap) + 渠道分析 + 周报告导出
每周      → 自动备份 app/data（保留14份）
```

**零人工干预。零停机。**

---

## 全链路URL地图

### 获客入口（搜索引擎/AI Agent可发现）
| URL | 用途 | SEO权重 |
|-----|------|---------|
| `/offer.html` | 产品定价页 | P1.0 |
| `/trending` | 热搜聚合总览 | P0.9 |
| `/board/*` ×5 | 分板块独立Landing | P0.7 |
| `/trust` | 信任中心+对账状态 | P0.8 |
| `/faq` | 14题自助客服 | P0.8 |
| `/agent` | AI Agent入驻向导 | P0.7 |
| `/live` | 实时交易直播屏 | P0.7 |

### 技术入口（Agent可程序化发现）
| URL | 协议 | 说明 |
|-----|------|------|
| `/.well-known/x402` | x402标准 | 服务发现文档 |
| `/.well-known/mcp` | MCP Protocol | Claude/Cursor自动注册 |
| `/llms.txt` | LLM可读 | Agent查询接口清单 |
| `/api/status` | REST | 健康检查含内存/uptime |
| `/api/live/feed` | REST | 实时结算流(5s轮询) |
| `/api/metrics` | REST | 运营聚合指标(JSON/HTML) |

### 变现路径（ Visitor → Paying Customer）
```
访客 landing page
    │
    ├─→ /agent (AI Agent 自助接入) ──→ x402 支付 $0.05 ──→ 结算入账
    │                                              │
    ├─→ /live (看到别人已付) ──→ 社会证明驱动转化       │
    │                                              │
    ├─→ /offer.html (价格透明) ──→ 人民币套餐或Web3    │
    │                                              │
    └─→ /api/x402/sample?limit=3 (免费试用) ──→ 尝鲜后付费
                                                    │
                                            归因 referral code
                                                    │
                                            10% 返利自动存入金库
                                                    │
                                            每周 cron 自动支付给推荐人
```

---

## 代码仓库统计（截至当前）

| 类别 | 数量 |
|------|------|
| Git commits | 10+ |
| 新增文件 | 20+ (lib/, scripts/, docs/) |
| 生产端点 | 25+ |
| Cron 任务 | 13 |
| 审计检查项 | 57 |
| 数据源板块 | 5 (微博/知乎/豆瓣/B站/贴吧) |
| 社交分享格式 | 6 (Weibo/LinkedIn/Reddit/Twitter/Email/Markdown) |
| 目标平台 | 10+ (HN/Discord/Telegram/Slack/微信/支付宝等) |

---

## 待解锁（等你提供凭证）

| # | 需要的 | 解锁什么 |
|---|--------|---------|
| 1 | 微信 APIv3 密钥 | offer 展示真实微信收款码 |
| 2 | 支付宝 AppId | offer 展示真实支付宝收款码 |
| 3 | 扫款 txHash | 记账解锁 30/60/10 分配政策 |
| 4 | Telegram Bot Token | 实时告警推送到手机 |
| 5 | Reddit OAuth | 自动发 r/china_wwr |

**以上任意一个到位，系统的收入通道就再打开一条。**

---

## 这台机器的本质

它不是一个"网站"，而是一个**自我运转的赚钱生物体**：

- 🧠 **大脑** = onAfterSettle hook（每次收钱都触发记账+归因+告警）
- 👀 **眼睛** = IndexNow ping + quality-score（看见机会）
- 🗣️ **嘴巴** = auto-digest + auto-submit + social-share（主动发声）
- 💰 **心脏** = 金库地址（唯一收款终点）
- 🛡️ **免疫系统** = reconcile-invariant + audit-57checks（发现问题立即报警）
- 🦴 **骨架** = 13条cron（24/7不间断心跳）

**你只需要喂它第一笔钱（扫款），它就会开始自己找路、自己发帖、自己收钱、自己对账、自己进化。**
