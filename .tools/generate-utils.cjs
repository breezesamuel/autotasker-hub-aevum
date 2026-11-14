// generate-utils.cjs v3 -- ASCII-only source (Chinese via \u escapes) so no
// encoding corruption can ever happen again. Writes ../lib/utils-tools.js.
const fs = require('fs');
const path = require('path');
const o = [];
const p = s => o.push(s);

const OUT = path.resolve(__dirname, '..', 'lib', 'utils-tools.js');

p('/** utils-tools.js -- AutoTasker Hub core tool pack ($0.01 each via x402) */');
p("'use strict';");
p("var solarlunar=require('solarlunar').default||require('solarlunar');");
p("var pinyinPro=require('pinyin-pro');");
p('var pinyin=pinyinPro.pinyin;');
p("var UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';");
p('var TO=12000;');
p('function gj(u){return fetch(u,{headers:{\'user-agent\':UA,accept:\'application/json\'},signal:AbortSignal.timeout(TO)}).then(function(r){if(!r.ok)throw new Error(\'upstream \'+r.status);return r.json();});}');

// Chinese province names as \u escapes (ASCII-only source file)
const PV = {
  11: '\u5317\u4eac', 12: '\u5929\u6d25', 13: '\u6cb3\u5317', 14: '\u5c71\u897f', 15: '\u5185\u8499\u53e4',
  21: '\u8fbd\u5b81', 22: '\u5409\u6797', 23: '\u9ed1\u9f99\u6c5f', 31: '\u4e0a\u6d77', 32: '\u6c5f\u82cf',
  33: '\u6d59\u6c5f', 34: '\u5b89\u5fbd', 35: '\u798f\u5efa', 36: '\u6c5f\u897f', 37: '\u5c71\u4e1c',
  41: '\u6cb3\u5357', 42: '\u6e56\u5317', 43: '\u6e56\u5357', 44: '\u5e7f\u4e1c', 45: '\u5e7f\u897f',
  46: '\u6d77\u5357', 50: '\u91cd\u5e86', 51: '\u56db\u5ddd', 52: '\u8d35\u5dde', 53: '\u4e91\u5357',
  54: '\u897f\u85cf', 61: '\u9655\u897f', 62: '\u7518\u8083', 63: '\u9752\u6d77', 64: '\u5b81\u590f',
  65: '\u65b0\u7586', 71: '\u53f0\u6e7e', 81: '\u9999\u6e2f', 82: '\u6fb3\u95e8',
};
const pvJson = '{' + Object.entries(PV).map(([k, v]) => '"' + k + '":"' + v + '"').join(',') + '}';
p('var PV=' + pvJson + ';');
p('var IW=[7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2]; var IC="10X98765432";');
p('function cv(raw){var id=String(raw||\'\').toUpperCase().trim();if(!/^\\d{17}[\\dX]$/.test(id))return{valid:false,reason:"expected 18-digit ID"};var s=0;for(var i=0;i<17;i++)s+=Number(id[i])*IW[i];var exp=IC[s%11],bd=id.slice(6,14);return{valid:exp===id[17],checkDigit:{expected:exp,received:id[17]},province:PV[id.slice(0,2)]||null,birthDate:/^\\d{8}$/.test(bd)?bd.slice(0,4)+"-"+bd.slice(4,6)+"-"+bd.slice(6,8):null,sex:Number(id[16])%2===1?"male":"female"};}');

// Tool definitions
p('var T=[];');
p('function add(n,d,p,r){var obj={type:"object",properties:p||{}};if(r)obj.required=r;T.push({name:n,description:d,inputSchema:obj});}');

