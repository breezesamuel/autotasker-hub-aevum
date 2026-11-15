# v14 设计文档 — 撮合引擎 + 定价学习闭环

> 状态：DESIGN（等 v13 部署完成后开工）
> 输入源：HISTORY-AUDIT-2026-11-15 §四（系统侧未解决问题清单）

---

## 背景：为什么是这两个

审计结论：功能过剩、流量不足、转化闭环不完整。
- Bounty 平台有"发布/领取"但**没有撮合**——任务发布后靠运气被看到
- 价格 Bandit 在 v13 只做**数据收集**（arm 恒 1.0），per-request 价格覆写推迟
- 空投分配器能创建批次但**执行要手工签名**

v14 把这三条"最后一公里"补上。

---

## 模块1：Bounty 撮合引擎（lib/bounty-matching.js，新文件）

### 数据模型
```
worker profile: { wallet, skills:[], completedCount, avgRating, reputation(0-100) }
task: 现有 bounty + { requiredSkills:[], difficulty, deadlineHours }
match score = skillOverlap*0.5 + reputation/200*0.3 + availabilityBonus*0.2
```

### 行为
1. `matchTask(taskId)` — 为任务找 top3 worker，附匹配理由
2. 任务发布时自动匹配 → 匹配结果写入 `data/bounty-matches.json` → 若有 Telegram token 则推送
3. `bumpStale()` — cron 每6h：超72h无人领的任务自动刷新曝光（重推 IndexNow + 更新 /bounty 页）
4. 完成任务后 `updateReputation(wallet, rating)` — 指数移动平均，信誉分影响排序权重

### 门槛
- 撮合只做"推荐展示"，不自动派单（避免刷子套利）
- 信誉分冷启动 = 50，防新号白吃排序红利

---

## 模块2：per-request 定价覆写（改造 x402-v4.js 定价点）

### 前提（v13 遗留决策）
先 grep smart-pricing 的调用位置，确认价格是否每请求可变：
- **情况A（可变）**：`pickArm(tool).multiplier` 乘上去，challenge 发出时 `recordImpression`，结算时带 arm → bandit 完整闭环
- **情况B（静态）**：把 REST_ROUTE_CONFIGS 的 accepts 构造从"启动时一次"改为"每请求惰性生成价格"，成本=每个402响应多一次 pickArm（微秒级，可接受）

### 风险控制
- arm 变动幅度 ≤ ±30%，且 Bazaar 价格展示跟随（避免标价与实收不符的投诉）
- 全局 kill switch：`PRICING_BANDIT_OFF=1` 环境变量直接短路回规则价

---

## 模块3：空投自动执行（等扫款资金到位后激活）

### 触发链
```
扫款txHash确认(×3) → treasury-allocate --record → 30/60/10 分配
→ stable桶 ≥ $20 且 airdrop.pending ≥ 1 → 自动execute
```

### 执行方式（二选一，按 gas 成本）
- 方案A：金库私钥直接 EIP-3009 transferWithAuthorization × N（gas ~$0.01/笔，Base上可行）
- 方案B：批量合约（需部署，1次gas换N次转账，>$50批次时用）
- 空投上限硬编码 $5/批次（防爆仓），超出部分排队下批

### 安全
- 执行前余额复查（RPC 实查，不信账本）
- txHash 幂等：同批次重放直接跳过
- 私钥读 `config/keys/`，日志只打地址

---

## 模块4（轻量）：运营周报增强

现有 export-weekly-report.js 输出追加三张表：
1. 归因渠道ROI Top10（v13 数据）
2. Bandit 臂收益对比（v13/v14 数据）
3. Bounty 撮合成功率（v14 数据）

---

## 验收清单（全部进 verify-v14.js）
- [ ] POST /api/bounty/create 带 requiredSkills → GET /api/bounty/match/:id 返回 top3
- [ ] 信誉分更新后排序变化
- [ ] bandit arm 真实生效（观察 402 响应中价格 = 规则价 × arm）
- [ ] kill switch 生效
- [ ] 空投自动执行 dry-run（无资金时返回明确 blocked 原因）
- [ ] 回归：e2e 22/22 + verify-v13 全绿

## 依赖
- v13 部署完成（归因+bandit 在线）
- 模块3 需要：扫款 3 笔 txHash（用户侧，当前唯一硬阻塞）
