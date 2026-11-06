'use strict';
const crypto = require('node:crypto');

const nowIso = () => new Date().toISOString();
const rid = (n = 12) => crypto.randomBytes(n).toString('base64url');
const byId = (arr, id) => arr.find(x => x.id === id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function log(...a) { console.log(new Date().toISOString(), ...a); }

/** Normalise a phone number to E.164. Local numbers (leading 0) get the default country code. */
function normalizePhone(num, cc = process.env.SMS_DEFAULT_COUNTRY || '27') {
  if (!num) return null;
  let n = String(num).replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (n.startsWith('0')) n = '+' + cc + n.slice(1);
  if (!n.startsWith('+')) n = '+' + n;
  return /^\+\d{8,15}$/.test(n) ? n : null;
}

/* ---- BMS model paths ----
 * Points are mapped to paths like "ahus.AHU-02.supplyHz", "zones.L2-C.temp" or "humidity".
 * Collections are arrays of objects keyed by id; missing items are created on first write,
 * so a real building's model is built from its point map. */
const COLLECTIONS = ['zones', 'ahus', 'chillers', 'pumps', 'towers', 'fans', 'fcus'];
const TEMPLATES = {
  zones: id => { const m = /L(\d+)/i.exec(id); const p = /-([A-Z0-9]+)$/i.exec(id); return { id, floor: m ? +m[1] : 1, pos: p ? p[1] : id, temp: null, target: null, setpoint: 22, online: true }; },
  ahus: id => ({ id, name: id, status: 'unknown', supplyHz: null, returnHz: null, supplyTemp: null, returnTemp: null, mixedTemp: null, outsideTemp: null, chwValve: null, damper: null, filterDp: null, mode: 'Auto' }),
  chillers: id => ({ id, name: 'Chiller', status: 'unknown', load: null, chws: null, chwr: null, comps: [] }),
  pumps: id => ({ id, type: 'Pump', status: 'unknown', hz: null }),
  towers: id => ({ id, status: 'unknown', fan: null, leaving: null, entering: null }),
  fans: id => ({ id, name: id, status: 'unknown' }),
  fcus: id => ({ id, zone: '', status: 'unknown', valve: null }),
};
function emptyBms() {
  return { zones: [], ahus: [], chillers: [], pumps: [], towers: [], fans: [], fcus: [], humidity: null, co2: null, outside: null, trend: [], fault: null, updatedAt: null };
}
function setPath(bms, path, value) {
  const parts = String(path).split('.');
  if (parts.length === 1) { bms[parts[0]] = value; return true; }
  const [coll, id, field] = parts;
  if (!COLLECTIONS.includes(coll) || !id || !field) return false;
  if (!Array.isArray(bms[coll])) bms[coll] = [];
  let item = bms[coll].find(x => x.id === id);
  if (!item) { item = TEMPLATES[coll](id); bms[coll].push(item); }
  item[field] = value;
  return true;
}

/** Apply point scaling and value maps (e.g. {"0":"off","1":"running","2":"tripped"}). */
function transform(raw, pt) {
  let v = raw;
  if (typeof v === 'boolean' && pt.map) return pt.map[String(v)] ?? v;
  if (typeof v === 'number') {
    if (pt.scale != null) v = v * pt.scale;
    if (pt.offset != null) v = v + pt.offset;
    if (pt.map) return pt.map[String(Math.round(v))] ?? pt.map.default ?? v;
    if (pt.decimals != null) v = +v.toFixed(pt.decimals); else v = Math.round(v * 100) / 100;
  } else if (pt.map && v != null) return pt.map[String(v)] ?? v;
  return v;
}

module.exports = { nowIso, rid, byId, clamp, log, normalizePhone, setPath, transform, emptyBms, COLLECTIONS };
