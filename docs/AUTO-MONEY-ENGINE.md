# 全自动赚钱引擎（Auto-Money Engine）— 架构与运行手册

> 目标：获客 → 触达 → 引流 → 转化 → 收钱 → 分销返利 → 复利增值，全链路自动化。
> 用户只需做三件事（受合规与私钥物理限制）：① 开支付宝/微信商户号；② 扫旧钱包余额进金库并签名投资 tx；③ 轮换泄露密钥。
> 其余全部由系统自动运行。**诚实红线：每个对外数字都可链上验证；虚构账目零容忍。**

## 一、总览：九个自动化模块

| # | 模块 | 状态 | 实现位置 | 自动化程度 |
|---|------|------|----------|-----------|
| 1 | 自动收钱（Web3 入口） | ✅ 已上线 | x402 v5：REST + MCP + Bazaar，PayAI facilitator 结算直进金库 | 100% 自动，链上可验证 |
| 2 | 自动获客（内容引擎） | ✅ 本轮上线 | `/trending` 动态 SEO 页 + `/feed.xml` RSS + llms.txt + `/.well-known/x402` | 100% 自动（数据每次抓取后页面自动更新） |
| 3 | 自动触达（合规） | ✅ 本轮上线 | 落地页 `/offer.html` + 免费样例接口（sample/summary）做钩子 | 100% 自动（inbound，不扫荡、不群发） |
| 4 | 自助客服 | ✅ 本轮上线 | `/api/support/ticket` + FAQ 自答 + 工单查询 | 100% 自动（FAQ 命中即自动回复） |
| 5 | 系统分销/推荐返利 | ✅ 本轮上线 | `lib/referrals.js`：/r/:code 追踪 → 钱包绑定 → 10% 返利负债 → 金库直付 | 除付款签名外 100% 自动 |
| 6 | 持续引流 | ✅ 本轮上线 | sitemap.xml + robots.txt + RSS 订阅 + Bazaar 自动收录 | 100% 自动 |
| 7 | 自动营销 | 🔄 迭代中 | 内容页自动更新（trending 每次抓取自动刷新）+ 推荐链接传播 | 100% 自动 |
| 8 | 增值复利 | ✅ 逻辑就绪 | `yield-scan.js` → `treasury-allocate.js`（30/60/10 + 增值 40/60 分裂） | 扫款与投资签名需用户 |
| 9 | 人民币直销 | 🔄 待商户号 | `/offer.html` 人民币套餐 + 商户号收款码占位 | 商户号开通后 100% 自动 |

## 二、钱流（单一金库，全部可验证）

```
外币收入（Web3）
  payer agent ──x402 exact──▶ PayAI facilitator ──▶ 金库 0xb9A9…4773C（100% 到账）
                                                 │
人民币收入（直销）                                │
  客户 ──支付宝/微信商户号──▶ 用户银行账户（USDC 不落地）│
                                                 ▼
                     treasury-allocate.js 出分配计划（30% 储蓄 / 60% 复利 / 10% 稳定盘）
                                                 │
                                    用户签名执行（私钥在用户手里，天然双签）
                                                 ▼
                     复利收益到账 → --record-gain → 自动 40% 储蓄 / 60% 回投（gainSplitLoop）
```

分销返利是**费用负债**，不是收入分拆：收入仍记 100%（与链上一致），返利 10% 记为待付负债，
由金库直接链上支付给推荐人（`scripts/referral-payout.js` 出计划 → 用户签名）。不经过任何第三方资金池。

## 三、分销引擎工作原理（lib/referrals.js）

```
① 带客   访问 https://autotasker.highkingflower.com/r/ATXXXXXX
        → 记录点击（IP 哈希+UA+来源）→ 写 cookie atref（30 天）→ 跳转落地页

② 建码   POST /api/ref/new（同 IP 每小时限 5 个）→ 返回码 + 推广链接

③ 绑定   POST /api/ref/claim {code, wallet}
        → 一钱包只认首码；金库/运营地址禁止自绑；返回绑定关系

④ 归因   该钱包每次 x402 结算成功 → attributePayment()
        → 记负债 = 金额 × 10%（同一 txHash 幂等，绝不重复）

⑤ 付款   scripts/referral-payout.js 出计划（按钱包聚合 ≥ $1）
        → 用户金库签名直付 → --record 销账（txHash 留档）
```

数据文件：`data/referrals.json`（码/点击/绑定/归因/付款 五张流水，纯追加，可审计）。

## 四、内容引擎（自动获客 + 持续引流）

- `/trending` — 服务端渲染的热搜快照页（SEO 动态内容，随抓取自动更新，10 分钟内存缓存）
- `/feed.xml` — RSS 2.0，搜索引擎与订阅器每抓一次都是新内容
- `/sitemap.xml` + `/robots.txt` — 爬虫入口
- `/.well-known/x402` + `/llms.txt` — AI agent 发现入口（Bazaar 自动收录付费路由）
- `/api/x402/sample`、`/api/x402/summary` — 免费样例，转化钩子

合规边界（与用户确认过）：**不扫荡游离钱包、不群发邮件/电话**。触达只走：搜索自然流量、
RSS 订阅、agent 生态收录（Bazaar/llms.txt）、推荐链接口碑传播。外呼自动化仅在拿到
用户明确 opt-in（如工单留下联系方式并勾选同意）时才允许。

## 五、自助客服（lib/support.js）

- `POST /api/support/ticket {contact?, topic, message}` → 工单入库 + 关键词命中 FAQ 即自动回复
- `GET /api/support/ticket/:id` → 查进度（自助闭环）
- 同 IP 每小时限 5 单；faq 关键词表在 lib/support.js 顶部，持续补充

## 六、运行手册（自动化日常）

| 频率 | 动作 | 谁做 |
|------|------|------|
| 每小时 | 抓数任务刷新 packs → trending/feed 自动更新 | 系统 cron（已在跑） |
| 每天 | `node scripts/yield-scan.js` 刷新 APY 池 | 系统（可挂 cron） |
| 每周 | `node scripts/treasury-allocate.js` 出分配计划 | 系统；用户签名执行 |
| 每周 | `node scripts/referral-payout.js` 出返利计划 | 系统；用户签名执行 |
| 随时 | 收入核对：只认 external_usdc + txHash | `scripts/revenue-truth` 系列 |

## 七、待用户动作（唯一的人工环节）

1. **开支付宝/微信商户号** → 把收款码/商户号信息发给系统更新落地页（人民币直销闭环的最后一块）
2. **扫款 3 笔进金库**（0x367F… $33.42+0.058 ETH、0x6350… $121.37、0xFC24… $8.30 ≈ $163.09）
   → 扫完把 txHash 给系统 `--record` 记账，复利循环的燃料即到位
3. **轮换泄露密钥**：`config/credentials.json` 与 git remote URL 里的 ghp_ token
4. **the402.ai 2026-11-21 关闭**：关闭前导出数据、转出该平台 USDC
