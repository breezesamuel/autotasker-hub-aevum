# vAPI 发布 Runbook — AutoTasker Hub x402 卖家上架

> 依据: docs.vapinetwork.ai/call/sell-on-call/list-your-api.md（Checked 2026-10-30）
> 合规现状: `scripts/x402-audit.js` 本地自检 **41 passed / 0 failed**（2026-11-16）
> 纪律: 所有 payTo = 金库 `0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C`，结算 30/60/10 政策

## 一、上架前合规基线（已完成 ✅）

| vAPI 检查项 | 状态 | 实现位置 |
|---|---|---|
| status 402 | ✅ | 官方 @x402/express paymentMiddleware |
| transport 双载具 | ✅ | `lib/x402-v4.js` 402 dual-carrier patch（body 镜像 header offer） |
| version 2 | ✅ | SDK 内置 x402Version: 2 |
| fields + serviceName | ✅ | REST_ROUTE_CONFIGS `serviceName: 'AutoTasker Hub'` |
| scheme exact | ✅ | makeAccepts |
| asset 规范 USDC | ✅ | `0x833589fC…02913` @ eip155:8453 |
| pay_to 金库 | ✅ | PAY_TO=0xb9A9… |
| amount/maxTimeout/extra | ✅ | SDK 由 price 字符串生成（amount 原子单位） |
| extensions bazaar | ✅ | declareDiscoveryExtension 每路由 |
| discovery | ✅ | `/.well-known/x402`（9 个 paid 条目） |
| CORS + preflight | ✅ | 全局 CORS 中间件（expose PAYMENT-*，OPTIONS 204） |
| openapi | ⚠️ 无（单端点上架允许，可后补 `/openapi.json`） |

## 二、SSH 恢复后的执行序列

1. `python scripts/deploy-v6.py` — 上线 alipay sign 修复 + CNY 页 + 本轮 402 合规修复
2. 远程自检: `node scripts/x402-audit.js https://autotasker.highkingflower.com` → 必须 0 failed
3. 按「四、免费上架渠道」逐个发布

## 三、vAPI 发布步骤（CLI）

```bash
npm i -g vapi-network        # 或 npx vapi
vapi auth set-key            # 钱包签名登录（本地 key，不上传）
# 单端点模式（origin 模式需 OpenAPI；先走端点模式）
vapi publish https://autotasker.highkingflower.com/api/x402/headline --name "AutoTasker Headline" --description "Single top trending headline across Chinese social media" --category data
vapi publish https://autotasker.highkingflower.com/api/x402/hotlist --name "AutoTasker Hotlist" --description "Weibo/Zhihu/Douban/Bilibili/Tieba trending posts" --category data
vapi publish https://autotasker.highkingflower.com/api/x402/search --name "AutoTasker Search" --description "Cross-board keyword search across Chinese social media" --category data
vapi publish activate <slug>          # 每个端点单独激活
vapi check https://autotasker.highkingflower.com/api/x402/hotlist   # 复核
```

- 向导模式: api.vapinetwork.ai/call/my-apis/new → Discover → Describe → **Payout: 签名证明 0xb9A9…** → Go live
- 注意: 每个端点 live payTo 必须等于签名证明的钱包 → 部署后先远程 audit 再发布

## 四、免费上架渠道清单（发布顺序）

| 渠道 | 动作 | 成本 | 备注 |
|---|---|---|---|
| vAPI Call | 三端点 CLI 发布 | 0 | 买家默认限额 $0.10/次 + $1/天；headline $0.002 是 impulse 入口 |
| CDP x402 Bazaar | bazaar extensions 已内嵌，结算后自动收录 | 0 | 官方 |
| MYA monetizeyouragent.fun | 发布 skill.md manifest | 0 | 被 agent 搜索发现 |
| Smithery | MCP server 登记 | 0 | /.well-known/mcp 已有 |
| MAXIA maxiaworld.app | A2A 市场登记 | 0 | x402 V2 |
| assay-oracle-mcp | 质量预言机收录 | 0 | paid-probe 质量背书 |
| awesome-x402 | 提 PR 收录本服务 | 0 | 高质量外链 |

## 五、Stay-live 纪律

- 每小时自动 recheck；**连续 3 次失败 = 3 strikes → 下架**（服务器冻结会直接掉分发资格 → 上架后 uptime.yml 15min 探活必须保持绿色）
- 恢复流程: 修复端点 → My APIs 点 Go live 重新激活
- recheck 接受直付（direct payout）；activation 只认直付

## 六、定价与买家限额对齐（2026-11-16）

| 端点 | 价格 | vAPI 默认买家 ($0.10/call, $1/day) |
|---|---|---|
| /api/x402/headline | **$0.002** | ✅ impulse（500 次/天在默认限额内） |
| /api/x402/util/:name | $0.01 | ✅ |
| /api/x402/hotlist | $0.05 | ✅ 20 次/天 |
| /api/x402/search | $0.05 | ✅ 20 次/天 |
| /api/x402/market_scan | $0.10 | ✅ 边界（10 次/天） |
| /api/x402/daily_report | $0.25 | ⚠️ 需买家提额 |
| /api/x402/trend_predict | $0.15 | ⚠️ 需买家提额 |
| /api/x402/full, /probe | $0.50 | ⚠️ 直付买家为主 |
| 订阅（/api/subscribe/offer） | 打包 | 高频买家更划算（402 hint 已内嵌） |
