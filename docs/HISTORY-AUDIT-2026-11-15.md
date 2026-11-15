# AutoTasker Hub 全历史审计 — 2026-11-15

> 目的：从全部会话历史中提取"已解决/未解决/被遗忘"的问题，为 v13+ 深挖定锚。
> 证据源：docs/ 下 20+ 份报告、git log 全量、生产实测、链上对账。

---

## 一、演进时间线（v1 → v12）

| 版本 | 日期带 | 核心交付 | 状态 |
|------|--------|---------|------|
| v1-v3 | 早期 | x402 hand-rolled + Bazaar 概念 | 已被取代 |
| v4 | ~11-12 | MCP server + 34 工具 + 中国热搜实时数据 | ✅ 生产 |
| v5 | ~11-13 | 官方 SDK + PayAI facilitator 迁移（主网USDC真实结算）| ✅ 生产 |
| v5b/v6 | 11-13/14 | ECS 生产部署、分销返利10%、FAQ、SEO、offer.html、对账 | ✅ 生产 |
| v7 | 11-14 | 智能定价、客户健康、支付UX | ✅ 生产 |
| v8 | 11-14 | 欺诈防御、趋势预测、内容工厂（4语言）| ✅ 生产 |
| v9 | 11-14 | /ops 面板、软限流、内容直达生产 | ✅ 生产 |
| v10 | 11-14 | 资产扫描、Bounty 5%、写作赚币+公益0.1%、支付集成桩 | ✅ 生产 |
| v11 | 11-15 | 扫款监控、空投分配器、+10 MCP工具 | ✅ 生产(已API推送) |
| v12 | 11-15 | 可验证公平游戏引擎、Solana真RPC扫描、dormant真实化、+3 cron | 🔄 部署中 |

**规模：24+ 自主模块 × 16 cron × 60+ 端点 × 8 收入维度**

---

## 二、已解决问题账本（证明系统能力）

| # | 问题 | 根因 | 解法 |
|---|------|------|------|
| 1 | GitHub push 被GFW阻断 | github.com git-over-HTTPS 不稳 | `gh-push-via-api.js` 走 api.github.com Git Data API |
| 2 | Vercel 12-function 限制 | Serverless 架构不匹配 | 转 ECS systemd 常驻（正确决定）|
| 3 | 测试网假收入 | accepts 指向 Base Sepolia | v5 迁移主网 + `REVENUE-TRUTH.md` 对账纠偏 |
| 4 | 账本虚报 $224.70 | 模拟数据混入对外口径 | ledger-truth/audit-payments 双审计脚本 |
| 5 | zod MODULE_NOT_FOUND | npm ci --omit=dev 漏 transitive deps | `fix-npm.py` 全量 install |
| 6 | SSE 被 nginx 缓冲 | proxy_buffering | `X-Accel-Buffering: no` + 15s 心跳 |
| 7 | i18n 多语言重复收录 | /en /ja /kr 副本 | 301 → canonical |
| 8 | Windows GBK 控制台 | emoji/中文输出炸 PowerShell | ASCII-safe + UTF-8 stdout |
| 9 | 沉睡资产无人看管 | $162.88 躺在3个老钱包 | sweep-monitor + dormant-finder + cron |
| 10 | 结算黑洞（部分路由漏钩子）| 双结算路径 | 统一 onAfterSettle |
| 11 | 游戏结果不可信 | Math.random() 状态桩 | v12 commit-reveal 可验证公平 |
| 12 | Solana 扫描是空壳 | 误以为必须有 RPC key | 公网 RPC 只读扫描零密钥 |

---

## 三、未解决问题 — 用户侧（等输入，共7项）

| # | 问题 | 阻塞什么 | 价值 |
|---|------|---------|------|
| 1 | **扫款 txHash ×3** | $162.88 进金库 → 30/60/10 复利启动 | 🔥 最高 |
| 2 | 滴漏脚本确认/停止 | 扫款金额漂移风险 | 🔥 高（扫款前置）|
| 3 | 微信 APIv3 密钥 | 人民币收款码 | 高 |
| 4 | 支付宝 AppId | 同上（密钥已入库只差AppId）| 高 |
| 5 | Telegram Bot Token | 手机实时告警 | 中 |
| 6 | Reddit Client ID/Secret | r/china_wwr 自动发帖 | 中 |
| 7 | Solana 钱包私钥 | Solana 链扫到资产后的扫款 | 低（先有资产再说）|

## 四、未解决问题 — 系统侧（我们自己能干，v13 主攻）

| # | 问题 | 现状 | v13 动作 |
|---|------|------|---------|
| 1 | **归因断裂**：哪个内容页/渠道真带来结算？ | funnel-tracker、channel-stats 各自为政，无统一 stitch | `lib/attribution.js` 多触点归因 → 渠道ROI表进 /ops |
| 2 | **定价靠拍脑袋**：时段+阶梯，但无实验反馈 | smart-pricing 有规则无学习 | `lib/pricing-bandit.js` ε-greedy 价格臂实验 |
| 3 | sweep-monitor 沉睡金额恒$0 | 状态文件初始化后不回读 dormant-assets.json | 扫描时自动同步真实值 |
| 4 | the402 关闭（11-21）| 已确认零代码依赖，用户侧2动作 | 清单已发（THE402-SHUTDOWN-CHECKLIST.md）|
| 5 | Bounty 撮合太浅（发布/领取，无匹配）| 无 skill 匹配、无信誉分 | v14：技能标签匹配 + 信誉系统 |
| 6 | 内容工厂产物多但分发薄 | IndexNow 已接线✅；HN cron✅；其余平台缺token | 等用户token；先把 per-page 转化数据闭环 |
| 7 | credentials.json 明文密钥轮换 | ghp_ token 在 remote URL | 已可API绕行推送，低优 |

---

## 五、收入真相（永远记住的锚）

```
真实 x402 客户收入(30天):  $0.097   (26笔, ~1单/天)
链上可动用余额:            $35.55    (混有个人资金, ~$0.5/天流出)
沉睡可回收:                $162.88   (3钱包, 等扫款)
对外口径纪律:              只报链上可验证数字
```

**核心结论：系统瓶颈不是功能（功能已远超流量消化能力），是流量和第一笔扫款。
每个新功能若不带获客或转化闭环，边际价值≈0。**

→ 因此 v13 只做两类事：
A. **转化闭环**（归因+价格实验）——让已有流量变钱的概率最大化
B. **扫款解锁路径**（监控自动化已就绪，等用户3笔txHash）

---

## 六、v13+ 路线图

```
v13 (本轮)  归因引擎 + 价格bandit + sweep-monitor真实数据同步
v14 (待命)  Bounty 匹配引擎 + 信誉分 + 空投自动执行(等扫款资金)
v15 (待命)  订阅制 API keys 分层 + 白标 MCP 端点
永远做      每个新端点必须进 verify 脚本 + REMOTE_ONLY 保护评估
```

## 七、安全红线（不变）

- 私钥只在 `config/keys/`（gitignored），输出只打派生地址
- house_e2e 测试流量永不并入生产账本
- 部署 REMOTE_ONLY 清单保护累计数据（现 30+ 文件）
- 告警 webhook 失败只 warn 不阻塞
- 对外收入口径只报链上可验证数字