p('add("weather","Current weather via Open-Meteo (city or lat/lon). $0.01 USDC.",{city:{type:"string"},lat:{type:"number"},lon:{type:"number"}});');
p('add("fx_rates","ECB reference FX rates via Frankfurter. CNY-friendly. $0.01 USDC.",{from:{type:"string",default:"CNY"},to:{type:"string",default:"USD"},amount:{type:"number"}});');
p('add("public_holidays","Public holidays by country+year (date.nager.at). ISO-3166. $0.01 USDC.",{country:{type:"string",default:"CN"},year:{type:"integer",default:2026}});');
p('add("ip_geo","IP geolocation: country, region, city, ASN. $0.01 USDC.",{ip:{type:"string"}});T[T.length-1].inputSchema.required=["ip"];');
p('add("hn_search","Search Hacker News stories/comments via Algolia. Tech signal. $0.01 USDC.",{query:{type:"string"},limit:{type:"integer",default:5,maximum:20}});T[T.length-1].inputSchema.required=["query"];');
p('add("define_word","English dictionary entry with definitions and phonetics. $0.01 USDC.",{word:{type:"string"}});T[T.length-1].inputSchema.required=["word"];');
p('add("arxiv_search","Search arXiv papers: titles, IDs, abstracts. $0.01 USDC.",{query:{type:"string"},limit:{type:"integer",default:3,maximum:10}});T[T.length-1].inputSchema.required=["query"];');
p('add("lunar_calendar","Solar-lunar conversion with Ganzhi, zodiac, festivals. Local compute. $0.01 USDC.",{date:{type:"string",default:"today"}});');
p('add("cn_id_validate","Chinese resident ID checksum + province + birth + sex. Local compute. $0.01 USDC.",{id:{type:"string"}});T[T.length-1].inputSchema.required=["id"];');
p('add("pinyin_convert","Chinese text to pinyin with tone marks. Local compute. $0.01 USDC.",{text:{type:"string"},tone:{type:"boolean",default:true}});T[T.length-1].inputSchema.required=["text"];');
p('add("game_deals","CheapShark game deals across Steam/Epic/GOG: sale price, savings%, Metacritic. $0.01 USDC.",{maxPrice:{type:"number",default:5},onSale:{type:"boolean",default:true},limit:{type:"integer",default:10,maximum:30}});');
p('add("cat_fact","Random cat fact from CatFact Ninja. Fun trivia. $0.01 USDC.",{});');
p('add("dog_breed_list","All dog breeds and subbreeds from Dog CEO API. $0.01 USDC.",{});');
p('add("bored_activity","Random activity suggestion: type, price scale, duration, kid-friendly. $0.01 USDC.",{minPrice:{type:"number",minimum:0,maximum:10},group:{type:"boolean"}});');
p('add("color_info","Color info (name, RGB, HSL, HSV, CMYK) for any hex code. Design helper. $0.01 USDC.",{hex:{type:"string"}});T[T.length-1].inputSchema.required=["hex"];');
p('add("color_scheme","Generate analogous color palette (N colors) from base hex. $0.01 USDC.",{hex:{type:"string"},count:{type:"integer",default:5,min:2,max:12}});T[T.length-1].inputSchema.required=["hex"];');
p('add("datamuse_synonyms","Synonyms and related words via Datamuse lexical DB. NLP helper. $0.01 USDC.",{word:{type:"string"},limit:{type:"integer",default:10,maximum:30}});T[T.length-1].inputSchema.required=["word"];');
p('add("npm_search","Search npm registry with download counts. Dev-tool finder. $0.01 USDC.",{query:{type:"string"},limit:{type:"integer",default:5,maximum:20}});T[T.length-1].inputSchema.required=["query"];');
p('add("spdx_licenses","Full SPDX license list (500+ licenses). Compliance/legal aid. $0.01 USDC.",{licenseId:{type:"string",description:"Optional filter: MIT, Apache-2.0 etc."}});');
p('add("random_user","Fake user profiles (gender, name, location, DOB, phone, avatar). $0.01 USDC.",{gender:{type:"string",enum:["male","female"]},count:{type:"integer",default:1,maximum:10}});');
p('add("comment_for_post","Fetch fake comments attached to a PostID (JSONPlaceholder). Demo data. $0.01 USDC.",{postId:{type:"integer",default:1},limit:{type:"integer",default:5,maximum:20}});');
p('add("quote_today","Inspirational quote of the day with author and image link. ZenQuotes.io. $0.01 USDC.",{});');
p('add("defillama_chains","Top blockchain protocols by TVL from DeFiLlama. Market overview. $0.01 USDC.",{limit:{type:"integer",default:10,maximum:50}});');
p('add("defillama_pools","Yield/farming pool data: APY, TVL, IL risk. For DeFi analysts. $0.01 USDC.",{page:{type:"integer",default:0},limit:{type:"integer",default:10,maximum:20}});');
p('add("espn_sports_news","ESPN sports news headlines for NFL/MLB/NBA. $0.01 USDC.",{sport:{type:"string",default:"nfl"},count:{type:"integer",default:5}});');
p('add("hn_front_page","Live HN front-page stories via Algolia: title, points, comments. $0.01 USDC.",{limit:{type:"integer",default:5,maximum:30}});');
p('add("gh_repo_info","GitHub public repo metadata: stars, forks, language, topics, license. No auth. $0.01 USDC.",{owner:{type:"string"},repo:{type:"string"}});T[T.length-1].inputSchema.required=["owner","repo"];');
p('add("translate_text","Free text translation via MyMemory (en->zh, zh->en, ja->en, ...). $0.01 USDC.",{text:{type:"string"},from:{type:"string",default:"en"},to:{type:"string",default:"zh-CN"}});T[T.length-1].inputSchema.required=["text"];');
p('add("bitcoin_fees","Bitcoin network fee estimates (fastest/half-hour/hour/economy) via mempool.space. $0.01 USDC.",{});');
p('add("btc_usd_rate","BTC price in USD plus 50+ fiat currencies via Blockchain.info. $0.01 USDC.",{});');
p('add("random_cat_image","Random cat image URL via TheCatAPI public endpoint. $0.01 USDC.",{});');
p('add("random_dog_image","Random dog image URL by breed via Dog CEO. $0.01 USDC.",{breed:{type:"string",description:"Optional breed, e.g. husky"}});');
p('add("random_bear_image","Random bear image URL via placebear placeholder service. $0.01 USDC.",{width:{type:"integer",default:600},height:{type:"integer",default:600}});');
p('add("random_dog_placeholder","Random dog placeholder image (placeholder.dog). $0.01 USDC.",{width:{type:"integer",default:600},height:{type:"integer",default:600}});');

