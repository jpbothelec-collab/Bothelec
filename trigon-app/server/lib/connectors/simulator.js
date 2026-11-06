'use strict';
/* Simulated plant for demonstration buildings. Mutates the building's BMS model every 3 s and
 * reacts to job completion (a repaired unit restarts and its zone cools back into band). */
const { clamp, byId } = require('../util');

const jit = (v, base, amp, k = 0.3) => +((v ?? base) + (base - (v ?? base)) * k + (Math.random() - 0.5) * amp).toFixed(1);

function start(building, ctx) {
  const bid = building.id;
  const bm = () => ctx.model.S.bms[bid];
  function tick() {
    const b = bm(); if (!b) return;
    b.zones.forEach(z => { if (z.target == null) z.target = z.temp ?? 22; z.temp = +((z.temp ?? z.target) + (z.target - (z.temp ?? z.target)) * 0.18 + (Math.random() - 0.5) * 0.1).toFixed(1); });
    b.ahus.forEach(a => {
      if (a.status === 'running') {
        a.supplyTemp = jit(a.supplyTemp, 13.4, 0.2); a.returnTemp = jit(a.returnTemp, 22.9, 0.2); a.mixedTemp = jit(a.mixedTemp, 24.7, 0.2);
        a.chwValve = clamp(Math.round((a.chwValve ?? 64) + (64 - (a.chwValve ?? 64)) * 0.3 + (Math.random() - .5) * 4), 0, 100);
        a.supplyHz = 48; a.returnHz = 42;
        a.filterDp = clamp(Math.round((a.filterDp ?? 118) + (118 - (a.filterDp ?? 118)) * .3 + (Math.random() - .5) * 4), 60, 250);
      } else if (a.status === 'tripped') { a.supplyHz = 0; a.supplyTemp = jit(a.supplyTemp, 24.5, 0.2); a.chwValve = 0; }
      else { a.supplyHz = 0; a.returnHz = 0; }
    });
    const ch = b.chillers[0];
    if (ch) { ch.load = clamp(Math.round(ch.load + (78 - ch.load) * .3 + (Math.random() - .5) * 4), 0, 100); ch.chws = jit(ch.chws, 6.4, 0.15); ch.chwr = jit(ch.chwr, 12.1, 0.2); }
    b.towers.forEach(t => { t.leaving = jit(t.leaving, 27.5, 0.15); });
    b.humidity = clamp(Math.round((b.humidity ?? 54) + (54 - (b.humidity ?? 54)) * .3 + (Math.random() - .5) * 2), 40, 70);
    b.co2 = clamp(Math.round((b.co2 ?? 615) + (615 - (b.co2 ?? 615)) * .3 + (Math.random() - .5) * 14), 400, 1200);
    b.outside = jit(b.outside, 28.3, 0.1);
    b.fcus.forEach(f => { const z = byId(b.zones, f.zone); if (z) f.valve = clamp(Math.round(40 + (z.temp - 21) * 15 + (Math.random() - .5) * 6), 0, 100); });
    ctx.model.applyReadings(bid, {}, 'simulator');
  }
  const timer = setInterval(tick, 3000);
  const onStep = ({ job, key }) => {
    if (key !== 'completed' || job.building !== bid) return;
    const b = bm(); if (!b) return;
    const unit = job.equipment.split(' · ')[0];
    const a = b.ahus.find(x => x.id === unit && x.status === 'tripped');
    if (a) { a.status = 'running'; a.supplyHz = 48; (a.zones || ['L2-C']).forEach(zid => { const z = byId(b.zones, zid); if (z) z.target = 22.3; }); }
  };
  ctx.bus.on('job:step', onStep);
  ctx.status({ ok: true, error: null, detail: 'Simulated plant' });
  return {
    stop() { clearInterval(timer); ctx.bus.off('job:step', onStep); },
    /* Demonstration: trip AHU-02's supply fan; Zone L2-C warms up. */
    simulateFault() {
      const b = bm(); const a = b && b.ahus.find(x => x.id === 'AHU-02');
      if (!a) return { error: 'No AHU-02 in this building' };
      if (a.status === 'tripped') return { error: 'Fault already in progress' };
      a.status = 'tripped'; a.supplyHz = 0; a.zones = ['L2-C'];
      const z = byId(b.zones, 'L2-C'); if (z) { z.target = 26.6; z.temp = Math.max(z.temp, 24.6); }
      ctx.model.applyReadings(bid, {}, 'simulator');
      return { ok: true, alarm: b.fault && b.fault.alarm };
    },
    adjustSetpoint(ids, delta) {
      const b = bm();
      ids.forEach(id => { const z = byId(b.zones, id); if (z) { z.setpoint = clamp(z.setpoint + delta, 18, 26); const tripped = b.ahus.some(a => a.status === 'tripped' && (a.zones || []).includes(id)); if (!tripped) z.target = z.setpoint; } });
      ctx.model.applyReadings(bid, {}, 'simulator');
      return { ok: true };
    },
  };
}

module.exports = { start };
