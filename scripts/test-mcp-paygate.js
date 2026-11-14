// Local test: MCP payment gate — no header = 402; fake header = rejected
const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_hotlist', arguments: { board: 'weiboHot', limit: 3 } } });
const base = 'http://127.0.0.1:8796/mcp';

async function call(label, headers) {
  const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  const text = await r.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
  console.log('=== ' + label + ' ===');
  console.log('HTTP', r.status);
  const structured = parsed && parsed.result && parsed.result.structuredContent && parsed.result.structuredContent.paymentRequired;
  if (structured) {
    console.log('paymentRequired.error:', String(structured.error).slice(0, 140));
    console.log('accepts:', JSON.stringify(structured.accepts));
  } else if (parsed && parsed.result && parsed.result.content) {
    console.log('RESULT CONTENT:', String(parsed.result.content[0].text).slice(0, 160));
  } else {
    console.log('BODY:', text.slice(0, 200));
  }
  console.log('');
}

(async () => {
  await call('1. NO HEADER (expect 402)', {});
  await call('2. FAKE HEADER (expect verification failed)', { 'payment-signature': 'eyJmYWtlIjp0cnVlfQ==' });
  await call('3. GARBAGE HEADER (expect invalid payload)', { 'payment-signature': 'not-json-at-all' });
})();