p('console.log("UTIL_TOOLS core count:",T.length);');

// Switch statement
p('function runUtil(name,args){args=args||{};switch(name){');
const names = ['weather','fx_rates','public_holidays','ip_geo','hn_search','define_word','arxiv_search','lunar_calendar','cn_id_validate','pinyin_convert','game_deals','cat_fact','dog_breed_list','bored_activity','color_info','color_scheme','datamuse_synonyms','npm_search','spdx_licenses','random_user','comment_for_post','quote_today','defillama_chains','defillama_pools','espn_sports_news','hn_front_page','gh_repo_info','translate_text','bitcoin_fees','btc_usd_rate','random_cat_image','random_dog_image','random_bear_image','random_dog_placeholder'];
const fnMap = {
  defillama_chains: 'runDefiChains', defillama_pools: 'runDefiPools', espn_sports_news: 'runEspn',
  hn_front_page: 'runHnFrontPage', gh_repo_info: 'runGhRepo', translate_text: 'runTranslate',
  cn_id_validate: 'runCnIdValidate', pinyin_convert: 'runPinyinConvert', comment_for_post: 'runComments',
  cat_fact: 'runCatFact', game_deals: 'runGameDeals', color_info: 'runColorInfo', color_scheme: 'runColorScheme',
  datamuse_synonyms: 'runDatamuse', npm_search: 'runNpmSearch', spdx_licenses: 'runSpdx', random_user: 'runRandomUser',
  public_holidays: 'runHolidays', fx_rates: 'runFxRates', ip_geo: 'runIpGeo', lunar_calendar: 'runLunarCalendar',
  bitcoin_fees: 'runBitcoinFees', btc_usd_rate: 'runBtcUsdRate',
  hn_search: 'runHnSearch', define_word: 'runDefineWord', arxiv_search: 'runArxivSearch',
  dog_breed_list: 'runDogBreedList', bored_activity: 'runBoredActivity', quote_today: 'runQuoteToday',
  random_cat_image: 'runCatImage', random_dog_image: 'runDogImage',
  random_bear_image: 'runBearImage', random_dog_placeholder: 'runDogPlaceholder',
};
for (const x of names) {
  const fn = fnMap[x] || 'run' + x.charAt(0).toUpperCase() + x.slice(1);
  p("case '" + x + "':return " + fn + "(args);");
}
p('default:throw new Error("unknown util: "+name);}}');

