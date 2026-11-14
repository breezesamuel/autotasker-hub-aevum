// fix-brace-issues.cjs — Patch specific broken lines in utils-tools.js
const fs = require('fs');
let code = fs.readFileSync('api/utils-tools.js', 'utf8');
const changes = [];

// Fix L240: datamuse return missing closing )
if (code.includes('synonyms:d.map(function(x){return x.word;});')) {
  code = code.replace('synonyms:d.map(function(x){return x.word;});', 'synonyms:d.map(function(x){return x.word;})}');
  changes.push('L240 datamuse synonyms');
}

// Fix L292: espn articles map - images inner map has extra ); 
// Should be: ...images:((article.default||{}).images||[]).map(function(i){return i.src;}); });
// Current:   ...images:((article.default||{}).images||[]).map(function(i){return i.src;}); });
// Actually let me check what's there now
const l292Match = code.match(/articles:articles\.slice\(.*?map\(function\(i\)\{return i\.src;\}\);\)\}\);/g);
if (l292Match) {
  console.log('Found L292 pattern:', l292Match[0].slice(0,120));
}

// Let me just rewrite the problematic section directly
// Find the espn_sports_news function and replace it
const espnStart = code.indexOf('function runEspnSportsNews(a)');
const espnEnd = code.indexOf('function runHnFrontPage(a)', espnStart);
if (espnStart >= 0 && espnEnd >= 0) {
  const oldEspn = code.slice(espnStart, espnEnd);
  console.log('OLD ESPN:\n' + oldEspn.slice(0, 300));
  
  const newEspn = `function runEspnSportsNews(a) {
  var sport=(a.sport||'nfl').toLowerCase();
  var url='https://site.api.espn.com/apis/site/v2/sports/'+(sport==='nfl'?'football':sport==='mlb'?'baseball':'basketball')+'/'+sport+'/news';
  return getJson(url).then(function(d){
    var articles=d.articles||[];
    return {sport:sport,count:articles.length,articles:articles.slice(0,Number(a.count||5)).map(function(article){return {headline:article.headline,description:article.description&&article.description.slice(0,150),published:article.published,url:article.link&&article.link.href,images:((article.default||{}).images||[]).map(function(i){return i.src;})};})};
  });
}`;
  code = code.slice(0, espnStart) + newEspn + code.slice(espnEnd);
  changes.push('ESPN sports news rewritten');
}

// Fix hn_front_page L298
const hnStart = code.indexOf('function runHnFrontPage(a)');
const hnEnd = code.indexOf('function runGhRepoInfo(a)', hnStart);
if (hnStart >= 0 && hnEnd >= 0) {
  const oldHn = code.slice(hnStart, hnEnd);
  console.log('\nOLD HN:\n' + oldHn.slice(0, 200));
  
  const newHn = `function runHnFrontPage(a) {
  var lim=Math.min(Number(a.limit)||5,30);
  return getJson('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage='+lim).then(function(d){
    return {nbHits:d.nbHits,stories:(d.hits||[]).map(function(h){return {title:h.title,points:h.points,comments:h.num_comments,url:h.url,author:h.author,createdAt:h.created_at};});
  });
}`;
  code = code.slice(0, hnStart) + newHn + code.slice(hnEnd);
  changes.push('HN front page rewritten');
}

fs.writeFileSync('api/utils-tools.js', code, 'utf8');
console.log('\nChanges:', changes.join(', '));

try {
  delete require.cache[require.resolve('./api/utils-tools')];
  const m = require('./api/utils-tools');
  console.log(`OK — ${m.UTIL_TOOLS.length} tools loaded`);
} catch(e) {
  console.error('STILL ERR:', e.message.slice(0, 200));
  const lm = e.stack.match(/utils-tools\.js:(\d+)/);
  if(lm){const ln=parseInt(lm[1]);const ls=code.split('\n');for(var k=Math.max(0,ln-4);k<Math.min(ls.length,ln+3);k++)console.log((k+1)+': '+ls[k]);}
}
