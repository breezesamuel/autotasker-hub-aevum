# the402.ai 关闭倒计时 — 用户行动清单

**确认日期**: 2026-11-15 | **截止**: 2026-11-21（剩6天）

## 官方公告要点（2026-11-15实测抓取）

> the402 is closing on November 21, 2026. Paid activity has been paused since
> August 2, 2026 and will not resume. On November 21, 2026 the API and the
> dashboard will be switched off. If you have an account, sign in before then
> to download your data from Settings and to move any USDC out of a wallet
> created through the402.

## 对我们系统的影响评估

| 依赖点 | 状态 | 影响 |
|--------|------|------|
| x402 facilitator | ✅ 无依赖 | 我们用的是 PayAI (`facilitator.payai.network`)，与the402无关 |
| Bazaar 收录 | ⚠️ 名义收录 | 付费活动8月2日已暂停，来自the402的发现流量早已归零 |
| 代码引用 | ✅ 零依赖 | `lib/` 全量grep无 "the402" 字样 |
| 账本数据 | ✅ 本地权威 | `data/payments/` 在我们自己服务器，不受影响 |

**结论：系统层面零影响，无需代码改动。唯一风险是 the402 账户内若有资产/数据。**

## 你需要在 11-21 前做的（2件事）

### 1. 登录 the402.ai 下载数据
- 打开 https://the402.ai → Sign in
- Settings → Download your data（服务列表、交易历史、信誉记录）
- 保存到本地 `docs/the402-export/` 目录

### 2. 转出 the402 创建的钱包里的 USDC
- 如果当年通过 the402 创建过托管钱包，检查其余额
- 有 USDC 就在 11-21 前转到金库 `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`
- 转账 txHash 顺手提交到 `/api/sweep/confirm` 计入扫款记录

## 之后不用再管

11-21 后 the402 API/面板下线，PayAI facilitator 独立承载全部结算，
Bazaar 发现流量由 x402 官方 Bazaar + MCP 目录 + SEO 页面继续承接。
