/**
 * outreach-pipeline.js — business development WITHOUT spam.
 *
 * What this replaces
 * ------------------
 * "Scrape Alibaba / Made-in-China / trade-show lists and blast every email and
 * phone number 24/7" is not a growth strategy, it is a way to get the domain
 * blacklisted and to break CAN-SPAM (US), GDPR/PECR (EU/UK) and PIPL (China).
 * Unsolicited bulk email also gets the sending account terminated by the ESP.
 *
 * What this does instead
 * ----------------------
 * The same volume of *qualified* outreach, but with the controls that make it
 * legal and that actually produce replies:
 *
 *   1. BUSINESS-ONLY DATA   individual/personal addresses are rejected; a real
 *                           company domain is required.
 *   2. PROVENANCE           every lead must record where it came from and on what
 *                           legal basis (public business listing, inbound enquiry,
 *                           existing customer, consent).
 *   3. DEDUPE               one contact per address, one per domain per week.
 *   4. SUPPRESSION          unsubscribe/opt-out is permanent and global.
 *   5. HUMAN APPROVAL       nothing is sent until a human approves that message.
 *   6. RATE LIMITS          hard daily cap + minimum gap between sends.
 *   7. IDENTITY + OPT-OUT   real postal identity, working unsubscribe link and
 *                           List-Unsubscribe header on every message.
 *
 * Commands
 *   node scripts/outreach-pipeline.js add --file leads.csv
 *   node scripts/outreach-pipeline.js normalize
 *   node scripts/outreach-pipeline.js draft [--lang zh|en]
 *   node scripts/outreach-pipeline.js queue
 *   node scripts/outreach-pipeline.js approve <id> [<id> ...]
 *   node scripts/outreach-pipeline.js reject  <id> [<id> ...]
 *   node scripts/outreach-pipeline.js send [--limit 10] [--dry-run]
 *   node scripts/outreach-pipeline.js suppress <email> [--reason "..."]
 *   node scripts/outreach-pipeline.js stats
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'data', 'outreach');
const FILES = {
  leads: path.join(DIR, 'leads.json'),
  queue: path.join(DIR, 'queue.json'),
  suppression: path.join(DIR, 'suppression.json'),
  sent: path.join(DIR, 'sent.json'),
};

// ── Policy ──────────────────────────────────────────────────────────────────
const POLICY = {
  maxPerDay: Number(process.env.OUTREACH_MAX_PER_DAY || 20),
  minGapSeconds: Number(process.env.OUTREACH_MIN_GAP_SECONDS || 90),
  maxPerDomainPerWeek: 1,
  requireApproval: true,
  allowedBasis: ['public_business_listing', 'inbound_enquiry', 'existing_customer', 'consent'],
  // Free mailbox providers mean a private individual, not a business contact.
  personalDomains: [
    'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
    'qq.com', '163.com', '126.com', 'sina.com', 'sohu.com', 'foxmail.com', 'aliyun.com',
    'proton.me', 'protonmail.com', 'icloud.com', 'aol.com', 'gmx.de', 'mail.ru', 'yandex.ru',
  ],
  // Never contact these regardless of source.
  blockedDomainPatterns: [/(^|\.)gov(\.|$)/i, /(^|\.)mil(\.|$)/i, /(^|\.)edu(\.|$)/i],
  sender: {
    name: process.env.OUTREACH_SENDER_NAME || 'AutoTasker Hub',
    email: process.env.OUTREACH_SENDER_EMAIL || '',
    postal: process.env.OUTREACH_POSTAL || '',
    site: process.env.OUTREACH_SITE || '',
  },
};

const now = () => new Date().toISOString();
const dayKey = (d) => new Date(d || Date.now()).toISOString().slice(0, 10);

function load(key, fallback) {
  try { return JSON.parse(fs.readFileSync(FILES[key], 'utf8')); } catch (e) { return fallback; }
}
function save(key, data) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILES[key], JSON.stringify(data, null, 2), 'utf8');
}
function rand() { return Math.random().toString(36).slice(2, 7); }

// ── CSV / JSON ingest ───────────────────────────────────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1).filter(r => r.some(v => String(v).trim())).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
    return o;
  });
}

function cmdAdd(args) {
  const fileArg = args.indexOf('--file');
  if (fileArg === -1 || !args[fileArg + 1]) {
    console.error('Usage: add --file <leads.csv|leads.json>');
    process.exit(1);
  }
  const src = path.resolve(args[fileArg + 1]);
  const raw = fs.readFileSync(src, 'utf8');
  const rows = src.endsWith('.json') ? JSON.parse(raw) : parseCsv(raw);
  const leads = load('leads', []);
  let added = 0;
  for (const r of rows) {
    leads.push({
      id: `lead_${Date.now()}_${rand()}`,
      company: r.company || r.company_name || r.buyer || '',
      contactName: r.contact_name || r.contact || r.name || '',
      email: String(r.email || '').trim().toLowerCase(),
      phone: String(r.phone || r.tel || '').trim(),
      country: r.country || '',
      industry: r.industry || r.category || '',
      productInterest: r.product_interest || r.interest || '',
      source: r.source || path.basename(src),
      sourceUrl: r.source_url || '',
      basis: r.basis || '',
      status: 'new',
      addedAt: now(),
    });
    added++;
  }
  save('leads', leads);
  console.log(`Added ${added} raw leads from ${src}`);
  console.log('Now run: node scripts/outreach-pipeline.js normalize');
}

// ── Validation / compliance ─────────────────────────────────────────────────
function domainOf(email) { return String(email).split('@')[1] || ''; }

function validateLead(lead, seenEmails, seenDomains, suppressed) {
  const reasons = [];
  const email = String(lead.email || '').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) reasons.push('invalid_email');
  const domain = domainOf(email);
  if (POLICY.personalDomains.includes(domain)) reasons.push('personal_mailbox_not_a_business_contact');
  if (POLICY.blockedDomainPatterns.some(re => re.test(domain))) reasons.push('government_or_academic_domain');
  if (!lead.company) reasons.push('missing_company_name');
  if (!lead.source) reasons.push('missing_source_provenance');
  if (!POLICY.allowedBasis.includes(lead.basis)) reasons.push(`missing_valid_legal_basis (need one of ${POLICY.allowedBasis.join(', ')})`);
  if (suppressed.has(email)) reasons.push('on_suppression_list');
  if (seenEmails.has(email)) reasons.push('duplicate_email');
  if (seenDomains.has(domain)) reasons.push('duplicate_domain');
  return reasons;
}

function cmdNormalize() {
  const leads = load('leads', []);
  const suppression = new Set(load('suppression', []).map(s => String(s.email).toLowerCase()));
  const seenEmails = new Set();
  const seenDomains = new Set();
  const kept = [], rejected = [];

  for (const lead of leads) {
    if (lead.status && lead.status !== 'new') { kept.push(lead); continue; }
    const reasons = validateLead(lead, seenEmails, seenDomains, suppression);
    if (reasons.length) {
      rejected.push({ ...lead, status: 'rejected', rejectedReasons: reasons });
    } else {
      seenEmails.add(String(lead.email).toLowerCase());
      seenDomains.add(domainOf(lead.email));
      kept.push({ ...lead, status: 'validated' });
    }
  }

  save('leads', kept);
  const ok = kept.filter(l => l.status === 'validated').length;
  console.log(`Validated: ${ok}`);
  console.log(`Rejected:  ${rejected.length}`);
  const counts = {};
  for (const r of rejected) for (const reason of r.rejectedReasons) counts[reason] = (counts[reason] || 0) + 1;
  for (const [reason, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${reason}`);
  if (rejected.length) {
    fs.writeFileSync(path.join(DIR, 'rejected.json'), JSON.stringify(rejected, null, 2));
    console.log('Rejected leads written to data/outreach/rejected.json (never contacted)');
  }
  console.log('\nNext: node scripts/outreach-pipeline.js draft --lang zh');
}

// ── Drafting ────────────────────────────────────────────────────────────────
const TEMPLATES = {
  zh: {
    subject: (l) => `${l.company}｜可定制的软硬件产品与数据服务（1 页说明）`,
    body: (l) => [
      `${l.contactName || '您好'}：`,
      '',
      `我是 AutoTasker Hub 的商务负责人。看到贵司（${l.company}）在${l.industry || '本行业'}的业务信息，`,
      '我们能提供两类可以直接落地的合作：',
      '',
      '1) 定制软硬件产品：数据采集/监控终端、边缘计算盒子、扫码/RFID 读写模块、',
      '   小程序与后台系统、设备联网与远程运维。可按样机、小批量、量产三种方式交付。',
      '2) 数据与 AI 能力：中国市场舆情/电商价格/招投标/海关数据的 API 与报表，',
      '   按调用付费，无需年费，可直接接入贵司现有系统。',
      '',
      '如果您愿意，我可以先发一份 1 页的能力清单和报价区间，不占用您太多时间。',
      '只需要回复“资料”两个字即可。',
      '',
      '—— 本邮件发送自公开的企业联系方式，仅用于商务合作沟通。',
      '如不希望再收到，请回复“退订”或点击：{{unsubscribe}}',
      '',
      POLICY.sender.name,
      POLICY.sender.site,
      POLICY.sender.postal,
    ].join('\n'),
  },
  en: {
    subject: (l) => `${l.company}: custom hardware/software + China market data`,
    body: (l) => [
      `Hello ${l.contactName || 'there'},`,
      '',
      `I'm reaching out from ${POLICY.sender.name} about ${l.company}. Two things we build that`,
      'tend to be useful to companies in your space:',
      '',
      '1) Custom hardware and software: data-acquisition terminals, edge gateways,',
      '   RFID/barcode modules, companion web and mobile apps, and remote device',
      '   management. Prototype, small batch and mass production are all possible.',
      '2) China market data and AI: social-media trend, e-commerce pricing, tender and',
      '   customs datasets delivered as an API billed per call - no annual contract -',
      '   so it plugs into whatever you already run.',
      '',
      'Happy to send a one-page capability sheet with indicative pricing. A reply of',
      '"details" is enough.',
      '',
      '-- Sent to a publicly listed business address for a business enquiry only.',
      'To stop receiving these, reply "unsubscribe" or use: {{unsubscribe}}',
      '',
      POLICY.sender.name,
      POLICY.sender.site,
      POLICY.sender.postal,
    ].join('\n'),
  },
};

function unsubscribeToken(email) {
  return Buffer.from(`unsub:${email}`).toString('base64url');
}

function cmdDraft(args) {
  const langIdx = args.indexOf('--lang');
  const lang = langIdx !== -1 ? args[langIdx + 1] : 'zh';
  const tpl = TEMPLATES[lang] || TEMPLATES.zh;
  const leads = load('leads', []);
  const queue = load('queue', []);
  const queued = new Set(queue.map(q => q.leadId));

  let made = 0;
  for (const lead of leads) {
    if (lead.status !== 'validated' || queued.has(lead.id)) continue;
    const token = unsubscribeToken(lead.email);
    queue.push({
      id: `msg_${Date.now()}_${rand()}`,
      leadId: lead.id,
      to: lead.email,
      company: lead.company,
      lang,
      subject: tpl.subject(lead),
      body: tpl.body(lead).replace('{{unsubscribe}}', `${POLICY.sender.site}/unsubscribe?t=${token}`),
      status: 'pending_approval',
      createdAt: now(),
    });
    made++;
  }
  save('queue', queue);
  console.log(`Drafted ${made} message(s). Nothing is sent until a human approves.`);
  console.log('Review: node scripts/outreach-pipeline.js queue');
}

function cmdQueue() {
  const queue = load('queue', []);
  const pending = queue.filter(q => q.status === 'pending_approval');
  const approved = queue.filter(q => q.status === 'approved');
  console.log(`pending approval: ${pending.length}   approved & ready: ${approved.length}\n`);
  for (const q of [...approved, ...pending]) {
    console.log(`[${q.status.padEnd(16)}] ${q.id}  ->  ${q.to}  (${q.company})`);
    console.log(`   subject: ${q.subject}`);
  }
}

function cmdSetStatus(args, status) {
  const ids = args.filter(a => !a.startsWith('--'));
  const queue = load('queue', []);
  let n = 0;
  for (const q of queue) {
    if (!ids.includes(q.id)) continue;
    if (status === 'approved' && q.status !== 'pending_approval') continue;
    q.status = status;
    q.reviewedAt = now();
    n++;
  }
  save('queue', queue);
  console.log(`${status}: ${n} message(s)`);
}

// ── Sending ─────────────────────────────────────────────────────────────────
async function sendViaSmtp(msg) {
  // Lazy require so the CLI works without nodemailer installed.
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const site = POLICY.sender.site;
  return transport.sendMail({
    from: `"${POLICY.sender.name}" <${POLICY.sender.email}>`,
    to: msg.to,
    subject: msg.subject,
    text: msg.body,
    headers: {
      'List-Unsubscribe': `<${site}/unsubscribe?t=${unsubscribeToken(msg.to)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}

async function cmdSend(args) {
  const dry = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : POLICY.maxPerDay;
  const queue = load('queue', []);
  const sent = load('sent', []);
  const suppression = new Set(load('suppression', []).map(s => String(s.email).toLowerCase()));

  const today = dayKey();
  const sentToday = sent.filter(s => dayKey(s.sentAt) === today).length;
  if (sentToday >= POLICY.maxPerDay) {
    console.log(`Daily cap reached (${POLICY.maxPerDay}). Stopping - this is the anti-spam guard.`);
    return;
  }
  const allowance = Math.min(limit, POLICY.maxPerDay - sentToday);
  const approved = queue.filter(q => q.status === 'approved' && !suppression.has(String(q.to).toLowerCase()));
  if (!approved.length) { console.log('Nothing approved. Run: queue, then approve <id>.'); return; }
  if (!dry && (!process.env.SMTP_HOST || !POLICY.sender.email || !POLICY.sender.postal || !POLICY.sender.site)) {
    console.log('Refusing to send: SMTP_HOST, OUTREACH_SENDER_EMAIL, OUTREACH_POSTAL and OUTREACH_SITE must be set.');
    console.log('A real postal identity and a working unsubscribe URL are legal requirements.');
    return;
  }

  const weekAgo = Date.now() - 7 * 86400e3;
  const domainsThisWeek = new Set(sent.filter(s => new Date(s.sentAt).getTime() > weekAgo).map(s => domainOf(s.to)));

  let n = 0;
  for (const msg of approved) {
    if (n >= allowance) break;
    const d = domainOf(msg.to);
    if (domainsThisWeek.has(d)) { console.log(`skip ${msg.to}: domain already contacted this week`); continue; }
    if (dry) {
      console.log(`\n[DRY RUN] to=${msg.to}\nsubject: ${msg.subject}\n---\n${msg.body}\n---`);
    } else {
      try {
        const info = await sendViaSmtp(msg);
        console.log(`sent -> ${msg.to}  (${info.messageId})`);
        await new Promise(r => setTimeout(r, POLICY.minGapSeconds * 1000));
      } catch (e) {
        console.error(`FAILED ${msg.to}: ${String(e.message).slice(0, 120)}`);
        continue;
      }
    }
    domainsThisWeek.add(d);
    const rec = { id: msg.id, to: msg.to, company: msg.company, subject: msg.subject, sentAt: now(), dryRun: dry };
    sent.push(rec);
    msg.status = dry ? 'dry_run' : 'sent';
    n++;
  }
  save('sent', sent);
  save('queue', queue);
  console.log(`\nProcessed ${n} message(s). Sent today: ${sentToday + (dry ? 0 : n)}/${POLICY.maxPerDay}.`);
}

function cmdSuppress(args) {
  const email = String(args[0] || '').toLowerCase();
  if (!email) { console.error('Usage: suppress <email> [--reason "..."]'); process.exit(1); }
  const ri = args.indexOf('--reason');
  const list = load('suppression', []);
  if (list.some(s => s.email === email)) { console.log(`${email} is already suppressed.`); return; }
  list.push({ email, reason: ri !== -1 ? args[ri + 1] : 'unsubscribe', at: now() });
  save('suppression', list);
  const queue = load('queue', []);
  let removed = 0;
  for (const q of queue) if (String(q.to).toLowerCase() === email && q.status !== 'sent') { q.status = 'suppressed'; removed++; }
  save('queue', queue);
  console.log(`Suppressed ${email}. Cancelled ${removed} queued message(s).`);
}

function cmdStats() {
  const leads = load('leads', []);
  const queue = load('queue', []);
  const sent = load('sent', []);
  const sup = load('suppression', []);
  const by = (arr, k) => arr.reduce((a, x) => (a[x[k]] = (a[x[k]] || 0) + 1, a), {});
  console.log('LEADS      ', leads.length, JSON.stringify(by(leads, 'status')));
  console.log('QUEUE      ', queue.length, JSON.stringify(by(queue, 'status')));
  console.log('SENT       ', sent.length, `today ${sent.filter(s => dayKey(s.sentAt) === dayKey()).length}/${POLICY.maxPerDay}`);
  console.log('SUPPRESSED ', sup.length);
  console.log('\nPolicy:', JSON.stringify({
    maxPerDay: POLICY.maxPerDay, minGapSeconds: POLICY.minGapSeconds,
    maxPerDomainPerWeek: POLICY.maxPerDomainPerWeek, requireApproval: POLICY.requireApproval,
  }));
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
const table = {
  add: cmdAdd, normalize: cmdNormalize, draft: cmdDraft, queue: cmdQueue,
  approve: (a) => cmdSetStatus(a, 'approved'),
  reject: (a) => cmdSetStatus(a, 'rejected'),
  send: cmdSend, suppress: cmdSuppress, stats: cmdStats,
};
if (!table[cmd]) {
  console.log('Commands: add | normalize | draft | queue | approve | reject | send | suppress | stats');
  process.exit(1);
}
Promise.resolve(table[cmd](rest)).catch(e => { console.error(e); process.exit(1); });
