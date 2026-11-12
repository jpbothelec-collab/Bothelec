'use strict';
/* Bothelec Utility Management: meters, readings, tenants, tariffs and monthly recovery (tenant billing) runs.
 * Readings live in their own SQLite table (they can be frequent when meters report automatically).
 * Meter communication: manual readings (technicians, with photos), CSV import, and any BMS connector path
 * "meters.<meterId>.reading". The M2M Solutions API plugs in here once its documentation is available. */
const { nowIso, rid, byId } = require('./util');
const { LIBRARY, PENDING } = require('./tariff-library');

const TYPES = { electricity: 'kWh', water: 'kL', solar: 'kWh' };
const TYPE_LABEL = { electricity: 'Electricity', water: 'Water', solar: 'Solar' };
const ROLES = ['council', 'check', 'sub'];
const ROW_KINDS = ['shop', 'common', 'council', 'check'];
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
  // bring tariffs saved in the older shape up to date (single fixed amount → fixed lines, etc.)

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
    if (d.role !== undefined) m.role = ROLES.includes(d.role) ? d.role : 'sub';
    if (!m.role) m.role = 'sub';
    Object.assign(m, { id, building: b.id, type, unit: TYPES[type], serial: str(d.serial, 60), make: str(d.make, 60), model: str(d.model, 60), location: str(d.location, 80),
      multiplier: mult, tenantId, tariffId, comm: d.comm === 'meterhead' ? 'm2m' : ['manual', 'connector', 'm2m'].includes(d.comm) ? d.comm : 'manual', installed: isoDate(d.installed), notes: str(d.notes, 1000) });
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
    db.readings.put(m.id, nowIso(), value, m.comm === 'm2m' ? 'm2m' : 'connector', '', '', '');
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
  /* Tariffs: see tariff-library.js for the shape. Older tariffs (a single fixed amount, sewer as % of the water
   * charge) still work. */
  const num = (v, lo = 0, hi = 1e7) => { const n = +v; return isFinite(n) && n >= lo && n <= hi ? n : null; };
  function normBlocks(list, name, label, withPct) {
    const blocks = (Array.isArray(list) ? list : []).map(b => ({ upTo: b.upTo === '' || b.upTo == null ? null : +b.upTo, rate: +b.rate, ...(withPct ? { pct: b.pct === '' || b.pct == null ? 100 : +b.pct } : {}) }))
      .filter(b => b.rate >= 0 && b.rate !== null && !isNaN(b.rate) && (!withPct || (b.pct >= 0 && b.pct <= 100)));
    if (!blocks.length) return { blocks };
    if (blocks.some((b, k) => k < blocks.length - 1 && !(b.upTo > 0))) return { error: `In "${name}" (${label}), every block except the last needs an "up to" amount.` };
    if (blocks.some((b, k) => k > 0 && k < blocks.length - 1 && b.upTo <= blocks[k - 1].upTo)) return { error: `In "${name}" (${label}), the "up to" amounts must go up.` };
    blocks[blocks.length - 1].upTo = null;
    return { blocks };
  }
  const normFixed = (list, legacy) => {
    const out = (Array.isArray(list) ? list : []).map(x => ({ desc: str(x.desc, 80) || 'Fixed charge', amount: r2(+x.amount || 0) })).filter(x => x.amount > 0);
    if (!out.length && +legacy > 0) out.push({ desc: 'Fixed / basic charge', amount: r2(+legacy) });
    return out;
  };
  function normTariff(t) {
    const name = str(t.name, 120); if (!name) return null;
    if (!TYPES[t.type]) return { error: `Choose a type for "${name}".` };
    const b = normBlocks(t.blocks, name, 'rates'); if (b.error) return b;
    if (!b.blocks.length) return { error: `Add at least one rate for "${name}".` };
    let winterBlocks = null;
    if (t.winterBlocks && t.winterBlocks.length) { const w = normBlocks(t.winterBlocks, name, 'winter rates'); if (w.error) return w; winterBlocks = w.blocks.length ? w.blocks : null; }
    const winterMonths = winterBlocks ? [...new Set((Array.isArray(t.winterMonths) && t.winterMonths.length ? t.winterMonths : [6, 7, 8]).map(Number).filter(m => m >= 1 && m <= 12))].sort((x, y) => x - y) : [];
    const levyRate = t.levy ? num(t.levy.rate, 0, 1000) : null;
    const surchargePct = num(t.surchargePct, 0, 50) || 0;
    let sewer = null;
    if (t.type === 'water' && t.sewer && ((t.sewer.blocks || []).length || (t.sewer.fixed || []).length)) {
      const sb = normBlocks(t.sewer.blocks, name, 'sewer', true); if (sb.error) return sb;
      sewer = { blocks: sb.blocks, fixed: normFixed(t.sewer.fixed) };
    }
    const meta = {};
    for (const k of ['municipality', 'category', 'effective', 'until', 'libraryKey']) if (t[k]) meta[k] = str(t[k], 120);
    if (t.source && t.source.url) meta.source = { title: str(t.source.title, 200), url: str(t.source.url, 400) };
    if (Array.isArray(t.notes)) meta.notes = t.notes.map(n => str(n, 400)).filter(Boolean).slice(0, 8);
    return { id: str(t.id, 20) || 'TF' + rid(4), name, type: t.type, ...meta, blocks: b.blocks, winterBlocks, winterMonths, fixed: normFixed(t.fixed, typeof t.fixed === 'number' || typeof t.fixed === 'string' ? t.fixed : 0),
      levy: levyRate ? { desc: str(t.levy.desc, 80) || 'Levy', rate: levyRate, freeUnits: num(t.levy.freeUnits, 0, 1e6) || 0 } : null, surchargePct,
      sewer, sewerPct: t.type === 'water' && !sewer ? Math.max(0, Math.min(200, +t.sewerPct || 0)) : 0 };
  }
  function setTariffs(list) {
    if (!Array.isArray(list)) return { error: 'Tariffs must be a list.' };
    const out = [];
    for (const t of list) { const n = normTariff(t); if (!n) continue; if (n.error) return n; out.push(n); }
    S.settings.tariffs = out; db.setKv('settings', S.settings); changed(null);
    return { ok: true, tariffs: out };
  }
  function addFromLibrary(key) {
    const lib = LIBRARY.find(x => x.key === key); if (!lib) return { error: 'Tariff not found in the library.' };
    const existing = S.settings.tariffs.find(t => t.libraryKey === key);
    if (existing) return { error: `"${existing.name}" is already in your tariffs.` };
    const n = normTariff({ ...lib, id: 'TF' + rid(4), libraryKey: key }); if (n.error) return n;
    S.settings.tariffs.push(n); db.setKv('settings', S.settings); changed(null);
    return { ok: true, tariff: n };
  }
  /* Block charges on an amount, e.g. kWh or kL. */
  function blockCharges(blocks, qty, unit, label, rateOf = b => b.rate, qtyOf = (b, size) => size) {
    const out = []; let left = qty, from = 0;
    for (const b of blocks) {
      if (left <= 0) break;
      const size = b.upTo == null ? left : Math.max(0, Math.min(left, b.upTo - from));
      if (size > 0) { const q = r3(qtyOf(b, size)), amt = r2(q * rateOf(b)); out.push({ desc: `${label}${blocks.length > 1 ? ` ${b.upTo == null ? 'above ' + from : from + '–' + b.upTo} ${unit}` : ''}${b.pct != null && b.pct !== 100 ? ` (${b.pct}% of ${fmt(size)} ${unit})` : ''}`, qty: q, rate: rateOf(b), amount: amt }); }
      left -= size; from = b.upTo == null ? from : b.upTo;
    }
    return out;
  }
  const fmt = n => String(Math.round(n * 1000) / 1000);
  const isWinter = (tariff, month) => !!(tariff.winterBlocks && month && tariff.winterMonths.includes(+String(month).slice(5, 7)));
  /* All charges for one meter for one month (month = 'YYYY-MM', for the season). Excludes VAT. */
  function charges(tariff, consumption, unit, month) {
    const winter = isWinter(tariff, month);
    const blocks = winter ? tariff.winterBlocks : tariff.blocks;
    const out = blockCharges(blocks, consumption, unit, tariff.type === 'water' ? 'Water' : tariff.winterBlocks ? (winter ? 'Energy (winter)' : 'Energy (summer)') : tariff.type === 'solar' ? 'Solar energy' : 'Energy');
    const energy = out.reduce((a, x) => a + x.amount, 0);
    let sewerTotal = 0;
    if (tariff.sewer) {
      const sw = blockCharges(tariff.sewer.blocks, consumption, unit, 'Sewer', b => b.rate, (b, size) => size * (b.pct ?? 100) / 100).filter(x => x.amount > 0 || x.rate > 0);
      tariff.sewer.fixed.forEach(x => sw.push({ desc: x.desc, qty: 1, rate: x.amount, amount: x.amount }));
      sewerTotal = sw.reduce((a, x) => a + x.amount, 0); out.push(...sw);
    } else if (tariff.sewerPct) { const a = r2(energy * tariff.sewerPct / 100); out.push({ desc: `Sewer (${tariff.sewerPct}% of water)`, qty: 1, rate: a, amount: a }); }
    const fixed = (tariff.fixed || []);
    fixed.forEach(x => out.push({ desc: x.desc, qty: 1, rate: x.amount, amount: x.amount }));
    if (tariff.surchargePct) {
      const base = energy + sewerTotal + fixed.reduce((a, x) => a + x.amount, 0);
      if (base > 0) out.push({ desc: `Surcharge ${tariff.surchargePct}%`, qty: 1, rate: r2(base * tariff.surchargePct / 100), amount: r2(base * tariff.surchargePct / 100) });
    }
    if (tariff.levy && consumption > (tariff.levy.freeUnits || 0)) {
      const q = r3(consumption - (tariff.levy.freeUnits || 0));
      out.push({ desc: tariff.levy.desc, qty: q, rate: tariff.levy.rate, amount: r2(q * tariff.levy.rate) });
    }
    return out;
  }
  /* Try a tariff on an amount (Tariffs page calculator). */
  function quote(tariffOrId, consumption, month) {
    const t = typeof tariffOrId === 'string' ? (S.settings.tariffs.find(x => x.id === tariffOrId) || (LIBRARY.find(x => x.key === tariffOrId) && normTariff({ ...LIBRARY.find(x => x.key === tariffOrId), id: 'tmp' }))) : normTariff(tariffOrId || {});
    if (!t || t.error) return { error: (t && t.error) || 'Tariff not found.' };
    const q = num(consumption, 0, 1e9); if (q == null) return { error: 'Enter the consumption.' };
    const lines = charges(t, q, TYPES[t.type] || '', month || nowIso().slice(0, 7));
    const sub = r2(lines.reduce((a, x) => a + x.amount, 0)), vat = r2(sub * S.settings.billing.vatRate / 100);
    return { ok: true, lines, subtotal: sub, vat, total: r2(sub + vat), winter: isWinter(t, month || nowIso().slice(0, 7)) };
  }
  const tariffLibrary = () => ({ library: LIBRARY.map(x => normTariff({ ...x, id: x.key, libraryKey: x.key })), pending: PENDING });

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
        const ch = ok && tariff ? charges(tariff, consumption, m.unit, run.month) : [];
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

  /* ---------------- guided building setup ---------------- */
  /* Step 2: one row per shop or common area, with the electricity and water meter serials.
   * Serials link existing meters or create new ones. Validated in full before anything is saved. */
  const cleanId = v => String(v).replace(/[^A-Za-z0-9._-]+/g, '').slice(0, 30);
  function setupRows(bid, rows, actor) {
    const b = byId(S.buildings, bid); if (!b) return { error: 'Building not found.' };
    if (!Array.isArray(rows)) return { error: 'Nothing to save.' };
    const errors = [], seen = new Map(), units = new Set();
    rows = rows.map((r, i) => ({ n: i + 1, tenantId: r.tenantId || '', kind: ROW_KINDS.includes(r.kind) ? r.kind : 'shop', unit: str(r.unit, 40), name: str(r.name, 100), email: str(r.email, 120).toLowerCase(), contact: str(r.contact, 80), phone: str(r.phone, 30), elec: str(r.elecSerial, 40), water: str(r.waterSerial, 40) }))
      .filter(r => r.unit || r.name || r.elec || r.water);
    for (const r of rows) {
      const where = `Row ${r.n}${r.unit ? ' (' + r.unit + ')' : ''}`;
      if (!r.unit) errors.push(`${where}: enter the shop number or the common area name.`);
      if (r.kind === 'shop' && !r.name) errors.push(`${where}: enter the tenant's name (or choose Common area).`);
      if (r.kind === 'council' && !r.elec && !r.water) errors.push(`${where}: enter the council meter serial(s).`);
      if (r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) errors.push(`${where}: the email looks wrong.`);
      const key = r.unit.toLowerCase(); if (r.unit && units.has(key)) errors.push(`${where}: ${r.unit} appears twice.`); units.add(key);
      for (const [type, serial] of [['electricity', r.elec], ['water', r.water]]) {
        if (!serial) continue;
        const k = type + '|' + serial.toLowerCase();
        if (seen.has(k)) errors.push(`${where}: ${type} serial ${serial} is also on row ${seen.get(k)}.`); else seen.set(k, r.n);
        const other = S.meters.find(m => m.type === type && m.serial && m.serial.toLowerCase() === serial.toLowerCase() && m.building !== b.id && !m.removed);
        if (other) errors.push(`${where}: ${type} meter ${serial} is already installed at ${(byId(S.buildings, other.building) || {}).name || 'another building'}.`);
      }
    }
    if (errors.length) return { error: errors.slice(0, 8).join('\n') };
    const out = { tenants: 0, created: 0, linked: 0, unlinked: 0 }; // unlinked = replaced meters retired
    for (const r of rows) {
      let tenant = null;
      if (r.kind === 'shop') {
        if (!r.tenantId) {
          const same = S.tenants.find(t => t.building === b.id && t.active !== false && (t.unit || '').toLowerCase() === r.unit.toLowerCase());
          if (same && same.name.toLowerCase() === r.name.toLowerCase()) r.tenantId = same.id;
          else if (same) { same.active = false; same.movedOutAt = nowIso(); save('tenants', same); S.meters.filter(m => m.tenantId === same.id).forEach(m => { m.tenantId = null; save('meters', m); }); } // new tenant in this shop
        }
        const res = upsertTenant({ id: r.tenantId || undefined, building: b.id, name: r.name, unit: r.unit, email: r.email, contact: r.contact, phone: r.phone, active: true });
        if (res.error) return { error: `Row ${r.n}: ${res.error}` };
        tenant = res.tenant; out.tenants++;
      }
      for (const [type, serial] of [['electricity', r.elec], ['water', r.water]]) {
        const prefix = type === 'electricity' ? 'E' : 'W';
        // unlink a previously linked meter of this type that no longer matches (replaced meter or typo)
        const role = r.kind === 'council' ? 'council' : r.kind === 'check' ? 'check' : 'sub';
        const retired = [];
        S.meters.filter(m => m.building === b.id && m.type === type && !m.removed && (tenant ? m.tenantId === tenant.id : (!m.tenantId && m.location === r.unit)) && (!serial || (m.serial || '').toLowerCase() !== serial.toLowerCase()))
          .forEach(m => { retired.push(m); m.removed = true; m.removedAt = nowIso(); m.notes = [m.notes, serial ? `Replaced by ${serial} on ${nowIso().slice(0, 10)}` : `Removed in building setup on ${nowIso().slice(0, 10)}`].filter(Boolean).join('\n'); save('meters', m); out.unlinked++; }); // replaced meter: retired, readings kept
        if (!serial) continue;
        let m = S.meters.find(x => x.type === type && x.serial && x.serial.toLowerCase() === serial.toLowerCase() && x.building === b.id);
        if (m) { m.tenantId = tenant ? tenant.id : null; m.location = r.unit; m.removed = false; m.role = role; save('meters', m); out.linked++; }
        else {
          let id = `${prefix}-${cleanId(serial) || rid(4)}`; while (meter(id)) id = `${prefix}-${cleanId(serial)}-${rid(2)}`;
          const res = upsertMeter({ id, building: b.id, type, serial, location: r.unit, tenantId: tenant ? tenant.id : null, multiplier: 1, comm: 'manual', role });
          if (res.error) return { error: `Row ${r.n}: ${res.error}` };
          m = res.meter; out.created++;
        }
        // keep the meter tree intact when a meter is replaced: the new meter takes the old one's place
        const old = retired[0];
        if (old) {
          if (old.parentId && !m.parentId) m.parentId = old.parentId;
          S.meters.filter(x => x.parentId === old.id && !x.removed).forEach(x => { x.parentId = m.id; save('meters', x); });
          save('meters', m);
        } else if (!m.parentId && role !== 'council') {
          const council = S.meters.find(x => x.building === b.id && x.type === type && x.role === 'council' && !x.removed && x !== m);
          if (council) { m.parentId = council.id; save('meters', m); }
        }
      }
    }
    if (!(b.divisions || []).includes('utility')) b.divisions = [...(b.divisions || []), 'utility'];
    syncMeterEquipment(b); save('buildings', b); changed(b.id);
    return { ok: true, ...out };
  }
  /* Steps 3 and 4: check every meter in the building. */
  function checkMeter(m) {
    const last3 = db.readings.range(m.id, '0000', '9999', 100000).slice(-3);
    const last = last3[last3.length - 1], prev = last3[last3.length - 2];
    const issues = [];
    if (!m.serial) issues.push({ level: 'bad', text: 'No serial number recorded' });
    if (!last) issues.push({ level: 'bad', text: 'No readings yet: take a first reading' });
    else {
      const age = Math.floor((Date.now() - Date.parse(last.ts)) / DAY);
      if (age > 35) issues.push({ level: 'warn', text: `Last reading is ${age} days old` });
      if (prev && last.value < prev.value) issues.push({ level: 'bad', text: `Last reading (${last.value}) is lower than the one before (${prev.value})` });
      if (last3.length < 2) issues.push({ level: 'warn', text: 'Only one reading so far: billing needs a reading at the start and end of the month' });
    }
    if (m.tenantId && !byId(S.tenants, m.tenantId)) issues.push({ level: 'bad', text: 'Linked tenant no longer exists' });
    if (!S.settings.tariffs.some(t => t.id === m.tariffId) && !S.settings.tariffs.some(t => t.type === m.type)) issues.push({ level: 'bad', text: `No ${m.type} tariff exists yet` });
    else if (!m.tariffId) issues.push({ level: 'info', text: 'Uses the default tariff (link a tariff in step 4)' });
    const council = S.meters.find(x => x.building === m.building && x.type === (m.type === 'solar' ? 'electricity' : m.type) && x.role === 'council' && !x.removed);
    if (m.role !== 'council' && !m.parentId) issues.push(council ? { level: 'warn', text: m.type === 'solar' ? 'Not linked into the meter tree: choose the meter the solar feeds into' : 'Not in the meter tree: choose the meter it is fed from' } : { level: 'info', text: `No council ${m.type === 'solar' ? 'electricity' : m.type} meter yet: the building cannot be balanced` });
    if (m.comm === 'm2m') issues.push({ level: 'info', text: 'M2M Solutions link will be active once their API is connected' });
    const status = issues.some(i => i.level === 'bad') ? 'bad' : issues.some(i => i.level === 'warn') ? 'warn' : 'ok';
    const t = byId(S.tenants, m.tenantId);
    return { id: m.id, type: m.type, serial: m.serial, unit: m.unit, location: m.location, tenant: t ? t.name : '', status, issues, readings: last3.reverse().map(r => ({ ts: r.ts, value: r.value, source: r.source })) };
  }
  function checkBuilding(bid) {
    const b = byId(S.buildings, bid); if (!b) return { error: 'Building not found.' };
    const list = S.meters.filter(m => m.building === bid && !m.removed).map(checkMeter);
    return { ok: true, checkedAt: nowIso(), meters: list, ok_: list.filter(x => x.status === 'ok').length, warn: list.filter(x => x.status === 'warn').length, bad: list.filter(x => x.status === 'bad').length };
  }
  function assignTariffs(bid, list) {
    const b = byId(S.buildings, bid); if (!b) return { error: 'Building not found.' };
    let n = 0;
    for (const a of list || []) {
      const m = meter(a.meterId); if (!m || m.building !== bid) continue;
      if (a.tariffId && !S.settings.tariffs.find(t => t.id === a.tariffId && t.type === m.type)) return { error: `That tariff does not fit ${m.type} meter ${m.serial || m.id}.` };
      m.tariffId = a.tariffId || null; save('meters', m); n++;
    }
    changed(bid);
    return { ok: true, updated: n };
  }

  /* ---------------- meter tree & building balance ---------------- */
  function setTree(bid, list) {
    const b = byId(S.buildings, bid); if (!b) return { error: 'Building not found.' };
    if (!Array.isArray(list)) return { error: 'Nothing to save.' };
    const next = new Map(S.meters.filter(m => m.building === bid).map(m => [m.id, { parentId: m.parentId || null, role: m.role || 'sub' }]));
    for (const it of list) {
      const m = meter(it.meterId); if (!m || m.building !== bid) return { error: 'Unknown meter ' + it.meterId };
      const role = ROLES.includes(it.role) ? it.role : 'sub';
      let parentId = it.parentId || null;
      if (role === 'council') parentId = null;
      if (parentId) {
        const p = meter(parentId);
        if (!p || p.building !== bid || p.removed) return { error: `The meter that ${m.serial || m.id} is fed from was not found.` };
        const want = m.type === 'solar' ? 'electricity' : m.type;
        if (p.type !== want) return { error: `${m.serial || m.id} (${m.type}) cannot be fed from a ${p.type} meter.` };
        if (p.id === m.id) return { error: `${m.serial || m.id} cannot be fed from itself.` };
      }
      next.set(m.id, { parentId, role: m.type === 'solar' ? 'sub' : role });
    }
    for (const [id] of next) { // no loops
      const seen = new Set([id]); let cur = next.get(id).parentId;
      while (cur) { if (seen.has(cur)) return { error: `Meter ${(meter(id) || {}).serial || id} would end up feeding itself (a loop).` }; seen.add(cur); cur = (next.get(cur) || {}).parentId; }
    }
    for (const [id, v] of next) { const m = meter(id); if (m.parentId !== v.parentId || m.role !== v.role) { m.parentId = v.parentId; m.role = v.role; save('meters', m); } }
    changed(bid);
    return { ok: true };
  }
  function setTolerance(bid, tol) {
    const b = byId(S.buildings, bid); if (!b) return { error: 'Building not found.' };
    const e = +tol.electricity, w = +tol.water;
    if (!(e >= 0 && e <= 50 && w >= 0 && w <= 50)) return { error: 'Tolerance must be between 0 and 50%.' };
    b.balanceTolerance = { electricity: e, water: w }; save('buildings', b); changed(bid);
    return { ok: true };
  }
  function periodUse(m, from, to) {
    const open = nearest(m.id, from), close = nearest(m.id, to), warnings = [];
    if (!open || !close || open.ts === close.ts) warnings.push('Not enough readings for this period');
    else {
      if (open.estimated) warnings.push(`Opening reading ${open.offDays} days from the start`);
      if (close.estimated) warnings.push(`Closing reading ${close.offDays} days from the end`);
      if (close.value < open.value) warnings.push('Closing reading lower than opening');
    }
    const ok = !!(open && close && open.ts !== close.ts && close.value >= open.value);
    return { ok, use: ok ? r3((close.value - open.value) * (m.multiplier || 1)) : null, open: open && { ts: open.ts, value: open.value }, close: close && { ts: close.ts, value: close.value }, warnings };
  }
  /* Balance a building for a period: at every meter that has meters under it, supply (its own use plus any solar feeding in)
   * against the total of the meters it feeds. */
  function balance(bid, month, fromDate, toDate) {
    const b = byId(S.buildings, bid); if (!b) return { error: 'Building not found.' };
    let from, to, label;
    if (month) { const mb = monthBounds(month); if (!mb) return { error: 'Choose a month.' }; ({ from, to, label } = mb); }
    else if (isoDate(fromDate) && isoDate(toDate) && fromDate < toDate) { from = fromDate + 'T00:00:00.000Z'; to = new Date(Date.parse(toDate + 'T00:00:00.000Z') + DAY).toISOString(); label = `${fromDate} to ${toDate}`; }
    else return { error: 'Choose a month or a date range.' };
    const tol = Object.assign({ electricity: 5, water: 10 }, b.balanceTolerance || {});
    const ms = S.meters.filter(m => m.building === bid && !m.removed);
    const use = new Map(ms.map(m => [m.id, periodUse(m, from, to)]));
    const node = m => {
      const u = use.get(m.id), t = byId(S.tenants, m.tenantId);
      const kids = ms.filter(x => x.parentId === m.id && x.type === m.type).map(node);
      const solar = m.type === 'electricity' ? ms.filter(x => x.parentId === m.id && x.type === 'solar').map(node) : [];
      const n = { id: m.id, serial: m.serial, type: m.type, unit: m.unit, role: m.role || 'sub', location: m.location, tenant: t ? t.name : '', ok: u.ok, use: u.use, open: u.open, close: u.close, warnings: u.warnings, children: kids, solar };
      if (kids.length) {
        const parts = [n, ...solar, ...kids];
        const supply = r3((u.use || 0) + solar.reduce((a, x) => a + (x.use || 0), 0));
        const metered = r3(kids.reduce((a, x) => a + (x.use || 0), 0));
        const diff = r3(supply - metered), pct = supply > 0 ? r2(diff / supply * 100) : null;
        const complete = parts.every(x => x.ok);
        n.balance = { supply, metered, diff, pct, tolerance: tol[m.type],
          status: !complete ? 'incomplete' : supply <= 0 ? 'nosupply' : diff < 0 && Math.abs(pct) > tol[m.type] ? 'over' : Math.abs(pct) <= tol[m.type] ? 'ok' : 'loss',
          missing: parts.filter(x => !x.ok).map(x => x.serial || x.id) };
      }
      return n;
    };
    const trees = {};
    for (const type of ['electricity', 'water']) {
      const top = ms.filter(m => m.type === type && (!m.parentId || !ms.some(x => x.id === m.parentId)));
      const councils = top.filter(m => m.role === 'council').map(node);
      const loose = top.filter(m => m.role !== 'council').map(node);
      const orphanSolar = type === 'electricity' ? ms.filter(m => m.type === 'solar' && (!m.parentId || !ms.some(x => x.id === m.parentId))).map(node) : [];
      trees[type] = { councils, loose, orphanSolar, tolerance: tol[type] };
    }
    return { ok: true, building: bid, label, from, to, trees };
  }

  /* ---------------- reports ----------------
   * Monthly figures per building for a range of months: where the council supply went (tenants, common areas, losses),
   * solar, the balance status per utility, billing runs, and meter data quality. */
  function report(u, fromMonth, toMonth, bid) {
    const fm = monthBounds(fromMonth), tm = monthBounds(toMonth);
    if (!fm || !tm || fromMonth > toMonth) return { error: 'Choose a valid month range.' };
    const months = [];
    for (let [y, m] = fromMonth.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= toMonth; m === 12 ? (y++, m = 1) : m++) months.push(`${y}-${String(m).padStart(2, '0')}`);
    if (months.length > 24) return { error: 'Choose at most 24 months.' };
    const blds = S.buildings.filter(b => (b.divisions || []).includes('utility') && canBuilding(u, b.id) && (!bid || b.id === bid));
    const sum = arr => r3(arr.reduce((a, x) => a + (x || 0), 0));
    const buildings = [], tenants = [], quality = [];
    const now = Date.now();
    for (const b of blds) {
      const ms = S.meters.filter(m => m.building === b.id && !m.removed);
      const per = months.map(mo => {
        const mb = monthBounds(mo), use = new Map(ms.map(m => [m.id, periodUse(m, mb.from, mb.to)]));
        const bal = balance(b.id, mo);
        const out = { month: mo, label: mb.label };
        for (const type of ['electricity', 'water']) {
          const of = f => ms.filter(m => m.type === type && f(m)), u2 = list => sum(list.map(m => use.get(m.id).use));
          const council = of(m => m.role === 'council'), tenant = of(m => m.tenantId && m.role !== 'council' && m.role !== 'check'), common = of(m => !m.tenantId && (m.role || 'sub') === 'sub');
          const solar = type === 'electricity' ? ms.filter(m => m.type === 'solar') : [];
          const cs = (bal.trees && bal.trees[type].councils) || [];
          const st = cs.map(c => c.balance && c.balance.status).filter(Boolean);
          const supply = cs.reduce((a, c) => a + ((c.balance && c.balance.supply) || 0), 0), metered = cs.reduce((a, c) => a + ((c.balance && c.balance.metered) || 0), 0);
          out[type] = {
            council: council.length ? u2(council) : null, solar: solar.length ? u2(solar) : null, tenants: u2(tenant), common: u2(common),
            complete: [...council, ...tenant, ...common, ...solar].every(m => use.get(m.id).ok),
            loss: cs.length ? r3(supply - metered) : null, lossPct: cs.length && supply > 0 ? r2((supply - metered) / supply * 100) : null,
            status: !cs.length ? 'nocouncil' : st.includes('incomplete') ? 'incomplete' : st.includes('loss') ? 'loss' : st.includes('over') ? 'over' : st.length ? 'ok' : 'notree',
            tolerance: (bal.trees && bal.trees[type].tolerance) || null,
          };
        }
        out.tenantUse = Object.fromEntries(ms.filter(m => m.tenantId).map(m => [m.id, use.get(m.id).use]));
        return out;
      });
      buildings.push({ id: b.id, name: b.name, client: b.client || '', months: per });
      for (const t of S.tenants.filter(t => t.building === b.id)) {
        const tm2 = ms.filter(m => m.tenantId === t.id);
        if (!tm2.length && t.active === false) continue;
        tenants.push({ id: t.id, name: t.name, unit: t.unit || '', building: b.id, active: t.active !== false,
          use: Object.fromEntries(['electricity', 'water'].map(type => [type, per.map(p => { const l = tm2.filter(m => m.type === type).map(m => p.tenantUse[m.id]); return l.length ? sum(l) : null; })])) });
      }
      per.forEach(p => { delete p.tenantUse; });
      for (const m of ms) {
        const last = db.readings.latest(m.id), issues = [];
        if (!m.serial) issues.push(['bad', 'No serial number']);
        if (!last) issues.push(['bad', 'No readings yet']);
        else if (now - Date.parse(last.ts) > 35 * DAY) issues.push(['warn', `Last reading ${Math.floor((now - Date.parse(last.ts)) / DAY)} days ago`]);
        const rb = db.readings.range(m.id, fm.from, tm.to); let back = 0;
        for (let i = 1; i < rb.length; i++) if (rb[i].value < rb[i - 1].value) back++;
        if (back) issues.push(['bad', `${back} reading${back === 1 ? '' : 's'} lower than the one before`]);
        if (m.type !== 'solar' && m.role !== 'council' && !m.parentId && ms.some(x => x.role === 'council' && x.type === m.type)) issues.push(['warn', 'Not in the meter tree']);
        if (m.type !== 'solar' && !m.tenantId && (m.role || 'sub') === 'sub' && !m.location) issues.push(['warn', 'No shop or area recorded']);
        if (issues.length) quality.push({ meterId: m.id, serial: m.serial || '', type: m.type, building: b.id, location: m.location || '', tenant: (byId(S.tenants, m.tenantId) || {}).name || '', last: last ? last.ts : null, issues: issues.map(([level, text]) => ({ level, text })) });
      }
    }
    const ids = new Set(blds.map(b => b.id));
    const runs = S.recoveries.filter(r => ids.has(r.building) && months.includes(r.month)).map(r => ({ id: r.id, building: r.building, month: r.month, label: r.label, status: r.status, subtotal: r.subtotal || 0, total: r.total || 0, tenants: (r.lines || []).length }));
    return { ok: true, months: months.map(mo => ({ key: mo, label: monthBounds(mo).label })), buildings, tenants, quality, runs };
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

  if (S.settings.tariffs.some(t => !Array.isArray(t.fixed))) { S.settings.tariffs = S.settings.tariffs.map(normTariff).filter(t => t && !t.error); db.setKv('settings', S.settings); } // older tariff shape
  return { addFromLibrary, quote, tariffLibrary, report, setTree, setTolerance, balance, periodUse, setupRows, checkMeter, checkBuilding, assignTariffs, TYPES, TYPE_LABEL, meter, upsertMeter, setMeterRemoved, addReading, connectorReading, importReadings, deleteReading, readingsFor, upsertTenant, deleteTenant, setTariffs, createRun, recalcRun, deleteRun, approveRun, recoveryLines, stateFor, syncMeterEquipment, meterLabel };
}

module.exports = { createUtility, DEFAULT_TARIFFS };
