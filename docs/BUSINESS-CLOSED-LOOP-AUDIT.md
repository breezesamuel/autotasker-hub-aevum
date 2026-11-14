# AutoTasker Hub — v5 商业闭环全景（完整版）

> **审计结果: 57 PASS / 0 FAIL · 9 阶段全绿 ✅**
> **生产地址**: https://autotasker.highkingflower.com
> **金库 (Base)**: 0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C
> **最后更新**: 2026-11-14 UTC

---

## 一、系统架构总览

```
                          ┌─────────────────────────────────────┐
                          │         AutoTasker Hub v5           │
                          │      Self-running Money Engine       │
                          └─────────────────────────────────────┘
                               ▲                      ▲
      ┌────────────────────────┴──────────┐   ┌───────┴───────────────┐
      │     自动获客引擎 (ACQUISITION)      │   │    Web3 收钱网关       │
      │  IndexNow ping + trending SEO      │◄──┤  x402 / USDC / Base   │
      │  RSS feed 持续回流                 │   │  onAfterSettle 钩子    │
      │  JSON-LD 结构化数据                │   │  txHash 幂等记账        │
      │  5 个板块独立 Landing Page          │   │                       │
      └────────────────────────────────────┘   └───────────┬───────────┘
              ▲                                          │
      ┌───────┴──────────┐                     ┌────────▼──────────┐
      │  自动触达引擎     │                     │    资金金库        │
      │  每10min cache    │◀──────────────────▶ │  0xb9A9E6d9…733C  │
      │  warmup 预热      │   新内容 hash 变化   │  (Base 主网 USDC) │
      └──────────────────┘                     └────────┬──────────┘
                                                        │
                     ┌──────────────────────────────────┼────────────────────────┐
                     │                  │                │                        │
              ┌──────▼──────┐    ┌──────▼──────┐  ┌─────▼──────┐       ┌────────▼────────┐
              │ 分销返利引擎  │    │ 自助客服引擎  │  │链上对账引擎  │       │运营可见性层      │
              │ /r/:code    │    │ /faq 页面    │  │ cron 5:15  │       │ /api/metrics    │
              │ claim绑定   │    │ FAQ 14条秒答 │  │ reconcile  │       │ /board/* 子页   │
              │ 自动支付    │    │ 工单表单     │  │ invariant  │       │ alert webhook   │
              │ $50 cap     │    │              │  │  ≤ 链上    │       │ weekly report   │
              └─────────────┘    └─────────────┘  └────────────┘       └─────────────────┘
```

## 二、9 阶段闭环清单（57 项检查全绿）

