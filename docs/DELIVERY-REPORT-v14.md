# AutoTasker Hub — v12/v13/v14 交付报告

> **生产验证**: 30/30 PASS ✅ · **本地单元测试**: 11/11 + 12/12 + 11/11 ✅
> **生产**: https://autotasker.highkingflower.com · **cron**: 16条 · **本地提交**: `e3d211c`
> **推送**: GitHub API 绕行（直连持续被GFW重置）

---

## v12 — 可信娱乐 + 真实多链扫描

### 1. 可验证公平游戏引擎（`lib/games-engine.js`）
- **commit-reveal协议**：每轮 sha256(seed) 预公布 → 结果=HMAC(seed, clientSeed:nonce) → seed事后公开可复算
- 3游戏：guess-number（1-10命中3x）、daily-spin（24h冷却/4奖级）、tap-coin（20次会话抽签）
- 奖励=gig-rewards积分 → **可兑换免费API调用**（真实价值闭环，无需TON出金钱包）
- 生产实测：`verdict=VERIFIED FAIR`，冷却强制生效

### 2. Solana真实扫描器（零密钥）
- 公网RPC（api.mainnet-beta.solana.com）：getBalance + USDC SPL（mint EPjFW…Dt1v）
- **只读扫描任意地址无需任何密钥**——之前误判"必须有RPC key"
- 10分钟缓存；GET/POST双端点；扫款才需要 `config/keys/solana-wallets.json`

### 3. 沉睡资产真实化
- `findDormantAssets` 从 "coming-soon" 占位 → 输出真实扫描（**$162.87 USDC + 0.0583 ETH**）
- sweep-monitor 每次扫描自动同步 dormant-assets.json（修复恒$0缺陷）

---

## v13 — 转化学习闭环

### 4. 多触点归因引擎（`lib/attribution.js`）
- 模型：first-touch 50% + last-touch 50%，**只认钱包匹配**（单元测试教训：匿名窗口回退会污染ROI数据，已移除）
- 触点采集：/topic/:slug、/board/:board（view）、/r/:code（click）
- 结算钩子：onAfterSettle 自动归因 + 启动时账本backfill（幂等）
- 输出：`GET /api/attribution/report` → 渠道ROI表 + 内容页ROI表 + 归因率 → /ops卡片

### 5. 价格Bandit（`lib/pricing-bandit.js`）
- ε-greedy三臂 [0.7×, 1.0×, 1.3×]，目标 = **revenue per impression**（不是转化数）
- 护栏：<3笔转化不探索（保持规则价）；ε 0.20→0.05衰减
- v14再接 per-request 价格覆写（当前仅收集数据，arm=1.0）

---

## v14 — 撮合 + 分发

### 6. Bounty撮合引擎（`lib/bounty-matching.js`）
- 评分：技能重叠×0.5 + 信誉×0.3 + 分类×0.2（生产实测排序正确 0.85>0.6>0.15）
- 信誉：EMA + **反女巫单次跳升封顶+20** + 冷启动50
- 陈旧任务bump：>72h无人领 → 重推广（24h幂等），cron `bounty-bump` 每6h
- 端点：register-worker / worker/:wallet / match/:id / rate / bump-stale / matching/report

### 7. 社媒队列生成器（`lib/social-queue.js`）
- 直击**流量瓶颈**：每日自动生成4平台发布草稿（X thread≤280 / 微博≤140 / Reddit≤120+1500 / Telegram≤900）
- 防重复：标题hash记忆3天；同日幂等
- 发布流：draft → posted+回执（今天人工复制粘贴，token到位即自动化）
- cron `social-queue` 每日05:40生成

---

## 系统全景（v14终态）

**27个自主模块 × 16条cron × 70+端点 × 9收入维度**

| 新cron | 周期 | 作用 |
|--------|------|------|
| sweep-monitor | 6h | 金库+沉睡资产监控 |
| asset-refresh | 6h | 5链余额刷新 |
| dormant-refresh | 每日3:05 | dormant-finder重扫 |
| bounty-bump | 6h | 陈旧任务重推广 |
| social-queue | 每日5:40 | 4平台草稿生成 |
| (+原有11条) | | watchdog/warmup/backup/rebate/reconcile/digest/hn |

## 验证汇总

| 套件 | 结果 |
|------|------|
| verify-v13.js（生产，v12+v13+v14全端点）| **30/30** |
| test-v13b（归因+bandit）| 11/11 |
| test-v14（撮合引擎）| 12/12 |
| test-v14b（社媒队列）| 11/11 |
| e2e-v8-fixed | 22/22（v12部署时回归通过）|

## 用户侧待办（不变，按ROI排序）
1. 🔥 扫款3笔txHash → 解锁$162.87 + 30/60/10复利
2. 微信APIv3密钥 + 支付宝AppId → 人民币收款
3. Telegram Bot Token → 告警+社媒自动发布
4. Reddit Client ID/Secret → r/china_wwr自动发帖
5. the402.ai 11-21前：登录下载数据+转出钱包余额（零代码影响）
