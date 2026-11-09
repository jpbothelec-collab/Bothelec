'use strict';
/* Business logic: jobs, alarms, automated response and notifications. The server is the single
 * source of truth; browsers receive filtered state over the API and live updates over SSE. */
const fs = require('node:fs');
const path = require('node:path');
const { nowIso, rid, byId, log, setPath, emptyBms, COLLECTIONS, normalizePhone, clamp } = require('./util');
const { seed, STEPS, DEFAULT_POLICY, DEFAULT_BILLING } = require('./seed');
const { hashPassword, isStaff, canBuilding, canJob } = require('./auth');

const COLLS = ['buildings', 'technicians', 'jobs', 'services', 'tracker', 'feed', 'alarms', 'vehicles', 'trips', 'assessments', 'documents', 'users'];
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
        ['buildings', 'technicians', 'jobs', 'services', 'tracker', 'alarms', 'vehicles', 'trips', 'assessments', 'documents'].forEach(c => s[c].forEach(o => db.put(c, o)));
        Object.values(s.bms).forEach(b => db.put('bms', b));
      });
      Object.assign(S, { buildings: s.buildings, technicians: s.technicians, jobs: s.jobs, services: s.services, tracker: s.tracker, alarms: s.alarms, vehicles: s.vehicles, trips: s.trips, assessments: s.assessments, documents: s.documents, bms: s.bms });
      S.meta = s.meta; db.setKv('meta', S.meta);
      log(`[model] initialised ${env.SEED_DEMO === 'true' ? 'with demo data' : 'empty'}`);
    }
    if (!S.settings) { S.settings = { policy: DEFAULT_POLICY, desk: { phone: env.DESK_PHONE || '', email: env.DESK_EMAIL || '' }, etaMinutes: 25 }; db.setKv('settings', S.settings); }
    if (!S.settings.billing) { S.settings.billing = DEFAULT_BILLING(); db.setKv('settings', S.settings); }
    if (!S.settings.billing.trackerV1) { Object.assign(S.settings.billing, { autoInvoice: false, termsDays: S.settings.billing.termsDays || 30, trackerV1: true }); db.setKv('settings', S.settings); }
    S.zohoq = db.all('zohoq').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    S.buildings.forEach(b => { if (!b.ingestToken) { b.ingestToken = rid(18); db.put('buildings', b); } migrateBuilding(b); });
    S.services.sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
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
  /* Everyone in a notification role for this building (a building can have several managers). */
  function contactsFor(role, b, job) {
    const byRole = r => (b.contacts || []).filter(c => c.role === r && c.notify !== false);
    switch (role) {
      case 'manager': return byRole('Building Manager');
      case 'ops': return byRole('Operations Manager');
      case 'desk': return [{ name: '', phone: S.settings.desk.phone, email: S.settings.desk.email }];
      case 'tech': { const t = job && tech(job.tech); return t ? [{ name: t.name, phone: t.phone, email: t.email }] : []; }
      case 'caller': return job ? [{ name: job.contact, phone: job.contactPhone, email: job.contactEmail }] : [];
      default: return [];
    }
  }
  const str = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);

  /* ---------------- buildings: contacts & equipment register ---------------- */
  const CONTACT_ROLES = ['Building Manager', 'Operations Manager', 'Other'];
  const unitLabel = u => `${u.id} · ${u.type || 'Unit'}`;
  function syncEquipment(b) { b.equipment = [...(b.units || []).filter(u => !u.removed).map(unitLabel), 'Other / not sure']; }
  /* Older data had one manager/ops per building and equipment as plain text. */
  function migrateBuilding(b) {
    let dirty = false;
    if (!Array.isArray(b.contacts)) {
      b.contacts = [];
      if (b.manager || b.managerPhone || b.managerEmail) b.contacts.push({ id: rid(5), name: b.manager || '', role: 'Building Manager', phone: b.managerPhone || '', email: b.managerEmail || '', notify: true });
      if (b.ops || b.opsPhone || b.opsEmail) b.contacts.push({ id: rid(5), name: b.ops || '', role: 'Operations Manager', phone: b.opsPhone || '', email: b.opsEmail || '', notify: true });
      ['manager', 'managerPhone', 'managerEmail', 'ops', 'opsPhone', 'opsEmail'].forEach(k => delete b[k]);
      dirty = true;
    }
    if (!Array.isArray(b.units)) {
      b.units = (b.equipment || []).filter(e => !/^Other/i.test(e)).map(e => {
        const [id, ...rest] = String(e).split(' · ');
        return { id: id.trim(), type: rest.join(' · ').trim() || 'Unit', location: '', make: '', model: '', serial: '', installed: '', refrigerant: '', capacity: '', intervalMonths: 3, notes: '', removed: false };
      });
      dirty = true;
    }
    const before = JSON.stringify(b.equipment); syncEquipment(b);
    if (dirty || JSON.stringify(b.equipment) !== before) save('buildings', b);
  }
  function setContacts(bid, list) {
    const b = byId(S.buildings, bid); if (!b) return { error: 'Building not found.' };
    if (!Array.isArray(list)) return { error: 'Contacts must be a list.' };
    const out = list.map(c => ({ id: str(c.id, 20) || rid(5), name: str(c.name, 80), role: CONTACT_ROLES.includes(c.role) ? c.role : 'Other', phone: str(c.phone, 30), email: str(c.email, 120).toLowerCase(), notify: c.notify !== false })).filter(c => c.name || c.phone || c.email);
    for (const c of out) {
      if (!c.name) return { error: 'Every contact needs a name.' };
      if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) return { error: `The email for ${c.name} looks wrong.` };
      if (c.phone && !normalizePhone(c.phone)) return { error: `The mobile number for ${c.name} looks wrong.` };
    }
    b.contacts = out; save('buildings', b); changed(bid);
    if (b.zoho && b.zoho.contactId) zEnqueue('contact', bid);
    return { ok: true, contacts: out };
  }
  function upsertUnit(bid, data, originalId) {
    const b = byId(S.buildings, bid); if (!b) return { error: 'Building not found.' };
    b.units = b.units || [];
    const id = str(data.id, 40);
    if (!id) return { error: 'Unit ID is required (for example AHU-04).' };
    if (/[\/·#?]/.test(id)) return { error: 'Unit ID cannot contain / · # or ?' };
    let u = originalId ? b.units.find(x => x.id === originalId) : null;
    if (originalId && !u) return { error: 'Unit not found.' };
    if (b.units.find(x => x.id === id && x !== u)) return { error: `${id} already exists in this building.` };
    if (!u) { u = { id, removed: false }; b.units.push(u); }
    else if (u.id !== id) {
      S.jobs.filter(j => j.building === bid && j.unit === u.id).forEach(j => { j.unit = id; save('jobs', j); });
      S.services.filter(x => x.building === bid && x.unit === u.id).forEach(x => { x.unit = id; save('services', x); });
    }
    Object.assign(u, { id, type: str(data.type, 60) || 'Unit', location: str(data.location, 80), make: str(data.make, 60), model: str(data.model, 60), serial: str(data.serial, 60),
      installed: /^\d{4}-\d{2}-\d{2}$/.test(data.installed || '') ? data.installed : '', refrigerant: str(data.refrigerant, 20), capacity: str(data.capacity, 30),
      intervalMonths: clamp(Math.round(+data.intervalMonths || 0), 0, 60), notes: str(data.notes, 1000) });
    syncEquipment(b); save('buildings', b); changed(bid);
    return { ok: true, unit: u };
  }
  function setUnitRemoved(bid, uid, removed) {
    const b = byId(S.buildings, bid), u = b && (b.units || []).find(x => x.id === uid);
    if (!u) return { error: 'Unit not found.' };
    u.removed = !!removed; u.removedAt = removed ? nowIso() : undefined;
    syncEquipment(b); save('buildings', b); changed(bid);
    return { ok: true };
  }
  const SERVICE_TYPES = ['Planned maintenance', 'Repair', 'Inspection', 'Filter change', 'Refrigerant top-up', 'Other'];
  function addService(data, actor) {
    const b = byId(S.buildings, data.building); if (!b) return { error: 'Building not found.' };
    const u = (b.units || []).find(x => x.id === data.unit); if (!u) return { error: 'Unit not found.' };
    if (!str(data.work)) return { error: 'Describe the work that was done.' };
    const date = /^\d{4}-\d{2}-\d{2}$/.test(data.date || '') ? data.date : nowIso().slice(0, 10);
    if (date > nowIso().slice(0, 10)) return { error: 'The service date cannot be in the future.' };
    const t = tech(data.tech) || tech(actor.techId);
    const rec = { id: 'SV' + Date.now().toString(36) + rid(2), building: b.id, unit: u.id, date, type: SERVICE_TYPES.includes(data.type) ? data.type : 'Other', tech: t ? t.id : null, techName: t ? t.name : '', work: str(data.work, 2000), notes: str(data.notes, 2000), by: actor.name, at: nowIso() };
    if (data.billing && Array.isArray(data.billing.lines)) { const r = cleanLines(data.billing.lines); if (r.error) return r; if (r.lines.length) rec.billing = { lines: r.lines, notes: '', updatedBy: actor.name, updatedAt: nowIso() }; }
    if (rec.billing) ensureTracker('service', rec);
    S.services.unshift(rec); S.services.sort((a, c) => (c.date + c.at).localeCompare(a.date + a.at));
    save('services', rec);
    feed(`${u.id} · ${rec.type} logged`, `${b.name} — ${rec.work.slice(0, 90)}`, '', `#/service/unit/${b.id}/${encodeURIComponent(u.id)}`, b.id);
    changed(b.id);
    return { ok: true, service: rec };
  }
  function deleteService(id) {
    const i = S.services.findIndex(x => x.id === id); if (i < 0) return { error: 'Not found.' };
    const [rec] = S.services.splice(i, 1); db.del('services', id); changed(rec.building);
    return { ok: true };
  }

  /* ---------------- technicians ---------------- */
  function upsertTech(data) {
    const name = str(data.name, 80); if (!name) return { error: 'Name is required.' };
    if (data.phone && !normalizePhone(data.phone)) return { error: 'The mobile number looks wrong.' };
    if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(data.email).trim())) return { error: 'The email looks wrong.' };
    let t = data.id ? tech(data.id) : null;
    if (data.id && !t) return { error: 'Technician not found.' };
    if (!t) { t = { id: 'T' + Date.now().toString(36), status: 'available', job: null }; S.technicians.push(t); }
    const vehicle = data.vehicle && byId(S.vehicles, data.vehicle) ? data.vehicle : null;
    if (t.vehicle && t.vehicle !== vehicle) { const old = byId(S.vehicles, t.vehicle); if (old && old.driver === t.id) { old.driver = null; save('vehicles', old); } }
    Object.assign(t, { name, skill: str(data.skill, 80) || 'HVAC technician', phone: str(data.phone, 30), email: str(data.email, 120).toLowerCase(), vehicle });
    if (vehicle) { const v = byId(S.vehicles, vehicle); S.technicians.filter(x => x !== t && x.vehicle === vehicle).forEach(x => { x.vehicle = null; save('technicians', x); }); v.driver = t.id; save('vehicles', v); }
    if (['available', 'off'].includes(data.status) && t.status !== 'on job') t.status = data.status;
    const u = S.users.find(x => x.techId === t.id); if (u) { u.name = t.name; u.phone = t.phone; save('users', u); }
    save('technicians', t); changed(null);
    return { ok: true, tech: t };
  }
  function deleteTech(id) {
    const i = S.technicians.findIndex(x => x.id === id); if (i < 0) return { error: 'Technician not found.' };
    const t = S.technicians[i];
    const open = S.jobs.find(j => j.tech === id && j.status !== 'report');
    if (open) return { error: `${t.name} still has open job ${open.id}. Reassign it first.` };
    S.technicians.splice(i, 1); db.del('technicians', id);
    S.vehicles.filter(v => v.driver === id).forEach(v => { v.driver = null; save('vehicles', v); });
    S.users.filter(u => u.techId === id).forEach(u => { delete u.techId; save('users', u); });
    changed(null);
    return { ok: true };
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
        const bl = (job.billing && job.billing.lines) || [];
        if (bl.length) {
          const t = totals(bl), cur = S.settings.billing.currency, fm = n => cur + ' ' + n.toFixed(2);
          extra += `<h3 style="margin:16px 0 6px;font-size:15px">Parts & labour</h3><table width="100%" cellpadding="5" cellspacing="0" style="font-size:13px;border-collapse:collapse">${bl.map(l => `<tr><td style="border-bottom:1px solid #e6ecee">${escH(l.description)}</td><td align="right" style="border-bottom:1px solid #e6ecee">${l.qty} × ${fm(l.unitPrice)}</td><td align="right" style="border-bottom:1px solid #e6ecee">${fm(l.qty * l.unitPrice)}</td></tr>`).join('')}<tr><td colspan="2" align="right">Subtotal</td><td align="right">${fm(t.subtotal)}</td></tr><tr><td colspan="2" align="right">VAT ${S.settings.billing.vatRate}%</td><td align="right">${fm(t.vat)}</td></tr><tr><td colspan="2" align="right"><b>Total</b></td><td align="right"><b>${fm(t.total)}</b></td></tr></table>`;
        }
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
      for (const role of roles[channel]) for (const c of contactsFor(role, b, job)) {
        const to = channel === 'sms' ? c.phone : c.email;
        if (!to || seen.has(channel + to)) continue;
        seen.add(channel + to);
        const msg = build(role);
        const m = notifier.enqueue(channel === 'sms'
          ? { channel, to, text: msg.sms, meta }
          : { channel, to, subject: msg.subject, text: msg.text, html: msg.html, attachments: msg.attachments, meta });
        out.push({ id: m.id, role: (ROLE_LABEL[role] || role) + (c.name && role !== 'tech' ? ' · ' + c.name : ''), channel: channel === 'sms' ? 'SMS' : 'Email', to: m.to || to, at: m.createdAt, status: m.status, error: m.error });
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
    if (key === 'report' && S.settings.billing.autoInvoice && job.billing && job.billing.lines && job.billing.lines.length) zEnqueue('invoice', 'job:' + job.id);
    bus.emit('job:step', { job, key });
    changed(job.building);
  }
  function newJob(o, actor) {
    const job = Object.assign({ id: 'BA-' + S.meta.seq++, source: 'Client app', urgency: 'Medium', photos: [], findings: '', work: '', signature: null, signedBy: '', notifications: [], steps: {}, createdBy: actor ? actor.id : null }, o);
    const bu = (bld(job.building).units || []).find(u => u.id === String(job.equipment || '').split(' · ')[0]);
    if (bu && !job.unit) job.unit = bu.id;
    saveMeta();
    S.jobs.unshift(job);
    ensureTracker('job', job);
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
    if (job.tech && job.tech !== t.id) { const old = tech(job.tech); if (old && old.job === job.id) { old.status = 'available'; old.job = null; save('technicians', old); } }
    const reassign = job.status !== 'logged';
    job.tech = t.id; job.techName = t.name; t.status = 'on job'; t.job = job.id; save('technicians', t);
    if (reassign) {
      const entries = dispatch({ sms: ['tech'], email: [] }, { b: bld(job.building), job, build: role => jobMessages(job, 'assigned', role), meta: { jobId: job.id, step: 'assigned' } });
      job.notifications.push(...entries.map(e => ({ ...e, step: 'assigned' })));
      feed(`${job.id} · Reassigned to ${t.name}`, bld(job.building).name, '', '#/service/job/' + job.id, job.building);
      save('jobs', job); changed(job.building);
      return { ok: true, tech: t };
    }
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
    if (u.role === 'tech') return techState(u, buildings, jobs);
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
      services: S.services.filter(x => bOk(x.building)),
      tracker: staff ? S.tracker : [],
      assessments: S.assessments.filter(a => bOk(a.building)),
      documents: S.documents,
      bmsSummary: Object.fromEntries(buildings.map(b => [b.id, S.bms[b.id] ? { fault: S.bms[b.id].fault, updatedAt: S.bms[b.id].updatedAt, hasData: true } : { hasData: false }])),
      admin: u.role === 'admin' ? { users: S.users.map(publicUser), settings: S.settings, connectors: connStatus, notifier: notifier && notifier.status(), zoho: zStatus() } : undefined,
      billing: { vatRate: S.settings.billing.vatRate, pricesIncludeVat: S.settings.billing.pricesIncludeVat, currency: S.settings.billing.currency, catalogue: u.role === 'client' ? [] : S.settings.billing.catalogue, zoho: !!(zoho && zoho.configured), autoInvoice: S.settings.billing.autoInvoice, termsDays: S.settings.billing.termsDays ?? 30 },
    };
  }

  /* A technician only gets their own work: their jobs, their trips, their vehicle and assessments,
   * activity about their jobs, and the equipment registers needed to log services. No monitoring, billing or other staff. */
  function techState(u, buildings, jobs) {
    const me = tech(u.techId) || null;
    const myJobIds = new Set(jobs.map(j => j.id));
    const mine = f => /#\/service\/job\/(BA-\d+|TR-\d+)/.test(f.link || '') ? myJobIds.has(f.link.split('/').pop()) : false;
    return {
      me: publicUser(u), steps: STEPS, seq: S.meta.seq,
      buildings: buildings.map(b => ({ ...b, connector: { type: 'none' } })),
      technicians: me ? [me] : [],
      jobs,
      alarms: S.alarms.filter(a => a.jobId && myJobIds.has(a.jobId)),
      feed: S.feed.filter(mine).slice(0, 100),
      vehicles: me && me.vehicle ? S.vehicles.filter(v => v.id === me.vehicle) : [],
      trips: me ? S.trips.filter(t => t.driver === me.id) : [],
      services: S.services,
      tracker: [],
      assessments: me ? S.assessments.filter(a => a.by === me.id) : [],
      documents: [],
      bmsSummary: {},
      billing: { vatRate: S.settings.billing.vatRate, pricesIncludeVat: S.settings.billing.pricesIncludeVat, currency: S.settings.billing.currency, catalogue: S.settings.billing.catalogue, zoho: false, autoInvoice: false, termsDays: 30 },
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
    if (u.role !== 'tech') delete u.techId;
    else if (data.techId && data.techId !== 'new' && tech(data.techId)) {
      const other = S.users.find(x => x !== u && x.techId === data.techId);
      if (other) return { error: `That technician is already linked to ${other.email}.` };
      u.techId = data.techId;
    } else if (!u.techId || data.techId === 'new') {
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
    if (!b) { b = { id: 'B' + Date.now().toString(36), ingestToken: rid(18), contacts: [], units: [], equipment: ['Other / not sure'], locations: ['Plant room'], autoCall: true, comfort: [20, 24], connector: { type: 'none' } }; S.buildings.push(b); }
    const allowed = ['name', 'client', 'area', 'portal', 'locations', 'autoCall', 'comfort', 'connector', 'gsm'];
    allowed.forEach(k => { if (data[k] !== undefined) b[k] = data[k]; });
    if (Array.isArray(data.contacts)) { const r = setContacts(b.id, data.contacts); if (r.error) return r; }
    syncEquipment(b);
    if (data.regenToken) b.ingestToken = rid(18);
    if (b.zoho && b.zoho.contactId) zEnqueue('contact', b.id);
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
  /* ---------------- billing: parts & labour ---------------- */
  const LINE_KINDS = ['Call-out', 'Labour', 'Part', 'Other'];
  const money = n => Math.round(n * 100) / 100;
  function cleanLines(lines) {
    if (!Array.isArray(lines)) return { error: 'Lines must be a list.' };
    const out = [];
    for (const l of lines.slice(0, 60)) {
      const description = str(l.description, 160); if (!description) continue;
      const qty = +l.qty, unitPrice = +l.unitPrice;
      if (!(qty > 0) || qty > 100000) return { error: `Quantity for "${description}" must be more than 0.` };
      if (!(unitPrice >= 0) || unitPrice > 1e7) return { error: `Price for "${description}" is not valid.` };
      out.push({ id: str(l.id, 20) || rid(5), kind: LINE_KINDS.includes(l.kind) ? l.kind : 'Other', code: str(l.code, 30), description, qty: Math.round(qty * 100) / 100, unitPrice: money(unitPrice) });
    }
    return { lines: out };
  }
  function totals(lines) {
    const B = S.settings.billing, sum = money((lines || []).reduce((a, l) => a + l.qty * l.unitPrice, 0));
    const vat = B.pricesIncludeVat ? money(sum - sum / (1 + B.vatRate / 100)) : money(sum * B.vatRate / 100);
    return B.pricesIncludeVat ? { subtotal: money(sum - vat), vat, total: sum } : { subtotal: sum, vat, total: money(sum + vat) };
  }
  function setBilling(target, data, actor, coll) {
    if (target.invoice && target.invoice.id) return { error: `Already invoiced (${target.invoice.number || target.invoice.id}). Change it in Zoho Books.` };
    const r = cleanLines(data.lines); if (r.error) return r;
    target.billing = { lines: r.lines, notes: str(data.notes, 1000), updatedBy: actor.name, updatedAt: nowIso() };
    if (coll === 'services' && r.lines.length) ensureTracker('service', target);
    save(coll, target); changed(target.building);
    return { ok: true, billing: target.billing, totals: totals(r.lines) };
  }
  function setJobBilling(job, data, actor) {
    if (!isStaff(actor) && !['onsite', 'completed'].includes(job.status)) return { error: 'Parts & labour can be recorded while on site.' };
    return setBilling(job, data, actor, 'jobs');
  }
  function setServiceBilling(id, data, actor) {
    const rec = byId(S.services, id); if (!rec) return { error: 'Service record not found.' };
    return setBilling(rec, data, actor, 'services');
  }

  /* ---------------- billing tracker (PO → job card → invoice → portal → paid) ---------------- */
  const PO_STATUS = ['None', 'Pending', 'Approved', 'Not approved'];
  const isoDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
  function trackerFor(kind, id) { return S.tracker.find(t => (kind === 'job' ? t.jobId : t.serviceId) === id); }
  function ensureTracker(kind, rec) {
    if (trackerFor(kind, rec.id)) return;
    const t = { id: 'TK' + Date.now().toString(36) + rid(3), building: rec.building, jobId: kind === 'job' ? rec.id : null, serviceId: kind === 'service' ? rec.id : null,
      poNumber: '', poDate: '', poStatus: 'None', critical: kind === 'job' && rec.urgency === 'Critical', approvedAt: null, approvedBy: '', invoice: null, amountEx: null, amountIncl: null,
      portalDate: '', paidDate: '', void: false, notes: '', description: '', createdAt: nowIso() };
    if (rec.invoice && rec.invoice.number) t.invoice = { number: rec.invoice.number, date: (rec.invoice.at || '').slice(0, 10), source: rec.invoice.provider || 'zoho' };
    S.tracker.unshift(t); save('tracker', t);
  }
  function addTrackerRow(data, actor) {
    const b = byId(S.buildings, data.building); if (!b) return { error: 'Choose a client building.' };
    const t = { id: 'TK' + Date.now().toString(36) + rid(3), building: b.id, jobId: null, serviceId: null, poNumber: '', poDate: '', poStatus: 'Pending', critical: false, approvedAt: null, approvedBy: '', invoice: null, amountEx: null, amountIncl: null, portalDate: '', paidDate: '', void: false, notes: '', description: '', createdAt: nowIso(), createdBy: actor.name };
    S.tracker.unshift(t);
    const r = updateTracker(t.id, data, actor);
    if (r.error) { S.tracker.shift(); return r; }
    return { ok: true, row: t };
  }
  function updateTracker(id, d, actor) {
    const t = byId(S.tracker, id); if (!t) return { error: 'Row not found.' };
    if (d.poNumber !== undefined) t.poNumber = str(d.poNumber, 40);
    if (d.poDate !== undefined) t.poDate = isoDate(d.poDate);
    if (d.poStatus !== undefined) t.poStatus = PO_STATUS.includes(d.poStatus) ? d.poStatus : 'None';
    if (d.critical !== undefined) t.critical = !!d.critical;
    if (d.portalDate !== undefined) t.portalDate = isoDate(d.portalDate);
    if (d.paidDate !== undefined) t.paidDate = isoDate(d.paidDate);
    if (d.void !== undefined) t.void = !!d.void;
    if (d.notes !== undefined) t.notes = str(d.notes, 1000);
    if (d.description !== undefined && !t.jobId && !t.serviceId) t.description = str(d.description, 200);
    if (d.amountEx !== undefined && !t.jobId && !t.serviceId) {
      const v = d.amountEx === '' || d.amountEx === null ? null : +d.amountEx;
      if (v !== null && !(v >= 0 && v < 1e9)) return { error: 'Amount is not valid.' };
      t.amountEx = v === null ? null : money(v);
      t.amountIncl = v === null ? null : money(v * (1 + S.settings.billing.vatRate / 100));
    }
    if (d.invoiceNumber !== undefined && !(t.invoice && t.invoice.source === 'zoho')) {
      const num = str(d.invoiceNumber, 40);
      if (num) {
        const rec = t.jobId ? byId(S.jobs, t.jobId) : t.serviceId ? byId(S.services, t.serviceId) : null;
        const tt = rec && rec.billing && rec.billing.lines && rec.billing.lines.length ? totals(rec.billing.lines) : null;
        t.invoice = { number: num, date: isoDate(d.invoiceDate) || nowIso().slice(0, 10), source: 'manual' };
        if (tt && t.amountEx === null) { t.amountEx = tt.subtotal; t.amountIncl = tt.total; }
        if (!t.approvedAt) { t.approvedAt = nowIso(); t.approvedBy = actor.name; }
      } else t.invoice = null;
    } else if (d.invoiceDate !== undefined && t.invoice && t.invoice.source === 'manual') t.invoice.date = isoDate(d.invoiceDate) || t.invoice.date;
    t.updatedAt = nowIso(); t.updatedBy = actor.name;
    save('tracker', t); changed(t.building);
    return { ok: true, row: t };
  }
  /* Import rows from the old spreadsheet (parsed in the browser, re-checked here). */
  function importTracker(bid, rows, actor) {
    const b = byId(S.buildings, bid); if (!b) return { error: 'Choose the client building to import into.' };
    if (!Array.isArray(rows) || !rows.length) return { error: 'No rows to import.' };
    if (rows.length > 3000) return { error: 'Import at most 3000 rows at a time.' };
    const out = { imported: 0, skipped: [] };
    const num = v => (v === null || v === undefined || v === '' || isNaN(+v) ? null : money(+v));
    for (const [i, r] of rows.entries()) {
      const line = r.line || i + 1;
      const po = str(r.poNumber, 40), inv = str(r.invoiceNumber, 40), job = str(r.jobRef, 40);
      const ex = num(r.amountEx), incl = num(r.amountIncl);
      if (!po && !inv && !job && !PO_STATUS.slice(1).includes(r.poStatus)) { out.skipped.push({ line, reason: ex === null && incl === null ? 'empty row' : 'totals row' }); continue; }
      const dup = S.tracker.find(t => (inv && t.invoice && t.invoice.number === inv) || (!inv && po && t.poNumber === po && !t.invoice && t.building === b.id && (t.legacyJob || '') === job));
      if (dup) { out.skipped.push({ line, reason: 'already in the tracker' + (inv ? ' (' + inv + ')' : po ? ' (PO ' + po + ')' : '') }); continue; }
      const vatF = 1 + S.settings.billing.vatRate / 100;
      const t = { id: 'TK' + Date.now().toString(36) + rid(4), building: b.id, jobId: null, serviceId: null,
        poNumber: po, poDate: isoDate(r.poDate), poStatus: PO_STATUS.includes(r.poStatus) ? r.poStatus : (po ? 'Approved' : 'None'), critical: !!r.critical,
        approvedAt: inv ? nowIso() : null, approvedBy: inv ? actor.name : '', invoice: inv ? { number: inv, date: isoDate(r.invoiceDate), source: 'import' } : null,
        amountEx: ex !== null ? ex : incl !== null ? money(incl / vatF) : null, amountIncl: incl !== null ? incl : ex !== null ? money(ex * vatF) : null,
        portalDate: isoDate(r.portalDate), paidDate: isoDate(r.paidDate), void: !!r.void, notes: str(r.notes, 1000),
        description: job ? `Job card ${job}` : 'Imported from spreadsheet', legacyJob: job, legacyJobDate: isoDate(r.jobDate), createdAt: nowIso(), createdBy: actor.name, imported: true };
      S.tracker.push(t); save('tracker', t); out.imported++;
    }
    changed(b.id);
    return { ok: true, ...out };
  }
  function deleteTrackerRow(id) {
    const i = S.tracker.findIndex(x => x.id === id); if (i < 0) return { error: 'Row not found.' };
    if (S.tracker[i].jobId || S.tracker[i].serviceId) return { error: 'Rows for jobs cannot be deleted. Mark them void instead.' };
    const [t] = S.tracker.splice(i, 1); db.del('tracker', id); changed(t.building);
    return { ok: true };
  }
  /* Approve rows for invoicing; with Zoho connected this also creates the draft invoices. */
  function approveTracker(ids, actor) {
    const out = { approved: 0, sent: 0, skipped: [] };
    for (const id of (ids || []).slice(0, 200)) {
      const t = byId(S.tracker, id); if (!t) continue;
      const label = t.jobId || t.poNumber || t.id;
      if (t.void) { out.skipped.push(`${label}: void`); continue; }
      if (t.invoice) { out.skipped.push(`${label}: already invoiced`); continue; }
      const rec = t.jobId ? byId(S.jobs, t.jobId) : t.serviceId ? byId(S.services, t.serviceId) : null;
      if (t.jobId && rec && !['completed', 'report'].includes(rec.status)) { out.skipped.push(`${label}: work not completed`); continue; }
      const lines = rec && rec.billing ? rec.billing.lines || [] : [];
      if (rec && !lines.length) { out.skipped.push(`${label}: no parts & labour`); continue; }
      t.approvedAt = nowIso(); t.approvedBy = actor.name; save('tracker', t); out.approved++;
      if (rec && zoho && zoho.configured) { zEnqueue('invoice', (t.jobId ? 'job:' : 'service:') + rec.id); out.sent++; }
    }
    changed(null);
    return { ok: true, ...out };
  }
  function bulkTracker(ids, action, date) {
    const day = isoDate(date) || nowIso().slice(0, 10); let n = 0;
    for (const id of (ids || []).slice(0, 500)) {
      const t = byId(S.tracker, id); if (!t || t.void) continue;
      if (action === 'portal' && t.invoice && !t.portalDate) { t.portalDate = day; n++; }
      else if (action === 'paid' && t.invoice && !t.paidDate) { t.paidDate = day; n++; }
      else continue;
      save('tracker', t);
    }
    changed(null);
    return { ok: true, updated: n };
  }

  /* ---------------- Zoho Books sync (platform is the master) ---------------- */
  let zoho = null, zBusy = false;
  const zTimer = setInterval(() => zWork(), 10000); zTimer.unref();
  function zEnqueue(kind, ref) {
    if (!zoho || !zoho.configured) return null;
    const dup = S.zohoq.find(x => x.kind === kind && x.ref === ref && x.status === 'queued'); if (dup) return dup;
    const item = { id: 'Z' + Date.now().toString(36) + rid(3), kind, ref, status: 'queued', attempts: 0, nextAt: 0, createdAt: nowIso(), error: null };
    S.zohoq.unshift(item); db.put('zohoq', item);
    if (S.zohoq.length > 500) S.zohoq.splice(500).forEach(x => db.del('zohoq', x.id));
    setImmediate(zWork);
    return item;
  }
  async function zWork() {
    if (zBusy || !zoho || !zoho.configured) return;
    zBusy = true;
    try {
      for (const it of S.zohoq.filter(x => x.status === 'queued' && x.nextAt <= Date.now()).reverse()) {
        it.attempts++;
        try { it.result = it.kind === 'contact' ? await zSyncContact(it.ref) : await zInvoice(it.ref); it.status = 'done'; it.error = null; it.doneAt = nowIso(); }
        catch (e) {
          it.error = String(e.message || e).slice(0, 300);
          if (it.attempts >= 5 || e.retry === false || (!e.retry && /not found|nothing to invoice|no client/i.test(it.error))) it.status = 'failed';
          else it.nextAt = Date.now() + [60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3][it.attempts - 1];
          log('[zoho]', it.kind, it.ref, it.error);
          if (it.status === 'failed') feed('Zoho Books sync failed', `${it.kind} ${it.ref}: ${it.error}`, 'bad', '#/settings/billing', null);
        }
        db.put('zohoq', it); changed(null);
      }
    } finally { zBusy = false; }
  }
  function splitName(n) { const p = String(n || '').trim().split(/\s+/); return { first_name: p.length > 1 ? p.slice(0, -1).join(' ') : p[0] || 'Contact', last_name: p.length > 1 ? p[p.length - 1] : '-' }; }
  async function zSyncContact(bid) {
    const b = byId(S.buildings, bid); if (!b) throw Object.assign(new Error('Building not found'), { retry: false });
    const name = str(b.client || b.name, 100);
    b.zoho = b.zoho || {};
    let id = b.zoho.contactId || (S.buildings.find(x => x !== b && (x.client || x.name) === (b.client || b.name) && x.zoho && x.zoho.contactId) || {}).zoho?.contactId;
    const persons = (b.contacts || []).filter(c => c.email || c.phone);
    const person = c => ({ ...splitName(c.name), email: c.email || undefined, mobile: c.phone || undefined });
    if (!id) { const found = await zoho.findContact(name); if (found) id = found.contact_id; }
    if (!id) {
      const created = await zoho.createContact({ contact_name: name, company_name: name, contact_type: 'customer', contact_persons: persons.slice(0, 10).map(person) }); // Zoho makes the first person the primary contact
      id = created.contact_id;
      b.zoho.syncedPersons = persons.slice(0, 10).map(c => c.email || c.phone);
    } else {
      const synced = new Set(b.zoho.syncedPersons || []);
      for (const c of persons) { const key = c.email || c.phone; if (synced.has(key)) continue; await zoho.addContactPerson({ contact_id: id, ...person(c) }); synced.add(key); }
      b.zoho.syncedPersons = [...synced];
    }
    b.zoho.contactId = id; b.zoho.syncedAt = nowIso(); b.zoho.url = zoho.contactUrl(id);
    save('buildings', b); changed(bid);
    return { contactId: id };
  }
  async function zInvoice(ref) {
    const [type, id] = String(ref).split(':');
    const rec = type === 'job' ? byId(S.jobs, id) : byId(S.services, id);
    if (!rec) throw Object.assign(new Error('Record not found'), { retry: false });
    if (rec.invoice && rec.invoice.id) return { invoiceId: rec.invoice.id };
    const lines = (rec.billing && rec.billing.lines) || [];
    if (!lines.length) throw Object.assign(new Error('Nothing to invoice: no parts or labour recorded'), { retry: false });
    const b = byId(S.buildings, rec.building); if (!b) throw Object.assign(new Error('Building not found'), { retry: false });
    if (!(b.zoho && b.zoho.contactId)) await zSyncContact(b.id);
    const tk = trackerFor(type, rec.id);
    const reference = (tk && tk.poNumber) || rec.id;
    const t = totals(lines);
    let inv = await zoho.findInvoiceByReference(reference);
    if (inv && tk && tk.poNumber && inv.total !== undefined && Math.abs(+inv.total - t.total) > 0.01) inv = null; // same PO, different invoice
    if (!inv) {
      const B = S.settings.billing, cat = B.catalogue || [];
      const what = type === 'job' ? `Service call ${rec.id} · ${rec.equipment} · ${b.name}${rec.work ? '\nWork done: ' + rec.work : ''}` : `${rec.type} · ${rec.unit} · ${b.name} (${rec.date})\n${rec.work}`;
      inv = await zoho.createInvoice({
        customer_id: b.zoho.contactId,
        reference_number: reference,
        date: nowIso().slice(0, 10),
        is_inclusive_tax: !!B.pricesIncludeVat,
        line_items: lines.map(l => { const c = cat.find(x => x.code && x.code === l.code); return { ...(c && c.zohoItemId ? { item_id: c.zohoItemId } : {}), name: l.description.slice(0, 100), description: [l.kind, rec.unit || ''].filter(Boolean).join(' · '), rate: l.unitPrice, quantity: l.qty, ...(B.zohoTaxId ? { tax_id: B.zohoTaxId } : {}) }; }),
        notes: what.slice(0, 2000),
      });
    }
    if (tk) { tk.invoice = { number: inv.invoice_number || '', date: nowIso().slice(0, 10), source: 'zoho' }; tk.amountEx = t.subtotal; tk.amountIncl = t.total; save('tracker', tk); }
    rec.invoice = { provider: 'zoho', id: inv.invoice_id, number: inv.invoice_number || '', status: inv.status || 'draft', at: nowIso(), url: zoho.invoiceUrl(inv.invoice_id), reference };
    save(type === 'job' ? 'jobs' : 'services', rec);
    feed(`Draft invoice ${rec.invoice.number || ''} created in Zoho Books`, `${type === 'job' ? rec.id : rec.unit + ' · ' + rec.type} — ${b.name}`, '', type === 'job' ? '#/service/job/' + rec.id : `#/service/unit/${b.id}/${encodeURIComponent(rec.unit)}`, b.id);
    changed(b.id);
    return { invoiceId: inv.invoice_id, number: rec.invoice.number };
  }
  function requestInvoice(ref) {
    if (!zoho || !zoho.configured) return { error: 'Zoho Books is not connected yet. See Settings → Zoho Books & billing.' };
    const [type, id] = ref.split(':');
    const rec = type === 'job' ? byId(S.jobs, id) : byId(S.services, id);
    if (!rec) return { error: 'Not found.' };
    if (rec.invoice && rec.invoice.id) return { error: 'Already invoiced.' };
    if (!(rec.billing && rec.billing.lines && rec.billing.lines.length)) return { error: 'Record the parts & labour first.' };
    const tk = trackerFor(type, id);
    if (tk && !tk.approvedAt) { tk.approvedAt = nowIso(); save('tracker', tk); }
    return { ok: true, queued: zEnqueue('invoice', ref).id };
  }
  function zRetry(id) { const it = S.zohoq.find(x => x.id === id); if (it && it.status === 'failed') { Object.assign(it, { status: 'queued', attempts: 0, nextAt: 0, error: null }); db.put('zohoq', it); setImmediate(zWork); } return { ok: !!it }; }
  function zSyncAll() { if (!zoho || !zoho.configured) return { error: 'Zoho Books is not connected yet.' }; S.buildings.forEach(b => zEnqueue('contact', b.id)); return { ok: true, queued: S.buildings.length }; }
  function zStatus() { return { configured: !!(zoho && zoho.configured), hasToken: !!(zoho && zoho.hasToken), meta: (zoho && zoho.meta) || {}, dc: zoho && zoho.dc, org: zoho && zoho.org, queued: S.zohoq.filter(x => x.status === 'queued').length, failed: S.zohoq.filter(x => x.status === 'failed').length, log: S.zohoq.slice(0, 40) }; }

  function updateSettings(data) {
    if (data.billing) {
      const B = data.billing, cur = S.settings.billing;
      const vatRate = +B.vatRate; if (B.vatRate !== undefined && !(vatRate >= 0 && vatRate <= 50)) return { error: 'VAT rate must be between 0 and 50 %.' };
      const catalogue = Array.isArray(B.catalogue) ? B.catalogue.map(c => ({ code: str(c.code, 30), name: str(c.name, 100), kind: LINE_KINDS.includes(c.kind) ? c.kind : 'Part', unit: str(c.unit, 20) || 'each', rate: money(Math.max(0, +c.rate || 0)), zohoItemId: str(c.zohoItemId, 40) })).filter(c => c.name) : cur.catalogue;
      if (B.termsDays !== undefined) { const td = Math.round(+B.termsDays); if (!(td >= 0 && td <= 365)) return { error: 'Payment terms must be 0–365 days.' }; cur.termsDays = td; }
      S.settings.billing = { ...cur, vatRate: B.vatRate !== undefined ? vatRate : cur.vatRate, pricesIncludeVat: B.pricesIncludeVat !== undefined ? !!B.pricesIncludeVat : cur.pricesIncludeVat, autoInvoice: B.autoInvoice !== undefined ? !!B.autoInvoice : cur.autoInvoice, currency: str(B.currency || cur.currency, 3).toUpperCase() || 'ZAR', zohoTaxId: B.zohoTaxId !== undefined ? str(B.zohoTaxId, 40) : cur.zohoTaxId, catalogue };
    }
    if (data.policy) S.settings.policy = data.policy;
    if (data.desk) S.settings.desk = { phone: data.desk.phone || '', email: data.desk.email || '' };
    if (data.etaMinutes) S.settings.etaMinutes = +data.etaMinutes || 25;
    db.setKv('settings', S.settings); changed(null);
    return { ok: true, settings: S.settings };
  }

  load();
  S.jobs.forEach(j => ensureTracker('job', j));
  S.services.filter(x => x.billing && x.billing.lines && x.billing.lines.length).forEach(x => ensureTracker('service', x));
  return {
    S, STEPS, stepLabel, bld, tech, feed, save, changed, saveMeta, flushBms,
    setNotifier: n => { notifier = n; }, onOutboxStatus,
    addTrackerRow, updateTracker, deleteTrackerRow, importTracker, approveTracker, bulkTracker,
    setZoho: z => { zoho = z; }, zWork, zEnqueue, zRetry, zSyncAll, zStatus, requestInvoice, setJobBilling, setServiceBilling, totals,
    newJob, setStep, advance, autoAssign, sign, addPhotos, fileFor, saveDataUrl,
    raiseAlarm, clearAlarm, evaluate, applyReadings, setConnStatus, connStatus, gsmInbound,
    stateFor, upsertUser, deleteUser, upsertBuilding, deleteBuilding, updateSettings,
    setContacts, upsertUnit, setUnitRemoved, addService, deleteService, upsertTech, deleteTech, SERVICE_TYPES,
    stop() { clearInterval(bmsTimer); clearInterval(wd); clearInterval(zTimer); flushBms(); },
  };
}

module.exports = { createModel };
