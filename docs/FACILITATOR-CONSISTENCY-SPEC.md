# Facilitator 口径一致性规格（FACILITATOR-CONSISTENCY-SPEC）

**对象**: `https://x402-agent-pay.com/facilitator` 三个公开端点
**校验工具**: `scripts/check-facilitator-consistency.js`
**首次校验**: 2026-11-14（10 pass / 1 warn / 0 fail）
**背景**: 参见 `docs/FACILITATOR-REVENUE-TRUTH.md`（三处矛盾原文抓取）

---

## 1. 端点与字段

| 端点 | 关键字段 | 声明 |
|------|---------|------|
| `/facilitator/settlement-pulse` | `external_settled`, `external_usdc`, `house_e2e_settled`, `house_e2e_usdc`, `settled_lifetime`, `usdc_lifetime`, `privacy` | "aggregate counts only - no payer, resource or per-row amounts published" |
| `/facilitator/recent-settlements` | `total_settled`, `settled_internal`, `settled_outside`, `settled_outside_usdc`, `settlements[]`, `privacy` | "tx hash, timestamp, amount only - payer and resource stay private" |
| `/facilitator/demand` | `endpoints[]`（含 `revenue_usdc`, `payments_settled`, `host`, `path`）, `summary`, `how_to_read` | 无 privacy 声明；`how_to_read.log_window` = "roughly 48 hours" |

## 2. 不变量（Invariant）

### INV-1 — pulse 自洽
`external_settled + house_e2e_settled == settled_lifetime`
`external_usdc + house_e2e_usdc == usdc_lifetime`（容差 ±$0.011）
**作用**: 防止 external/house 两栏与总计脱节。这是收入口径的根基——**external_usdc 是唯一可对外报告的收入数字**（当前 $10.829 / 266 笔）。

### INV-2 — recent-settlements 自洽
`settled_internal + settled_outside == total_settled`

### INV-3 — 端点间交叉一致
- `recent.settled_outside == pulse.external_settled`
- `recent.settled_outside_usdc == pulse.external_usdc`（容差 ±$0.011）
- recent.settlements 行内**不得**出现 payer/from 字段（对应其 privacy 声明）
- recent.settlements 的 `resource` 值必须已掩码——不得含完整 `host/path`（正则检测 `/\.[a-z]{2,}\//i`）

### INV-4 — demand 与 pulse 的口径差异必须自解释
demand 汇总（当前 1911 笔/$103.931）≠ pulse（391 笔/$91.002），因为：
- demand 是 **48 小时轮转日志窗口**（含本 facilitator 验证的所有产品，含自付/种子）
- pulse 是 **终身累计**，且把 house_e2e 单列
差异**必须**有 scope 说明（`how_to_read.log_window`）；若无说明 → FAIL。
另校验 `summary` 汇总 == 逐行求和（防端内不一致）。

### INV-5 — pulse privacy 措辞 vs demand 聚合发布（WARN 级）
pulse 声明 "no … per-row amounts published"，但 demand 逐端点发布 `revenue_usdc`。
**裁决**: 可辩护——demand 是**端点级聚合**（per-endpoint aggregate），不是逐笔行级（per-settlement row）。
**但** pulse 措辞未区分两者，建议 facilitator 在 privacy 里补一句
"per-endpoint aggregates are published on /demand"。
此矛盾不阻塞，降为 WARN； facilitator（shawn@x402-agent-pay.com，flat fee $0.02/tx）如采纳措辞修复，本检查将转为 PASS。

## 3. 历史三处矛盾的现状

| # | 矛盾（2026-11-13 抓取） | 现状 |
|---|------------------------|------|
| 1 | pulse privacy 称 "no per-row amounts"，demand 逐条公开 host/path/revenue | 仍存在 → INV-5 WARN（聚合口径可辩护，措辞待修） |
| 2 | recent-settlements 称 "resource stays private"，却发布 resource 字段 | **已缓解**：resource 值已掩码为 "api (verified settlement)"，无 host/path 泄露 → INV-3d PASS |
| 3 | demand 1907 笔/$103.927 vs pulse 391 笔/$91.002 无口径说明 | **已解决**：`how_to_read.log_window` 明确 48h 窗口 → INV-4 PASS |

## 4. 收入口径铁律（本项目）

1. **对外只报 `external_usdc`**（当前 $10.829）。house_e2e（自付种子/e2e 检查，$80.173/125 笔）**永不并入收入**。
2. demand 的 $103.931 是 48h 全产品口径，**不是** AutoTasker 收入，禁止引用。
3. 所有引用必须带 txHash 或 basescan 链接（recent-settlements 的 explorer_url 可直接用）。
4. 每次对外发布前重跑 `node scripts/check-facilitator-consistency.js`，出现 FAIL 停止发布并复核。

## 5. 运维

```bash
node scripts/check-facilitator-consistency.js        # 全量校验
# 换 facilitator 时：
FACILITATOR_BASE=https://其他facilitator node scripts/check-facilitator-consistency.js
```
退出码：0 = 可发布；1 = 有 FAIL，不可发布。
