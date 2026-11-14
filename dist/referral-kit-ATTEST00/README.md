# AutoTasker Hub — 中文社媒热点数据

**一句话**：微博/知乎/豆瓣/B站/贴吧实时榜单 → MCP 接口 → AI Agent 直连调用

## 为什么选它
- **按次计费**：每次调用 $0.05（USDC on Base），无预充值、无订阅浪费
- **MCP 原生**：3 行配置接进任何 Claude/Cursor/AutoGPT 会话
- **推荐返利 10%**：通过下方链接访问并完成首次支付，推荐人自动获得返利到钱包
- **账本公开透明**：每笔外部收入带 txHash，全可在 chain explorer 验证

## 快速开始
1. 点击推广链接：[https://autotasker.highkingflower.com/r/ATTEST00](https://autotasker.highkingflower.com/r/ATTEST00)
2. 页面顶部「免费样例」按钮直接查看 JSON 返回结构
3. 调用 `GET /api/x402/hotlist?board=weiboHot&limit=5`（需携带 x402 signature）
4. 或走 MCP：先 `POST /mcp initialize` → `tools/list` → `tools/call get_hotlist`

## 价格表
| 产品 | 价格 | 说明 |
|------|------|------|
| hotlist / search | $0.05 | 单次榜单或关键词检索 |
| full export | $0.50 | 全量数据导出（含元数据） |
| utility tools | $0.01 起 | 数据分析辅助工具集 |
| 人民币套餐 | ¥29~299 | 日报/导出/API 包月（支付宝/微信商户号） |

## 推广码
复制以下链接发给任何人，他们通过此链接注册并完成支付后，你自动获得 10% 返利：
```
https://autotasker.highkingflower.com/r/ATTEST00
```

查询我的推广战绩：`https://autotasker.highkingflower.com/api/ref/stats/ATTEST00`
