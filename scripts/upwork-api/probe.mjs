#!/usr/bin/env node
// One-time check of Upwork's official API with a real key, run by the account owner on their own
// computer. It signs in as YOU (on upwork.com, in your own browser), reads YOUR profile through the
// official API, and writes a report of which field names Upwork accepts. The report shows the
// SHAPE of the answers (field names, types, lengths), never your profile text, so it is safe to
// share. No password, token or secret is written to disk, and nothing is sent anywhere but Upwork.
//
//   UPWORK_API_CLIENT_ID=... UPWORK_API_CLIENT_SECRET=... \
//   UPWORK_API_REDIRECT_URI=<the callback saved in your Upwork key settings> \
//   node scripts/upwork-api/probe.mjs
//
// Run it BEFORE putting the key into Render, so the live site's callback stays switched off and does
// not use up the one-time sign-in code. Requires Node 20+. No packages.
import { createInterface } from 'node:readline/promises';
import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const need = n => { const v = (process.env[n] || '').trim(); if (!v) { console.error(`Set ${n} first.`); process.exit(1); } return v; };
const clientId = need('UPWORK_API_CLIENT_ID');
const clientSecret = need('UPWORK_API_CLIENT_SECRET');
const redirectUri = need('UPWORK_API_REDIRECT_URI');
const authorizeUrl = process.env.UPWORK_API_AUTHORIZE_URL || 'https://www.upwork.com/ab/account-security/oauth2/authorize';
const tokenUrl = process.env.UPWORK_API_TOKEN_URL || 'https://www.upwork.com/api/v3/oauth2/token';
const graphqlUrl = process.env.UPWORK_API_GRAPHQL_URL || 'https://api.upwork.com/graphql';

const report = { when: new Date().toISOString(), hosts: { authorizeUrl, tokenUrl, graphqlUrl }, steps: [] };
const note = (step, detail) => { report.steps.push({ step, ...detail }); console.log(`- ${step}: ${detail.ok === false ? 'FAILED' : 'ok'}${detail.note ? ` (${detail.note})` : ''}`); };

// 1. Sign in as yourself.
const state = randomBytes(16).toString('hex');
const u = new URL(authorizeUrl);
u.searchParams.set('response_type', 'code'); u.searchParams.set('client_id', clientId);
u.searchParams.set('redirect_uri', redirectUri); u.searchParams.set('state', state);
console.log('\nOpen this address in your browser, sign in to Upwork and approve:\n\n' + u.href + '\n');
console.log('Upwork will send you to your callback address. Copy the FULL address from the browser bar after it loads');
console.log('(it contains ?code=...) and paste it here. The page itself may show an error; that is fine.\n');
const rl = createInterface({ input: process.stdin, output: process.stdout });
const pasted = (await rl.question('Pasted address: ')).trim(); rl.close();
let code;
try { const p = new URL(pasted); code = p.searchParams.get('code'); note('state echoed back', { ok: p.searchParams.get('state') === state, note: 'if FAILED, Upwork does not return `state`; the app then fails closed and needs a different CSRF approach' }); }
catch { console.error('That was not a web address.'); process.exit(1); }
if (!code) { console.error('No code= in that address.'); process.exit(1); }

// 2. Trade the code for a token (kept in memory only).
const tokenRes = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }) });
const tokenBody = await tokenRes.json().catch(() => ({}));
note('token exchange', { ok: tokenRes.ok && !!tokenBody.access_token, status: tokenRes.status, note: tokenRes.ok ? `fields: ${Object.keys(tokenBody).filter(k => !/token/i.test(k)).join(', ')}` : String(tokenBody.error || '') });
if (!tokenBody.access_token) { await writeFile('upwork-probe-report.json', JSON.stringify(report, null, 2)); process.exit(2); }
const token = tokenBody.access_token;

const gql = async (query, variables = {}) => {
  const r = await fetch(graphqlUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ query, variables }) });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, data: body.data ?? null, errors: (body.errors || []).map(e => String(e.message).slice(0, 200)) };
};
// Shape only: strings become their length, so the report never contains profile text.
const shape = v => Array.isArray(v) ? [v.length, v.length ? shape(v[0]) : null] : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v === 'string' ? `<string:${v.length}>` : typeof v;

// 3. Who am I? (the app needs the profile key from the signed-in user's public address)
let key = null;
for (const query of ['query { user { id nid rid name publicUrl } }', 'query { user { id publicUrl } }', 'query { organization { id } }']) {
  const r = await gql(query);
  note(`identity: ${query}`, { ok: !!r.data && !r.errors.length, status: r.status, shape: shape(r.data), errors: r.errors });
  const url = r.data?.user?.publicUrl;
  key = key || (typeof url === 'string' ? /(~[0-9a-f]{8,})/i.exec(url)?.[1] : null) || null;
}
note('profile key found', { ok: !!key, note: key ? 'found in the public address' : 'no profile key; the app cannot prove ownership of a profile' });

// 4. Which profile selections does Upwork accept?
const BASE = 'personalData { firstName lastName title description location { country state city } } profileAggregates { totalJobs totalFeedback topRatedStatus lastWorkedOn }';
const selections = {
  'full (GUESS)': `${BASE} skills { name } employmentRecords { companyName jobTitle startDate endDate description } projectList { title description }`,
  'with skills (GUESS)': `${BASE} skills { name }`,
  base: BASE,
};
if (key) for (const [label, sel] of Object.entries(selections)) {
  const r = await gql(`query ($profileKey: String!) { talentProfileByProfileKey(profileKey: $profileKey) { ${sel} } }`, { profileKey: key });
  note(`profile selection "${label}"`, { ok: !!r.data?.talentProfileByProfileKey && !r.errors.length, status: r.status, shape: shape(r.data?.talentProfileByProfileKey), errors: r.errors });
}

// 5. If introspection is allowed, list the real field names under the profile type (names only).
const intro = await gql('{ __type(name: "Query") { fields { name type { name kind ofType { name kind ofType { name kind } } } } } }');
const fields = intro.data?.__type?.fields;
note('introspection', { ok: !!fields, note: fields ? 'allowed' : 'not allowed; field names must come from Upwork\'s docs or support' });
if (fields) {
  const walk = async (typeName, depth, seen = new Set()) => {
    if (depth < 0 || seen.has(typeName)) return null; seen.add(typeName);
    const r = await gql(`{ __type(name: "${typeName}") { fields { name type { name kind ofType { name kind ofType { name kind } } } } } }`);
    const out = {};
    for (const f of r.data?.__type?.fields || []) {
      const t = f.type?.name || f.type?.ofType?.name || f.type?.ofType?.ofType?.name;
      const kind = f.type?.kind === 'SCALAR' || f.type?.ofType?.kind === 'SCALAR' || f.type?.ofType?.ofType?.kind === 'SCALAR';
      out[f.name] = kind ? t : t ? await walk(t, depth - 1, seen) ?? t : '?';
    }
    return out;
  };
  const q = fields.find(f => f.name === 'talentProfileByProfileKey');
  const rootType = q?.type?.name || q?.type?.ofType?.name;
  if (rootType) report.profileTypeTree = await walk(rootType, 3);
  note('profile type tree', { ok: !!report.profileTypeTree, note: rootType });
}

await writeFile('upwork-probe-report.json', JSON.stringify(report, null, 2));
console.log('\nWrote upwork-probe-report.json (field names and types only, no profile text). Share it so the field list can be corrected.');
