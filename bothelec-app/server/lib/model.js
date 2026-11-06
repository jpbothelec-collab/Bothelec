'use strict';
/* Business logic: jobs, alarms, automated response and notifications. The server is the single
 * source of truth; browsers receive filtered state over the API and live updates over SSE. */
const fs = require('node:fs');
const path = require('node:path');
const { nowIso, rid, byId, log, setPath, emptyBms, COLLECTIONS } = require('./util');
const { seed, STEPS, DEFAULT_POLICY } = require('./seed');
const { hashPassword, isStaff, canBuilding, canJob } = require('./auth');

const COLLS = ['buildings', 'technicians', 'jobs', 'feed', 'alarms', 'vehicles', 'trips', 'assessments', 'documents', 'users'];
const stepIdx = k => STEPS.findIndex(s => s.key === k);
const stepLabel = k => (STEPS[stepIdx(k)] || {}).label || k;
const ROLE_LABEL = { manager: 'Building Manager', ops: 'Operations Manager', desk: 'Bothelec service desk', tech: 'Technician', caller: 'Caller' };
const escH = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function createModel({ db, env, bus, filesDir }) {
  const S = {};
  let notifier = null;
  const connStatus = {};
  const publicUrl = (env.PUBLIC_URL || `http://localhost:${env.PORT || 8080}`).replace(/\/$/, '');
  fs.mkdirSync(filesDir, { recursive: true });

  /* ---------------- persistence ---------------- */
  function load() {
    COLLS.forEach(c => { S[c] = db.all(c); });
    S.bms = Object.fromEntries(db.all('bms').map(b => [b.id, b]));
    S.meta = db.kv('meta', null);
    S.settings = db.kv('settings', null);
    if (!S.meta) {
      const s = seed(env.SEED_DEMO === 'true');
      db.tx(() => {
        ['buildings', 'technicians', 'jobs', 'alarms', 'vehicles', 'trips', 'assessments', 'documents'].forEach(c => s[c].forEach(o => db.put(c, o)));
        Object.values(s.bms).forEach(b => db.put('bms', b));
      });
      Object.assign(S, { buildings: s.buildings, technicians: s.technicians, jobs: s.jobs, alarms: s.alarms, vehicles: s.vehicles, trips: s.trips, assessments: s.assessments, documents: s.documents, bms: s.bms });
      S.meta = s.meta; db.setKv('meta', S.meta);
      log(`[model] initialised ${env.SEED_DEMO === 'true' ? 'with demo data' : 'empty'}`);
    }
    if (!S.settings) { S.settings = { policy: DEFAULT_POLICY, desk: { phone: env.DESK_PHONE || '', email: env.DESK_EMAIL || '' }, etaMinutes: 25 }; db.setKv('settings', S.settings); }
    S.buildings.forEach(b => { if (!b.ingestToken) { b.ingestToken = rid(18); db.put('buildings', b); } });
    S.jobs.sort((a, b) => (b.steps.logged || '').localeCompare(a.steps.logged || ''));
    S.alarms.sort((a, b) => b.at.localeCompare(a.at));
    S.feed.sort((a, b) => b.at.localeCompare(a.at));
    if (!S.users.length) {
      const email = (env.ADMIN_EMAIL || 'admin@bothelec.local').toLowerCase();
      const pw = env.ADMIN_PASSWORD || rid(9);
      const u = { id: 'U1', name: 'Administrator', email, phone: '', role: 'admin', buildings: [], passwordHash: hashPassword(pw) };
      S.users.push(u); db.put('users', u);
      log(`[model] created admin user ${email}${env.ADMIN_PASSWORD ? '' : ' with password ' + pw + ' (change it after first login)'}`);
    }
  }
  const save = (coll, obj) => db.put(coll, obj);
  const saveMeta = () => db.setKv('meta', S.meta);
  const bmsDirty = new Set();
  const bmsTimer = setInterval(flushBms, 20000); bmsTimer.unref();
  function flushBms() { bmsDirty.forEach(id => S.bms[id] && db.put('bms', S.bms[id])); bmsDirty.clear(); }

  const changed = (building) => bus.emit('state', { building });

  /* ---------------- lookups ---------------- */
  const bld = id => byId(S.buildings, id) || { id, name: id, equipment: [], locations: [] };
  const tech = id => byId(S.technicians, id);
  function contact(role, b, job) {
    switch (role) {
      case 'manager': return { name: b.manager, phone: b.managerPhone, email: b.managerEmail };
      case 'ops': return { name: b.ops, phone: b.opsPhone, email: b.opsEmail };
      case 'desk': return { name: 'Service desk', phone: S.settings.desk.phone, email: S.settings.desk.email };
      case 'tech': { const t = job && tech(job.tech); return t ? { name: t.name, phone: t.phone, email: t.email } : {}; }
      case 'caller': return job ? { name: job.contact, phone: job.contactPhone, email: job.contactEmail } : {};
      default: return {};
    }
  }

  function feed(title, body, kind, link, building) {
    const f = { id: rid(8), at: nowIso(), title, body, kind: kind || '', link: link || '', building: building || null };
    S.feed.unshift(f); save('feed', f);
    if (S.feed.length > 400) S.feed.splice(400).forEach(x => db.del('feed', x.id));
  }

  /* ---------------- message templates ---------------- */
  function emailShell(title, intro, rows, extra = '', link) {
    return `<!doctype html><html><body style="margin:0;background:#f2f5f6;font-family:Segoe UI,Arial,sans-serif;color:#10242a">
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:10px;overflow:hidden">
      <tr><td style="background:#0a1317;padding:16px 22px;color:#b6d433;font-weight:700;letter-spacing:2px">BOTHELEC AIRCON SOLUTIONS</td></tr>
      <tr><td style="padding:22px"><h2 style="margin:0 0 6px;font-size:19px">${escH(title)}</h2><p style="margin:0 0 16px;color:#4a6168">${escH(intro)}</p>
      <table width="100%" cellpadding="6" cellspacing="0" style="font-size:14px;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#6b8288;border-bottom:1px solid #e6ecee;width:38%">${escH(k)}</td><td style="border-bottom:1px solid #e6ecee">${escH(v)}</td></tr>`).join('')}</table>
      ${extra}
      ${link ? `<p style="margin:22px 0 0"><a href="${link}" style="background:#b6d433;color:#0b1a07;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Open in Bothelec Aircon Solutions</a></p>` : ''}
      </td></tr><tr><td style="padding:14px 22px;background:#f7f9fa;color:#8aa0a6;font-size:12px">Automated message from the Bothelec Aircon Solutions platform.</td></tr></table></td></tr></table></body></html>`;
  }
  function jobMessages(job, key, role) {
    const b = bld(job.building), t = tech(job.tech), link = `${publicUrl}/#/service/job/${job.id}`;
    const eta = S.settings.etaMinutes || 25;
    const line = {
      logged: `Call logged (${job.urgency}): ${job.fault}`,
      assigned: role === 'tech' ? `New ${job.urgency} job assigned to you. ${b.name}, ${job.location}. Fault: ${job.fault}` : `Technician ${t ? t.name : ''} assigned`,
      enroute: `Technician ${t ? t.name : ''} is on the way, ETA ${eta} min`,
      onsite: `${t ? t.name : 'Technician'} has arrived on site`,
      completed: `Work completed: ${job.work}`,
      report: `Signed service report is ready`,
    }[key];
    const eq = job.equipment.split(' · ')[0];
    const sms = (role === 'tech' && key === 'assigned' ? `Bothelec Aircon ${job.id}: ${line}. Equipment: ${eq}. ${link}` : `Bothelec Aircon ${job.id}: ${line}. ${b.name} - ${eq}.${key === 'report' ? ' ' + link : ''}`).trim();
    const rows = [['Job', job.id], ['Status', stepLabel(key)], ['Building', b.name], ['Location', job.location], ['Equipment', job.equipment], ['Fault', job.fault], ['Urgency', job.urgency], ['Technician', t ? t.name : 'To be assigned']];
    let extra = '', attachments;
    if (key === 'report' || key === 'completed') {
      extra = `<h3 style="margin:20px 0 6px;font-size:15px">Findings</h3><p style="margin:0">${escH(job.findings)}</p><h3 style="margin:16px 0 6px;font-size:15px">Work completed</h3><p style="margin:0">${escH(job.work)}</p>`;
      if (key === 'report') {
        const sig = job.signature && fileFor(job.signature);
        attachments = [];
        if (sig) { attachments.push({ filename: 'signature.png', path: sig, cid: 'sig' }); extra += `<h3 style="margin:16px 0 6px;font-size:15px">Customer sign-off</h3><img src="cid:sig" width="260" alt="Signature" style="border:1px solid #e6ecee;border-radius:6px"><p style="margin:4px 0 0;color:#6b8288;font-size:13px">Signed by ${escH(job.signedBy)}</p>`; }
        job.photos.forEach((p, i) => { const f = fileFor(p); if (f) attachments.push({ filename: `${job.id}-photo-${i + 1}.jpg`, path: f }); });
        rows.push(['Arrived', fmtTime(job.steps.onsite)], ['Completed', fmtTime(job.steps.completed)]);
      }
    }
    return {
      sms,
      subject: `[Bothelec Aircon] ${job.id} · ${stepLabel(key)} · ${b.name}`,
      text: `${line}\n\n${rows.map(r => r.join(': ')).join('\n')}\n\n${link}`,
      html: emailShell(`${job.id} · ${stepLabel(key)}`, line, rows, extra, link),
      attachments,
    };
  }
  const fmtTime = iso => iso ? new Date(iso).toLocaleString('en-ZA', { timeZone: env.TZ || 'Africa/Johannesburg', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  /* Send per policy; returns delivery-log entries. */
  function dispatch(rule, { b, job, build, meta, urgent }) {
    const out = [];
    if (!rule || !notifier) return out;
    const seen = new Set();
    const roles = { email: rule.email || [], sms: [...(rule.sms || []), ...(urgent ? rule.smsIfUrgent || [] : [])] };
    for (const channel of ['email', 'sms']) {
      for (const role of roles[channel]) {
        const c = contact(role, b, job);
        const to = channel === 'sms' ? c.phone : c.email;
        if (!to || seen.has(channel + to)) continue;
        seen.add(channel + to);
        const msg = build(role);
        const m = notifier.enqueue(channel === 'sms'
          ? { channel, to, text: msg.sms, meta }
          : { channel, to, subject: msg.subject, text: msg.text, html: msg.html, attachments: msg.attachments, meta });
        out.push({ id: m.id, role: ROLE_LABEL[role] || role, channel: channel === 'sms' ? 'SMS' : 'Email', to: m.to || to, at: m.createdAt, status: m.status, error: m.error });
      }
    }
    return out;
  }
  function onOutboxStatus(m) {
    const meta = m.meta || {};
    const upd = list => { const e = (list || []).find(x => x.id === m.id); if (e) { e.status = m.status; e.error = m.error; if (m.sentAt) e.at = m.sentAt; return true; } return false; };
    if (meta.jobId) { const j = byId(S.jobs, meta.jobId); if (j && upd(j.notifications)) { save('jobs', j); changed(j.building); } }
    if (meta.alarmId) { const a = byId(S.alarms, meta.alarmId); if (a && upd(a.notified)) { save('alarms', a); changed(a.building); } }
    if (m.status === 'failed') feed(`${m.channel === 'sms' ? 'SMS' : 'Email'} to ${m.to} failed`, m.error, 'bad', '#/settings', null);
  }

  /* ---------------- jobs ---------------- */
  function setStep(job, key, actor) {
    job.steps[key] = nowIso();
    job.status = key;
    const b = bld(job.building);
    const entries = dispatch(S.settings.policy.jobSteps[key], { b, job, build: role => jobMessages(job, key, role), meta: { jobId: job.id, step: key }, urgent: /High|Critical/.test(job.urgency) });
    job.notifications.push({ id: rid(6), step: key, role: 'Bothelec service desk', channel: 'Live board', at: job.steps[key], status: 'sent' }, ...entries.map(e => ({ ...e, step: key })));
    feed(`${job.id} · ${stepLabel(key)}`, `${b.name} — ${job.equipment}${actor ? ' · by ' + actor.name : ''}`, '', '#/service/job/' + job.id, job.building);
    save('jobs', job);
    onJobStep(job, key);
    bus.emit('job:step', { job, key });
    changed(job.building);
  }
  function newJob(o, actor) {
    const job = Object.assign({ id: 'BA-' + S.meta.seq++, source: 'Client app', urgency: 'Medium', photos: [], findings: '', work: '', signature: null, signedBy: '', notifications: [], steps: {}, createdBy: actor ? actor.id : null }, o);
    saveMeta();
    S.jobs.unshift(job);
    setStep(job, 'logged', actor);
    return job;
  }
  function autoAssign(job, actor, techId) {
    const avail = S.technicians.filter(t => t.status === 'available');
    let t = techId ? tech(techId) : null;
    if (!t) {
      if (!avail.length) return { error: 'No technician available — all are on jobs or off duty.' };
      const hvac = /AHU|CH|chill/i.test(job.equipment);
      t = (hvac && avail.find(x => /Chillers|AHU/.test(x.skill))) || avail[0];
    }
    job.tech = t.id; t.status = 'on job'; t.job = job.id; save('technicians', t);
    const v = byId(S.vehicles, t.vehicle); if (v) { v.status = 'in transit'; v.location = '→ ' + (bld(job.building).area || ''); save('vehicles', v); }
    setStep(job, 'assigned', actor);
    return { ok: true, tech: t };
  }
  function advance(job, actor) {
    const next = STEPS[stepIdx(job.status) + 1];
    if (!next) return { error: 'Job already closed.' };
    if (next.key === 'assigned') return autoAssign(job, actor);
    if (next.key === 'completed' && (!String(job.findings).trim() || !String(job.work).trim())) return { error: 'Record the findings and the work completed first.' };
    if (next.key === 'report') return { error: 'Capture the customer signature to complete the report.' };
    if (next.key === 'onsite') { const t = tech(job.tech), v = t && byId(S.vehicles, t.vehicle); if (v) { v.status = 'on site'; v.location = bld(job.building).area || ''; save('vehicles', v); } }
    setStep(job, next.key, actor);
    return { ok: true };
  }
  function sign(job, signatureDataUrl, name, actor) {
    if (job.status !== 'completed') return { error: 'Work must be completed before sign-off.' };
    const f = saveDataUrl(signatureDataUrl, job.id + '-sig', 'png');
    if (!f) return { error: 'Invalid signature image.' };
    job.signature = f; job.signedBy = String(name || '').slice(0, 80);
    const t = tech(job.tech);
    if (t) { t.status = 'available'; t.job = null; save('technicians', t); const v = byId(S.vehicles, t.vehicle); if (v) { v.status = 'parked'; save('vehicles', v); } }
    setStep(job, 'report', actor);
    return { ok: true };
  }
  function saveDataUrl(dataUrl, prefix, extDefault) {
    const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) return null;
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 6e6) return null;
    const name = `${prefix}-${rid(6)}.${m[1] === 'jpeg' ? 'jpg' : m[1] || extDefault}`;
    fs.writeFileSync(path.join(filesDir, name), buf);
    return '/api/files/' + name;
  }
  function fileFor(url) {
    const name = String(url || '').replace('/api/files/', '');
    if (!/^[\w.-]+$/.test(name)) return null;
    const p = path.join(filesDir, name);
    return fs.existsSync(p) ? p : null;
  }
  function addPhotos(job, list) {
    const added = (list || []).slice(0, 8).map(d => saveDataUrl(d, job.id, 'jpg')).filter(Boolean);
    job.photos.push(...added); save('jobs', job); changed(job.building);
    return added;
  }

  /* ---------------- alarms ---------------- */
  function alarmMessages(a, cleared) {
    const b = bld(a.building), link = `${publicUrl}/#/bms/alarm/${a.id}`;
    const head = cleared ? `Alarm cleared: ${a.equip} - ${a.desc}` : `${a.priority} alarm: ${a.equip} - ${a.desc}`;
    const rows = [['Building', b.name], ['Equipment', a.equip], ['Alarm', a.desc], ['Priority', a.priority], ['Reading', a.reading || '—'], ['Impact', a.impact || '—'], ['Time', fmtTime(cleared ? a.closedAt : a.at)]];
    if (a.jobId) rows.push(['Service call', a.jobId]);
    return {
      sms: `Bothelec Aircon ${head}. ${b.name}.${a.jobId && !cleared ? ' Call ' + a.jobId + ' raised.' : ''} ${link}`,
      subject: `[Bothelec Aircon] ${cleared ? 'CLEARED' : a.priority.toUpperCase()} · ${a.equip} · ${b.name}`,
      text: `${head}\n\n${rows.map(r => r.join(': ')).join('\n')}\n\n${link}`,
      html: emailShell(cleared ? 'Alarm cleared' : `${a.priority} alarm`, head, rows, '', link),
    };
  }
  function respond(a, label, detail) { const e = { at: nowIso(), label, detail }; a.response = a.response || []; a.response.push(e); a.history.push(e); }
  function raiseAlarm(bid, spec) {
    if (spec.key && S.alarms.find(a => a.key === spec.key && a.building === bid && a.status === 'Active')) return null;
    const b = bld(bid);
    const a = { id: 'A' + Date.now().toString(36) + rid(3), building: bid, at: nowIso(), status: 'Active', history: [{ at: nowIso(), label: 'Alarm raised', detail: spec.desc }], response: [], notified: [], ...spec };
    S.alarms.unshift(a);
    if (S.alarms.length > 2000) S.alarms.splice(2000).forEach(x => db.del('alarms', x.id));
    respond(a, 'Fault alert received by Bothelec', 'Unit, reading and time logged');
    a.notified = dispatch(S.settings.policy.alarms[a.priority], { b, build: () => alarmMessages(a, false), meta: { alarmId: a.id } });
    feed(`${a.priority}: ${a.equip} — ${a.desc}`, b.name, a.priority === 'Low' ? '' : 'bad', '#/bms/alarm/' + a.id, bid);
    if (a.priority === 'Critical' && b.autoCall !== false) {
      const eq = (b.equipment || []).find(e => e.split(' · ')[0] === a.equip) || `${a.equip} · BMS`;
      const loc = a.location || (b.locations || []).find(l => a.impactZone && l.includes(a.impactZone.replace(/^L(\d)-/, 'Level $1'))) || (b.locations || [])[0] || 'See alarm';
      const job = newJob({ building: bid, equipment: eq, location: loc, fault: `${a.desc} (BMS alarm)`, urgency: 'Critical', source: 'BMS automatic', alarmId: a.id });
      a.jobId = job.id;
      respond(a, `Call ${job.id} raised automatically`, 'Priority: critical');
      const r = autoAssign(job);
      if (r.ok) respond(a, 'Technician dispatched', `${r.tech.name} · ETA ${S.settings.etaMinutes || 25} min`);
      else respond(a, 'Waiting for technician', r.error);
    }
    if (a.priority === 'Critical' && S.bms[bid] && !S.bms[bid].fault) S.bms[bid].fault = { alarm: a.id };
    save('alarms', a);
    changed(bid);
    bus.emit('alarm:raised', a);
    return a;
  }
  function clearAlarm(a, detail) {
    if (a.status !== 'Active') return;
    a.status = 'Cleared'; a.closedAt = nowIso();
    a.history.push({ at: a.closedAt, label: 'Back to normal', detail }, { at: a.closedAt, label: 'Alarm closed', detail: 'History saved to asset record' });
    if (a.priority === 'Critical' || a.priority === 'High') {
      const sent = dispatch(S.settings.policy.alarmCleared, { b: bld(a.building), build: () => alarmMessages(a, true), meta: { alarmId: a.id } });
      a.notified.push(...sent);
    }
    const bm = S.bms[a.building];
    if (bm && bm.fault && bm.fault.alarm === a.id) bm.fault = null;
    feed(`Alarm closed · ${a.equip}`, detail, '', '#/bms/alarm/' + a.id, a.building);
    save('alarms', a);
    changed(a.building);
  }
  const activeByKey = (bid, key) => S.alarms.find(a => a.building === bid && a.key === key && a.status === 'Active');

  function evaluate(bid) {
    const bm = S.bms[bid]; if (!bm) return;
    const b = bld(bid), [lo, hi] = b.comfort || [20, 24];
    const zonesOut = bm.zones.filter(z => z.temp != null && (z.temp > hi || z.temp < lo));
    for (const coll of ['ahus', 'chillers', 'pumps', 'towers', 'fans', 'fcus']) {
      for (const e of bm[coll] || []) {
        const key = 'equip:' + e.id, tripped = /trip|fault|alarm/i.test(String(e.status));
        const open = activeByKey(bid, key);
        if (tripped && !open) {
          const what = coll === 'ahus' ? 'Supply fan tripped' : `${e.name || e.type || e.id} tripped`;
          raiseAlarm(bid, { key, priority: 'Critical', equip: e.id, desc: what, unit: `${e.id} · ${e.name || e.type || coll}`, reading: `Status = ${String(e.status).toUpperCase()}`, impact: zonesOut.length ? `Zone ${zonesOut.map(z => z.id).join(', ')} out of band` : 'Zone temperatures being monitored', source: 'bms' });
        } else if (!tripped && open && e.status !== 'unknown') clearAlarm(open, `${e.id} ${e.status}`);
      }
    }
    for (const z of bm.zones) {
      const key = 'zone:' + z.id, open = activeByKey(bid, key);
      const out = z.temp != null && (z.temp > hi || z.temp < lo);
      if (out && !open) raiseAlarm(bid, { key, zone: z.id, priority: 'High', equip: 'Zone ' + z.id, desc: `${z.temp} °C (${z.temp > hi ? '>' + hi : '<' + lo} °C)`, reading: `${z.temp} °C`, impact: `Outside comfort band ${lo}–${hi} °C`, source: 'bms' });
      else if (!out && open && z.temp != null) clearAlarm(open, `Zone ${z.id} at ${z.temp} °C`);
      const okey = 'sensor:' + z.id, oopen = activeByKey(bid, okey);
      if (z.online === false && !oopen) raiseAlarm(bid, { key: okey, priority: 'Medium', equip: 'Zone ' + z.id, desc: 'Sensor not reporting', source: 'bms' });
      else if (z.online !== false && oopen) clearAlarm(oopen, 'Sensor reporting again');
    }
  }

  /* ---------------- BMS data ---------------- */
  function applyReadings(bid, values, source) {
    if (!S.buildings.find(b => b.id === bid)) return { error: 'Unknown building' };
    const bm = S.bms[bid] || (S.bms[bid] = Object.assign(emptyBms(), { id: bid }));
    let n = 0;
    for (const [p, v] of Object.entries(values || {})) if (setPath(bm, p, v)) n++;
    bm.updatedAt = nowIso();
    connStatus[bid] = Object.assign(connStatus[bid] || {}, { lastSeen: bm.updatedAt, ok: true, error: null, source: source || connStatus[bid]?.source });
    const lost = activeByKey(bid, 'conn:' + bid);
    if (lost) clearAlarm(lost, 'BMS data received again');
    sampleTrend(bm);
    evaluate(bid);
    bmsDirty.add(bid);
    bus.emit('bms', { building: bid });
    return { ok: true, applied: n };
  }
  function sampleTrend(bm) {
    const last = bm.trend[bm.trend.length - 1];
    if (last && Date.now() - last.t < 2500) return;
    const ch = (bm.chillers || []).find(c => c.status === 'running') || (bm.chillers || [])[0] || {};
    const run = (bm.ahus || []).filter(a => a.status === 'running' && a.supplyTemp != null);
    bm.trend.push({ t: Date.now(), z: Object.fromEntries(bm.zones.filter(z => z.temp != null).map(z => [z.id, z.temp])), chws: ch.chws ?? null, chwr: ch.chwr ?? null, sat: run.length ? +(run.reduce((s, a) => s + a.supplyTemp, 0) / run.length).toFixed(1) : null, hum: bm.humidity, co2: bm.co2 });
    if (bm.trend.length > 120) bm.trend.splice(0, bm.trend.length - 120);
  }
  function setConnStatus(bid, st) {
    connStatus[bid] = Object.assign(connStatus[bid] || {}, st, { at: nowIso() });
    bus.emit('state', { building: bid, admin: true });
  }
  /* Connection watchdog: raise an alarm when a live connector stops delivering data. */
  const wd = setInterval(() => {
    for (const b of S.buildings) {
      const type = (b.connector || {}).type;
      if (!type || type === 'none' || type === 'simulator') continue;
      const st = connStatus[b.id] || {};
      const mins = b.connector.staleMinutes || 10;
      const since = st.lastSeen ? Date.now() - new Date(st.lastSeen) : (Date.now() - (st.startedAt || Date.now()));
      if (since > mins * 60e3) raiseAlarm(b.id, { key: 'conn:' + b.id, priority: 'Medium', equip: 'BMS link', desc: `No data for over ${mins} min`, reading: st.error || 'No data', impact: 'Plant not being monitored', source: 'watchdog' });
    }
  }, 60e3);
  wd.unref();

  /* Inbound SMS from building GSM alarm diallers / modems. */
  function gsmInbound(from, text) {
    const { normalizePhone } = require('./util');
    const num = normalizePhone(from);
    const b = S.buildings.find(x => ((x.gsm || {}).numbers || []).map(n => normalizePhone(n)).includes(num));
    if (!b) { feed(`SMS from unknown number ${from}`, text, '', '', null); changed(null); return { ok: true, matched: false }; }
    const rules = (b.gsm || {}).rules || [];
    const rule = rules.find(r => { try { return new RegExp(r.match, 'i').test(text); } catch { return false; } });
    if (rule && rule.set) { applyReadings(b.id, rule.set, 'gsm'); return { ok: true, matched: true, rule: rule.match }; }
    const isClear = rule ? !!rule.clear : /\b(clear(ed)?|normal|restored|reset|ok)\b/i.test(text);
    const equip = (rule && rule.equip) || 'GSM alarm';
    if (isClear) {
      S.alarms.filter(a => a.building === b.id && a.source === 'gsm' && a.status === 'Active' && (!rule || !rule.equip || a.equip === rule.equip)).forEach(a => clearAlarm(a, 'SMS: ' + text));
      return { ok: true, matched: true, cleared: true };
    }
    const priority = (rule && rule.priority) || (/trip|fail|fault|alarm|fire|flood/i.test(text) ? 'High' : 'Medium');
    const a = raiseAlarm(b.id, { key: 'gsm:' + equip + ':' + (rule ? rule.match : text.slice(0, 40)), priority, equip, desc: (rule && rule.desc) || text.slice(0, 140), reading: 'SMS: ' + text.slice(0, 160), impact: (rule && rule.impact) || '', source: 'gsm' });
    return { ok: true, matched: true, alarm: a && a.id };
  }

  /* ---------------- simulator hooks ---------------- */
  function onJobStep(job, key) {
    const a = S.alarms.find(x => x.jobId === job.id);
    if (!a) return;
    const lbl = { enroute: ['Technician on the way', `ETA ${S.settings.etaMinutes || 25} min`], onsite: ['Arrived on site', 'Checked in via app'], completed: ['Fault repaired', job.work || 'Recorded on job card'] }[key];
    if (lbl) { a.history.push({ at: nowIso(), label: lbl[0], detail: lbl[1] }); save('alarms', a); }
  }

  /* ---------------- views ---------------- */
  function publicUser(u) { const { passwordHash, ...rest } = u; return rest; }
  function stateFor(u) {
    const staff = isStaff(u);
    const bOk = b => canBuilding(u, b);
    const buildings = S.buildings.filter(b => bOk(b.id)).map(b => {
      if (u.role === 'admin') return b;
      const { ingestToken, connector, gsm, ...rest } = b; return { ...rest, connector: { type: (connector || {}).type || 'none' } };
    });
    const jobs = S.jobs.filter(j => canJob(u, j));
    const technicians = u.role === 'client' ? S.technicians.map(t => ({ id: t.id, name: t.name, status: t.status })) : S.technicians;
    return {
      me: publicUser(u),
      steps: STEPS,
      seq: S.meta.seq,
      buildings,
      technicians,
      jobs,
      alarms: S.alarms.filter(a => bOk(a.building)).slice(0, 300),
      feed: S.feed.filter(f => (f.building ? bOk(f.building) : staff)).slice(0, 150),
      vehicles: u.role === 'client' ? [] : S.vehicles,
      trips: u.role === 'client' ? [] : S.trips,
      assessments: S.assessments.filter(a => bOk(a.building)),
      documents: S.documents,
      bmsSummary: Object.fromEntries(buildings.map(b => [b.id, S.bms[b.id] ? { fault: S.bms[b.id].fault, updatedAt: S.bms[b.id].updatedAt, hasData: true } : { hasData: false }])),
      admin: u.role === 'admin' ? { users: S.users.map(publicUser), settings: S.settings, connectors: connStatus, notifier: notifier && notifier.status() } : undefined,
    };
  }

  /* ---------------- admin ---------------- */
  function upsertUser(data) {
    let u = data.id && byId(S.users, data.id);
    const email = String(data.email || '').trim().toLowerCase();
    if (!email) return { error: 'Email is required.' };
    if (S.users.find(x => x.email === email && x !== u)) return { error: 'A user with that email already exists.' };
    if (!u) {
      if (!data.password || String(data.password).length < 8) return { error: 'Password must be at least 8 characters.' };
      u = { id: 'U' + Date.now().toString(36) }; S.users.push(u);
    }
    Object.assign(u, { name: String(data.name || email), email, phone: data.phone || '', role: ['admin', 'desk', 'tech', 'client'].includes(data.role) ? data.role : 'client', buildings: Array.isArray(data.buildings) ? data.buildings : [] });
    if (data.password) { if (String(data.password).length < 8) return { error: 'Password must be at least 8 characters.' }; u.passwordHash = hashPassword(data.password); db.session.delUser(u.id); }
    if (u.role === 'tech' && !u.techId) {
      const t = { id: 'T' + Date.now().toString(36), name: u.name, skill: data.skill || 'HVAC technician', phone: u.phone, email: u.email, status: 'available', vehicle: null };
      S.technicians.push(t); save('technicians', t); u.techId = t.id;
    }
    if (u.techId) { const t = tech(u.techId); if (t) { t.name = u.name; t.phone = u.phone; t.email = u.email; save('technicians', t); } }
    save('users', u); changed(null);
    return { ok: true, user: publicUser(u) };
  }
  function deleteUser(id, actor) {
    if (id === actor.id) return { error: 'You cannot delete your own account.' };
    const i = S.users.findIndex(x => x.id === id); if (i < 0) return { error: 'Not found' };
    S.users.splice(i, 1); db.del('users', id); db.session.delUser(id); changed(null);
    return { ok: true };
  }
  function upsertBuilding(data) {
    if (!data.name) return { error: 'Name is required.' };
    let b = data.id && byId(S.buildings, data.id);
    if (!b) { b = { id: 'B' + Date.now().toString(36), ingestToken: rid(18), equipment: ['Other / not sure'], locations: ['Plant room'], autoCall: true, comfort: [20, 24], connector: { type: 'none' } }; S.buildings.push(b); }
    const allowed = ['name', 'client', 'area', 'manager', 'managerPhone', 'managerEmail', 'ops', 'opsPhone', 'opsEmail', 'equipment', 'locations', 'autoCall', 'comfort', 'connector', 'gsm'];
    allowed.forEach(k => { if (data[k] !== undefined) b[k] = data[k]; });
    if (data.regenToken) b.ingestToken = rid(18);
    save('buildings', b); changed(b.id);
    bus.emit('building:changed', b);
    return { ok: true, building: b };
  }
  function deleteBuilding(id) {
    const i = S.buildings.findIndex(x => x.id === id); if (i < 0) return { error: 'Not found' };
    const [b] = S.buildings.splice(i, 1); db.del('buildings', id); delete S.bms[id]; db.del('bms', id);
    bus.emit('building:changed', { id, deleted: true, connector: { type: 'none' } }); changed(null);
    return { ok: true, building: b };
  }
  function updateSettings(data) {
    if (data.policy) S.settings.policy = data.policy;
    if (data.desk) S.settings.desk = { phone: data.desk.phone || '', email: data.desk.email || '' };
    if (data.etaMinutes) S.settings.etaMinutes = +data.etaMinutes || 25;
    db.setKv('settings', S.settings); changed(null);
    return { ok: true, settings: S.settings };
  }

  load();
  return {
    S, STEPS, stepLabel, bld, tech, feed, save, changed, saveMeta, flushBms,
    setNotifier: n => { notifier = n; }, onOutboxStatus,
    newJob, setStep, advance, autoAssign, sign, addPhotos, fileFor, saveDataUrl,
    raiseAlarm, clearAlarm, evaluate, applyReadings, setConnStatus, connStatus, gsmInbound,
    stateFor, upsertUser, deleteUser, upsertBuilding, deleteBuilding, updateSettings,
    stop() { clearInterval(bmsTimer); clearInterval(wd); flushBms(); },
  };
}

module.exports = { createModel };