// ── Executors (simple loops only, no nested map-in-return objects) ─────────
p('function runWeather(a){');
p('  var lat=a.lat,lon=a.lon,city=a.city||null;');
p('  if((lat==null||lon==null)&&city){');
p("    return gj('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(city)+'&count=1&language=zh').then(function(g){");
p('      var hit=(g.results||[])[0];if(!hit)throw new Error("city not found: "+city);lat=hit.latitude;lon=hit.longitude;city=hit.name;');
p("      return gj('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto').then(function(w){return{city:city,lat:lat,lon:lon,current:w.current};});");
p('    });');
p('  }');
p("  if(lat==null||lon==null)return Promise.reject(new Error('provide city or lat/lon'));");
p("  return gj('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto').then(function(w){return{city:city,lat:lat,lon:lon,current:w.current};});");
p('}');

p('function runFxRates(a){');
p("  var from=(a.from||'CNY').toUpperCase(),to=(a.to||'USD').toUpperCase(),amt=a.amount!=null?'amount='+a.amount+'&':'';");
p("  return gj('https://api.frankfurter.app/latest?'+amt+'from='+from+'&to='+to).then(function(d){return{base:d.base,date:d.date,rates:d.rates,amount:a.amount!=null?a.amount:1};});");
p('}');

p('function runHolidays(a){');
p("  var country=(a.country||'CN').toUpperCase(),year=a.year||new Date().getFullYear();");
p("  return gj('https://date.nager.at/api/v3/publicholidays/'+year+'/'+country).then(function(d){var arr=[];for(var i=0;i<d.length;i++){arr.push({date:d[i].date,name:d[i].name,localName:d[i].localName});}return{country:country,year:year,count:d.length,holidays:arr};});");
p('}');

p('function runIpGeo(a){');
p("  if(!a.ip)return Promise.reject(new Error('ip is required'));");
p("  return gj('https://ipwho.is/'+encodeURIComponent(a.ip)).then(function(d){if(d.success===false)throw new Error(d.message||'lookup failed');return{ip:d.ip,country:d.country,region:d.region,city:d.city,lat:d.latitude,lon:d.longitude,isp:d.connection&&d.connection.isp,asn:d.connection&&d.connection.asn};});");
p('}');

p('function runHnSearch(a){');
p("  if(!a.query)return Promise.reject(new Error('query is required'));");
p("  var q=encodeURIComponent(a.query),lim=Math.min(Number(a.limit)||5,20);");
p("  return gj('https://hn.algolia.com/api/v1/search?query='+q+'&hitsPerPage='+lim).then(function(d){var hits=[];for(var i=0;i<(d.hits||[]).length;i++){var h=d.hits[i];hits.push({title:h.title,url:h.url,points:h.points,comments:h.num_comments});}return{nbHits:d.nbHits,hits:hits};});");
p('}');

