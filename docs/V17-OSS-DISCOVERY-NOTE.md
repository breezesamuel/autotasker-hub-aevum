# v17 OSS Discovery Delivery Note
## 目标达成
- 全网发现管线（GitHub trending，11 categories，~2k req/min 限流）
- License 合规三级分类（WHITELIST / YELLOW-COPYSRIGHT / BLOCKED）
- 4 种产品化策略（CLI wrapper / MCP bridge / inference service / scheduled export）
- API 端点全部就绪：/api/oss/catalog、/api/oss/product/:id、/api/oss/discover、/api/oss/stats、/api/x402/oss/run/:id（$0.05/call）
- Cron 定时扫描：每日增量 + 每周全量
- 法律合规文档内置每个 product manifest（attribution 文案自动生成）

## 下一步（用户需手动触发首次扫描以生成实际 catalog 数据）
```bash
ssh root@8.155.53.12 "cd /www/autotasker/app && OSS_CATALOG_BATCH_MODE=max=30 node scripts/oss-discover-batch.js"
```
预期产出：~300–600 个有效仓库，按 license tier 分级入库。

## 收入模型
- 每个已发现的工具可作为独立 x402 托管端点售卖
- 定价参考：cli_wrapper $0.01/call，mcp_bridge $0.02/call，inference_service $0.10+/call
- 订阅用户批量折扣；单次调用面向无订阅 agent
- 边际成本：ECS infra hosting，上游 API 多数免费或开源

## Legal Note
This pipeline does NOT redistribute source code. It exposes managed-service proxies over upstream open-source tools — a SaaS model compliant with all major OSI licenses (MIT/Apache/BSD = full commercial freedom; GPL = host as service with attribution; AGPL = same but must expose source of modifications). Blocked tier tools (CC-BY-NC, etc.) are logged but never monetized.
