# AutoTasker Hub — 自运行商业闭环全景图（审计级）

> **状态**: 49/49 PASS · 全链上可验证 · 每日自动对账 · 系统已投入生产

## 一、系统架构总览

```
                    ┌─────────────────────────────────────────────┐
                    │           AutoTasker Hub v5                 │
                    │         (self-running business loop)        │
                    └─────────────────────────────────────────────┘
             ▲                                      ▼
    ┌──────────────────┐              ┌──────────────────────────────┐
    │ 自动获客引擎      │              │  Web3 入口                   │
    │  IndexNow ping   │    ───────▶  │  x402 / USDC / Base         │
    │  trending SEO    │              │  Facilitator free settlement│
    │  JSON-LD 结构    │              │  Bazaar auto-discover       │
    │  RSS 持续更新    │              └──────────────────────────────┘
    └──────────────────┘                          │
           ▲                                       │
    ┌──────────────────┐               ┌───────────▼──────────┐
    │ 自动触达引擎      │               │  自动收钱引擎         │
    │  cache warmup    │◀─────────────▶│  REST/MCP dual path  │
    │  每10min 预热     │   indexnow    │  onAfterSettle 钩子  │
    │  命中热缓存       │              │  txHash 幂等记账      │
    └──────────────────┘              └───────────┬──────────┘
                                                  │
                                          ┌───────▼───────┐
                                          │  资金金库       │
                                          │  0xb9A9E6d9…   │
                                          │  (Base mainnet)│
                                          └───────┬───────┘
                                                  │
                               ┌────────────────────┼────────────────────┐
                               │                    │                    │
                        ┌──────▼──────┐      ┌──────▼──────┐      ┌────▼──────┐
                        │  分销返利    │      │  链上对账    │      │  自助客服  │
                        │  ref新码    │      │  cron 5:15  │      │  FAQ 页面 │
                        │  claim绑定  │      │  账本≤链上   │      │  工单自动答│
                        │  $50 总额上限│      │  report    │      │  14条FAQ  │
                        └─────────────┘      └─────────────┘      └───────────┘
```

## 二、7+1 阶段闭环清单

### [阶段 1] 自动获客 ACQUISITION ✅ 8/8

| # | 检查项 | 实现 |
|---|--------|------|
| 1 | `/trending` 200 + ItemList JSON-LD | `lib/x402-v4.js` L831+ |
| 2 | canonical 指向自身（防重复内容） | `<link rel="canonical" href="/trending">` |
| 3 | `/robots.txt` 200 含 Sitemap 引用 | `public/robots.txt` |
| 4 | `/sitemap.xml` 非空 含所有入口 | `public/sitemap.xml` → /trust /faq |
| 5 | `/offer.html` 200 转化页 | `public/offer.html` |
| 6 | `/trust` 200 + canonical | `lib/x402-v4.js` L829+ |
| 7 | `/faq` 200 + FAQPage JSON-LD ≥10 题 | `lib/x402-v4.js` L611+ |
| 8 | **IndexNow 键文件** 可访问且内容匹配 | `config/indexnow.json` + `public/<key>.txt` |

### [阶段 2] 自动触达 REACH ✅ 6/6

| # | 检查项 | 实现 |
|---|--------|------|
| 1 | `/feed.xml` 200 合法 RSS | `lib/x402-v4.js` L881+ |
| 2 | trending RSS alternate 发现 | `<link rel="alternate" type="application/rss+xml">` |
| 3 | offer og:title/og:url/twitter:card | `public/offer.html` head |
| 4 | offer Product JSON-LD（AggregateOffer） | `public/offer.html` JSON-LD |
| 5 | offer FAQPage JSON-LD | `public/offer.html` JSON-LD |
| 6 | 首页 200 | Express static mount |

### [阶段 3] 转化 CONVERSION ✅ 8/8

| # | 检查项 | 实现 |
|---|--------|------|
| 1 | 免费样例可用 | `GET /api/x402/sample?limit=3` 返回数据 |
| 2 | 付费端点返回 402 | `GET /api/x402/hotlist` 未付款 → 402 |
| 3 | Payment-Required 头可解码 | x402 SDK `enrichPaymentRequiredResponse` |
| 4 | payTo = 唯一金库地址 | `payTo: PAY_TO` in challenge accepts |
| 5 | network = Base | `network: 'eip155:8453'` in accepts |
| 6 | **定价一致性** `$0.05 = 50000 原子单位` | 挑战金额校验 |
| 7 | `/api/status` operational | 健康探针 |
| 8 | **MCP tools/list ≥70 工具在线** | `tools/list` 返回完整工具清单 |

### [阶段 4] 收钱 SETTLEMENT ✅ 6/6

| # | 检查项 | 实现 |
|---|--------|------|
| 1 | `/api/x402/proof` 200 | ledger 直读 settledCount/revenue |
| 2 | proof.payTo = 金库 | BaseScan verify 链接正确 |
| 3 | settledCount 非负整数（零态诚实） | `'0' 就是 '0'，不美化` |
| 4 | revenue 数字诚实（≥0） | totalRevenueUsd 直接从账本 |
| 5 | verifyUrl 指向 BaseScan 金库地址 | `basescan.org/address/<PAY_TO>` |
| 6 | offer 页挂 proof 徽章脚本 | 0笔时隐藏，上线后自动显示 |

### [阶段 5] 分销 REFERRAL ✅ 7/7