| # | 阶段 | 检查数 | 关键实现 |
|---|------|--------|----------|
| 1 | **获客 ACQUISITION** | 8 | trending SEO, robots/sitemap/IndexNow, /trust, /faq, board keys |
| 2 | **触达 REACH** | 6 | RSS, og/twitter, Product+FAQPage JSON-LD |
| 3 | **转化 CONVERSION** | 8 | free sample, 402 challenge, price=$0.05=50000, MCP tools ≥70 |
| 4 | **收钱 SETTLEMENT** | 6 | proof API, BaseScan verify, honest-zero policy |
| 5 | **分销 REFERRAL** | 7 | new → /r redirect+cookie → claim → /ref dashboard(masked wallet) → stats |
| 6 | **留存 RETENTION** | 3 | ticket + FAQ auto-reply + offer embedded form |
| 7 | **自愈 SELF-HEAL** | 4 | watchdog 5min, trending/feed freshness, proof cache 60s |
| 8 | **对账 RECONCILIATION** ⭐ | 5 | ledger ≤ on-chain invariant, RPC fallback, checkpoint resume |
| 9 | **运营可见性 OPERATIONS** ⭐ | 8 | /api/metrics(HTML+JSON), /board/*(5 subpages), export-weekly-report, alert queue |

## 三、新增模块详情

### ① `/api/metrics` — 运营指标聚合端点
```json
{
  "generatedAt": "...",
  "settlement": { "settledCount": 0, "totalRevenueUsd": "0.000000", ... },
  "referral": { "codes": 12, "attributedPayments": 0, "rebatesPendingUsd": "0.000000", ... },
  "support": { "totalTickets": 14 },
  "reconciliation": { "ok": true, "ageMinutes": 26, ... },
  "treasury": { "address": "0xb9A9E6d9...", "network": "eip155:8453" },
  "policy": { "savingsBps": 3000, "compoundBps": 6000, "stableBps": 1000 }
}
```
- `Accept: text/html` → HTML 仪表盘（top referrers 表 + 对账状态行）

### ② `/board/:name` — 分板块 SEO 子页
- 五个入口：weiboHot / zhihu / douban / bilibili / tieba
- 每个独立 canonical + ItemList JSON-LD + RSS alternate
- 10 分钟缓存 + 内容哈希变化检测 + IndexNow 自动重 ping

### ③ `lib/alerts.js` — 事件驱动告警
- Telegram bot / Discord webhook / Slack / 通用 webhook 多目标支持
- 持久化 JSONL 队列（崩溃重启自动重放），drain 每 10 秒
- after-settle hook 自动入队结算事件

### ④ `scripts/export-weekly-report.js`
- ISO 年第 N 周 → `data/reports/YYYY-Www.json` + `.csv`
- 聚合：结算笔数/收入/by-tool 分布，推荐码统计，对账快照，每日 CSV

### ⑤ 链上对账 v2
- Blockscout API 不可达时自动 fallback RPC eth_getLogs
- Checkpoint 断点续扫，首跑覆盖 5,000,000 blocks ≈115 天

## 四、服务器 Cron 清单

```
*/5 * * * * systemctl is-active --quiet autotasker || systemctl restart autotasker  # autotasker-hub watchdog
*/10 * * * * curl -fsS -o /dev/null -m 20 http://127.0.0.1:8795/trending ; ...      # autotasker-hub warmup
30 4 * * * cd /www/autotasker && tar czf backups/appdata-$(date +\%F).tar.gz app/data ...  # daily-backup
1 5 * * 1 ... payoutPlan() > data/rebates/plan-$(date +\%F).json ...                 # weekly-rebate-snapshot
10 5 * * 1 ... node scripts/auto-rebate-pay.js --execute --cap 50 >> ...             # weekly-rebate-pay
15 5 * * * ... node scripts/reconcile-onchain.js --json >> ...                       # daily-reconcile
20 5 * * 1 ... node scripts/export-weekly-report.js >> ...                           # weekly-report-export
```

其他项目任务（bingdashan/bds24/hq_ops）**6 行原样保留**。

## 五、生产 URL 清单

| 类型 | URL | 说明 |
|------|-----|------|
| 产品与价格 | `https://autotasker.highkingflower.com/offer.html` | JSON-LD/Product+FAQPage |
| 热搜快照 | `https://autotasker.highkingflower.com/trending` | 5 板块聚合 |
| 分板块 | `/board/weiboHot` / `/board/zhihu` / ... | 独立 SEO Landing |
| 信任中心 | `https://autotasker.highkingflower.com/trust` | payTo/revenue/政策/对账状态 |
| 常见问题 | `https://autotasker.highkingflower.com/faq` | 14 题 + 工单表单 |
| 运营仪表盘 | `https://autotasker.highkingflower.com/api/metrics` | JSON + HTML(Accept:text/html) |
| 链上对账 | `https://autotasker.highkingflower.com/api/x402/reconcile` | 对账报告 JSON |
| 真实结算证明 | `https://autotasker.highkingflower.com/api/x402/proof` | settledCount/Revenue/first+latest |
| Agent 文档 | `https://autotasker.highkingflower.com/llms.txt` | 机器可读接口清单 |
| RSS | `https://autotasker.highkingflower.com/feed.xml` | 持续更新的热门话题源 |
| 推荐入口 | `https://autotasker.highkingflower.com/r/<code>` | 跳转 + cookie 归因 |
| 推荐仪表盘 | `https://autotasker.highkingflower.com/ref/<code>` | 点击/访客/归因/返利（钱包打码）|

## 六、安全红线

- 🔒 私钥只存 `config/keys/pay-to-new.json`（gitignored），任何输出只打印派生地址
- 🔒 分销返利不经第三方资金池：金库链上直付，txHash 可验
- 🔒 house_e2e 测试流量永不并入对外收入账本
- 🔒 结算黑洞已修复：REST 与 MCP 统一走同一个 after-settle 钩子
- 🔒 HFT 禁令保持；触达只走 inbound（SEO/RSS/IndexNow/Bazaar/口碑），不群发
- 🔒 Alert webhook 失败只记 warn，绝不阻塞主链路

## 七、待办事项

1. ⏳ 微信 APIv3 密钥（pay.weixin.qq.com 生成 32 位字符串）→ offer 展示真实收款码
2. ⏳ 支付宝 AppId → offer 展示真实支付宝收款码
3. ⏳ 用户扫款解锁 30/60/10 分配政策
4. ⏳ Telegram Bot Token + Chat ID → 接入实时告警（可选）
5. ⚡ the402.ai 2026-11-21 关闭前导出数据
6. ⚡ config/credentials.json 明文密钥轮换
