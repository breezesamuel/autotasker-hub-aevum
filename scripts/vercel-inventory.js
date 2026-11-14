/**
 * vercel-inventory.js — read-only: find the autotasker project + list env var NAMES (values masked)
 * Reads token from config/credentials.json (never printed).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const credFile = path.join(ROOT, 'config', 'credentials.json');

let token;
try {
  const raw = fs.readFileSync(credFile, 'utf8');
  // file has a BOM and may be slightly malformed; extract token by regex
  const m = raw.match(/"vercel"[\s\S]{0,200}?"token"\s*:\s*"([^"]+)"/);
  if (!m) throw new Error('token field not found');
  token = m[1];
} catch (e) {
  console.error('cannot read vercel token:', e.message);
  process.exit(1);
}

async function api(p) {
  const r = await fetch(`https://api.vercel.com${p}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  return { status: r.status, body: j || t.slice(0, 300) };
}

const mask = (v) => (!v ? v : v.length <= 8 ? '***' : v.slice(0, 4) + '…' + v.slice(-2));

(async () => {
  const me = await api('/v2/user');
  console.log('auth:', me.status === 200 ? `OK (${me.body.user?.username || me.body.user?.email})` : `FAIL ${me.status} ${JSON.stringify(me.body).slice(0, 160)}`);
  if (me.status !== 200) process.exit(2);

  const teams = await api('/v2/teams');
  const teamList = (teams.body.teams || []).map(t => ({ id: t.id, slug: t.slug }));
  console.log('teams:', JSON.stringify(teamList));

  const results = [];
  for (const t of [{ id: null, slug: '(personal)' }, ...teamList]) {
    const q = t.id ? `?teamId=${t.id}` : '';
    const pr = await api(`/v9/projects${q}`);
    if (pr.status !== 200) { results.push({ team: t.slug, err: pr.status }); continue; }
    for (const p of pr.body.projects || []) {
      results.push({ team: t.slug, teamId: t.id, name: p.name, id: p.id, updated: p.updatedAt });
    }
  }
  console.log('\nprojects:');
  for (const r of results) console.log(' ', JSON.stringify(r));

  const target = results.find(r => /autotasker/i.test(r.name || ''));
  if (!target) { console.log('\nno autotasker project found'); return; }

  console.log(`\n=== env vars of ${target.team}/${target.name} ===`);
  const ev = await api(`/v9/projects/${target.id}/env${target.teamId ? `?teamId=${target.teamId}` : ''}`);
  if (ev.status !== 200) { console.log('env list failed', ev.status, JSON.stringify(ev.body).slice(0, 200)); return; }
  for (const e of ev.body.envs || []) {
    const val = e.value !== undefined ? e.value : '(encrypted)';
    console.log(`  ${e.key} = ${mask(String(val))}  [${e.target?.join(',')}] type=${e.type}`);
  }
})();
