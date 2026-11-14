/**
 * utils-tools.js — AutoTasker Hub v4 utility tools (33 total, $0.01 each via x402)
 * Group A: China desk (local compute) | B: Global free-API proxies | C: Entertainment | D: DeFi/Sports/Tech
 */
'use strict';
var solarlunar = require('solarlunar').default || require('solarlunar');
var pinyinPro = require('pinyin-pro');
var pinyin = pinyinPro.pinyin;
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
var TO = 12000;

function gj(u) {
  return fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(TO) })
    .then(function(r) { if (!r.ok) throw new Error('upstream ' + r.status); return r.json(); });
}

// ── CN ID validation ──
var PROVS = {11:'\u5317\u4eac',12:'\u5929\u6d25',13:'\u6cb3\u5317',14:'\u5c71\u897f',15:'\u5185\u8499\u53e4',
  21:'\u8fbd\u5b81',22:'\u5409\u6797',23:'\u9ed1\u9f99\u6c5f',31:'\u4e0a\u6d77',32:'\u6c5f\u82cf',
  33:'\u6d59\u6c5f',34:'\u5b89\u5fbd',35:'\u798f\u5efa',36:'\u6c5f\u897f',37:'\u5c71\u4e1c',
  41:'\u6cb3\u5357',42:'\u6e56\u5317',43:'\u6e56\u5357',44:'\u5e7f\u4e1c',45:'\u5e7f\u897f',
  46:'\u6d77\u5357',50:'\u91cd\u5e86',51:'\u56db\u5ddd',52:'\u8d35\u5dde',53:'\u4e91\u5357',
  54:'\u85cf\u533a',61:'\u9655\u897f',62:'\u7518\u8083',63:'\u9752\u6d77',64:'\u5b81\u590f',
  65:'\u65b0\u7586',71:'\u53f0\u6e7be',81:'\u9999\u6e2f',82:'\u6fb3\u95e8'};
var IW = [7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2];
var IC = '10X98765432';
function cv(raw) {
  var id = String(raw||'').toUpperCase().trim();
  if (!/^\d{17}[\dX]$/.test(id)) return {valid:false, reason:'format: expected 18-digit ID'};
  var s = 0; for (var i=0;i<17;i++) s += Number(id[i])*IW[i];
  var exp = IC[s%11], bd = id.slice(6,14);
  return {valid: exp===id[17], checkDigit:{expected:exp,received:id[17]}, province:PROVS[id.slice(0,2)]||null,
    birthDate: /^\d{8}$/.test(bd) ? bd.slice(0,4)+'-'+bd.slice(4,6)+'-'+bd.slice(6,8) : null,
    sex: Number(id[16])%2===1?'male':'female'};
}

// ── Tool definitions ──
var T = [];
function add(n,d,p,r) { var obj={type:'object',properties:p||{}}; if(r) obj.required=r; T.push({name:n,description:d,inputSchema:obj}); }

// B: Global proxies
add('weather','Current weather via Open-Meteo.',{city:{type:'string'},lat:{type:'number'},lon:{type:'number'}});
add('fx_rates','ECB FX rates via Frankfurter. CNY-friendly.',{from:{type:'string',default:'CNY'},to:{type:'string',default:'USD'},amount:{type:'number'}});
add('public_holidays','Public holidays by country+year (date.nager.at).',{country:{type:'string',default:'CN'},year:{type:'integer',default:2026}});
add('ip_geo','IP geolocation: country,region,city,ASN.',{ip:{type:'string'}});
T[T.length-1].inputSchema.required=['ip'];
add('hn_search','Search Hacker News via Algolia.',$0.01,'Tech signal.');
T[T.length-1].inputSchema={type:'object',properties:{query:{type:'string'},limit:{type:'integer',default:5,maximum:20}},required:['query']};
add('define_word','English dictionary entry.',{word:{type:'string'}});
T[T.length-1].inputSchema={type:'object',properties:{word:{type:'string'}},required:['word']};
add('arxiv_search','Search arXiv papers.',$0.01,null,['query']);
T[T.length-1].inputSchema={type:'object',properties:{query:{type:'string'},limit:{type:'integer',default:3,maximum:10}},required:['query']};

