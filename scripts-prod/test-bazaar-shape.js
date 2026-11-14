// test-bazaar-shape.js — figure out the correct declareDiscoveryExtension config + result shape
const { declareDiscoveryExtension, validateDiscoveryExtension, validateBazaarRouteExtensions } = require('@x402/extensions/bazaar');

const candidates = [
  {
    label: 'A: query style with urlTemplate',
    config: {
      input: { method: 'GET', urlTemplate: '/api/x402/hotlist?board={board}&limit={limit}', params: { board: 'weiboHot', limit: 10 } },
      output: { example: { items: [{ title: 'x', source: 'weibo' }] }, schema: { type: 'object', properties: { items: { type: 'array' } } } },
    },
  },
  {
    label: 'B: flat query style',
    config: {
      method: 'GET',
      urlTemplate: '/api/x402/hotlist?board={board}&limit={limit}',
      params: { board: 'weiboHot', limit: 10 },
      output: { example: { items: [{ title: 'x' }] }, schema: { type: 'object', properties: { items: { type: 'array' } } } },
    },
  },
  {
    label: 'C: minimal with description',
    config: {
      method: 'GET',
      urlTemplate: '/api/x402/hotlist?board={board}',
      params: { board: 'weiboHot' },
      description: 'Trending Chinese social media posts',
      output: { example: { items: [] }, schema: { type: 'object' } },
    },
  },
];

for (const c of candidates) {
  console.log(`\n=== ${c.label} ===`);
  try {
    const ext = declareDiscoveryExtension(c.config);
    console.log('keys:', JSON.stringify(Object.keys(ext)));
    const inner = ext.bazaar || ext;
    console.log('inner keys:', JSON.stringify(Object.keys(inner)));
    if (inner.info) console.log('info keys:', JSON.stringify(Object.keys(inner.info)));
    if (inner.schema) console.log('schema keys:', JSON.stringify(Object.keys(inner.schema)));
    if (validateBazaarRouteExtensions) {
      try { validateBazaarRouteExtensions(ext); console.log('validateBazaarRouteExtensions: OK'); }
      catch (e) { console.log('validateBazaarRouteExtensions FAILED:', e.message.slice(0, 200)); }
    }
  } catch (e) {
    console.log('declare threw:', e.message.slice(0, 200));
  }
}
