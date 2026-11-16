# 金库 0xb9A9 直通收入线 — 上线记录 (2026-11-16)

> 用户指令: **专注金库 0xb9A9 赚钱；旧金库 (0x367F 归集链) 不再碰，不迁移。**
> 本线原则: 所有付费端点 payTo = `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`，
> 收款 100% 直达现行金库；旧地址的钱留在原地，MetaMask 手册仅供用户自决。

## 一、为什么起这条线

- ECS (8.155.53.12) SSH 冻结 → prod 402 面不可服务。
- 旧部署（Vercel mirror + AgentPay 旧 listing）仍以 0x367F 收单 —— 旧线不动。
- 金库 0xb9A9 私钥在本机 `config/keys/pay-to-new.json` → **本机即可成为收款服务**。

## 二、新线构成（本机 · 全自动 · 24/7）

| 组件 | 状态 | 位置 |
|---|---|---|
| 服务: aevum server.js :8797 | ✅ 运行 | `scripts/serve-aevum.js` (detached, 日志 data/svc-aevum-treasury.log) |
| 公网: Cloudflare quick tunnel | ✅ 运行 | `https://reno-bay-jackets-consistency.trycloudflare.com` (data/tunnel-aevum.log) |
| 保活: watcher 每 5 分钟自愈 | ✅ 已注册 | `scripts/aevum-watch.js` + 计划任务 **AutoTasker-AevumWatch** |
| 合规: x402 审计 (远程) | ✅ **41 passed / 0 failed** | `node scripts/x402-audit.js <tunnel-url>` |
| 收款: payTo = 0xb9A9 金库 | ✅ offer 双载具已验证 | hotlist/search/probe 等 9 端点 |
| 渠道: AgentPay Store 新 listing | ✅ slug=autotasker-hub-3 pending | payee_wallet=0xb9A9, endpoint=隧道 URL |

## 三、watcher 行为（AutoTasker-AevumWatch）

1. 本机 :8797 `/api/status` 探活 → 挂了 detached 重起 serve-aevum.js
2. `data/public-urls.json` 的 `aevumTreasury` URL 公网探活 → 挂了重起 cloudflared、抓新 URL 登记
3. 只管理自己的线（8797 端口特征），不碰旧 hub(:8080)/x402(:3456) 隧道

## 四、quick tunnel 域名漂移的已知代价

- trycloudflare 免费隧道重启后域名会变 → 上架渠道的 endpoint_url 失效。
- 缓解顺序:
  1. ECS 恢复 → `python scripts/deploy-v6.py` 用固定域名 autotasker.highkingflower.com（主路径）
  2. 或用户提供 Cloudflare 命名隧道（固定子域）—— 需 CF 账号一次登录
  3. vAPI listing 每小时 recheck，域名漂移会 3-strike 下架 → vAPI 上架等固定域名再做
- AgentPay listing 更新: 重新 POST 同 slug 待验证（重提交会生成新 slug，需 store 支持编辑）

## 五、金库收入记账（本线生效后）

- 每笔 x402 settle: 买家 → PayAI facilitator (0x97acce…热钱包代发) → **0xb9A9**
- 30/60/10 政策解锁条件保持: 金库收到 sweep/结算 txHash 后逐笔验证 (`scripts/sweep-verify.js` 类似逻辑可扩展为 settlement-verify)
- 与旧线的唯一交叉点: 无（旧金库链 0x367F→0x6350/0xbd16b985 完全不再推进）
