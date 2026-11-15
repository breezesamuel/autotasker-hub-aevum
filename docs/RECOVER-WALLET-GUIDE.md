# 找回 0x6350…dc38 私钥 — 操作指南

## 方法一：MetaMask（最可能）

1. 打开浏览器 → 点击 MetaMask 狐狸图标
2. 点击右上角 **账户名称**（不是头像）→ **"账户详情"**
3. 在账号列表里找 `0x6350...dc38`
4. 点那个账户 → 右上角 **三个点** → **"导出私钥"**
5. 输入你的 MetaMask 密码
6. 复制出来的就是私钥

---

## 方法二：如果用的是 Ledger / Trezor 硬件钱包

### Ledger
1. 打开 **Ledger Live** 桌面应用
2. 左侧菜单 → **"Accounts"**
3. 找到持有 0x6350…dc38 的 Ethereum 账户
4. 点账户右上角 **三个点** → **"Export private key"**
5. 在 Ledger 设备上确认

### Trezor
1. 打开 https://trezor.io/suite/
2. 连接你的 Trezor 设备
3. 右侧菜单 → **Settings** → **Security** → **Export private key**
4. 选择对应账户，在 Trezor 设备上按按钮确认

---

## 方法三：从种子短语推导（如果你知道助记词）

如果你知道你的 12 或 24 词种子短语，可以批量推导线性地址：

```javascript
const { ethers } = require('ethers');
// 替换成你自己的助记词（不要截图发出去！）
const mnemonic = 'your twelve or twenty four words here';
for (let i = 0; i < 20; i++) {
  const path = `m/44'/60'/0'/0/${i}`;
  const wallet = ethers.HDNodeWallet.fromDerivationPath(path, mnemonic);
  console.log(`[${i}] ${wallet.address}`);
}
```

在 Node.js 里跑这段代码，找到输出中包含 `0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38` 的那一行，那一行的私钥就是你需要的。

保存为 `derive-wallets.js`，然后：
```powershell
cd F:\2026\第二次点子\repos\autotasker-hub-aevum
node scripts\derive-wallets.js
```

---

## 找到私钥之后

把私钥保存到安全的地方（不联网的设备），然后你可以：
- 在 MetaMask 里用 "Import Account" 导入
- 或者直接用它发送交易转走 $120 USDC

⚠️ **永远不要把私钥发给任何人，包括 AI 助手。**
