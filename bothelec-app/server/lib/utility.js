'use strict';
/* Bothelec Utility Management: meters, readings, tenants, tariffs and monthly recovery (tenant billing) runs.
 * Readings live in their own SQLite table (they can be frequent when meters report automatically).
 * Meter communication: manual readings (technicians, with photos), CSV import, and any BMS connector path
 * "meters.<meterId>.reading". The MeterHead protocol plugs in here once its specification is available. */
const { nowIso, rid, byId } = require('./util');

const TYPES = { electricity: 'kWh', water: 'kL', solar: 'kWh' };
const TYPE_LABEL = { electricity: 'Electricity', water: 'Water', solar: 'Solar' };
const DAY = 864e5;
const r2 = n => Math.round(n * 100) / 100;
const r3 = n => Math.round(n * 1000) / 1000;
const str = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const isoDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');

/* Sample tariffs: edit them to the municipality / landlord rates before billing. Rates exclude VAT. */
const DEFAULT_TARIFFS = () => [
  { id: 'TF-ELEC', name: 'Electricity: commercial (sample rates)', type: 'electricity', fixed: 285, blocks: [{ upTo: 1000, rate: 2.98 }, { upTo: null, rate: 3.42 }], sewerPct: 0 },
  { id: 'TF-WATER', name: 'Water & sewer (sample rates)', type: 'water', fixed: 0, blocks: [{ upTo: 6, rate: 24.5 }, { upTo: 15, rate: 39.8 }, { upTo: null, rate: 54.2 }], sewerPct: 70 },
  { id: 'TF-SOLAR', name: 'Solar PPA (sample rate)', type: 'solar', fixed: 0, blocks: [{ upTo: null, rate: 1.95 }], sewerPct: 0 },
];

