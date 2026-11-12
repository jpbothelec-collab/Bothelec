'use strict';
/* End-to-end tests against local stand-ins: a BulkSMS-compatible API, an SMTP server, a Modbus TCP
 * device, a BACnet/IP device, an MQTT broker, a Teltonika router and a GSM modem. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const dgram = require('node:dgram');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createServer } = require('..');
const { smsProvider } = require('../lib/notify');

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000, step = 200) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting'); await sleep(step); }
}
const listen = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

/* ---------- stand-ins ---------- */
function bulkSmsMock() {
  const sent = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; }); req.on('end', () => {
      sent.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(b) });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ id: 'm' + sent.length, status: { type: 'ACCEPTED' } }]));
    });
  });
  return { srv, sent };
}
function smtpSink() {
  const mails = [];
  const srv = net.createServer(sock => {
    sock.write('220 sink ESMTP\r\n');
    let buf = '', inData = false, cur = { to: [] };
    sock.on('data', d => {
      buf += d.toString('latin1');
      for (;;) {
        if (inData) {
          const i = buf.indexOf('\r\n.\r\n'); if (i < 0) return;
          cur.data = buf.slice(0, i); buf = buf.slice(i + 5); inData = false; mails.push(cur); cur = { to: [] }; sock.write('250 OK queued\r\n'); continue;
        }
        const i = buf.indexOf('\r\n'); if (i < 0) return;
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') sock.write('250-sink\r\n250-SIZE 52428800\r\n250 8BITMIME\r\n');
        else if (cmd === 'HELO') sock.write('250 sink\r\n');
        else if (cmd === 'MAIL') { cur.from = line; sock.write('250 OK\r\n'); }
        else if (cmd === 'RCPT') { cur.to.push(line); sock.write('250 OK\r\n'); }
        else if (cmd === 'DATA') { inData = true; sock.write('354 End data with <CR><LF>.<CR><LF>\r\n'); }
        else if (cmd === 'QUIT') { sock.end('221 Bye\r\n'); return; }
        else sock.write('250 OK\r\n');
      }
    });
    sock.on('error', () => {});
  });
  return { srv, mails };
}
/* Modbus TCP device: holding/input registers and coils from a table. */
function modbusDevice(regs, coils) {
  return net.createServer(sock => {
    let buf = Buffer.alloc(0);
    sock.on('data', d => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 12) {
        const req = buf.subarray(0, 12); buf = buf.subarray(12);
        const tid = req.readUInt16BE(0), unit = req[6], fc = req[7], addr = req.readUInt16BE(8), qty = req.readUInt16BE(10);
        let pdu;
        if (fc === 3 || fc === 4) {
          if (regs[addr] === undefined) pdu = Buffer.from([fc | 0x80, 2]);
          else { const data = Buffer.alloc(qty * 2); for (let k = 0; k < qty; k++) data.writeUInt16BE(regs[addr + k] || 0, k * 2); pdu = Buffer.concat([Buffer.from([fc, data.length]), data]); }
        } else if (fc === 1 || fc === 2) pdu = Buffer.from([fc, 1, coils[addr] ? 1 : 0]);
        else pdu = Buffer.from([fc | 0x80, 1]);
        const h = Buffer.alloc(7); h.writeUInt16BE(tid, 0); h.writeUInt16BE(0, 2); h.writeUInt16BE(pdu.length + 1, 4); h[6] = unit;
        sock.write(Buffer.concat([h, pdu]));
      }
    });
    sock.on('error', () => {});
  });
}
/* BACnet/IP device answering ReadProperty(present-value). */
function bacnetDevice(objects) {
  const sock = dgram.createSocket('udp4');
  sock.on('message', (m, rinfo) => {
    let i = 4 + 2; // BVLC + simple NPDU (01 04)
    if (m[5] & 0x20) { i = 4 + 2 + 2; i += 1 + m[i]; i += 1; } // routed: skip DNET/DADR/hop
    const invoke = m[i + 2];
    const oid = m.readUInt32BE(i + 5);
    const type = oid >>> 22, inst = oid & 0x3fffff;
    const v = objects[`${type}:${inst}`];
    let apdu;
    if (v === undefined) apdu = Buffer.from([0x50, invoke, 0x0c, 0x91, 0x01, 0x91, 0x1f]);
    else {
      let val;
      if (typeof v === 'number' && !Number.isInteger(v)) { val = Buffer.alloc(5); val[0] = 0x44; val.writeFloatBE(v, 1); }
      else val = Buffer.from([0x91, v]);
      const o = Buffer.alloc(5); o[0] = 0x0c; o.writeUInt32BE(oid, 1);
      apdu = Buffer.concat([Buffer.from([0x30, invoke, 0x0c]), o, Buffer.from([0x19, 0x55, 0x3e]), val, Buffer.from([0x3f])]);
    }
    const body = Buffer.concat([Buffer.from([0x01, 0x00]), apdu]);
    const bv = Buffer.from([0x81, 0x0a, 0, 0]); bv.writeUInt16BE(4 + body.length, 2);
    sock.send(Buffer.concat([bv, body]), rinfo.port, rinfo.address);
  });
  return sock;
}

/* Zoho Books stand-in: OAuth token endpoint + the Books v3 endpoints the connector uses. */
function zohoMock() {
  const z = { calls: [], contacts: [], invoices: [], persons: [], tokens: 0, expireNext: false };
  z.srv = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; }); req.on('end', () => {
      const u = new URL(req.url, 'http://x'), body = b ? JSON.parse(b) : null;
      const out = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      z.calls.push({ method: req.method, path: u.pathname, q: Object.fromEntries(u.searchParams), auth: req.headers.authorization, body });
      if (u.pathname === '/oauth/v2/token/revoke') { z.revoked = u.searchParams.get('token'); return out(200, { status: 'success' }); }
      if (u.pathname === '/oauth/v2/token' && u.searchParams.get('grant_type') === 'authorization_code') { z.tokens++; z.exchange = Object.fromEntries(u.searchParams); return u.searchParams.get('code') === 'authcode' ? out(200, { access_token: 'at' + z.tokens, refresh_token: 'rt', api_domain: `http://127.0.0.1:${req.socket.localPort}`, expires_in: 3600 }) : out(200, { error: 'invalid_code' }); }
      if (u.pathname === '/oauth/v2/token') { z.tokens++; return u.searchParams.get('refresh_token') === 'rt' ? out(200, { access_token: 'at' + z.tokens, expires_in: 3600 }) : out(400, { error: 'invalid_code' }); }
      if (z.expireNext) { z.expireNext = false; return out(401, { code: 57, message: 'You are not authorized to perform this operation' }); }
      if (req.headers.authorization !== 'Zoho-oauthtoken at' + z.tokens) return out(401, { code: 57, message: 'bad token' });
      if (u.pathname !== '/books/v3/organizations' && u.searchParams.get('organization_id') !== 'org1') return out(400, { code: 6041, message: 'org missing' });
      if (u.pathname === '/books/v3/organizations') return out(200, { code: 0, organizations: [{ organization_id: 'org1', name: 'Bothelec Aircon Solutions', currency_code: 'ZAR' }] });
      if (u.pathname === '/books/v3/contacts' && req.method === 'GET') return out(200, { code: 0, contacts: z.contacts.filter(c => c.contact_name === u.searchParams.get('contact_name')) });
      if (u.pathname === '/books/v3/contacts' && req.method === 'POST' && (body.contact_persons || []).some(p => 'is_primary_contact' in p)) return out(400, { code: 2, message: 'Invalid value passed for is_primary_contact' });
      if (u.pathname === '/books/v3/contacts' && req.method === 'POST') { const c = { contact_id: 'c' + (z.contacts.length + 1), ...body }; z.contacts.push(c); return out(201, { code: 0, contact: c }); }
      if (u.pathname === '/books/v3/contacts/contactpersons') { z.persons.push(body); return out(201, { code: 0, contact_person: { contact_person_id: 'p' + z.persons.length } }); }
      if (u.pathname === '/books/v3/invoices' && req.method === 'GET') return out(200, { code: 0, invoices: z.invoices.filter(i => i.reference_number === u.searchParams.get('reference_number')) });
      if (u.pathname === '/books/v3/invoices' && req.method === 'POST') { const i = { invoice_id: 'i' + (z.invoices.length + 1), invoice_number: 'INV-' + String(z.invoices.length + 1).padStart(6, '0'), status: 'draft', ...body }; z.invoices.push(i); return out(201, { code: 0, invoice: i }); }
      out(404, { code: 404, message: 'not found' });
    });
  });
  return z;
}

