# 紧急操作清单
**生成日期**: 2026-11-13 | **优先级**: HIGH

---

## 第一步：确认钱包身份（今天）

打开 **MetaMask**，看看地址 `0x367F1b3D8Ca90D1e087481a9A40d585Bf3451a03` 是否是你的主 Base 钱包。

如果是 → 确认那些每 12 小时转出的 `$0.2–0.5` 是不是你自己的订阅/定投/交易所充值。可以在 Etherscan 上看那笔交易的备注和接收方地址详情。

如果不是 → 私钥可能泄露，立即作废此钱包。

---

## 第二步：生成专用收款钱包（本机器可执行）

我可以用 ethers.js 在这里生成一对新的公私钥对，保存到 `config/keys/pay-to-new.json`（写入 .gitignore，不入库）。你要同意吗？

生成后会得到：
- 新钱包地址（公开，可以分发给任何人）
- 私钥（仅保存在本地，不会上传）

---

## 第三步：更新 Vercel 环境变量（需要你手动操作）

在 Vercel Dashboard → Settings → Environment Variables 添加：

```
PAY_TO = <新钱包地址>
PUBLIC_URL = https://你的域名
RELAYER_PRIVATE_KEY = <house钱包私钥，可在 config/keys/x402-wallet.json 读取>
X402_ALLOW_TESTNET = （空，不要设）
```

然后重新部署：
```powershell
cd F:\2026\第二次点子\repos\autotasker-hub-aevum
npx vercel --prod
```

---

## 第四步：转移资金

在你自己的 MetaMask 里：
1. 发送 `USDC($35.24)` 到新钱包地址
2. 可选地发送 `ETH(0.058)` 也可以，但新钱包不需要 ETH 来收钱

---

## 第五步：验证

部署完成后运行：
```powershell
node scripts\verify-v5.js https://你的域名
```
期望 **15/15 通过**。

---

## 关于 Aliyun ECS 的补充

172.28.194.173 是你公司内网的 ECS 私有 IP（阿里云）。我无法从外面 SSH 上去，因为：
1. 公网 IP 8.155.53.12 的 SSH 端口可能被防火墙限制
2. 本机没有安装阿里云 CLI (`aliyun`) 或 SSH 密钥

如果你能访问这台 ECS，请自己登录进去看看有没有部署过任何与 crypto/wallet 相关的脚本。

---

*下一步：请回复"同意"我为你生成新钱包，或告知其他指示。*
