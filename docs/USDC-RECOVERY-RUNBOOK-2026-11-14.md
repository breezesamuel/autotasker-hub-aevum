# USDC 收回手册 — 2026-11-14

> 目标：把散落在 3 个旧钱包的资产（USDC + ETH）全部收进唯一金库
> `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`（Base 主网），
> 解锁 ≥$10 分配门槛，启动 30/60/10 复利循环。
>
> **私钥现状**：3 个旧钱包的私钥都在你手里（本地/仓库均无），
> 所以**转账必须由你签名**——本手册给出精确参数，照做即可。
> 金库私钥在 `config/keys/pay-to-new.json`（已核验派生地址=金库）。

---

## 1. 当前链上实况（2026-11-14 实测，Base 主网）

| 钱包 | 角色 | USDC | ETH | ≈USD 小计 | gas 状态 |
|------|------|------|-----|----------|---------|
| `0x367F…1a03` | 旧平台热钱包 | $29.544687 | 0.05792392 | **$139.77** | ✅ 够 |
| `0x6350…dc38` | GENESIS 身份钱包 | $125.160364 | 0.00041501 | **$125.95** | ✅ 够（≈3 笔转账） |
| `0xFC24…eBB3` | 旧收款地址 | $8.300000 | 0 | **$8.30** | ❌ **缺 gas，先补** |
| `0xb9A9…733C` | **金库（目标）** | $0 | 0 | $0 | — |

**合计可收回 ≈ $274**（USDC $163.005 + ETH 0.0583 ≈ $111）。
主流代币已全量清点（USDbC/DAI/WETH/cbBTC/cbETH/AERO/VIRTUAL/DEGEN/BRETT/USDT/EURC）：
**ERC-20 层面只有 USDC 有余额**。GENESIS 的 ERC-8004 身份 NFT 按政策保留不动。

⚠️ **注意：有个定时任务正在滴漏**
`0x367F` 每 ~12h 转出 $0.2-0.5 到 `0x6350`（本轮实测 -$0.56，两边对应）。
这是持钥方的定时行为——先确认它是不是你自己设的自动化；
**确认后停掉它**，再扫款，避免扫到一半金额又变。

---

## 2. 扫款步骤（钱包 App 路径，推荐）

用 MetaMask/OKX/Rabbit 等导入 3 个私钥（或直接用你持有它们的钱包）：

### Step 0 · 停掉滴漏定时任务（如果你有 cron/脚本在跑）

### Step 1 · 补 gas 给 `0xFC24…eBB3`
- 从 `0x367F…1a03`（0.0579 ETH）转 **0.0002 ETH** 到 `0xFC24…eBB3`
- Base 上 gas 极便宜，0.0002 ETH 够转几十次

### Step 2 · 三笔 USDC 全额转金库
USDC 合约（Base 原生）：`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
接收方：`0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`

| 从钱包 | 金额（发送时以钱包 MAX 为准） | 扫描时刻原子值 |
|--------|------------------------------|---------------|
| `0x367F…1a03` | MAX USDC | 29544687 |
| `0x6350…dc38` | MAX USDC | 125160364 |
| `0xFC24…eBB3` | MAX USDC | 8300000 |

> 滴漏停掉后金额只增不减；用 MAX 就不会留残渣。

### Step 3 · ETH 也收回（滴漏确认停止后）
- `0x367F…1a03` 的 **0.0577 ETH**（≈$110）转金库，金库留 0.0002 ETH 做 gas 储备
- `0x6350…dc38` 留 0.0001 ETH（身份钱包偶尔要 gas），其余转金库
- `0xFC24…eBB3` 的 ETH 全部转金库后废弃

### Step 4 · 把 3+2 笔 txHash 发我
我用 `treasury-allocate.js --record` 完成复式记账并生成 30/60/10 分配计划：

```
USDC $163.005 到账后自动分配（>= $10 门槛，解锁）：
  储蓄 30%   → $48.90  （金库内 cold-savings 子账，永不进合约）
  复利 60%   → $97.80  （Aave/Morpho/Compound/Moonwell 单币 USDC，≥5% APY 目标）
  稳定 10%   → $16.30  （金库内留存，随时可用）
复利收益到账后自动 40/60 分裂：40% 转储蓄，60% 回投。
```

---

## 3. 备选：BaseScan 网页路径（不装钱包 App 时）

1. 打开 `https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913#writeContract`
2. **Connect to Web3** → 导入对应私钥的地址
3. 找到 `transfer` 函数，填：
   - `to (address)`: `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`
   - `amount (uint256)`: 上表原子值（若滴漏已停，按当时余额换算：余额×1,000,000）
4. **Write** → 钱包确认 → 得到 txHash
5. ETH 转账：`https://basescan.org/address/<from地址>` 直接用钱包发普通转账

⚠️ BaseScan 路径务必核对：合约地址、to 地址逐位核对，原子单位别错位。

---

## 4. 核对链接（basescan.org）

- 金库：https://basescan.org/address/0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C
- 旧热钱包：https://basescan.org/address/0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03
- GENESIS：https://basescan.org/address/0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38
- 旧收款：https://basescan.org/address/0xFC24FD34da9e49A0110DCaEe3Ad30eC54175eBB3

## 5. 账目口径（先说清楚）

- 扫款是**自家钱包之间的资金归集**，不是新收入——不进 revenue-ledger
- 进金库后由 `treasury-allocate.js --record` 记入 30/60/10 子账
- 复利仓位只投白名单（Aave v3 / Morpho Blue / Compound v3 / Moonwell 的 USDC 单币）
- 禁杠杆、禁 LP、禁锁仓、禁 HFT（policy 已锁定）

## 6. 辅助工具（本轮新增，随时可复跑）

```
node scripts/onchain-balance.js        # 4 地址 USDC/ETH 实时余额
node scripts/onchain-token-multicall.js # 主流代币余额清点
node scripts/key-inventory.js           # 本地密钥盘点（只显示派生地址，不显示私钥）
```
