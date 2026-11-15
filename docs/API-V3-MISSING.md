# 人民币收款通道 — 状态 & 待办清单

## 一、支付宝 ✅ 已入库（config/keys/alipay.json）

| 字段 | 状态 |
|------|------|
| appPublicKey | ✅ SHA256 fp:`fe575fe26446f8fc` |
| appPrivateKey | ✅ SHA256 fp:`f581c352eb3be187`（内容未打印）|
| alipayPublicKey | ✅ SHA256 fp:`79cbaf53973c3651` |
| appKey / AppId | ⏳ 需填入（登录 open.alipay.com → 应用详情 → APPID） |
| sign/verify round-trip | ✅ PASS |

## 二、微信支付 ✅ 证书入库（config/keys/wxpay/），⚠️ APIv3 密钥缺失

| 字段 | 状态 |
|------|------|
| mchid（商户号） | `1751774473`（从目录名自动识别） |
| apiclient_cert.pem | ✅ serial `3b41b3f1…`，有效到 2031-10-14 |
| apiclient_key.pem | ✅ 配对验证 PASS（fp:`973d1d08…`） |
| wechat-pay-public.pem | ✅ (platform 公钥) |
| APIv3 密钥 | ❌ **缺失** |

### 为什么缺少 APIv3 密钥？

你给的 `密钥.txt` 是 **CSR Certificate Signing Request**（1483 字节 DER，指纹 `04e59087…`），类型 `CERTIFICATE REQUEST`——这是申请证书时生成的**请求**，不是签名用的私钥也不是 APIv3 密钥。

微信支付 APIv3 用的是 **32 位随机字符串**（字母数字混合），路径在：
```
open.weixin.qq.com → 账户中心 → API安全 → APIv3密钥 → 生成/重置
```
或旧入口：
```
pay.weixin.qq.com → 账户中心 → 账户设置 → API安全 → APIv3密钥
```

### 下一步操作
1. 打开上面任一地址，点「生成」复制出 32 位字符串
2. 发给系统执行 `scripts/_save-api-v3-key.js <32chars>`（待写）
3. 之后即可配置 JSAPI/Native 支付接口
