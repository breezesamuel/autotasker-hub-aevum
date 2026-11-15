# skills-trading/ — vendored trading & decision skills (v16)

Vendored via `scripts/vendor-trading-skills.py` (GitHub API tarball, commit-SHA pinned).
All packs MIT-licensed; per-file provenance in `VENDORED-SKILLS.json`.

## Packs

| Pack | Source | Pinned SHA | Skills | Use |
|------|--------|-----------|--------|-----|
| tradermonty | [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) (MIT) | `fdfff010e1` | 13 | **decision core**: pre-trade-discipline-gate, drawdown-circuit-breaker, trader-memory-core, signal-postmortem, position-sizer, residual-edge-analyzer, backtest-expert + edge pipeline (candidate→hint→concept→draft→review→export) |
| agiprolabs | [agiprolabs/claude-trading-skills](https://github.com/agiprolabs/claude-trading-skills) (MIT) | `981e1d736c` | 7 | **quant math**: kelly-criterion, risk-management, walk-forward-validation, regime-detection, volatility-modeling, whale-tracking, mean-reversion |
| awesome-quant | [JerryLiu369/awesome-quant-skills](https://github.com/JerryLiu369/awesome-quant-skills) (MIT, per-skill notices in `NOTICE.md`) | `b191d2747a` | 45 | **library**: A股CTP, PBO overfit checks, lookahead-bias avoidance, VectorBT, VaR, funding-basis… |
| hypergrok | [galleonlabs/hypergrok-trading-desk](https://github.com/galleonlabs/hypergrok-trading-desk) (MIT) | `e5c5d55b8c` | 17 | **desk discipline**: 7-role operating model, risk limits file, trade lifecycle, post-trade review |

**82 SKILL.md total.** Reference-only (NOT vendored): roman-rr/trading-skills (NOASSERTION license — external MCP at https://signals.x70.ai/mcp), oracle3 (pip MCP, zero-key prediction-market reads), 51bitquant/ai-hedge-fund-crypto + virattt/ai-hedge-fund + TauricResearch/TradingAgents (architecture study).

## The decision-correctness chain (how these compose)

```
signal → residual-edge-analyzer(证伪) → walk-forward(过拟合)
       → drawdown-circuit-breaker(熔断: 日2%/连亏2笔24h/周5%/月8%, fail-closed)
       → pre-trade-discipline-gate(纪律门: 无计划/超仓/复仇/regime封锁 → BLOCK)
       → kelly-criterion 0.25x分数仓位(≤2.5% NAV)
       → trade → trader-memory-core thesis账本 → signal-postmortem 复盘
       → 负期望类别自动Block(校准)
```

**Hard math** (agiprolabs kelly table): 40% win rate needs ≥2:1 payoff for positive full-Kelly (+10%); full Kelly max drawdown 50-80% → practical sizing is 0.25-0.5x Kelly. Costs eat high-frequency tight-stop trading (27,566-trade public backtest: <0.25% stops = -0.61R/trade after costs).

## Runtime integration (v16 modules in this repo)

- `lib/trading-journal.js` — thesis ledger (paper-first), win-rate/expectancy/Brier per category
- `lib/edge-gate.js` — circuit breaker + discipline gate + fractional-Kelly sizing (offline, fail-closed)
- `lib/edge-calibration.js` — Brier/log-loss calibration, overconfidence haircut, auto-block of negative-expectancy categories
- `scripts/trading-loop.js` — paper decision loop (cron)
- Endpoints: `/api/trading/report`, `/api/trading/policy`, `/api/trading/gate` (evaluate only), `/api/trading/cron`

Paper-only until an edge is PROVEN over ≥30 days forward-only record. No exchange keys are held; treasury sweeps remain governed by the 30/60/10 policy.
