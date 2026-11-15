# Delivery — v15 + v16 (2026-11-15)

> 本轮交付：v15 动态定价bandit + 空投自动执行；v16 paper交易决策回路 + 82个vendored交易技能库；外加一次系统性bug sweep。

## 1. v15 — 定价bandit接入实时x402 + 空投自动化

| 模块 | 变更 |
|------|------|
| `lib/pricing-bandit.js` | `pickArmWindow(tool)` — 确定性15分钟窗口冻结arm：同一(tool,window)恒返回同arm，**进程重启也不变**（窗口边界由时间戳整除决定）。解决per-request随机arm与x402的冲突（402报价金额≠verify金额→结算失败） |
| `lib/x402-v4.js` | `makeAccepts` 第7参 `toolName`；social循环传routeName、utility循环传tool.name；`recordConversion(tool, null, usd)` 空窗口正确解析 |
| 已知取舍 | WeakSet按ctx对象去重；SDK用新ctx调verify时偶发双计数（文档化，偏保守方向——高估失败即降价，安全侧） |
| Kill switch | `PRICING_BANDIT_OFF=1` → 回退规则定价 |
| `lib/airdrop-distributor.js` | `autoExecute`：6门全过才执行（dry-run默认）；直连ERC20 transfer（ethers v6.17.0，非EIP-3009中继）；`POST /api/airdrop/auto-exec`（ADMIN_TOKEN守卫） |
| 报表 | `scripts/export-weekly-report.js` 新增attribution/bandit/matching三表 |

## 2. v16 — 决策正确率从口号变成可度量

### 技能库 vendor 安装
`skills-trading/` — **82个SKILL.md / 277文件 / 3.3MB**，4包MIT、commit-SHA钉死（`VENDORED-SKILLS.json`）：
tradermonty(13) 决策核心 · agiprolabs(7) 量化数学 · awesome-quant(45) 资料库 · hypergrok(17) 交易台纪律。
重跑安装：`python scripts/vendor-trading-skills.py`（GitHub API tarball，绕墙）。

### 运行时（paper-first，无任何交易所key）
```
lib/trading-journal.js    thesis账本：开/平/取消/gated-out全记录（门本身也被校准）
                          paper账户：equity/maxDD/日周月pnl/连亏/Brier
lib/edge-gate.js          纯函数决策门：纪律→熔断→分数Kelly
                          熔断：日-2% HALT · 连亏2笔24h COOLDOWN · 周-5%/月-8% HALT · maxDD≥20%全停
                          Kelly: f*=(pb-q)/b ×0.25，≤2.5% NAV；样本<5→固定1%探针；f*≤0→BLOCKED
                          EDGE_GATE_OFF=1 → MANUAL_REVIEW（fail-closed，绝不跳ALLOWED）
lib/edge-calibration.js   Brier/分桶校准 + 过自信haircut(≥10pp降级) + 负期望类别自动Block
scripts/trading-loop.js   扫描(4源链：CoinGecko→Binance→OKX→Bybit全零密钥)→thesis→policy→gate→paper开仓→24h结算
```

### 端点 + cron
- `GET /api/trading/report` · `GET /api/trading/policy` · `POST /api/trading/gate`（干跑无副作用）· `POST /api/trading/cron`（5分钟幂等守卫）
- cron `trading-loop` 每4h（服务器共20条）

### 关键数学（诚实条款）
- 40%胜率需盈亏比≥2:1才有正Kelly；满Kelly最大回撤50-80% → 实务0.25x、上限2.5%
- 成本入模：每笔-0.02R；27,566笔公开回测：紧止损高频被成本杀死（<0.25%止损=净-0.61R/笔）
- 结算：+2R目标/-1R止损；24h极值近似since-open（文档化局限）；双触发按最坏情况记账
- 升级到实盘前置条件：forward-only记录≥30天且期望>0（当前不存在实盘执行路径）

## 3. Bug sweep（本轮"上下文查询、修复所有可能问题"产出）

