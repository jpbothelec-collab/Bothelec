'use strict';
/* Bothelec Aircon Solutions server: REST API + live updates (SSE) + static web app.
 * Start: node --env-file=.env server/index.js   (see deploy/.env.example) */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { openDb } = require('./lib/db');
const { createModel } = require('./lib/model');
const { createNotifier } = require('./lib/notify');
const { createConnectorManager } = require('./lib/connectors');
const { createZohoClient, authUrl, exchangeCode, revokeToken, DCS } = require('./lib/zoho');
const { verifyPassword, isStaff, canBuilding, canJob, rateLimited } = require('./lib/auth');
const { rid, byId, nowIso, log } = require('./lib/util');

function createServer(env = process.env, opts = {}) {
  const dataDir = path.resolve(env.DATA_DIR || path.join(__dirname, '..', 'data'));
  const publicDir = path.resolve(env.PUBLIC_DIR || path.join(__dirname, '..', 'public'));
  const db = openDb(dataDir);
  const bus = new EventEmitter(); bus.setMaxListeners(100);
  const model = createModel({ db, env, bus, filesDir: path.join(dataDir, 'files') });
  const notifier = createNotifier({ db, env, onStatus: m => model.onOutboxStatus(m), openPort: opts.openPort });
  model.setNotifier(notifier);
  /* Zoho connection: one made in the app (Settings → Connect Zoho Books) wins over .env values. */
  let zoho;
  function buildZoho() {
    const c = db.kv('zohoConn', null);
    zoho = c && c.refreshToken
      ? createZohoClient({ ...env, ZOHO_DC: c.dc, ZOHO_CLIENT_ID: c.clientId, ZOHO_CLIENT_SECRET: c.clientSecret, ZOHO_REFRESH_TOKEN: c.refreshToken, ZOHO_ORG_ID: c.orgId || '', ZOHO_ACCOUNTS_URL: c.accountsUrl, ZOHO_API_URL: c.apiUrl })
      : createZohoClient(env);
    zoho.meta = c && c.refreshToken ? { source: 'app', orgName: c.orgName || '', connectedAt: c.connectedAt, connectedBy: c.connectedBy, clientIdHint: '…' + String(c.clientId).slice(-4) } : { source: zoho.configured ? 'env' : 'none' };
    model.setZoho(zoho);
  }
  buildZoho();
  const connectors = createConnectorManager({ model, bus });
  const S = model.S;
  const secureCookie = /^https:/.test(env.PUBLIC_URL || '') || env.COOKIE_SECURE === 'true';
  const SESSION_TTL = 30 * 864e5;

  /* ---------------- helpers ---------------- */
  const send = (res, code, body, headers = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const fail = (res, code, error) => send(res, code, { error });
  function readBody(req, limit = 20e6) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Payload too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const ct = req.headers['content-type'] || '';
        if (!raw) return resolve({});
        if (ct.includes('application/x-www-form-urlencoded')) return resolve(Object.fromEntries(new URLSearchParams(raw)));
        try { resolve(JSON.parse(raw)); } catch { ct.includes('json') ? reject(Object.assign(new Error('Invalid JSON'), { code: 400 })) : resolve({ text: raw }); }
      });
      req.on('error', reject);
    });
  }
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  function currentUser(req) {
    const t = cookies(req).tsid || (req.headers.authorization || '').replace(/^Bearer /, '');
    const uid = t && db.session.get(t);
    return uid ? byId(S.users, uid) : null;
  }
  const clientIp = req => (env.TRUST_PROXY === 'true' && (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;

  /* ---------------- live updates (SSE) ---------------- */
  const streams = new Set();
  let stateTimer = null; const stateBuildings = new Set(); let stateAll = false;
  bus.on('state', ({ building }) => {
    if (building) stateBuildings.add(building); else stateAll = true;
    if (!stateTimer) stateTimer = setTimeout(() => {
      stateTimer = null;
      for (const s of streams) if (stateAll || [...stateBuildings].some(b => canBuilding(s.user, b))) s.res.write(`event: state\ndata: {}\n\n`);
      stateBuildings.clear(); stateAll = false;
    }, 300);
  });
  const bmsLast = {};
  bus.on('bms', ({ building }) => {
    const now = Date.now(); if (bmsLast[building] && now - bmsLast[building] < 900) return; bmsLast[building] = now;
    const bm = S.bms[building]; if (!bm) return;
    const { trend, ...rest } = bm;
    const msg = `event: bms\ndata: ${JSON.stringify({ building, bms: rest, point: trend[trend.length - 1] || null })}\n\n`;
    for (const s of streams) if (s.building === building && canBuilding(s.user, building)) s.res.write(msg);
  });
  const ping = setInterval(() => { for (const s of streams) s.res.write(': ping\n\n'); }, 25000); ping.unref();

  /* ---------------- routes ---------------- */
  const routes = [];
  const R = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, opts });
  const ALL = ['admin', 'desk', 'tech', 'client'], STAFF = ['admin', 'desk'], FIELD = ['admin', 'desk', 'tech'];
  const job = (res, u, id) => { const j = byId(S.jobs, id); if (!j || !canJob(u, j)) { fail(res, 404, 'Job not found'); return null; } return j; };
  const result = (res, r, extra) => r && r.error ? fail(res, 400, r.error) : send(res, 200, { ok: true, ...(extra || {}), ...(r || {}) });

  // auth
  R('POST', '/api/login', async (req, res, { body }) => {
    const email = String(body.email || '').trim().toLowerCase();
    if (rateLimited(clientIp(req) + email)) return fail(res, 429, 'Too many attempts. Try again in 15 minutes.');
    const u = S.users.find(x => x.email === email);
    if (!u || !verifyPassword(body.password || '', u.passwordHash)) return fail(res, 401, 'Wrong email or password.');
    const t = rid(32); db.session.create(t, u.id, SESSION_TTL); db.session.purge();
    send(res, 200, { ok: true }, { 'Set-Cookie': `tsid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}${secureCookie ? '; Secure' : ''}` });
  }, { public: true });
  R('POST', '/api/logout', (req, res) => { const t = cookies(req).tsid; if (t) db.session.del(t); send(res, 200, { ok: true }, { 'Set-Cookie': 'tsid=; HttpOnly; Path=/; Max-Age=0' }); }, { public: true });
  R('POST', '/api/me/password', (req, res, { u, body }) => {
    if (!verifyPassword(body.current || '', u.passwordHash)) return fail(res, 400, 'Current password is wrong.');
    const r = model.upsertUser({ ...u, password: body.password }); // signs this user out everywhere…
    if (r.error) return fail(res, 400, r.error);
    const t = rid(32); db.session.create(t, u.id, SESSION_TTL); // …then keep this device signed in
    send(res, 200, { ok: true }, { 'Set-Cookie': `tsid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}${secureCookie ? '; Secure' : ''}` });
  }, { roles: ALL });

  // state
  R('GET', '/api/state', (req, res, { u }) => send(res, 200, model.stateFor(u)), { roles: ALL });
  R('GET', '/api/bms/:bid', (req, res, { u, p }) => { if (u.role === 'tech' || !canBuilding(u, p.bid)) return fail(res, 404, 'Not found'); send(res, 200, S.bms[p.bid] || null); }, { roles: ALL });
  R('GET', '/api/events', (req, res, { u, url }) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const s = { res, user: u, building: u.role === 'tech' ? null : url.searchParams.get('building') };
    streams.add(s); req.on('close', () => streams.delete(s));
  }, { roles: ALL, raw: true });
  R('GET', '/api/files/:name', (req, res, { u, p }) => {
    const j = S.jobs.find(x => x.signature === '/api/files/' + p.name || x.photos.includes('/api/files/' + p.name));
    if (!j || !canJob(u, j)) return fail(res, 404, 'Not found');
    const f = model.fileFor('/api/files/' + p.name); if (!f) return fail(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': /\.png$/.test(f) ? 'image/png' : /\.webp$/.test(f) ? 'image/webp' : 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
    fs.createReadStream(f).pipe(res);
  }, { roles: ALL, raw: true });

  // jobs
  R('POST', '/api/jobs', (req, res, { u, body }) => {
    if (!canBuilding(u, body.building) || !byId(S.buildings, body.building)) return fail(res, 400, 'Choose a building.');
    if (!String(body.fault || '').trim()) return fail(res, 400, 'Describe the fault.');
    const j = model.newJob({
      building: body.building, equipment: String(body.equipment || 'Other / not sure').slice(0, 120), location: String(body.location || '').slice(0, 120),
      fault: String(body.fault).trim().slice(0, 1000), urgency: ['Low', 'Medium', 'High', 'Critical'].includes(body.urgency) ? body.urgency : 'Medium',
      contact: String(body.contact || u.name).slice(0, 80), contactPhone: body.contactPhone || u.phone || '', contactEmail: body.contactEmail || u.email || '',
      source: u.role === 'client' ? 'Client app' : 'Service desk', division: body.division === 'utility' ? 'utility' : 'aircon',
    }, u);
    if (Array.isArray(body.photos) && body.photos.length) model.addPhotos(j, body.photos);
    send(res, 200, { ok: true, id: j.id });
    // service desk routing: auto-assign shortly after logging (desk can reassign)
    setTimeout(() => { if (j.status === 'logged') model.autoAssign(j); }, +(env.AUTO_ASSIGN_DELAY_MS || 2000)).unref();
  }, { roles: ALL });
  R('POST', '/api/jobs/:id/advance', (req, res, { u, p }) => { const j = job(res, u, p.id); if (j) result(res, model.advance(j, u)); }, { roles: FIELD });
  R('POST', '/api/jobs/:id/assign', (req, res, { u, p, body }) => {
    const j = job(res, u, p.id); if (!j) return;
    if (!['logged', 'assigned', 'enroute'].includes(j.status)) return fail(res, 400, 'Jobs can only be (re)assigned before the technician is on site.');
    if (body.tech && !model.tech(body.tech)) return fail(res, 400, 'Technician not found.');
    if (body.tech && body.tech === j.tech) return fail(res, 400, 'Already assigned to that technician.');
    if (body.tech && model.tech(body.tech).status !== 'available') return fail(res, 400, model.tech(body.tech).name + ' is not available.');
    result(res, model.autoAssign(j, u, body.tech), {});
  }, { roles: STAFF });

  // building contacts & equipment register / service history
  R('PUT', '/api/buildings/:bid/contacts', (req, res, { p, body }) => result(res, model.setContacts(p.bid, body.contacts)), { roles: STAFF });
  R('POST', '/api/buildings/:bid/units', (req, res, { p, body }) => result(res, model.upsertUnit(p.bid, body.unit || {}, body.originalId)), { roles: STAFF });
  R('POST', '/api/buildings/:bid/units/:uid/removed', (req, res, { p, body }) => result(res, model.setUnitRemoved(p.bid, decodeURIComponent(p.uid), !!body.removed)), { roles: STAFF });
  R('POST', '/api/services', (req, res, { u, body }) => { if (!canBuilding(u, body.building)) return fail(res, 404, 'Not found'); result(res, model.addService(body, u)); }, { roles: FIELD });
  R('DELETE', '/api/services/:id', (req, res, { p }) => result(res, model.deleteService(p.id)), { roles: STAFF });

  // parts & labour, invoicing
  R('PUT', '/api/jobs/:id/billing', (req, res, { u, p, body }) => { const j = job(res, u, p.id); if (j) result(res, model.setJobBilling(j, body, u)); }, { roles: FIELD });
  R('PUT', '/api/services/:id/billing', (req, res, { u, p, body }) => {
    const rec = model.S.services.find(x => x.id === p.id); if (!rec || !canBuilding(u, rec.building)) return fail(res, 404, 'Not found');
    result(res, model.setServiceBilling(p.id, body, u));
  }, { roles: FIELD });
  R('POST', '/api/jobs/:id/invoice', (req, res, { u, p }) => { const j = job(res, u, p.id); if (j) result(res, model.requestInvoice('job:' + j.id)); }, { roles: STAFF });
  R('POST', '/api/services/:id/invoice', (req, res, { p }) => result(res, model.requestInvoice('service:' + p.id)), { roles: STAFF });
  R('POST', '/api/admin/zoho/test', async (req, res) => {
    if (!zoho.configured) return fail(res, 400, 'Zoho Books is not connected yet. Use Connect Zoho Books in Settings.');
    try { send(res, 200, { ok: true, organisation: await zoho.test() }); } catch (e) { fail(res, 400, e.message); }
  }, { roles: ['admin'] });
  R('POST', '/api/admin/zoho/connect', (req, res, { u, body }) => {
    const dc = Object.keys(DCS).includes(body.dc) ? body.dc : 'com';
    const clientId = String(body.clientId || '').trim(), clientSecret = String(body.clientSecret || '').trim();
    const redirectUri = String(body.redirectUri || '');
    if (!/^[\w.-]{10,}$/.test(clientId) || clientSecret.length < 10) return fail(res, 400, 'Paste the Client ID and Client Secret from the Zoho API console.');
    if (!/^https?:\/\/[^/]+\/api\/zoho\/callback$/.test(redirectUri)) return fail(res, 400, 'Invalid redirect URI.');
    const state = rid(16);
    db.setKv('zohoPending', { dc, clientId, clientSecret, redirectUri, state, at: Date.now(), by: u.name });
    send(res, 200, { ok: true, url: authUrl({ dc, clientId, redirectUri, state }) });
  }, { roles: ['admin'] });
  R('GET', '/api/zoho/callback', async (req, res, { u, url }) => {
    const back = msg => { res.writeHead(302, { Location: '/#/settings/billing' + (msg ? '/error/' + encodeURIComponent(msg) : '/connected') }); res.end(); };
    const p = db.kv('zohoPending', null);
    if (url.searchParams.get('error')) return back('Zoho: ' + url.searchParams.get('error'));
    if (!p || p.state !== url.searchParams.get('state') || Date.now() - p.at > 15 * 60e3) return back('The connection request expired or did not match. Please try Connect again.');
    try {
      const accountsServer = url.searchParams.get('accounts-server') || env.ZOHO_ACCOUNTS_URL || ('https://accounts.' + (p.dc === 'ca' ? 'zohocloud.ca' : 'zoho.' + p.dc));
      if (!/^https:\/\/accounts\.zoho(cloud)?\.[a-z.]+$/.test(accountsServer) && accountsServer !== env.ZOHO_ACCOUNTS_URL) return back('Unexpected Zoho accounts server.');
      const t = await exchangeCode({ accountsServer, clientId: p.clientId, clientSecret: p.clientSecret, redirectUri: p.redirectUri, code: url.searchParams.get('code') || '' });
      const apiUrl = (env.ZOHO_API_URL && accountsServer === env.ZOHO_ACCOUNTS_URL) ? env.ZOHO_API_URL : (t.api_domain || ('https://www.zohoapis.' + p.dc)).replace(/\/$/, '') + '/books/v3';
      const conn = { dc: p.dc, clientId: p.clientId, clientSecret: p.clientSecret, refreshToken: t.refresh_token, accountsUrl: accountsServer, apiUrl, orgId: '', orgName: '', connectedAt: nowIso(), connectedBy: u.name };
      db.setKv('zohoConn', conn); db.setKv('zohoPending', null); buildZoho();
      const orgs = await zoho.listOrgs().catch(() => []);
      if (orgs.length === 1) { conn.orgId = orgs[0].id; conn.orgName = orgs[0].name; db.setKv('zohoConn', conn); buildZoho(); }
      model.changed(null);
      back();
    } catch (e) { back(e.message); }
  }, { roles: ['admin'], raw: true });
  R('GET', '/api/admin/zoho/orgs', async (req, res) => {
    if (!zoho.hasToken) return fail(res, 400, 'Not connected.');
    try { send(res, 200, await zoho.listOrgs()); } catch (e) { fail(res, 400, e.message); }
  }, { roles: ['admin'] });
  R('POST', '/api/admin/zoho/org', async (req, res, { body }) => {
    const conn = db.kv('zohoConn', null); if (!conn) return fail(res, 400, 'Not connected.');
    const o = (await zoho.listOrgs().catch(() => [])).find(x => x.id === String(body.orgId));
    if (!o) return fail(res, 400, 'Organisation not found on this Zoho account.');
    conn.orgId = o.id; conn.orgName = o.name; db.setKv('zohoConn', conn); buildZoho(); model.changed(null);
    send(res, 200, { ok: true, organisation: o });
  }, { roles: ['admin'] });
  R('POST', '/api/admin/zoho/disconnect', async (req, res) => {
    const conn = db.kv('zohoConn', null); if (!conn) return fail(res, 400, 'Not connected from the app.');
    await revokeToken(conn.accountsUrl, conn.refreshToken);
    db.setKv('zohoConn', null); buildZoho(); model.changed(null);
    send(res, 200, { ok: true });
  }, { roles: ['admin'] });
  R('POST', '/api/admin/zoho/sync', (req, res) => result(res, model.zSyncAll()), { roles: ['admin'] });
  R('POST', '/api/admin/zoho/:id/retry', (req, res, { p }) => result(res, model.zRetry(p.id)), { roles: ['admin'] });

  // billing tracker
  R('POST', '/api/tracker', (req, res, { u, body }) => result(res, model.addTrackerRow(body, u)), { roles: STAFF });
  R('PUT', '/api/tracker/:id', (req, res, { u, p, body }) => result(res, model.updateTracker(p.id, body, u)), { roles: STAFF });
  R('DELETE', '/api/tracker/:id', (req, res, { p }) => result(res, model.deleteTrackerRow(p.id)), { roles: STAFF });
  R('POST', '/api/tracker/import', (req, res, { u, body }) => result(res, model.importTracker(body.building, body.rows, u)), { roles: STAFF });
  R('POST', '/api/tracker/approve', (req, res, { u, body }) => result(res, model.approveTracker(body.ids, u)), { roles: STAFF });
  R('POST', '/api/tracker/bulk', (req, res, { body }) => { if (!['portal', 'paid'].includes(body.action)) return fail(res, 400, 'Unknown action'); result(res, model.bulkTracker(body.ids, body.action, body.date)); }, { roles: STAFF });

  // utility management: meters, readings, tenants, tariffs, recovery billing
  const U = () => model.util;
  const meterOk = (u, id) => { const m = U().meter(decodeURIComponent(id)); return m && (u.role === 'tech' || canBuilding(u, m.building)) ? m : null; };
  R('POST', '/api/utility/building', (req, res, { body }) => {
    const ex = body.id ? model.S.buildings.find(b => b.id === body.id) : null;
    if (body.id && !ex) return fail(res, 404, 'Building not found.');
    const divisions = [...new Set([...((ex && ex.divisions) || []), 'utility'])];
    result(res, model.upsertBuilding({ id: body.id || undefined, name: body.name || (ex && ex.name), client: body.client, area: body.area, portal: body.portal, divisions }));
  }, { roles: STAFF });
  R('POST', '/api/utility/setup/:bid', (req, res, { u, p, body }) => result(res, U().setupRows(p.bid, body.rows, u)), { roles: STAFF });
  R('GET', '/api/utility/check/:bid', (req, res, { u, p }) => { if (u.role === 'client' || !canBuilding(u, p.bid)) return fail(res, 404, 'Not found'); result(res, U().checkBuilding(p.bid)); }, { roles: FIELD });
  R('GET', '/api/utility/check-meter/:id', (req, res, { u, p }) => { const m = meterOk(u, p.id); if (!m) return fail(res, 404, 'Not found'); send(res, 200, U().checkMeter(m)); }, { roles: FIELD });
  R('POST', '/api/utility/tariffs/:bid', (req, res, { p, body }) => result(res, U().assignTariffs(p.bid, body.assign)), { roles: STAFF });
  R('POST', '/api/utility/tree/:bid', (req, res, { p, body }) => result(res, U().setTree(p.bid, body.items)), { roles: STAFF });
  R('POST', '/api/utility/tolerance/:bid', (req, res, { p, body }) => result(res, U().setTolerance(p.bid, body)), { roles: STAFF });
  R('GET', '/api/utility/balance/:bid', (req, res, { u, p, url }) => { if (u.role === 'tech' || !canBuilding(u, p.bid)) return fail(res, 404, 'Not found'); result(res, U().balance(p.bid, url.searchParams.get('month'), url.searchParams.get('from'), url.searchParams.get('to'))); }, { roles: ALL });
  R('GET', '/api/reports/utility', (req, res, { u, url }) => { const q = k => url.searchParams.get(k) || ''; const bid = q('building'); if (bid && !canBuilding(u, bid)) return fail(res, 404, 'Not found'); result(res, U().report(u, q('from'), q('to'), bid)); }, { roles: ['admin', 'desk', 'client'] });
  R('POST', '/api/meters', (req, res, { body }) => result(res, U().upsertMeter(body.meter || {}, body.originalId)), { roles: STAFF });
  R('POST', '/api/meters/:id/removed', (req, res, { p, body }) => result(res, U().setMeterRemoved(decodeURIComponent(p.id), !!body.removed)), { roles: STAFF });
  R('GET', '/api/meters/:id/readings', (req, res, { u, p, url }) => { const m = meterOk(u, p.id); if (!m) return fail(res, 404, 'Not found'); send(res, 200, U().readingsFor(m.id, url.searchParams.get('from'), url.searchParams.get('to'))); }, { roles: ALL });
  R('POST', '/api/meters/:id/readings', (req, res, { u, p, body }) => { const m = meterOk(u, p.id); if (!m) return fail(res, 404, 'Not found'); result(res, U().addReading(m.id, body, u)); }, { roles: FIELD });
  R('DELETE', '/api/meters/:id/readings/:ts', (req, res, { p }) => result(res, U().deleteReading(decodeURIComponent(p.id), decodeURIComponent(p.ts))), { roles: STAFF });
  R('POST', '/api/readings/import', (req, res, { u, body }) => result(res, U().importReadings(body.rows, u)), { roles: STAFF });
  R('POST', '/api/tenants', (req, res, { body }) => result(res, U().upsertTenant(body)), { roles: STAFF });
  R('DELETE', '/api/tenants/:id', (req, res, { p }) => result(res, U().deleteTenant(p.id)), { roles: STAFF });
  R('PUT', '/api/tariffs', (req, res, { body }) => result(res, U().setTariffs(body.tariffs)), { roles: STAFF });
  R('POST', '/api/recoveries', (req, res, { u, body }) => result(res, U().createRun(body, u)), { roles: STAFF });
  R('POST', '/api/recoveries/:id/recalc', (req, res, { p }) => result(res, U().recalcRun(p.id)), { roles: STAFF });
  R('POST', '/api/recoveries/:id/approve', (req, res, { u, p }) => result(res, U().approveRun(p.id, u)), { roles: STAFF });
  R('DELETE', '/api/recoveries/:id', (req, res, { p }) => result(res, U().deleteRun(p.id)), { roles: STAFF });

  // technicians
  R('POST', '/api/techs', (req, res, { body }) => result(res, model.upsertTech(body)), { roles: STAFF });
  R('DELETE', '/api/techs/:id', (req, res, { p }) => result(res, model.deleteTech(p.id)), { roles: STAFF });
  R('PATCH', '/api/jobs/:id', (req, res, { u, p, body }) => {
    const j = job(res, u, p.id); if (!j) return;
    if (!['onsite', 'completed'].includes(j.status) && !isStaff(u)) return fail(res, 400, 'The job card can be edited while on site.');
    ['findings', 'work'].forEach(k => { if (typeof body[k] === 'string') j[k] = body[k].slice(0, 4000); });
    model.save('jobs', j); model.changed(j.building); send(res, 200, { ok: true });
  }, { roles: FIELD });
  R('POST', '/api/jobs/:id/photos', (req, res, { u, p, body }) => { const j = job(res, u, p.id); if (j) send(res, 200, { ok: true, photos: model.addPhotos(j, body.photos) }); }, { roles: ALL });
  R('POST', '/api/jobs/:id/sign', (req, res, { u, p, body }) => { const j = job(res, u, p.id); if (j) result(res, model.sign(j, body.signature, body.name, u)); }, { roles: FIELD });

  // technicians, trips, assessments
  R('POST', '/api/techs/:id/duty', (req, res, { u, p }) => {
    const t = byId(S.technicians, p.id); if (!t) return fail(res, 404, 'Not found');
    if (!isStaff(u) && u.techId !== t.id) return fail(res, 403, 'Not allowed');
    if (t.status === 'on job') return fail(res, 400, 'Technician is on a job.');
    t.status = t.status === 'off' ? 'available' : 'off'; model.save('technicians', t); model.changed(null); send(res, 200, { ok: true });
  }, { roles: FIELD });
  R('POST', '/api/trips', (req, res, { u, body }) => {
    if (u.role === 'tech') body.driver = u.techId;
    if (!body.what) return fail(res, 400, 'Describe the load.');
    const t = model.tech(body.driver);
    const trip = { id: 'D-' + (300 + S.trips.length + 1) + rid(2), what: String(body.what).slice(0, 200), from: body.from, to: body.to, driver: body.driver, vehicle: t && t.vehicle, status: 'Scheduled', at: body.at || nowIso() };
    S.trips.unshift(trip); model.save('trips', trip); model.changed(null); send(res, 200, { ok: true, id: trip.id });
  }, { roles: FIELD });
  R('POST', '/api/trips/:id/advance', (req, res, { u, p }) => {
    const t = byId(S.trips, p.id); if (!t || (u.role === 'tech' && t.driver !== u.techId)) return fail(res, 404, 'Not found');
    const flow = ['Scheduled', 'In transit', 'Delivered']; const i = flow.indexOf(t.status);
    if (i < 0 || i >= 2) return fail(res, 400, 'Trip already delivered.');
    t.status = flow[i + 1]; t.at = nowIso(); model.save('trips', t); model.changed(null); send(res, 200, { ok: true });
  }, { roles: FIELD });
  R('POST', '/api/assessments', (req, res, { u, body }) => {
    if (u.role === 'tech') body.by = u.techId;
    if (!byId(S.buildings, body.building)) return fail(res, 400, 'Choose a building.');
    const items = (body.items || []).map(x => ({ name: String(x.name).slice(0, 60), rating: Math.max(1, Math.min(5, +x.rating || 3)) }));
    const score = items.length ? Math.round(items.reduce((s, x) => s + x.rating, 0) / items.length * 20) : 0;
    const a = { id: 'AS-' + Date.now().toString(36).toUpperCase(), building: body.building, by: body.by || u.techId, type: String(body.type || 'Assessment').slice(0, 100), date: nowIso(), score, items, notes: String(body.notes || '').slice(0, 4000) };
    S.assessments.unshift(a); model.save('assessments', a); model.changed(a.building); send(res, 200, { ok: true, id: a.id });
  }, { roles: FIELD });

  // BMS actions
  R('POST', '/api/bms/:bid/simulate-fault', (req, res, { p }) => {
    const c = connectors.get(p.bid);
    if (!c || !c.simulateFault) return fail(res, 400, 'Fault simulation is only available on simulated buildings.');
    result(res, c.simulateFault());
  }, { roles: STAFF });
  R('POST', '/api/bms/:bid/setpoint', (req, res, { p, body }) => {
    const c = connectors.get(p.bid);
    if (!c || !c.adjustSetpoint) return fail(res, 400, 'Set-point changes from the app are only enabled on simulated buildings. Real buildings are monitored read-only.');
    result(res, c.adjustSetpoint(body.zones || [], +body.delta || 0));
  }, { roles: STAFF });
  R('POST', '/api/alarms/:id/clear', (req, res, { u, p, body }) => {
    const a = byId(S.alarms, p.id); if (!a || !canBuilding(u, a.building)) return fail(res, 404, 'Not found');
    model.clearAlarm(a, 'Cleared manually by ' + u.name + (body.note ? ': ' + body.note : '')); send(res, 200, { ok: true });
  }, { roles: STAFF });

  // gateway / edge-agent data in (token per building)
  R('POST', '/api/ingest/:bid', (req, res, { p, body, url }) => {
    const b = byId(S.buildings, p.bid);
    const token = (req.headers.authorization || '').replace(/^Bearer /, '') || url.searchParams.get('token');
    if (!b || !token || token !== b.ingestToken) return fail(res, 401, 'Invalid building or token');
    let values = body.values;
    if (!values && body.points) { const map = (b.connector || {}).keyMap || {}; values = {}; for (const [k, v] of Object.entries(body.points)) if (map[k]) values[map[k]] = v; }
    if (!values) { const map = (b.connector || {}).keyMap; values = {}; for (const [k, v] of Object.entries(body)) values[map && map[k] ? map[k] : k] = v; }
    result(res, model.applyReadings(b.id, values, body.source || 'http'));
  }, { public: true, anyType: true });

  // inbound SMS: BulkSMS webhook (JSON array), Teltonika SMS forwarding, or generic {from, text}
  R('POST', '/api/hooks/sms-inbound', (req, res, { body, url }) => {
    if (!env.WEBHOOK_TOKEN || url.searchParams.get('token') !== env.WEBHOOK_TOKEN) return fail(res, 401, 'Invalid token');
    const list = Array.isArray(body) ? body : [body];
    const out = list.map(m => {
      const from = (m.from && (m.from.address || m.from)) || m.sender || m.phone || m.number;
      const text = m.body || m.text || m.message || m.msg || '';
      if (!from || !text) return { error: 'missing from/text' };
      return model.gsmInbound(String(from), String(text));
    });
    send(res, 200, { ok: true, results: out });
  }, { public: true, anyType: true });

  // admin
  R('PUT', '/api/admin/settings', (req, res, { body }) => result(res, model.updateSettings(body)), { roles: ['admin'] });
  R('POST', '/api/admin/users', (req, res, { body }) => result(res, model.upsertUser(body)), { roles: ['admin'] });
  R('DELETE', '/api/admin/users/:id', (req, res, { u, p }) => result(res, model.deleteUser(p.id, u)), { roles: ['admin'] });
  R('POST', '/api/admin/buildings', (req, res, { body }) => result(res, model.upsertBuilding(body)), { roles: ['admin'] });
  R('DELETE', '/api/admin/buildings/:id', (req, res, { p }) => result(res, model.deleteBuilding(p.id)), { roles: ['admin'] });
  R('GET', '/api/admin/outbox', (req, res) => send(res, 200, notifier.list(150)), { roles: ['admin'] });
  R('POST', '/api/admin/outbox/:id/retry', (req, res, { p }) => send(res, 200, { ok: !!notifier.retry(p.id) }), { roles: ['admin'] });
  R('POST', '/api/admin/test', async (req, res, { body }) => {
    if (body.channel === 'sms') {
      const m = notifier.enqueue({ channel: 'sms', to: body.to, text: 'Bothelec Aircon test SMS. If you received this, SMS notifications are working.', meta: { test: true } });
      return send(res, 200, { ok: m.status !== 'failed', id: m.id, error: m.error });
    }
    if (body.channel === 'email') {
      try { await notifier.verifyEmail(); } catch (e) { return fail(res, 400, 'Email login failed: ' + e.message); }
      const m = notifier.enqueue({ channel: 'email', to: body.to, subject: 'Bothelec Aircon Solutions test email', text: 'If you received this, email notifications are working.', html: '<p>If you received this, <b>Bothelec Aircon Solutions</b> email notifications are working.</p>', meta: { test: true } });
      return send(res, 200, { ok: m.status !== 'failed', id: m.id, error: m.error });
    }
    fail(res, 400, 'channel must be sms or email');
  }, { roles: ['admin'] });

  R('GET', '/api/health', (req, res) => send(res, 200, { ok: true, time: nowIso(), notifier: { queued: notifier.status().queued } }), { public: true });

  /* ---------------- static files ---------------- */
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
  function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const f = path.join(publicDir, rel);
    if (!f.startsWith(publicDir)) return fail(res, 403, 'Forbidden');
    const file = fs.existsSync(f) && fs.statSync(f).isFile() ? f : path.join(publicDir, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': /index\.html$|sw\.js$/.test(file) ? 'no-cache' : 'public, max-age=300' });
    fs.createReadStream(file).pipe(res);
  }

  /* ---------------- dispatcher ---------------- */
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
    const route = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (!route) return fail(res, 404, 'Not found');
    const p = route.re.exec(url.pathname).groups || {};
    try {
      const u = currentUser(req);
      if (!route.opts.public) {
        if (!u) return fail(res, 401, 'Please sign in.');
        if (route.opts.roles && !route.opts.roles.includes(u.role)) return fail(res, 403, 'You do not have access to this.');
      }
      let body = {};
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        // CSRF guard: browser forms cannot send JSON cross-site without a CORS preflight
        const hasBody = +(req.headers['content-length'] || 0) > 0 || !!req.headers['transfer-encoding'];
        if (!route.opts.anyType && hasBody && !(req.headers['content-type'] || '').includes('application/json')) return fail(res, 415, 'Send JSON');
        body = await readBody(req);
      }
      await route.handler(req, res, { u, p, body, url });
    } catch (e) {
      log('[api]', req.method, url.pathname, e.stack || e.message);
      if (!res.headersSent) fail(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, e.code ? e.message : 'Server error');
    }
  });

  return {
    server, model, notifier, connectors, db, bus,
    start(port = +(env.PORT || 8080)) {
      connectors.startAll();
      return new Promise(r => server.listen(port, () => { log(`[server] Bothelec Aircon Solutions listening on :${port} (public URL ${env.PUBLIC_URL || 'not set'})`); r(server); }));
    },
    stop() {
      connectors.stopAll(); notifier.stop(); model.stop(); clearInterval(ping);
      for (const s of streams) s.res.end();
      const done = new Promise(r => server.close(() => r()));
      server.closeAllConnections();
      return done;
    },
  };
}

if (require.main === module) {
  const app = createServer();
  app.start();
  const bye = () => { log('[server] shutting down'); app.stop().then(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGTERM', bye); process.on('SIGINT', bye);
}

module.exports = { createServer };
