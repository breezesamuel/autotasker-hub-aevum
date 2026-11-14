// extend-tools.cjs — Add new high-value tools to utils-tools.js
const fs = require('fs');
let code = fs.readFileSync('api/utils-tools.js', 'utf8');

// 1. Add tool definitions before module.exports
const newDefs = `
add('bitcoin_fees','Bitcoin network fee estimates: fast/half-hour/hour/economy sat/vB. Real-time mempool data.$0.01 USDC.',{});
add('btc_usd_rate','Bitcoin spot price in USD/CNY/EUR and 50+ fiat currencies via Blockchain.info.$0.01 USDC.',{currency:{type:'string',default:'USD'}});T[T.length-1].inputSchema.required=['currency'];
add('random_cat_image','Random cat image URL from TheCatAPI.Fun visual content.$0.01 USDC.',{limit:{type:'integer',default:1,maximum:10}});
add('random_dog_image','Random dog breed image URL from Dog CEO.API returns breed + image URL.$0.01 USDC.',{});
add('random_bear_image','Produce a random placeholder bear image of given size (placebear.com).Design agent helper.$0.01 USDC.',{width:{type:'integer',default:200},height:{type:'integer',default:200}});
add('random_dog_placeholder','Produce a random placeholder dog image (placedog.me).Design agent helper.$0.01 USDC.',{width:{type:'integer',default:300},height:{type:'integer',default:300}});
`;

// Insert before module.exports
const exportIdx = code.indexOf("module.exports=");
if(exportIdx < 0){console.error('module.exports not found');process.exit(1);}
code = code.slice(0,exportIdx) + newDefs + '\n' + code.slice(exportIdx);
console.log('Added 6 new tool definitions.');

// 2. Add switch cases before default case
const defaultCase = "default:throw new Error(\"unknown util: \"+name);";
const newCases = `case 'bitcoin_fees':return runBitcoinFees(args);
    case 'btc_usd_rate':return runBtcUsdRate(args);
    case 'random_cat_image':return runRandomCatImage(args);
    case 'random_dog_image':return runRandomDogImage(args);
    case 'random_bear_image':return runRandomBearImage(args);
    case 'random_dog_placeholder':return runRandomDogPlaceholder(args);
    ${defaultCase}`;
code = code.replace(defaultCase, newCases);
console.log('Added 6 new switch cases.');

// 3. Add executor functions before module.exports
const executors = `
function runBitcoinFees(a){return gj("https://mempool.space/api/v1/fees/recommended").then(function(d){return {fastestFee:d.fastestFee,halfHourFee:d.halfHourFee,hourFee:d.hourFee,economyFee:d.economyFee,minimumFee:d.minimumFee};});}
function runBtcUsdRate(a){var cur=(a.currency||"USD").toUpperCase();return gj("https://blockchain.info/ticker").then(function(d){var rates=d[cur]||{};return {currency:cur,rate:rates.last||null,buy:rates.buy||null,sell:rates.sell||null,market:d.USD||{},timestamp:new Date().toISOString()};});}
function runRandomCatImage(a){var n=Math.min(Number(a.limit)||1,10);return gj("https://api.thecatapi.com/v1/images/search?limit="+n).then(function(d){var imgs=[];for(var i=0;i<d.length;i++){imgs.push({url:d[i].url,width:d[i].width,height:d[i].height});}return{count:imgs.length,images:imgs};});}
function runRandomDogImage(a){return gj("https://dog.ceo/api/breeds/image/random").then(function(d){return{message:d.message,status:d.status};});}
function runRandomBearImage(a){var w=a.width||200,h=a.height||200;return Promise.resolve({url:"https://placebear.com/"+w+"/"+h,width:w,height:h});}
function runRandomDogPlaceholder(a){var w=a.width||300,h=a.height||300;return Promise.resolve({url:"https://placedog.net/"+w+"/"+h,width:w,height:h});}
`;
code = code.replace("module.exports=", executors + "\nmodule.exports=");
console.log('Added 6 executor functions.');

fs.writeFileSync('api/utils-tools.js', code, 'utf8');

try {
  delete require.cache[require.resolve('./api/utils-tools')];
  const m = require('./api/utils-tools');
  console.log(`OK ${m.UTIL_TOOLS.length} tools loaded`);
  const extras = ['bitcoin_fees','btc_usd_rate','random_cat_image','random_dog_image','random_bear_image','random_dog_placeholder'];
  for(const n of extras){console.log(`  ${n}: ${m.UTIL_TOOLS.some(t=>t.name===n)?'OK':'MISSING'}`);}
} catch(e) {
  console.error('ERR:', e.message.slice(0,200));
  const lm = e.stack.match(/utils-tools\.js:(\d+)/);
  if(lm){const ls=code.split('\n');const ln=parseInt(lm[1]);for(var k=Math.max(0,ln-4);k<Math.min(ls.length,ln+3);k++)console.log((k+1)+': '+ls[k]);}
}
