/** utils-tools.js -- AutoTasker Hub core tool pack ($0.01 each via x402) */
'use strict';
var solarlunar=require('solarlunar').default||require('solarlunar');
var pinyinPro=require('pinyin-pro');
var pinyin=pinyinPro.pinyin;
var UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
var TO=12000;
function gj(u){return fetch(u,{headers:{'user-agent':UA,accept:'application/json'},signal:AbortSignal.timeout(TO)}).then(function(r){if(!r.ok)throw new Error('upstream '+r.status);return r.json();});}
var PV={"11":"北京","12":"天津","13":"河北","14":"山西","15":"内蒙古","21":"辽宁","22":"吉林","23":"黑龙江","31":"上海","32":"江苏","33":"浙江","34":"安徽","35":"福建","36":"江西","37":"山东","41":"河南","42":"湖北","43":"湖南","44":"广东","45":"广西","46":"海南","50":"重庆","51":"四川","52":"贵州","53":"云南","54":"西藏","61":"陕西","62":"甘肃","63":"青海","64":"宁夏","65":"新疆","71":"台湾","81":"香港","82":"澳门"};
var IW=[7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2]; var IC="10X98765432";
function cv(raw){var id=String(raw||'').toUpperCase().trim();if(!/^\d{17}[\dX]$/.test(id))return{valid:false,reason:"expected 18-digit ID"};var s=0;for(var i=0;i<17;i++)s+=Number(id[i])*IW[i];var exp=IC[s%11],bd=id.slice(6,14);return{valid:exp===id[17],checkDigit:{expected:exp,received:id[17]},province:PV[id.slice(0,2)]||null,birthDate:/^\d{8}$/.test(bd)?bd.slice(0,4)+"-"+bd.slice(4,6)+"-"+bd.slice(6,8):null,sex:Number(id[16])%2===1?"male":"female"};}
var T=[];
function add(n,d,p,r){var obj={type:"object",properties:p||{}};if(r)obj.required=r;T.push({name:n,description:d,inputSchema:obj});}
add("weather","Current weather via Open-Meteo (city or lat/lon). $0.01 USDC.",{city:{type:"string"},lat:{type:"number"},lon:{type:"number"}});
add("fx_rates","ECB reference FX rates via Frankfurter. CNY-friendly. $0.01 USDC.",{from:{type:"string",default:"CNY"},to:{type:"string",default:"USD"},amount:{type:"number"}});
add("public_holidays","Public holidays by country+year (date.nager.at). ISO-3166. $0.01 USDC.",{country:{type:"string",default:"CN"},year:{type:"integer",default:2026}});
add("ip_geo","IP geolocation: country, region, city, ASN. $0.01 USDC.",{ip:{type:"string"}});T[T.length-1].inputSchema.required=["ip"];
add("hn_search","Search Hacker News stories/comments via Algolia. Tech signal. $0.01 USDC.",{query:{type:"string"},limit:{type:"integer",default:5,maximum:20}});T[T.length-1].inputSchema.required=["query"];
add("define_word","English dictionary entry with definitions and phonetics. $0.01 USDC.",{word:{type:"string"}});T[T.length-1].inputSchema.required=["word"];
add("arxiv_search","Search arXiv papers: titles, IDs, abstracts. $0.01 USDC.",{query:{type:"string"},limit:{type:"integer",default:3,maximum:10}});T[T.length-1].inputSchema.required=["query"];
add("lunar_calendar","Solar-lunar conversion with Ganzhi, zodiac, festivals. Local compute. $0.01 USDC.",{date:{type:"string",default:"today"}});
add("cn_id_validate","Chinese resident ID checksum + province + birth + sex. Local compute. $0.01 USDC.",{id:{type:"string"}});T[T.length-1].inputSchema.required=["id"];
add("pinyin_convert","Chinese text to pinyin with tone marks. Local compute. $0.01 USDC.",{text:{type:"string"},tone:{type:"boolean",default:true}});T[T.length-1].inputSchema.required=["text"];
add("game_deals","CheapShark game deals across Steam/Epic/GOG: sale price, savings%, Metacritic. $0.01 USDC.",{maxPrice:{type:"number",default:5},onSale:{type:"boolean",default:true},limit:{type:"integer",default:10,maximum:30}});
add("cat_fact","Random cat fact from CatFact Ninja. Fun trivia. $0.01 USDC.",{});
add("dog_breed_list","All dog breeds and subbreeds from Dog CEO API. $0.01 USDC.",{});
add("bored_activity","Random activity suggestion: type, price scale, duration, kid-friendly. $0.01 USDC.",{minPrice:{type:"number",minimum:0,maximum:10},group:{type:"boolean"}});
add("color_info","Color info (name, RGB, HSL, HSV, CMYK) for any hex code. Design helper. $0.01 USDC.",{hex:{type:"string"}});T[T.length-1].inputSchema.required=["hex"];
add("color_scheme","Generate analogous color palette (N colors) from base hex. $0.01 USDC.",{hex:{type:"string"},count:{type:"integer",default:5,min:2,max:12}});T[T.length-1].inputSchema.required=["hex"];
add("datamuse_synonyms","Synonyms and related words via Datamuse lexical DB. NLP helper. $0.01 USDC.",{word:{type:"string"},limit:{type:"integer",default:10,maximum:30}});T[T.length-1].inputSchema.required=["word"];
add("npm_search","Search npm registry with download counts. Dev-tool finder. $0.01 USDC.",{query:{type:"string"},limit:{type:"integer",default:5,maximum:20}});T[T.length-1].inputSchema.required=["query"];
add("spdx_licenses","Full SPDX license list (500+ licenses). Compliance/legal aid. $0.01 USDC.",{licenseId:{type:"string",description:"Optional filter: MIT, Apache-2.0 etc."}});
add("random_user","Fake user profiles (gender, name, location, DOB, phone, avatar). $0.01 USDC.",{gender:{type:"string",enum:["male","female"]},count:{type:"integer",default:1,maximum:10}});
add("comment_for_post","Fetch fake comments attached to a PostID (JSONPlaceholder). Demo data. $0.01 USDC.",{postId:{type:"integer",default:1},limit:{type:"integer",default:5,maximum:20}});
add("quote_today","Inspirational quote of the day with author and image link. ZenQuotes.io. $0.01 USDC.",{});
add("defillama_chains","Top blockchain protocols by TVL from DeFiLlama. Market overview. $0.01 USDC.",{limit:{type:"integer",default:10,maximum:50}});
add("defillama_pools","Yield/farming pool data: APY, TVL, IL risk. For DeFi analysts. $0.01 USDC.",{page:{type:"integer",default:0},limit:{type:"integer",default:10,maximum:20}});
add("espn_sports_news","ESPN sports news headlines for NFL/MLB/NBA. $0.01 USDC.",{sport:{type:"string",default:"nfl"},count:{type:"integer",default:5}});
add("hn_front_page","Live HN front-page stories via Algolia: title, points, comments. $0.01 USDC.",{limit:{type:"integer",default:5,maximum:30}});
add("gh_repo_info","GitHub public repo metadata: stars, forks, language, topics, license. No auth. $0.01 USDC.",{owner:{type:"string"},repo:{type:"string"}});T[T.length-1].inputSchema.required=["owner","repo"];
add("translate_text","Free text translation via MyMemory (en->zh, zh->en, ja->en, ...). $0.01 USDC.",{text:{type:"string"},from:{type:"string",default:"en"},to:{type:"string",default:"zh-CN"}});T[T.length-1].inputSchema.required=["text"];
add("bitcoin_fees","Bitcoin network fee estimates (fastest/half-hour/hour/economy) via mempool.space. $0.01 USDC.",{});
add("btc_usd_rate","BTC price in USD plus 50+ fiat currencies via Blockchain.info. $0.01 USDC.",{});
add("random_cat_image","Random cat image URL via TheCatAPI public endpoint. $0.01 USDC.",{});
add("random_dog_image","Random dog image URL by breed via Dog CEO. $0.01 USDC.",{breed:{type:"string",description:"Optional breed, e.g. husky"}});
add("random_bear_image","Random bear image URL via placebear placeholder service. $0.01 USDC.",{width:{type:"integer",default:600},height:{type:"integer",default:600}});
add("random_dog_placeholder","Random dog placeholder image (placeholder.dog). $0.01 USDC.",{width:{type:"integer",default:600},height:{type:"integer",default:600}});
console.log("UTIL_TOOLS core count:",T.length);
function runUtil(name,args){args=args||{};switch(name){
case 'weather':return runWeather(args);
case 'fx_rates':return runFxRates(args);
case 'public_holidays':return runHolidays(args);
case 'ip_geo':return runIpGeo(args);
case 'hn_search':return runHnSearch(args);
case 'define_word':return runDefineWord(args);
case 'arxiv_search':return runArxivSearch(args);
case 'lunar_calendar':return runLunarCalendar(args);
case 'cn_id_validate':return runCnIdValidate(args);
case 'pinyin_convert':return runPinyinConvert(args);
case 'game_deals':return runGameDeals(args);
case 'cat_fact':return runCatFact(args);
case 'dog_breed_list':return runDogBreedList(args);
case 'bored_activity':return runBoredActivity(args);
case 'color_info':return runColorInfo(args);
case 'color_scheme':return runColorScheme(args);
case 'datamuse_synonyms':return runDatamuse(args);
case 'npm_search':return runNpmSearch(args);
case 'spdx_licenses':return runSpdx(args);
case 'random_user':return runRandomUser(args);
case 'comment_for_post':return runComments(args);
case 'quote_today':return runQuoteToday(args);
case 'defillama_chains':return runDefiChains(args);
case 'defillama_pools':return runDefiPools(args);
case 'espn_sports_news':return runEspn(args);
case 'hn_front_page':return runHnFrontPage(args);
case 'gh_repo_info':return runGhRepo(args);
case 'translate_text':return runTranslate(args);
case 'bitcoin_fees':return runBitcoinFees(args);
case 'btc_usd_rate':return runBtcUsdRate(args);
case 'random_cat_image':return runCatImage(args);
case 'random_dog_image':return runDogImage(args);
case 'random_bear_image':return runBearImage(args);
case 'random_dog_placeholder':return runDogPlaceholder(args);
case 'treasury_balance':return runTreasuryBalance(args);
case 'wallet_history':return runWalletHistory(args);
case 'usdc_price':return runUsdcPrice(args);
case 'chain_stats':return runChainStats(args);
case 'settlement_history':return runSettlementHistory(args);
case 'referral_leaderboard':return runReferralLeaderboard(args);
case 'bounty_list':return runBountyList(args);
case 'trend_predict':return runTrendPredict(args);
case 'content_factory_stats':return runContentFactoryStats(args);
case 'fraud_report':return runFraudReport(args);
default:throw new Error("unknown util: "+name);}}
function runWeather(a){
  var lat=a.lat,lon=a.lon,city=a.city||null;
  if((lat==null||lon==null)&&city){
    return gj('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(city)+'&count=1&language=zh').then(function(g){
      var hit=(g.results||[])[0];if(!hit)throw new Error("city not found: "+city);lat=hit.latitude;lon=hit.longitude;city=hit.name;
      return gj('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto').then(function(w){return{city:city,lat:lat,lon:lon,current:w.current};});
    });
  }
  if(lat==null||lon==null)return Promise.reject(new Error('provide city or lat/lon'));
  return gj('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto').then(function(w){return{city:city,lat:lat,lon:lon,current:w.current};});
}
function runFxRates(a){
  var from=(a.from||'CNY').toUpperCase(),to=(a.to||'USD').toUpperCase(),amt=a.amount!=null?'amount='+a.amount+'&':'';
  return gj('https://api.frankfurter.app/latest?'+amt+'from='+from+'&to='+to).then(function(d){return{base:d.base,date:d.date,rates:d.rates,amount:a.amount!=null?a.amount:1};});
}
function runHolidays(a){
  var country=(a.country||'CN').toUpperCase(),year=a.year||new Date().getFullYear();
  return gj('https://date.nager.at/api/v3/publicholidays/'+year+'/'+country).then(function(d){var arr=[];for(var i=0;i<d.length;i++){arr.push({date:d[i].date,name:d[i].name,localName:d[i].localName});}return{country:country,year:year,count:d.length,holidays:arr};});
}
function runIpGeo(a){
  if(!a.ip)return Promise.reject(new Error('ip is required'));
  return gj('https://ipwho.is/'+encodeURIComponent(a.ip)).then(function(d){if(d.success===false)throw new Error(d.message||'lookup failed');return{ip:d.ip,country:d.country,region:d.region,city:d.city,lat:d.latitude,lon:d.longitude,isp:d.connection&&d.connection.isp,asn:d.connection&&d.connection.asn};});
}
function runHnSearch(a){
  if(!a.query)return Promise.reject(new Error('query is required'));
  var q=encodeURIComponent(a.query),lim=Math.min(Number(a.limit)||5,20);
  return gj('https://hn.algolia.com/api/v1/search?query='+q+'&hitsPerPage='+lim).then(function(d){var hits=[];for(var i=0;i<(d.hits||[]).length;i++){var h=d.hits[i];hits.push({title:h.title,url:h.url,points:h.points,comments:h.num_comments});}return{nbHits:d.nbHits,hits:hits};});
}
function runDefineWord(a){
  if(!a.word)return Promise.reject(new Error('word is required'));
  return gj('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(a.word)).then(function(d){var e=d[0]||{},ms=[];for(var i=0;i<(e.meanings||[]).length;i++){var m=e.meanings[i],defs=[];for(var j=0;j<(m.definitions||[]).length&&j<2;j++){defs.push(m.definitions[j].definition);}ms.push({partOfSpeech:m.partOfSpeech,definitions:defs});}return{word:e.word,phonetic:e.phonetic,meanings:ms};});
}
function runArxivSearch(a){
  if(!a.query)return Promise.reject(new Error('query is required'));
  var q=encodeURIComponent(a.query),lim=Math.min(Number(a.limit)||3,10);
  return fetch('https://export.arxiv.org/api/query?search_query=all:'+q+'&max_results='+lim,{headers:{'user-agent':UA}}).then(function(r){return r.text();}).then(function(xml){var entries=xml.split('<entry>').slice(1),out=[];for(var i=0;i<entries.length;i++){var e=entries[i];var idM=e.match(/<id>([^<]+)<\/id>/);if(!idM)continue;var id=idM[1];var tiM=e.match(/<title>([\s\S]*?)<\/title>/);var ti=(tiM&&tiM[1]||'').replace(/[\s]+/g,' ').trim();var puM=e.match(/<published>([^<]+)<\/published>/);var pu=puM&&puM[1]||'';var suM=e.match(/<summary>([\s\S]*?)<\/summary>/);var su=(suM&&suM[1]||'').replace(/[\s]+/g,' ').trim().slice(0,300);out.push({id:id,title:ti,published:pu,summary:su});}return{query:a.query,count:out.length,entries:out};});
}
function runLunarCalendar(a){
  var y,m,d2,input=a.date||'today';
  if(input==='today'){var now=new Date();y=now.getFullYear();m=now.getMonth()+1;d2=now.getDate();}else{var parts=String(input).split('-').map(Number);if(parts.length!==3||parts.some(isNaN))throw new Error('date format: YYYY-MM-DD');y=parts[0];m=parts[1];d2=parts[2];}
  var l=solarlunar.solar2lunar(y,m,d2);if(!l||l.lYear==null)throw new Error("date out of supported range");
  return{solar:l.cYear+"-"+String(l.cMonth).padStart(2,"0")+"-"+String(l.cDay).padStart(2,"0"),lunar:l.yearCn+l.monthCn+l.dayCn,ganzhi:{year:l.gzYear,month:l.gzMonth,day:l.gzDay},zodiac:l.animal,week:l.ncWeek,festival:l.festival||null,solarTerm:l.term||null};
}
function runCnIdValidate(a){if(!a.id)return Promise.reject(new Error("id is required"));return Promise.resolve(cv(a.id));}
function runPinyinConvert(a){if(!a.text)return Promise.reject(new Error("text is required"));return Promise.resolve({text:a.text,pinyin:pinyin(a.text,{toneType:a.tone===false?"none":"symbol"})});}
function runGameDeals(a){
  var mp=String(a.maxPrice||5),os=a.onSale!==false?'1':'0',lim=Math.min(Number(a.limit)||10,30);
  return gj('https://www.cheapshark.com/api/1.0/deals?upperPrice='+mp+'&onSale='+os+'&pageSize='+lim).then(function(d){var arr=[];for(var i=0;i<(d||[]).length&&i<lim;i++){var x=d[i];arr.push({title:x.title,salePrice:x.salePrice,normalPrice:x.normalPrice,savingsPct:Number(x.savings).toFixed(1)+'%',metacritic:x.metacriticScore,steamRating:x.steamRatingPercent,url:'https://www.cheapshark.com/deal/'+x.dealID});}return{query:{upperPrice:mp,onSale:!!a.onSale},deals:arr};});
}
function runCatFact(a){return gj('https://catfact.ninja/fact').then(function(d){return{fact:d.fact,length:d.length};});}
function runDogBreedList(a){
  return gj('https://dog.ceo/api/breeds/list/all').then(function(d){var msg=d.message||{},top=[],tot=0,ents=Object.entries(msg);for(var i=0;i<ents.length&&i<20;i++){top.push({breed:ents[i][0],subbreeds:ents[i][1]});tot+=1+ents[i][1].length;}return{totalTopBreeds:ents.length,totalAllBreedsIncludingSub:tot,topBreeds:top};});
}
function runBoredActivity(a){var ps=[];if(a.minPrice!=null)ps.push("minPrice="+a.minPrice);if(a.group)ps.push("group=true");var qs=ps.length?"?"+ps.join("&"):"";return gj("https://bored-api.appbrewery.com/random"+qs);}
function runColorInfo(a){if(!a.hex)return Promise.reject(new Error("hex is required"));var h=a.hex.replace(/^#/,"");return gj("https://www.thecolorapi.com/id?hex="+h).then(function(d){return{hex:d.hex.value,hexClean:d.hex.clean,rgb:d.rgb.value,hsl:d.hsl.value,hsv:d.hsv.value,cmyk:d.cmyk&&d.cmyk.value,name:d.name&&d.name.value};});}
function runColorScheme(a){if(!a.hex)return Promise.reject(new Error("hex is required"));var h=a.hex.replace(/^#/,""),cnt=Math.min(Number(a.count)||5,12);return gj("https://www.thecolorapi.com/scheme?hex="+h+"&count="+cnt).then(function(d){var cs=[];for(var i=0;i<(d.colors||[]).length;i++){cs.push({hex:d.colors[i].hex.value,rgb:d.colors[i].rgb.value,name:d.colors[i].name&&d.colors[i].name.value});}return{base:d.baseColor&&d.baseColor.hex&&d.baseColor.hex.value,mode:d.mode,colors:cs};});}
function runDatamuse(a){if(!a.word)return Promise.reject(new Error("word is required"));var w=encodeURIComponent(a.word),lim=Math.min(Number(a.limit)||10,30);return gj("https://api.datamuse.com/words?rel_syn="+w+"&max="+lim).then(function(d){var sy=[];for(var i=0;i<d.length;i++)sy.push(d[i].word);return{word:a.word,count:d.length,synonyms:sy};});}
function runNpmSearch(a){if(!a.query)return Promise.reject(new Error("query is required"));var q=encodeURIComponent(a.query),lim=Math.min(Number(a.limit)||5,20);return gj("https://registry.npmjs.org/-/v1/search?text="+q+"&size="+lim).then(function(d){var pkgs=[];for(var i=0;i<(d.objects||[]).length;i++){var obj=d.objects[i];pkgs.push({name:obj.package.name,version:obj.package.version,description:obj.package.description&&obj.package.description.slice(0,80),downloads:obj.downloads&&obj.downloads.lastMonth,updatedAt:obj.updated});}return{query:a.query,total:d.total,packages:pkgs};});}
function runSpdx(a){return gj("https://spdx.org/licenses/licenses.json").then(function(d){if(a.licenseId){var matches=d.licenses.filter(function(l){return l.licenseId.toLowerCase()===a.licenseId.toLowerCase();});return matches.length?Object.assign({found:true},matches[0]):{found:false,searched:a.licenseId};}var s=[];for(var i=0;i<Math.min(10,d.licenses.length);i++)s.push(d.licenses[i].licenseId);return{total:d.licenses.length,version:d.licenseListVersion,sample:s};});}
function runRandomUser(a){var gend=a.gender?"&gender="+a.gender:"",cnt=Math.min(Number(a.count)||1,10);return gj("https://randomuser.me/api/?results="+cnt+gend).then(function(d){var rs=[];for(var i=0;i<(d.results||[]).length;i++){var u=d.results[i];rs.push({gender:u.gender,name:u.name.first+" "+u.name.last,dob:u.dob.date,age:u.dob.age,location:u.location.city+", "+u.location.country,email:u.email,phone:u.phone,pictureThumb:u.picture.thumbnail});}return{results:rs,info:d.info};});}
function runComments(a){var pid=a.postId||1,lim=Math.min(Number(a.limit)||5,20);return gj("https://jsonplaceholder.typicode.com/comments?postId="+pid+"&_page=1&_limit="+lim).then(function(d){return{postId:pid,count:d.length,comments:d};});}
function runQuoteToday(a){
  return gj("https://dummyjson.com/quotes/random").then(function(d){
    if(!d||!d.quote)throw new Error("empty quote");
    return{quote:d.quote,author:d.author||null,source:"dummyjson.com"};
  }).catch(function(){
    return gj("https://stoic-quotes.com/api/quote").then(function(d){
      if(!d||!d.text)throw new Error("empty quote");
      return{quote:d.text,author:d.author||null,source:"stoic-quotes.com"};
    });
  });
}
function runDefiChains(a){return gj("https://api.llama.fi/chains").then(function(d){var t=(d||[]).filter(function(c){return c.tvl>0;}).sort(function(a,b){return b.tvl-a.tvl;}).slice(0,Number(a.limit)||10);var ch=[];for(var i=0;i<t.length;i++){ch.push({name:t[i].name,symbol:t[i].tokenSymbol,tvlUsd:t[i].tvl,geckoId:t[i].gecko_id,chainId:t[i].chainId});}return{totalChainsWithTVL:ch.length,chains:ch};});}
function runDefiPools(a){var pg=Number(a.page)||0,lim=Math.min(Number(a.limit)||10,20);return gj("https://yields.llama.fi/pools").then(function(d){var items=d&&d.data?d.data:[];var ps=[];for(var i=pg*lim;i<items.length&&ps.length<lim;i++){var p=items[i];ps.push({pool:p.pool,chain:p.chain,project:p.project,symbol:p.symbol,tvlUsd:p.tvlUsd,apy:p.apy,apyBase:p.apyBase,apyReward:p.apyReward,ilRisk:p.ilRisk});}return{status:d&&d.status,totalPoolsInResponse:ps.length,pools:ps};});}
function runEspn(a){var sport=(a.sport||"nfl").toLowerCase(),url="https://site.api.espn.com/apis/site/v2/sports/"+(sport==="nfl"?"football":sport==="mlb"?"baseball":"basketball")+"/"+sport+"/news";return gj(url).then(function(d){var arts=d.articles||[];var as=[];for(var i=0;i<arts.length&&i<Number(a.count||5);i++){var art=arts[i];var imgs=[];if(art.images)for(var j=0;j<art.images.length;j++)imgs.push(art.images[j].url);as.push({headline:art.headline,description:art.description&&art.description.slice(0,150),published:art.published,url:art.links&&art.links.web&&art.links.web.href,images:imgs});}return{sport:sport,count:as.length,articles:as};});}
function runHnFrontPage(a){var lim=Math.min(Number(a.limit)||5,30);return gj("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage="+lim).then(function(d){var st=[];for(var i=0;i<(d.hits||[]).length&&i<lim;i++){var h=d.hits[i];st.push({title:h.title,points:h.points,comments:h.num_comments,url:h.url,author:h.author,createdAt:h.created_at});}return{nbHits:d.nbHits,stories:st};});}
function runGhRepo(a){if(!a.owner)return Promise.reject(new Error("owner is required"));if(!a.repo)return Promise.reject(new Error("repo is required"));return gj("https://api.github.com/repos/"+encodeURIComponent(a.owner)+"/"+encodeURIComponent(a.repo)).then(function(d){if(d.message)throw new Error(d.message);return{full_name:d.full_name,description:d.description,stars:d.stargazers_count,forks:d.forks_count,openIssues:d.open_issues_count,language:d.language,topics:d.topics||[],updatedAt:d.updated_at,pushedAt:d.pushed_at,license:d.license&&d.license.spdx_id,defaultBranch:d.default_branch};});}
function runTranslate(a){if(!a.text)return Promise.reject(new Error("text is required"));var pair=(a.from||"en")+"|"+(a.to||"zh-CN"),q=encodeURIComponent(a.text);return gj("https://api.mymemory.translated.net/get?q="+q+"&langpair="+pair).then(function(d){return{from:a.from||"en",to:a.to||"zh-CN",original:a.text,translated:d.responseData&&d.responseData.translatedText||"",matchScore:d.responseData&&d.responseData.match};});}
function runBitcoinFees(){return gj("https://mempool.space/api/v1/fees/recommended").then(function(d){return{feesSatPerVb:d,unit:"sat/vB",source:"mempool.space"};});}
function runBtcUsdRate(){return gj("https://blockchain.info/ticker").then(function(d){var out={};for(var k in d){out[k]=d[k].last;}return{btcPriceUsd:out.USD,allCurrencies:out,source:"blockchain.info"};});}
function runCatImage(){return gj("https://api.thecatapi.com/v1/images/search").then(function(d){var x=(d||[])[0]||{};return{image:x.url,width:x.width,height:x.height,id:x.id};});}
function runDogImage(a){var b=a.breed?encodeURIComponent(a.breed)+"/":"",u="https://dog.ceo/api/breed/"+b+"images/random";if(!a.breed)u="https://dog.ceo/api/breeds/image/random";return gj(u).then(function(d){return{image:d.message,status:d.status};});}
function runBearImage(a){var w=Number(a.width)||600,h=Number(a.height)||600;return Promise.resolve({image:"https://placebear.com/"+w+"/"+h,width:w,height:h});}
function runDogPlaceholder(a){var w=Number(a.width)||600,h=Number(a.height)||600;return Promise.resolve({image:"https://place.dog/"+w+"/"+h,width:w,height:h});}

// ── v10/x402 domain tools (chain data + business ops) ─────────────────────────
add("treasury_balance","Current USDC + ETH balance of the AutoTasker Hub treasury on Base. $0.01 USDC.",{});
add("wallet_history","Recent token transfers for any Base address (last 20). $0.01 USDC.",{address:{type:"string",description:"0x-prefixed Ethereum address"}});T[T.length-1].inputSchema.required=["address"];
add("usdc_price","Current USDC/USD peg and price from CoinGecko. For arbitrage checks. $0.01 USDC.",{symbol:{type:"string",default:"USDC"}});
add("chain_stats","Base mainnet current stats: block height, gas price (gwei), total txs today. $0.01 USDC.",{});
add("settlement_history","Last N settlements from the ledger (tool, amount, payer, ts). $0.01 USDC.",{limit:{type:"integer",default:10,maximum:50}});
add("referral_leaderboard","Top referrers by attributed payment volume. $0.01 USDC.",{limit:{type:"integer",default:10,maximum:30}});
add("bounty_list","Active bounty tasks available for claiming. $0.01 USDC.",{status:{type:"string",enum:["open","claimed","all"],default:"open"},limit:{type:"integer",default:10,maximum:30}});
add("trend_predict","Run trend prediction engine: top topics with velocity scores. $0.01 USDC.",{limit:{type:"integer",default:5,maximum:20}});
add("content_factory_stats","Content factory metrics: generated assets, batches, per-language breakdown. $0.01 USDC.",{});
add("fraud_report","Latest fraud detection report: alarms, blocked wallets, suspicious patterns. $0.01 USDC.",{});

console.log("UTIL_TOOLS core count:",T.length);

// ── v10 domain tool implementations (chain data + business ops) ────────────────
const https2=require('https');
const BASE_RPC='https://mainnet.base.org';
const TREASURY_ADDR=process.env.PAY_TO||'0xb9A9E6d9C4Ad1635aA685bba2e235A515A94773C';
const USDC_CONTRACT='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
function rpcBase(method,params,tms){tms=tms||8000;return new Promise(function(resolve,reject){var body=JSON.stringify({jsonrpc:'2.0',id:1,method:method,params:params||[]});var req=https2.request(BASE_RPC,{method:'POST',timeout:tms,headers:{'content-type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{var b='';res.on('data',function(c){b+=c;});res.on('end',function(){try{resolve(JSON.parse(b).result);}catch(e){reject(new Error('bad json'));}});});req.on('error',function(e){reject(e);});req.on('timeout',function(){req.destroy();reject(new Error('timeout'));});req.write(body);req.end();});}
function padAddr(a){return a.replace(/^0x/i,'').toLowerCase().padStart(64,'0');}
function hexToNum(h){if(!h)return 0;var s=String(h);return s.startsWith('0x')?parseInt(s,16)||0:0;}
function runTreasuryBalance(){return Promise.all([rpcBase('eth_call',[{to:USDC_CONTRACT,data:'0x70a08231'+padAddr(TREASURY_ADDR)},'latest']),rpcBase('eth_getBalance',[TREASURY_ADDR,'latest'])]).then(function(r){return{address:TREASURY_ADDR,usdc:hexToNum(r[0])/1e6,eth:hexToNum(r[1])/1e18};});}
function runWalletHistory(a){var addr=(a.address||'').toLowerCase();if(!addr.startsWith('0x'))return Promise.reject(new Error('invalid address format'));return gj('https://base.blockscout.com/api/v2/addresses/'+addr+'/transactions?limit=20&page=1').then(function(d){return{address:addr.slice(0,10)+'…'+addr.slice(-4),txCount:(d.transactions||[]).length,transactions:(d.transactions||[]).slice(0,5).map(function(tx){return{hash:tx.hash||'',from:(tx.sender||{}).binary_address||'',to:(tx.recipient||{}).binary_address||'',valueEth:tx.value?parseFloat(tx.value)/1e18:0,status:tx.status==='OK'?'success':'failed'};})};}).catch(function(e){return{address:addr.slice(0,10)+'…'+addr.slice(-4),error:e.message};});}
function runUsdcPrice(){return gj('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=usd').then(function(d){var p=(d&&d['usd-coin']&&d['usd-coin'].usd)||1;return{symbol:'USDC',priceUsd:p,deviationPct:((p-1)*100).toFixed(4),source:'coingecko',timestamp:new Date().toISOString()};}).catch(function(e){return{symbol:'USDC',priceUsd:1,error:e.message};});}
function runChainStats(){return Promise.all([rpcBase('eth_blockNumber',[]),rpcBase('eth_gasPrice',[])]).then(function(r){var bn=parseInt(r[0]||'0',16),gp=parseInt(r[1]||'0',16)/1e9;return{chain:'Base',blockNumber:bn,gasPriceGwei:gp.toFixed(4),blockTimeSec:1.2};}).catch(function(e){return{error:e.message};});}
function runSettlementHistory(a){var lim=Math.min(Number(a.limit)||10,50);try{var pay=require('./payments');var ledger=pay.loadLedger();var entries=(ledger.entries||[]).sort(function(x,y){return new Date(y.ts)-new Date(x.ts);}).slice(0,lim);return{totalEntries:ledger.entries?ledger.entries.length:0,settled:entries.map(function(e){return{tool:e.tool,usd:e.priceUsd,wallet:(e.agentWallet||'?').slice(0,10)+'…',ts:e.ts,txHash:e.txHash?e.txHash.slice(0,16)+'…':null};})};}catch(e){return{error:e.message};}}
function runReferralLeaderboard(a){var lim=Math.min(Number(a.limit)||10,30);try{var fs=require('fs');var pp=require('path');var db=JSON.parse(fs.readFileSync(pp.join(__dirname,'..','data','referrals.json'),'utf8'));var codes=Object.values(db.codes||{}).filter(function(c){return c.attributedPayments>0;});codes.sort(function(a,b){return b.attributedPayments-a.attributedPayments;});return{leaderboard:codes.slice(0,lim).map(function(c){return{code:c.code,attributions:c.attributedPayments||0,rebateAccruedUsd:c.rebateAccruedUsd||0,clicks:c.clicks||0};}),totalCount:codes.length};}catch(e){return{error:e.message};}}
function runBountyList(a){try{return require('./bounty-platform').listBounties(a.status||'open',Number(a.limit)||10);}catch(e){return{error:e.message};}}
function runTrendPredict(a){try{var tp=require('./trend-predictor');var r=tp.runPrediction();return{generatedAt:r.generatedAt,predictions:(r.predictions||[]).slice(0,Number(a.limit)||5),topMomentum:(r.topMomentum||[]).slice(0,3)};}catch(e){return{error:e.message};}}
function runContentFactoryStats(){try{return require('./content-factory').getStats();}catch(e){return{error:e.message};}}
function runFraudReport(){try{return require('./fraud-detection').getStats();}catch(e){return{error:e.message};}}
var X={};try{X=require('./utils-tools-extra');}catch(e){console.error('extra tools failed to load:',e.message);}
var ALL=T.concat(X.EXTRA_TOOLS||[]);
function runAll(n,a){if(X.isExtra&&X.isExtra(n))return X.runExtra(n,a);return runUtil(n,a);}
console.log('UTIL_TOOLS total:',ALL.length,'(core',T.length,'+ extra',(X.EXTRA_TOOLS||[]).length,')');
module.exports={UTIL_TOOLS:ALL,runUtil:runAll,UTIL_PRICE:{usd:0.01,atomic:10000},PRICE_BY_TOOL:X.PRICE_BY_TOOL||{},CORE_TOOLS:T};