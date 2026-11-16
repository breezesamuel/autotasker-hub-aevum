const pi = require('./lib/payment-integration');
(async () => {
  console.log('=== Alipay Status ===');
  console.log(JSON.stringify(pi.getAlipayStatus(), null, 2));
  console.log('\n=== WeChat Status ===');
  console.log(JSON.stringify(pi.getWechatPayStatus(), null, 2));
  console.log('\n=== Test Alipay QR ===');
  const alipayResult = await pi.generateAlipayQr('DEPLOY-TEST-001', 0.01, 'AutoTasker Deploy Test');
  console.log(JSON.stringify(alipayResult, null, 2));
  console.log('\n=== Test WeChat Pay ===');
  const wxResult = await pi.generateWechatPay('WX-DEPLOY-TEST-001', 0.01, 'AutoTasker Deploy Test');
  console.log(JSON.stringify(wxResult, null, 2));
})();
