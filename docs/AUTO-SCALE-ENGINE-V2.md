# AutoTasker Hub — 自增长引擎 v2 架构

> **目标**：让系统变成永不关闭、自我进化、主动获客的赚钱永动机。

## 核心指标（每周追踪）

| 指标 | 来源 | 告警阈值 |
|------|------|---------|
| settledCount 日增 > 0 | ledger entries | 连续 7 天 = 0 → alert |
| attributedRevenueUsd 周环比 | weekly report | < 上周 50% → alert |
| reconciliation.ok = false | daily reconcile | 任何 mismatch → critical |
| channel.direct 占比 > 80% | channel tracker | 有机流量不足 |
| topReferrers[0].rebateAccruedUsd > $10 | metrics | 头部分销活跃 |

---

## Phase 1：立即实现（本周）

### 1. MCP Discovery Protocol ✅
- `GET /.well-known/mcp.json` — 标准 MCP 发现文档
- 包含所有工具列表、price、payTo、network
- Claude Desktop / Cursor / Windsurf 自动发现

### 2. API Key 体系（企业客户入口）
- `POST /api/keys/create` — 生成 API Key（限频 + 配额）
- `Authorization: Bearer <key>` 用于 paid routes
- 简化 x402 流程：首笔付费后绑定钱包，后续免签名调用
- 记录在 `data/api-keys.json`（独立账本，防篡改）

### 3. 动态定价层（A/B 测试友好）
- `GET /api/pricing` — 返回当前价格配置
- 支持 `?variant=A|B` 实验分组
- 计费逻辑与 UI 分离，方便随时调整策略

### 4. 数据质量评分
- 每个 source 计算 quality_score (0-100)
- 基于：新鲜度(freshness)、一致性(consistency)、完整性(completeness)
- 低质量数据自动降级，不进入 hotlist

### 5. 反爬 & 滥用防护升级
- 检测 scrapers：高频 GET 无 payment-header
- 检测 bot farms：同 IP 多 wallet claim
- 自动 block 可疑请求，记录 audit log

---

## Phase 2：下周实现

### 6. 前端仪表盘（SPA）
- `/dashboard` — 实时图表（D3.js 或轻量替代）
- 结算流水、渠道分布、ROI 曲线
- WebSocket 推送更新（可选）

### 7. Agent Onboarding Flow
- `/register` — Agent 注册页
- 生成专属 referral code + API key
- 首次使用引导（free sample → paid upgrade）
- 留存追踪（7-day active rate）

### 8. Automated Content Factory v2
- 从 trending data 生成：
  - Blog post（Markdown）
  - Twitter thread（已实现）
  - LinkedIn article
  - Reddit post
  - Newsletter
  - YouTube script（标题+大纲）
- 每6小时自动跑一次，输出到 `data/content/`

### 9. Channel Attribution Deep Dive
- UTM parameter tracking
- Referral source classification（organic/paid/sponsored）
- Lifetime value per channel

---

## Phase 3：长期演进

### 10. Predictive Trend Engine
- 基于历史数据预测下周热点
- 提前布局内容策略
- 异常检测（突发新闻预警）

### 11. Multi-language Expansion
- 英文站 `/en/trending`
- 日文站 `/jp/trending`
- 自动翻译 title/description

### 12. Partnership Network
- Affiliate program（标准化返利）
- White-label API（给其他 SaaS 用我们的数据）
- Data licensing（批量授权）

---

## 关键约束（不变）

- 🔒 私钥只存 `config/keys/`，输出零敏感信息
- 🔒 收入只进金库，不经过第三方资金池
- 🔒 测试流量永不并入生产账本
- 🔒 HFT 禁令保持
- 🔒 触达只走 inbound，不群发
- 🔒 对账 invariant：ledger ≤ chain（单向校验）
