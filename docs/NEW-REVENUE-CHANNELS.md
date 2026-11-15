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
- [x] 代码推送（GitHub 主分支；最后 2 commit 因 token 过期未推，**已 live 在服务器**）
- [x] ECS 部署（`deploy-v6.py` rc=0，Gate 修复已上线）
- [x] cron 安装（`server-crons.py` 21 条）
- [x] `/api/subscribe/plans` → 200 · `/api/subscribe/status?wallet=...` → 200
- [x] 服务器实测 trading-loop：`scanned:20, sources:[gate ok], gated:1 (MANUAL_REVIEW)`
- [ ] 3 个新 x402 端点付费调用测试（需 x402 client）

## 关键修复：Gate.io 数据源解锁（2026-11-15）
- 原 4 源（CoinGecko/Binance/OKX/Bybit）在中国 ECS **全被 GFW 墙** → 30 天 0 笔 probe
- 新增 Gate.io（`api.gateio.ws`，免 key，2156 tickers，GFW 可直连）作为**首选源**
- 修复 `runOnce` 中 `const scan = await scan()` 的 TDZ 遮蔽 bug（变量遮蔽同名函数）
- 结果：3 个新端点里 `market_scan` 现在真正返回 20 条币价；v16 决策循环跑通（gate 判 MANUAL_REVIEW，fail-closed 正确）

## 待你操作（不变）
- 扫款 ×3 txHash（解锁 $162.87 dormant）
- 支付宝 AppId（alipay.json 中 appId 长度 4 = 占位符）
- 微信 APIv3 密钥 / Telegram Bot / Reddit Client / Solana 密钥

## 下一步（代码侧可继续做）
1. ~~市场数据源被墙~~ **已解决**（Gate.io 可直连，已上线）
2. ~~自动分发 digest 到搜索引擎~~ **部分解决**：每次 digest 生成已自动 IndexNow ping（服务器实测 200），RSS feed 已常驻
3. ~~Bounty 自动撮合~~ **已上线**：`/api/bounty/auto-match` 匹配 top worker + 自动 claim，5% 手续费（服务器实测 ok，fee=0 因暂无 open bounty）
4. **Trending 数据月订阅包**（$99/月 → 全量 API + 历史数据 + 周报）→ 高客单价
5. **恢复 GitHub 推送**：需重新提供 token（临时目录已清理）
6. 真实流量验证：3 个新 x402 端点 + 订阅体系需要 x402 客户端实际付费调用
