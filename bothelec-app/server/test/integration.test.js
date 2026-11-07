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

/* ---------- harness ---------- */
let app, base, cookie = '', sms, smtp, smsPort, mqttBroker, mqttPort;
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
  const Aedes = require('aedes');
  mqttBroker = (Aedes.createBroker ? await Aedes.createBroker() : new Aedes());
  const mqttSrv = net.createServer(mqttBroker.handle); mqttPort = await listen(mqttSrv); ctx.mqttSrv = mqttSrv;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bothelec-test-'));
  app = createServer({
    DATA_DIR: dir, SEED_DEMO: 'true', ADMIN_EMAIL: 'admin@bothelec.test', ADMIN_PASSWORD: 'admin-pass-123',
    SMS_PROVIDER: 'bulksms', BULKSMS_URL: `http://127.0.0.1:${smsPort}/v1`, BULKSMS_TOKEN_ID: 'tid', BULKSMS_TOKEN_SECRET: 'tsecret', BULKSMS_FROM: 'Bothelec',
    EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort), SMTP_SECURE: 'false', EMAIL_FROM: 'Bothelec Aircon Solutions <alerts@bothelec.test>',
    DESK_PHONE: '082 000 0001', DESK_EMAIL: 'desk@bothelec.test', WEBHOOK_TOKEN: 'hooktoken', AUTO_ASSIGN_DELAY_MS: '100', PUBLIC_URL: 'https://bothelec.test',
  });
  await app.start(0);
  base = `http://127.0.0.1:${app.server.address().port}`;
  cookie = await login('admin@bothelec.test', 'admin-pass-123');
});
after(async () => {
  await app.stop();
  sms.srv.close(); smtp.srv.close(); ctx.mqttSrv.close(); mqttBroker.close();
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