/* ---------- harness ---------- */
let app, base, cookie = '', sms, smtp, smsPort, mqttBroker, mqttPort, zoho;
const ctx = {};
async function req(method, url, body, opts = {}) {
  const res = await fetch(base + url, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(opts.cookie !== undefined ? (opts.cookie ? { Cookie: opts.cookie } : {}) : (cookie ? { Cookie: cookie } : {})), ...(opts.headers || {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
async function login(email, password) {
  const r = await req('POST', '/api/login', { email, password }, { cookie: '' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.headers.get('set-cookie').split(';')[0];
}

before(async () => {
  sms = bulkSmsMock(); smsPort = await listen(sms.srv);
  smtp = smtpSink(); const smtpPort = await listen(smtp.srv);
  zoho = zohoMock(); const zohoPort = await listen(zoho.srv);
  const Aedes = require('aedes');
  mqttBroker = (Aedes.createBroker ? await Aedes.createBroker() : new Aedes());
  const mqttSrv = net.createServer(mqttBroker.handle); mqttPort = await listen(mqttSrv); ctx.mqttSrv = mqttSrv;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bothelec-test-'));
  app = createServer({
    DATA_DIR: dir, SEED_DEMO: 'true', ADMIN_EMAIL: 'admin@bothelec.test', ADMIN_PASSWORD: 'admin-pass-123',
    SMS_PROVIDER: 'bulksms', BULKSMS_URL: `http://127.0.0.1:${smsPort}/v1`, BULKSMS_TOKEN_ID: 'tid', BULKSMS_TOKEN_SECRET: 'tsecret', BULKSMS_FROM: 'Bothelec',
    EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort), SMTP_SECURE: 'false', EMAIL_FROM: 'Bothelec Aircon Solutions <alerts@bothelec.test>',
    DESK_PHONE: '082 000 0001', DESK_EMAIL: 'desk@bothelec.test', WEBHOOK_TOKEN: 'hooktoken', AUTO_ASSIGN_DELAY_MS: '100', PUBLIC_URL: 'https://bothelec.test',
    ZOHO_CLIENT_ID: 'cid', ZOHO_CLIENT_SECRET: 'cs', ZOHO_REFRESH_TOKEN: 'rt', ZOHO_ORG_ID: 'org1', ZOHO_ACCOUNTS_URL: `http://127.0.0.1:${zohoPort}`, ZOHO_API_URL: `http://127.0.0.1:${zohoPort}/books/v3`,
  });
  await app.start(0);
  base = `http://127.0.0.1:${app.server.address().port}`;
  cookie = await login('admin@bothelec.test', 'admin-pass-123');
});
after(async () => {
  await app.stop();
  sms.srv.close(); smtp.srv.close(); zoho.srv.close(); ctx.mqttSrv.close(); mqttBroker.close();
  ctx.modbus && ctx.modbus.close(); ctx.bacnet && ctx.bacnet.close();
});

test('auth: unauthenticated requests are rejected; wrong password fails', async () => {
  assert.equal((await req('GET', '/api/state', undefined, { cookie: '' })).status, 401);
  assert.equal((await req('POST', '/api/login', { email: 'admin@bothelec.test', password: 'nope' }, { cookie: '' })).status, 401);
  const st = (await req('GET', '/api/state')).data;
  assert.equal(st.me.role, 'admin');
  assert.ok(st.buildings.length >= 3);
  assert.ok(!('passwordHash' in st.admin.users[0]));
});

test('client call-out → auto-assign → SMS + email → job card → signed report email', async () => {
  // a client user for building B2 only
  let r = await req('POST', '/api/admin/users', { name: 'Client Two', email: 'client2@bothelec.test', phone: '083 111 2222', role: 'client', buildings: ['B2'], password: 'client-pass-1' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // two building managers + an ops manager; one contact opted out of notifications
  r = await req('PUT', '/api/buildings/B2/contacts', { contacts: [
    { name: 'M. Khumalo', role: 'Building Manager', phone: '083 200 0001', email: 'rosebank.bm@bothelec.test' },
    { name: 'S. Nkosi', role: 'Building Manager', phone: '083 200 0002', email: 'rosebank.bm2@bothelec.test' },
    { name: 'D. Smith', role: 'Operations Manager', email: 'rosebank.ops@bothelec.test' },
    { name: 'Quiet Person', role: 'Building Manager', email: 'quiet@bothelec.test', notify: false }] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await req('PUT', '/api/buildings/B2/contacts', { contacts: [{ name: 'X', role: 'Building Manager', email: 'not-an-email' }] })).status, 400);
  const clientCookie = await login('client2@bothelec.test', 'client-pass-1');

  // client cannot see other buildings
  const cst = (await req('GET', '/api/state', undefined, { cookie: clientCookie })).data;
  assert.deepEqual(cst.buildings.map(b => b.id), ['B2']);
  assert.ok(cst.jobs.every(j => j.building === 'B2'));
  assert.equal((await req('GET', '/api/bms/B1', undefined, { cookie: clientCookie })).status, 404);
  assert.equal((await req('POST', '/api/jobs', { building: 'B1', fault: 'x' }, { cookie: clientCookie })).status, 400);

  const smsBefore = sms.sent.length, mailBefore = smtp.mails.length;
  const tinyJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  r = await req('POST', '/api/jobs', { building: 'B2', equipment: 'VRF-01 · Outdoor unit', location: 'Roof', fault: 'No cooling on level 2', urgency: 'High', contactEmail: 'client2@bothelec.test', photos: [tinyJpeg] }, { cookie: clientCookie });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const id = r.data.id;
  assert.equal((await req('POST', `/api/jobs/${id}/advance`, {}, { cookie: clientCookie })).status, 403);

  const job = await until(async () => { const j = (await req('GET', '/api/state')).data.jobs.find(x => x.id === id); return j && j.status === 'assigned' && j; });
  assert.ok(job.tech);
  assert.equal(job.photos.length, 1);
  const photo = await fetch(base + job.photos[0], { headers: { Cookie: clientCookie } });
  assert.equal(photo.status, 200);
  assert.equal((await fetch(base + job.photos[0])).status, 401);

  // SMS: desk (urgent call logged) + technician (assigned). Email: managers, desk, caller.
  await until(() => sms.sent.length >= smsBefore + 2);
  const newSms = sms.sent.slice(smsBefore);
  assert.equal(newSms[0].auth, 'Basic ' + Buffer.from('tid:tsecret').toString('base64'));
  assert.ok(newSms.some(m => m.body[0].to === '+27820000001' && /Call logged/.test(m.body[0].body)), 'desk SMS');
  assert.ok(newSms.some(m => /assigned to you/.test(m.body[0].body) && /https:\/\/bothelec\.test\/#\/service\/job\//.test(m.body[0].body)), 'tech SMS with link');
  assert.equal(newSms[0].body[0].from, 'Bothelec');
  await until(() => smtp.mails.length >= mailBefore + 4);
  const rcpts = smtp.mails.slice(mailBefore).flatMap(m => m.to).join(' ');
  assert.ok(!rcpts.includes('quiet@bothelec.test'), 'opted-out contact not emailed');
  for (const a of ['rosebank.bm@bothelec.test', 'rosebank.bm2@bothelec.test', 'rosebank.ops@bothelec.test', 'desk@bothelec.test', 'client2@bothelec.test']) assert.ok(rcpts.includes(a), 'email to ' + a);

  // technician works the job
  await req('POST', `/api/jobs/${id}/advance`, {}); // on the way
  await req('POST', `/api/jobs/${id}/advance`, {}); // on site
  assert.equal((await req('POST', `/api/jobs/${id}/advance`, {})).status, 400, 'cannot complete without findings');
  await req('PATCH', `/api/jobs/${id}`, { findings: 'Low refrigerant charge', work: 'Leak repaired, system regassed' });
  assert.equal((await req('POST', `/api/jobs/${id}/advance`, {})).status, 200);
  const sigPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const mailsBeforeReport = smtp.mails.length;
  r = await req('POST', `/api/jobs/${id}/sign`, { signature: sigPng, name: 'M. Khumalo' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await until(() => smtp.mails.slice(mailsBeforeReport).some(m => /Report ready/.test(m.data) && /signature\.png/.test(m.data)));
  const done = (await req('GET', '/api/state')).data.jobs.find(x => x.id === id);
  assert.equal(done.status, 'report');
  assert.ok(done.notifications.some(n => n.channel === 'Email' && n.status === 'sent' && n.step === 'report'));
});

test('BMS fault (simulated building): critical alarm → automatic call + dispatch + SMS → repair → alarm closes', async () => {
  const smsBefore = sms.sent.length;
  const r = await req('POST', '/api/bms/B1/simulate-fault', {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const st = (await req('GET', '/api/state')).data;
  const alarm = st.alarms.find(a => a.key === 'equip:AHU-02' && a.status === 'Active');
  assert.ok(alarm, 'critical alarm raised');
  assert.equal(alarm.priority, 'Critical');
  assert.ok(alarm.jobId, 'call raised automatically');
  assert.ok(alarm.response.some(x => x.label === 'Technician dispatched'));
  const job = st.jobs.find(j => j.id === alarm.jobId);
  assert.equal(job.urgency, 'Critical'); assert.equal(job.status, 'assigned');
  // Critical alarm policy: SMS to manager, ops and desk
  await until(() => sms.sent.slice(smsBefore).filter(m => /Critical alarm: AHU-02/.test(m.body[0].body)).length >= 3);
  // repair
  for (let k = 0; k < 2; k++) await req('POST', `/api/jobs/${job.id}/advance`, {});
  await req('PATCH', `/api/jobs/${job.id}`, { findings: 'Overload tripped', work: 'Fan reset, belt replaced' });
  assert.equal((await req('POST', `/api/jobs/${job.id}/advance`, {})).status, 200);
  const closed = await until(async () => { const a = (await req('GET', '/api/state')).data.alarms.find(x => x.id === alarm.id); return a.status === 'Cleared' && a; }, 15000);
  assert.ok(closed.history.some(h => h.label === 'Fault repaired'));
  assert.ok(closed.history.some(h => h.label === 'Alarm closed'));
  // zone alarm also clears once L2-C cools back into band
  await until(async () => !(await req('GET', '/api/state')).data.alarms.some(a => a.key === 'zone:L2-C' && a.status === 'Active'), 40000, 500);
});

test('Modbus TCP connector: reads registers/coils, maps status, trip raises alarm', async () => {
  const regs = { 100: 134, 101: 0, 10: 0x41ae, 11: 0x6666, 20: 2 }; // 13.4 °C (×0.1), float 21.8, status 2 = tripped
  ctx.modbus = modbusDevice(regs, { 0: true });
  const port = await listen(ctx.modbus);
  const r = await req('POST', '/api/admin/buildings', { name: 'Modbus Site', comfort: [20, 24], autoCall: false, connector: { type: 'modbus', host: '127.0.0.1', port, intervalSec: 1, points: [
    { path: 'ahus.AHU-01.status', fc: 1, address: 0, map: { true: 'running', false: 'off' } },
    { path: 'ahus.AHU-01.supplyTemp', fc: 3, address: 100, type: 'int16', scale: 0.1 },
    { path: 'zones.L1-W.temp', fc: 4, address: 10, type: 'float32', decimals: 1 },
    { path: 'chillers.CH-01.status', fc: 3, address: 20, map: { 0: 'off', 1: 'running', 2: 'tripped' } },
    { path: 'pumps.P-1.hz', fc: 3, address: 999 }] } });
  const bid = r.data.building.id;
  const bm = await until(async () => { const b = (await req('GET', '/api/bms/' + bid)).data; return b && b.zones.length && b; });
  assert.equal(bm.ahus[0].status, 'running');
  assert.equal(bm.ahus[0].supplyTemp, 13.4);
  assert.equal(bm.zones[0].temp, 21.8);
  assert.equal(bm.chillers[0].status, 'tripped');
  const st = (await req('GET', '/api/state')).data;
  assert.ok(st.alarms.some(a => a.building === bid && a.key === 'equip:CH-01' && a.priority === 'Critical'));
  assert.ok(!st.alarms.some(a => a.building === bid && a.jobId), 'autoCall off → no job');
  assert.match(st.admin.connectors[bid].error || '', /P-1.*exception 2/, 'bad register reported');
  regs[20] = 1; // chiller restarts
  await until(async () => (await req('GET', '/api/state')).data.alarms.find(a => a.building === bid && a.key === 'equip:CH-01').status === 'Cleared', 8000);
});

test('BACnet/IP connector: ReadProperty present-value (real + enumerated), errors reported', async () => {
  ctx.bacnet = bacnetDevice({ '0:1': 22.5, '5:3': 1, '0:7': 25.5 });
  await new Promise(r => ctx.bacnet.bind(0, '127.0.0.1', r));
  const port = ctx.bacnet.address().port;
  const r = await req('POST', '/api/admin/buildings', { name: 'BACnet Site', comfort: [20, 24], connector: { type: 'bacnet', host: '127.0.0.1', port, intervalSec: 1, timeoutMs: 1000, points: [
    { path: 'zones.L1-W.temp', objectType: 'analogInput', instance: 1, decimals: 1 },
    { path: 'zones.L2-E.temp', objectType: 'analogInput', instance: 7, decimals: 1 },
    { path: 'ahus.AHU-01.status', objectType: 'binaryValue', instance: 3, map: { 0: 'off', 1: 'running' } },
    { path: 'zones.L3-W.temp', objectType: 'analogInput', instance: 99 }] } });
  const bid = r.data.building.id;
  const bm = await until(async () => { const b = (await req('GET', '/api/bms/' + bid)).data; return b && b.zones.length >= 2 && b; });
  assert.equal(bm.zones.find(z => z.id === 'L1-W').temp, 22.5);
  assert.equal(bm.ahus[0].status, 'running');
  const st = (await req('GET', '/api/state')).data;
  assert.ok(st.alarms.some(a => a.building === bid && a.key === 'zone:L2-E' && a.priority === 'High'), '25.5 °C out of band');
  assert.match(st.admin.connectors[bid].error || '', /BACnet error/);
});

test('MQTT connector: JSON payload from a 4G router mapped to the model', async () => {
  const r = await req('POST', '/api/admin/buildings', { name: 'MQTT Site', connector: { type: 'mqtt', url: `mqtt://127.0.0.1:${mqttPort}`, topic: 'bothelec/site9/#',
    jsonMap: { t1: 'zones.L1-C.temp', ahu: { path: 'ahus.AHU-09.status', map: { 0: 'off', 1: 'running', 2: 'tripped' } } },
    points: [{ topic: 'bothelec/site9/co2', path: 'co2' }] } });
  const bid = r.data.building.id;
  await until(async () => (await req('GET', '/api/state')).data.admin.connectors[bid].ok === true);
  const mqtt = require('mqtt');
  const c = mqtt.connect(`mqtt://127.0.0.1:${mqttPort}`);
  await new Promise(res => c.on('connect', res));
  c.publish('bothelec/site9/data', JSON.stringify({ t1: '21.9', ahu: 1 }));
  c.publish('bothelec/site9/co2', '640');
  const bm = await until(async () => { const b = (await req('GET', '/api/bms/' + bid)).data; return b && b.co2 === 640 && b.zones.length && b; });
  assert.equal(bm.zones[0].temp, 21.9);
  assert.equal(bm.ahus[0].status, 'running');
  c.end(true);
});

test('HTTP ingest (gateway / edge agent) with per-building token', async () => {
  const r = await req('POST', '/api/admin/buildings', { name: 'HTTP Site', connector: { type: 'http', keyMap: { temp1: 'zones.L1-W.temp' } } });
  const b = r.data.building;
  assert.equal((await req('POST', `/api/ingest/${b.id}`, { values: { humidity: 50 } }, { cookie: '', headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await req('POST', `/api/ingest/${b.id}`, { values: { humidity: 51, 'zones.L1-W.temp': 22.2 } }, { cookie: '', headers: { Authorization: 'Bearer ' + b.ingestToken } })).status, 200);
  assert.equal((await req('POST', `/api/ingest/${b.id}?token=${b.ingestToken}`, { temp1: 23.1 }, { cookie: '' })).status, 200);
  const bm = (await req('GET', '/api/bms/' + b.id)).data;
  assert.equal(bm.humidity, 51);
  assert.equal(bm.zones[0].temp, 23.1);
});

test('Inbound SMS from a building GSM alarm modem raises and clears alarms', async () => {
  const r = await req('POST', '/api/admin/buildings', { name: 'GSM Site', gsm: { numbers: ['082 999 0000'], rules: [{ match: 'CHILLER.*FAIL', priority: 'Critical', equip: 'CH-A', desc: 'Chiller failure' }] }, autoCall: true });
  const bid = r.data.building.id;
  assert.equal((await req('POST', '/api/hooks/sms-inbound?token=bad', [{ from: '+27829990000', body: 'x' }], { cookie: '' })).status, 401);
  // BulkSMS webhook shape
  let h = await req('POST', '/api/hooks/sms-inbound?token=hooktoken', [{ type: 'RECEIVED', from: '+27829990000', to: '+27870000000', body: 'ALARM: CHILLER 1 FAIL' }], { cookie: '' });
  assert.equal(h.status, 200);
  let st = (await req('GET', '/api/state')).data;
  const a = st.alarms.find(x => x.building === bid && x.status === 'Active');
  assert.equal(a.priority, 'Critical'); assert.equal(a.equip, 'CH-A'); assert.ok(a.jobId, 'critical GSM alarm raises a call');
  // generic shape (e.g. Teltonika SMS forwarding) with a "restored" message
  h = await req('POST', '/api/hooks/sms-inbound?token=hooktoken', { sender: '0829990000', text: 'Mains RESTORED - system normal' }, { cookie: '' });
  st = (await req('GET', '/api/state')).data;
  assert.equal(st.alarms.find(x => x.id === a.id).status, 'Cleared');
});

test('admin test messages and message log', async () => {
  let r = await req('POST', '/api/admin/test', { channel: 'sms', to: '072 555 1234' });
  assert.equal(r.status, 200); assert.equal(r.data.ok, true);
  r = await req('POST', '/api/admin/test', { channel: 'sms', to: 'not-a-number' });
  assert.equal(r.data.ok, false);
  r = await req('POST', '/api/admin/test', { channel: 'email', to: 'someone@bothelec.test' });
  assert.equal(r.data.ok, true);
  await until(async () => (await req('GET', '/api/admin/outbox')).data.filter(m => m.meta && m.meta.test && m.status === 'sent').length >= 2);
  assert.ok(sms.sent.some(m => m.body[0].to === '+27725551234'));
});

test('Teltonika router SMS driver', async () => {
  let got;
  const srv = http.createServer((q, s) => { got = new URL(q.url, 'http://x'); s.end('OK'); });
  const port = await listen(srv);
  const p = smsProvider({ SMS_PROVIDER: 'teltonika', TELTONIKA_URL: `http://127.0.0.1:${port}`, TELTONIKA_USER: 'u', TELTONIKA_PASS: 'p' });
  await p.send('+27821112222', 'Zone 24.6 °C – high');
  assert.equal(got.pathname, '/cgi-bin/sms_send');
  assert.equal(got.searchParams.get('number'), '0027821112222');
  assert.equal(got.searchParams.get('text'), 'Zone 24.6 degC - high');
  srv.close();
});

test('GSM modem driver (AT commands)', async () => {
  const written = [];
  const port = new EventEmitter();
  port.write = d => {
    written.push(d);
    const reply = d.startsWith('AT+CMGS') ? '\r\n> ' : d.endsWith('\x1A') ? '\r\n+CMGS: 17\r\n\r\nOK\r\n' : '\r\nOK\r\n';
    setTimeout(() => port.emit('data', Buffer.from(reply)), 5);
  };
  const p = smsProvider({ SMS_PROVIDER: 'gsm' }, { openPort: async () => port });
  const r = await p.send('+27821112222', 'Test 1');
  assert.equal(r.providerId, 'CMGS 17');
  assert.deepEqual(written.slice(0, 3), ['AT\r', 'AT+CMGF=1\r', 'AT+CMGS="+27821112222"\r']);
  assert.equal(written[3], 'Test 1\x1A');
});

test('technicians: add, edit, reassign a job, remove', async () => {
  let r = await req('POST', '/api/techs', { name: 'N. Sithole', skill: 'Refrigeration', phone: '084 123 4567', email: 'nsithole@bothelec.test' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const id = r.data.tech.id;
  assert.equal((await req('POST', '/api/techs', { name: 'Bad', phone: 'abc' })).status, 400);
  r = await req('POST', '/api/techs', { id, name: 'N. Sithole', skill: 'Refrigeration & VRF', phone: '084 123 4567', vehicle: 'V4' });
  let st = (await req('GET', '/api/state')).data;
  assert.equal(st.technicians.find(t => t.id === id).skill, 'Refrigeration & VRF');
  assert.equal(st.vehicles.find(v => v.id === 'V4').driver, id);
  // assign an open job to the new technician (SMS to them), then removal is blocked while it is open
  const job = st.jobs.find(j => j.status === 'logged') || (await (async () => { const x = await req('POST', '/api/jobs', { building: 'B1', fault: 'Test fault', equipment: 'AHU-01 · Air handling unit' }); return { id: x.data.id }; })());
  await until(async () => ['logged', 'assigned'].includes((await req('GET', '/api/state')).data.jobs.find(j => j.id === job.id).status));
  const smsBefore = sms.sent.length;
  r = await req('POST', `/api/jobs/${job.id}/assign`, { tech: id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await until(() => sms.sent.slice(smsBefore).some(m => m.body[0].to === '+27841234567'));
  r = await req('DELETE', `/api/techs/${id}`);
  assert.equal(r.status, 400); assert.match(r.data.error, /open job/);
  // finish the job, then remove
  for (let k = 0; k < 2; k++) await req('POST', `/api/jobs/${job.id}/advance`, {});
  await req('PATCH', `/api/jobs/${job.id}`, { findings: 'x', work: 'y' });
  await req('POST', `/api/jobs/${job.id}/advance`, {});
  await req('POST', `/api/jobs/${job.id}/sign`, { signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', name: 'Z' });
  r = await req('DELETE', `/api/techs/${id}`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  st = (await req('GET', '/api/state')).data;
  assert.ok(!st.technicians.some(t => t.id === id));
  assert.equal(st.jobs.find(j => j.id === job.id).techName, 'N. Sithole', 'history keeps the name');
});

test('equipment register and unit service history', async () => {
  let r = await req('POST', '/api/buildings/B1/units', { unit: { id: 'SPL-77', type: 'Split unit', location: 'Level 1 - West zone', make: 'LG', model: 'S12', serial: 'LG-1', installed: '2024-01-10', refrigerant: 'R32', intervalMonths: 6 } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await req('POST', '/api/buildings/B1/units', { unit: { id: 'SPL-77' } })).status, 400, 'duplicate id');
  let st = (await req('GET', '/api/state')).data;
  assert.ok(st.buildings.find(b => b.id === 'B1').equipment.includes('SPL-77 · Split unit'), 'unit offered in call-outs');
  r = await req('POST', '/api/services', { building: 'B1', unit: 'SPL-77', date: '2026-01-05', type: 'Planned maintenance', tech: 'T1', work: 'Filters cleaned', notes: 'All good' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await req('POST', '/api/services', { building: 'B1', unit: 'SPL-77', work: '' })).status, 400);
  assert.equal((await req('POST', '/api/services', { building: 'B1', unit: 'SPL-77', date: '2999-01-01', work: 'x' })).status, 400, 'future date');
  // a call on the unit is linked to it
  r = await req('POST', '/api/jobs', { building: 'B1', equipment: 'SPL-77 · Split unit', fault: 'Dripping water' });
  st = (await req('GET', '/api/state')).data;
  assert.equal(st.jobs.find(j => j.id === r.data.id).unit, 'SPL-77');
  assert.equal(st.services.filter(x => x.unit === 'SPL-77').length, 1);
  assert.equal(st.services.find(x => x.unit === 'SPL-77').techName, 'J. Mokoena');
  // rename keeps history attached
  await req('POST', '/api/buildings/B1/units', { originalId: 'SPL-77', unit: { id: 'SPL-78', type: 'Split unit', intervalMonths: 6 } });
  st = (await req('GET', '/api/state')).data;
  assert.equal(st.services.filter(x => x.unit === 'SPL-78').length, 1);
  assert.equal(st.jobs.find(j => j.id === r.data.id).unit, 'SPL-78');
  // decommission hides it from call-outs but keeps the record
  await req('POST', '/api/buildings/B1/units/SPL-78/removed', { removed: true });
  st = (await req('GET', '/api/state')).data;
  const b1 = st.buildings.find(b => b.id === 'B1');
  assert.ok(!b1.equipment.includes('SPL-78 · Split unit'));
  assert.ok(b1.units.find(u => u.id === 'SPL-78').removed);
  // a client can read but not write
  const cc = await login('client2@bothelec.test', 'client-pass-1');
  assert.equal((await req('POST', '/api/services', { building: 'B2', unit: 'VRF-01', work: 'x' }, { cookie: cc })).status, 403);
  assert.ok((await req('GET', '/api/state', undefined, { cookie: cc })).data.services.every(x => x.building === 'B2'));
});

test('older data is converted: single manager/ops fields become contacts, equipment text becomes units', () => {
  const { createModel } = require('../lib/model');
  const { openDb } = require('../lib/db');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bothelec-mig-'));
  const db = openDb(dir);
  db.setKv('meta', { id: 'meta', seq: 1 });
  db.put('buildings', { id: 'BX', name: 'Old', manager: 'A', managerPhone: '0821111111', managerEmail: 'a@x.co', ops: 'B', opsEmail: 'b@x.co', equipment: ['AHU-9 · Air handling unit', 'Other / not sure'] });
  const m = createModel({ db, env: { ADMIN_PASSWORD: 'password123' }, bus: new EventEmitter(), filesDir: path.join(dir, 'f') });
  const b = m.S.buildings[0];
  assert.deepEqual(b.contacts.map(c => [c.name, c.role]), [['A', 'Building Manager'], ['B', 'Operations Manager']]);
  assert.equal(b.units[0].id, 'AHU-9');
  assert.equal(b.manager, undefined);
  m.stop();
});

test('parts & labour on a job → signed report → draft invoice in Zoho Books (client + contacts pushed)', async () => {
  // a fresh job on B1
  let r = await req('POST', '/api/jobs', { building: 'B1', equipment: 'AHU-03 · Air handling unit', fault: 'Noisy fan', urgency: 'Medium' });
  const id = r.data.id;
  // earlier tests (and automatic BMS calls) can leave every technician busy: give this job its own
  await until(async () => {
    const j = (await req('GET', '/api/state')).data.jobs.find(x => x.id === id);
    if (j.status === 'assigned') return true;
    const t = (await req('POST', '/api/techs', { name: 'Billing Tech ' + Date.now(), phone: '084 999 0000' })).data.tech;
    await req('POST', `/api/jobs/${id}/assign`, { tech: t.id });
    return false;
  });
  const lines = [{ kind: 'Call-out', code: 'CALLOUT', description: 'Call-out fee', qty: 1, unitPrice: 650 }, { kind: 'Labour', code: 'LAB-HR', description: 'Labour (technician)', qty: 2, unitPrice: 550 }, { kind: 'Part', description: 'Fan bearing', qty: 2, unitPrice: 199.99 }];
  // a client cannot edit billing
  const cc = await login('client2@bothelec.test', 'client-pass-1');
  assert.equal((await req('PUT', `/api/jobs/${id}/billing`, { lines }, { cookie: cc })).status, 403);
  assert.equal((await req('PUT', `/api/jobs/${id}/billing`, { lines: [{ description: 'x', qty: 0, unitPrice: 5 }] })).status, 400, 'qty must be > 0');
  r = await req('PUT', `/api/jobs/${id}/billing`, { lines });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.totals, { subtotal: 2149.98, vat: 322.5, total: 2472.48 });
  for (let k = 0; k < 2; k++) await req('POST', `/api/jobs/${id}/advance`, {});
  await req('PATCH', `/api/jobs/${id}`, { findings: 'Bearing worn', work: 'Bearings replaced' });
  await req('POST', `/api/jobs/${id}/advance`, {});
  const mailsBefore = smtp.mails.length;
  await req('POST', `/api/jobs/${id}/sign`, { signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', name: 'L. Pillay' });
  // not invoiced automatically any more: it waits for approval in the billing tracker
  await sleep(1500);
  let st0 = (await req('GET', '/api/state')).data;
  assert.ok(!st0.jobs.find(x => x.id === id).invoice, 'no invoice before approval');
  const row = st0.tracker.find(t => t.jobId === id);
  assert.ok(row, 'tracker row created automatically');
  assert.equal(row.critical, false);
  assert.equal((await req('PUT', `/api/tracker/${row.id}`, { poNumber: '1049001', poDate: '2026-11-01', poStatus: 'Approved' })).status, 200);
  r = await req('POST', '/api/tracker/approve', { ids: [row.id] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.sent, 1);
  const job = await until(async () => { const j = (await req('GET', '/api/state')).data.jobs.find(x => x.id === id); return j.invoice && j; }, 15000);
  const row2 = (await req('GET', '/api/state')).data.tracker.find(t => t.id === row.id);
  assert.equal(row2.invoice.number, 'INV-000001');
  assert.equal(row2.amountIncl, 2472.48);
  assert.equal(job.invoice.number, 'INV-000001');
  assert.match(job.invoice.url, /#\/invoices\/i1$/);
  const inv = zoho.invoices[0];
  assert.equal(inv.reference_number, '1049001', 'client PO number becomes the order number');
  assert.equal(inv.customer_id, 'c1');
  assert.deepEqual(inv.line_items.map(l => [l.name, l.quantity, l.rate]), [['Call-out fee', 1, 650], ['Labour (technician)', 2, 550], ['Fan bearing', 2, 199.99]]);
  const contact = zoho.contacts[0];
  assert.equal(contact.contact_name, 'Demonstration Site');
  assert.equal(contact.contact_type, 'customer');
  assert.ok(contact.contact_persons.some(p => p.email === 'building.manager@example.com'));
  assert.ok(zoho.calls.filter(c => c.path.startsWith('/books')).every(c => c.auth === 'Zoho-oauthtoken at1' || c.auth.startsWith('Zoho-oauthtoken at')));
  // report email carries the parts & labour table
  await until(() => smtp.mails.slice(mailsBefore).some(m => /Parts &(amp;)? labour/.test(m.data)));
  // already invoiced: billing locked, second request refused
  assert.equal((await req('PUT', `/api/jobs/${id}/billing`, { lines })).status, 400);
  assert.equal((await req('POST', `/api/jobs/${id}/invoice`, {})).status, 400);
});

test('Zoho: new building contact is added as a contact person; expired token is refreshed; retries do not duplicate invoices', async () => {
  let st = (await req('GET', '/api/state')).data;
  const b1 = st.buildings.find(b => b.id === 'B1');
  await req('PUT', '/api/buildings/B1/contacts', { contacts: [...b1.contacts, { name: 'New Person', role: 'Building Manager', email: 'new.person@bothelec.test' }] });
  await until(() => zoho.persons.some(p => p.email === 'new.person@bothelec.test' && p.contact_id === 'c1' && p.first_name === 'New' && p.last_name === 'Person'));
  // logged planned service with lines → manual invoice; token expires first
  let r = await req('POST', '/api/services', { building: 'B1', unit: 'CT-01', date: '2026-11-01', type: 'Planned maintenance', tech: 'T3', work: 'Basin cleaned', billing: { lines: [{ kind: 'Labour', description: 'Planned service: cooling tower', qty: 1, unitPrice: 1800 }] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const svId = r.data.service.id;
  // simulate an invoice that already exists in Zoho for this reference (e.g. created before a timeout)
  zoho.invoices.push({ invoice_id: 'iX', invoice_number: 'INV-EXISTING', reference_number: svId, status: 'draft' });
  zoho.expireNext = true;
  const tokensBefore = zoho.tokens;
  r = await req('POST', `/api/services/${svId}/invoice`, {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const sv = await until(async () => { const x = (await req('GET', '/api/state')).data.services.find(y => y.id === svId); return x.invoice && x; });
  assert.equal(sv.invoice.number, 'INV-EXISTING', 'linked to the existing invoice instead of creating a duplicate');
  assert.equal(zoho.invoices.filter(i => i.reference_number === svId).length, 1);
  assert.ok(zoho.tokens > tokensBefore, 'token refreshed after 401');
  // connection test + sync log
  r = await req('POST', '/api/admin/zoho/test', {});
  assert.equal(r.data.organisation.name, 'Bothelec Aircon Solutions');
  st = (await req('GET', '/api/state')).data;
  assert.ok(st.admin.zoho.configured);
  assert.ok(st.admin.zoho.log.some(x => x.kind === 'invoice' && x.status === 'done'));
  // price list & VAT settings
  r = await req('PUT', '/api/admin/settings', { billing: { vatRate: 60 } });
  assert.equal(r.status, 400);
  r = await req('PUT', '/api/admin/settings', { billing: { catalogue: [{ code: 'X1', name: 'Test item', kind: 'Part', unit: 'each', rate: 10 }] } });
  assert.equal((await req('GET', '/api/state')).data.billing.catalogue[0].name, 'Test item');
});

test('billing tracker: rows for every job, manual POs, approval rules, manual invoice numbers, portal and paid', async () => {
  let st = (await req('GET', '/api/state')).data;
  for (const j of st.jobs) assert.ok(st.tracker.some(t => t.jobId === j.id), 'row for ' + j.id);
  // clients never see the tracker
  const cc = await login('client2@bothelec.test', 'client-pass-1');
  assert.deepEqual((await req('GET', '/api/state', undefined, { cookie: cc })).data.tracker, []);
  assert.equal((await req('POST', '/api/tracker', { building: 'B2', description: 'x' }, { cookie: cc })).status, 403);
  // manual PO / quote row
  let r = await req('POST', '/api/tracker', { building: 'B2', description: 'Quote: new split unit', poNumber: 'PO-77', poDate: '2026-10-01', poStatus: 'Pending', amountEx: 1000 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const manual = r.data.row;
  assert.equal(manual.amountIncl, 1150);
  // approving an unfinished job is refused with a reason
  const open = st.jobs.find(j => !['completed', 'report'].includes(j.status));
  const openRow = st.tracker.find(t => t.jobId === open.id);
  r = await req('POST', '/api/tracker/approve', { ids: [openRow.id] });
  assert.equal(r.data.approved, 0); assert.match(r.data.skipped[0], /not completed/);
  // manual invoice number (before Zoho is used), then portal + paid in bulk
  r = await req('PUT', `/api/tracker/${manual.id}`, { invoiceNumber: 'INV-0099', invoiceDate: '2026-10-05', poStatus: 'Approved' });
  assert.equal(r.data.row.invoice.number, 'INV-0099');
  r = await req('POST', '/api/tracker/bulk', { ids: [manual.id, openRow.id], action: 'portal', date: '2026-10-06' });
  assert.equal(r.data.updated, 1, 'only invoiced rows');
  r = await req('POST', '/api/tracker/bulk', { ids: [manual.id], action: 'paid' });
  assert.equal(r.data.updated, 1);
  st = (await req('GET', '/api/state')).data;
  const m = st.tracker.find(t => t.id === manual.id);
  assert.equal(m.portalDate, '2026-10-06'); assert.ok(m.paidDate);
  // job rows cannot be deleted; manual rows can
  assert.equal((await req('DELETE', `/api/tracker/${openRow.id}`)).status, 400);
  assert.equal((await req('DELETE', `/api/tracker/${manual.id}`)).status, 200);
  // a critical BMS call is flagged critical in the tracker
  const crit = st.jobs.find(j => j.urgency === 'Critical');
  assert.equal(st.tracker.find(t => t.jobId === crit.id).critical, true);
});

test('Connect Zoho Books from the app (OAuth): consent URL, callback, organisation, disconnect', async () => {
  const redirectUri = base + '/api/zoho/callback';
  assert.equal((await req('POST', '/api/admin/zoho/connect', { dc: 'eu', clientId: 'x', clientSecret: 'y', redirectUri })).status, 400, 'validates ids');
  let r = await req('POST', '/api/admin/zoho/connect', { dc: 'eu', clientId: '1000.ABCDEFGHIJ', clientSecret: 'secretsecret123', redirectUri });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const auth = new URL(r.data.url);
  assert.equal(auth.origin, 'https://accounts.zoho.eu');
  assert.equal(auth.searchParams.get('scope'), 'ZohoBooks.fullaccess.all');
  assert.equal(auth.searchParams.get('access_type'), 'offline');
  assert.equal(auth.searchParams.get('redirect_uri'), redirectUri);
  const state = auth.searchParams.get('state');
  const accountsServer = app.server && zoho.srv.address() && `http://127.0.0.1:${zoho.srv.address().port}`;
  // a forged state is refused
  let cb = await fetch(`${base}/api/zoho/callback?code=authcode&state=wrong&accounts-server=${encodeURIComponent(accountsServer)}`, { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.match(decodeURIComponent(cb.headers.get('location')), /error\/The connection request expired/);
  // the real callback
  r = await req('POST', '/api/admin/zoho/connect', { dc: 'eu', clientId: '1000.ABCDEFGHIJ', clientSecret: 'secretsecret123', redirectUri });
  const state2 = new URL(r.data.url).searchParams.get('state');
  cb = await fetch(`${base}/api/zoho/callback?code=authcode&state=${state2}&location=eu&accounts-server=${encodeURIComponent(accountsServer)}`, { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('location'), '/#/settings/billing/connected');
  assert.equal(zoho.exchange.client_id, '1000.ABCDEFGHIJ');
  assert.equal(zoho.exchange.redirect_uri, redirectUri);
  let st = (await req('GET', '/api/state')).data;
  assert.equal(st.admin.zoho.meta.source, 'app');
  assert.equal(st.admin.zoho.meta.orgName, 'Bothelec Aircon Solutions', 'single organisation picked automatically');
  assert.ok(st.admin.zoho.configured);
  assert.ok(!JSON.stringify(st).includes('secretsecret123'), 'secret never sent to the browser');
  assert.equal((await req('POST', '/api/admin/zoho/test', {})).status, 200);
  // a client user cannot start a connection
  const cc = await login('client2@bothelec.test', 'client-pass-1');
  assert.equal((await req('POST', '/api/admin/zoho/connect', { dc: 'com', clientId: '1000.ABCDEFGHIJ', clientSecret: 'secretsecret123', redirectUri }, { cookie: cc })).status, 403);
  // disconnect revokes the token and falls back to the .env connection
  r = await req('POST', '/api/admin/zoho/disconnect', {});
  assert.equal(r.status, 200);
  assert.equal(zoho.revoked, 'rt');
  st = (await req('GET', '/api/state')).data;
  assert.equal(st.admin.zoho.meta.source, 'env');
});

test('tracker CSV import: rows created, duplicates and empty rows skipped', async () => {
  const rows = [
    { line: 2, poDate: '2025-10-16', poNumber: '1046130', invoiceNumber: 'INV-0099430', invoiceDate: '2025-11-05', amountIncl: 215211.75, amountEx: 187140.65, portalDate: '2025-11-05', paidDate: '2025-11-11' },
    { line: 3, poStatus: 'Not approved', amountIncl: 254893.6, amountEx: 221646.61 },
    { line: 4, poNumber: '1048448', jobRef: '4336', jobDate: '2025-10-31', invoiceNumber: 'INV-0012423', invoiceDate: '2025-11-03', amountIncl: 235950.33, amountEx: 205174.2 },
    { line: 5, jobRef: '3831', jobDate: '2026-01-06', invoiceNumber: 'INV-0012583', invoiceDate: '2026-01-23', amountIncl: 856.75, amountEx: 745, void: true },
    { line: 6 },
  ];
  let r = await req('POST', '/api/tracker/import', { building: 'B1', rows });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.imported, 4);
  assert.equal(r.data.skipped.length, 1);
  r = await req('POST', '/api/tracker/import', { building: 'B1', rows: rows.slice(0, 1) });
  assert.equal(r.data.imported, 0, 'same invoice number is not imported twice');
  const st = (await req('GET', '/api/state')).data;
  const a = st.tracker.find(t => t.invoice && t.invoice.number === 'INV-0099430');
  assert.equal(a.poStatus, 'Approved'); assert.equal(a.paidDate, '2025-11-11'); assert.equal(a.amountIncl, 215211.75);
  const v = st.tracker.find(t => t.invoice && t.invoice.number === 'INV-0012583');
  assert.equal(v.void, true); assert.equal(v.legacyJob, '3831'); assert.equal(v.description, 'Job card 3831');
  assert.ok(st.tracker.some(t => t.poStatus === 'Not approved' && t.amountEx === 221646.61));
});

test('changing your password keeps this device signed in and signs out other devices', async () => {
  await req('POST', '/api/admin/users', { name: 'Pw User', email: 'pw@bothelec.test', role: 'desk', password: 'first-pass-1' });
  const deviceA = await login('pw@bothelec.test', 'first-pass-1');
  const deviceB = await login('pw@bothelec.test', 'first-pass-1');
  const r = await fetch(base + '/api/me/password', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: deviceA }, body: JSON.stringify({ current: 'first-pass-1', password: 'second-pass-2' }) });
  assert.equal(r.status, 200);
  const newA = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('GET', '/api/state', undefined, { cookie: newA })).status, 200, 'this device still signed in');
  assert.equal((await req('GET', '/api/state', undefined, { cookie: deviceB })).status, 401, 'other device signed out');
  assert.equal((await req('POST', '/api/login', { email: 'pw@bothelec.test', password: 'first-pass-1' }, { cookie: '' })).status, 401);
  assert.equal((await req('POST', '/api/login', { email: 'pw@bothelec.test', password: 'second-pass-2' }, { cookie: '' })).status, 200);
});

test('technician login only gets their own workflow', async () => {
  let r = await req('POST', '/api/admin/users', { name: 'S. van Wyk', email: 'svanwyk@bothelec.test', role: 'tech', techId: 'T3', password: 'tech-pass-123' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const tc = await login('svanwyk@bothelec.test', 'tech-pass-123');
  const st = (await req('GET', '/api/state', undefined, { cookie: tc })).data;
  assert.ok(st.jobs.length >= 1 && st.jobs.every(j => j.tech === 'T3'), 'only own jobs');
  assert.deepEqual(st.technicians.map(t => t.id), ['T3'], 'no other technicians (or their phone numbers)');
  assert.ok(st.trips.every(t => t.driver === 'T3'), 'only own trips');
  assert.ok(st.vehicles.every(v => v.id === 'V3'), 'only own vehicle');
  assert.ok(st.assessments.every(a => a.by === 'T3'), 'only own assessments');
  assert.ok(st.alarms.every(a => st.jobs.some(j => j.id === a.jobId)), 'only alarms linked to own jobs');
  assert.deepEqual(st.tracker, []); assert.deepEqual(st.documents, []); assert.equal(st.admin, undefined);
  assert.ok(st.buildings.every(b => !b.ingestToken && b.connector.type === 'none'));
  assert.ok(st.feed.every(f => /service\/job\//.test(f.link) && st.jobs.some(j => f.link.endsWith('/' + j.id))), 'only activity about own jobs');
  assert.equal((await req('GET', '/api/bms/B1', undefined, { cookie: tc })).status, 404, 'no building monitoring');
  assert.equal((await req('POST', '/api/bms/B1/simulate-fault', {}, { cookie: tc })).status, 403);
  assert.equal((await req('POST', '/api/tracker/approve', { ids: [] }, { cookie: tc })).status, 403);
  assert.equal((await req('PUT', '/api/buildings/B1/contacts', { contacts: [] }, { cookie: tc })).status, 403);
  const other = (await req('GET', '/api/state')).data.jobs.find(j => j.tech && j.tech !== 'T3');
  if (other) assert.equal((await req('POST', `/api/jobs/${other.id}/advance`, {}, { cookie: tc })).status, 404, 'cannot touch other technicians\' jobs');
  // trips are always their own
  r = await req('POST', '/api/trips', { what: 'Spare filters', from: 'Depot', to: 'Site', driver: 'T1' }, { cookie: tc });
  const trip = (await req('GET', '/api/state')).data.trips.find(t => t.id === r.data.id);
  assert.equal(trip.driver, 'T3');
  const t1trip = (await req('GET', '/api/state')).data.trips.find(t => t.driver === 'T4' && t.status !== 'Delivered');
  if (t1trip) assert.equal((await req('POST', `/api/trips/${t1trip.id}/advance`, {}, { cookie: tc })).status, 404);
  // can still log services on equipment
  r = await req('POST', '/api/services', { building: 'B1', unit: 'AHU-01', work: 'Filters changed' }, { cookie: tc });
  assert.equal(r.status, 200);
  assert.equal(r.data.service.techName, 'S. van Wyk');
});

test('utility management: readings, billing run maths, approval → tracker → Zoho invoice to the tenant', async () => {
  let st = (await req('GET', '/api/state')).data;
  assert.ok(st.meters.length >= 8 && st.tenants.length >= 3 && st.tariffs.length === 3, 'demo meters, tenants and tariffs');
  // known readings for a fresh meter + tenant in a fresh month
  let r = await req('POST', '/api/tenants', { building: 'B4', name: 'Test Tenant', unit: 'Shop 9', email: 'tenant9@bothelec.test' });
  const tid = r.data.tenant.id;
  r = await req('POST', '/api/meters', { meter: { id: 'E-T9', building: 'B4', type: 'electricity', tenantId: tid, multiplier: 2 } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await req('POST', '/api/meters', { meter: { id: 'W-T9', building: 'B4', type: 'water', tenantId: tid } });
  await req('POST', '/api/meters/E-T9/readings', { date: '2024-03-01', time: '08:00', value: 1000 });
  await req('POST', '/api/meters/E-T9/readings', { date: '2024-04-01', time: '08:00', value: 1600 }); // (1600-1000) x 2 = 1200 kWh
  await req('POST', '/api/meters/W-T9/readings', { date: '2024-03-01', value: 10 });
  await req('POST', '/api/meters/W-T9/readings', { date: '2024-04-01', value: 30 }); // 20 kL
  r = await req('POST', '/api/meters/W-T9/readings', { date: '2024-04-02', value: 5 });
  assert.match(r.data.warning, /Lower than the previous reading/);
  await req('DELETE', `/api/meters/W-T9/readings/${encodeURIComponent(new Date('2024-04-02T12:00:00Z').toISOString())}`);
  assert.equal((await req('POST', '/api/meters/E-T9/readings', { date: '2999-01-01', value: 1 })).status, 400, 'future date refused');
  // make sure only our tenant is billed in this month by giving B4's other tenants no readings in 2024 (they get warnings, zero)
  r = await req('POST', '/api/recoveries', { building: 'B4', month: '2024-03' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const run = r.data.run;
  const line = run.lines.find(l => l.tenantId === tid);
  const elec = line.items.find(i => i.meterId === 'E-T9'), water = line.items.find(i => i.meterId === 'W-T9');
  assert.equal(elec.consumption, 1200);
  // sample electricity tariff: 1000 x 2.98 + 200 x 3.42 + fixed 285
  assert.deepEqual(elec.charges.map(c => c.amount), [2980, 684, 285]);
  // sample water tariff: 6 x 24.5 + 9 x 39.8 + 5 x 54.2 = 147 + 358.2 + 271 = 776.2; sewer 70% = 543.34
  assert.deepEqual(water.charges.map(c => c.amount), [147, 358.2, 271, 543.34]);
  assert.equal(line.subtotal, 2980 + 684 + 285 + 776.2 + 543.34);
  assert.equal(line.total, Math.round(line.subtotal * 1.15 * 100) / 100);
  assert.ok(run.lines.some(l => l.tenantId !== tid && l.items.some(i => i.warnings.length)), 'tenants without readings get warnings');
  assert.equal((await req('POST', '/api/recoveries', { building: 'B4', month: '2024-03' })).status, 400, 'one run per building per month');
  // approve: tenant statement emailed, tracker row added
  const mailsBefore = smtp.mails.length;
  r = await req('POST', `/api/recoveries/${run.id}/approve`, {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await until(() => smtp.mails.slice(mailsBefore).some(m => m.to.join(' ').includes('tenant9@bothelec.test') && /Utility statement/.test(m.data)));
  st = (await req('GET', '/api/state')).data;
  const row = st.tracker.find(t => t.recoveryId === run.id && t.tenantId === tid);
  assert.ok(row && row.division === 'utility' && row.amountIncl === line.total, 'tracker row for the tenant');
  assert.equal((await req('DELETE', `/api/recoveries/${run.id}`)).status, 400, 'approved runs are locked');
  // approve in the tracker → Zoho invoice to the tenant as customer
  r = await req('POST', '/api/tracker/approve', { ids: [row.id] });
  assert.equal(r.data.sent, 1);
  await until(() => zoho.invoices.some(i => (i.line_items || []).some(l => /E-T9/.test(l.name))));
  const inv = zoho.invoices.find(i => (i.line_items || []).some(l => /E-T9/.test(l.name)));
  const cust = zoho.contacts.find(c => c.contact_id === inv.customer_id);
  assert.equal(cust.contact_name, 'Test Tenant');
  assert.equal(inv.line_items.length, 7);
  await until(async () => { const x = (await req('GET', '/api/state')).data.recoveries.find(y => y.id === run.id); return x.lines.find(l => l.tenantId === tid).invoice; });
});

test('utility management: building link readings, permissions, company per building', async () => {
  // a building link (HTTP ingest) can deliver meter readings
  const b4 = (await req('GET', '/api/state')).data.buildings.find(b => b.id === 'B4');
  let r = await req('POST', '/api/ingest/B4', { values: { 'meters.E-S1.reading': 99999.5 } }, { cookie: '', headers: { Authorization: 'Bearer ' + b4.ingestToken } });
  assert.equal(r.status, 200);
  const rs = (await req('GET', '/api/meters/E-S1/readings')).data;
  assert.equal(rs[rs.length - 1].value, 99999.5); assert.equal(rs[rs.length - 1].source, 'connector');
  // clients see their own buildings' meters, read only
  const cc = await login('client2@bothelec.test', 'client-pass-1'); // client of B2
  const cs = (await req('GET', '/api/state', undefined, { cookie: cc })).data;
  assert.ok(cs.meters.every(m => m.building === 'B2') && cs.meters.length >= 1);
  assert.ok(cs.tenants.every(t => t.building === 'B2'));
  assert.deepEqual(cs.tariffs, []);
  assert.equal((await req('GET', '/api/meters/E-S1/readings', undefined, { cookie: cc })).status, 404);
  assert.equal((await req('POST', '/api/meters/E-L1/readings', { value: 1 }, { cookie: cc })).status, 403);
  assert.equal((await req('POST', '/api/recoveries', { building: 'B2', month: '2024-01' }, { cookie: cc })).status, 403);
  // a building's companies
  r = await req('POST', '/api/admin/buildings', { id: 'B3', name: 'Centurion Medical Suites', divisions: [] });
  assert.equal(r.status, 400);
  r = await req('POST', '/api/admin/buildings', { id: 'B3', name: 'Centurion Medical Suites', divisions: ['aircon', 'utility'] });
  assert.deepEqual(r.data.building.divisions, ['aircon', 'utility']);
  // meter jobs are tagged with the company and linked to the meter
  r = await req('POST', '/api/jobs', { building: 'B4', division: 'utility', equipment: 'E-S2 · Electricity meter (Shop 2 DB)', fault: 'No display' });
  const j = (await req('GET', '/api/state')).data.jobs.find(x => x.id === r.data.id);
  assert.equal(j.division, 'utility'); assert.equal(j.meter, 'E-S2');
});

test('utility building setup: building → shops & serials → bulk check → tariffs', async () => {
  let r = await req('POST', '/api/utility/building', { name: 'Setup Test Mall', client: 'STM Holdings', area: 'Fourways' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const bid = r.data.building.id;
  assert.deepEqual(r.data.building.divisions, ['utility']);
  const rows = [
    { kind: 'shop', unit: 'Shop 1', name: 'Alpha', email: 'alpha@bothelec.test', elecSerial: 'SER-E1', waterSerial: 'SER-W1' },
    { kind: 'shop', unit: 'Shop 2', name: 'Beta', elecSerial: 'SER-E2' },
    { kind: 'common', unit: 'Common area', elecSerial: 'SER-E3', waterSerial: 'SER-W3' },
  ];
  // validation: duplicate serial, missing tenant name, serial installed at another building
  r = await req('POST', `/api/utility/setup/${bid}`, { rows: [...rows, { kind: 'shop', unit: 'Shop 9', name: 'Dup', elecSerial: 'SER-E1' }] });
  assert.equal(r.status, 400); assert.match(r.data.error, /also on row 1/);
  r = await req('POST', `/api/utility/setup/${bid}`, { rows: [{ kind: 'shop', unit: 'Shop 5', elecSerial: 'X' }] });
  assert.match(r.data.error, /tenant's name/);
  r = await req('POST', `/api/utility/setup/${bid}`, { rows: [{ kind: 'common', unit: 'Plant', elecSerial: 'LG-881201' }] });
  assert.match(r.data.error, /already installed at Sandton Retail Centre/);
  let st = (await req('GET', '/api/state')).data;
  assert.ok(!st.meters.some(m => m.building === bid), 'nothing saved when validation fails');
  r = await req('POST', `/api/utility/setup/${bid}`, { rows });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.tenants, 2); assert.equal(r.data.created, 5);
  st = (await req('GET', '/api/state')).data;
  const ms = st.meters.filter(m => m.building === bid);
  const alpha = st.tenants.find(t => t.building === bid && t.name === 'Alpha');
  assert.equal(ms.filter(m => m.tenantId === alpha.id).length, 2, 'Alpha has electricity + water');
  assert.ok(ms.some(m => m.serial === 'SER-E3' && !m.tenantId && m.location === 'Common area'), 'common area meter has no tenant');
  // saving again links the same meters (no duplicates); replacing a serial retires the old meter
  r = await req('POST', `/api/utility/setup/${bid}`, { rows: [{ ...rows[0], tenantId: alpha.id, elecSerial: 'SER-E1B' }, rows[1], rows[2]] });
  assert.equal(r.data.created, 1); assert.equal(r.data.unlinked, 1);
  st = (await req('GET', '/api/state')).data;
  const old = st.meters.find(m => m.serial === 'SER-E1');
  assert.ok(old.removed && /Replaced by SER-E1B/.test(old.notes));
  assert.equal(st.tenants.filter(t => t.building === bid).length, 2, 'no duplicate tenants');
  // a new tenant moving into Shop 2: old one marked moved out, meters move to the new tenant
  r = await req('POST', `/api/utility/setup/${bid}`, { rows: [{ ...rows[1], name: 'Gamma' }] });
  st = (await req('GET', '/api/state')).data;
  const beta = st.tenants.find(t => t.building === bid && t.name === 'Beta'), gamma = st.tenants.find(t => t.building === bid && t.name === 'Gamma');
  assert.equal(beta.active, false); assert.ok(gamma && gamma.active);
  assert.equal(st.meters.find(m => m.serial === 'SER-E2').tenantId, gamma.id);
  // bulk check
  r = await req('GET', `/api/utility/check/${bid}`);
  assert.equal(r.data.meters.length, 5);
  assert.ok(r.data.meters.every(m => m.status === 'bad' && m.issues.some(i => /No readings yet/.test(i.text))));
  const e1b = st.meters.find(m => m.serial === 'SER-E1B');
  await req('POST', `/api/meters/${e1b.id}/readings`, { value: 100 });
  r = await req('GET', `/api/utility/check-meter/${e1b.id}`);
  assert.equal(r.data.status, 'warn'); assert.ok(r.data.issues.some(i => /Only one reading/.test(i.text)));
  // tariffs
  r = await req('POST', `/api/utility/tariffs/${bid}`, { assign: [{ meterId: e1b.id, tariffId: 'TF-WATER' }] });
  assert.equal(r.status, 400, 'water tariff on an electricity meter is refused');
  r = await req('POST', `/api/utility/tariffs/${bid}`, { assign: st.meters.filter(m => m.building === bid && !m.removed).map(m => ({ meterId: m.id, tariffId: m.type === 'water' ? 'TF-WATER' : 'TF-ELEC' })) });
  assert.equal(r.data.updated, 5);
  // a client cannot run setup
  const cc = await login('client2@bothelec.test', 'client-pass-1');
  assert.equal((await req('POST', `/api/utility/setup/${bid}`, { rows }, { cookie: cc })).status, 403);
});

test('meter tree and building balance against the council meter', async () => {
  let r = await req('POST', '/api/utility/building', { name: 'Balance Test Centre' });
  const bid = r.data.building.id;
  r = await req('POST', `/api/utility/setup/${bid}`, { rows: [
    { kind: 'council', unit: 'Council supply', elecSerial: 'BAL-CE', waterSerial: 'BAL-CW' },
    { kind: 'check', unit: 'DB-1', elecSerial: 'BAL-CHK' },
    { kind: 'shop', unit: 'Shop 1', name: 'One', elecSerial: 'BAL-E1', waterSerial: 'BAL-W1' },
    { kind: 'shop', unit: 'Shop 2', name: 'Two', elecSerial: 'BAL-E2' },
  ] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let st = (await req('GET', '/api/state')).data;
  const id = serial => st.meters.find(m => m.serial === serial).id;
  assert.equal(st.meters.find(m => m.serial === 'BAL-CE').role, 'council');
  assert.equal(st.meters.find(m => m.serial === 'BAL-E1').parentId, id('BAL-CE'), 'new sub-meters go under the council meter');
  // put Shop 2 under the check meter; refuse loops and wrong types
  assert.equal((await req('POST', `/api/utility/tree/${bid}`, { items: [{ meterId: id('BAL-CHK'), role: 'check', parentId: id('BAL-E2') }, { meterId: id('BAL-E2'), role: 'sub', parentId: id('BAL-CHK') }] })).status, 400);
  assert.match((await req('POST', `/api/utility/tree/${bid}`, { items: [{ meterId: id('BAL-W1'), role: 'sub', parentId: id('BAL-CE') }] })).data.error, /cannot be fed from a electricity meter/);
  r = await req('POST', `/api/utility/tree/${bid}`, { items: [{ meterId: id('BAL-CHK'), role: 'check', parentId: id('BAL-CE') }, { meterId: id('BAL-E2'), role: 'sub', parentId: id('BAL-CHK') }] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // solar feeding into the council meter
  r = await req('POST', '/api/meters', { meter: { id: 'BAL-SOL', building: bid, type: 'solar', serial: 'BAL-SOL' } });
  await req('POST', `/api/utility/tree/${bid}`, { items: [{ meterId: 'BAL-SOL', parentId: id('BAL-CE') }] });
  // readings for May 2024: council 1000 + solar 200 = 1200 supply; under it: check 400 + shop1 700 = 1100 → 100 (8.3%) loss > 5%
  const rd = async (m, v1, v2) => { await req('POST', `/api/meters/${encodeURIComponent(m)}/readings`, { date: '2024-05-01', value: v1 }); await req('POST', `/api/meters/${encodeURIComponent(m)}/readings`, { date: '2024-06-01', value: v2 }); };
  await rd(id('BAL-CE'), 5000, 6000); await rd('BAL-SOL', 0, 200); await rd(id('BAL-CHK'), 100, 500); await rd(id('BAL-E1'), 0, 700); await rd(id('BAL-E2'), 0, 390);
  await rd(id('BAL-CW'), 10, 30); await rd(id('BAL-W1'), 0, 19);
  r = await req('GET', `/api/utility/balance/${bid}?month=2024-05`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const council = r.data.trees.electricity.councils[0];
  assert.deepEqual([council.balance.supply, council.balance.metered, council.balance.diff, council.balance.pct, council.balance.status], [1200, 1100, 100, 8.33, 'loss']);
  const chk = council.children.find(n => n.role === 'check');
  assert.deepEqual([chk.balance.supply, chk.balance.metered, chk.balance.status], [400, 390, 'ok'], 'check meter balances its own sub-meters');
  const water = r.data.trees.water.councils[0];
  assert.deepEqual([water.balance.supply, water.balance.metered, water.balance.pct, water.balance.status], [20, 19, 5, 'ok']);
  // tolerance per building
  await req('POST', `/api/utility/tolerance/${bid}`, { electricity: 10, water: 10 });
  r = await req('GET', `/api/utility/balance/${bid}?month=2024-05`);
  assert.equal(r.data.trees.electricity.councils[0].balance.status, 'ok');
  // a month without readings is incomplete, not "balanced"
  r = await req('GET', `/api/utility/balance/${bid}?month=2023-01`);
  assert.equal(r.data.trees.electricity.councils[0].balance.status, 'incomplete');
  // replacing the council meter keeps the tree: its sub-meters move to the new meter
  r = await req('POST', `/api/utility/setup/${bid}`, { rows: [{ kind: 'council', unit: 'Council supply', elecSerial: 'BAL-CE2', waterSerial: 'BAL-CW' }] });
  st = (await req('GET', '/api/state')).data;
  const ce2 = st.meters.find(m => m.serial === 'BAL-CE2');
  assert.equal(ce2.role, 'council');
  assert.equal(st.meters.find(m => m.serial === 'BAL-E1').parentId, ce2.id);
  // bulk check flags meters outside the tree
  await req('POST', `/api/utility/tree/${bid}`, { items: [{ meterId: id('BAL-E1'), role: 'sub', parentId: '' }] });
  r = await req('GET', `/api/utility/check-meter/${id('BAL-E1')}`);
  assert.ok(r.data.issues.some(i => /Not in the meter tree/.test(i.text)));
  // technicians cannot see balances; clients of other buildings cannot either
  const cc = await login('client2@bothelec.test', 'client-pass-1');
  assert.equal((await req('GET', `/api/utility/balance/${bid}?month=2024-05`, undefined, { cookie: cc })).status, 404);
});