p('function runDefineWord(a){');
p("  if(!a.word)return Promise.reject(new Error('word is required'));");
p("  return gj('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(a.word)).then(function(d){var e=d[0]||{},ms=[];for(var i=0;i<(e.meanings||[]).length;i++){var m=e.meanings[i],defs=[];for(var j=0;j<(m.definitions||[]).length&&j<2;j++){defs.push(m.definitions[j].definition);}ms.push({partOfSpeech:m.partOfSpeech,definitions:defs});}return{word:e.word,phonetic:e.phonetic,meanings:ms};});");
p('}');

p('function runArxivSearch(a){');
p("  if(!a.query)return Promise.reject(new Error('query is required'));");
p("  var q=encodeURIComponent(a.query),lim=Math.min(Number(a.limit)||3,10);");
p("  return fetch('https://export.arxiv.org/api/query?search_query=all:'+q+'&max_results='+lim,{headers:{'user-agent':UA}}).then(function(r){return r.text();}).then(function(xml){var entries=xml.split('<entry>').slice(1),out=[];for(var i=0;i<entries.length;i++){var e=entries[i];var idM=e.match(/<id>([^<]+)<\\/id>/);if(!idM)continue;var id=idM[1];var tiM=e.match(/<title>([\\s\\S]*?)<\\/title>/);var ti=(tiM&&tiM[1]||'').replace(/[\\s]+/g,' ').trim();var puM=e.match(/<published>([^<]+)<\\/published>/);var pu=puM&&puM[1]||'';var suM=e.match(/<summary>([\\s\\S]*?)<\\/summary>/);var su=(suM&&suM[1]||'').replace(/[\\s]+/g,' ').trim().slice(0,300);out.push({id:id,title:ti,published:pu,summary:su});}return{query:a.query,count:out.length,entries:out};});");
p('}');

p('function runLunarCalendar(a){');
p("  var y,m,d2,input=a.date||'today';");
p("  if(input==='today'){var now=new Date();y=now.getFullYear();m=now.getMonth()+1;d2=now.getDate();}else{var parts=String(input).split('-').map(Number);if(parts.length!==3||parts.some(isNaN))throw new Error('date format: YYYY-MM-DD');y=parts[0];m=parts[1];d2=parts[2];}");
p('  var l=solarlunar.solar2lunar(y,m,d2);if(!l||l.lYear==null)throw new Error("date out of supported range");');
p('  return{solar:l.cYear+"-"+String(l.cMonth).padStart(2,"0")+"-"+String(l.cDay).padStart(2,"0"),lunar:l.yearCn+l.monthCn+l.dayCn,ganzhi:{year:l.gzYear,month:l.gzMonth,day:l.gzDay},zodiac:l.animal,week:l.ncWeek,festival:l.festival||null,solarTerm:l.term||null};');
p('}');

p('function runCnIdValidate(a){if(!a.id)return Promise.reject(new Error("id is required"));return Promise.resolve(cv(a.id));}');
p('function runPinyinConvert(a){if(!a.text)return Promise.reject(new Error("text is required"));return Promise.resolve({text:a.text,pinyin:pinyin(a.text,{toneType:a.tone===false?"none":"symbol"})});}');

p('function runGameDeals(a){');
p("  var mp=String(a.maxPrice||5),os=a.onSale!==false?'1':'0',lim=Math.min(Number(a.limit)||10,30);");
p("  return gj('https://www.cheapshark.com/api/1.0/deals?upperPrice='+mp+'&onSale='+os+'&pageSize='+lim).then(function(d){var arr=[];for(var i=0;i<(d||[]).length&&i<lim;i++){var x=d[i];arr.push({title:x.title,salePrice:x.salePrice,normalPrice:x.normalPrice,savingsPct:Number(x.savings).toFixed(1)+'%',metacritic:x.metacriticScore,steamRating:x.steamRatingPercent,url:'https://www.cheapshark.com/deal/'+x.dealID});}return{query:{upperPrice:mp,onSale:!!a.onSale},deals:arr};});");
p('}');