| # | Bug | 修复 |
|---|-----|------|
| 1 | `openThesis`未持久化`stopPct`→结算静默回退2%，与开仓计划不符 | 持久化+测试断言（23/23） |
| 2 | Bybit v5字段名错误：`highPrice/lowPrice`不存在→NaN→该源结算永远跳过 | 改`highPrice24h/lowPrice24h` |
| 3 | 结算NaN数据（price/high/low缺失）→resultR=NaN→closeThesis拒绝→thesis永久挂起 | 数据有效性守卫，无效则保留open下轮重试 |
| 4 | 费用后win→loss翻转时resultR仍为正→幂等守卫拒绝平仓 | 翻转时同步强制负号 |
| 5 | `verify-v13.js` cron检查20s固定超时，但循环可达48s(4源×12s) | `postLong` 90s helper |
| 6 | verify的gate检查对非JSON响应JSON.parse会崩整个脚本 | try/catch安全解析 |
| 7 | 同一asset最多可堆4个open thesis（相关性堆积） | 同asset已open→跳过新探针 |
| 8 | `haircutConfidence`同类多band只应用最后一个gap | 取最大gap（最保守） |
| 9 | thesis文本止损显示为小数比例而非-1R | 文本修正 |
| 10 | HALTED/COOLDOWN决策reasons为空 | 填充cb+failedChecks |
| 11 | `edge-calibration.policy()`裸readFileSync→**生产首次部署`/api/trading/policy`即500**（journal文件不存在时） | try/catch空态兜底；新增smoke-require.js冒烟测试（require级，双态验证） |
| 12 | 无uncaughtException/unhandledRejection守卫（Node≥16默认崩） | 模块级守卫：rejection记日志存活；uncaught记栈+入alert队列+exit(1)交给watchdog |
| 13 | 死代码语法地雷：`utils-tools-part1.js`三处`$0.01`裸参、`find-website.js`缺括号+stray `]`（一旦启用require即崩） | 语法修复；全库逐文件语法扫描=0 BAD |
| 14 | **deploy实际保护过滤(ERE)与REMOTE_ONLY列表漂移**：bounties/bounty-matching/social-queue/trading-journal/edge-policy/trading-loop六项从未进入ERE→未来部署会用本地测试数据覆盖服务器累积账本 | ERE改为从REMOTE_ONLY程序化生成（单一事实源） |
| 15 | airdrop执行状态判定：failed=0&&sent>0即'completed'，即使有skipped（实际未发完） | completed要求零failed零skipped；partial/failed正确区分 |
| 16 | airdrop stats用`sent×totalUsd/len`估算（收件人金额不均时错账） | 按实际发送金额逐笔累加 |
| 17 | airdrop dry-run门禁无单元覆盖 | test-v14新增2项（shape + real-without-gates-stays-dry），14/14 |
| 18 | verify-v13对bounty register响应JSON.parse无守卫 | 安全解析（同#6类） |
| 19 | **attribution重启重复记账**：实时attributeSettlement的ts与ledger ts相差毫秒，`ts\|tool\|usd`指纹永不匹配→每次重启把所有实时settlement重新回填一遍，统计持续虚增 | txHash为主幂等键（实时调用补传txHash）+ 指纹仅legacy回退；backfill先查knownTx |
| 20 | SEEN_SETTLE_TX满1万即整体clear→瞬时空窗期最近交易重复可能漏进 | 环形淘汰（删最旧1000条，保住近窗去重） |
| 21 | bandit对$0.01工具做0.7x实验会因USDC两位精度四舍五入回原值（退化实验） | `shouldExperiment()`单一事实源：< $0.02锁规则价，测试锁定边界 |

## 4. 验证矩阵

| 套件 | 结果 |
|------|------|
| test-v16 | **23/23** |
| test-v13b（含v15 pickArmWindow + bandit floor） | **17/17** |
| test-v14（含airdrop门禁2项） | **14/14** |
| test-v14b | **11/11** |
| smoke-require（require级冒烟） | PASS（有/无journal双态） |
| 全库语法扫描 lib+scripts | 0 BAD |
| 静态检查 | 全部py语法通过 |
| 生产verify | verify-v13.js（34项，含v16 4项）— 待SSH恢复后执行 |

## 5. 网络故障与对策

生产SSH（8.155.53.12）在本地出口被流干扰：TCP握手成功但SSH banner/TLS应用层被黑洞（443 curl exit 28）。对策：
- `deploy-v6.py` 内置4×重试（banner_timeout=60）
- 后台循环12次×5min持续重试，恢复即自动部署
- GitHub推送改走API（不依赖git协议），`gh-push-via-api.js` 支持 `@listfile` 批量路径

## 6. 待办（阻塞项不变）

1. SSH恢复 → `server-crons.py` 装20条cron → `verify-v13.js` 全量verify → 服务器实测OKX/Bybit可达性（本地4源全墙，服务器大概率可达）
2. 扫款txHash×3 → 解锁dormant $162.87 + 30/60/10政策
3. 微信APIv3密钥 / 支付宝AppId / Telegram Bot / Reddit凭证 / Solana私钥
