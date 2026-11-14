/**
 * utils-tools.js — AutoTasker Hub v4 utility tools (33 total, $0.01 each via x402)
 */
'use strict';
var solarlunar = require('solarlunar').default || require('solarlunar');
var pinyinPro = require('pinyin-pro');
var pinyin = pinyinPro.pinyin;
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
var TO = 12000;
function gj(u) {
  return fetch(u, { headers: {'user-agent': UA, accept: 'application/json'}, signal: AbortSignal.timeout(TO) })
    .then(function(r) { if (!r.ok) throw new Error('upstream ' + r.status); return r.json(); });
}

// CN provinces and ID validation
var PV = {11:'北京',12:'天津',13:'河北',14:'山西',15:'内蒙古',21:'辽宁',22:'吉林',23:'黑龙江',31:'上海',32:'江苏',33:'浙江',34:'安徽',35:'福建',36:'江西',37:'山东',41:'河南',42:'湖北',43:'湖南',44:'广东',45:'广西',46:'海南',50:'重庆',51:'四川',52:'贵州',53:'云南',54:'西藏',61:'陕西',62:'甘肃',63:'青海',64:'宁夏',65:'新疆',71:'台湾',81:'香港',82:'澳门'};
var IW = [7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2]; var IC = '10X98765432';
function cv(raw) {
  var id = String(raw||'').toUpperCase().trim();
  if (!/^\d{17}[\dX]$/.test(id)) return {valid:false,reason:'expected 18-digit ID'};
  var s=0; for(var i=0;i<17;i++) s+=Number(id[i])*IW[i];
  var exp=IC[s%11], bd=id.slice(6,14);
  return {valid:exp===id[17],checkDigit:{expected:exp,received:id[17]},province:PV[id.slice(0,2)]||null,birthDate:/^\d{8}$/.test(bd)?bd.slice(0,4)+'-'+bd.slice(4,6)+'-'+bd.slice(6,8):null,sex:Number(id[16])%2===1?'male':'female'};
}

// Tool definitions
var T=[];
function add(n,d,p,r){var o={type:'object',properties:p||{}}; if(r)o.required=r;T.push({name:n,description:d,inputSchema:o});}
add('weather','Current weather via Open-Meteo(city or lat/lon).$0.01.',{city:{type:'string'},lat:{type:'number'},lon:{type:'number'}});
add('fx_rates','ECB reference FX rates via Frankfurter.CNY-friendly.$0.01.',{from:{type:'string',default:'CNY'},to:{type:'string',default:'USD'},amount:{type:'number'}});
add('public_holidays','Public holidays by country+year(date.nager.at).ISO-3166.$0.01.',{country:{type:'string',default:'CN'},year:{type:'integer',default:2026}});
add('ip_geo','IP geolocation:country,region,city,ASN.$0.01.',{ip:{type:'string'}}); T[T.length-1].inputSchema.required=['ip'];
add('hn_search','Search Hacker News stories/comments via Algolia.Tech signal.$0.01.',{query:{type:'string'},limit:{type:'integer',default:5,maximum:20}}); T[T.length-1].inputSchema.required=['query'];
add('define_word','English dictionary entry with definitions and phonetics.$0.01.',{word:{type:'string'}}); T[T.length-1].inputSchema.required=['word'];
add('arxiv_search','Search arXiv papers:titles,IDs,abstracts.$0.01.',{query:{type:'string'},limit:{type:'integer',default:3,maximum:10}}); T[T.length-1].inputSchema.required=['query'];
add('lunar_calendar','Solar-lunar conversion with Ganzhi(zhigaan),zodiac,festivals.Local compute.$0.01.',{date:{type:'string',default:'today'}});
add('cn_id_validate','Chinese resident ID checksum+province+birth+sex.Local compute.$0.01.',{id:{type:'string'}}); T[T.length-1].inputSchema.required=['id'];
add('pinyin_convert','Chinese text to pinyin with tone marks.Local compute.$0.01.',{text:{type:'string'},tone:{type:'boolean',default:true}}); T[T.length-1].inputSchema.required=['text'];
add('game_deals','CheapShark game deals across Steam/Epic/GOG:sale price,savings%,Metacritic.$0.01.',{maxPrice:{type:'number',default:5},onSale:{type:'boolean',default:true},limit:{type:'integer',default:10,maximum:30}});
add('cat_fact','Random cat fact from CatFact Ninja.Fun trivia.$0.01.',{});
add('dog_breed_list','All dog breeds and subbreeds from Dog CEO API.$0.01.',{});
add('bored_activity','Random activity suggestion:type,price scale,duration,kid-friendly.$0.01.',{minPrice:{type:'number',minimum:0,maximum:10},group:{type:'boolean'}});
add('color_info','Color info(name,RGB,HSL,HSV,CMYK) for any hex code.Design helper.$0.01.',{hex:{type:'string'}}); T[T.length-1].inputSchema.required=['hex'];
add('color_scheme','Generate analogous color palette(N colors) from a base hex.$0.01.',{hex:{type:'string'},count:{type:'integer',default:5,min:2,max:12}}); T[T.length-1].inputSchema.required=['hex'];
add('datamuse_synonyms','Synonyms and related words via Datamuse lexical database.NLP helper.$0.01.',{word:{type:'string'},rel_syn:{type:'boolean'},limit:{type:'integer',default:10,maximum:30}}); T[T.length-1].inputSchema.required=['word'];
add('npm_search','Search npm registry with download counts and versions.Dev-tool finder.$0.01.',{query:{type:'string'},limit:{type:'integer',default:5,maximum:20}}); T[T.length-1].inputSchema.required=['query'];
add('spdx_licenses','Full SPDX license list(500+ licenses).Compliance/legal aid.$0.01.',{licenseId:{type:'string',description:'Optional filter:MIT,American-2.0 etc.'}});
add('random_user','Fake user profiles(gender,name,location,DOB,phone,avatar).Reqres.in upstream.$0.01.',{gender:{type:'string',enum:['male','female']},count:{type:'integer',default:1,maximum:10}});
add('comment_for_post','Fetch fake comments attached to a PostID(JSONPlaceholder).Demo/review analysis.$0.01.',{postId:{type:'integer',default:1},limit:{type:'integer',default:5,maximum:20}});
add('quote_today','Inspirational quote of the day with author and image link.ZenQuotes.io.$0.01.',{});
add('defillama_chains','Top blockchain protocols by TVL from DeFiLlama.Market overview.$0.01.',{limit:{type:'integer',default:10,maximum:50}});
add('defillama_pools','Yield/farming pool data:APY,TVL,IL risk.For DeFi analysts.$0.01.',{page:{type:'integer',default:0},limit:{type:'integer',default:10,maximum:20}});
add('espn_sports_news','ESPN sports news headlines for NFL/MLB/NBA.Free upstream.$0.01.',{sport:{type:'string',default:'nfl'},count:{type:'integer',default:5}});
add('hn_front_page','Live HN front-page stories via Algolia:title,points,comments.$0.01.',{limit:{type:'integer',default:5,maximum:30}});
add('gh_repo_info','GitHub public repo metadata:stars,forks,language,topics,license.No auth needed.$0.01.',{owner:{type:'string'},repo:{type:'string'}}); T[T.length-1].inputSchema.required=['owner','repo'];
add('translate_text','Free text translation(any supported pair) via MyMemory.en->zh.zh->en.ja->en.$0.01.',{text:{type:'string'},from:{type:'string',default:'en'},to:{type:'string',default:'zh-CN'}}); T[T.length-1].inputSchema.required=['text'];

console.log('UTIL_TOOLS count:',T.length);
