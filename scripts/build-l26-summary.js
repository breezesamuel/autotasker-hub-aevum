/**
 * build-l26-summary.js — count and summarize L26 agent infrastructure tools
 */
'use strict';
const { L26_TOOLS } = require('../lib/utils-tools-level26-agents');
console.log('L26 Agent Infrastructure Tools (' + L26_TOOLS.length + '):\n');
var categories = {};
for (var t of L26_TOOLS) {
  var cat = t.description.match(/^\[([A-Z]+)\]/);
  var key = cat ? cat[1] : 'OTHER';
  if (!categories[key]) categories[key] = [];
  categories[key].push({ name: t.name, price: '$' + t._price.toFixed(2) });
}
for (var cat of Object.keys(categories).sort()) {
  console.log('--- ' + cat + ' ---');
  for (var t of categories[cat]) {
    console.log('  ' + t.name + ' -> ' + t.price + '/call');
  }
}
console.log('\nTotal: ' + L26_TOOLS.length + ' tools, $' +
  L26_TOOLS.reduce(function(s,t){return s+t._price;},0).toFixed(2) + ' total call cost range');
