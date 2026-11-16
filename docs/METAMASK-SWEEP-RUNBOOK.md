# MetaMask 扫款执行手册 — 把 $257 沉睡资金归集到金库

> 生成时间: 2026-11-16 · 基于 BaseScan + Base RPC 实时链上核对

## 链上真相（2026-11-16 15:00 CST 实测）

| 钱包 | 角色 | USDC | ETH | 价值 |
|------|------|------|-----|------|
| `0xb9A9...773C` | **现行金库 (payTo)** | **0.00** | **0** | $0 ← 空库！ |
| `0x367F...1a03` | 旧金库 LEGACY_FAC | 14.18 | 0.057876 | ~$119 |
| `0x6350...dc38` | GENESIS 身份钱包 | 129.98 | 0.000415 | ~$130.7 |
| `0xFC24...eBB3` | 旧收款 LEGACY_PAYTO | 8.30 | 0 | $8.30 |

- **合计待归集: 152.46 USDC + 0.0583 ETH ≈ $257**（ETH 现价 ~$1809）
- ⚠️ `0x367F` 每 2-6 小时被一个"自购买"循环转走 0.21-0.29 USDC 到 `0x6350`（模拟收入的 dripper），每天烧掉 $1-3，**越早扫款损失越小**
- ⚠️ `0xFC24` 没有 gas，必须先由 `0x367F` 转 ~0.0002 ETH 给它作手续费

## 为什么只能由你执行

三个旧钱包的私钥不在任何服务器/本地仓库里（`data/treasury-allocation.json` 记录 `privateKeyOutsideThisMachine: true`），只在你的 MetaMask 里。金库 `0xb9A9` 的私钥已在 `config/keys/pay-to-new.json`（系统持有），所以扫款落地后系统可立即接管。

## 操作步骤（MetaMask → Base 主网，共 5 笔）

**第 0 步**: MetaMask 切到 **Base 网络**（Chain ID 8453）。如果没有，添加：RPC `https://mainnet.base.org`。

**第 1 笔 — 0x367F → 0xFC24 转 gas**
- 从: `0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03`
- 到: `0xFC24FD34da9e49A0110DCaEe3Ad30eC54175eBB3`
- 金额: **0.0002 ETH**（原生 ETH，不是代币）
- 目的: 给 0xFC24 付手续费，否则它里面的 $8.30 永远动不了

**第 2 笔 — 0x367F → 金库 转 USDC**
- 资产: USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
- 全部余额 14.18 → 到: `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`

**第 3 笔 — 0x6350 → 金库 转 USDC**
- 资产: USDC，全部余额 129.98 → 到: `0xb9A9...773C`
- （0x6350 自己有 0.000415 ETH，够 gas）

**第 4 笔 — 0x6350 → 金库 转 ETH 残值**
- 资产: 原生 ETH，全部余额 0.000415 → 到: `0xb9A9...773C`
- MetaMask 的 Max 按钮会自动扣 gas

**第 5 笔 — 0xFC24 → 金库 转 USDC**
- 资产: USDC，全部余额 8.30 → 到: `0xb9A9...773C`

**第 6 笔（可选）— 0x367F 残余 ETH 归集**
- 0x367F 剩余 ~0.0577 ETH，Max 转到金库（扣 gas 后）

## 每笔之后

把 txHash 发给系统（或贴到会话里），系统会：
1. 通过 `scripts/sweep-verify.js` 逐笔核对到账
2. 解锁 `config/treasury-policy.json` 的 30/60/10 政策
3. 启用复利桶（60% 营收再投资）

## 安全红线

- 只往 `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C` 转（系统金库，私钥已在服务器 `config/keys/pay-to-new.json`）
- 不发给任何"客服地址"、"验证地址"
- MetaMask 签名前核对前 4 位 `0xb9A9` 和后 4 位 `773C`