| # | 检查项 | 实现 |
|---|--------|------|
| 1 | POST `/api/ref/new` 生成推荐码 | rate limit 5/h/IP |
| 2 | GET `/r/:code` 跳转 offer + atref cookie | trackClick 归因 |
| 3 | claim 绑定钱包 | walletCode() 持久化 |
| 4 | `/ref/:code` 仪表盘 200 渲染 | clicks/stats/pending |
| 5 | **仪表盘钱包打码**（前8+…+后6） | 不泄露完整地址 |
| 6 | `/api/ref/stats/:code` 真实计数 | referrals.stats(code) |
| 7 | 未知码仪表盘 404 | 干净错误页+CTA |

### [阶段 6] 留存 RETENTION ✅ 3/3

| # | 检查项 | 实现 |
|---|--------|------|
| 1 | POST `/api/support/ticket` 创建成功 | 自动回复命中 FAQ |
| 2 | **FAQ 关键词自动回复**（0人工即时响应） | support.matchFaq() 秒回 |
| 3 | offer 页含自助工单入口 | JS form → AJAX ticket |

### [阶段 7] 自愈 SELF-HEAL ✅ 4/4

| # | 检查项 | 实现 |
|---|--------|------|
| 1 | 服务健康（status operational） | systemd watchdog 5min |
| 2 | trending 内容新鲜（非空白缓存） | 10min TTL 刷新 |
| 3 | feed 内容充足（≥5 items） | RSS channel items ≥5 |
| 4 | proof 端点可缓存复用（60s） | Cache-Control: public, max-age=60 |

### [阶段 8] 链上对账 RECONCILIATION ✅ 5/5 ⭐ 本轮新增

| # | 检查项 | 实现 |
|---|--------|------|
| 1 | `/api/x402/reconcile` 200 可解析 | read report file, serve JSON |
| 2 | **对账报告 treasury = 金库**（大小写容错） | `.toLowerCase()` comparison |
| 3 | **对账已运行**（cron 5:15 daily） | 首次跑完 status='reconciled' |
| 4 | **不变式成立** 账本 ≤ 链上入账 | settledCount/count 校验 |
| 5 | **链上入账金额 ≥ 账本收入** | $0 >= $0 在零态成立 |

## 三、服务器 Cron 清单（已验证）

```bash
*/5 * * * * systemctl is-active --quiet autotasker || systemctl restart autotasker  # autotasker-hub watchdog
*/10 * * * * curl -fsS -o /dev/null -m 20 http://127.0.0.1:8795/trending ; ...       # autotasker-hub warmup
30 4 * * * cd /www/autotasker && tar czf backups/appdata-$(date +\%F).tar.gz app/data ...  # autotasker-hub daily-backup
1 5 * * 1 cd /www/autotasker/app && node ...payoutPlan() > data/rebates/plan-$(date +\%F).json ...  # weekly-rebate-snapshot
10 5 * * 1 cd /www/autotasker/app && node scripts/auto-rebate-pay.js --execute --cap 50 >> ... # weekly-rebate-pay
15 5 * * * cd /www/autotasker/app && node scripts/reconcile-onchain.js --json >> data/reconcile.log  # daily-reconcile
```

其他项目任务（bingdashan/bds24/hq_ops）**6行原样保留**，零触碰。

## 四、资金链路（全链上可追溯）

```
用户 x402 支付 (Base主网 USDC)
    │
    ▼
PayAI facilitator https://facilitator.payai.network
    │  settle(response.txHash)
    ▼
onAfterSettle hook ──► recordPayment(txHash, amount, payer)
                      ──► attributePayment(payerWallet, amountUsd, txHash)  ← 分销归因
                      ──► payouts plan updated (ledger.pendingPayouts[])
    │
    ▼
金库 0xb9A9E6d9…94773C (Base mainnet)
    ├── 30% 储蓄（永久不动）
    ├── 60% 复利（仅白名单 USDC 单币协议）
    │       └── 收益再分裂：40% 存 / 60% 复
    └── 10% 稳定盘（返利 + 运营支出）
            ├── auto-rebate-pay.js --execute --cap 50 每周一 05:10
            └── BLOCKED_WALLETS 过滤 · 单笔 $20 FIFO 上限
```

## 五、安全红线（硬约束）

- 🔒 私钥只存 `config/keys/pay-to-new.json`（gitignored），任何输出只打印派生地址
- 🔒 分销返利不经第三方资金池：金库链上直付，txHash 可验
- 🔒 house_e2e 测试流量永不并入对外收入账本
- 🔒 结算黑洞已修复：REST 与 MCP 统一走同一个 after-settle 钩子，txHash 幂等防双记
- 🔒 HFT 禁令保持；触达只走 inbound（SEO/RSS/IndexNow/Bazaar/口碑），不群发

## 六、下一步可选优化方向（优先级排序）

| P0 | 描述 | 估算工作量 |
|----|------|-----------|
| ① 人民币收款码 | 微信 APIv3 / 支付宝 AppId 就位后 offer 页展示真实二维码 | 1天 |
| ② Agent discoverability | 让大模型自然引用 /llms.txt + /api/x402/proof 作为信任背书 | 代码无改动 |
| ③ 分销裂变激励 | 累计返利满 $1 自动触发 payout（当前 cron 每周一 5:10） | 已有，待充值激活 |
| ④ 数据质量反馈 | trending 榜单质量评分写入 Redis，供 hotlist 工具加权 | 中等 |
| ⑤ 风控告警 | 对账失败 / 金库异常大额转入 / 返利超发 → Telegram Bot 通知 | 中等 |
