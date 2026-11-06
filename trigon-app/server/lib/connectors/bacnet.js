'use strict';
/* Minimal BACnet/IP client (ReadProperty, confirmed request) + polling connector.
 * Reaches IP controllers directly, and MS/TP field controllers behind a BACnet router
 * (set `network` + `mac` on the point or connector). From a cloud server the site must be
 * reachable over a VPN; otherwise run the edge agent on site.
 *
 * Point config: { path, objectType: "analogInput"|..|number, instance, property: 85,
 *                 network, mac, scale, offset, decimals, map } */
const dgram = require('node:dgram');
const { transform } = require('../util');

const OBJECT_TYPES = { analogInput: 0, analogOutput: 1, analogValue: 2, binaryInput: 3, binaryOutput: 4, binaryValue: 5, device: 8, multiStateInput: 13, multiStateOutput: 14, multiStateValue: 19 };

function encodeReadProperty(invokeId, objType, instance, prop, route) {
  const npdu = route && route.network != null
    ? (() => { const mac = Buffer.from(route.mac != null ? (Array.isArray(route.mac) ? route.mac : [route.mac]) : []); const h = Buffer.alloc(5); h[0] = 0x01; h[1] = 0x24; h.writeUInt16BE(route.network, 2); h[4] = mac.length; return Buffer.concat([h, mac, Buffer.from([0xff])]); })()
    : Buffer.from([0x01, 0x04]);
  const oid = Buffer.alloc(5); oid[0] = 0x0c; oid.writeUInt32BE((((objType & 0x3ff) << 22) | (instance & 0x3fffff)) >>> 0, 1);
  const pid = prop < 256 ? Buffer.from([0x19, prop]) : Buffer.from([0x1a, prop >> 8, prop & 0xff]);
  const apdu = Buffer.concat([Buffer.from([0x00, 0x05, invokeId, 0x0c]), oid, pid]);
  const body = Buffer.concat([npdu, apdu]);
  const bvlc = Buffer.from([0x81, 0x0a, 0, 0]); bvlc.writeUInt16BE(4 + body.length, 2);
  return Buffer.concat([bvlc, body]);
}

/* Returns { invokeId, value } or { invokeId, error } or null for frames we do not care about. */
function decodeResponse(buf) {
  if (buf.length < 6 || buf[0] !== 0x81) return null;
  let i = 4;
  if (buf[i] !== 0x01) return null;
  const ctrl = buf[i + 1]; i += 2;
  if (ctrl & 0x80) return null; // network layer message
  if (ctrl & 0x20) { i += 2; const dlen = buf[i]; i += 1 + dlen; }
  if (ctrl & 0x08) { i += 2; const slen = buf[i]; i += 1 + slen; }
  if (ctrl & 0x20) i += 1; // hop count
  const type = buf[i] >> 4;
  if (type === 5) return { invokeId: buf[i + 1], error: `BACnet error (class ${buf[i + 4]}, code ${buf[i + 6]})` };
  if (type === 6) return { invokeId: buf[i + 1], error: `BACnet reject (reason ${buf[i + 2]})` };
  if (type === 7) return { invokeId: buf[i + 1], error: `BACnet abort (reason ${buf[i + 2]})` };
  if (type !== 3) return null;
  if (buf[i] & 0x08) return { invokeId: buf[i + 1], error: 'Segmented responses are not supported' };
  const invokeId = buf[i + 1];
  i += 3;
  // walk tags until opening tag 3
  while (i < buf.length && buf[i] !== 0x3e) { const t = readTag(buf, i); if (!t) break; i = t.next; }
  if (buf[i] !== 0x3e) return { invokeId, error: 'No property value in response' };
  const t = readTag(buf, i + 1);
  if (!t || t.context) return { invokeId, error: 'Unexpected value encoding' };
  return { invokeId, value: appValue(buf, t) };
}
function readTag(buf, i) {
  if (i >= buf.length) return null;
  const b = buf[i]; let tag = b >> 4; const context = !!(b & 0x08); let lvt = b & 0x07; let p = i + 1;
  if (tag === 15) { tag = buf[p]; p++; }
  if (context && (lvt === 6 || lvt === 7)) return { tag, context, open: lvt === 6, close: lvt === 7, len: 0, start: p, next: p };
  let len = lvt;
  if (!context && tag === 1) return { tag, context, len: 0, bool: lvt === 1, start: p, next: p };
  if (lvt === 5) { len = buf[p]; p++; if (len === 254) { len = buf.readUInt16BE(p); p += 2; } else if (len === 255) { len = buf.readUInt32BE(p); p += 4; } }
  return { tag, context, len, start: p, next: p + len };
}
function appValue(buf, t) {
  const d = buf.subarray(t.start, t.start + t.len);
  switch (t.tag) {
    case 0: return null;
    case 1: return t.bool;
    case 2: case 9: return d.reduce((a, x) => a * 256 + x, 0);
    case 3: return d.length ? d.readIntBE(0, d.length) : 0;
    case 4: return +d.readFloatBE(0).toFixed(4);
    case 5: return d.readDoubleBE(0);
    case 7: return d.subarray(1).toString(d[0] === 0 ? 'utf8' : 'latin1');
    default: return d.toString('hex');
  }
}