p("function runCatFact(a){return gj('https://catfact.ninja/fact').then(function(d){return{fact:d.fact,length:d.length};});}");

p('function runDogBreedList(a){');
p("  return gj('https://dog.ceo/api/breeds/list/all').then(function(d){var msg=d.message||{},top=[],tot=0,ents=Object.entries(msg);for(var i=0;i<ents.length&&i<20;i++){top.push({breed:ents[i][0],subbreeds:ents[i][1]});tot+=1+ents[i][1].length;}return{totalTopBreeds:ents.length,totalAllBreedsIncludingSub:tot,topBreeds:top};});");
p('}');

p('function runBoredActivity(a){var ps=[];if(a.minPrice!=null)ps.push("minPrice="+a.minPrice);if(a.group)ps.push("group=true");var qs=ps.length?"?"+ps.join("&"):"";return gj("https://bored-api.appbrewery.com/random"+qs);}');

p('function runColorInfo(a){if(!a.hex)return Promise.reject(new Error("hex is required"));var h=a.hex.replace(/^#/,"");return gj("https://www.thecolorapi.com/id?hex="+h).then(function(d){return{hex:d.hex.value,hexClean:d.hex.clean,rgb:d.rgb.value,hsl:d.hsl.value,hsv:d.hsv.value,cmyk:d.cmyk&&d.cmyk.value,name:d.name&&d.name.value};});}');

p('function runColorScheme(a){if(!a.hex)return Promise.reject(new Error("hex is required"));var h=a.hex.replace(/^#/,""),cnt=Math.min(Number(a.count)||5,12);return gj("https://www.thecolorapi.com/scheme?hex="+h+"&count="+cnt).then(function(d){var cs=[];for(var i=0;i<(d.colors||[]).length;i++){cs.push({hex:d.colors[i].hex.value,rgb:d.colors[i].rgb.value,name:d.colors[i].name&&d.colors[i].name.value});}return{base:d.baseColor&&d.baseColor.hex&&d.baseColor.hex.value,mode:d.mode,colors:cs};});}');

p('function runDatamuse(a){if(!a.word)return Promise.reject(new Error("word is required"));var w=encodeURIComponent(a.word),lim=Math.min(Number(a.limit)||10,30);return gj("https://api.datamuse.com/words?rel_syn="+w+"&max="+lim).then(function(d){var sy=[];for(var i=0;i<d.length;i++)sy.push(d[i].word);return{word:a.word,count:d.length,synonyms:sy};});}');

p('function runNpmSearch(a){if(!a.query)return Promise.reject(new Error("query is required"));var q=encodeURIComponent(a.query),lim=Math.min(Number(a.limit)||5,20);return gj("https://registry.npmjs.org/-/v1/search?text="+q+"&size="+lim).then(function(d){var pkgs=[];for(var i=0;i<(d.objects||[]).length;i++){var obj=d.objects[i];pkgs.push({name:obj.package.name,version:obj.package.version,description:obj.package.description&&obj.package.description.slice(0,80),downloads:obj.downloads&&obj.downloads.lastMonth,updatedAt:obj.updated});}return{query:a.query,total:d.total,packages:pkgs};});}');

p('function runSpdx(a){return gj("https://spdx.org/licenses/licenses.json").then(function(d){if(a.licenseId){var matches=d.licenses.filter(function(l){return l.licenseId.toLowerCase()===a.licenseId.toLowerCase();});return matches.length?Object.assign({found:true},matches[0]):{found:false,searched:a.licenseId};}var s=[];for(var i=0;i<Math.min(10,d.licenses.length);i++)s.push(d.licenses[i].licenseId);return{total:d.licenses.length,version:d.licenseListVersion,sample:s};});}');

