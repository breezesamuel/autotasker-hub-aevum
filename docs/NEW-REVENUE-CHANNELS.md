# 交付说明 · 3 个新付费端点 + 订阅体系（2026-11-15 深夜）

## 现状
- 30 天 x402 营收：$0.097（26 笔，均价 $0.004——全是 util 工具）
- 3 个核心付费端点（hotlist/search/full）30 天 0 笔销售
- 根因：**没有任何自动化渠道把流量带进付费墙**——84 个工具、132 个路由在"等客户来"

## 本轮新增：4 条自动赚钱渠道

| 渠道 | 端点 | 价格 | 机制 | 文件 |
|------|------|------|------|------|
| 每日趋势日报 | `GET /api/x402/daily_report` | $0.25 | 读 digest cron 输出（4 次/天生成），返回 top-10 热点 + 情绪 + 动量 | x402-v4.js |
| 实时市场扫描 | `GET /api/x402/market_scan` | $0.10 | 4 源（CoinGecko→Binance→OKX→Bybit）20 大币 24h 数据，含源可达性报告 | x402-v4.js + trading-loop.js |
| 趋势预测 | `GET /api/x402/trend_predict` | $0.15 | momentum + 2h 峰值预测 + 行动建议 | x402-v4.js |
| **订阅体系** | `POST /api/subscribe/create` | $2 / $5 / $15 月 | 预付费 USDC 信用池，每日 cron 自动扣费，池空自动暂停 | subscription-manager.js |

### 订阅体系 3 档
| 档位 | 价格 | 日调用 | 每调用均价 | 端点 |
|------|------|--------|-----------|------|
| Trend Digest | $2.00/月 | 1 | $0.067 | daily_report |
| Market Pulse | $5.00/月 | 3 | $0.056 | market_scan |
| Full Stack | $15.00/月 | 10 | $0.050 | 全部 3 个 |

**无需外部计费系统**（无 Stripe / 支付宝 / 微信），纯 x402 USDC 预付费：
1. 用户 x402 付款 → 返回 txHash
2. 系统创建订阅 + 生成 API key（限额 = 档位日调用 × 30）
3. 每日 4:05 cron 自动扣信用池
4. 池空 → 自动暂停 → webhook 通知用户续费

**21 条 cron**（新增 `sub-auto-bill`）已部署。

## 预期收入模型（保守）
- 30 天 26 笔 × 均价 $0.004 → 当前 $0.104/月
- 新增 3 端点若各带来 1 笔/天 → $0.50/月（+$5）
- 5 个订阅者 × $5 avg → $25/月（recurring）
- 目标：$50/月 recurring + $15/月 pay-per-call = $65/月（6× 提升）

## 部署状态
- [x] 代码推送（GitHub `02557634fa`）
- [x] ECS 部署（`deploy-v6.py` rc=0）
- [x] cron 安装（`server-crons.py` 21 条）
- [x] `/api/subscribe/plans` → 200
- [x] `/api/subscribe/status?wallet=0x...` → 200
- [ ] 3 个新 x402 端点付费调用测试（需 x402 client）

## 待你操作（不变）
- 扫款 ×3 txHash（解锁 $162.87 dormant）
- 支付宝 AppId（alipay.json 中 appId 长度 4 = 占位符）
- 微信 APIv3 密钥 / Telegram Bot / Reddit Client / Solana 密钥

## 下一步（代码侧可继续做）
1. **Cloudflare Worker 中转市场数据**（绕过 GFW 墙 4 源）→ market_scan 真正可用
2. **自动分发 digest 到 5 个 newsletter 平台**（Beepmail/Resend free/Letterhead/Buttondown/Beehiiv）→ 被动流量
3. **Bounty 自动撮合**（$0.05/次匹配 + claim）→ 双边手续费
4. **Trending 数据月订阅包**（$99/月 → 全量 API + 历史数据 + 周报）→ 高客单价