function createUtility(ctx) {
  const { S, db, save, changed, feed, saveDataUrl, isStaff, canBuilding } = ctx;
  if (!S.settings.tariffs) { S.settings.tariffs = DEFAULT_TARIFFS(); db.setKv('settings', S.settings); }

  /* ---------------- meters ---------------- */
  const meter = id => byId(S.meters, id);
  function upsertMeter(d, originalId) {
    const b = byId(S.buildings, d.building); if (!b) return { error: 'Choose a building.' };
    const id = str(d.id, 40); if (!id) return { error: 'Meter ID is required (for example E-SHOP4).' };
    if (/[\/·#?~:]/.test(id)) return { error: 'Meter ID cannot contain / · # ? ~ or :' };
    let m = originalId ? meter(originalId) : null;
    if (originalId && !m) return { error: 'Meter not found.' };
    if (S.meters.find(x => x.id === id && x !== m)) return { error: `A meter with ID ${id} already exists.` };
    const type = TYPES[d.type] ? d.type : null; if (!type) return { error: 'Choose electricity, water or solar.' };
    const mult = d.multiplier === '' || d.multiplier == null ? 1 : +d.multiplier;
    if (!(mult > 0 && mult <= 100000)) return { error: 'Multiplier (CT ratio) must be more than 0.' };
    const tenantId = d.tenantId && byId(S.tenants, d.tenantId) && byId(S.tenants, d.tenantId).building === b.id ? d.tenantId : null;
    const tariffId = d.tariffId && S.settings.tariffs.find(t => t.id === d.tariffId && t.type === type) ? d.tariffId : null;
    if (!m) { m = { id, removed: false, createdAt: nowIso() }; S.meters.push(m); }
    else if (m.id !== id) { db.readings.rename(m.id, id); S.jobs.filter(j => j.meter === m.id).forEach(j => { j.meter = id; save('jobs', j); }); db.del('meters', m.id); }
    Object.assign(m, { id, building: b.id, type, unit: TYPES[type], serial: str(d.serial, 60), make: str(d.make, 60), model: str(d.model, 60), location: str(d.location, 80),
      multiplier: mult, tenantId, tariffId, comm: ['manual', 'connector', 'meterhead'].includes(d.comm) ? d.comm : 'manual', installed: isoDate(d.installed), notes: str(d.notes, 1000) });
    if (!(b.divisions || []).includes('utility')) { b.divisions = [...(b.divisions || []), 'utility']; save('buildings', b); }
    syncMeterEquipment(b);
    save('meters', m); changed(b.id);
    return { ok: true, meter: m };
  }
  function setMeterRemoved(id, removed) {
    const m = meter(id); if (!m) return { error: 'Meter not found.' };
    m.removed = !!removed; m.removedAt = removed ? nowIso() : undefined;
    syncMeterEquipment(byId(S.buildings, m.building)); save('meters', m); changed(m.building);
    return { ok: true };
  }
  const meterLabel = m => `${m.id} · ${TYPE_LABEL[m.type]} meter${m.location ? ' (' + m.location + ')' : ''}`;
  function syncMeterEquipment(b) {
    if (!b) return;
    b.meterEquipment = [...S.meters.filter(m => m.building === b.id && !m.removed).map(meterLabel), 'Other / not sure'];
    save('buildings', b);
  }

  /* ---------------- readings ---------------- */
  function addReading(meterId, d, actor, source = 'manual') {
    const m = meter(meterId); if (!m) return { error: 'Meter not found.' };
    const value = +d.value;
    if (d.value === '' || d.value == null || !(value >= 0) || value > 1e12) return { error: 'Enter the meter reading (a number).' };
    let ts = d.ts;
    if (isoDate(d.date)) ts = `${d.date}T${/^\d{2}:\d{2}$/.test(d.time || '') ? d.time : '12:00'}:00.000Z`;
    if (!ts || isNaN(Date.parse(ts))) ts = nowIso();
    ts = new Date(ts).toISOString();
    if (ts > new Date(Date.now() + DAY).toISOString()) return { error: 'The reading date cannot be in the future.' };
    const prev = db.readings.before(m.id, ts);
    const warning = prev && value < prev.value ? `Lower than the previous reading (${prev.value} on ${prev.ts.slice(0, 10)}). Meter replaced or reading mistake?` : null;
    const photo = d.photo ? saveDataUrl(d.photo, 'RD-' + m.id, 'jpg') : '';
    db.readings.put(m.id, ts, value, source, actor ? actor.name : '', str(d.note || (d.jobId ? 'Job ' + d.jobId : ''), 200), photo || '');
    if (d.jobId) { const j = byId(S.jobs, d.jobId); if (j) { j.readings = j.readings || []; j.readings.push({ meter: m.id, ts, value, photo: photo || '', by: actor ? actor.name : '' }); save('jobs', j); } }
    changed(m.building);
    return { ok: true, reading: { meter: m.id, ts, value }, warning };
  }
  const lastAuto = {};
  function connectorReading(meterId, value) {
    const m = meter(meterId); if (!m || typeof value !== 'number' || !isFinite(value)) return false;
    m.live = { value, at: nowIso() };
    if (lastAuto[m.id] && Date.now() - lastAuto[m.id] < 15 * 60e3) return true; // store at most every 15 minutes
    lastAuto[m.id] = Date.now();
    db.readings.put(m.id, nowIso(), value, m.comm === 'meterhead' ? 'meterhead' : 'connector', '', '', '');
    return true;
  }
  function importReadings(rows, actor) {
    if (!Array.isArray(rows) || !rows.length) return { error: 'No rows to import.' };
    if (rows.length > 20000) return { error: 'Import at most 20 000 rows at a time.' };
    const out = { imported: 0, skipped: [] };
    for (const [i, row] of rows.entries()) {
      const key = str(row.meter, 60);
      const m = meter(key) || S.meters.find(x => x.serial && x.serial === key);
      if (!m) { out.skipped.push({ line: row.line || i + 2, reason: `unknown meter "${key}"` }); continue; }
      const r = addReading(m.id, { date: row.date, time: row.time, value: row.value, note: 'Imported' }, actor, 'import');
      if (r.error) out.skipped.push({ line: row.line || i + 2, reason: r.error }); else out.imported++;
    }
    changed(null);
    return { ok: true, ...out };
  }
  function deleteReading(meterId, ts) { const m = meter(meterId); if (!m) return { error: 'Meter not found.' }; db.readings.del(m.id, ts); changed(m.building); return { ok: true }; }
  function readingsFor(meterId, from, to) {
    return db.readings.range(meterId, from || '0000', to || '9999', 5000);
  }
  /* Reading nearest to a moment, preferring within ±windowDays. */
  function nearest(meterId, ts, windowDays = 7) {
    const a = db.readings.before(meterId, ts), b = db.readings.after(meterId, ts), t = Date.parse(ts);
    const d = x => (x ? Math.abs(Date.parse(x.ts) - t) : Infinity);
    const best = d(a) <= d(b) ? a : b;
    if (!best) return null;
    return { ...best, offDays: Math.round(d(best) / DAY), estimated: d(best) > windowDays * DAY };
  }

  /* ---------------- tenants ---------------- */
  function upsertTenant(d) {
    const b = byId(S.buildings, d.building); if (!b) return { error: 'Choose a building.' };
    const name = str(d.name, 100); if (!name) return { error: 'Tenant name is required.' };
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(d.email))) return { error: 'The email looks wrong.' };
    let t = d.id ? byId(S.tenants, d.id) : null;
    if (d.id && !t) return { error: 'Tenant not found.' };
    if (!t) { t = { id: 'TN' + Date.now().toString(36) + rid(2), createdAt: nowIso() }; S.tenants.push(t); }
    Object.assign(t, { building: b.id, name, unit: str(d.unit, 40), contact: str(d.contact, 80), email: str(d.email, 120).toLowerCase(), phone: str(d.phone, 30), vatNo: str(d.vatNo, 30), active: d.active !== false });
    save('tenants', t); changed(b.id);
    return { ok: true, tenant: t };
  }
  function deleteTenant(id) {
    const i = S.tenants.findIndex(x => x.id === id); if (i < 0) return { error: 'Tenant not found.' };
    if (S.recoveries.some(r => r.lines.some(l => l.tenantId === id))) return { error: 'This tenant has billing history. Mark them as moved out instead.' };
    const [t] = S.tenants.splice(i, 1); db.del('tenants', id);
    S.meters.filter(m => m.tenantId === id).forEach(m => { m.tenantId = null; save('meters', m); });
    changed(t.building);
    return { ok: true };
  }

  /* ---------------- tariffs ---------------- */
  function setTariffs(list) {
    if (!Array.isArray(list)) return { error: 'Tariffs must be a list.' };
    const out = [];
    for (const t of list) {
      const name = str(t.name, 80); if (!name) continue;
      if (!TYPES[t.type]) return { error: `Choose a type for "${name}".` };
      const blocks = (t.blocks || []).map(b => ({ upTo: b.upTo === '' || b.upTo == null ? null : +b.upTo, rate: +b.rate })).filter(b => b.rate >= 0 && !isNaN(b.rate));
      if (!blocks.length) return { error: `Add at least one rate for "${name}".` };
      if (blocks.some((b, i) => i < blocks.length - 1 && !(b.upTo > 0))) return { error: `In "${name}", every block except the last needs an "up to" amount.` };
      blocks[blocks.length - 1].upTo = null;
      out.push({ id: str(t.id, 20) || 'TF' + rid(4), name, type: t.type, fixed: r2(Math.max(0, +t.fixed || 0)), blocks, sewerPct: t.type === 'water' ? Math.max(0, Math.min(200, +t.sewerPct || 0)) : 0 });
    }
    S.settings.tariffs = out; db.setKv('settings', S.settings); changed(null);
    return { ok: true, tariffs: out };
  }
  function charges(tariff, consumption, unit) {
    const out = []; let left = consumption, from = 0, energy = 0;
    for (const b of tariff.blocks) {
      if (left <= 0) break;
      const size = b.upTo == null ? left : Math.max(0, Math.min(left, b.upTo - from));
      if (size > 0) { const amt = r2(size * b.rate); energy += amt; out.push({ desc: tariff.blocks.length > 1 ? `${b.upTo == null ? 'Above ' + from : from + '–' + b.upTo} ${unit}` : `Consumption`, qty: r3(size), rate: b.rate, amount: amt }); }
      left -= size; from = b.upTo == null ? from : b.upTo;
    }
    if (tariff.sewerPct) out.push({ desc: `Sewer (${tariff.sewerPct}% of water)`, qty: 1, rate: r2(energy * tariff.sewerPct / 100), amount: r2(energy * tariff.sewerPct / 100) });
    if (tariff.fixed) out.push({ desc: 'Fixed / basic charge', qty: 1, rate: tariff.fixed, amount: tariff.fixed });
    return out;
  }

  /* ---------------- recovery (tenant billing) runs ---------------- */
  function monthBounds(month) {
    if (!/^\d{4}-\d{2}$/.test(month || '')) return null;
    const [y, m] = month.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1)), to = new Date(Date.UTC(y, m, 1));
    return { from: from.toISOString(), to: to.toISOString(), label: from.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  }
  function calcRun(run) {
    const B = S.settings.billing, vat = B.vatRate / 100;
    const tenants = S.tenants.filter(t => t.building === run.building && t.active !== false);
    run.lines = tenants.map(t => {
      const old = (run.lines || []).find(l => l.tenantId === t.id);
      const items = S.meters.filter(m => m.building === run.building && m.tenantId === t.id && !m.removed).map(m => {
        const open = nearest(m.id, run.from), close = nearest(m.id, run.to);
        const warnings = [];
        if (!open || !close || open.ts === close.ts) warnings.push('Not enough readings for this period');
        else {
          if (open.estimated) warnings.push(`Opening reading is ${open.offDays} days from the period start`);
          if (close.estimated) warnings.push(`Closing reading is ${close.offDays} days from the period end`);
          if (close.value < open.value) warnings.push('Closing reading is lower than the opening reading');
        }
        const ok = open && close && open.ts !== close.ts && close.value >= open.value;
        const consumption = ok ? r3((close.value - open.value) * (m.multiplier || 1)) : 0;
        const tariff = S.settings.tariffs.find(x => x.id === m.tariffId) || S.settings.tariffs.find(x => x.type === m.type);
        if (!tariff) warnings.push('No tariff for this meter type');
        const ch = ok && tariff ? charges(tariff, consumption, m.unit) : [];
        return { meterId: m.id, type: m.type, unit: m.unit, multiplier: m.multiplier || 1, open: open && { ts: open.ts, value: open.value }, close: close && { ts: close.ts, value: close.value }, consumption, tariff: tariff ? tariff.name : '', charges: ch, warnings };
      });
      const sub = r2(items.reduce((a, it) => a + it.charges.reduce((x, c) => x + c.amount, 0), 0));
      return { tenantId: t.id, tenant: t.name, unit: t.unit, items, subtotal: sub, vat: r2(sub * vat), total: r2(sub * (1 + vat)), invoice: old && old.invoice, emailed: old && old.emailed };
    });
    run.subtotal = r2(run.lines.reduce((a, l) => a + l.subtotal, 0)); run.total = r2(run.lines.reduce((a, l) => a + l.total, 0));
    run.warnings = run.lines.reduce((a, l) => a + l.items.reduce((x, it) => x + it.warnings.length, 0), 0);
    run.calculatedAt = nowIso();
  }
  function createRun(d, actor) {
    const b = byId(S.buildings, d.building); if (!b) return { error: 'Choose a building.' };
    const mb = monthBounds(d.month); if (!mb) return { error: 'Choose the month to bill.' };
    if (S.recoveries.find(r => r.building === b.id && r.month === d.month)) return { error: `${b.name} already has a billing run for ${mb.label}.` };
    if (!S.tenants.some(t => t.building === b.id)) return { error: 'Add tenants and assign meters to them first.' };
    const run = { id: 'RR' + Date.now().toString(36) + rid(2), building: b.id, month: d.month, label: mb.label, from: mb.from, to: mb.to, status: 'draft', createdAt: nowIso(), createdBy: actor.name, lines: [] };
    calcRun(run); S.recoveries.unshift(run); save('recoveries', run); changed(b.id);
    return { ok: true, run };
  }
  function recalcRun(id) {
    const run = byId(S.recoveries, id); if (!run) return { error: 'Billing run not found.' };
    if (run.status !== 'draft') return { error: 'This run is already approved.' };
    calcRun(run); save('recoveries', run); changed(run.building);
    return { ok: true, run };
  }
  function deleteRun(id) {
    const i = S.recoveries.findIndex(r => r.id === id); if (i < 0) return { error: 'Billing run not found.' };
    if (S.recoveries[i].status !== 'draft') return { error: 'Approved runs cannot be deleted.' };
    const [run] = S.recoveries.splice(i, 1); db.del('recoveries', id); changed(run.building);
    return { ok: true };
  }
  /* Approve: lock the run, email each tenant a statement and add a billing-tracker row per tenant. */
  function approveRun(id, actor) {
    const run = byId(S.recoveries, id); if (!run) return { error: 'Billing run not found.' };
    if (run.status !== 'draft') return { error: 'Already approved.' };
    calcRun(run);
    const b = byId(S.buildings, run.building);
    run.status = 'approved'; run.approvedAt = nowIso(); run.approvedBy = actor.name;
    let emailed = 0, rows = 0;
    for (const l of run.lines) {
      if (!(l.total > 0)) continue;
      const t = byId(S.tenants, l.tenantId);
      ctx.addTrackerRowFor({ building: run.building, division: 'utility', recoveryId: run.id, tenantId: l.tenantId, description: `Utility recovery ${run.label} · ${l.tenant}${l.unit ? ' (' + l.unit + ')' : ''}`, amountEx: l.subtotal, amountIncl: l.total, jobDate: run.to.slice(0, 10) });
      rows++;
      if (t && t.email) { ctx.sendStatement(run, l, t, b); l.emailed = nowIso(); emailed++; }
    }
    save('recoveries', run);
    feed(`Utility billing approved · ${b ? b.name : ''}`, `${run.label}: ${rows} tenant statements, ${emailed} emailed`, '', '#/recoveries/run/' + run.id, run.building);
    changed(run.building);
    return { ok: true, rows, emailed };
  }
  /* Billing lines for one tenant's statement (used for the Zoho invoice). */
  function recoveryLines(runId, tenantId) {
    const run = byId(S.recoveries, runId); const l = run && run.lines.find(x => x.tenantId === tenantId);
    if (!l) return null;
    const lines = [];
    l.items.forEach(it => it.charges.forEach(c => lines.push({ kind: 'Other', code: '', description: `${TYPE_LABEL[it.type]} ${it.meterId}: ${c.desc}`, qty: c.qty, unitPrice: c.rate })));
    return { run, line: l, lines };
  }

  /* ---------------- views ---------------- */
  function stateFor(u) {
    if (u.role === 'tech') return { meters: S.meters.map(withLast), tenants: [], recoveries: [], tariffs: [] };
    const ok = b => canBuilding(u, b);
    return {
      meters: S.meters.filter(m => ok(m.building)).map(withLast),
      tenants: S.tenants.filter(t => ok(t.building)),
      recoveries: S.recoveries.filter(r => ok(r.building)),
      tariffs: isStaff(u) ? S.settings.tariffs : [],
    };
  }
  function withLast(m) {
    const last = db.readings.latest(m.id);
    const monthAgo = last ? db.readings.before(m.id, new Date(Date.parse(last.ts) - 30 * DAY).toISOString()) : null;
    const days = last && monthAgo ? (Date.parse(last.ts) - Date.parse(monthAgo.ts)) / DAY : 0;
    return { ...m, last: last ? { ts: last.ts, value: last.value, source: last.source } : null, use30: days >= 1 ? r2((last.value - monthAgo.value) * (m.multiplier || 1) / days * 30) : null };
  }

  return { TYPES, TYPE_LABEL, meter, upsertMeter, setMeterRemoved, addReading, connectorReading, importReadings, deleteReading, readingsFor, upsertTenant, deleteTenant, setTariffs, createRun, recalcRun, deleteRun, approveRun, recoveryLines, stateFor, syncMeterEquipment, meterLabel };
}

module.exports = { createUtility, DEFAULT_TARIFFS };