p('function runRandomUser(a){var gend=a.gender?"&gender="+a.gender:"",cnt=Math.min(Number(a.count)||1,10);return gj("https://randomuser.me/api/?results="+cnt+gend).then(function(d){var rs=[];for(var i=0;i<(d.results||[]).length;i++){var u=d.results[i];rs.push({gender:u.gender,name:u.name.first+" "+u.name.last,dob:u.dob.date,age:u.dob.age,location:u.location.city+", "+u.location.country,email:u.email,phone:u.phone,pictureThumb:u.picture.thumbnail});}return{results:rs,info:d.info};});}');

p('function runComments(a){var pid=a.postId||1,lim=Math.min(Number(a.limit)||5,20);return gj("https://jsonplaceholder.typicode.com/comments?postId="+pid+"&_page=1&_limit="+lim).then(function(d){return{postId:pid,count:d.length,comments:d};});}');

p('function runQuoteToday(a){');
p('  return gj("https://dummyjson.com/quotes/random").then(function(d){');
p('    if(!d||!d.quote)throw new Error("empty quote");');
p('    return{quote:d.quote,author:d.author||null,source:"dummyjson.com"};');
p('  }).catch(function(){');
p('    return gj("https://stoic-quotes.com/api/quote").then(function(d){');
p('      if(!d||!d.text)throw new Error("empty quote");');
p('      return{quote:d.text,author:d.author||null,source:"stoic-quotes.com"};');
p('    });');
p('  });');
p('}');

p('function runDefiChains(a){return gj("https://api.llama.fi/chains").then(function(d){var t=(d||[]).filter(function(c){return c.tvl>0;}).sort(function(a,b){return b.tvl-a.tvl;}).slice(0,Number(a.limit)||10);var ch=[];for(var i=0;i<t.length;i++){ch.push({name:t[i].name,symbol:t[i].tokenSymbol,tvlUsd:t[i].tvl,geckoId:t[i].gecko_id,chainId:t[i].chainId});}return{totalChainsWithTVL:ch.length,chains:ch};});}');

p('function runDefiPools(a){var pg=Number(a.page)||0,lim=Math.min(Number(a.limit)||10,20);return gj("https://yields.llama.fi/pools").then(function(d){var items=d&&d.data?d.data:[];var ps=[];for(var i=pg*lim;i<items.length&&ps.length<lim;i++){var p=items[i];ps.push({pool:p.pool,chain:p.chain,project:p.project,symbol:p.symbol,tvlUsd:p.tvlUsd,apy:p.apy,apyBase:p.apyBase,apyReward:p.apyReward,ilRisk:p.ilRisk});}return{status:d&&d.status,totalPoolsInResponse:ps.length,pools:ps};});}');

p('function runEspn(a){var sport=(a.sport||"nfl").toLowerCase(),url="https://site.api.espn.com/apis/site/v2/sports/"+(sport==="nfl"?"football":sport==="mlb"?"baseball":"basketball")+"/"+sport+"/news";return gj(url).then(function(d){var arts=d.articles||[];var as=[];for(var i=0;i<arts.length&&i<Number(a.count||5);i++){var art=arts[i];var imgs=[];if(art.images)for(var j=0;j<art.images.length;j++)imgs.push(art.images[j].url);as.push({headline:art.headline,description:art.description&&art.description.slice(0,150),published:art.published,url:art.links&&art.links.web&&art.links.web.href,images:imgs});}return{sport:sport,count:as.length,articles:as};});}');

p('function runHnFrontPage(a){var lim=Math.min(Number(a.limit)||5,30);return gj("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage="+lim).then(function(d){var st=[];for(var i=0;i<(d.hits||[]).length&&i<lim;i++){var h=d.hits[i];st.push({title:h.title,points:h.points,comments:h.num_comments,url:h.url,author:h.author,createdAt:h.created_at});}return{nbHits:d.nbHits,stories:st};});}');

