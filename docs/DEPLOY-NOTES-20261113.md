# AutoTasker Hub 部署报告

**时间**: 2026-11-13
**主机**: `root@8.155.53.12` (iZf8z2slk85lm3rcpyn82rZ)
**公网入口**: https://autotasker.highkingflower.com
**监听端口**: 127.0.0.1:8795（本地）→ nginx 443 SSL → public

---

## ✅ 部署状态：全部通过

| 检查项 | 结果 |
|--------|------|
| systemd 服务状态 | `active (running)` |
| `/api/status` 本地 | ✅ operational, payTo=`0xb9A9…4773C` |
| `/api/status` 公网 HTTPS | ✅ 正常返回 |
| `/mcp` JSON-RPC | ✅ POST-only（正确行为） |
| `/.well-known/x402` | ✅ 发现文档可访问 |
| `/api/x402/hotlist` 未付费 | ✅ HTTP 402（付费墙生效） |
| TLS 证书 | Let's Encrypt，有效期至 2027-02-11 |

---

## 🔑 关键配置确认

```json
{
  "payTo": "0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C",
  "protocol": "x402-v4",
  "settlement": "self-eip3009",
  "relayerConfigured": false,
  "services": ["hotlist", "search", "full"]
}
```

- `price` 产品已删除，不再售卖虚假价格数据
- `PAY_TO` 默认值已改为单一金库地址（见 `lib/x402-v4.js` 第 1 行）
- 没有私钥在服务器文件中（mode B 自广播模式）

---

## 📁 部署产物

| 文件路径 | 说明 |
|---------|------|
| `/www/autotasker/app/` | Node.js 应用代码 + node_modules |
| `/www/autotasker/data/` | 运行时日志和数据 |
| `/etc/systemd/system/autotasker.service` | systemd 单元 |
| `/www/server/panel/vhost/nginx/autotasker.highkingflower.com.conf` | nginx 443 vhost |
| `.env.production` | `PAY_TO=0xb9A9…`, `PUBLIC_URL=https://autotasker.highkingflower.com` |

---

## ⏳ 待手动操作（用户侧）

### 1. 扫款入金库
将以下三个旧地址的 USDC 余额扫到 `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`：

| 地址 | 角色 | 预估余额 |
|------|------|---------|
| `0x367F…1a03` | 平台热钱包 / AgentWorld payTo | $35.24 USDC + 0.058 ETH |
| `0x6350…dc38` | ERC-8004 agent "GENESIS" 身份钱包 | $120.20 USDC |
| `0xFC24…eBB3` | legacy 收款 | $8.30 USDC |

转完后用下面命令记录（把 txHash 替换进去）：
```bash
node scripts/treasury-allocate.js --record compound <金额> <txHash>
```

### 2. 激活外部收入链路
目前 external_usdc = $10.83，来源是 facilitator 生态。建议：
- 联系 facilitator：shawn@x402-agent-pay.com（flat fee $0.02/tx）
- 提交到 x402 Bazaar 目录（提升被发现率）
- 直接对接人民币客户走支付宝商户号（路径更干净）

### 3. 轮换 `config/credentials.json`
该文件的 Vercel/GitHub/AI 密钥已在会话中明文暴露，请尽快轮换。

---

## 📊 资金政策摘要（详见 `docs/TREASURY-UNIFICATION.md`）

- 金库：`0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`（Base / USDC）
- 分配比例：30% 储蓄 / 60% 复利 / 10% 稳定盘
- 分配门槛：≥ $10.00 才可执行
- HFT：**明确否决**（本金 ~$155 时成本 > 收益）
- 支付宝直连 USDC：**无合规通道**，推荐收人民币货款替代方案
