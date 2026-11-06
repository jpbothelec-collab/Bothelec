'use strict';
/* Bothelec Aircon Solutions edge agent — runs on a small PC / Raspberry Pi at the building, polls the local BMS
 * (Modbus TCP or BACnet/IP) and pushes readings to the cloud server over HTTPS.
 * Use it when the cloud server cannot reach the controller (no VPN / no port forwarding).
 *
 *   node agent/agent.js agent/config.json
 *
 * config.json: { "server": "https://aircon.example.co.za", "building": "B1", "token": "<ingest token>",
 *                "intervalSec": 15, "connector": { "type": "modbus", "host": "192.168.1.50", "points": [...] } }
 * The connector block uses the same format as Settings → Buildings → BMS connection. */
const fs = require('node:fs');
const path = require('node:path');
const modbus = require('../server/lib/connectors/modbus');
const bacnet = require('../server/lib/connectors/bacnet');

const file = process.argv[2] || process.env.AGENT_CONFIG || path.join(__dirname, 'config.json');
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
const c = cfg.connector || {};
const log = (...a) => console.log(new Date().toISOString(), ...a);
if (!cfg.server || !cfg.building || !cfg.token) { console.error('config needs server, building and token'); process.exit(1); }

let client;
if (c.type === 'modbus') client = new modbus.ModbusTcp({ host: c.host, port: c.port || 502, unitId: c.unitId || 1, timeout: c.timeoutMs || 5000 });
else if (c.type === 'bacnet') client = new bacnet.BacnetClient({ timeout: c.timeoutMs || 4000 });
else { console.error('connector.type must be modbus or bacnet'); process.exit(1); }

let backoff = 0;
async function loop() {
  try {
    const { values, errors } = c.type === 'modbus' ? await modbus.pollOnce(client, c.points || []) : await bacnet.pollOnce(client, c);
    if (errors.length) log('read errors:', errors.slice(0, 5).join(' | '));
    if (Object.keys(values).length) {
      const res = await fetch(`${cfg.server.replace(/\/$/, '')}/api/ingest/${encodeURIComponent(cfg.building)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.token },
        body: JSON.stringify({ values, source: 'agent-' + c.type }), signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`server ${res.status}: ${(await res.text()).slice(0, 200)}`);
      log(`sent ${Object.keys(values).length} values`);
    }
    backoff = 0;
  } catch (e) { backoff = Math.min(backoff + 1, 6); log('error:', e.message); }
  setTimeout(loop, ((cfg.intervalSec || c.intervalSec || 15) + backoff * 10) * 1000);
}
log(`Bothelec agent for ${cfg.building} → ${cfg.server} (${c.type}, ${(c.points || []).length} points)`);
loop();
