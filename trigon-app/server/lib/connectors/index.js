'use strict';
/* Starts/stops one connector per building, restarting when the building's settings change.
 * Types: simulator | modbus | bacnet | mqtt | http (passive: gateway or edge agent POSTs to
 * /api/ingest/<building>) | none. Inbound GSM alarm SMS are handled by the webhook route. */
const { log, nowIso } = require('../util');
const DRIVERS = { simulator: require('./simulator'), modbus: require('./modbus'), bacnet: require('./bacnet'), mqtt: require('./mqtt') };

function createConnectorManager({ model, bus }) {
  const running = new Map();
  function startOne(b) {
    stopOne(b.id);
    const type = (b.connector || {}).type || 'none';
    model.setConnStatus(b.id, { type, startedAt: Date.now(), ok: null, error: null, detail: type === 'http' ? 'Waiting for gateway / agent to POST data' : '' });
    const driver = DRIVERS[type];
    if (!driver) return;
    try {
      const inst = driver.start(b, {
        model, bus,
        apply: values => model.applyReadings(b.id, values, type),
        status: st => model.setConnStatus(b.id, { type, ...st }),
      });
      running.set(b.id, inst);
      log(`[connector] ${b.id} ${type} started`);
    } catch (e) { model.setConnStatus(b.id, { type, ok: false, error: e.message, at: nowIso() }); log('[connector]', b.id, e.message); }
  }
  function stopOne(id) { const r = running.get(id); if (r) { try { r.stop(); } catch { /* ignore */ } running.delete(id); } }
  bus.on('building:changed', b => (b.deleted ? stopOne(b.id) : startOne(b)));
  return {
    startAll() { model.S.buildings.forEach(startOne); },
    stopAll() { [...running.keys()].forEach(stopOne); },
    get: id => running.get(id),
  };
}

module.exports = { createConnectorManager };