// A: China desk
add('lunar_calendar','Solar-lunar conversion with Ganzhi,zodiac,festivals.Local compute.$0.01.',{date:{type:'string',default:'today'}});
add('cn_id_validate','Chinese ID checksum+province+birth+sex.Local compute.$0.01.',{id:{type:'string'}});
T[T.length-1].inputSchema={type:'object',properties:{id:{type:'string'}},required:['id']};
add('pinyin_convert','Chinese text to pinyin with tone marks.Local.$0.01.',{text:{type:'string'},tone:{type:'boolean',default:true}});
T[T.length-1].inputSchema={type:'object',properties:{text:{type:'string'},tone:{type:'boolean',default:true}},required:['text']};

// C: Entertainment
add('game_deals','CheapShark game deals across Steam/Epic/GOG.',{maxPrice:{type:'number',default:5},onSale:{type:'boolean',default:true},limit:{type:'integer',default:10,maximum:30}});
add('cat_fact','Random cat fact from CatFact Ninja.',{});
add('dog_breed_list','All dog breeds from Dog CEO API.',{});
add('bored_activity','Random activity suggestion.',$0.01,null);
add('color_info','Color info(name,RGB,HSL,HSV,CMYK). Design helper.',{hex:{type:'string'}});
T[T.length-1].inputSchema={type:'object',properties:{hex:{type:'string'}},required:['hex']};
add('color_scheme','Generate color palette(N colors) from base hex.',{hex:{type:'string'},count:{type:'integer',default:5,min:2,max:12}});
T[T.length-1].inputSchema={type:'object',properties:{hex:{type:'string'},count:{type:'integer',default:5}},required:['hex']};
add('datamuse_synonyms','Synonyms via Datamuse lexical DB.',{word:{type:'string'},rel_syn:{type:'boolean'},limit:{type:'integer',default:10,maximum:30}});
T[T.length-1].inputSchema={type:'object',properties:{word:{type:'string'},rel_syn:{type:'boolean'},limit:{type:'integer',default:10,maximum:30}},required:['word']};
add('npm_search','Search npm registry with download counts.',{query:{type:'string'},limit:{type:'integer',default:5,maximum:20}});
T[T.length-1].inputSchema={type:'object',properties:{query:{type:'string'},limit:{type:'integer',default:5,maximum:20}},required:['query']};
add('spdx_licenses','Full SPDX license list(500+ licenses). Compliance aid.',{licenseId:{type:'string',description:'Optional filter: MIT,American-2.0 etc.'}});
add('random_user','Fake user profiles for testing/demo. Reqres.in.',{gender:{type:'string',enum:['male','female']},count:{type:'integer',default:1,maximum:10}});
add('comment_for_post','Fetch fake comments attached to PostID(JSONPlaceholder). Demo.',{postId:{type:'integer',default:1},limit:{type:'integer',default:5,maximum:20}});
add('quote_today','Inspirational quote of the day. ZenQuotes.io.',{});

// D: DeFi/Sports/Tech
add('defillama_chains','Top blockchain protocols by TVL from DeFiLlama.',{limit:{type:'integer',default:10,maximum:50}});
add('defillama_pools','Yield/farming pool data: APY,TVL,IL risk.',{page:{type:'integer',default:0},limit:{type:'integer',default:10,maximum:20}});
add('espn_sports_news','ESPN sports news headlines for NFL/MLB/NBA.',{sport:{type:'string',default:'nfl'},count:{type:'integer',default:5}});
add('hn_front_page','Live HN front-page stories via Algolia.',{limit:{type:'integer',default:5,maximum:30}});
add('gh_repo_info','GitHub repo metadata:stars,forks,language,topics,license.No auth.',{owner:{type:'string'},repo:{type:'string'}});
T[T.length-1].inputSchema={type:'object',properties:{owner:{type:'string'},repo:{type:'string'}},required:['owner','repo']};
add('translate_text','Free translation(en->zh,zh->en,ja->en etc.) via MyMemory.',{text:{type:'string'},from:{type:'string',default:'en'},to:{type:'string',default:'zh-CN'}});
T[T.length-1].inputSchema={type:'object',properties:{text:{type:'string'},from:{type:'string',default:'en'},to:{type:'string',default:'zh-CN'}},required:['text']};

console.log('UTIL_TOOLS count:', T.length);
