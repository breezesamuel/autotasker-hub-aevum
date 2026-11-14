// Check inbox for any new replies since last check
const { listRecent } = require('../../lib/imap');
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..', '..', 'data', 'recon', 'mail');
fs.mkdirSync(OUT, { recursive: true });

const cfg = { host: 'imap.qq.com', port: 993, user: '460123249@qq.com', pass: 'namnbldayykicaji' };
const LAST_CHECK_SEQ = 7804;

(async () => {
  const { total, items } = await listRecent(cfg, 5);
  const newEmails = items.filter(h => h.seq > LAST_CHECK_SEQ);
  
  if (newEmails.length === 0) {
    console.log(`No new emails since seq ${LAST_CHECK_SEQ}. Inbox has ${total} total.\n`);
    
    // Summarize latest from each key contact
    const nicole = [...items].reverse().find(h => h.from && h.from.includes('nicole'));
    const ethan = [...items].reverse().find(h => h.from && h.from.includes('ethan'));
    
    console.log('Last known status:');
    console.log(`  Nicole (seq ${nicole?.seq || '?'}): "${nicole?.subject || '?'}" — Discord link sent`);
    console.log(`  Ethan  (seq ${ethan?.seq  || '?'}): "${ethan?.subject  || '?'}" — Pivot email sent`);
    console.log(`\n⏳ Waiting for replies (typically 24-48h). Next check after Nov 13.`);
    return;
  }
  
  console.log(`Found ${newEmails.length} new email(s):\n`);
  for (const h of newEmails) {
    console.log(`[${h.seq}] ${h.date} | ${h.from} | ${h.subject}`);
  }
})();
