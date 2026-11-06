/* Trigon Air — Operations, Service & Building Monitoring web app.
 * Vanilla JS single-page app. Hash routing, event delegation, simulated BMS feed. */
(function () {
  'use strict';

  let S = Store.load();
  const STEPS = Store.STEPS;
  const RECIP = Store.RECIPIENTS;
  const ui = { jobFilter: 'open', zoneSel: ['L2-C', 'L1-E'], pendingPhotos: [], sigDirty: false, unread: 0 };

  /* ---------------- helpers ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nowIso = () => new Date().toISOString();
  const hhmm = iso => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
  const dmy = iso => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const byId = (arr, id) => arr.find(x => x.id === id);
  const bld = id => byId(S.buildings, id) || {};
  const tech = id => byId(S.technicians, id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const jit = (v, base, amp, k = 0.3) => +(v + (base - v) * k + (Math.random() - 0.5) * amp).toFixed(1);
  const mins = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);
  const dur = m => m == null || isNaN(m) ? '—' : (m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min');
  const stepIdx = k => STEPS.findIndex(s => s.key === k);
  const stepLabel = k => (STEPS[stepIdx(k)] || {}).label || k;

  const ICONS = {
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    info: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20M12 8h.01M11 12h1v5h1',
    wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
    truck: 'M1 5h13v11H1zM14 9h4l3 3.5V16h-7zM3.5 18.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15.5 18.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    pin: 'M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12zM12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5',
    clipboard: 'M9 2h6v4H9zM7 4H5v18h14V4h-2M8 11h8M8 15h6',
    bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4',
    phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
    card: 'M5 2h10l4 4v16H5zM9 9h6M9 13h6M9 17h4',
    users: 'M9 11a4 4 0 1 0 0-8a4 4 0 1 0 0 8M2 21v-1a6 6 0 0 1 12 0v1M16 3.1a4 4 0 0 1 0 7.8M22 21v-1a6 6 0 0 0-4-5.7',
    check: 'M20 6 9 17l-5-5',
    chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
    building: 'M4 21V3h10v18M14 9h6v12M7 7h2M7 11h2M7 15h2M17 13h1M17 17h1M2 21h20',
    doc: 'M6 2h9l5 5v15H6zM14 2v6h6',
    snow: 'M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9',
    fan: 'M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4M12 10c-1-4 0-7 3-7 2.5 0 2.5 4-1 7M14 12c4-1 7 0 7 3 0 2.5-4 2.5-7-1M12 14c1 4 0 7-3 7-2.5 0-2.5-4 1-7M10 12c-4 1-7 0-7-3 0-2.5 4-2.5 7 1',
    wind: 'M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7',
    tower: 'M7 21 9 6h6l2 15M5 21h14M9 6c0-3 6-3 6 0M9.5 11h5M8.8 16h6.4',
    pump: 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M17 12h5M2 12h5M12 7V3M9 3h6',
    thermo: 'M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z',
    alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
    trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    bolt: 'M13 2 3 14h9l-1 8 10-12h-9z',
    eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
    clock: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20M12 6v6l4 2',
    plus: 'M12 5v14M5 12h14',
    camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 9.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7',
    route: 'M4 19a2 2 0 1 0 4 0a2 2 0 1 0-4 0M16 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 17V9a4 4 0 0 1 4-4h6M18 7v8a4 4 0 0 1-4 4H8',
    fcu: 'M3 6h18v12H3zM6 10h12M6 14h12',
    x: 'M18 6 6 18M6 6l12 12',
    back: 'M15 18l-6-6 6-6',
    print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
    reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  };
  const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ''}"/></svg>`;
  const icS = n => `<span class="ico">${ic(n)}</span>`;

  const statusPill = st => {
    const m = { running: 'ok', Running: 'ok', available: 'ok', Normal: 'ok', Delivered: 'ok', Cleared: 'off', standby: 'warn', Standby: 'warn', Scheduled: 'info', 'In transit': 'info', 'on job': 'info', 'in transit': 'info', 'on site': 'ok', tripped: 'bad', Tripped: 'bad', Active: 'bad', High: 'bad', Low: 'info', off: 'off', parked: 'off', Info: 'info' };
    return `<span class="pill ${m[st] || 'off'}"><i></i>${esc(st)}</span>`;
  };
  const urgPill = u => `<span class="pill ${{ Low: 'off', Medium: 'info', High: 'warn', Critical: 'bad' }[u] || 'off'}">${esc(u)}</span>`;
  const prioPill = p => `<span class="pill ${{ Low: 'info', Medium: 'warn', High: 'bad', Critical: 'bad' }[p] || 'off'}">${esc(p)}</span>`;
  const jobStatusPill = j => {
    const i = stepIdx(j.status);
    const cls = i >= 5 ? 'ok' : i >= 3 ? 'info' : i >= 1 ? 'warn' : 'bad';
    return `<span class="pill ${cls}"><i></i>${esc(stepLabel(j.status))}</span>`;
  };

  function toast(title, body, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = `<strong>${esc(title)}</strong>${body ? `<small>${esc(body)}</small>` : ''}`;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }
  function feed(title, body, kind, link) {
    S.feed.unshift({ at: nowIso(), title, body, kind: kind || '', link: link || '' });
    S.feed.length = Math.min(S.feed.length, 200);
    ui.unread++;
    updateBell();
  }

  /* ---------------- navigation ---------------- */
  const SERVICE_SIDE = [
    ['service/live', 'Live Jobs', 'grid'], ['service/callout', 'Call-outs', 'phone'], ['service/jobcards', 'Job Cards', 'card'],
    ['service/techs', 'Technicians', 'users'], ['service/notifications', 'Notifications', 'bell'], ['assessments', 'Assessments', 'clipboard'],
    ['service/reports', 'Reports', 'chart'], ['service/clients', 'Clients', 'building'], ['service/documents', 'Documents', 'doc'],
  ];
  const BMS_SIDE = [
    ['bms/overview', 'Site Overview', 'building'], ['bms/chillers', 'Chiller Plants', 'snow'], ['bms/ahus', 'AHUs & Ventilation', 'wind'],
    ['bms/fcus', 'FCU Units', 'fcu'], ['bms/towers', 'Cooling Towers', 'tower'], ['bms/pumps', 'Pumps & Booster Sets', 'pump'],
    ['bms/fans', 'Fans & Extracts', 'fan'], ['bms/zones', 'Temperatures', 'thermo'], ['bms/alarms', 'Alarms', 'alert'],
    ['bms/trends', 'Trends', 'trend'], ['bms/points', 'Point Register', 'list'], ['service/documents', 'Documents', 'doc'],
  ];
  const MODULES = [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid', home: 'dashboard', side: SERVICE_SIDE, sub: 'Operations & Service' },
    { id: 'bms', label: 'Info Hub', icon: 'info', home: 'bms/overview', side: BMS_SIDE, sub: 'Building Monitoring Centre' },
    { id: 'service', label: 'Service & Maintenance', short: 'Service', icon: 'wrench', home: 'service/live', side: SERVICE_SIDE, sub: 'Operations & Service' },
    { id: 'vehicles', label: 'Vehicles', icon: 'truck', home: 'vehicles', side: [['vehicles', 'Fleet', 'truck'], ['vehicles/service', 'Service schedule', 'wrench']], sub: 'Fleet' },
    { id: 'dispatch', label: 'Driver Dispatch', short: 'Dispatch', icon: 'pin', home: 'dispatch', side: [['dispatch', 'Trips & deliveries', 'route'], ['dispatch/new', 'New trip', 'plus']], sub: 'Logistics' },
    { id: 'assessments', label: 'Assessments', short: 'Assess', icon: 'clipboard', home: 'assessments', side: [['assessments', 'All assessments', 'clipboard'], ['assessments/new', 'New assessment', 'plus']], sub: 'Site assessments' },
  ];

  function renderNav(mod, key) {
    $('#modules').innerHTML = MODULES.map(m =>
      `<a href="#/${m.home}" class="${m.id === mod.id ? 'active' : ''}" title="${esc(m.label)}">${ic(m.icon)}<span class="l">${esc(m.label)}</span><span class="s">${esc(m.short || m.label)}</span></a>`).join('');
    $('#brandSub').textContent = mod.sub;
    const activeAlarms = S.alarms.filter(a => a.status === 'Active').length;
    $('#sidebar').innerHTML = `
      <div class="site-card">${icS('building')}<div><strong>Demonstration Site</strong><small>Midrand</small><span class="pill ok" style="margin-top:3px;width:max-content"><i></i>Online</span></div></div>
      <nav class="side">${mod.side.map(([href, label, icon]) => {
        const on = key === href || (key.startsWith(href + '/') && href.includes('/')) || (href === 'bms/ahus' && key === 'bms/ahu') || (href === 'service/jobcards' && (key === 'service/job' || key === 'service/report')) || (href === 'bms/alarms' && key === 'bms/alarm');
        const count = href === 'bms/alarms' && activeAlarms ? `<span class="count">${activeAlarms}</span>` : '';
        return `<a href="#/${href}" class="${on ? 'active' : ''}">${ic(icon)}<span>${esc(label)}</span>${count}</a>`;
      }).join('')}</nav>
      ${mod.id === 'bms' ? `<div class="side-label">AHU units (${S.bms.ahus.length})</div><nav class="side">${S.bms.ahus.map(a =>
        `<a href="#/bms/ahu/${a.id}" class="${key === 'bms/ahu' && current.arg === a.id ? 'active' : ''}">${ic('wind')}<span>${a.id}</span><span style="margin-left:auto">${dot(a.status)}</span></a>`).join('')}</nav>` : ''}`;
    const act = $('#sidebar .side a.active');
    if (act && window.innerWidth <= 900) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  const dot = st => `<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${st === 'running' ? 'var(--accent)' : st === 'tripped' ? 'var(--red)' : st === 'standby' ? 'var(--amber)' : 'var(--muted)'}"></i>`;

  function updateBell() {
    const b = $('#bellBadge');
    b.hidden = !ui.unread;
    b.textContent = ui.unread > 99 ? '99+' : ui.unread;
  }

  /* ---------------- job workflow ---------------- */
  function notifyStep(job, key) {
    const at = job.steps[key];
    RECIP.forEach(r => {
      if (r.role === 'Technician' && !job.tech) return;
      job.notifications.push({ step: key, role: r.role, channel: r.channel, at });
    });
  }
  function setStep(job, key) {
    job.steps[key] = nowIso();
    job.status = key;
    notifyStep(job, key);
    const b = bld(job.building);
    feed(`${job.id} · ${stepLabel(key)}`, `${b.name} — ${job.equipment}`, '', '#/service/job/' + job.id);
    onJobStep(job, key);
    Store.save();
  }
  function autoAssign(job) {
    const avail = S.technicians.filter(t => t.status === 'available');
    if (!avail.length) { toast('No technician available', 'All technicians are on jobs or off duty.', 'bad'); return false; }
    const hvac = /AHU|CH|chiller|Chill/i.test(job.equipment);
    const t = (hvac && avail.find(x => /Chillers|AHU/.test(x.skill))) || avail[0];
    job.tech = t.id; t.status = 'on job'; t.job = job.id;
    const v = byId(S.vehicles, t.vehicle); if (v) { v.status = 'in transit'; v.location = '→ ' + bld(job.building).area; }
    setStep(job, 'assigned');
    return true;
  }
  function newJob(o) {
    const job = Object.assign({ id: 'TR-' + S.seq++, source: 'Client app', urgency: 'Medium', photos: [], findings: '', work: '', signature: null, signedBy: '', notifications: [], steps: {} }, o);
    S.jobs.unshift(job);
    setStep(job, 'logged');
    return job;
  }
  function advance(job) {
    const i = stepIdx(job.status);
    const next = STEPS[i + 1];
    if (!next) return;
    if (next.key === 'assigned') return autoAssign(job);
    if (next.key === 'completed' && (!job.findings.trim() || !job.work.trim())) {
      toast('Job card incomplete', 'Record the findings and the work completed first.', 'bad'); return false;
    }
    if (next.key === 'report') { toast('Signature needed', 'Capture the customer signature to complete the report.', 'bad'); return false; }
    if (next.key === 'onsite') { const t = tech(job.tech); const v = t && byId(S.vehicles, t.vehicle); if (v) { v.status = 'on site'; v.location = bld(job.building).area; } }
    setStep(job, next.key);
    return true;
  }
  const NEXT_LABEL = { assigned: 'Assign technician', enroute: 'Technician on the way', onsite: 'Check in on site', completed: 'Mark work completed' };

  /* ---------------- BMS simulation ---------------- */
  function zoneState(z) { if (!z.online) return 'Offline'; return z.temp > 24 ? 'High' : z.temp < 20 ? 'Low' : 'Normal'; }
  function seedTrend() {
    if (S.bms.trend.length) return;
    const zs = S.bms.zones;
    for (let i = 80; i > 0; i--) {
      S.bms.trend.push({ t: Date.now() - i * 3000, z: Object.fromEntries(zs.map(z => [z.id, +(z.temp + (Math.random() - .5) * .3).toFixed(1)])), chws: +(6.4 + (Math.random() - .5) * .2).toFixed(1), chwr: +(12.1 + (Math.random() - .5) * .3).toFixed(1), sat: +(13.4 + (Math.random() - .5) * .3).toFixed(1), hum: 54, co2: 615 });
    }
  }
  function tick() {
    const b = S.bms;
    b.zones.forEach(z => { z.temp = +(z.temp + (z.target - z.temp) * 0.18 + (Math.random() - 0.5) * 0.1).toFixed(1); });
    b.ahus.forEach(a => {
      if (a.status === 'running') {
        a.supplyTemp = jit(a.supplyTemp, 13.4, 0.2); a.returnTemp = jit(a.returnTemp, 22.9, 0.2); a.mixedTemp = jit(a.mixedTemp, 24.7, 0.2);
        a.chwValve = clamp(Math.round(a.chwValve + (64 - a.chwValve) * 0.3 + (Math.random() - .5) * 4), 0, 100);
        a.supplyHz = 48; a.returnHz = 42; a.filterDp = clamp(Math.round(a.filterDp + (118 - a.filterDp) * .3 + (Math.random() - .5) * 4), 60, 250);
      } else if (a.status === 'tripped') {
        a.supplyHz = 0; a.supplyTemp = jit(a.supplyTemp, 24.5, 0.2); a.chwValve = 0;
      } else { a.supplyHz = 0; a.returnHz = 0; }
    });
    const ch = b.chillers[0];
    ch.load = clamp(Math.round(ch.load + (78 - ch.load) * .3 + (Math.random() - .5) * 4), 0, 100);
    ch.chws = jit(ch.chws, 6.4, 0.15); ch.chwr = jit(ch.chwr, 12.1, 0.2);
    b.towers.forEach(t => { t.leaving = jit(t.leaving, 27.5, 0.15); });
    b.humidity = clamp(Math.round(b.humidity + (54 - b.humidity) * .3 + (Math.random() - .5) * 2), 40, 70);
    b.co2 = clamp(Math.round(b.co2 + (615 - b.co2) * .3 + (Math.random() - .5) * 14), 400, 1200);
    b.outside = jit(b.outside, 28.3, 0.1);
    b.fcus.forEach(f => { const z = byId(b.zones, f.zone); f.valve = clamp(Math.round(40 + (z.temp - 21) * 15 + (Math.random() - .5) * 6), 0, 100); });
    const run = b.ahus.filter(a => a.status === 'running');
    b.trend.push({ t: Date.now(), z: Object.fromEntries(b.zones.map(z => [z.id, z.temp])), chws: ch.chws, chwr: ch.chwr, sat: run.length ? +(run.reduce((s, a) => s + a.supplyTemp, 0) / run.length).toFixed(1) : null, hum: b.humidity, co2: b.co2 });
    if (b.trend.length > 120) b.trend.splice(0, b.trend.length - 120);
    checkZones();
    checkFaultRecovery();
    Store.save();
    if (isLive()) render(true);
  }
  function checkZones() {
    S.bms.zones.forEach(z => {
      const st = zoneState(z);
      const open = S.alarms.find(a => a.zone === z.id && a.status === 'Active');
      if ((st === 'High' || st === 'Low') && !open) {
        const a = { id: 'A' + Date.now() + z.id, at: nowIso(), priority: 'High', equip: 'Zone ' + z.id, zone: z.id, desc: `Zone ${z.id} · ${z.temp} °C (${st === 'High' ? '>24' : '<20'} °C)`, status: 'Active', history: [{ at: nowIso(), label: 'Out of comfort band', detail: `${z.temp} °C` }] };
        S.alarms.unshift(a);
        feed('Zone ' + z.id + ' out of comfort band', `${z.temp} °C · comfort band 20–24 °C`, 'bad', '#/bms/zones');
        toast('Zone ' + z.id + ' out of comfort band', `${z.temp} °C`, 'bad');
      } else if (st === 'Normal' && open) {
        open.status = 'Cleared'; open.history.push({ at: nowIso(), label: 'Back in comfort band', detail: `${z.temp} °C` });
      }
    });
  }
  function respond(alarm, label, detail) { alarm.response.push({ at: nowIso(), label, detail }); alarm.history.push({ at: nowIso(), label, detail }); }
  function simulateFault() {
    if (S.bms.fault) { toast('Fault already in progress', 'Complete the open call to clear it.'); location.hash = '#/bms/alarm/' + S.bms.fault.alarm; return; }
    const ahu = byId(S.bms.ahus, 'AHU-02'); ahu.status = 'tripped'; ahu.supplyHz = 0;
    const z = byId(S.bms.zones, 'L2-C'); z.target = 26.6; z.temp = Math.max(z.temp, 24.6);
    const alarm = {
      id: 'A' + Date.now(), at: nowIso(), priority: 'Critical', equip: 'AHU-02', desc: 'Supply fan tripped', status: 'Active',
      unit: 'AHU-02 · Air handling unit', reading: 'Supply fan status = TRIPPED', impact: 'Zone L2-C above 24 °C',
      history: [{ at: nowIso(), label: 'Alarm raised', detail: 'AHU-02 supply fan tripped · Zone L2-C warming' }], response: [], notified: [],
    };
    S.alarms.unshift(alarm);
    S.bms.fault = { alarm: alarm.id };
    feed('Critical: AHU-02 supply fan tripped', 'Fault alert sent to Trigon', 'bad', '#/bms/alarm/' + alarm.id);
    toast('Fault detected · AHU-02', 'Supply fan tripped — alarm sent to Trigon', 'bad');
    Store.save();
    location.hash = '#/bms/alarm/' + alarm.id;
    render();
    const step = (ms, fn) => setTimeout(() => { fn(); Store.save(); render(true); }, ms);
    step(1200, () => {
      respond(alarm, 'Fault alert received by Trigon', 'Unit, reading and time logged');
      ['Building Manager', 'Operations Manager', 'Trigon service desk'].forEach(r => alarm.notified.push({ role: r, channel: r === 'Trigon service desk' ? 'Live alarm board' : 'App push + email', at: nowIso() }));
    });
    step(2600, () => {
      const job = newJob({ building: 'B1', equipment: 'AHU-02 · Air handling unit', location: 'Level 2 - Central zone', fault: 'Supply fan tripped (BMS alarm)', urgency: 'Critical', source: 'BMS automatic' });
      alarm.jobId = job.id;
      respond(alarm, `Call ${job.id} raised automatically`, 'Priority: critical');
    });
    step(4000, () => {
      const job = byId(S.jobs, alarm.jobId);
      if (job && autoAssign(job)) respond(alarm, 'Technician dispatched', `${tech(job.tech).name} · ETA 25 min`);
    });
  }
  function onJobStep(job, key) {
    const alarm = S.alarms.find(a => a.jobId === job.id);
    if (!alarm) return;
    if (key === 'enroute') alarm.history.push({ at: nowIso(), label: 'Technician on the way', detail: 'ETA 25 min' });
    if (key === 'onsite') alarm.history.push({ at: nowIso(), label: 'Arrived on site', detail: 'Checked in via app' });
    if (key === 'completed') {
      alarm.history.push({ at: nowIso(), label: 'Fault repaired', detail: job.work || 'Recorded on job card' });
      const ahu = byId(S.bms.ahus, 'AHU-02'); ahu.status = 'running'; ahu.supplyHz = 48;
      const z = byId(S.bms.zones, 'L2-C'); z.target = 22.3;
      if (S.bms.fault) S.bms.fault.recovering = true;
    }
  }
  function checkFaultRecovery() {
    const f = S.bms.fault;
    if (!f || !f.recovering) return;
    const z = byId(S.bms.zones, 'L2-C');
    if (z.temp > 24) return;
    const alarm = byId(S.alarms, f.alarm);
    if (alarm) {
      alarm.history.push({ at: nowIso(), label: 'Back in comfort band', detail: `Zone L2-C at ${z.temp} °C` });
      alarm.history.push({ at: nowIso(), label: 'Alarm closed', detail: 'History saved to asset record' });
      alarm.status = 'Cleared'; alarm.closedAt = nowIso();
      feed('Alarm closed · AHU-02', 'Zone L2-C back in comfort band', '', '#/bms/alarm/' + alarm.id);
      toast('Alarm closed · AHU-02', `Zone L2-C back to ${z.temp} °C`);
    }
    S.bms.fault = null;
  }

  /* ---------------- SVG visuals ---------------- */
  const iso = (cx, cy, s) => (x, y, z) => [cx + (x - y) * 0.866 * s, cy + (x + y) * 0.5 * s - z * s];
  const pts = arr => arr.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  function isoBox(P, x0, y0, z0, w, d, h, fills) {
    const [top, left, right] = fills;
    const x1 = x0 + w, y1 = y0 + d, z1 = z0 + h;
    return `<polygon points="${pts([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)])}" fill="${left}"/>` +
      `<polygon points="${pts([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)])}" fill="${right}"/>` +
      `<polygon points="${pts([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)])}" fill="${top}"/>`;
  }
  function tower(P, x0, y0, w, d, h, floors, glow) {
    let s = isoBox(P, x0, y0, 0, w, d, h, ['#2a4147', '#0f2a31', '#0b2026']);
    const fh = h / floors;
    for (let f = 0; f < floors; f++) {
      const z0 = f * fh + fh * 0.25, z1 = (f + 1) * fh - fh * 0.12;
      const cols = Math.max(3, Math.round(w * 2.4)), colsR = Math.max(2, Math.round(d * 2.4));
      for (let c = 0; c < cols; c++) {
        const a = x0 + (c + 0.12) * w / cols, b = x0 + (c + 0.88) * w / cols;
        const lit = glow && ((f * 7 + c * 3) % 5 !== 0);
        s += `<polygon points="${pts([P(a, y0 + d, z0), P(b, y0 + d, z0), P(b, y0 + d, z1), P(a, y0 + d, z1)])}" fill="${lit ? 'rgba(90,220,235,.55)' : 'rgba(40,90,100,.5)'}"/>`;
      }
      for (let c = 0; c < colsR; c++) {
        const a = y0 + (c + 0.12) * d / colsR, b = y0 + (c + 0.88) * d / colsR;
        const lit = glow && ((f * 5 + c) % 4 !== 0);
        s += `<polygon points="${pts([P(x0 + w, a, z0), P(x0 + w, b, z0), P(x0 + w, b, z1), P(x0 + w, a, z1)])}" fill="${lit ? 'rgba(70,190,210,.4)' : 'rgba(30,70,80,.5)'}"/>`;
      }
    }
    return s;
  }
  function heroScene() {
    const P = iso(400, 330, 30);
    let city = '';
    [[-9, -6, 2, 2, 4], [6, -8, 2.4, 2, 5], [-10, 3, 2, 2, 3], [8, 2, 2, 2.5, 3.5], [-4, -10, 2, 2, 6], [11, -3, 1.6, 1.6, 2.5], [-13, -2, 1.8, 1.8, 4.5]]
      .forEach(([x, y, w, d, h]) => { city += `<g opacity=".55">${tower(P, x, y, w, d, h, Math.round(h * 2), false)}</g>`; });
    const top = P(0, 0, 9.4);
    const nodes = [
      { x: 150, y: 150, small: 'Office', label: 'Service desk', c: 'var(--cyan)' },
      { x: 660, y: 140, small: 'Field', label: 'Technicians', c: 'var(--accent)' },
      { x: 430, y: 40, small: 'Building', label: 'Plant & BMS', c: '#ffd166' },
    ];
    return `<svg viewBox="0 0 800 450" role="img" aria-label="Connected building platform">
      <defs><radialGradient id="glw"><stop offset="0" stop-color="#b6d433" stop-opacity=".35"/><stop offset="1" stop-color="#b6d433" stop-opacity="0"/></radialGradient></defs>
      ${[300, 215, 135].map((rx, i) => `<ellipse cx="400" cy="345" rx="${rx}" ry="${rx * 0.36}" fill="none" stroke="#b6d433" stroke-opacity="${0.35 + i * 0.2}" stroke-width="${10 - i * 3}"/>`).join('')}
      ${city}
      <ellipse cx="400" cy="345" rx="120" ry="40" fill="url(#glw)"/>
      ${tower(P, -2, -2, 4, 4, 9, 14, true)}
      ${isoBox(P, -1.2, -1.2, 9, 2.4, 2.4, 0.4, ['#dfe8ea', '#9fb3b8', '#7c9297'])}
      ${nodes.map(n => `<line x1="${top[0]}" y1="${top[1]}" x2="${n.x}" y2="${n.y}" stroke="${n.c}" stroke-width="2" class="flow" opacity=".9"/>
        <circle cx="${n.x}" cy="${n.y}" r="9" fill="${n.c}" opacity=".9"/><circle cx="${n.x}" cy="${n.y}" r="18" fill="none" stroke="${n.c}" opacity=".5" class="pulse"/>
        <g transform="translate(${n.x > 400 ? n.x + 22 : n.x - 132},${n.y - 20})"><rect width="110" height="38" rx="6" fill="rgba(7,16,19,.88)" stroke="#27515a"/>
        <text x="10" y="14" fill="#7f9aa1" font-size="9" letter-spacing="1.5">${n.small.toUpperCase()}</text><text x="10" y="30" fill="#dbe9ec" font-size="13" font-weight="600">${n.label}</text></g>`).join('')}
    </svg>`;
  }
  function zoneFill(z) {
    const st = zoneState(z);
    return st === 'High' ? 'rgba(255,90,95,.75)' : st === 'Low' ? 'rgba(91,140,255,.75)' : st === 'Offline' ? 'rgba(127,154,161,.4)' : 'rgba(90,220,235,.5)';
  }
  function bmsBuilding(opts = {}) {
    const P = iso(400, 300, 32);
    const W = 9, D = 4, FH = 1.4, x0 = -W / 2, y0 = -D / 2;
    let s = `<ellipse cx="400" cy="310" rx="360" ry="110" fill="rgba(182,212,51,.05)" stroke="rgba(182,212,51,.25)"/>`;
    // trees
    [[-7, 3], [-6, 4.5], [6, 4], [7.5, 2], [-3, 5.5], [2, 6], [8, -2]].forEach(([x, y]) => { const [a, b] = P(x, y, 0); s += `<ellipse cx="${a}" cy="${b - 10}" rx="11" ry="13" fill="#1f6b3a"/><rect x="${a - 1.5}" y="${b - 2}" width="3" height="6" fill="#4a3a22"/>`; });
    s += isoBox(P, x0, y0, 0, W, D, FH * 3 + 0.2, ['#3a4c50', '#22343a', '#18282d']);
    S.bms.zones.forEach(z => {
      const zi = { W: 0, C: 1, E: 2 }[z.pos];
      const a = x0 + zi * 3 + 0.15, b = x0 + (zi + 1) * 3 - 0.15;
      const z0 = (z.floor - 1) * FH + 0.4, z1 = z.floor * FH - 0.15;
      const st = zoneState(z);
      const poly = [P(a, y0 + D, z0), P(b, y0 + D, z0), P(b, y0 + D, z1), P(a, y0 + D, z1)];
      s += `<a href="#/bms/zones"><polygon points="${pts(poly)}" fill="${zoneFill(z)}" class="${st === 'High' || st === 'Low' ? 'pulse' : ''}"><title>Zone ${z.id}: ${z.temp} °C</title></polygon></a>`;
      for (let m = 1; m < 6; m++) { const xm = a + (b - a) * m / 6; const p1 = P(xm, y0 + D, z0), p2 = P(xm, y0 + D, z1); s += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="#0b1a1e" stroke-width="1.5"/>`; }
      if (opts.labels || st !== 'Normal') {
        const c = P((a + b) / 2, y0 + D, (z0 + z1) / 2);
        s += `<g transform="translate(${c[0] - 34},${c[1] - 11})"><rect width="68" height="22" rx="4" fill="rgba(7,16,19,.85)" stroke="${st === 'Normal' ? '#27515a' : 'var(--red)'}"/><text x="34" y="15" text-anchor="middle" font-size="10.5" fill="${st === 'Normal' ? '#dbe9ec' : '#ff8a8e'}">${z.id} ${z.temp}°</text></g>`;
      }
    });
    for (let f = 0; f < 3; f++) {
      const z0 = f * FH + 0.4, z1 = (f + 1) * FH - 0.15;
      for (let c = 0; c < 4; c++) { const a = y0 + c, b = y0 + c + 0.8; s += `<polygon points="${pts([P(x0 + W, a + 0.1, z0), P(x0 + W, b, z0), P(x0 + W, b, z1), P(x0 + W, a + 0.1, z1)])}" fill="rgba(70,190,210,.3)"/>`; }
    }
    const roofZ = FH * 3 + 0.2;
    S.bms.ahus.map((a, i) => ({ a, x: x0 + 0.6 + (i % 3) * 2.9, y: y0 + 0.4 + Math.floor(i / 3) * 1.8 }))
      .sort((p, q) => (p.x + p.y) - (q.x + q.y))
      .forEach(({ a, x, y }) => {
        const col = a.status === 'running' ? ['#cfe07a', '#7f9b2a', '#5f7520'] : a.status === 'tripped' ? ['#ff8a8e', '#c4383d', '#94262a'] : ['#8a9a9e', '#56666a', '#435054'];
        s += `<a href="#/bms/ahu/${a.id}"><g class="${a.status === 'tripped' ? 'pulse' : ''}">${isoBox(P, x, y, roofZ, 1.8, 1.1, 0.55, col)}</g><title>${a.id}: ${a.status}</title></a>`;
        if (a.status === 'tripped' || opts.labels) {
          const c = P(x + 0.9, y + 0.55, roofZ + 1.6);
          s += `<g transform="translate(${c[0] - 38},${c[1] - 26})"><rect width="76" height="34" rx="4" fill="rgba(7,16,19,.88)" stroke="${a.status === 'tripped' ? 'var(--red)' : '#27515a'}"/><text x="8" y="14" font-size="10.5" fill="#dbe9ec" font-weight="600">${a.id}</text><text x="8" y="27" font-size="9.5" fill="${a.status === 'tripped' ? '#ff8a8e' : '#b6d433'}">● ${a.status === 'tripped' ? 'Tripped' : a.status === 'running' ? 'Running' : 'Off'}</text></g>`;
        }
      });
    return `<svg viewBox="0 0 800 420" role="img" aria-label="Building zones">${s}</svg>`;
  }
  function lineChart({ series, times, min, max, band, h = 170, unit = '' }) {
    const W = 600, L = 34, R = 50, T = 10, B = 20;
    const all = series.flatMap(s => s.data).filter(v => v != null);
    if (min == null) min = Math.floor(Math.min(...all) - 1);
    if (max == null) max = Math.ceil(Math.max(...all) + 1);
    const n = Math.max(...series.map(s => s.data.length));
    const X = i => L + (W - L - R) * (n <= 1 ? 0 : i / (n - 1));
    const Y = v => T + (h - T - B) * (1 - (v - min) / (max - min || 1));
    let g = '';
    if (band) g += `<rect x="${L}" y="${Y(band[1])}" width="${W - L - R}" height="${Y(band[0]) - Y(band[1])}" fill="rgba(182,212,51,.08)" stroke="rgba(182,212,51,.25)" stroke-dasharray="3 4"/>`;
    for (let k = 0; k <= 4; k++) { const v = min + (max - min) * k / 4; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#1c3a41" stroke-width=".6"/><text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${Math.round(v * 10) / 10}</text>`; }
    if (times && times.length) [0, Math.floor(n / 2), n - 1].forEach((i, k) => { if (times[i]) g += `<text x="${X(i)}" y="${h - 4}" text-anchor="${['start', 'middle', 'end'][k]}">${new Date(times[i]).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</text>`; });
    series.forEach(s => {
      const p = s.data.map((v, i) => v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).filter(Boolean);
      g += `<polyline points="${p.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
      const lv = s.data[s.data.length - 1];
      if (lv != null) g += `<circle cx="${X(s.data.length - 1)}" cy="${Y(lv)}" r="3.5" fill="${s.color}"/><text x="${X(s.data.length - 1) + 7}" y="${Y(lv) + 4}" style="fill:${s.color};font-weight:600">${lv}${unit}</text>`;
    });
    const legend = series.length > 1 ? `<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;margin-bottom:4px">${series.map(s => `<span><i style="display:inline-block;width:10px;height:3px;background:${s.color};vertical-align:middle;margin-right:4px"></i>${esc(s.label)}</span>`).join('')}</div>` : '';
    return `${legend}<svg class="chart" viewBox="0 0 ${W} ${h}" style="height:auto">${g}</svg>`;
  }
  function gauge(pct, label) {
    const r = 34, c = 2 * Math.PI * r;
    return `<div style="text-align:center"><svg class="gauge" viewBox="0 0 90 90" width="84" height="84" style="margin:auto"><circle cx="45" cy="45" r="${r}" fill="none" stroke="#1c3a41" stroke-width="7"/><circle cx="45" cy="45" r="${r}" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c * pct / 100} ${c}" transform="rotate(-90 45 45)"/><text x="45" y="50" text-anchor="middle">${pct}%</text></svg><small>${esc(label)}</small></div>`;
  }
  function fanSvg(x, y, r, state) {
    const col = state === 'running' ? 'var(--accent)' : state === 'tripped' ? 'var(--red)' : '#7f9aa1';
    const blades = [0, 120, 240].map(a => `<path d="M0 0 C ${r * .2} ${-r * .5}, ${r * .7} ${-r * .6}, ${r * .75} ${-r * .15} Z" fill="${col}" opacity=".85" transform="rotate(${a})"/>`).join('');
    return `<g transform="translate(${x},${y})"><circle r="${r}" fill="#081417" stroke="${col}" stroke-width="2"/><g class="${state === 'running' ? 'spin' : ''}">${blades}</g><circle r="${r * .12}" fill="#dbe9ec"/></g>`;
  }
  function ahuDiagram(a) {
    const tag = (x, y, small, big, bad) => `<g transform="translate(${x},${y})"><rect width="128" height="38" rx="5" fill="rgba(7,16,19,.9)" stroke="${bad ? 'var(--red)' : '#27515a'}"/><text x="9" y="14" font-size="9" letter-spacing="1.2" fill="#7f9aa1">${small}</text><text x="9" y="30" font-size="13.5" font-weight="600" fill="${bad ? '#ff8a8e' : '#b6d433'}">${big}</text></g>`;
    const run = a.status === 'running', trip = a.status === 'tripped';
    return `<svg viewBox="0 0 800 330" role="img" aria-label="${a.id} schematic">
      <rect x="60" y="60" width="680" height="56" rx="4" fill="#0f2228" stroke="#27515a"/>
      <rect x="60" y="190" width="680" height="70" rx="4" fill="#0f2228" stroke="#27515a"/>
      <rect x="60" y="116" width="70" height="74" fill="#0f2228" stroke="#27515a"/>
      <line x1="730" y1="88" x2="80" y2="88" stroke="#ff9f6b" stroke-width="2" class="${a.status !== 'off' ? 'flow' : ''}" opacity=".7"/>
      <line x1="80" y1="225" x2="730" y2="225" stroke="var(--cyan)" stroke-width="2" class="${run ? 'flow' : ''}" opacity=".7"/>
      <g transform="translate(150,196)"><rect width="34" height="58" fill="#132a30" stroke="#5a7b82"/>${[10, 22, 34, 46].map(y => `<line x1="4" x2="30" y1="${y}" y2="${y - 6}" stroke="#9fb3b8" stroke-width="2" transform="rotate(${a.damper > 50 ? 0 : 15} 17 ${y})"/>`).join('')}</g>
      <g transform="translate(240,196)"><rect width="30" height="58" fill="#132a30" stroke="#5a7b82"/><polyline points="4,4 26,12 4,20 26,28 4,36 26,44 4,52" fill="none" stroke="${a.filterDp > 200 ? 'var(--amber)' : '#9fb3b8'}" stroke-width="1.6"/></g>
      <g transform="translate(330,196)"><rect width="44" height="58" fill="#0c2e3a" stroke="var(--cyan)"/>${[8, 16, 24, 32, 40, 48].map(y => `<line x1="3" x2="41" y1="${y}" y2="${y}" stroke="var(--cyan)" stroke-width="1" opacity=".7"/>`).join('')}</g>
      <line x1="352" y1="196" x2="352" y2="150" stroke="var(--cyan)" stroke-width="2"/><polygon points="342,150 362,150 352,140" fill="var(--cyan)"/>
      ${fanSvg(560, 225, 30, trip ? 'tripped' : a.status)}
      ${fanSvg(560, 88, 22, a.status === 'off' ? 'off' : 'running')}
      <text x="740" y="52" text-anchor="end" font-size="10" fill="#7f9aa1">RETURN AIR ←</text>
      <text x="740" y="182" text-anchor="end" font-size="10" fill="#7f9aa1">SUPPLY AIR →</text>
      <text x="64" y="52" font-size="10" fill="#7f9aa1">EXHAUST / OUTSIDE AIR</text>
      ${tag(600, 6, 'RETURN FAN', a.status === 'off' ? 'Off' : 'Running · ' + a.returnHz + ' Hz')}
      ${tag(600, 280, 'SUPPLY FAN', trip ? 'TRIPPED' : run ? 'Running · ' + a.supplyHz + ' Hz' : 'Off', trip)}
      ${tag(400, 126, 'CHW VALVE', a.chwValve + ' % open')}
      ${tag(150, 128, 'DAMPER ACTUATOR', a.damper + ' % open')}
      ${tag(200, 280, 'FILTER ΔP', a.filterDp + ' Pa · ' + (a.filterDp > 200 ? 'Dirty' : 'OK'))}
      ${tag(390, 280, 'SUPPLY AIR TEMP', a.supplyTemp + ' °C', trip)}
      ${tag(380, 6, 'RETURN AIR TEMP', a.returnTemp + ' °C')}
    </svg>`;
  }

  /* ---------------- shared fragments ---------------- */
  const head = (title, sub, actions = '') => `<div class="page-head"><h1>${title}</h1>${actions}${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  const kpi = (icon, label, value, unit = '') => `<div class="card kpi">${icS(icon)}<div><small>${label}</small><strong>${value}${unit ? `<em>${unit}</em>` : ''}</strong></div></div>`;
  const openJobs = () => S.jobs.filter(j => j.status !== 'report');
  const activeAlarms = () => S.alarms.filter(a => a.status === 'Active');

  function jobsTable(list, compact) {
    if (!list.length) return `<div class="empty">No jobs here.</div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Job</th><th>Building</th>${compact ? '' : '<th class="hide-sm">Equipment</th>'}<th>Urgency</th><th>Status</th><th class="hide-sm">Technician</th><th>Logged</th></tr></thead><tbody>
      ${list.map(j => `<tr class="click" data-href="#/service/job/${j.id}"><td><strong>${j.id}</strong></td><td>${esc(bld(j.building).name)}<br><small>${esc(j.location)}</small></td>${compact ? '' : `<td class="hide-sm">${esc(j.equipment)}</td>`}<td>${urgPill(j.urgency)}</td><td>${jobStatusPill(j)}</td><td class="hide-sm">${j.tech ? esc(tech(j.tech).name) : '<small>Unassigned</small>'}</td><td class="mono">${hhmm(j.steps.logged)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }
  function timeline(items) {
    return `<ul class="timeline">${items.map(it => `<li class="${it.cls || 'done'}"><span class="dot">${ic(it.icon || 'check')}</span><div class="grow"><strong>${esc(it.label)}</strong><small>${esc(it.detail || '')}</small></div><time>${it.at ? hhmm(it.at) : ''}</time></li>`).join('')}</ul>`;
  }
  function feedList(n) {
    const f = S.feed.slice(0, n);
    if (!f.length) return `<div class="empty">No activity yet — log a call or simulate a BMS fault.</div>`;
    return `<div class="rows">${f.map(x => `<a class="row" href="${x.link || '#/service/notifications'}" style="color:inherit"><span class="pill ${x.kind === 'bad' ? 'bad' : 'info'}" style="padding:2px 6px">${ic(x.kind === 'bad' ? 'alert' : 'bell').replace('<svg', '<svg style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2"')}</span><div class="grow"><strong>${esc(x.title)}</strong><small>${esc(x.body)}</small></div><small class="mono">${hhmm(x.at)}</small></a>`).join('')}</div>`;
  }

  /* ---------------- views: dashboard ---------------- */
  function viewDashboard() {
    const zs = S.bms.zones, inBand = zs.filter(z => zoneState(z) === 'Normal').length;
    const avail = S.technicians.filter(t => t.status === 'available').length;
    return head('Dashboard', 'One platform · service desk · technicians · plant',
      `<button class="btn danger sm" data-action="fault">${ic('alert')}Simulate BMS fault</button><a class="btn primary sm" href="#/service/callout">${ic('plus')}Log a call</a>`) +
      `<div class="grid split">
        <div class="grid">
          <div class="card flush"><div class="scene">${heroScene()}</div></div>
          <div class="grid g3">
            <div class="card feature">${icS('clock')}<div><strong>Less downtime</strong><p>Faults caught early, before occupants notice</p></div></div>
            <div class="card feature">${icS('bolt')}<div><strong>Faster response</strong><p>Alerts and calls reach Trigon instantly</p></div></div>
            <div class="card feature">${icS('eye')}<div><strong>Complete transparency</strong><p>Every step, every reading, every record</p></div></div>
          </div>
        </div>
        <div class="grid" style="align-content:start">
          <div class="grid g2">
            ${kpi('wrench', 'Open jobs', openJobs().length)}
            ${kpi('alert', 'Active alarms', activeAlarms().length)}
            ${kpi('users', 'Technicians free', avail, '/' + S.technicians.length)}
            ${kpi('thermo', 'Zones in band', inBand, '/' + zs.length)}
          </div>
          <div class="card"><header><h2>Recent activity</h2><a href="#/service/notifications" class="muted">All</a></header>${feedList(6)}</div>
        </div>
      </div>
      <div class="card" style="margin-top:14px"><header><h2>Live jobs</h2><a href="#/service/live" class="muted">View all</a></header>${jobsTable(openJobs().slice(0, 6), true)}</div>
      <div style="margin-top:14px;text-align:right"><button class="btn sm" data-action="reset">${ic('reset')}Reset demo data</button></div>`;
  }

  /* ---------------- views: service ---------------- */
  function viewLive() {
    const list = ui.jobFilter === 'open' ? openJobs() : ui.jobFilter === 'done' ? S.jobs.filter(j => j.status === 'report') : S.jobs;
    const crit = openJobs().filter(j => j.urgency === 'Critical' || j.urgency === 'High').length;
    const done = S.jobs.filter(j => j.status === 'report' && Date.now() - new Date(j.steps.report) < 864e5).length;
    return head('Live Jobs', 'Client portfolio · live view', `<a class="btn primary sm" href="#/service/callout">${ic('plus')}New call-out</a>`) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('wrench', 'Open jobs', openJobs().length)}${kpi('alert', 'High / critical', crit)}${kpi('route', 'On the way', S.jobs.filter(j => j.status === 'enroute').length)}${kpi('check', 'Closed (24 h)', done)}</div>
      <div class="card"><header><h2>Jobs</h2><div class="seg">${[['open', 'Open'], ['all', 'All'], ['done', 'Completed']].map(([k, l]) => `<button data-action="jobfilter" data-v="${k}" class="${ui.jobFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div></header>${jobsTable(list)}</div>`;
  }
  function viewCallout() {
    const b = S.buildings[0];
    ui.pendingPhotos = [];
    return head('New call-out', 'Client app → Trigon service desk') +
      `<div class="grid split">
        <form class="card form" data-form="callout">
          <header><h2>New call-out · TR-${S.seq}</h2><span class="pill">DRAFT</span></header>
          <div class="field"><label for="f-b">Building</label><select id="f-b" name="building" data-change="building">${S.buildings.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="f-e">Equipment</label><select id="f-e" name="equipment">${b.equipment.map(e => `<option>${esc(e)}</option>`).join('')}</select></div>
          <div class="field"><label for="f-l">Location</label><select id="f-l" name="location">${b.locations.map(e => `<option>${esc(e)}</option>`).join('')}</select></div>
          <div class="field"><label for="f-f">Fault</label><textarea id="f-f" name="fault" required placeholder="e.g. Office not cooling, warm air"></textarea></div>
          <div class="field"><label>Urgency</label><div class="radio-row">${['Low', 'Medium', 'High', 'Critical'].map(u => `<label><input type="radio" name="urgency" value="${u}" ${u === 'Medium' ? 'checked' : ''}><span>${u}</span></label>`).join('')}</div></div>
          <div class="field"><label>Photo</label><div class="thumbs" id="thumbs"></div><label class="btn sm" style="width:max-content">${ic('camera')}Add photo<input type="file" accept="image/*" capture="environment" multiple hidden data-photos="pending"></label></div>
          <div class="field"><label for="f-c">Contact name / number</label><input id="f-c" name="contact" placeholder="Optional"></div>
          <button class="btn primary" type="submit">${ic('phone')}Log call</button>
        </form>
        <div class="grid" style="align-content:start">
          <div class="card"><header><h2>Routing</h2></header>
            <div class="rows">
              <div class="row">${icS('bolt')}<div class="grow"><strong>Lands instantly at the Trigon service desk</strong><small>No phone queues — the call is on the live board the moment you submit.</small></div></div>
              <div class="row">${icS('users')}<div class="grow"><strong>Auto-assigned to the best available technician</strong><small>Matched on skills and availability.</small></div></div>
              <div class="row">${icS('bell')}<div class="grow"><strong>Everyone stays informed</strong><small>Building manager and operations manager are notified at every step.</small></div></div>
            </div>
          </div>
          <div class="card"><header><h2>Recent call-outs</h2></header>${jobsTable(S.jobs.slice(0, 4), true)}</div>
        </div>
      </div>`;
  }
  function viewJobCards() {
    return head('Job Cards', 'Digital job cards — findings, work done, photos and signature') +
      `<div class="grid g3">${S.jobs.map(j => {
        const i = stepIdx(j.status);
        return `<a class="card" href="#/service/job/${j.id}" style="color:inherit;display:block"><header><h3>${j.id}</h3>${urgPill(j.urgency)}</header>
          <div><strong>${esc(bld(j.building).name)}</strong><br><small>${esc(j.equipment)} · ${esc(j.location)}</small></div>
          <p style="margin:8px 0;font-size:13px">${esc(j.fault)}</p>
          <div class="bar"><i style="width:${(i + 1) / STEPS.length * 100}%;${i >= 5 ? 'background:var(--accent)' : ''}"></i></div>
          <div style="display:flex;justify-content:space-between;margin-top:8px">${jobStatusPill(j)}<small>${j.tech ? esc(tech(j.tech).name) : 'Unassigned'}</small></div></a>`;
      }).join('')}</div>`;
  }
  function viewJob(id) {
    const j = byId(S.jobs, id);
    if (!j) return head('Job not found') + `<div class="empty">No job ${esc(id)}. <a href="#/service/live">Back to live jobs</a></div>`;
    ui.pendingPhotos = [];
    const b = bld(j.building), t = j.tech && tech(j.tech);
    const i = stepIdx(j.status), next = STEPS[i + 1];
    const tl = STEPS.map((s, k) => {
      const done = !!j.steps[s.key];
      const detail = { logged: `${j.id} received by Trigon · ${j.source}`, assigned: t ? `${t.name} allocated` : 'Waiting for routing', enroute: 'ETA 25 minutes', onsite: 'Technician checked in', completed: j.work || 'Work recorded on job card', report: 'Signed job card available' }[s.key];
      return { label: s.label, detail, at: j.steps[s.key], icon: s.icon, cls: done ? 'done' : k === i + 1 ? '' : 'pending' };
    });
    const lastByRole = RECIP.map(r => { const n = j.notifications.filter(x => x.role === r.role); return { ...r, at: n.length ? n[n.length - 1].at : null, count: n.length }; });
    const canEdit = i >= 3 && i < 5;
    const onSiteMin = j.steps.onsite && j.steps.completed ? mins(j.steps.onsite, j.steps.completed) : null;
    const actions = `<a class="btn sm" href="#/service/live">${ic('back')}Back</a>` +
      (next && next.key !== 'report' ? `<button class="btn primary sm" data-action="advance" data-id="${j.id}">${ic('check')}${NEXT_LABEL[next.key]}</button>` : '') +
      (j.status === 'report' ? `<a class="btn primary sm" href="#/service/report/${j.id}">${ic('doc')}View report</a>` : '');
    return head(`Job ${j.id} ${urgPill(j.urgency)} ${jobStatusPill(j)}`, `${esc(b.name)} · ${esc(j.equipment)} · ${esc(j.location)}`, actions) +
      `<div class="grid split">
        <div class="grid" style="align-content:start">
          <div class="card"><header><h2>Call ${j.id} · live progress</h2><small>${i + 1}/${STEPS.length} steps</small></header>${timeline(tl)}</div>
          ${i >= 3 ? `<div class="card ${j.status === 'report' ? 'glow' : ''}"><header><h2>Digital job card · on site</h2>${j.status === 'report' ? '<span class="pill ok"><i></i>Signed</span>' : ''}</header>
            <div class="form">
              <div class="field"><label for="jf">Findings</label><textarea id="jf" data-bind="findings" data-id="${j.id}" ${canEdit ? '' : 'readonly'} placeholder="What did you find?">${esc(j.findings)}</textarea></div>
              <div class="field"><label for="jw">Work completed</label><textarea id="jw" data-bind="work" data-id="${j.id}" ${canEdit ? '' : 'readonly'} placeholder="What was done?">${esc(j.work)}</textarea></div>
              <div class="field"><label>Photographs (${j.photos.length})</label><div class="thumbs" id="thumbs">${j.photos.map(p => `<img src="${p}" alt="Job photo">`).join('')}</div>
                ${canEdit ? `<label class="btn sm" style="width:max-content">${ic('camera')}Add photo<input type="file" accept="image/*" capture="environment" multiple hidden data-photos="${j.id}"></label>` : ''}</div>
              ${j.status === 'completed' ? `<div class="field"><label>Customer signature</label><canvas class="sig" id="sig"></canvas>
                <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="signedBy" placeholder="Signed by (name)" value="${esc(b.manager || '')}" style="flex:1;min-width:160px;padding:9px 12px;background:var(--bg2);border:1px solid var(--line2);border-radius:8px;font-size:16px"><button class="btn sm" type="button" data-action="sigclear">Clear</button></div></div>
                <button class="btn primary" data-action="sign" data-id="${j.id}">${ic('check')}Complete &amp; share report</button>` : ''}
              ${j.signature ? `<div class="field"><label>Customer signature · ${esc(j.signedBy)}</label><img class="sig-img" src="${j.signature}" alt="Signature"></div>` : ''}
            </div></div>` : ''}
        </div>
        <div class="grid" style="align-content:start">
          <div class="card"><header><h2>Job ${j.id}</h2><small>${esc(j.equipment.split(' · ')[0])}</small></header>
            <dl class="kv"><dt>Client</dt><dd>${esc(b.client)}</dd><dt>Fault</dt><dd>${esc(j.fault)}</dd><dt>Source</dt><dd>${esc(j.source)}</dd>
            <dt>Technician</dt><dd>${t ? esc(t.name) : '—'}</dd><dt>Arrived</dt><dd>${hhmm(j.steps.onsite)}</dd><dt>Completed</dt><dd>${hhmm(j.steps.completed)}</dd>
            <dt>Time on site</dt><dd>${dur(onSiteMin)}</dd><dt>Photos</dt><dd>${j.photos.length ? j.photos.length + ' attached' : '—'}</dd>
            <dt>Signature</dt><dd>${j.signature || j.status === 'report' ? '<span style="color:var(--accent)">Captured ✓</span>' : '<span style="color:var(--amber)">Pending</span>'}</dd></dl>
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${t ? `<a class="btn sm" href="tel:${t.phone.replace(/\s/g, '')}">${ic('phone')}Call technician</a>` : ''}<a class="btn sm" href="tel:${(b.managerPhone || '').replace(/\s/g, '')}">${ic('phone')}Building manager</a></div>
          </div>
          <div class="card"><header><h2>Delivery log</h2><small>${j.notifications.length} sent</small></header>
            <div class="table-wrap"><table><thead><tr><th>Recipient</th><th>Channel</th><th>Last sent</th></tr></thead><tbody>
            ${lastByRole.map(r => `<tr><td>${r.role}</td><td><small>${r.channel}</small></td><td class="mono">${r.at ? hhmm(r.at) : '—'}</td></tr>`).join('')}</tbody></table></div></div>
          ${j.status === 'report' ? `<div class="card"><header><h2>Report distribution</h2></header>${timeline([
            { label: 'Report generated', detail: `PDF with ${j.photos.length} photo(s) & signature`, at: j.steps.report, icon: 'doc' },
            { label: 'Building Manager', detail: 'Delivered · app + email', at: j.steps.report, icon: 'check' },
            { label: 'Operations Manager', detail: 'Delivered · app + email', at: j.steps.report, icon: 'check' }])}</div>` : ''}
        </div>
      </div>`;
  }
  function viewReport(id) {
    const j = byId(S.jobs, id);
    if (!j) return head('Report not found');
    const b = bld(j.building), t = j.tech && tech(j.tech);
    return `<div class="page-head noprint"><a class="btn sm" href="#/service/job/${j.id}">${ic('back')}Back to job</a><button class="btn primary sm" data-action="print">${ic('print')}Print / save PDF</button></div>
      <article class="card report">
        <header style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><img src="icon.svg" width="44" height="44" alt=""><div><h1>Service report · ${j.id}</h1><small>Trigon Air Conditioning · ${dmy(j.steps.report || nowIso())}</small></div></header>
        <div class="grid g2">
          <dl class="kv"><dt>Client</dt><dd>${esc(b.client)}</dd><dt>Building</dt><dd>${esc(b.name)}</dd><dt>Location</dt><dd>${esc(j.location)}</dd><dt>Equipment</dt><dd>${esc(j.equipment)}</dd></dl>
          <dl class="kv"><dt>Technician</dt><dd>${t ? esc(t.name) : '—'}</dd><dt>Logged</dt><dd>${hhmm(j.steps.logged)}</dd><dt>Arrived</dt><dd>${hhmm(j.steps.onsite)}</dd><dt>Completed</dt><dd>${hhmm(j.steps.completed)}</dd></dl>
        </div>
        <h2 style="margin:18px 0 6px">Reported fault</h2><p>${esc(j.fault)}</p>
        <h2 style="margin:18px 0 6px">Findings</h2><p>${esc(j.findings) || '—'}</p>
        <h2 style="margin:18px 0 6px">Work completed</h2><p>${esc(j.work) || '—'}</p>
        ${j.photos.length ? `<h2 style="margin:18px 0 6px">Photographs</h2><div class="thumbs">${j.photos.map(p => `<img src="${p}" alt="" style="width:140px;height:140px">`).join('')}</div>` : ''}
        <h2 style="margin:18px 0 6px">Customer sign-off</h2>${j.signature ? `<img class="sig-img" src="${j.signature}" alt="Signature"><p><small>Signed by ${esc(j.signedBy)} · ${hhmm(j.steps.report)}</small></p>` : '<p class="muted">Signed on paper / legacy record.</p>'}
        <h2 style="margin:18px 0 6px">Timeline</h2>${timeline(STEPS.filter(s => j.steps[s.key]).map(s => ({ label: s.label, at: j.steps[s.key], icon: s.icon })))}
      </article>`;
  }
  function viewTechs() {
    return head('Technicians', 'Field team status') + `<div class="grid g2">${S.technicians.map(t => {
      const v = byId(S.vehicles, t.vehicle), j = t.job && byId(S.jobs, t.job);
      return `<div class="card"><header><h2>${esc(t.name)}</h2>${statusPill(t.status)}</header><small>${esc(t.skill)}</small>
        <dl class="kv" style="margin-top:10px"><dt>Current job</dt><dd>${j && t.status === 'on job' ? `<a href="#/service/job/${j.id}">${j.id} · ${esc(stepLabel(j.status))}</a>` : '—'}</dd><dt>Vehicle</dt><dd>${v ? esc(v.reg) : '—'}</dd><dt>Location</dt><dd>${v ? esc(v.location) : '—'}</dd></dl>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><a class="btn sm" href="tel:${t.phone.replace(/\s/g, '')}">${ic('phone')}Call</a>
        ${t.status !== 'on job' ? `<button class="btn sm" data-action="duty" data-id="${t.id}">${t.status === 'off' ? 'Set on duty' : 'Set off duty'}</button>` : ''}</div></div>`;
    }).join('')}</div>`;
  }
  function viewNotifs() {
    ui.unread = 0; updateBell();
    return head('Notifications', 'From the moment a call is logged, everyone stays informed') +
      `<div class="grid split"><div class="card"><header><h2>Activity feed</h2><small>${S.feed.length} events</small></header>${feedList(60)}</div>
      <div class="card" style="align-self:start"><header><h2>Who gets notified</h2></header><div class="table-wrap"><table><thead><tr><th>Recipient</th><th>Channel</th></tr></thead><tbody>${RECIP.map(r => `<tr><td>${r.role}</td><td>${r.channel}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted" style="font-size:12px">Each job step (logged, assigned, on the way, on site, completed, report) is pushed to every recipient.</p></div></div>`;
  }
  function viewReports() {
    const done = S.jobs.filter(j => j.status === 'report');
    const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    const resp = avg(S.jobs.filter(j => j.steps.onsite).map(j => mins(j.steps.logged, j.steps.onsite)));
    const site = avg(S.jobs.filter(j => j.steps.completed && j.steps.onsite).map(j => mins(j.steps.onsite, j.steps.completed)));
    return head('Reports', 'Signed service reports and performance') +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('doc', 'Signed reports', done.length)}${kpi('clock', 'Avg. response', dur(resp))}${kpi('wrench', 'Avg. time on site', dur(site))}${kpi('check', 'First-time fix', '100', '%')}</div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Report</th><th>Building</th><th class="hide-sm">Equipment</th><th>Technician</th><th>Date</th></tr></thead><tbody>
      ${done.map(j => `<tr class="click" data-href="#/service/report/${j.id}"><td><strong>${j.id}</strong></td><td>${esc(bld(j.building).name)}</td><td class="hide-sm">${esc(j.equipment)}</td><td>${j.tech ? esc(tech(j.tech).name) : '—'}</td><td>${dmy(j.steps.report)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No signed reports yet.</td></tr>'}
      </tbody></table></div></div>`;
  }
  function viewClients() {
    return head('Clients', 'Buildings under service') + `<div class="grid g3">${S.buildings.map(b => `<div class="card"><header><h2>${esc(b.name)}</h2></header><small>${esc(b.client)} · ${esc(b.area)}</small>
      <dl class="kv" style="margin-top:10px"><dt>Building manager</dt><dd><a href="tel:${b.managerPhone.replace(/\s/g, '')}">${esc(b.manager)}</a></dd><dt>Operations manager</dt><dd><a href="tel:${b.opsPhone.replace(/\s/g, '')}">${esc(b.ops)}</a></dd>
      <dt>Open jobs</dt><dd>${openJobs().filter(j => j.building === b.id).length}</dd><dt>Assets</dt><dd>${b.equipment.length - 1}</dd></dl></div>`).join('')}</div>`;
  }
  function viewDocs() {
    return head('Documents', 'Site documentation') + `<div class="card"><div class="table-wrap"><table><thead><tr><th>Document</th><th>Type</th><th class="hide-sm">Size</th><th class="hide-sm">Updated</th><th></th></tr></thead><tbody>
      ${S.documents.map(d => `<tr><td>${ic('doc').replace('<svg', '<svg style="width:16px;height:16px;display:inline;vertical-align:-3px;margin-right:6px;fill:none;stroke:var(--cyan);stroke-width:1.7"')}${esc(d.name)}</td><td><span class="pill">${d.type}</span></td><td class="hide-sm">${d.size}</td><td class="hide-sm">${d.date}</td><td><button class="btn sm" data-action="doc">Open</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  /* ---------------- views: BMS ---------------- */
  const faultBtn = () => S.bms.fault ? `<a class="btn danger sm" href="#/bms/alarm/${S.bms.fault.alarm}">${ic('alert')}Fault in progress</a>` : `<button class="btn danger sm" data-action="fault">${ic('alert')}Simulate fault</button>`;
  function viewOverview() {
    const b = S.bms, zs = b.zones, avg = (zs.reduce((s, z) => s + z.temp, 0) / zs.length).toFixed(1);
    const act = activeAlarms();
    const run = arr => arr.filter(x => x.status === 'running').length;
    const tr = b.trend.slice(-60);
    return head('Site Overview', 'Building BMS · live monitoring', faultBtn()) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('thermo', 'Avg temperature', avg, '°C')}${kpi('wind', 'Avg humidity', b.humidity, '%')}${kpi('eye', 'CO₂ level', b.co2, 'ppm')}
        <div class="card kpi">${icS(act.length ? 'alert' : 'check')}<div><small>Overall status</small><strong style="color:${act.length ? 'var(--red)' : 'var(--accent)'}">${act.length ? 'Alarm' : 'Normal'}</strong></div></div></div>
      <div class="grid split">
        <div class="card flush"><div style="padding:10px 14px 0;display:flex;justify-content:space-between"><h3>Demonstration Site · Building BMS</h3><small>Tap a zone or unit</small></div><div class="scene">${bmsBuilding()}</div></div>
        <div class="grid" style="align-content:start">
          <div class="card"><header><h3>AHU overview</h3>${statusPill(b.ahus.some(a => a.status === 'tripped') ? 'Tripped' : 'Normal')}</header><dl class="kv"><dt>AHUs running</dt><dd>${run(b.ahus)}/${b.ahus.length}</dd><dt>Avg supply air</dt><dd>${(tr[tr.length - 1] || {}).sat ?? '—'} °C</dd><dt>Avg return air</dt><dd>${(b.ahus.reduce((s, a) => s + a.returnTemp, 0) / b.ahus.length).toFixed(1)} °C</dd></dl></div>
          <div class="card"><header><h3>Chilled water plant</h3>${statusPill('Normal')}</header><dl class="kv"><dt>CHW supply</dt><dd>${b.chillers[0].chws} °C</dd><dt>CHW return</dt><dd>${b.chillers[0].chwr} °C</dd><dt>Chillers</dt><dd>${run(b.chillers)} running</dd></dl></div>
          <div class="card"><header><h3>FCU units</h3>${statusPill('Normal')}</header><dl class="kv"><dt>FCUs online</dt><dd>${b.fcus.length}/${b.fcus.length}</dd><dt>Zones in comfort band</dt><dd>${zs.filter(z => zoneState(z) === 'Normal').length}/${zs.length}</dd></dl></div>
        </div>
      </div>
      <div class="grid g3" style="margin-top:14px">
        <div class="card"><header><h3>Pumps</h3></header><dl class="kv"><dt>CHW pumps</dt><dd>${run(b.pumps.filter(p => p.id.startsWith('CHWP')))}/3 running</dd><dt>Condenser pumps</dt><dd>${run(b.pumps.filter(p => p.id.startsWith('CWP')))}/2 running</dd></dl></div>
        <div class="card"><header><h3>Cooling towers</h3></header><dl class="kv"><dt>Fans</dt><dd>${run(b.towers)}/${b.towers.length} running</dd><dt>Leaving water</dt><dd>${b.towers[0].leaving} °C</dd></dl></div>
        <div class="card"><header><h3>Plant performance</h3></header><div style="display:flex;justify-content:space-around;flex-wrap:wrap;gap:6px">${gauge(b.chillers[0].load, 'Chillers')}${gauge(Math.round(run(b.ahus) / b.ahus.length * 100), 'AHUs')}${gauge(Math.round(run(b.pumps) / b.pumps.length * 100), 'Pumps')}</div></div>
      </div>
      <div class="grid g2" style="margin-top:14px">
        <div class="card"><header><h3>Temperature trend (°C)</h3></header>${lineChart({ series: [{ label: 'Supply air', color: 'var(--cyan)', data: tr.map(p => p.sat) }, { label: 'Zone avg', color: 'var(--accent)', data: tr.map(p => +(Object.values(p.z).reduce((s, v) => s + v, 0) / zs.length).toFixed(1)) }], times: tr.map(p => p.t) })}</div>
        <div class="card"><header><h3>BMS alarms</h3><a href="#/bms/alarms" class="muted">View all</a></header>${alarmTable(S.alarms.slice(0, 5))}</div>
      </div>`;
  }
  function alarmTable(list) {
    if (!list.length) return `<div class="empty">No alarms.</div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Priority</th><th>Equipment / description</th><th>Status</th></tr></thead><tbody>
      ${list.map(a => `<tr class="click ${a.status === 'Active' ? 'hl' : ''}" data-href="#/bms/alarm/${a.id}"><td class="mono">${hhmm(a.at)}</td><td>${prioPill(a.priority)}</td><td><strong>${esc(a.equip)}</strong> <small>${esc(a.desc)}</small></td><td>${statusPill(a.status)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function viewChillers() {
    const b = S.bms;
    const all = [...b.chillers, ...b.pumps, ...b.towers, ...b.ahus, ...b.fans];
    const cnt = st => all.filter(x => x.status === st).length;
    const tr = b.trend.slice(-60);
    return head('Chiller Plant — Central Plant Room', 'Every chiller, compressor, chilled-water temperature and pump at a glance') +
      `<div class="grid split">
        <div class="grid" style="align-content:start">
          <div class="grid g2">${b.chillers.map(c => `<div class="card ${c.status === 'running' ? 'glow' : ''}"><header><h2>${c.id}</h2>${statusPill(c.status)}</header><small>${c.name}</small>
            <dl class="kv" style="margin-top:10px"><dt>Load</dt><dd>${c.load} %</dd><dt>CHWS / CHWR</dt><dd>${c.chws ?? '—'} / ${c.chwr ?? '—'} °C</dd></dl>
            <div class="bar" style="margin:10px 0"><i style="width:${c.load}%"></i></div>
            <div style="display:flex;gap:6px">${c.comps.map((s, i) => `<span class="pill ${s === 'run' ? 'ok' : 'warn'}"><i></i>C${i + 1} ${s === 'run' ? 'Run' : 'Stby'}</span>`).join('')}</div></div>`).join('')}</div>
          <div class="card"><header><h3>Chilled water temperatures (°C)</h3></header>${lineChart({ series: [{ label: 'CHW supply', color: 'var(--cyan)', data: tr.map(p => p.chws) }, { label: 'CHW return', color: 'var(--amber)', data: tr.map(p => p.chwr) }], times: tr.map(p => p.t), min: 4, max: 14 })}</div>
        </div>
        <div class="grid" style="align-content:start">
          <div class="card"><header><h3>Equipment status summary</h3></header><div class="grid g2">
            <div class="stat-box ok"><strong>${cnt('running')}</strong><small>Running</small></div><div class="stat-box warn"><strong>${cnt('standby')}</strong><small>Standby</small></div>
            <div class="stat-box bad"><strong>${cnt('tripped')}</strong><small>Tripped</small></div><div class="stat-box"><strong>${cnt('off')}</strong><small>Offline</small></div></div></div>
          <div class="card"><header><h3>Chilled water pumps</h3><small>Lead / lag: CHWP-01</small></header>
            <div class="table-wrap"><table><tbody>${b.pumps.filter(p => p.id.startsWith('CHWP')).map(p => `<tr><td><strong>${p.id}</strong></td><td>${statusPill(p.status)}</td><td class="mono">${p.hz ? p.hz + ' Hz' : 'Ready'}</td></tr>`).join('')}</tbody></table></div></div>
        </div>
      </div>`;
  }
  function viewAhus() {
    return head('AHUs & Ventilation', 'Supply & return fans, air temperatures, filters, valves and dampers', faultBtn()) +
      `<div class="grid g3">${S.bms.ahus.map(a => `<a class="card ${a.status === 'tripped' ? 'alert' : ''}" href="#/bms/ahu/${a.id}" style="color:inherit;display:block"><header><h2>${a.id} — ${a.name}</h2>${statusPill(a.status)}</header>
        <dl class="kv"><dt>Supply fan</dt><dd>${a.status === 'tripped' ? '<span style="color:var(--red)">Tripped</span>' : a.supplyHz ? a.supplyHz + ' Hz' : 'Off'}</dd><dt>Supply air</dt><dd>${a.supplyTemp} °C</dd><dt>Return air</dt><dd>${a.returnTemp} °C</dd><dt>CHW valve</dt><dd>${a.chwValve} %</dd><dt>Filter ΔP</dt><dd>${a.filterDp} Pa</dd></dl></a>`).join('')}</div>`;
  }
  function viewAhu(id) {
    const a = byId(S.bms.ahus, id);
    if (!a) return head('Unit not found');
    const card = (t, body) => `<div class="card"><header><h3>${t}</h3></header>${body}</div>`;
    return head(`${a.id} — ${a.name} ${statusPill(a.status)}`, '', `<div class="seg">${['Auto', 'Occupied', 'Unoccupied', 'Fire Mode', 'Maintenance'].map(m => `<button data-action="ahumode" data-id="${a.id}" data-v="${m}" class="${a.mode === m ? 'on' : ''}">${m}</button>`).join('')}</div>`) +
      `<div class="card flush ${a.status === 'tripped' ? 'alert' : ''}" style="margin-bottom:14px;background:#061013">${ahuDiagram(a)}</div>
      <div class="grid g4">
        ${card('Key temperatures', `<dl class="kv"><dt>Outside air</dt><dd>${S.bms.outside} °C</dd><dt>Return air</dt><dd>${a.returnTemp} °C</dd><dt>Mixed air</dt><dd>${a.mixedTemp} °C</dd><dt>Supply air</dt><dd>${a.supplyTemp} °C</dd></dl>`)}
        ${card('Fans & motors', `<dl class="kv"><dt>Supply fan</dt><dd>${a.status === 'tripped' ? '<span style="color:var(--red)">Tripped</span>' : a.supplyHz + ' Hz · ' + (a.supplyHz ? (a.supplyHz / 4).toFixed(1) + ' A' : '—')}</dd><dt>Return fan</dt><dd>${a.returnHz} Hz</dd></dl>`)}
        ${card('Valves & coils', `<dl class="kv"><dt>CHW valve</dt><dd>${a.chwValve} %</dd><dt>CHW in / out</dt><dd>${S.bms.chillers[0].chws} / ${(S.bms.chillers[0].chws + 5.2).toFixed(1)} °C</dd><dt>Mixing damper</dt><dd>${a.damper} %</dd></dl>`)}
        ${card('Filters & pressures', `<dl class="kv"><dt>Filter differential</dt><dd>${a.filterDp} Pa</dd><dt>Supply duct static</dt><dd>${a.status === 'running' ? 349 : 0} Pa</dd><dt>Filter condition</dt><dd>${a.filterDp > 200 ? 'Dirty' : 'Clean · OK'}</dd></dl>`)}
      </div>`;
  }
  function viewFcus() {
    return head('FCU Units', `${S.bms.fcus.length} fan coil units online`) + `<div class="card"><div class="table-wrap"><table><thead><tr><th>Unit</th><th>Zone</th><th>Zone temp</th><th>Valve</th><th>Status</th></tr></thead><tbody>
      ${S.bms.fcus.map(f => { const z = byId(S.bms.zones, f.zone); return `<tr><td><strong>${f.id}</strong></td><td>${f.zone}</td><td class="mono">${z.temp} °C</td><td style="min-width:110px"><div class="bar"><i style="width:${f.valve}%"></i></div><small>${f.valve} %</small></td><td>${statusPill(f.status)}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }
  function viewTowers() {
    return head('Cooling Towers', 'Condenser water heat rejection') + `<div class="grid g2">${S.bms.towers.map(t => `<div class="card"><header><h2>${t.id}</h2>${statusPill(t.status)}</header>
      <dl class="kv"><dt>Fan speed</dt><dd>${t.fan} %</dd><dt>Entering water</dt><dd>${t.entering} °C</dd><dt>Leaving water</dt><dd>${t.leaving} °C</dd><dt>Approach</dt><dd>${(t.leaving - 22).toFixed(1)} K</dd></dl><div class="bar" style="margin-top:10px"><i style="width:${t.fan}%"></i></div></div>`).join('')}</div>`;
  }
  function viewPumps() {
    return head('Pumps & Booster Sets') + `<div class="card"><div class="table-wrap"><table><thead><tr><th>Pump</th><th>Type</th><th>Speed</th><th>Status</th></tr></thead><tbody>
      ${S.bms.pumps.map(p => `<tr><td><strong>${p.id}</strong></td><td>${p.type}</td><td class="mono">${p.hz ? p.hz + ' Hz' : '—'}</td><td>${statusPill(p.status)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function viewFans() {
    return head('Fans & Extracts') + `<div class="card"><div class="table-wrap"><table><thead><tr><th>Fan</th><th>Service</th><th>Status</th></tr></thead><tbody>
      ${S.bms.fans.map(f => `<tr><td><strong>${f.id}</strong></td><td>${f.name}</td><td>${statusPill(f.status)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function viewZones() {
    const zs = S.bms.zones, out = zs.filter(z => zoneState(z) !== 'Normal');
    const tr = S.bms.trend.slice(-60);
    const colors = ['var(--accent)', 'var(--cyan)', 'var(--amber)', '#c792ea'];
    return head('Zone temperatures · live heat map', 'Every zone is held within its comfort band of 20–24 °C', `<span class="pill ok">Comfort band 20–24 °C</span>`) +
      (out.length ? `<div class="banner bad">${ic('alert').replace('<svg', '<svg style="width:20px;height:20px;fill:none;stroke:var(--red);stroke-width:2"')}<div class="grow"><strong>${out.length} zone${out.length > 1 ? 's' : ''} out of comfort band</strong><br><small>${out.map(z => `${z.id} ${z.temp} °C`).join(' · ')}</small></div><a class="btn sm" href="#/bms/alarms">View alarms</a></div>` : `<div class="banner ok"><strong>All zones within comfort band</strong></div>`) +
      `<div class="grid split">
        <div class="card flush"><div class="scene">${bmsBuilding({ labels: true })}</div></div>
        <div class="card"><header><h3>Zones</h3><small>Tap to add to trend</small></header>
          <div class="heat">${[3, 2, 1].map(f => `<div class="floor">Level ${f}</div>` + zs.filter(z => z.floor === f).map(z => {
            const st = zoneState(z), sel = ui.zoneSel.includes(z.id);
            return `<button data-action="zonesel" data-id="${z.id}" style="${st === 'High' ? 'border-color:var(--red);background:var(--red-dim)' : st === 'Low' ? 'border-color:#5b8cff;background:rgba(91,140,255,.15)' : ''};${sel ? 'box-shadow:0 0 0 2px var(--cyan) inset' : ''}"><small>Zone ${z.id}</small><strong>${z.temp}°</strong><small>SP ${z.setpoint.toFixed(1)} · ${st}</small></button>`;
          }).join('')).join('')}</div></div>
      </div>
      <div class="card" style="margin-top:14px"><header><h3>Zone temperature trend · live</h3><div class="seg"><button data-action="sp" data-v="-0.5">SP −0.5</button><button data-action="sp" data-v="0.5">SP +0.5</button></div></header>
        ${lineChart({ series: ui.zoneSel.map((id, i) => ({ label: 'Zone ' + id, color: colors[i % 4], data: tr.map(p => p.z[id]) })), times: tr.map(p => p.t), min: 16, max: 30, band: [20, 24], unit: '°' })}
        <small>Set-point buttons adjust the selected zones.</small></div>`;
  }
  function alarmDetail(a) {
    const job = a.jobId && byId(S.jobs, a.jobId);
    const z = byId(S.bms.zones, 'L2-C');
    const tr = S.bms.trend.slice(-60);
    const closed = a.status === 'Cleared';
    return `${closed ? `<div class="banner ok"><strong>ALARM CLOSED${job ? ' · ' + job.id : ''}</strong><span class="grow"></span><small>Full audit trail saved to asset record</small></div>` : `<div class="banner bad"><strong class="pulse">● Fault detected · ${esc(a.equip)}</strong><span class="grow">${esc(a.desc)}</span>${job ? `<a class="btn sm" href="#/service/job/${job.id}">Open ${job.id}</a>` : ''}</div>`}
      <div class="grid split">
        <div class="grid" style="align-content:start">
          <div class="card flush"><div class="scene">${bmsBuilding()}</div></div>
          ${a.unit ? `<div class="card"><header><h3>${closed ? 'Zone L2-C temperature' : 'Zone L2-C temperature · live'}</h3>${statusPill(zoneState(z) === 'Normal' ? 'Normal' : 'High')}</header>${lineChart({ series: [{ label: 'L2-C', color: zoneState(z) === 'Normal' ? 'var(--accent)' : 'var(--red)', data: tr.map(p => p.z['L2-C']) }], times: tr.map(p => p.t), min: 18, max: 30, band: [20, 24], unit: '°' })}</div>` : ''}
        </div>
        <div class="grid" style="align-content:start">
          ${a.unit ? `<div class="card ${closed ? '' : 'alert'}"><header><h3>Alarm sent to Trigon</h3><small class="mono">${hhmm(a.at)}</small></header><dl class="kv"><dt>Unit</dt><dd>${esc(a.unit)}</dd><dt>Reading</dt><dd style="color:var(--red)">${esc(a.reading)}</dd><dt>Impact</dt><dd>${esc(a.impact)}</dd><dt>Time</dt><dd>${dmy(a.at)} · ${new Date(a.at).toLocaleTimeString('en-GB')}</dd></dl></div>` : ''}
          ${a.response ? `<div class="card"><header><h3>Automated response</h3></header>${a.response.length ? timeline(a.response.map((r, i) => ({ ...r, icon: ['alert', 'phone', 'users'][i] || 'check', cls: i === 0 ? 'bad' : 'done' }))) : '<div class="empty pulse">Sending alert…</div>'}</div>` : ''}
          ${a.notified && a.notified.length ? `<div class="card"><header><h3>Notifications sent</h3><small>Same moment</small></header><div class="rows">${a.notified.map(n => `<div class="row">${icS('bell')}<div class="grow"><strong>${n.role}</strong><small>${n.channel}</small></div><span class="pill ok">SENT ${hhmm(n.at)}</span></div>`).join('')}</div></div>` : ''}
          <div class="card"><header><h3>Alarm history</h3><small>Full audit trail</small></header>${timeline(a.history.map((h, i) => ({ ...h, icon: i === 0 ? 'alert' : 'check', cls: i === 0 ? 'bad' : 'done' })))}</div>
        </div>
      </div>`;
  }
  function viewAlarms() {
    const act = activeAlarms();
    const fault = S.bms.fault && byId(S.alarms, S.bms.fault.alarm);
    return head('Alarms', 'Equipment trips, offline sensors and zones out of control reach Trigon straight away', faultBtn()) +
      `<div class="card" style="margin-bottom:14px"><header><h3>${act.length ? act.length + ' active' : 'No active alarms'}</h3></header>${alarmTable(S.alarms)}</div>` +
      (fault ? alarmDetail(fault) : '');
  }
  function viewAlarm(id) {
    const a = byId(S.alarms, id);
    if (!a) return head('Alarm not found');
    return head(`${esc(a.equip)} · ${esc(a.desc)}`, '', `<a class="btn sm" href="#/bms/alarms">${ic('back')}All alarms</a>`) + alarmDetail(a);
  }
  function viewTrends() {
    const tr = S.bms.trend, t = tr.map(p => p.t), zs = S.bms.zones;
    return head('Trends', `Last ${tr.length} samples · live`) + `<div class="grid g2">
      <div class="card"><header><h3>Zone temperatures (°C)</h3></header>${lineChart({ series: [{ label: 'Max', color: 'var(--red)', data: tr.map(p => Math.max(...Object.values(p.z))) }, { label: 'Average', color: 'var(--accent)', data: tr.map(p => +(Object.values(p.z).reduce((s, v) => s + v, 0) / zs.length).toFixed(1)) }, { label: 'Min', color: 'var(--cyan)', data: tr.map(p => Math.min(...Object.values(p.z))) }], times: t, band: [20, 24], min: 16, max: 30 })}</div>
      <div class="card"><header><h3>Chilled water (°C)</h3></header>${lineChart({ series: [{ label: 'Supply', color: 'var(--cyan)', data: tr.map(p => p.chws) }, { label: 'Return', color: 'var(--amber)', data: tr.map(p => p.chwr) }], times: t, min: 4, max: 14 })}</div>
      <div class="card"><header><h3>Supply air (°C)</h3></header>${lineChart({ series: [{ label: 'Avg supply air', color: 'var(--cyan)', data: tr.map(p => p.sat) }], times: t, min: 10, max: 18 })}</div>
      <div class="card"><header><h3>CO₂ (ppm)</h3></header>${lineChart({ series: [{ label: 'CO₂', color: '#c792ea', data: tr.map(p => p.co2) }], times: t, min: 400, max: 1000 })}</div></div>`;
  }
  function viewPoints() {
    const b = S.bms, rows = [];
    b.ahus.forEach(a => {
      rows.push([a.id + '.SF.STS', a.id + ' supply fan status', a.status === 'tripped' ? 'TRIPPED' : a.supplyHz ? 'ON' : 'OFF', 'DI']);
      rows.push([a.id + '.SF.HZ', a.id + ' supply fan speed', a.supplyHz + ' Hz', 'AI']);
      rows.push([a.id + '.SAT', a.id + ' supply air temp', a.supplyTemp + ' °C', 'AI']);
      rows.push([a.id + '.RAT', a.id + ' return air temp', a.returnTemp + ' °C', 'AI']);
      rows.push([a.id + '.CHWV', a.id + ' CHW valve', a.chwValve + ' %', 'AO']);
      rows.push([a.id + '.FLT.DP', a.id + ' filter ΔP', a.filterDp + ' Pa', 'AI']);
    });
    b.zones.forEach(z => { rows.push(['ZN.' + z.id + '.T', 'Zone ' + z.id + ' temperature', z.temp + ' °C', 'AI']); rows.push(['ZN.' + z.id + '.SP', 'Zone ' + z.id + ' set-point', z.setpoint.toFixed(1) + ' °C', 'AV']); });
    b.chillers.forEach(c => { rows.push([c.id + '.STS', c.id + ' status', c.status.toUpperCase(), 'DI']); rows.push([c.id + '.LOAD', c.id + ' load', c.load + ' %', 'AI']); });
    b.pumps.forEach(p => rows.push([p.id + '.STS', p.id + ' status', p.status.toUpperCase(), 'DI']));
    return head('Point Register', `${rows.length} BMS points`, `<input type="search" placeholder="Filter points…" data-filter="points" style="padding:8px 12px;background:var(--bg2);border:1px solid var(--line2);border-radius:8px;font-size:16px;min-width:0;flex:1;max-width:280px">`) +
      `<div class="card"><div class="table-wrap"><table id="points"><thead><tr><th>Point</th><th class="hide-sm">Description</th><th>Value</th><th>Type</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="mono"><strong>${r[0]}</strong></td><td class="hide-sm">${r[1]}</td><td class="mono" style="${r[2] === 'TRIPPED' ? 'color:var(--red)' : ''}">${r[2]}</td><td><span class="pill">${r[3]}</span></td></tr>`).join('')}</tbody></table></div></div>`;
  }

  /* ---------------- views: vehicles, dispatch, assessments ---------------- */
  function viewVehicles() {
    return head('Vehicles', 'Fleet status') + `<div class="grid g4" style="margin-bottom:14px">${kpi('truck', 'Vehicles', S.vehicles.length)}${kpi('route', 'In transit', S.vehicles.filter(v => v.status === 'in transit').length)}${kpi('pin', 'On site', S.vehicles.filter(v => v.status === 'on site').length)}${kpi('wrench', 'Service due', S.vehicles.filter(v => v.odo >= v.nextService - 2000).length)}</div>
      <div class="grid g2">${S.vehicles.map(v => `<div class="card"><header><h2>${esc(v.reg)}</h2>${statusPill(v.status)}</header><small>${esc(v.model)}</small>
        <dl class="kv" style="margin-top:10px"><dt>Driver</dt><dd>${esc((tech(v.driver) || {}).name || '—')}</dd><dt>Location</dt><dd>${esc(v.location)}</dd><dt>Odometer</dt><dd>${v.odo.toLocaleString()} km</dd><dt>Next service</dt><dd style="${v.odo >= v.nextService ? 'color:var(--red)' : ''}">${v.nextService.toLocaleString()} km${v.odo >= v.nextService ? ' · overdue' : ''}</dd></dl>
        <div style="margin-top:10px"><small>Fuel ${v.fuel}%</small><div class="bar"><i style="width:${v.fuel}%;${v.fuel < 25 ? 'background:var(--red)' : ''}"></i></div></div></div>`).join('')}</div>`;
  }
  function viewVehicleService() {
    const list = [...S.vehicles].sort((a, b) => (a.nextService - a.odo) - (b.nextService - b.odo));
    return head('Service schedule', 'Sorted by distance to next service') + `<div class="card"><div class="table-wrap"><table><thead><tr><th>Vehicle</th><th>Odometer</th><th>Next service</th><th>Remaining</th></tr></thead><tbody>
      ${list.map(v => { const r = v.nextService - v.odo; return `<tr><td><strong>${esc(v.reg)}</strong><br><small>${esc(v.model)}</small></td><td class="mono">${v.odo.toLocaleString()}</td><td class="mono">${v.nextService.toLocaleString()}</td><td>${r <= 0 ? `<span class="pill bad">Overdue ${(-r).toLocaleString()} km</span>` : r < 5000 ? `<span class="pill warn">${r.toLocaleString()} km</span>` : `<span class="pill ok">${r.toLocaleString()} km</span>`}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  }
  const TRIP_FLOW = ['Scheduled', 'In transit', 'Delivered'];
  function viewDispatch() {
    return head('Driver Dispatch', 'Parts, equipment and refrigerant movements', `<a class="btn primary sm" href="#/dispatch/new">${ic('plus')}New trip</a>`) +
      `<div class="card"><div class="table-wrap"><table><thead><tr><th>Trip</th><th>Load</th><th class="hide-sm">Route</th><th>Driver</th><th>Status</th><th></th></tr></thead><tbody>
      ${S.trips.map(t => { const i = TRIP_FLOW.indexOf(t.status); return `<tr><td><strong>${t.id}</strong><br><small class="mono">${hhmm(t.at)}</small></td><td>${esc(t.what)}</td><td class="hide-sm"><small>${esc(t.from)} →<br>${esc(t.to)}</small></td><td>${esc((tech(t.driver) || {}).name || '—')}</td><td>${statusPill(t.status)}</td><td>${i < 2 ? `<button class="btn sm" data-action="trip" data-id="${t.id}">${i === 0 ? 'Depart' : 'Delivered'}</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  }
  function viewDispatchNew() {
    const places = ['Trigon depot', ...S.buildings.map(b => b.name), 'Supplier — Isando'];
    return head('New trip') + `<form class="card form" data-form="trip" style="max-width:640px">
      <div class="field"><label>Load / description</label><input name="what" required placeholder="e.g. Replacement fan motor"></div>
      <div class="grid g2"><div class="field"><label>From</label><select name="from">${places.map(p => `<option>${esc(p)}</option>`).join('')}</select></div>
      <div class="field"><label>To</label><select name="to">${places.map((p, i) => `<option ${i === 1 ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div></div>
      <div class="grid g2"><div class="field"><label>Driver</label><select name="driver">${S.technicians.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Departure</label><input type="time" name="time" value="${hhmm(new Date(Date.now() + 36e5).toISOString())}"></div></div>
      <button class="btn primary" type="submit">${ic('route')}Schedule trip</button></form>`;
  }
  const ASSESS_ITEMS = ['Chillers', 'AHUs', 'Pumps', 'Cooling towers', 'Controls / BMS', 'Electrical panels'];
  function viewAssessments(id) {
    if (id) {
      const a = byId(S.assessments, id);
      if (!a) return head('Assessment not found');
      return head(`${a.id} · ${esc(a.type)}`, `${esc(bld(a.building).name)} · ${dmy(a.date)} · by ${esc((tech(a.by) || {}).name || '—')}`, `<a class="btn sm" href="#/assessments">${ic('back')}All</a>`) +
        `<div class="grid split"><div class="card"><header><h2>Condition ratings</h2></header>${a.items.map(it => `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between"><span>${esc(it.name)}</span><strong>${it.rating}/5</strong></div><div class="bar"><i style="width:${it.rating * 20}%;${it.rating <= 2 ? 'background:var(--red)' : it.rating === 3 ? 'background:var(--amber)' : ''}"></i></div></div>`).join('')}</div>
        <div class="grid" style="align-content:start"><div class="card" style="text-align:center">${gauge(a.score, 'Overall score')}</div><div class="card"><header><h3>Notes & recommendations</h3></header><p>${esc(a.notes) || '—'}</p></div></div></div>`;
    }
    return head('Assessments', 'Site and plant condition assessments', `<a class="btn primary sm" href="#/assessments/new">${ic('plus')}New assessment</a>`) +
      `<div class="grid g3">${S.assessments.map(a => `<a class="card" href="#/assessments/${a.id}" style="color:inherit;display:block"><header><h3>${a.id}</h3><span class="pill ${a.score >= 80 ? 'ok' : a.score >= 60 ? 'warn' : 'bad'}">${a.score}%</span></header><strong>${esc(a.type)}</strong><br><small>${esc(bld(a.building).name)} · ${dmy(a.date)}</small></a>`).join('')}</div>`;
  }
  function viewAssessNew() {
    return head('New assessment') + `<form class="card form" data-form="assess" style="max-width:720px">
      <div class="grid g2"><div class="field"><label>Building</label><select name="building">${S.buildings.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Assessor</label><select name="by">${S.technicians.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div></div>
      <div class="field"><label>Assessment type</label><input name="type" value="Plant condition assessment" required></div>
      ${ASSESS_ITEMS.map((it, i) => `<div class="field"><label>${it}</label><div class="radio-row">${[1, 2, 3, 4, 5].map(r => `<label><input type="radio" name="r${i}" value="${r}" ${r === 4 ? 'checked' : ''}><span>${r}</span></label>`).join('')}</div></div>`).join('')}
      <div class="field"><label>Notes & recommendations</label><textarea name="notes"></textarea></div>
      <button class="btn primary" type="submit">${ic('check')}Save assessment</button></form>`;
  }

  /* ---------------- router ---------------- */
  const ROUTES = {
    dashboard: viewDashboard,
    'service/live': viewLive, 'service/callout': viewCallout, 'service/jobcards': viewJobCards, 'service/job': viewJob, 'service/report': viewReport,
    'service/techs': viewTechs, 'service/notifications': viewNotifs, 'service/reports': viewReports, 'service/clients': viewClients, 'service/documents': viewDocs,
    'bms/overview': viewOverview, 'bms/chillers': viewChillers, 'bms/ahus': viewAhus, 'bms/ahu': viewAhu, 'bms/fcus': viewFcus, 'bms/towers': viewTowers,
    'bms/pumps': viewPumps, 'bms/fans': viewFans, 'bms/zones': viewZones, 'bms/alarms': viewAlarms, 'bms/alarm': viewAlarm, 'bms/trends': viewTrends, 'bms/points': viewPoints,
    vehicles: viewVehicles, 'vehicles/service': viewVehicleService, dispatch: viewDispatch, 'dispatch/new': viewDispatchNew,
    assessments: viewAssessments, 'assessments/new': viewAssessNew,
  };
  const LIVE = new Set(['dashboard', 'service/live', 'bms/overview', 'bms/chillers', 'bms/ahus', 'bms/ahu', 'bms/fcus', 'bms/towers', 'bms/zones', 'bms/alarms', 'bms/alarm', 'bms/trends']);
  let current = { key: 'dashboard', mod: 'dashboard' };
  function parse() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (!parts.length) return { key: 'dashboard', mod: 'dashboard' };
    let key = parts.slice(0, 2).join('/');
    if (parts.length >= 2 && ROUTES[key]) return { key, arg: parts[2], mod: parts[0] };
    if (ROUTES[parts[0]]) return { key: parts[0], arg: parts[1], mod: parts[0] };
    return { key: 'dashboard', mod: 'dashboard' };
  }
  const isLive = () => LIVE.has(current.key) && !document.hidden;
  function render(soft) {
    const prev = current.key + '|' + current.arg;
    current = parse();
    const mod = MODULES.find(m => m.id === current.mod) || MODULES[0];
    renderNav(mod, current.key);
    const view = $('#view');
    view.innerHTML = ROUTES[current.key](current.arg);
    if (!soft || prev !== current.key + '|' + current.arg) {
      if (!soft) { window.scrollTo(0, 0); }
    }
    mountSignature();
  }

  /* ---------------- signature pad ---------------- */
  function mountSignature() {
    const c = $('#sig');
    if (!c) return;
    ui.sigDirty = false;
    const ratio = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * ratio; c.height = r.height * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1a1e';
    let drawing = false;
    const pos = e => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    c.addEventListener('pointerdown', e => { drawing = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); });
    c.addEventListener('pointermove', e => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); ui.sigDirty = true; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => c.addEventListener(t, () => { drawing = false; }));
  }

  /* ---------------- photos ---------------- */
  function readPhotos(files) {
    return Promise.all([...files].slice(0, 6).map(f => new Promise(res => {
      const img = new Image(), url = URL.createObjectURL(f);
      img.onload = () => {
        const s = Math.min(1, 480 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = img.width * s; cv.height = img.height * s;
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => res(null);
      img.src = url;
    }))).then(a => a.filter(Boolean));
  }

  /* ---------------- events ---------------- */
  const ACTIONS = {
    fault: () => simulateFault(),
    reset: () => { if (confirm('Reset all demo data?')) { S = Store.reset(); seedTrend(); ui.unread = 0; updateBell(); render(); toast('Demo data reset'); } },
    jobfilter: el => { ui.jobFilter = el.dataset.v; render(true); },
    advance: el => { const j = byId(S.jobs, el.dataset.id); if (j && advance(j)) { toast(`${j.id} · ${stepLabel(j.status)}`, 'Building & operations managers notified'); render(true); } },
    sigclear: () => mountSignature(),
    sign: el => {
      const j = byId(S.jobs, el.dataset.id), c = $('#sig'), name = $('#signedBy').value.trim();
      if (!ui.sigDirty) return toast('Signature needed', 'Ask the customer to sign in the box.', 'bad');
      if (!name) return toast('Name needed', 'Enter the name of the person signing.', 'bad');
      j.signature = c.toDataURL('image/png'); j.signedBy = name;
      const t = tech(j.tech); if (t) { t.status = 'available'; t.job = null; const v = byId(S.vehicles, t.vehicle); if (v) v.status = 'parked'; }
      setStep(j, 'report');
      toast('Signed report shared', 'Delivered to building & operations managers');
      render(true);
    },
    print: () => window.print(),
    duty: el => { const t = tech(el.dataset.id); t.status = t.status === 'off' ? 'available' : 'off'; Store.save(); render(true); },
    doc: () => toast('Demo document', 'Connect document storage to open files.'),
    ahumode: el => { const a = byId(S.bms.ahus, el.dataset.id); a.mode = el.dataset.v; Store.save(); toast(`${a.id} mode → ${a.mode}`); render(true); },
    zonesel: el => { const id = el.dataset.id; ui.zoneSel = ui.zoneSel.includes(id) ? ui.zoneSel.filter(x => x !== id) : [...ui.zoneSel, id].slice(-4); render(true); },
    sp: el => { const d = +el.dataset.v; ui.zoneSel.forEach(id => { const z = byId(S.bms.zones, id); z.setpoint = clamp(z.setpoint + d, 18, 26); if (!(S.bms.fault && id === 'L2-C')) z.target = +(z.setpoint + (Math.random() - .5) * .4).toFixed(1); }); Store.save(); toast('Set-point adjusted', ui.zoneSel.join(', ')); render(true); },
    trip: el => { const t = byId(S.trips, el.dataset.id); t.status = TRIP_FLOW[TRIP_FLOW.indexOf(t.status) + 1]; t.at = nowIso(); Store.save(); render(true); },
  };
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (a) { e.preventDefault(); ACTIONS[a.dataset.action] && ACTIONS[a.dataset.action](a); return; }
    const r = e.target.closest('tr[data-href]');
    if (r && !e.target.closest('a,button')) location.hash = r.dataset.href;
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.bind) { const j = byId(S.jobs, el.dataset.id); if (j) { j[el.dataset.bind] = el.value; Store.save(); } }
    if (el.dataset.filter === 'points') { const q = el.value.toLowerCase(); document.querySelectorAll('#points tbody tr').forEach(tr => { tr.hidden = !tr.textContent.toLowerCase().includes(q); }); }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.change === 'building') {
      const b = bld(el.value), f = el.form;
      f.equipment.innerHTML = b.equipment.map(x => `<option>${esc(x)}</option>`).join('');
      f.location.innerHTML = b.locations.map(x => `<option>${esc(x)}</option>`).join('');
    }
    if (el.dataset.photos) {
      readPhotos(el.files).then(list => {
        if (el.dataset.photos === 'pending') ui.pendingPhotos.push(...list);
        else { const j = byId(S.jobs, el.dataset.photos); j.photos.push(...list); Store.save(); }
        const th = $('#thumbs');
        if (th) th.insertAdjacentHTML('beforeend', list.map(p => `<img src="${p}" alt="Photo">`).join(''));
        toast(`${list.length} photo(s) attached`);
      });
    }
  });
  document.addEventListener('submit', e => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    if (f.dataset.form === 'callout') {
      const job = newJob({ building: d.building, equipment: d.equipment, location: d.location, fault: d.fault.trim(), urgency: d.urgency, photos: ui.pendingPhotos.slice(), contact: d.contact, source: 'Client app' });
      ui.pendingPhotos = [];
      toast(`Call ${job.id} logged`, 'Request landed at the Trigon service desk');
      location.hash = '#/service/job/' + job.id;
      setTimeout(() => { if (job.status === 'logged' && autoAssign(job)) { toast(`${job.id} · Technician assigned`, tech(job.tech).name); if (current.arg === job.id) render(true); } }, 2000);
    }
    if (f.dataset.form === 'trip') {
      const [hh, mm] = (d.time || '00:00').split(':');
      const at = new Date(); at.setHours(+hh, +mm, 0, 0);
      const t = tech(d.driver);
      S.trips.unshift({ id: 'D-' + (300 + S.trips.length + 1), what: d.what, from: d.from, to: d.to, driver: d.driver, vehicle: t && t.vehicle, status: 'Scheduled', at: at.toISOString() });
      Store.save(); toast('Trip scheduled', d.what); location.hash = '#/dispatch';
    }
    if (f.dataset.form === 'assess') {
      const items = ASSESS_ITEMS.map((name, i) => ({ name, rating: +d['r' + i] }));
      const score = Math.round(items.reduce((s, x) => s + x.rating, 0) / items.length * 20);
      const id = 'AS-0' + (21 + S.assessments.length);
      S.assessments.unshift({ id, building: d.building, by: d.by, type: d.type, date: nowIso(), score, items, notes: d.notes });
      Store.save(); toast('Assessment saved', `${id} · score ${score}%`); location.hash = '#/assessments/' + id;
    }
  });
  $('#bellBtn').addEventListener('click', () => { location.hash = '#/service/notifications'; });
  window.addEventListener('hashchange', () => render());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && isLive()) render(true); });

  function clock() {
    const d = new Date();
    $('#clock').textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    $('#date').textContent = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const pill = $('#bmsPill');
    const bad = activeAlarms().length;
    pill.className = 'pill ' + (bad ? 'bad' : 'ok');
    pill.innerHTML = `<i></i>${bad ? bad + ' Alarm' + (bad > 1 ? 's' : '') : 'BMS Online'}`;
  }

  /* ---------------- boot ---------------- */
  seedTrend();
  // A fault simulation interrupted by a reload: resume its automated response.
  if (S.bms.fault) {
    const a = byId(S.alarms, S.bms.fault.alarm);
    if (!a) S.bms.fault = null;
    else if (!a.jobId) { const job = newJob({ building: 'B1', equipment: 'AHU-02 · Air handling unit', location: 'Level 2 - Central zone', fault: 'Supply fan tripped (BMS alarm)', urgency: 'Critical', source: 'BMS automatic' }); a.jobId = job.id; respond(a, `Call ${job.id} raised automatically`, 'Priority: critical'); }
  }
  render();
  clock();
  setInterval(clock, 1000);
  setInterval(tick, 3000);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
