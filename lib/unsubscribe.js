/**
 * unsubscribe.js — the legally required opt-out endpoint.
 *
 * CAN-SPAM, GDPR/PECR and PIPL all require that an unsubscribe request is honoured
 * promptly and permanently. That means the link in every outbound email must
 * actually work and actually persist.
 *
 * Storage is pluggable because serverless filesystems are read-only:
 *   - OUTREACH_SUPPRESSION_WEBHOOK: POST {email, at, reason} to any durable store
 *     (Google Apps Script, Zapier, Make, Notion, Airtable, your own API).
 *   - otherwise: append to data/outreach/suppression.json (works locally).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'data', 'outreach', 'suppression.json');

function decodeToken(t) {
  try {
    const raw = Buffer.from(String(t), 'base64url').toString('utf8');
    const m = /^unsub:(.+)$/.exec(raw);
    return m ? m[1].toLowerCase() : null;
  } catch (e) {
    return null;
  }
}

function localAppend(email, reason) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
  if (list.some(s => String(s.email).toLowerCase() === email)) return false;
  list.push({ email, reason: reason || 'unsubscribe', at: new Date().toISOString() });
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8');
  return true;
}

async function record(email, reason) {
  const hook = process.env.OUTREACH_SUPPRESSION_WEBHOOK;
  if (hook) {
    const r = await fetch(hook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, reason: reason || 'unsubscribe', at: new Date().toISOString() }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`suppression webhook returned ${r.status}`);
    return true;
  }
  return localAppend(email, reason);
}

function page(title, message) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;max-width:32rem;margin:18vh auto;padding:0 1.5rem;color:#111}h1{font-size:1.4rem}</style>
<h1>${title}</h1><p>${message}</p>`;
}

function mountUnsubscribe(app) {
  const handle = async (req, res) => {
    const token = req.query.t || (req.body && req.body.t);
    const email = decodeToken(token) || String(req.query.email || '').toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
      return res.status(400).type('html').send(page('Invalid link', 'This unsubscribe link is malformed. Reply to any of our emails with "unsubscribe" and we will remove you manually.'));
    }
    try {
      await record(email, req.query.reason);
      res.type('html').send(page('Unsubscribed', `${email} has been added to our permanent suppression list and will not receive further business emails from us.`));
    } catch (e) {
      res.status(500).type('html').send(page('Something went wrong', 'We could not record your request automatically. Reply to any of our emails with "unsubscribe" and we will remove you manually within 24 hours.'));
    }
  };

  app.get('/unsubscribe', handle);
  app.post('/unsubscribe', handle); // RFC 8058 one-click
}

module.exports = { mountUnsubscribe, decodeToken };