p('function runGhRepo(a){if(!a.owner)return Promise.reject(new Error("owner is required"));if(!a.repo)return Promise.reject(new Error("repo is required"));return gj("https://api.github.com/repos/"+encodeURIComponent(a.owner)+"/"+encodeURIComponent(a.repo)).then(function(d){if(d.message)throw new Error(d.message);return{full_name:d.full_name,description:d.description,stars:d.stargazers_count,forks:d.forks_count,openIssues:d.open_issues_count,language:d.language,topics:d.topics||[],updatedAt:d.updated_at,pushedAt:d.pushed_at,license:d.license&&d.license.spdx_id,defaultBranch:d.default_branch};});}');

p('function runTranslate(a){if(!a.text)return Promise.reject(new Error("text is required"));var pair=(a.from||"en")+"|"+(a.to||"zh-CN"),q=encodeURIComponent(a.text);return gj("https://api.mymemory.translated.net/get?q="+q+"&langpair="+pair).then(function(d){return{from:a.from||"en",to:a.to||"zh-CN",original:a.text,translated:d.responseData&&d.responseData.translatedText||"",matchScore:d.responseData&&d.responseData.match};});}');

p('function runBitcoinFees(){return gj("https://mempool.space/api/v1/fees/recommended").then(function(d){return{feesSatPerVb:d,unit:"sat/vB",source:"mempool.space"};});}');

p('function runBtcUsdRate(){return gj("https://blockchain.info/ticker").then(function(d){var out={};for(var k in d){out[k]=d[k].last;}return{btcPriceUsd:out.USD,allCurrencies:out,source:"blockchain.info"};});}');

p('function runCatImage(){return gj("https://api.thecatapi.com/v1/images/search").then(function(d){var x=(d||[])[0]||{};return{image:x.url,width:x.width,height:x.height,id:x.id};});}');

p('function runDogImage(a){var b=a.breed?encodeURIComponent(a.breed)+"/":"",u="https://dog.ceo/api/breed/"+b+"images/random";if(!a.breed)u="https://dog.ceo/api/breeds/image/random";return gj(u).then(function(d){return{image:d.message,status:d.status};});}');

p('function runBearImage(a){var w=Number(a.width)||600,h=Number(a.height)||600;return Promise.resolve({image:"https://placebear.com/"+w+"/"+h,width:w,height:h});}');

p('function runDogPlaceholder(a){var w=Number(a.width)||600,h=Number(a.height)||600;return Promise.resolve({image:"https://place.dog/"+w+"/"+h,width:w,height:h});}');

// ── Merge the v5 extra tool pack (lib/utils-tools-extra.js) ────────────────
p("var X={};try{X=require('./utils-tools-extra');}catch(e){console.error('extra tools failed to load:',e.message);}");
p("var ALL=T.concat(X.EXTRA_TOOLS||[]);");
p("function runAll(n,a){if(X.isExtra&&X.isExtra(n))return X.runExtra(n,a);return runUtil(n,a);}");
p("console.log('UTIL_TOOLS total:',ALL.length,'(core',T.length,'+ extra',(X.EXTRA_TOOLS||[]).length,')');");
p("module.exports={UTIL_TOOLS:ALL,runUtil:runAll,UTIL_PRICE:{usd:0.01,atomic:10000},PRICE_BY_TOOL:X.PRICE_BY_TOOL||{},CORE_TOOLS:T};");

fs.writeFileSync(OUT, o.join('\n'), 'utf8');
console.log('Written', o.length, 'lines ->', OUT);
try {
  delete require.cache[require.resolve(OUT)];
  const m = require(OUT);
  console.log('OK tools loaded:', m.UTIL_TOOLS.length, '| priced overrides:', Object.keys(m.PRICE_BY_TOOL).length);
} catch (e) {
  console.error('ERR:', e.message.slice(0, 300));
  const lm = e.stack.match(/utils-tools\.js:(\d+)/);
  if (lm) {
    const ln = parseInt(lm[1]);
    for (let k = Math.max(0, ln - 4); k < Math.min(o.length, ln + 3); k++) console.log((k + 1) + ': ' + o[k]);
  }
}