class BacnetClient {
  constructor({ timeout = 4000, localPort = 0 } = {}) {
    this.timeout = timeout; this.invoke = 0; this.pending = new Map();
    this.sock = dgram.createSocket('udp4');
    this.sock.on('message', m => { const r = decodeResponse(m); if (!r) return; const p = this.pending.get(r.invokeId); if (!p) return; this.pending.delete(r.invokeId); clearTimeout(p.timer); r.error ? p.reject(new Error(r.error)) : p.resolve(r.value); });
    this.sock.on('error', () => {});
    this.ready = new Promise(res => this.sock.bind(localPort, res));
  }
  async readProperty(host, port, objectType, instance, property = 85, route) {
    await this.ready;
    const ot = typeof objectType === 'number' ? objectType : OBJECT_TYPES[objectType];
    if (ot == null) throw new Error('Unknown objectType ' + objectType);
    const id = this.invoke = (this.invoke + 1) & 0xff;
    const pkt = encodeReadProperty(id, ot, instance, property, route);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`BACnet timeout ${host} ${objectType}:${instance}`)); }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.sock.send(pkt, port, host);
    });
  }
  close() { try { this.sock.close(); } catch { /* closed */ } }
}

async function pollOnce(client, c) {
  const values = {}, errors = [];
  for (const pt of c.points || []) {
    try {
      const route = pt.network != null ? pt : (c.network != null ? c : null);
      const v = await client.readProperty(pt.host || c.host, pt.port || c.port || 47808, pt.objectType, pt.instance, pt.property || 85, route);
      values[pt.path] = transform(v, pt);
    } catch (e) { errors.push(`${pt.path}: ${e.message}`); }
  }
  return { values, errors };
}

/* Connector config: { type: "bacnet", host, port: 47808, intervalSec, timeoutMs, network?, mac?, points: [...] } */
function start(building, ctx) {
  const c = building.connector;
  const client = new BacnetClient({ timeout: c.timeoutMs || 4000 });
  let stopped = false, timer = null;
  async function loop() {
    if (stopped) return;
    const { values, errors } = await pollOnce(client, c);
    if (Object.keys(values).length) ctx.apply(values);
    ctx.status({ ok: Object.keys(values).length > 0, error: errors.length ? errors.slice(0, 3).join('; ') : null, detail: `${Object.keys(values).length}/${(c.points || []).length} points` });
    if (!stopped) timer = setTimeout(loop, (c.intervalSec || 15) * 1000);
  }
  loop();
  return { stop() { stopped = true; clearTimeout(timer); client.close(); } };
}

module.exports = { BacnetClient, encodeReadProperty, decodeResponse, pollOnce, start, OBJECT_TYPES };
