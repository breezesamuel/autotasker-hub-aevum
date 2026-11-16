# 支付密钥配置状态报告

## ✅ 已完成

### 微信支付 (WeChat Pay v3)
| 字段 | 值 | 状态 |
|------|-----|------|
| 商户号 (mchid) | 1751774473 | ✅ 已配置 |
| AppID | 1751774473 | ⚠️ 需验证是否与商户号绑定 |
| APIv3密钥 | `Lxybingdashan...` | ✅ 已配置 |
| 证书序列号 | `3b41b3f1...` | ✅ 已配置 |
| 商户私钥 | `apiclient_key.pem` | ✅ 已加载 |
| 商户证书 | `apiclient_cert.pem` | ✅ 已加载 |

**测试结果**: API调用成功，返回 `NO_AUTH` — **AppID 和商户号未关联**。

**解决方法**: 
1. 登录 https://pay.weixin.qq.com → 账户中心 → API安全
2. 确认 AppID (`1751774473`) 已与商户号 (`1751774473`) 绑定
3. 如未绑定，在「API证书」页面添加授权

### 支付宝 (Alipay RSA2)
| 字段 | 值 | 状态 |
|------|-----|------|
| 应用公钥 | ✅ 已配置 |
| 应用私钥 | ✅ 已配置 |
| 支付宝公钥 | ✅ 已配置 |
| AppId | `2021001192614567` | ⚠️ **占位符** |

**测试结果**: API调用成功，返回 `40002 Invalid Arguments` — **AppId 无效**。

**解决方法**:
1. 登录 https://open.alipay.com/platform/appManage.htm
2. 找到你的应用，查看真实 AppId（通常是 16 位数字）
3. 运行以下命令更新配置：
```bash
ssh root@8.155.53.12 "node -e \"
const fs=require('fs'); 
const k=JSON.parse(fs.readFileSync('/www/autotasker/app/config/keys/alipay.json')); 
k.appId='你的真实AppId'; 
fs.writeFileSync('/www/autotasker/app/config/keys/alipay.json', JSON.stringify(k,null,2));
\""
```

## 📋 API 端点状态

| 端点 | HTTP方法 | 状态 | 说明 |
|------|----------|------|------|
| `/api/pay/alipay` | GET | ✅ 200 | 支付宝配置状态 |
| `/api/pay/wechat` | GET | ✅ 200 | 微信支付配置状态 |
| `/api/pay/alipay/qrcode` | POST | ⚠️ 需要真实appId | 生成付款码 |
| `/api/pay/wechat/qrcode` | POST | ⚠️ 需要绑定AppID+MCHID | 生成付款码 |

## 🔧 下一步操作清单

- [ ] 从支付宝开放平台获取真实 AppId 并更新配置
- [ ] 在微信商户平台确认 AppID 与商户号已绑定
- [ ] 提交扫款 txHash 解锁 $162.87 USDC dormant funds
- [ ] 测试真实付款流程（建议先用沙箱环境测试）

## 💡 重要提示

这两个支付渠道都是**人民币收款**通道，适合中国用户：
- 支付宝：扫码付，即时到账
- 微信支付：小程序/公众号/APP内支付

配置完成后，用户可以通过以下方式付款：
1. 访问 `/api/pay/alipay/qrcode?orderId=X&amountCny=Y` 获取支付宝二维码
2. 访问 `/api/pay/wechat/qrcode?orderId=X&amountYuan=Y` 获取微信支付二维码
