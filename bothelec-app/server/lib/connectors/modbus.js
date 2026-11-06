'use strict';
/* Modbus TCP client + polling connector. Works with BMS controllers directly, with Modbus
 * gateways, and with 4G routers that forward/serve Modbus TCP (e.g. Teltonika Modbus TCP gateway
 * to RS485 devices). No external dependencies.
 *
 * Point config: { path, fc: 1|2|3|4, address, type: bool|uint16|int16|uint32|int32|float32,
 *                 wordOrder: "BE"|"LE", unitId, scale, offset, decimals, map } */
const net = require('node:net');
const { transform } = require('../util');

class ModbusTcp {
  constructor({ host, port = 502, unitId = 1, timeout = 5000 }) {
    Object.assign(this, { host, port, unitId, timeout });
    this.tid = 0; this.pending = new Map(); this.buf = Buffer.alloc(0); this.sock = null;
  }
  connect() {
    if (this.sock && !this.sock.destroyed) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host: this.host, port: this.port });
      const t = setTimeout(() => { s.destroy(); reject(new Error(`Modbus connect timeout ${this.host}:${this.port}`)); }, this.timeout);
      s.once('connect', () => { clearTimeout(t); this.sock = s; resolve(); });
      s.once('error', e => { clearTimeout(t); reject(e); });
      s.on('data', d => this._onData(d));
      s.on('close', () => { this.sock = null; for (const p of this.pending.values()) p.reject(new Error('Modbus connection closed')); this.pending.clear(); });
      s.on('error', () => {});
    });
  }
  _onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 7) {
      const len = this.buf.readUInt16BE(4);
      if (this.buf.length < 6 + len) break;
      const frame = this.buf.subarray(0, 6 + len);
      this.buf = this.buf.subarray(6 + len);
      const tid = frame.readUInt16BE(0), p = this.pending.get(tid);
      if (!p) continue;
      this.pending.delete(tid); clearTimeout(p.timer);
      const fc = frame[7];
      if (fc & 0x80) { p.reject(new Error(`Modbus exception ${frame[8]} (fc ${fc & 0x7f}, address ${p.address})`)); continue; }
      p.resolve(frame.subarray(9, 9 + frame[8]));
    }
  }
  async read(fc, address, quantity, unitId = this.unitId) {
    await this.connect();
    const tid = this.tid = (this.tid + 1) & 0xffff;
    const req = Buffer.alloc(12);
    req.writeUInt16BE(tid, 0); req.writeUInt16BE(0, 2); req.writeUInt16BE(6, 4); req.writeUInt8(unitId, 6);
    req.writeUInt8(fc, 7); req.writeUInt16BE(address, 8); req.writeUInt16BE(quantity, 10);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(tid); reject(new Error(`Modbus timeout (fc ${fc}, address ${address})`)); }, this.timeout);
      this.pending.set(tid, { resolve, reject, timer, address });
      this.sock.write(req);
    });
  }
  close() { if (this.sock) this.sock.destroy(); this.sock = null; }
}

const WORDS = { bool: 1, uint16: 1, int16: 1, uint32: 2, int32: 2, float32: 2 };
function decode(data, pt) {
  const fc = pt.fc || 3;
  if (fc === 1 || fc === 2) return (data[0] & 1) === 1;
  let b = Buffer.from(data);
  if (WORDS[pt.type || 'uint16'] === 2 && (pt.wordOrder || 'BE') === 'LE') b = Buffer.concat([b.subarray(2, 4), b.subarray(0, 2)]);
  switch (pt.type || 'uint16') {
    case 'bool': return (b.readUInt16BE(0) & (1 << (pt.bit || 0))) !== 0;
    case 'int16': return b.readInt16BE(0);
    case 'uint32': return b.readUInt32BE(0);
    case 'int32': return b.readInt32BE(0);
    case 'float32': return b.readFloatBE(0);
    default: return b.readUInt16BE(0);
  }
}

/** Poll every point once; returns { values: {path: value}, errors: [] } */
async function pollOnce(client, points) {
  const values = {}, errors = [];
  for (const pt of points) {
    try {
      const fc = pt.fc || 3;
      const qty = fc === 1 || fc === 2 ? 1 : WORDS[pt.type || 'uint16'] || 1;
      const data = await client.read(fc, pt.address, qty, pt.unitId);
      values[pt.path] = transform(decode(data, pt), pt);
    } catch (e) { errors.push(`${pt.path}: ${e.message}`); if (/closed|ECONN|timeout/i.test(e.message)) client.close(); }
  }
  return { values, errors };
}

/* Connector config: { type: "modbus", host, port, unitId, intervalSec, timeoutMs, points: [...] } */
function start(building, ctx) {
  const c = building.connector;
  const client = new ModbusTcp({ host: c.host, port: c.port || 502, unitId: c.unitId || 1, timeout: c.timeoutMs || 5000 });
  let stopped = false, timer = null;
  async function loop() {
    if (stopped) return;
    try {
      const { values, errors } = await pollOnce(client, c.points || []);
      if (Object.keys(values).length) ctx.apply(values);
      ctx.status({ ok: !errors.length || Object.keys(values).length > 0, error: errors.length ? errors.slice(0, 3).join('; ') : null, detail: `${Object.keys(values).length}/${(c.points || []).length} points` });
    } catch (e) { ctx.status({ ok: false, error: e.message }); client.close(); }
    if (!stopped) timer = setTimeout(loop, (c.intervalSec || 15) * 1000);
  }
  loop();
  return { stop() { stopped = true; clearTimeout(timer); client.close(); } };
}

module.exports = { ModbusTcp, decode, pollOnce, start };
