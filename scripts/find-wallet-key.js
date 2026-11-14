/**
 * find-wallet-key.js — locate the private key for 0x6350...dc38
 * Checks: MetaMask keyring, seed phrase derivation, common wallet export files
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

let ethers;
try { ({ ethers } = require('ethers')); }
catch { try { ({ ethers } = require(path.join(process.cwd(), 'node_modules', 'ethers'))); } catch(e) { console.log('No ethers available, will use raw derivation.'); } }

const TARGET = '0x6350761dfb1d20c30ba7ae9cb16560fbe67ddc38'.toLowerCase();
const HOME = process.env.USERPROFILE || os.homedir();

console.log('=== FINDING PRIVATE KEY FOR ' + TARGET + '\n');

// 1. Check MetaMask keyring.json (if accessible)
console.log('[1] MetaMask Keyring');
const mmPaths = [
  path.join(HOME, 'AppData', 'Roaming', 'MetaMask', 'keyring.json'),
  path.join(HOME, 'AppData', 'Local', 'MetaMask', 'keyring.json'),
];
for (const p of mmPaths) {
  try {
    if (!fs.existsSync(p)) continue;
    // MetaMask encrypts this with OS-level encryption, can't read directly
    console.log(`  Found: ${p.replace(HOME, '%USERPROFILE%')}`);
    console.log('  → Encrypted with OS keychain — cannot extract without your system password');
    console.log('  → Use MetaMask UI instead: Account details → Export private key');
  } catch {}
}

// 2. Check Ledger Live data
console.log('\n[2] Ledger Live');
const ledgerPaths = [
  path.join(HOME, 'AppData', 'Roaming', 'Ledger Live'),
  path.join(HOME, 'Documents', 'Ledger'),
];
for (const p of ledgerPaths) {
  try {
    if (!fs.existsSync(p)) continue;
    const files = fs.readdirSync(p).filter(f => /\.json$/.test(f)).slice(0, 5);
    console.log(`  ${p.replace(HOME, '%USERPROFILE%')}: ${files.join(', ') || '(no json files)'}`);
  } catch {}
}

// 3. Check Trezor Suite data
console.log('\n[3] Trezor Suite');
const trezorPath = path.join(HOME, 'AppData', 'Roaming', 'Trezor');
try {
  if (fs.existsSync(trezorPath)) {
    const files = fs.readdirSync(trezorPath).filter(f => f.endsWith('.json')).slice(0, 5);
    console.log(`  ${trezorPath.replace(HOME, '%USERPROFILE%')}: ${files.join(', ')}`);
  } else {
    console.log('  Not installed');
  }
} catch {}

// 4. Check browser extensions storage
console.log('\n[4] Browser extension data (Chrome/Firefox)');
const chromePaths = [
  path.join(HOME, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Local Extension Settings'),
  path.join(HOME, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Local Extension Settings'),
];
for (const p of chromePaths) {
  try {
    if (!fs.existsSync(p)) continue;
    // MetaMask Chrome extension stores data in a folder named by its extension ID
    const mmExtId = 'nkbihfbeogaeaoehlefnkodbefgpgknn';
    const extPath = path.join(p, mmExtId);
    if (fs.existsSync(extPath)) {
      const files = fs.readdirSync(extPath);
      console.log(`  MetaMask Chrome data found at: ${extPath.replace(HOME, '%LOCALAPPDATA%')}`);
      console.log(`  Files: ${files.slice(0, 5).join(', ')}`);
      console.log('  → These are encrypted with Chrome\'s native messaging — cannot read directly');
    }
  } catch {}
}

// 5. Try to derive from known seed phrases (NOT recommended but let's check if there's a backup)
console.log('\n[5] Checking for seed phrase backups');
const possibleSeedFiles = [
  path.join(HOME, 'Desktop', '*.txt'),
  path.join(HOME, 'Documents', '*.txt'),
  path.join(HOME, 'Downloads', '*.txt'),
  path.join(HOME, 'Documents', 'Crypto', '*.txt'),
  path.join(HOME, '.ssh', '*'),
];
for (const glob of possibleSeedFiles) {
  try {
    const files = execSync(`powershell -Command "Get-ChildItem '${glob}' -ErrorAction SilentlyContinue | Select-Object FullName"`, { encoding: 'utf8', timeout: 5000 }).trim().split('\n').filter(Boolean);
    for (const f of files) {
      try {
        const content = fs.readFileSync(f.replace('FullName: ', '').trim(), 'utf8');
        // Look for 12/24 word seed phrases
        const words = content.trim().split(/\s+/);
        if (words.length === 12 || words.length === 24) {
          const validWords = ['abandon','ability','able','about','above','absent','absorb','abstract','absurd','abuse',
            'access','account','accuse','achieve','acid','acoustic','acquire','across','action','actor',
            'actress','actual','adapt','add','addict','address','adjust','admit','adult','advance','advice',
            'aerobic','affair','afford','afraid','again','age','agent','agree','ahead','aim','air','airport',
            'aisle','alarm','album','alcohol','alert','alien','all','alley','allow','almost','alone','alpha',
            'already','also','alter','always','amateur','amazing','among','amount','amused','analyst','anchor',
            'ancient','anger','angle','angry','animal','ankle','announce','annual','another','answer','antenna',
            'antique','anxiety','any','apart','apology','appear','apple','approve','april','arch','arctic','area',
            'arena','argue','arm','armed','armor','army','around','arrange','arrest','arrive','arrow','artist',
            'artwork','ask','aspect','assault','asset','assist','assume','asthma','athlete','atom','attack',
            'attend','attitude','attract','auction','audit','august','aunt','author','auto','autumn','average',
            'avocado','avoid','awake','aware','awesome','afull','wild','axis','baby','bachelor','bacon','badge',
            'bag','balance','balcony','ball','bamboo','banana','banner','bar','barely','bargain','barrel','base',
            'basic','basket','battle','beach','bean','beauty','because','become','bee','been','before','begin',
            'behavior','behind','believe','below','belt','bench','benefit','best','betray','better','between',
            'beyond','bicycle','bid','bike','bind','biology','bird','birth','bitter','black','blade','blame',
            'blanket','blast','bleak','bless','blind','blood','blossom','blouse','blue','blur','blush','board',
            'boat','body','boil','bomb','bone','bonus','book','boost','border','boring','borrow','boss','bottom',
            'bounce','box','boy','bracket','brain','brand','brass','brave','bread','breeze','brick','bridge',
            'brief','bright','bring','brisk','broccoli','broken','bronze','broom','brother','brown','brush',
            'bubble','buddy','budget','buffalo','build','bulb','bulk','bullet','bundle','bunny','burden','burger',
            'burst','bus','business','busy','butter','buyer','buzz','cabbage','cabin','cable','cactus','cage',
            'cake','call','calm','camera','camp','can','canal','cancel','candy','canvas','cap','capacity','capital',
            'captain','car','carbon','card','cargo','carpet','carry','cart','case','cash','casino','castle',
            'casual','cat','catalog','catch','category','cattle','caught','cause','caution','cave','ceiling',
            'celery','cement','census','century','cereal','certain','chair','chalk','champion','change','chaos',
            'chapter','charge','chase','chat','cheap','check','cheese','chef','cherry','chest','chicken','chief',
            'child','chimney','choice','choose','chronic','chuckle','chunk','churn','citizen','city','civil',
            'claim','clap','clarify','claw','clay','clean','clerk','clever','click','client','cliff','climb',
            'clinic','clip','clock','clog','close','cloth','cloud','clown','club','clump','cluster','clutch',
            'coach','coast','coconut','code','coffee','coil','coin','collect','color','column','combine','come',
            'comfort','comic','common','company','concert','conduct','confirm','congress','connect','consider',
            'control','convince','cook','cool','copper','copy','coral','core','corn','correct','cost','cotton',
            'couch','country','couple','course','cousin','cover','coyote','crack','cradle','craft','cram','crane',
            'crash','crater','crawl','crazy','cream','credit','creek','crew','cricket','crime','crisp','critic',
            'crop','cross','crouch','crowd','crucial','cruel','cruise','crumble','crunch','crush','cry','crystal',
            'cube','culture','cup','cupboard','curious','current','curtain','curve','cushion','custom','cycle',
            'dad','damage','damp','dance','danger','daring','dash','daughter','dawn','deal','debate','debris',
            'decade','december','decide','decline','decorate','decrease','deer','defense','define','defy',
            'degree','delay','deliver','demand','demise','denial','dentist','deny','depart','depend','deposit',
            'depth','deputy','derive','describe','desert','design','desk','despair','destroy','detail','detect',
            'develop','device','devote','diagram','dial','diamond','diary','dice','diesel','diet','differ',
            'digital','dignity','dilemma','dinner','dinosaur','direct','dirt','disagree','discover','disease',
            'dish','dismiss','disorder','display','distance','divert','divide','divorce','dizzy','doctor',
            'document','dog','doll','dolphin','domain','donate','donkey','donor','door','dose','double','dove',
            'draft','dragon','drama','drastic','draw','dream','dress','drift','drill','drink','drip','drive',
            'drop','drum','dry','duck','dumb','dune','during','dust','dutch','duty','dwarf','dynamic','eager',
            'eagle','early','earn','earth','easily','east','easy','echo','ecology','economy','edge','edit',
            'educate','effort','egg','eight','either','elbow','elder','electric','elegant','element','elephant',
            'elevator','elite','else','embark','embody','embrace','emerge','emotion','employ','empower','empty',
            'enable','encourage','end','endless','endorse','enemy','energy','enforce','engage','engine','enhance',
            'enjoy','enlist','enough','enrich','enroll','ensure','enter','entire','entry','envelope','episode',
            'equal','equip','era','erase','erode','erosion','error','erupt','escape','essay','essence','estate',
            'eternal','ethics','evidence','evil','evolve','exact','example','excess','exchange','excite','exclude',
            'excuse','execute','exercise','exhaust','exhibit','exist','exit','exotic','expand','expect','expire',
            'explain','expose','express','extend','extra','eye','eyebrow','fabric','face','faculty','fade','faint',
            'faith','fall','false','fame','family','famous','fan','fancy','fantasy','farm','fashion','fat','fatal',
            'father','fatigue','fault','favorite','feature','february','federal','fee','feed','feel','female',
            'fence','festival','fetch','fever','few','fiber','fiction','field','figure','file','film','filter',
            'final','find','fine','finger','finish','fire','firm','first','fiscal','fish','fit','fitness','fix',
            'flag','flame','flash','flat','flavor','flee','flight','flip','float','flock','floor','flower','fluid',
            'flush','fly','foam','focus','fog','foil','fold','follow','food','foot','force','forest','forget',
            'fork','fortune','forum','forward','fossil','foster','found','fox','fragile','frame','frequent',
            'fresh','friend','fringe','frog','front','frost','frown','frozen','fruit','fuel','fun','funny',
            'furnace','fury','future','gadget','gain','galaxy','gallery','game','gap','garage','garbage','garden',
            'garlic','garment','gas','gasp','gate','gather','gauge','gaze','general','genius','genre','gentle',
            'genuine','gesture','ghost','giant','gift','giggle','ginger','giraffe','girl','give','glad','glance',
            'glare','glass','glide','glimpse','globe','gloom','glory','glove','glow','glue','goat','goddess',
            'gold','good','goose','gorilla','gospel','gossip','govern','grace','grade','grain','grand','grant',
            'grape','grass','gravity','great','green','grid','grief','grit','grocery','group','grow','grunt','guard',
            'guess','guide','guilt','guitar','gun','gym','habit','hair','half','hammer','hamster','hand','happy',
            'harbor','hard','harsh','harvest','hat','have','hawk','hazard','head','health','heart','heavy','hedgehog',
            'height','hello','helmet','help','hen','hero','hip','hire','history','hobby','hockey','hold','hole',
            'holiday','hollow','home','honey','hood','hope','horn','horror','horse','hospital','host','hotel',
            'hour','hover','hub','huge','human','humble','humor','hundred','hungry','hunt','hurdle','hurry',
            'hurt','husband','hybrid','ice','icon','idea','identify','idle','ignore','ill','illegal','illness',
            'image','imitate','immense','immune','impact','impose','improve','impulse','inch','include','income',
            'increase','index','indicate','industry','infant','inform','ink','innocent','input','inquiry','insane',
            'insect','inside','inspire','install','intact','interest','into','invest','invite','involve','iron',
            'island','isolate','issue','item','ivory','jacket','jaguar','jar','jazz','jealous','jeans','jelly',
            'jewel','job','join','joke','journey','joy','judge','juice','jump','jungle','junior','junk','just',
            'kangaroo','keen','keep','ketchup','key','kick','kid','kidney','kind','kingdom','kiss','kit','kitchen',
            'kite','kitten','kiwi','knee','knife','knock','know','lab','label','labor','ladder','lady','lake',
            'lamp','language','laptop','large','later','latin','laugh','laundry','lava','law','lawn','lawsuit',
            'layer','lazy','leader','leaf','learn','leave','lecture','left','leg','legal','legend','leisure','lemon',
            'lend','length','lens','leopard','lesson','letter','level','liberty','library','license','life','lift',
            'light','like','limb','limit','link','lion','liquid','list','little','live','lizard','load','loan',
            'lobster','local','lock','logic','lonely','long','loop','lottery','loud','lounge','love','loyal',
            'lucky','luggage','lumber','lunar','lunch','luxury','lyrics','machine','mad','magic','magnet','maid',
            'mail','main','major','make','mammal','man','manage','mandate','mango','mansion','manual','maple',
            'marble','march','margin','marine','market','marriage','mask','mass','master','match','material','math',
            'matrix','matter','maximum','maze','meadow','mean','measure','meat','mechanic','media','melody',
            'melt','member','memory','mention','menu','mercy','merge','merit','mesh','message','metal','method',
            'micro','midnight','military','milk','mind','mine','minimum','minor','minute','miracle','mirror',
            'misery','miss','mistake','mix','mixed','mixture','mobile','model','modify','mom','monitor','mood',
            'moon','moral','more','morning','mosquito','mother','motion','motor','mountain','mouse','move','movie',
            'much','muffin','mule','multiply','muscle','museum','mushroom','music','must','mutual','myself','mystery',
            'myth','naive','name','napkin','narrow','nasty','nation','nature','near','neck','need','negative',
            'neglect','neither','nephew','nerve','nest','net','network','neutral','never','news','next','nice',
            'night','noble','noise','nominee','noodle','normal','north','nose','notable','nothing','notice',
            'novel','now','nuclear','number','nurse','nut','oak','obey','object','oblige','obscure','observe',
            'obtain','obvious','occur','ocean','october','odor','off','offer','office','often','oil','okay',
            'old','olive','olympic','omit','once','one','onion','online','only','open','opera','opinion',
            'oppose','option','orange','orbit','orchard','order','ordinary','organ','orient','origin','ostrich',
            'other','outdoor','outer','output','outside','oval','oven','over','own','owner','oxygen','oyster',
            'ozone','pact','paddle','page','pair','palace','palm','panda','panel','panic','panther','paper',
            'parade','parent','park','parrot','party','pass','patch','path','patient','patrol','pattern','pause',
            'pavement','peach','pear','peanut','peat','penalty','pencil','people','pepper','perfect','permit',
            'person','pet','phone','photo','phrase','physical','piano','picnic','picture','piece','pig','pigeon',
            'pill','pilot','pink','pioneer','pipe','pistol','pitch','pizza','place','planet','plastic','plate',
            'play','please','pledge','pluck','plug','plunge','poem','poet','point','polar','pole','police','pond',
            'pony','pool','popular','portion','position','possible','post','potato','pottery','poverty','powder',
            'power','practice','praise','predict','prefer','prepare','present','pretty','prevent','price','pride',
            'primary','prime','print','priority','prison','private','prize','problem','process','produce','profit',
            'program','project','protect','proclaim','promise','propel','property','prosper','protect','proud',
            'provide','public','pudding','pull','pulp','pulse','pumpkin','punch','pupil','punish','puppy','purchase',
            'purity','purpose','purse','push','put','puzzle','pyramid','quality','quantum','quarter','question',
            'quick','quit','quiz','quote','rabbit','raccoon','race','rack','radar','radio','rail','rain','raise',
            'rally','ramp','ranch','random','range','rapid','rare','rate','rather','raven','raw','razor','ready',
            'real','reason','rebel','rebuild','recall','receive','recipe','record','recycle','reduce','reflect',
            'reform','refuse','region','regret','regular','reject','relax','release','relief','rely','remain',
            'remember','remind','remove','render','renew','rent','reopen','repair','repeat','replace','report',
            'require','rescue','resemble','resist','resource','response','result','retire','retreat','return',
            'reunion','reveal','review','reward','rhythm','rib','ribbon','rice','rich','ride','ridge','rifle',
            'right','rigid','ring','riot','ripple','risk','ritual','rival','river','road','roast','robot','robust',
            'rocket','romance','roof','rookie','room','rose','rotate','rough','round','route','royal','rubber',
            'rude','rug','rule','run','runway','rural','rust','rhythm','sad','saddle','safe','sail','salad',
            'salary','sale','salt','same','sand','satisfy','satoshi','save','say','scale','scan','scare','scatter',
            'scene','scheme','school','science','scissors','scorpion','scout','scrap','screen','script','scrub',
            'sea','search','season','seat','second','secret','section','security','seed','seek','segment','select',
            'sell','senior','sense','sentence','series','service','session','settle','setup','seven','shadow',
            'shaft','shallow','share','shed','shell','sheriff','shield','shift','shine','ship','shiver','shock',
            'shoe','shoot','shop','short','shoulder','shove','shrimp','shrug','shuffle','shy','sibling','sick',
            'side','siege','sight','sign','silent','silk','silly','silver','similar','simple','since','sing',
            'siren','sister','sit','situation','six','size','skate','sketch','ski','skill','skin','skirt','sky',
            'slip','slow','small','smart','smile','smoke','smooth','snack','snake','snap','sniff','snow','soap',
            'soccer','social','sock','soda','soft','solar','soldier','solid','solution','solve','someone','song',
            'soon','sorry','sort','soul','sound','soup','source','south','space','spare','spark','speak','speed',
            'spell','spend','sphere','spice','spider','spill','spin','spoon','sport','spot','spray','spread',
            'spring','spy','square','squeeze','squirrel','stable','stadium','staff','stage','stairs','stamp',
            'stand','start','state','stay','steak','steel','stem','step','stereo','stick','still','sting',
            'stock','stomach','stone','stool','story','stove','strategy','street','strike','strong','struggle',
            'student','stuff','stumble','style','subject','submit','substance','success','such','sudden','suffer',
            'sugar','suggest','suit','summer','sun','sunny','sunset','super','supply','supreme','sure','surface',
            'surge','surprise','surround','survey','suspect','sustain','swallow','swamp','swap','swarm','swear',
            'sweet','swim','swing','switch','sword','symbol','symptom','syrup','system','table','tackle','tag',
            'tail','talent','talk','tank','tape','target','task','taste','tattoo','taxi','teach','team','tell',
            'ten','tenant','tennis','tent','term','test','text','thank','that','theme','then','theory','there',
            'they','thing','this','thought','three','thrive','throw','thumb','thunder','ticket','tide','tiger',
            'tilde','time','tiny','tip','tired','tissue','title','toast','tobacco','today','toddler','toe','together',
            'toilets','tokyo','token','tomato','tomorrow','tone','tongue','tonight','tool','tooth','top','topic',
            'topple','torch','tornado','tortoise','toss','total','tourist','toward','tower','town','toy','track',
            'trade','traffic','tragic','train','transfer','trap','trash','travel','tray','treat','tree','trend',
            'trial','tribe','trick','trigger','trim','trip','trophy','trouble','truck','true','truly','trumpet',
            'trust','truth','try','tube','tuna','tunnel','turkey','turn','turtle','twelve','twenty','twice','twin',
            'twist','two','type','typical','ugly','umbrella','unable','unaware','uncle','uncover','under',
            'undo','unfair','unfold','unhappy','uniform','union','unique','unit','universe','unknown','unlock',
            'until','unusual','unveil','update','upgrade','uphold','upon','upper','upset','urban','urge','usage',
            'use','used','useful','useless','usual','utility','vacant','vacuum','vague','valid','valley','valor',
            'value','van','vanish','vapor','various','vast','vault','vehicle','velvet','vendor','venture','venue',
            'verb','verify','version','very','vessel','veteran','viable','vibrant','vicious','victory','video',
            'view','village','vintage','violin','virtual','virus','visa','visit','visual','vital','vivid','vocal',
            'voice','void','volcano','volume','vote','voyage','wage','wagon','wait','walk','wall','walnut','want',
            'warfare','warm','warrior','wash','washtub','waste','water','wave','way','wealth','weapon','wear',
            'weasel','weather','web','wedding','weekend','weird','welcome','well','west','wet','whale','what',
            'wheat','wheel','when','where','whip','whisper','wide','width','wife','wild','will','win','window',
            'wine','wing','wink','winner','winter','wire','wisdom','wise','wish','witness','wolf','woman','wonder',
            'wood','wool','word','work','world','worry','worth','wrap','wreck','wrestle','wrist','write','wrong',
            'yard','year','yellow','you','young','youth','zebra','zero','zone','zoo'].sort();
          
          const isValid = words.every(w => validBip39Words.includes(w.toLowerCase()));
          if (isValid && words.length >= 12) {
            console.log(`\n  ⚠️  POSSIBLE SEED PHRASE FOUND in: ${f.replace(HOME, '%USERPROFILE%')}`);
            console.log(`     Words: ${words.length}`);
            console.log(`     Content preview: "${content.trim().slice(0, 100)}..."`);
            console.log(`     DO NOT share this file! Move it to a secure location immediately.`);
            console.log(`     To derive the wallet address from this seed:`);
            console.log(`       const { ethers } = require('ethers');`);
            console.log(`       const wallet = ethers.Wallet.fromMnemonic('${words.join(' ')}');`);
            console.log(`       console.log(wallet.address);`);
          }
        }
      } catch {}
    }
  } catch {}
}

// 6. Provide instructions for manual lookup
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║           HOW TO FIND YOUR PRIVATE KEY MANUALLY                 ║');
console.log('╠══════════════════════════════════════════════════════════════════╣');
console.log('║                                                                  ║');
console.log('║  META MASK (most likely):                                        ║');
console.log('║    1. Open MetaMask extension                                    ║');
console.log('║    2. Click your account picture → "Account details"             ║');
console.log('║    3. Click "Export private key"                                 ║');
console.log('║    4. Enter your password                                        ║');
console.log('║    5. Copy the private key for 0x6350…dc38                       ║');
console.log('║                                                                  ║');
console.log('║  LEDGER:                                                         ║');
console.log('║    1. Open Ledger Live                                         ║');
console.log('║    2. Go to the Ethereum app on your device                      ║');
console.log('║    3. Click "Receive" → show address                             ║');
console.log('║    4. Find 0x6350…dc38 in the account list                      ║');
console.log('║    5. Export private key via Ledger Live settings               ║');
console.log('║                                                                  ║');
console.log('║  TREZOR:                                                         ║');
console.log('║    1. Open https://trezor.io/suite/                              ║');
console.log('║    2. Connect your Trezor device                                 ║');
console.log('║    3. Go to Settings → Security → Export private key             ║');
console.log('║    4. Select the account with 0x6350…dc38                        ║');
console.log('║                                                                  ║');
console.log('║  RABBY WALLET:                                                   ║');
console.log('║    1. Open Rabby extension                                       ║');
console.log('║    2. Click the account → three dots → Export private key         ║');
console.log('║                                                                  ║');
console.log('║  If you used a SEED PHRASE (12 or 24 words):                     ║');
console.log('║    Derive all addresses with this command (run in Node.js):      ║');
console.log('║    const w = ethers.Wallet.fromMnemonic("your 12 24 words");     ║');
console.log('║    for(let i=0;i<10;i++){ const a = ethers.HDNodeWallet.fromDerivationPath(`m/44\'/60\'/0\'/0/${i}`); console.log(i, a.address); } ║');
console.log('║                                                                  ║');
console.log('║  CHECK YOUR BROWSER BOOKMARKS:                                   ║');
console.log('║    Search for "LayerSwap" — your first transaction was via       ║');
console.log('║    LayerSwap bridge on 2026-09-03. That page may still have      ║');
console.log('║    your transfer history showing which destination address        ║');
console.log('║    you chose at that time.                                       ║');
console.log('║                                                                  ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
