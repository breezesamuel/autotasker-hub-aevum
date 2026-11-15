# v16 — Trading Decision Loop (paper-first) + Vendored Skill Library

> 交付日期: 2026-11-15 · 生产: https://autotasker.highkingflower.com · cron: 20条

## 背景

三轮GitHub深挖（510+仓库扫描、23个元数据核查、227个SKILL.md枚举、9个核心技能原文精读）后落地的两件事：

1. **vendor技能库** `skills-trading/` — 82个SKILL.md，4包MIT，commit-SHA钉死（见 `skills-trading/VENDORED-SKILLS.json`）
2. **v16决策回路** — 把技能库里的"决策正确率机器"变成可运行的代码

## 决策正确率：从口号到度量

| 机制 | 来源技能 | 我们的实现 | 验证 |
|------|----------|-----------|------|
| 熔断器 | tradermonty/drawdown-circuit-breaker | `edge-gate.js`: 日−2% HALT、连亏2笔24h COOLDOWN、周−5%/月−8% HALT、maxDD≥20%全停 | test-v16 HALTED/COOLDOWN 5项 |
| 纪律门 | tradermonty/pre-trade-discipline-gate | 无计划/无止损/超计划仓位/confidence未声明 → BLOCKED（fail-closed） | test-v16 BLOCKED 2项 |
| 分数Kelly | agiprolabs/kelly-criterion | f\*=(p·b−q)/b × 0.25，上限2.5% NAV；样本<5笔→固定1%研究仓；f\*≤0→BLOCKED | test-v16 ALLOWED 2.5% + negative-edge |
| 证伪校准 | kalshi-bot edge harness | `edge-calibration.js`: Brier/log-loss分桶 + 预测偏差≥10pp自动haircut + 期望≤0类别自动Block | test-v16 3项 |
| 账本记忆 | trader-memory-core + vizier | `trading-journal.js`: thesis YAML式账本，**gated-out决策也记账**（校准的是门本身） | idempotent守卫测试 |

**关键数学**（全部可度量，非保证）：40%胜率需盈亏比≥2:1才有正Kelly（满Kelly也仅+10%，最大回撤50-80%→实务用0.25x）；27,566笔公开回测证明高频紧止损被成本杀死（<0.25%止损=净−0.61R/笔）。因此回路是**中等频率(4h tick)+成本入模(0.02R/笔)+paper-first**。

## 运行时模块（全部离线可测、fail-closed）

```
lib/trading-journal.js   thesis账本 + paper账户状态(equity/maxDD/日周月pnl/连亏) + Brier
lib/edge-gate.js         纯函数决策门：纪律→熔断→Kelly sizing（EDGE_GATE_OFF=1→MANUAL_REVIEW，绝不跳到ALLOWED）
lib/edge-calibration.js  edge policy：Block负期望类别 + 过自信haircut（持久化 data/edge-policy.json）
scripts/trading-loop.js  循环：4数据源轮询(CoinGecko→Binance→OKX→Bybit,全零密钥) → 建thesis → 政策 → 门 → paper开仓 → 24h结算
```

端点：`GET /api/trading/report` · `GET /api/trading/policy` · `POST /api/trading/gate`(干跑) · `POST /api/trading/cron`(5分钟幂等守卫)
cron：`trading-loop` 每4h（第20条）

## 数据流

- 结算：target +2R / stop −1R，24h高低点近似since-open极值（文档化局限）；双触发按**最坏情况**记账（fail-closed）
- 费用：每笔 −0.02R（taker往返+滑点估计）
- 升级路径：forward-only记录≥30天且期望>0才讨论真实小仓位；当前**不存在**任何交易所key

## 验证

| 套件 | 结果 |
|------|------|
| test-v16（本地）| **22/22** |
| verify-v13.js（生产）| v16 4项新增（report/policy/gate干跑/cron）|
| 全库 | test-v13b 11/11 + test-v14 12/12 + test-v14b 11/11 |

## 升级与保护

- REMOTE_ONLY新增：`data/trading-journal.json`、`data/edge-policy.json`、`data/trading-loop.json`
- `scripts/vendor-trading-skills.py` 可重跑（SHA会漂移→重钉）
- 本地测试污染通过 `scripts/cleanup-test-data.js` 步骤7重置

## 声明

Not financial advice。paper-only，无实盘执行路径。校准数字（Brier/期望R）是该系统**自我诚实**的工具——负期望类别会被自己的policy拦下，与是否"看涨"无关。
