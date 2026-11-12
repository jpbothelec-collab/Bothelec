/* Bothelec Aircon Solutions — Operations, Service & Building Monitoring web app.
 * Vanilla JS single-page app. Hash routing, event delegation, simulated BMS feed. */
(function () {
  'use strict';

  let S = null; // filled from /api/state
  let STEPS = [];
  const EMPTY_BMS = { zones: [], ahus: [], chillers: [], pumps: [], towers: [], fans: [], fcus: [], trend: [], fault: null };
  const ui = { jobFilter: 'open', zoneSel: [], pendingPhotos: [], sigDirty: false, unread: 0, site: null, lastFeed: null, bmsCache: {}, pendingRender: false };
  try { ui.site = localStorage.getItem('bothelec.site'); } catch (e) { /* storage blocked */ }
  ui.biz = 'aircon'; try { if (localStorage.getItem('bothelec.biz') === 'utility') ui.biz = 'utility'; } catch (e) { /* storage blocked */ }

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
    gear: 'M12 15a3 3 0 1 0 0-6a3 3 0 1 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
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
  /* ---------------- navigation ---------------- */
  const SERVICE_SIDE = [
    ['service/live', 'Live Jobs', 'grid'], ['service/callout', 'Call-outs', 'phone'], ['service/jobcards', 'Job Cards', 'card'], ['service/equipment', 'Equipment & history', 'fcu'],
    ['service/techs', 'Technicians', 'users', 'staff'], ['service/notifications', 'Notifications', 'bell'], ['assessments', 'Assessments', 'clipboard', 'field'],
    ['service/tracker', 'Billing tracker', 'list', 'staff'], ['service/reports', 'Signed job reports', 'card', 'notech'], ['service/clients', 'Clients', 'building', 'staff'], ['service/documents', 'Documents', 'doc', 'notech'],
  ];
  const BMS_SIDE = [
    ['bms/overview', 'Site Overview', 'building'], ['bms/chillers', 'Chiller Plants', 'snow'], ['bms/ahus', 'AHUs & Ventilation', 'wind'],
    ['bms/fcus', 'FCU Units', 'fcu'], ['bms/towers', 'Cooling Towers', 'tower'], ['bms/pumps', 'Pumps & Booster Sets', 'pump'],
    ['bms/fans', 'Fans & Extracts', 'fan'], ['bms/zones', 'Temperatures', 'thermo'], ['bms/alarms', 'Alarms', 'alert'],
    ['bms/trends', 'Trends', 'trend'], ['bms/points', 'Point Register', 'list'], ['service/documents', 'Documents', 'doc'],
  ];
  const SETTINGS_SIDE = [['settings', 'SMS & email', 'bell'], ['settings/billing', 'Zoho Books & billing', 'doc'], ['settings/buildings', 'Buildings & BMS links', 'building'], ['settings/users', 'Users', 'users'], ['settings/outbox', 'Message log', 'list']];
  const METER_SIDE = [['meters/setup', 'Building setup', 'plus', 'staff'], ['meters/overview', 'Sites overview', 'building'], ['meters/balance', 'Building balance', 'trend'], ['meters/register', 'Meter register', 'fcu'], ['meters/capture', 'Record readings', 'check', 'field'], ['meters/import', 'Import readings', 'doc', 'staff']];
  const REC_SIDE = [['recoveries/runs', 'Billing runs', 'doc'], ['recoveries/tenants', 'Tenants', 'users'], ['recoveries/btariffs', 'Building tariffs', 'building', 'staff'], ['recoveries/tariffs', 'All tariffs', 'list', 'staff'], ['service/tracker', 'Billing tracker', 'list', 'staff']];
  const MODULES = [
    { id: 'dashboard', label: 'Dashboard', techLabel: 'My work', icon: 'grid', home: 'dashboard', side: SERVICE_SIDE, sub: 'Operations & Service' },
    { id: 'meters', label: 'Meters', icon: 'bolt', home: 'meters/overview', side: METER_SIDE, sub: 'Utility Management', biz: 'utility' },
    { id: 'recoveries', label: 'Tenant billing', short: 'Billing', icon: 'doc', home: 'recoveries/runs', side: REC_SIDE, sub: 'Utility Management', biz: 'utility', roles: ['admin', 'desk', 'client'] },
    { id: 'bms', biz: 'aircon', label: 'Info Hub', icon: 'info', home: 'bms/overview', side: BMS_SIDE, sub: 'Building Monitoring Centre', roles: ['admin', 'desk', 'client'] },
    { id: 'service', biz: 'aircon', label: 'Service & Maintenance', short: 'Service', techLabel: 'Jobs', icon: 'wrench', home: 'service/live', side: SERVICE_SIDE, sub: 'Operations & Service' },
    { id: 'vehicles', biz: 'aircon', label: 'Vehicles', icon: 'truck', home: 'vehicles', side: [['vehicles', 'Fleet', 'truck']], sub: 'Fleet', roles: ['admin', 'desk'] },
    { id: 'dispatch', biz: 'aircon', label: 'Driver Dispatch', short: 'Dispatch', techLabel: 'Trips', icon: 'pin', home: 'dispatch', side: [['dispatch', 'Trips & deliveries', 'route'], ['dispatch/new', 'New trip', 'plus']], sub: 'Logistics', roles: ['admin', 'desk', 'tech'] },
    { id: 'assessments', biz: 'aircon', label: 'Assessments', short: 'Assess', icon: 'clipboard', home: 'assessments', side: [['assessments', 'All assessments', 'clipboard'], ['assessments/new', 'New assessment', 'plus']], sub: 'Site assessments', roles: ['admin', 'desk', 'tech'] },
    { id: 'reports', label: 'Reports', icon: 'chart', home: 'reports/overview', side: [], sub: 'Reports & performance', roles: ['admin', 'desk', 'client'] },
    { id: 'settings', label: 'Settings', icon: 'gear', home: 'settings', side: SETTINGS_SIDE, sub: 'Administration', roles: ['admin'] },
  ];
  const role = () => (S && S.me ? S.me.role : 'client');
  const isUtil = () => ui.biz === 'utility';
  const divOf = j => j.division || 'aircon';
  const bizBuildings = () => (S ? S.buildings.filter(b => (b.divisions || ['aircon']).includes(ui.biz)) : []);
  const bizJobs = () => S.jobs.filter(j => divOf(j) === ui.biz);
  /* In utility mode the shared Service menu points at meters instead of aircon equipment. */
  function sideFor(mod) {
    if (mod.id === 'reports') return isUtil() ? REPORT_UTILITY : REPORT_AIRCON;
    if (isUtil() && mod.id === 'dashboard') return UTIL_HOME_SIDE;
    if (!isUtil() || !(mod.id === 'dashboard' || mod.id === 'service')) return mod.side;
    return mod.side.filter(x => x[0] !== 'assessments' && x[0] !== 'service/tracker').map(x => (x[0] === 'service/equipment' ? ['meters/register', 'Meters', 'bolt'] : x));
  }
  /* Utility Management is a billing platform: no technicians, vehicles, dispatch or service jobs. */
  const UTIL_HOME_SIDE = [['dashboard', 'Dashboard', 'grid'], ['meters/overview', 'Sites overview', 'building'], ['meters/capture', 'Record readings', 'check', 'staff'], ['recoveries/runs', 'Billing runs', 'doc'], ['recoveries/tenants', 'Tenants', 'users'], ['reports/overview', 'Reports', 'chart']];
  const BIZ = { aircon: 'Aircon Solutions', utility: 'Utility Management' };
  function renderBiz() {
    const divs = [...new Set(S.buildings.flatMap(b => b.divisions || ['aircon']))];
    const choices = role() === 'client' ? divs : isTech() ? ['aircon'] : ['aircon', 'utility'];
    $('#brandSub').innerHTML = choices.length > 1 ? `<select id="bizSel" aria-label="Company">${choices.map(d => `<option value="${d}" ${d === ui.biz ? 'selected' : ''}>${BIZ[d]}</option>`).join('')}</select>` : esc(BIZ[ui.biz]);
    document.title = `Bothelec ${BIZ[ui.biz]}`;
    document.body.dataset.biz = ui.biz;
  }
  async function switchBiz(v) {
    if (!BIZ[v] || v === ui.biz) return;
    ui.biz = v; try { localStorage.setItem('bothelec.biz', v); } catch (e) { /* storage blocked */ }
    const bb = bizBuildings(); if (!bb.find(b => b.id === ui.site) && bb[0]) { ui.site = bb[0].id; if (v === 'aircon') await loadBms().catch(() => {}); }
    toast(`Bothelec ${BIZ[v]}`, v === 'utility' ? 'Meters, readings and tenant billing' : 'Service, monitoring and maintenance');
    if (location.hash === '#/dashboard' || !location.hash) render(); else location.hash = '#/dashboard';
  }
  const isStaff = () => role() === 'admin' || role() === 'desk';
  const isField = () => role() !== 'client';
  const isTech = () => role() === 'tech';
  const sideAllowed = item => !item[3] || (item[3] === 'staff' ? isStaff() : item[3] === 'notech' ? !isTech() : isField());
  const sideLabel = (href, label) => (isTech() ? { 'service/live': 'My jobs', 'service/callout': 'Log a call', dispatch: 'My trips', assessments: 'My assessments' }[href] || label : label);
  const site = () => (S && S.buildings.find(b => b.id === ui.site)) || {};
  const canSim = () => isStaff() && (site().connector || {}).type === 'simulator';

  function renderNav(mod, key) {
    renderBiz();
    $('#modules').innerHTML = MODULES.filter(m => (!m.roles || m.roles.includes(role())) && (!m.biz || m.biz === ui.biz)).map(m =>
      `<a href="#/${m.home}" class="${m.id === mod.id ? 'active' : ''}" title="${esc(m.label)}">${ic(m.icon)}<span class="l">${esc(isTech() && m.techLabel ? m.techLabel : m.label)}</span><span class="s">${esc(isTech() && m.techLabel ? m.techLabel : m.short || m.label)}</span></a>`).join('');
    const b = site();
    $('#siteName').textContent = b.name || 'No building';
    $('#siteArea').textContent = b.area || '';
    const activeAlarms = S.alarms.filter(a => a.status === 'Active' && a.building === ui.site).length;
    const conn = (b.connector || {}).type || 'none';
    $('#sidebar').innerHTML = `
      ${isTech() ? '' : `<div class="site-card">${icS('building')}<div style="min-width:0;flex:1">${bizBuildings().length > 1
        ? `<select data-change="site" aria-label="Building" style="width:100%;background:transparent;border:0;font-weight:650;font-size:12px;padding:0">${bizBuildings().map(x => `<option value="${x.id}" ${x.id === ui.site ? 'selected' : ''} style="background:#0d1c21">${esc(x.name)}</option>`).join('')}</select>`
        : `<strong>${esc(b.name || '—')}</strong>`}<small>${esc(b.area || '')}</small>
        ${isUtil() ? `<span class="pill info" style="margin-top:3px;width:max-content"><i></i>${(n => n + ' meter' + (n === 1 ? '' : 's'))((S.meters || []).filter(m => m.building === b.id && !m.removed).length)}</span>` : `<span class="pill ${conn === 'none' ? 'off' : 'ok'}" style="margin-top:3px;width:max-content"><i></i>${conn === 'none' ? 'No BMS link' : conn === 'simulator' ? 'Simulated' : 'BMS ' + conn}</span>`}</div></div>`}
      <nav class="side">${sideFor(mod).filter(sideAllowed).map(([href, label, icon]) => {
        const on = key === href || (key.startsWith(href + '/') && href.includes('/')) || (href === 'bms/ahus' && key === 'bms/ahu') || (href === 'service/jobcards' && (key === 'service/job' || key === 'service/report')) || (href === 'bms/alarms' && key === 'bms/alarm') || (href === 'settings/buildings' && key === 'settings/building') || (href === 'settings/users' && key === 'settings/user') || (href === 'service/equipment' && (key === 'service/unit' || key === 'service/unitedit')) || (href === 'service/techs' && key === 'service/tech') || (href === 'service/clients' && key === 'service/building') || (href === 'service/tracker' && (key === 'service/trackrow' || key === 'service/trackimport'));
        const count = href === 'bms/alarms' && activeAlarms ? `<span class="count">${activeAlarms}</span>` : '';
        return `<a href="#/${href}" class="${on ? 'active' : ''}">${ic(icon)}<span>${esc(sideLabel(href, label))}</span>${count}</a>`;
      }).join('')}</nav>
      ${mod.id === 'bms' && S.bms.ahus.length ? `<div class="side-label">AHU units (${S.bms.ahus.length})</div><nav class="side">${S.bms.ahus.map(a =>
        `<a href="#/bms/ahu/${a.id}" class="${key === 'bms/ahu' && current.arg === a.id ? 'active' : ''}">${ic('wind')}<span>${a.id}</span><span style="margin-left:auto">${dot(a.status)}</span></a>`).join('')}</nav>` : ''}
      <div class="side-label">Signed in</div><div class="side acct"><a href="#/account">${ic('users')}<span>${esc(S.me.name)}</span></a><a href="#" data-action="tour">${ic('eye')}<span>Product tour</span></a><a href="#" data-action="logout">${ic('back')}<span>Sign out</span></a></div>`;
    const act = $('#sidebar .side a.active');
    if (act && window.innerWidth <= 900) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  const dot = st => `<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${st === 'running' ? 'var(--accent)' : st === 'tripped' ? 'var(--red)' : st === 'standby' ? 'var(--amber)' : 'var(--muted)'}"></i>`;

  function updateBell() {
    const b = $('#bellBadge');
    b.hidden = !ui.unread;
    b.textContent = ui.unread > 99 ? '99+' : ui.unread;
  }

  /* ---------------- server API & live updates ---------------- */
  async function api(method, url, body) {
    const res = await fetch(url, { method, credentials: 'same-origin', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    let data = null; try { data = await res.json(); } catch (e) { /* empty body */ }
    if (res.status === 401 && url !== '/api/login') { S = null; showLogin(); throw new Error('Please sign in.'); }
    if (!res.ok) throw new Error((data && data.error) || 'Request failed (' + res.status + ')');
    return data;
  }
  async function act(method, url, body, okMsg) {
    try { const r = await api(method, url, body); if (okMsg) toast(okMsg[0], okMsg[1]); await refresh(); return r || {}; }
    catch (e) { toast('Could not complete', e.message, 'bad'); return null; }
  }
  function normalizeBms(b) {
    const o = Object.assign({}, EMPTY_BMS, b || {});
    ['zones', 'ahus', 'chillers', 'pumps', 'towers', 'fans', 'fcus', 'trend'].forEach(k => { if (!Array.isArray(o[k])) o[k] = []; });
    return o;
  }
  async function loadBms() {
    if (!ui.site || (S.me && S.me.role === 'tech')) { S.bms = normalizeBms(null); ui.bmsCache[ui.site] = S.bms; return; } // technicians have no building monitoring
    ui.bmsCache[ui.site] = normalizeBms(await api('GET', '/api/bms/' + encodeURIComponent(ui.site)));
    S.bms = ui.bmsCache[ui.site];
    if (!ui.zoneSel.length || !ui.zoneSel.every(id => S.bms.zones.some(z => z.id === id))) ui.zoneSel = S.bms.zones.slice(0, 2).map(z => z.id);
    connectEvents();
  }
  async function refresh() {
    const st = await api('GET', '/api/state');
    if (S && ui.lastFeed && st.feed.length && st.feed[0].id !== ui.lastFeed) {
      const idx = st.feed.findIndex(f => f.id === ui.lastFeed);
      const fresh = st.feed.slice(0, idx < 0 ? 5 : idx);
      ui.unread += fresh.length;
      fresh.slice(0, 3).forEach(f => toast(f.title, f.body, f.kind));
    }
    ui.lastFeed = st.feed[0] ? st.feed[0].id : ui.lastFeed;
    STEPS = st.steps;
    const keepBms = S && S.bms;
    S = st;
    S.bms = keepBms || normalizeBms(null);
    const divs = S.me && S.me.role === 'tech' ? ['aircon'] : [...new Set(S.buildings.flatMap(b => b.divisions || ['aircon']))];
    if (divs.length && !divs.includes(ui.biz)) ui.biz = divs[0];
    const bb = S.buildings.filter(b => (b.divisions || ['aircon']).includes(ui.biz));
    if (!bb.find(b => b.id === ui.site)) ui.site = (bb.find(b => b.connector && b.connector.type !== 'none') || bb[0] || S.buildings[0] || {}).id || null;
    if (!ui.bmsCache[ui.site]) await loadBms(); else S.bms = ui.bmsCache[ui.site];
    if (!es) connectEvents();
    updateBell();
    rerender();
  }
  async function switchSite(id) {
    ui.site = id;
    try { localStorage.setItem('bothelec.site', id); } catch (e) { /* storage blocked */ }
    await loadBms();
    render(true);
  }
  let es = null, refreshTimer = null;
  function connectEvents() {
    if (es) es.close();
    es = new EventSource('/api/events?building=' + encodeURIComponent(ui.site || ''));
    es.addEventListener('state', () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refresh().catch(() => {}), 150); });
    es.addEventListener('bms', e => {
      const d = JSON.parse(e.data), cur = ui.bmsCache[d.building];
      if (!cur) return;
      const trend = cur.trend;
      Object.assign(cur, d.bms); cur.trend = trend;
      if (d.point && (!trend.length || trend[trend.length - 1].t !== d.point.t)) { trend.push(d.point); if (trend.length > 120) trend.shift(); }
      if (d.building === ui.site) { S.bms = cur; if (isLive()) rerender(); }
    });
  }
  const NO_AUTO = new Set(['recoveries/btariffs', 'recoveries/tariff', 'meters/setup', 'meters/edit', 'meters/capture', 'meters/import', 'meters/meter', 'recoveries/tenant', 'recoveries/tariffs', 'service/trackimport', 'service/tracker', 'service/trackrow', 'settings/billing', 'service/svbilling', 'service/callout', 'service/tech', 'service/building', 'service/unitedit', 'service/unit', 'dispatch/new', 'assessments/new', 'settings', 'settings/building', 'settings/user', 'settings/users', 'settings/buildings', 'settings/outbox', 'account', 'bms/points']);
  function rerender() {
    if (!S) return;
    const a = document.activeElement;
    if (NO_AUTO.has(current.key) || (a && $('#view').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || ($('#sig') && ui.sigDirty)) {
      ui.pendingRender = true;
      if (!NO_AUTO.has(current.key)) renderNav(MODULES.find(m => m.id === current.mod) || MODULES[0], current.key);
      return;
    }
    ui.pendingRender = false;
    render(true);
  }
  document.addEventListener('focusout', () => setTimeout(() => {
    const a = document.activeElement;
    if (ui.pendingRender && !NO_AUTO.has(current.key) && !(a && $('#view').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) && !($('#sig') && ui.sigDirty)) rerender();
  }, 80));

  const NEXT_LABEL = { assigned: 'Assign technician', enroute: 'Technician on the way', onsite: 'Check in on site', completed: 'Mark work completed' };
  const comfort = () => site().comfort || [20, 24];
  function zoneState(z) {
    if (z.online === false) return 'Offline';
    if (z.temp == null) return 'No data';
    const [lo, hi] = comfort();
    return z.temp > hi ? 'High' : z.temp < lo ? 'Low' : 'Normal';
  }
  const nv = (v, u = '') => (v == null || v === '' || (typeof v === 'number' && isNaN(v)) ? '—' : v + u);
  const noBms = () => !S.bms.zones.length && !S.bms.ahus.length && !S.bms.chillers.length && !S.bms.pumps.length;
  function noBmsCard() {
    const b = site(), type = (b.connector || {}).type || 'none';
    return `<div class="card empty" style="text-align:left"><h2 style="margin-bottom:6px">No live BMS data for ${esc(b.name || 'this building')} yet</h2>
      <p>${type === 'none' ? 'This building has no BMS link configured.' : `The ${esc(type)} link is configured but no readings have arrived yet.`}
      ${role() === 'admin' ? `Set it up under <a href="#/settings/building/${b.id}">Settings → Buildings</a>: a Modbus or BACnet controller, a 4G router publishing over MQTT or HTTP, or a GSM alarm modem.` : 'Contact Bothelec to connect it.'}</p></div>`;
  }

  /* ---------------- login ---------------- */
  function showLogin() {
    document.body.classList.add('auth');
    if (es) { es.close(); es = null; }
    $('#view').innerHTML = `<form class="card form login" data-form="login">
      <div style="display:flex;align-items:center;gap:10px"><img src="icon.svg" width="40" height="40" alt=""><div><h1>Bothelec Aircon Solutions</h1><small>Sign in to continue</small></div></div>
      <div class="field"><label for="le">Email</label><input id="le" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn primary" type="submit">Sign in</button><small id="loginErr" style="color:var(--red)"></small>
      <button type="button" class="btn sm" data-action="tour" style="justify-self:center">${ic('eye')}Take the tour</button></form>`;
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
  function heroScene(opts = {}) {
    const P = iso(400, 330, 30);
    let city = '';
    [[-9, -6, 2, 2, 4], [6, -8, 2.4, 2, 5], [-10, 3, 2, 2, 3], [8, 2, 2, 2.5, 3.5], [-4, -10, 2, 2, 6], [11, -3, 1.6, 1.6, 2.5], [-13, -2, 1.8, 1.8, 4.5]]
      .forEach(([x, y, w, d, h]) => { city += `<g opacity=".55">${tower(P, x, y, w, d, h, Math.round(h * 2), false)}</g>`; });
    const top = P(0, 0, 9.4);
    const nodes = opts.nodes || [
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
    const B = opts.bms || S.bms;
    const zonesAll = B.zones;
    const floors = [...new Set(zonesAll.map(z => z.floor || 1))].sort((a, b) => a - b);
    const F = Math.max(1, Math.min(floors.length, 8));
    const scale = F > 4 ? 32 * 4 / F : 32;
    const P = iso(400, 300 + (F > 3 ? 0 : 0), scale);
    const W = 9, D = 4, FH = 1.4, x0 = -W / 2, y0 = -D / 2;
    let s = `<ellipse cx="400" cy="310" rx="360" ry="110" fill="rgba(182,212,51,.05)" stroke="rgba(182,212,51,.25)"/>`;
    [[-7, 3], [-6, 4.5], [6, 4], [7.5, 2], [-3, 5.5], [2, 6], [8, -2]].forEach(([x, y]) => { const [a, b] = P(x, y, 0); s += `<ellipse cx="${a}" cy="${b - 10}" rx="11" ry="13" fill="#1f6b3a"/><rect x="${a - 1.5}" y="${b - 2}" width="3" height="6" fill="#4a3a22"/>`; });
    s += isoBox(P, x0, y0, 0, W, D, FH * F + 0.2, ['#3a4c50', '#22343a', '#18282d']);
    floors.slice(0, F).forEach((fl, fi) => {
      const order = { W: 0, C: 1, E: 2 };
      const row = zonesAll.filter(z => (z.floor || 1) === fl).sort((a, b) => (order[a.pos] ?? 9) - (order[b.pos] ?? 9) || String(a.id).localeCompare(b.id)).slice(0, 6);
      const n = Math.max(row.length, 1), zw = W / n;
      row.forEach((z, zi) => {
        const a = x0 + zi * zw + 0.15, b = x0 + (zi + 1) * zw - 0.15;
        const z0 = fi * FH + 0.4, z1 = (fi + 1) * FH - 0.15;
        const st = zoneState(z);
        const poly = [P(a, y0 + D, z0), P(b, y0 + D, z0), P(b, y0 + D, z1), P(a, y0 + D, z1)];
        s += `<a href="#/bms/zones"><polygon points="${pts(poly)}" fill="${zoneFill(z)}" class="${st === 'High' || st === 'Low' ? 'pulse' : ''}"><title>Zone ${esc(z.id)}: ${nv(z.temp, ' °C')}</title></polygon></a>`;
        for (let m = 1; m < 6; m++) { const xm = a + (b - a) * m / 6; const p1 = P(xm, y0 + D, z0), p2 = P(xm, y0 + D, z1); s += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="#0b1a1e" stroke-width="1.5"/>`; }
        if (opts.labels || (st !== 'Normal' && st !== 'No data')) {
          const c = P((a + b) / 2, y0 + D, (z0 + z1) / 2);
          s += `<g transform="translate(${c[0] - 34},${c[1] - 11})"><rect width="68" height="22" rx="4" fill="rgba(7,16,19,.85)" stroke="${st === 'Normal' ? '#27515a' : 'var(--red)'}"/><text x="34" y="15" text-anchor="middle" font-size="10.5" fill="${st === 'Normal' ? '#dbe9ec' : '#ff8a8e'}">${esc(z.id)} ${nv(z.temp, '°')}</text></g>`;
        }
      });
      for (let c = 0; c < 4; c++) { const a = y0 + c, b = y0 + c + 0.8, z0 = fi * FH + 0.4, z1 = (fi + 1) * FH - 0.15; s += `<polygon points="${pts([P(x0 + W, a + 0.1, z0), P(x0 + W, b, z0), P(x0 + W, b, z1), P(x0 + W, a + 0.1, z1)])}" fill="rgba(70,190,210,.3)"/>`; }
    });
    const roofZ = FH * F + 0.2;
    B.ahus.slice(0, 6).map((a, i) => ({ a, x: x0 + 0.6 + (i % 3) * 2.9, y: y0 + 0.4 + Math.floor(i / 3) * 1.8 }))
      .sort((p, q) => (p.x + p.y) - (q.x + q.y))
      .forEach(({ a, x, y }) => {
        const col = a.status === 'running' ? ['#cfe07a', '#7f9b2a', '#5f7520'] : a.status === 'tripped' ? ['#ff8a8e', '#c4383d', '#94262a'] : ['#8a9a9e', '#56666a', '#435054'];
        s += `<a href="#/bms/ahu/${esc(a.id)}"><g class="${a.status === 'tripped' ? 'pulse' : ''}">${isoBox(P, x, y, roofZ, 1.8, 1.1, 0.55, col)}</g><title>${esc(a.id)}: ${esc(a.status)}</title></a>`;
        if (a.status === 'tripped' || opts.labels) {
          const c = P(x + 0.9, y + 0.55, roofZ + 1.6);
          s += `<g transform="translate(${c[0] - 38},${c[1] - 26})"><rect width="76" height="34" rx="4" fill="rgba(7,16,19,.88)" stroke="${a.status === 'tripped' ? 'var(--red)' : '#27515a'}"/><text x="8" y="14" font-size="10.5" fill="#dbe9ec" font-weight="600">${esc(a.id)}</text><text x="8" y="27" font-size="9.5" fill="${a.status === 'tripped' ? '#ff8a8e' : '#b6d433'}">● ${a.status === 'tripped' ? 'Tripped' : a.status === 'running' ? 'Running' : esc(a.status)}</text></g>`;
        }
      });
    return `<svg viewBox="0 ${F > 3 ? -40 : 0} 800 ${F > 3 ? 460 : 420}" role="img" aria-label="Building zones">${s}</svg>`;
  }
  function lineChart({ series, times, min, max, band, h = 170, unit = '' }) {
    const W = 600, L = 34, R = 50, T = 10, B = 20;
    const all = series.flatMap(s => s.data).filter(v => v != null);
    if (!all.length) return '<div class="empty">No data yet</div>';
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
      ${tag(600, 6, 'RETURN FAN', a.status === 'off' ? 'Off' : 'Running · ' + nv(a.returnHz) + ' Hz')}
      ${tag(600, 280, 'SUPPLY FAN', trip ? 'TRIPPED' : run ? 'Running · ' + nv(a.supplyHz) + ' Hz' : 'Off', trip)}
      ${tag(400, 126, 'CHW VALVE', nv(a.chwValve) + ' % open')}
      ${tag(150, 128, 'DAMPER ACTUATOR', nv(a.damper) + ' % open')}
      ${tag(200, 280, 'FILTER ΔP', nv(a.filterDp) + ' Pa · ' + (a.filterDp > 200 ? 'Dirty' : 'OK'))}
      ${tag(390, 280, 'SUPPLY AIR TEMP', nv(a.supplyTemp) + ' °C', trip)}
      ${tag(380, 6, 'RETURN AIR TEMP', nv(a.returnTemp) + ' °C')}
    </svg>`;
  }

  /* ---------------- shared fragments ---------------- */
  const head = (title, sub, actions = '') => `<div class="page-head"><h1>${title}</h1>${actions}${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  const kpi = (icon, label, value, unit = '') => `<div class="card kpi">${icS(icon)}<div><small>${label}</small><strong>${value}${unit ? `<em>${unit}</em>` : ''}</strong></div></div>`;
  const openJobs = () => S.jobs.filter(j => j.status !== 'report' && divOf(j) === ui.biz);
  const activeAlarms = () => S.alarms.filter(a => a.status === 'Active');

  function jobsTable(list, compact) {
    if (!list.length) return `<div class="empty">No jobs here.</div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Job</th><th>Building</th>${compact ? '' : '<th class="hide-sm">Equipment</th>'}<th>Urgency</th><th>Status</th><th class="hide-sm">Technician</th><th>Logged</th></tr></thead><tbody>
      ${list.map(j => `<tr class="click" data-href="#/service/job/${j.id}"><td><strong>${j.id}</strong></td><td>${esc(bld(j.building).name)}<br><small>${esc(j.location)}</small></td>${compact ? '' : `<td class="hide-sm">${esc(j.equipment)}</td>`}<td>${urgPill(j.urgency)}</td><td>${jobStatusPill(j)}</td><td class="hide-sm">${techName(j) ? esc(techName(j)) : '<small>Unassigned</small>'}</td><td class="mono">${hhmm(j.steps.logged)}</td></tr>`).join('')}
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
    const myAlarms = activeAlarms();
    return head('Dashboard', `${esc(S.me.name)} · one platform · service desk · technicians · plant`,
      `${canSim() ? `<button class="btn danger sm" data-action="fault">${ic('alert')}Simulate BMS fault</button>` : ''}<a class="btn primary sm" href="#/service/callout">${ic('plus')}Log a call</a>`) +
      `<div class="grid split">
        <div class="grid">
          <div class="card flush"><div class="scene">${heroScene()}</div></div>
          <div class="grid g3">
            <div class="card feature">${icS('clock')}<div><strong>Less downtime</strong><p>Faults caught early, before occupants notice</p></div></div>
            <div class="card feature">${icS('bolt')}<div><strong>Faster response</strong><p>Alerts and calls reach Bothelec instantly</p></div></div>
            <div class="card feature">${icS('eye')}<div><strong>Complete transparency</strong><p>Every step, every reading, every record</p></div></div>
          </div>
        </div>
        <div class="grid" style="align-content:start">
          <div class="grid g2">
            ${kpi('wrench', 'Open jobs', openJobs().length)}
            ${kpi('alert', 'Active alarms', myAlarms.length)}
            ${isField() ? kpi('users', 'Technicians free', avail, '/' + S.technicians.length) : kpi('building', 'Buildings', S.buildings.length)}
            ${kpi('thermo', 'Zones in band', zs.length ? inBand : '—', zs.length ? '/' + zs.length : '')}
          </div>
          <div class="card"><header><h2>Recent activity</h2><a href="#/service/notifications" class="muted">All</a></header>${feedList(6)}</div>
        </div>
      </div>
      <div class="card" style="margin-top:14px"><header><h2>Live jobs</h2><a href="#/service/live" class="muted">View all</a></header>${jobsTable(openJobs().slice(0, 6), true)}</div>`;
  }

  /* ---------------- views: service ---------------- */
  function viewLive() {
    const list = ui.jobFilter === 'open' ? openJobs() : ui.jobFilter === 'done' ? bizJobs().filter(j => j.status === 'report') : bizJobs();
    const crit = openJobs().filter(j => j.urgency === 'Critical' || j.urgency === 'High').length;
    const done = bizJobs().filter(j => j.status === 'report' && Date.now() - new Date(j.steps.report) < 864e5).length;
    return head('Live Jobs', 'Client portfolio · live view', `<a class="btn primary sm" href="#/service/callout">${ic('plus')}New call-out</a>`) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('wrench', 'Open jobs', openJobs().length)}${kpi('alert', 'High / critical', crit)}${kpi('route', 'On the way', S.jobs.filter(j => j.status === 'enroute').length)}${kpi('check', 'Closed (24 h)', done)}</div>
      <div class="card"><header><h2>Jobs</h2><div class="seg">${[['open', 'Open'], ['all', 'All'], ['done', 'Completed']].map(([k, l]) => `<button data-action="jobfilter" data-v="${k}" class="${ui.jobFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div></header>${jobsTable(list)}</div>`;
  }
  function viewCallout() {
    const pf = ui.prefill; ui.prefill = null;
    const bb = bizBuildings();
    const b = (pf && bld(pf.building).id ? bld(pf.building) : null) || bb.find(x => x.id === ui.site) || bb[0] || { equipment: [], locations: [] };
    const eqList = x => (isUtil() ? x.meterEquipment || ['Other / not sure'] : x.equipment || []);
    ui.pendingPhotos = [];
    if (!bizBuildings().length) return head('New call-out') + `<div class="card empty">No buildings use ${isUtil() ? 'utility management' : 'aircon services'} yet.</div>`;
    return head('New call-out', 'Client app → Bothelec service desk') +
      `<div class="grid split">
        <form class="card form" data-form="callout">
          <header><h2>New call-out</h2><span class="pill">DRAFT</span></header>
          <div class="field"><label for="f-b">Building</label><select id="f-b" name="building" data-change="building">${bb.map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="f-e">Equipment</label><select id="f-e" name="equipment">${eqList(b).map(e => `<option ${pf && pf.equipment === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
          <div class="field"><label for="f-l">Location</label><select id="f-l" name="location">${(b.locations || []).map(e => `<option>${esc(e)}</option>`).join('')}</select></div>
          <div class="field"><label for="f-f">Fault</label><textarea id="f-f" name="fault" required placeholder="e.g. Office not cooling, warm air"></textarea></div>
          <div class="field"><label>Urgency</label><div class="radio-row">${['Low', 'Medium', 'High', 'Critical'].map(u => `<label><input type="radio" name="urgency" value="${u}" ${u === 'Medium' ? 'checked' : ''}><span>${u}</span></label>`).join('')}</div></div>
          <div class="field"><label>Photo</label><div class="thumbs" id="thumbs"></div><label class="btn sm" style="width:max-content">${ic('camera')}Add photo<input type="file" accept="image/*" capture="environment" multiple hidden data-photos="pending"></label></div>
          <div class="field"><label for="f-c">Contact name</label><input id="f-c" name="contact" value="${esc(S.me.name)}"></div>
          <div class="grid g2"><div class="field"><label for="f-cp">Contact mobile</label><input id="f-cp" name="contactPhone" type="tel" value="${esc(S.me.phone || '')}"></div><div class="field"><label for="f-ce">Contact email (gets updates)</label><input id="f-ce" name="contactEmail" type="email" value="${esc(S.me.email || '')}"></div></div>
          <button class="btn primary" type="submit">${ic('phone')}Log call</button>
        </form>
        <div class="grid" style="align-content:start">
          <div class="card"><header><h2>Routing</h2></header>
            <div class="rows">
              <div class="row">${icS('bolt')}<div class="grow"><strong>Lands instantly at the Bothelec service desk</strong><small>No phone queues — the call is on the live board the moment you submit.</small></div></div>
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
      `<div class="grid g3">${bizJobs().map(j => {
        const i = stepIdx(j.status);
        return `<a class="card" href="#/service/job/${j.id}" style="color:inherit;display:block"><header><h3>${j.id}</h3>${urgPill(j.urgency)}</header>
          <div><strong>${esc(bld(j.building).name)}</strong><br><small>${esc(j.equipment)} · ${esc(j.location)}</small></div>
          <p style="margin:8px 0;font-size:13px">${esc(j.fault)}</p>
          <div class="bar"><i style="width:${(i + 1) / STEPS.length * 100}%;${i >= 5 ? 'background:var(--accent)' : ''}"></i></div>
          <div style="display:flex;justify-content:space-between;margin-top:8px">${jobStatusPill(j)}<small>${techName(j) ? esc(techName(j)) : 'Unassigned'}</small></div></a>`;
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
      const detail = { logged: `${j.id} received by Bothelec · ${j.source}`, assigned: t ? `${t.name} allocated` : 'Waiting for routing', enroute: 'ETA ' + ((S.admin && S.admin.settings.etaMinutes) || 25) + ' minutes', onsite: 'Technician checked in', completed: j.work || 'Work recorded on job card', report: 'Signed job card available' }[s.key];
      return { label: s.label, detail, at: j.steps[s.key], icon: s.icon, cls: done ? 'done' : k === i + 1 ? '' : 'pending' };
    });
    const log = j.notifications.filter(n => n.channel !== 'Live board').slice().reverse();
    const canEdit = i >= 3 && i < 5 && isField();
    const onSiteMin = j.steps.onsite && j.steps.completed ? mins(j.steps.onsite, j.steps.completed) : null;
    const actions = `<a class="btn sm" href="#/service/live">${ic('back')}Back</a>` +
      (next && next.key !== 'report' && isField() && (next.key !== 'assigned' || isStaff()) ? `<button class="btn primary sm" data-action="advance" data-id="${j.id}">${ic('check')}${NEXT_LABEL[next.key]}</button>` : '') +
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
              ${j.status === 'completed' && isField() ? `<div class="field"><label>Customer signature</label><canvas class="sig" id="sig"></canvas>
                <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="signedBy" placeholder="Signed by (name)" value="${esc((contactsOf(b, 'Building Manager')[0] || {}).name || '')}" style="flex:1;min-width:160px;padding:9px 12px;background:var(--bg2);border:1px solid var(--line2);border-radius:8px;font-size:16px"><button class="btn sm" type="button" data-action="sigclear">Clear</button></div></div>
                <button class="btn primary" data-action="sign" data-id="${j.id}">${ic('check')}Complete &amp; share report</button>` : ''}
              ${j.signature ? `<div class="field"><label>Customer signature · ${esc(j.signedBy)}</label><img class="sig-img" src="${j.signature}" alt="Signature"></div>` : ''}
            </div></div>` : ''}
          ${divOf(j) === 'utility' ? jobReadingsCard(j, i) : ''}
          ${i >= 3 || isStaff() || ((j.billing || {}).lines || []).length ? billingCard(j, 'job') : ''}
        </div>
        <div class="grid" style="align-content:start">
          <div class="card"><header><h2>Job ${j.id}</h2><small>${esc(j.equipment.split(' · ')[0])}</small></header>
            <dl class="kv"><dt>Client</dt><dd>${esc(b.client)}</dd><dt>Fault</dt><dd>${esc(j.fault)}</dd><dt>Source</dt><dd>${esc(j.source)}</dd>
            <dt>Technician</dt><dd>${esc(techName(j) || '—')}</dd><dt>Arrived</dt><dd>${hhmm(j.steps.onsite)}</dd><dt>Completed</dt><dd>${hhmm(j.steps.completed)}</dd>
            <dt>Time on site</dt><dd>${dur(onSiteMin)}</dd><dt>Photos</dt><dd>${j.photos.length ? j.photos.length + ' attached' : '—'}</dd>
            <dt>Signature</dt><dd>${j.signature || j.status === 'report' ? '<span style="color:var(--accent)">Captured ✓</span>' : '<span style="color:var(--amber)">Pending</span>'}</dd></dl>
            ${isStaff() && ['logged', 'assigned', 'enroute'].includes(j.status) ? `<div class="field" style="margin-top:12px"><label for="reassignTech">${j.tech ? 'Reassign to' : 'Assign to'}</label><div style="display:flex;gap:8px"><select id="reassignTech" style="flex:1">${S.technicians.filter(x => x.status === 'available').map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('') || '<option value="">No technician available</option>'}</select><button class="btn sm" data-action="reassign" data-id="${j.id}">${j.tech ? 'Reassign' : 'Assign'}</button></div></div>` : ''}
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${t && t.phone ? `<a class="btn sm" href="tel:${t.phone.replace(/\s/g, '')}">${ic('phone')}Call technician</a>` : ''}${(contactsOf(b, 'Building Manager')[0] || {}).phone ? `<a class="btn sm" href="tel:${contactsOf(b, 'Building Manager')[0].phone.replace(/\s/g, '')}">${ic('phone')}Building manager</a>` : ''}${j.unit ? `<a class="btn sm" href="#/service/unit/${j.building}/${encodeURIComponent(j.unit)}">${ic('fcu')}Unit history</a>` : ''}</div>
          </div>
          <div class="card"><header><h2>Delivery log</h2><small>${log.filter(n => n.status === 'sent').length} sent · SMS & email</small></header>
            ${log.length ? `<div class="table-wrap"><table><thead><tr><th>Step</th><th>Recipient</th><th>Status</th></tr></thead><tbody>
            ${log.slice(0, 14).map(n => `<tr><td><small>${esc(stepLabel(n.step))}</small></td><td>${esc(n.role)} · ${esc(n.channel)}<br><small>${esc(n.to || '')}</small></td><td>${n.status === 'failed' ? `<span class="pill bad" title="${esc(n.error || '')}">Failed</span>` : n.status === 'queued' ? '<span class="pill warn">Sending</span>' : `<span class="pill ok">${hhmm(n.at)}</span>`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No SMS or email sent yet.</div>'}</div>
          ${j.status === 'report' ? `<div class="card"><header><h2>Report distribution</h2></header>${timeline([
            { label: 'Report generated', detail: `Email with ${j.photos.length} photo(s) & signature`, at: j.steps.report, icon: 'doc' },
            ...log.filter(n => n.step === 'report').map(n => ({ label: n.role, detail: `${n.channel} · ${n.to || ''} · ${n.status}`, at: n.at, icon: n.status === 'failed' ? 'x' : 'check', cls: n.status === 'failed' ? 'bad' : 'done' }))])}</div>` : ''}
        </div>
      </div>`;
  }
  function viewReport(id) {
    const j = byId(S.jobs, id);
    if (!j) return head('Report not found');
    const b = bld(j.building), t = j.tech && tech(j.tech);
    return `<div class="page-head noprint"><a class="btn sm" href="#/service/job/${j.id}">${ic('back')}Back to job</a><button class="btn primary sm" data-action="print">${ic('print')}Print / save PDF</button></div>
      <article class="card report">
        <header style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><img src="icon.svg" width="44" height="44" alt=""><div><h1>Service report · ${j.id}</h1><small>Bothelec Aircon Solutions · ${dmy(j.steps.report || nowIso())}</small></div></header>
        <div class="grid g2">
          <dl class="kv"><dt>Client</dt><dd>${esc(b.client)}</dd><dt>Building</dt><dd>${esc(b.name)}</dd><dt>Location</dt><dd>${esc(j.location)}</dd><dt>Equipment</dt><dd>${esc(j.equipment)}</dd></dl>
          <dl class="kv"><dt>Technician</dt><dd>${t ? esc(t.name) : '—'}</dd><dt>Logged</dt><dd>${hhmm(j.steps.logged)}</dd><dt>Arrived</dt><dd>${hhmm(j.steps.onsite)}</dd><dt>Completed</dt><dd>${hhmm(j.steps.completed)}</dd></dl>
        </div>
        <h2 style="margin:18px 0 6px">Reported fault</h2><p>${esc(j.fault)}</p>
        <h2 style="margin:18px 0 6px">Findings</h2><p>${esc(j.findings) || '—'}</p>
        <h2 style="margin:18px 0 6px">Work completed</h2><p>${esc(j.work) || '—'}</p>
        ${j.photos.length ? `<h2 style="margin:18px 0 6px">Photographs</h2><div class="thumbs">${j.photos.map(p => `<img src="${p}" alt="" style="width:140px;height:140px">`).join('')}</div>` : ''}
        ${((j.billing || {}).lines || []).length ? `<h2 style="margin:18px 0 6px">Parts & labour</h2>${linesTable(j.billing.lines)}` : ''}
        <h2 style="margin:18px 0 6px">Customer sign-off</h2>${j.signature ? `<img class="sig-img" src="${j.signature}" alt="Signature"><p><small>Signed by ${esc(j.signedBy)} · ${hhmm(j.steps.report)}</small></p>` : '<p class="muted">Signed on paper / legacy record.</p>'}
        <h2 style="margin:18px 0 6px">Timeline</h2>${timeline(STEPS.filter(s => j.steps[s.key]).map(s => ({ label: s.label, at: j.steps[s.key], icon: s.icon })))}
      </article>`;
  }
  function viewNotifs() {
    ui.unread = 0; updateBell();
    return head('Notifications', 'From the moment a call is logged, everyone stays informed') +
      `<div class="grid split"><div class="card"><header><h2>Activity feed</h2><small>${S.feed.length} events</small></header>${feedList(60)}</div>
      <div class="card" style="align-self:start"><header><h2>Who gets notified</h2></header><div class="table-wrap"><table><thead><tr><th>Recipient</th><th>Channel</th></tr></thead><tbody>${[['Building Manager', 'SMS + email'], ['Operations Manager', 'SMS + email'], ['Bothelec service desk', 'Live board + SMS + email'], ['Technician', 'SMS + app'], ['Caller', 'Email']].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted" style="font-size:12px">Which step goes to whom, by SMS or email, is set by the admin under Settings → SMS & email.</p></div></div>`;
  }
  function viewReports() {
    const done = bizJobs().filter(j => j.status === 'report').sort((a, b) => String(b.steps.report).localeCompare(String(a.steps.report)));
    return head('Signed job reports', `${done.length} signed service report${done.length === 1 ? '' : 's'}`, `<a class="btn sm" href="#/reports/overview">${ic('chart')}Performance reports</a>`) +
      `<div class="card"><div class="table-wrap"><table><thead><tr><th>Report</th><th>Building</th><th class="hide-sm">Equipment</th><th>Technician</th><th>Date</th></tr></thead><tbody>
      ${done.map(j => `<tr class="click" data-href="#/service/report/${j.id}"><td><strong>${j.id}</strong></td><td>${esc(bld(j.building).name)}</td><td class="hide-sm">${esc(j.equipment)}</td><td>${esc(techName(j) || '—')}</td><td>${dmy(j.steps.report)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No signed reports yet.</td></tr>'}
      </tbody></table></div></div>`;
  }
  /* ---------------- reports ----------------
   * Three levels, the same for both companies:
   *   1. Scorecard: a handful of headline figures for the period, each against the previous period, plus 6-month trends
   *      and a short "needs attention" list.
   *   2. Focused reports: one question each (service levels, technicians, buildings, equipment, billing / consumption,
   *      losses, recoveries, meter data quality).
   *   3. Detail tables under each report, with CSV export and print / PDF.
   * Every report uses the same period and building filters. */
  const REPORT_AIRCON = [['reports/overview', 'Scorecard', 'grid'], ['reports/service', 'Service levels', 'clock'], ['reports/techs', 'Technicians', 'users', 'staff'], ['reports/buildings', 'Clients & buildings', 'building'], ['reports/equipment', 'Equipment & maintenance', 'fcu'], ['reports/finance', 'Billing & revenue', 'doc', 'staff'], ['service/reports', 'Signed job reports', 'card']];
  const REPORT_UTILITY = [['reports/overview', 'Scorecard', 'grid'], ['reports/consumption', 'Consumption', 'bolt'], ['reports/losses', 'Losses & balance', 'trend'], ['reports/recoveries', 'Tenant recoveries', 'doc'], ['reports/quality', 'Meter data quality', 'alert']];
  const RP_PERIODS = [['month', 'This month'], ['last', 'Last month'], ['3m', 'Last 3 months'], ['6m', 'Last 6 months'], ['ytd', 'Year to date'], ['12m', 'Last 12 months'], ['custom', 'Choose months']];
  const addM = (m, k) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + k, 1)).toISOString().slice(0, 7); };
  const monthsBetween = (a, b) => { const out = []; for (let m = a; m <= b && out.length < 36; m = addM(m, 1)) out.push(m); return out; };
  const mShort = m => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const mLong = m => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const pctOf = (n, d) => (d ? Math.round(n / d * 1000) / 10 : null);
  const fmtPct = v => (v == null ? '—' : fmtN(v, 1) + '%');
  const fmtDur = m => (m == null ? '—' : m >= 2880 ? fmtN(m / 1440, 1) + ' days' : dur(Math.round(m)));
  function rpRange() {
    const r = ui.rp || (ui.rp = { period: 'last', building: '' });
    const cur = today().slice(0, 7);
    let a, b;
    switch (r.period) {
      case 'month': a = b = cur; break;
      case 'last': a = b = addM(cur, -1); break;
      case '3m': a = addM(cur, -2); b = cur; break;
      case '6m': a = addM(cur, -5); b = cur; break;
      case 'ytd': a = cur.slice(0, 4) + '-01'; b = cur; break;
      case '12m': a = addM(cur, -11); b = cur; break;
      default: a = r.from || addM(cur, -2); b = r.to || cur; if (a > b) [a, b] = [b, a]; if (b > cur) b = cur; if (monthsBetween(a, b).length > 12) a = addM(b, -11);
    }
    const months = monthsBetween(a, b), n = months.length, pa = addM(a, -n);
    return { a, b, months, from: a + '-01T00:00:00.000Z', to: addM(b, 1) + '-01T00:00:00.000Z', label: n === 1 ? mLong(a) : `${mShort(a)} – ${mShort(b)}`,
      prev: { a: pa, b: addM(a, -1), from: pa + '-01T00:00:00.000Z', to: a + '-01T00:00:00.000Z', label: n === 1 ? mLong(pa) : `${mShort(pa)} – ${mShort(addM(a, -1))}` },
      trend: monthsBetween(addM(b, -5), b) };
  }
  const mRange = m => ({ from: m + '-01T00:00:00.000Z', to: addM(m, 1) + '-01T00:00:00.000Z' });
  const inP = (ts, p) => !!ts && ts >= p.from && ts < p.to;
  const rpBld = () => (ui.rp && ui.rp.building && bizBuildings().some(b => b.id === ui.rp.building) ? ui.rp.building : '');
  function rpHead(title, what) {
    const R = rpRange(), bid = rpBld();
    return head(title, `${what} · <strong>${esc(R.label)}</strong>${bid ? ' · ' + esc(bld(bid).name) : bizBuildings().length > 1 ? ' · all buildings' : ''} <span class="print-only">· Bothelec ${BIZ[ui.biz]} · printed ${dmy(new Date().toISOString())}</span>`);
  }
  function rpBar(o = {}) {
    const r = ui.rp, R = rpRange(), cur = today().slice(0, 7);
    return `<div class="rp-bar noprint">
      <select class="hsel" data-change="rpperiod" aria-label="Period">${RP_PERIODS.map(([k, l]) => `<option value="${k}" ${k === r.period ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${r.period === 'custom' ? `<input type="month" class="hsel" data-change="rpfrom" value="${R.a}" max="${cur}" aria-label="From month"><span class="muted">to</span><input type="month" class="hsel" data-change="rpto" value="${R.b}" max="${cur}" aria-label="To month">` : ''}
      ${bizBuildings().length > 1 && !o.noBuilding ? `<select class="hsel" data-change="rpbld" aria-label="Building"><option value="">All buildings</option>${bizBuildings().map(b => `<option value="${b.id}" ${b.id === rpBld() ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}
      <span class="grow"></span>
      ${o.csv ? `<button class="btn sm" data-action="rpcsv">${ic('doc')}Export CSV</button>` : ''}<button class="btn sm" data-action="rpprint">${ic('print')}Print / PDF</button></div>`;
  }
  /* A headline figure with its change against the previous period. good: 'up' | 'down' | null (neutral). */
  function rpTile(label, value, now, before, good, o = {}) {
    let d = '', vs = false;
    const has = v => v != null && isFinite(v);
    if (has(now) && has(before) && (o.pts || before !== 0)) {
      const diff = now - before, rel = o.pts ? diff : diff / Math.abs(before) * 100;
      vs = true;
      if (Math.abs(rel) < 0.05) d = '<span class="rp-delta">no change</span>';
      else { const better = good == null ? null : (good === 'up') === (diff > 0); d = `<span class="rp-delta ${better == null ? '' : better ? 'good' : 'bad'}">${diff > 0 ? '▲' : '▼'} ${fmtN(Math.abs(rel), 1)}${o.pts ? ' pts' : '%'}</span>`; }
    } else if (has(now) && !o.note && good !== undefined && !o.noCmp) d = '<span class="rp-delta">no earlier data</span>';
    return `<div class="card rp-tile${o.warn ? ' warn' : ''}"><small>${label}</small><strong>${value}</strong><div class="rp-sub">${d}${o.note ? `<span>${o.note}</span>` : vs ? '<span>vs previous period</span>' : ''}</div></div>`;
  }
  const compact = v => (Math.abs(v) >= 1e6 ? fmtN(v / 1e6, 1) + 'M' : Math.abs(v) >= 1e4 ? fmtN(v / 1e3, 0) + 'k' : Math.abs(v) >= 1e3 ? fmtN(v / 1e3, 1) + 'k' : fmtN(v, 1));
  /* Grouped bars per month, with an optional percentage line on the right-hand axis. */
  function barChart({ labels, series, line, h = 190, unit = '' }) {
    const W = 600, L = 42, Rr = line ? 34 : 10, T = 12, B = 22;
    const vals = series.flatMap(s => s.data).filter(v => v != null && isFinite(v));
    if (!vals.length && !(line && line.data.some(v => v != null))) return '<div class="empty">No data for this period</div>';
    const raw = Math.max(1, ...vals) * 1.05, p10 = Math.pow(10, Math.floor(Math.log10(raw / 4))), f = raw / 4 / p10, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p10, max = Math.max(4, step * 4), n = labels.length, gw = (W - L - Rr) / n, bw = Math.min(26, (gw - 10) / series.length);
    const Y = v => T + (h - T - B) * (1 - v / max), Yp = v => T + (h - T - B) * (1 - v / 100);
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = max * k / 4; g += `<line x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="#1c3a41" stroke-width=".6"/><text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${compact(v)}</text>`; if (line) g += `<text x="${W - Rr + 4}" y="${Yp(k * 25) + 3}">${k * 25}%</text>`; }
    labels.forEach((lb, i) => {
      const x0 = L + gw * i + (gw - bw * series.length) / 2;
      series.forEach((s, j) => { const v = s.data[i]; if (v == null || !isFinite(v)) return; g += `<rect x="${(x0 + j * bw).toFixed(1)}" y="${Y(Math.max(0, v)).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(Y(0) - Y(Math.max(0, v))).toFixed(1)}" rx="2" fill="${s.color}"><title>${esc(s.label)} · ${esc(lb)}: ${fmtN(v, 1)}${unit}</title></rect>`; });
      g += `<text x="${L + gw * i + gw / 2}" y="${h - 6}" text-anchor="middle">${esc(lb)}</text>`;
    });
    if (line) {
      const pts = line.data.map((v, i) => (v == null ? null : [L + gw * i + gw / 2, Yp(Math.max(0, Math.min(100, v)))]));
      const segs = pts.filter(Boolean).map(p => p.map(x => x.toFixed(1)).join(',')).join(' ');
      g += `<polyline points="${segs}" fill="none" stroke="${line.color}" stroke-width="2" stroke-dasharray="${line.dash ? '4 3' : ''}"/>`;
      pts.forEach((p, i) => { if (p) g += `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${line.color}"><title>${esc(line.label)} · ${esc(labels[i])}: ${fmtN(line.data[i], 1)}%</title></circle>`; });
    }
    const legend = [...series.map(s => [s.label, s.color, false]), ...(line ? [[line.label + ' (right axis)', line.color, true]] : [])];
    return `<div class="rp-legend">${legend.map(([l, c, ln]) => `<span><i style="background:${c};${ln ? 'height:3px' : ''}"></i>${esc(l)}</span>`).join('')}</div><svg class="chart" viewBox="0 0 ${W} ${h}" style="height:auto" role="img" aria-label="${esc(series.map(s => s.label).join(', '))} by month">${g}</svg>`;
  }
  function rpTable(id, headRow, rows, csv, o = {}) {
    if (csv) ui.rpCsv = { name: csv, head: headRow.map(h => (Array.isArray(h) ? h[0] : h)), rows: rows.map(r => r.map(c => (c && typeof c === 'object' ? c.csv : c))) };
    const cell = c => (c && typeof c === 'object' ? c.html : esc(c == null ? '—' : c));
    const num = headRow.map(h => Array.isArray(h) && h[1] === 'n');
    return `<div class="table-wrap"><table id="${id}" class="rp-table"><thead><tr>${headRow.map((h, i) => `<th${num[i] ? ' class="n"' : ''}>${esc(Array.isArray(h) ? h[0] : h)}</th>`).join('')}</tr></thead><tbody>
      ${rows.length ? rows.map(r => `<tr${o.href ? ` class="click" data-href="${o.href(r)}"` : ''}>${r.map((c, i) => `<td${num[i] ? ' class="n mono"' : ''}>${cell(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headRow.length}" class="empty">${o.empty || 'Nothing for this period.'}</td></tr>`}
      ${o.foot ? `<tr class="rp-foot">${o.foot.map((c, i) => `<td${num[i] ? ' class="n mono"' : ''}>${cell(c)}</td>`).join('')}</tr>` : ''}</tbody></table></div>`;
  }
  const H = (html, csv) => ({ html, csv });
  const okMark = v => (v == null ? H('—', '') : v ? H('<span style="color:var(--accent)">✓</span>', 'Yes') : H('<span style="color:var(--red)">✗</span>', 'No'));
  function downloadCsv(name, head, rows) {
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const blob = new Blob(['﻿' + [head.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}-${today()}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- Aircon: service maths ---------- */
  const SLA_DEFAULT = { Critical: { respond: 2, fix: 8 }, High: { respond: 4, fix: 24 }, Medium: { respond: 24, fix: 72 }, Low: { respond: 72, fix: 168 } };
  const URGS = ['Critical', 'High', 'Medium', 'Low'];
  const slaOf = j => (S.sla || SLA_DEFAULT)[j.urgency] || (S.sla || SLA_DEFAULT).Medium;
  const rpJobs = () => bizJobs().filter(j => !rpBld() || j.building === rpBld());
  const jobRev = j => (j.billing && j.billing.lines && j.billing.lines.length ? calcTotals(j.billing.lines).subtotal : 0);
  const respM = j => (j.steps.onsite ? mins(j.steps.logged, j.steps.onsite) : null);
  const fixM = j => (j.steps.completed ? mins(j.steps.logged, j.steps.completed) : null);
  const respOk = j => (j.steps.onsite ? respM(j) <= slaOf(j).respond * 60 : null);
  const fixOk = j => (j.steps.completed ? fixM(j) <= slaOf(j).fix * 60 : null);
  const realUnit = j => { const k = unitKey(j); return k && !/^Other/i.test(k) ? k : ''; };
  /* First-time fix: no further call on the same unit within 30 days of the work being completed. */
  function repeatOf(j) {
    if (!j.steps.completed || !realUnit(j)) return null;
    const t0 = Date.parse(j.steps.completed);
    return S.jobs.find(x => x !== j && x.building === j.building && realUnit(x) === realUnit(j) && Date.parse(x.steps.logged) > t0 && Date.parse(x.steps.logged) - t0 <= 30 * 864e5) || null;
  }
  function svcStats(jobs, p) {
    const done = jobs.filter(j => inP(j.steps.completed, p));
    const withResp = done.filter(j => j.steps.onsite);
    const reps = done.filter(repeatOf);
    const rev = done.reduce((a, j) => a + jobRev(j), 0);
    return { logged: jobs.filter(j => inP(j.steps.logged, p)).length, done: done.length, list: done, repeats: reps,
      avgResp: avgOf(withResp.map(respM)), avgFix: avgOf(done.map(fixM)), avgSite: avgOf(done.filter(j => j.steps.onsite).map(j => mins(j.steps.onsite, j.steps.completed))),
      respPct: pctOf(withResp.filter(respOk).length, withResp.length), fixPct: pctOf(done.filter(fixOk).length, done.length), ftf: pctOf(done.length - reps.length, done.length), rev };
  }
  const openNow = jobs => jobs.filter(j => !['completed', 'report'].includes(j.status));
  const ageM = j => mins(j.steps.logged, new Date().toISOString());

  function viewReportsHome() { return isUtil() ? viewUtilScorecard() : viewSvcScorecard(); }
  function viewSvcScorecard() {
    const R = rpRange(), jobs = rpJobs(), c = svcStats(jobs, R), p = svcStats(jobs, R.prev);
    const open = openNow(jobs), late = open.filter(j => (j.steps.onsite ? fixOk({ ...j, steps: { ...j.steps, completed: new Date().toISOString() } }) === false : ageM(j) > slaOf(j).respond * 60));
    const tr = R.trend.map(m => svcStats(jobs, mRange(m)));
    const units = bizBuildings().filter(b => !rpBld() || b.id === rpBld()).flatMap(b => (b.units || []).filter(u => !u.removed && u.intervalMonths).map(u => ({ b, u, due: nextDue(u, lastServiced(b.id, u.id)), last: lastServiced(b.id, u.id) })));
    const overdue = units.filter(x => !x.last || (x.due && x.due < today()));
    const ppm = pctOf(units.length - overdue.length, units.length);
    const breaches = c.list.filter(j => respOk(j) === false || fixOk(j) === false);
    return rpHead('Reports', 'Service scorecard') + rpBar() +
      `<div class="rp-tiles">
        ${rpTile('Calls logged', c.logged, c.logged, p.logged, null)}
        ${rpTile('Calls completed', c.done, c.done, p.done, 'up')}
        ${rpTile('Arrived within SLA', fmtPct(c.respPct), c.respPct, p.respPct, 'up', { pts: true, warn: c.respPct != null && c.respPct < 90 })}
        ${rpTile('Fixed within SLA', fmtPct(c.fixPct), c.fixPct, p.fixPct, 'up', { pts: true, warn: c.fixPct != null && c.fixPct < 90 })}
        ${rpTile('First-time fix', fmtPct(c.ftf), c.ftf, p.ftf, 'up', { pts: true, warn: c.ftf != null && c.ftf < 80 })}
        ${rpTile('Avg. time to arrive', fmtDur(c.avgResp), c.avgResp, p.avgResp, 'down')}
        ${rpTile('Avg. time to fix', fmtDur(c.avgFix), c.avgFix, p.avgFix, 'down', { note: 'call logged → work done' })}
        ${rpTile(role() === 'client' ? 'Billed (excl. VAT)' : 'Revenue (excl. VAT)', fmtMoney(c.rev), c.rev, p.rev, role() === 'client' ? null : 'up')}
      </div>
      <div class="grid g2">
        <div class="card"><header><h2>Calls per month</h2><a class="btn sm noprint" href="#/reports/service">Service levels</a></header>
          ${barChart({ labels: R.trend.map(mShort), series: [{ label: 'Logged', color: '#3fd2e3', data: tr.map(t => t.logged) }, { label: 'Completed', color: '#b6d433', data: tr.map(t => t.done) }], line: { label: 'Fixed within SLA', color: '#f5b93b', data: tr.map(t => t.fixPct) } })}</div>
        <div class="card"><header><h2>Needs attention</h2></header><div class="rows">
          ${rpAttn('alert', `${open.length} open call${open.length === 1 ? '' : 's'}`, late.length ? `${late.length} past the service level now` : 'none past the service level', '#/service/live', late.length ? 'bad' : 'ok')}
          ${rpAttn('clock', `${breaches.length} completed call${breaches.length === 1 ? '' : 's'} outside the SLA`, 'in this period', '#/reports/service', breaches.length ? 'warn' : 'ok')}
          ${rpAttn('reset', `${c.repeats.length} repeat call${c.repeats.length === 1 ? '' : 's'}`, 'same unit called out again within 30 days', '#/reports/equipment', c.repeats.length ? 'warn' : 'ok')}
          ${rpAttn('fcu', `${overdue.length} unit${overdue.length === 1 ? '' : 's'} overdue for maintenance`, `planned maintenance on time: ${fmtPct(ppm)}`, '#/reports/equipment', overdue.length ? 'warn' : 'ok')}
          ${isStaff() ? (() => { const rows = trackerRows().filter(r => !rpBld() || r.b.id === rpBld()); const ready = rows.filter(r => r.st === 'Ready to invoice' || r.st === 'Needs parts & labour'), od = rows.filter(r => r.st === 'Overdue'); return rpAttn('doc', `${ready.length} completed job${ready.length === 1 ? '' : 's'} not invoiced yet`, `${od.length} invoice${od.length === 1 ? '' : 's'} overdue · ${fmtMoney(od.reduce((a, r) => a + (r.incl || 0), 0))}`, '#/reports/finance', ready.length || od.length ? 'warn' : 'ok'); })() : ''}
        </div></div>
      </div>
      <p class="muted rp-note">Service levels use the targets on <a href="#/reports/service">Service levels</a>. First-time fix counts a job as fixed first time when the same unit had no further call within 30 days. Changes compare with ${esc(R.prev.label)}.</p>`;
  }
  const rpAttn = (icon, title, sub, href, lvl) => `<a class="row" href="${href}" style="color:inherit"><span class="rp-dot ${lvl}">${ic(icon)}</span><div class="grow"><strong>${title}</strong><br><small class="muted">${sub}</small></div></a>`;

  function viewSvcLevels() {
    const R = rpRange(), jobs = rpJobs(), c = svcStats(jobs, R), sla = S.sla || SLA_DEFAULT;
    const byU = URGS.map(u => { const l = c.list.filter(j => j.urgency === u), wr = l.filter(j => j.steps.onsite); return [u, l, wr]; });
    const open = openNow(jobs).sort((a, b) => ageM(b) - ageM(a));
    const buckets = [['Under 4 h', 0, 240], ['4–24 h', 240, 1440], ['1–3 days', 1440, 4320], ['3–7 days', 4320, 10080], ['Over 7 days', 10080, Infinity]].map(([l, a, b]) => [l, open.filter(j => ageM(j) >= a && ageM(j) < b).length]);
    const src = [...new Set(c.list.map(j => j.source || 'Other'))].map(s => [s, c.list.filter(j => (j.source || 'Other') === s).length]).sort((a, b) => b[1] - a[1]);
    const detail = c.list.slice().sort((a, b) => String(b.steps.completed).localeCompare(String(a.steps.completed))).map(j => [H(`<strong>${esc(j.id)}</strong>`, j.id), bld(j.building).name, j.equipment || '', j.urgency, H(fmtDur(respM(j)), respM(j) ?? ''), okMark(respOk(j)), H(fmtDur(fixM(j)), fixM(j)), okMark(fixOk(j)), H(repeatOf(j) ? `<span class="pill warn">${esc(repeatOf(j).id)}</span>` : '', repeatOf(j) ? repeatOf(j).id : ''), techName(j) || '—']);
    return rpHead(isUtil() ? 'Meter jobs' : 'Service levels', 'Response and fix times against the agreed targets') + rpBar({ csv: true }) +
      `<div class="card"><header><h2>By urgency</h2></header>${rpTable('rp-sla', ['Urgency', ['Target: arrive', 'n'], ['Target: fix', 'n'], ['Jobs', 'n'], ['Arrived in time', 'n'], ['Fixed in time', 'n'], ['Avg. arrive', 'n'], ['Avg. fix', 'n']],
        byU.map(([u, l, wr]) => [u, sla[u].respond + ' h', sla[u].fix + ' h', l.length, fmtPct(pctOf(wr.filter(respOk).length, wr.length)), fmtPct(pctOf(l.filter(fixOk).length, l.length)), fmtDur(avgOf(wr.map(respM))), fmtDur(avgOf(l.map(fixM)))]), null,
        { foot: [H('<strong>All</strong>', 'All'), '', '', c.done, fmtPct(c.respPct), fmtPct(c.fixPct), fmtDur(c.avgResp), fmtDur(c.avgFix)] })}
      ${role() === 'admin' ? `<details class="noprint" style="margin-top:10px"><summary>Change the service-level targets</summary><form class="form" data-form="rpsla" style="margin-top:10px"><div class="rp-slaform">${URGS.map(u => `<div><strong>${u}</strong><label>Arrive within (hours)<input type="number" name="${u}_respond" min="0.5" step="0.5" value="${sla[u].respond}"></label><label>Fixed within (hours)<input type="number" name="${u}_fix" min="0.5" step="0.5" value="${sla[u].fix}"></label></div>`).join('')}</div><div><button class="btn primary sm">Save targets</button></div></form></details>` : ''}</div>
      <div class="grid g2">
        <div class="card"><header><h2>Open calls by age</h2><span class="pill ${open.length ? 'warn' : 'ok'}"><i></i>${open.length} open now</span></header>
          ${barChart({ labels: buckets.map(b => b[0]), series: [{ label: 'Open calls', color: '#f5b93b', data: buckets.map(b => b[1]) }], h: 160 })}
          ${open.length ? `<div class="rows">${open.slice(0, 6).map(j => `<a class="row" href="#/service/job/${j.id}" style="color:inherit"><div class="grow"><strong>${esc(j.id)}</strong> · ${esc(bld(j.building).name)}<br><small class="muted">${esc(j.urgency)} · ${esc(j.fault || '')}</small></div><span class="pill ${ageM(j) > slaOf(j).fix * 60 ? 'bad' : ageM(j) > slaOf(j).respond * 60 && !j.steps.onsite ? 'warn' : 'info'}">${fmtDur(ageM(j))}</span></a>`).join('')}</div>` : ''}</div>
        <div class="card"><header><h2>How calls came in</h2></header>${rpTable('rp-src', ['Source', ['Completed jobs', 'n'], ['Share', 'n']], src.map(([s, n]) => [s, n, fmtPct(pctOf(n, c.done))]))}</div>
      </div>
      <div class="card"><header><h2>Completed jobs</h2><small class="muted">${c.done} in this period</small></header>${rpTable('rp-jobs', ['Job', 'Building', 'Equipment', 'Urgency', ['Arrived after', 'n'], 'In time', ['Fixed after', 'n'], 'In time', 'Repeat call', 'Technician'], detail, 'service-levels', { href: r => '#/service/job/' + r[0].csv })}</div>`;
  }
  function viewRpTechs() {
    const R = rpRange(), jobs = rpJobs();
    const rows = S.technicians.map(t => {
      const mine = jobs.filter(j => j.tech === t.id), c = svcStats(mine, R), p = svcStats(mine, R.prev);
      return [H(`<strong>${esc(t.name)}</strong><br><small class="muted">${esc(t.skill || '')}</small>`, t.name), c.done, H(`${c.done - p.done > 0 ? '+' : ''}${c.done - p.done}`, c.done - p.done), fmtDur(c.avgResp), fmtDur(c.avgSite), fmtPct(c.respPct), fmtPct(c.fixPct), fmtPct(c.ftf), c.repeats.length, openNow(mine).length, H(fmtMoney(c.rev), c.rev.toFixed(2))];
    }).sort((a, b) => b[1] - a[1]);
    const R6 = R.trend;
    return rpHead('Technicians', 'Workload, speed and quality per technician') + rpBar({ csv: true }) +
      `<div class="card">${rpTable('rp-techs', ['Technician', ['Jobs done', 'n'], ['vs prev.', 'n'], ['Avg. arrive', 'n'], ['Avg. on site', 'n'], ['Arrived in time', 'n'], ['Fixed in time', 'n'], ['First-time fix', 'n'], ['Repeat calls', 'n'], ['Open now', 'n'], ['Revenue excl. VAT', 'n']], rows, 'technicians')}</div>
      <div class="card"><header><h2>Jobs done per month</h2></header>${barChart({ labels: R6.map(mShort), series: S.technicians.slice(0, 6).map((t, i) => ({ label: t.name, color: ['#b6d433', '#3fd2e3', '#f5b93b', '#c58cff', '#ff8a8e', '#7fb0ff'][i], data: R6.map(m => jobs.filter(j => j.tech === t.id && inP(j.steps.completed, mRange(m))).length) })) })}</div>
      <p class="muted rp-note">"On site" is from arriving to work completed. Revenue is the parts & labour on the job cards, excluding VAT.</p>`;
  }
  function viewRpBuildings() {
    const R = rpRange(), all = bizJobs();
    const list = bizBuildings().filter(b => !rpBld() || b.id === rpBld());
    const rows = list.map(b => {
      const jobs = all.filter(j => j.building === b.id), c = svcStats(jobs, R);
      const units = (b.units || []).filter(u => !u.removed && u.intervalMonths), od = units.filter(u => { const l = lastServiced(b.id, u.id), d = nextDue(u, l); return !l || (d && d < today()); }).length;
      const top = Object.entries(c.list.reduce((a, j) => { const k = realUnit(j); if (k) a[k] = (a[k] || 0) + 1; return a; }, {})).sort((x, y) => y[1] - x[1])[0];
      return [H(`<strong>${esc(b.name)}</strong><br><small class="muted">${esc(b.client || '')}</small>`, b.name), b.client || '', c.logged, c.done, fmtPct(c.respPct), fmtPct(c.fixPct), fmtPct(c.ftf), c.repeats.length, openNow(jobs).length, od ? H(`<span class="pill warn">${od}</span>`, od) : 0, top ? `${top[0]} (${top[1]})` : '—', H(fmtMoney(c.rev), c.rev.toFixed(2))];
    });
    const faults = Object.entries(svcStats(rpJobs(), R).list.reduce((a, j) => { const k = (j.fault || '').replace(/\s*\(BMS alarm\)$/, ''); a[k] = (a[k] || 0) + 1; return a; }, {})).sort((x, y) => y[1] - x[1]).slice(0, 8);
    return rpHead('Clients & buildings', 'Service delivered per building') + rpBar({ csv: true }) +
      `<div class="card">${rpTable('rp-blds', ['Building', 'Client', ['Calls logged', 'n'], ['Completed', 'n'], ['Arrived in time', 'n'], ['Fixed in time', 'n'], ['First-time fix', 'n'], ['Repeat calls', 'n'], ['Open now', 'n'], ['Maintenance overdue', 'n'], 'Most calls', [role() === 'client' ? 'Billed excl. VAT' : 'Revenue excl. VAT', 'n']], rows, 'buildings', { href: r => '#/service/building/' + (list.find(b => b.name === r[0].csv) || {}).id })}</div>
      <div class="card"><header><h2>Most common faults</h2></header>${rpTable('rp-faults', ['Fault reported', ['Jobs', 'n']], faults)}</div>`;
  }
  function viewRpEquipment() {
    const R = rpRange(), list = bizBuildings().filter(b => !rpBld() || b.id === rpBld());
    const done = svcStats(rpJobs(), R).list;
    const units = list.flatMap(b => (b.units || []).filter(u => !u.removed).map(u => {
      const last = lastServiced(b.id, u.id), due = nextDue(u, last), calls = done.filter(j => j.building === b.id && realUnit(j) === u.id), reps = calls.filter(repeatOf);
      const st = !u.intervalMonths ? 'none' : !last ? 'never' : due < today() ? 'overdue' : (new Date(due) - new Date(today())) / 864e5 <= 30 ? 'soon' : 'ok';
      return { b, u, last, due, calls, reps, st };
    }));
    const sched = units.filter(x => x.st !== 'none'), onTime = sched.filter(x => x.st === 'ok' || x.st === 'soon').length;
    const planned = S.services.filter(s => list.some(b => b.id === s.building) && s.date >= R.a + '-01' && s.date < addM(R.b, 1) + '-01');
    const ST = { ok: ['ok', 'Up to date'], soon: ['warn', 'Due within 30 days'], overdue: ['bad', 'Overdue'], never: ['bad', 'No service recorded'], none: ['off', 'No schedule'] };
    const order = { overdue: 0, never: 1, soon: 2, ok: 3, none: 4 };
    const rows = units.sort((a, b) => order[a.st] - order[b.st] || b.calls.length - a.calls.length).map(x => [H(`<strong>${esc(x.u.id)}</strong><br><small class="muted">${esc(x.u.type)}</small>`, x.u.id), x.b.name, x.u.intervalMonths ? `${x.u.intervalMonths} mo` : '—', x.last ? H(dmy(x.last), x.last) : '—', x.due ? H(dmy(x.due), x.due) : '—', H(`<span class="pill ${ST[x.st][0]}">${ST[x.st][1]}</span>`, ST[x.st][1]), x.calls.length, x.reps.length ? H(`<span class="pill warn">${x.reps.length}</span>`, x.reps.length) : 0]);
    return rpHead('Equipment & maintenance', 'Planned maintenance on time, and the units that break down most') + rpBar({ csv: true }) +
      `<div class="rp-tiles">${rpTile('Planned maintenance on time', fmtPct(pctOf(onTime, sched.length)), null, null, null, { note: `${onTime} of ${sched.length} scheduled units`, warn: sched.length && onTime / sched.length < 0.9 })}
        ${rpTile('Overdue now', sched.filter(x => x.st === 'overdue' || x.st === 'never').length, null, null, null, { note: 'units past their service date' })}
        ${rpTile('Maintenance visits', planned.length, null, null, null, { note: 'service records in the period' })}
        ${rpTile('Breakdown calls', done.length, null, null, null, { note: `${units.filter(x => x.reps.length).length} unit(s) with repeat calls` })}</div>
      <div class="card"><header><h2>Units</h2><small class="muted">Overdue first, then most call-outs</small></header>${rpTable('rp-units', ['Unit', 'Building', ['Interval', 'n'], ['Last service', 'n'], ['Next due', 'n'], 'Status', ['Calls in period', 'n'], ['Repeat calls', 'n']], rows, 'equipment', { href: r => `#/service/unit/${(units.find(x => x.u.id === r[0].csv) || { b: {} }).b.id}/${encodeURIComponent(r[0].csv)}` })}</div>`;
  }
  function viewRpFinance() {
    const R = rpRange(), rows = trackerRows().filter(r => !r.t.void && (!rpBld() || r.b.id === rpBld()));
    const inv = r => r.inv && r.inv.date ? r.inv.date + 'T12:00:00.000Z' : null;
    const billed = rows.filter(r => inP(inv(r), R)), billedP = rows.filter(r => inP(inv(r), R.prev));
    const paid = rows.filter(r => r.t.paidDate && inP(r.t.paidDate + 'T12:00:00.000Z', R));
    const unpaid = rows.filter(r => r.inv && !r.t.paidDate);
    const sum = l => l.reduce((a, r) => a + (r.incl || 0), 0);
    const ready = rows.filter(r => ['Ready to invoice', 'Needs parts & labour', 'Approved', 'PO pending'].includes(r.st));
    const ageD = r => Math.floor((new Date(today()) - new Date(r.inv.date)) / 864e5);
    const aged = [['0–30 days', 0, 31], ['31–60 days', 31, 61], ['61–90 days', 61, 91], ['Over 90 days', 91, 1e9]].map(([l, a, b]) => [l, unpaid.filter(r => ageD(r) >= a && ageD(r) < b)]);
    const kinds = {}; svcStats(rpJobs(), R).list.forEach(j => ((j.billing || {}).lines || []).forEach(l => { kinds[l.kind] = (kinds[l.kind] || 0) + l.qty * l.unitPrice; }));
    const kTot = Object.values(kinds).reduce((a, b) => a + b, 0);
    const trend = R.trend.map(m => sum(rows.filter(r => inP(inv(r), mRange(m)))));
    const clients = [...new Set(rows.map(r => r.b.id))].map(id => { const l = rows.filter(r => r.b.id === id); return [bld(id).name, H(fmtMoney(sum(l.filter(r => inP(inv(r), R)))), sum(l.filter(r => inP(inv(r), R))).toFixed(2)), H(fmtMoney(sum(l.filter(r => r.t.paidDate && inP(r.t.paidDate + 'T12:00:00.000Z', R)))), ''), H(fmtMoney(sum(l.filter(r => r.inv && !r.t.paidDate))), sum(l.filter(r => r.inv && !r.t.paidDate)).toFixed(2)), H(fmtMoney(sum(l.filter(r => r.st === 'Overdue'))), sum(l.filter(r => r.st === 'Overdue')).toFixed(2)), l.filter(r => ready.includes(r)).length]; });
    return rpHead('Billing & revenue', 'Invoiced, paid and outstanding (amounts incl. VAT unless stated)') + rpBar({ csv: true }) +
      `<div class="rp-tiles">${rpTile('Invoiced', fmtMoney(sum(billed)), sum(billed), sum(billedP), 'up', { note: `${billed.length} invoice${billed.length === 1 ? '' : 's'}` })}
        ${rpTile('Paid', fmtMoney(sum(paid)), null, null, null, { note: `${paid.length} payment${paid.length === 1 ? '' : 's'} in the period` })}
        ${rpTile('Outstanding now', fmtMoney(sum(unpaid)), null, null, null, { note: `${unpaid.length} unpaid invoice${unpaid.length === 1 ? '' : 's'}` })}
        ${rpTile('Overdue now', fmtMoney(sum(rows.filter(r => r.st === 'Overdue'))), null, null, null, { note: `terms ${B().termsDays ?? 30} days`, warn: rows.some(r => r.st === 'Overdue') })}
        ${rpTile('Work not invoiced yet', ready.length, null, null, null, { note: fmtMoney(sum(ready)) + ' waiting', warn: ready.length > 0 })}</div>
      <div class="grid g2">
        <div class="card"><header><h2>Invoiced per month</h2><a class="btn sm noprint" href="#/service/tracker">Billing tracker</a></header>${barChart({ labels: R.trend.map(mShort), series: [{ label: 'Invoiced (incl. VAT)', color: '#b6d433', data: trend }] })}</div>
        <div class="card"><header><h2>Debtors by age</h2></header>${rpTable('rp-aged', ['Since invoice', ['Invoices', 'n'], ['Amount', 'n']], aged.map(([l, x]) => [l, x.length, H(fmtMoney(sum(x)), sum(x).toFixed(2))]), null, { foot: [H('<strong>Total</strong>', ''), unpaid.length, H(`<strong>${fmtMoney(sum(unpaid))}</strong>`, '')] })}
          <h3 style="margin:14px 0 6px">Job revenue by type (excl. VAT)</h3>${rpTable('rp-kinds', ['Type', ['Amount', 'n'], ['Share', 'n']], Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, H(fmtMoney(v), v.toFixed(2)), fmtPct(pctOf(v, kTot))]))}</div>
      </div>
      <div class="card"><header><h2>Per client</h2></header>${rpTable('rp-clients', ['Building', ['Invoiced in period', 'n'], ['Paid in period', 'n'], ['Outstanding', 'n'], ['Overdue', 'n'], ['Not invoiced yet', 'n']], clients, 'billing-by-client')}</div>`;
  }

  /* ---------- Utility ---------- */
  function urep() {
    const R = rpRange(), from = [R.prev.a, R.trend[0]].sort()[0], key = `${from}|${R.b}|${rpBld()}`;
    if (!ui.urep || ui.urep.key !== key) {
      ui.urep = { key, loading: true };
      api('GET', `/api/reports/utility?from=${from}&to=${R.b}${rpBld() ? '&building=' + rpBld() : ''}`).then(r => { ui.urep = { key, r }; if (current.key.startsWith('reports/')) render(true); }).catch(e => { ui.urep = { key, error: e.message }; if (current.key.startsWith('reports/')) render(true); });
    }
    return ui.urep;
  }
  const uWait = (u, title, what) => rpHead(title, what) + rpBar() + (u.error ? `<div class="card empty">${esc(u.error)}</div>` : '<div class="card empty pulse">Working out the figures…</div>');
  /* Totals over a set of months: council, solar, tenants, common, loss per utility. */
  function uSum(r, months, type) {
    const o = { council: 0, solar: 0, tenants: 0, common: 0, loss: 0, supply: 0, complete: true, hasCouncil: false, tenantsC: 0, supplyC: 0 };
    r.buildings.forEach(b => b.months.filter(m => months.includes(m.month)).forEach(m => { const x = m[type]; o.council += x.council || 0; o.solar += x.solar || 0; o.tenants += x.tenants || 0; o.common += x.common || 0; if (x.loss != null) { o.loss += x.loss; o.hasCouncil = true; } if (x.council != null) { o.tenantsC += x.tenants || 0; o.supplyC += (x.council || 0) + (x.solar || 0); } if (!x.complete) o.complete = false; }));
    o.supply = o.council + o.solar;
    o.lossPct = o.hasCouncil && o.supply > 0 ? Math.round(o.loss / o.supply * 1000) / 10 : null;
    o.recovery = o.supplyC > 0 ? Math.round(o.tenantsC / o.supplyC * 1000) / 10 : null; // only buildings with a council meter
    return o;
  }
  const UNIT = { electricity: 'kWh', water: 'kL', solar: 'kWh' };
  function viewUtilScorecard() {
    const u = urep(); if (!u.r) return uWait(u, 'Reports', 'Utility scorecard');
    const R = rpRange(), r = u.r;
    const e = uSum(r, R.months, 'electricity'), ep = uSum(r, monthsBetween(R.prev.a, R.prev.b), 'electricity');
    const w = uSum(r, R.months, 'water'), wp = uSum(r, monthsBetween(R.prev.a, R.prev.b), 'water');
    const runs = r.runs.filter(x => R.months.includes(x.month)), runsP = r.runs.filter(x => x.month >= R.prev.a && x.month <= R.prev.b);
    const billed = runs.reduce((a, x) => a + x.total, 0), billedP = runsP.reduce((a, x) => a + x.total, 0);
    const tr = R.trend.map(m => uSum(r, [m], 'electricity')), trw = R.trend.map(m => uSum(r, [m], 'water'));
    const bad = r.quality.filter(q => q.issues.some(i => i.level === 'bad')).length;
    const lossMonths = r.buildings.flatMap(b => b.months.filter(m => R.months.includes(m.month)).flatMap(m => ['electricity', 'water'].filter(t => m[t].status === 'loss' || m[t].status === 'over').map(t => ({ b, m, t }))));
    const missingRuns = r.buildings.flatMap(b => R.months.filter(m => m < today().slice(0, 7) && !r.runs.some(x => x.building === b.id && x.month === m)).map(m => ({ b, m })));
    return rpHead('Reports', 'Utility scorecard') + rpBar() +
      `<div class="rp-tiles">
        ${rpTile('Electricity from council', fmtN(e.council, 0) + ' kWh', e.council, ep.council, null)}
        ${rpTile('Electricity billed to tenants', fmtN(e.tenants, 0) + ' kWh', e.tenants, ep.tenants, 'up', { note: `recovery ${fmtPct(e.recovery)} of supply` })}
        ${rpTile('Electricity losses', fmtPct(e.lossPct), e.lossPct, ep.lossPct, 'down', { pts: true, warn: e.lossPct != null && e.lossPct > 5 })}
        ${rpTile('Solar generated', e.solar ? fmtN(e.solar, 0) + ' kWh' : '—', e.solar || null, ep.solar || null, 'up')}
        ${rpTile('Water from council', fmtN(w.council, 1) + ' kL', w.council, wp.council, null)}
        ${rpTile('Water billed to tenants', fmtN(w.tenants, 1) + ' kL', w.tenants, wp.tenants, 'up', { note: `recovery ${fmtPct(w.recovery)} of supply` })}
        ${rpTile('Water losses', fmtPct(w.lossPct), w.lossPct, wp.lossPct, 'down', { pts: true, warn: w.lossPct != null && w.lossPct > 10 })}
        ${rpTile('Recovered from tenants', fmtMoney(billed), billed, billedP, 'up', { note: `${runs.length} billing run${runs.length === 1 ? '' : 's'} · incl. VAT` })}
      </div>
      <div class="grid g2">
        <div class="card"><header><h2>Electricity per month</h2><a class="btn sm noprint" href="#/reports/consumption">Consumption</a></header>${barChart({ labels: R.trend.map(mShort), series: [{ label: 'Council + solar', color: '#3fd2e3', data: tr.map(t => t.supply) }, { label: 'Billed to tenants', color: '#b6d433', data: tr.map(t => t.tenants) }], line: { label: 'Losses %', color: '#ff5a5f', data: tr.map(t => t.lossPct) }, unit: ' kWh' })}</div>
        <div class="card"><header><h2>Water per month</h2><a class="btn sm noprint" href="#/reports/losses">Losses</a></header>${barChart({ labels: R.trend.map(mShort), series: [{ label: 'Council', color: '#3fd2e3', data: trw.map(t => t.supply) }, { label: 'Billed to tenants', color: '#b6d433', data: trw.map(t => t.tenants) }], line: { label: 'Losses %', color: '#ff5a5f', data: trw.map(t => t.lossPct) }, unit: ' kL' })}</div>
      </div>
      <div class="card"><header><h2>Needs attention</h2></header><div class="rows">
        ${rpAttn('trend', `${lossMonths.length} month${lossMonths.length === 1 ? '' : 's'} outside the loss tolerance`, lossMonths.slice(0, 3).map(x => `${esc(x.b.name)} ${UT_LABEL[x.t].toLowerCase()} ${mShort(x.m.month)}`).join(' · ') || 'all buildings balance', '#/reports/losses', lossMonths.length ? 'bad' : 'ok')}
        ${rpAttn('alert', `${r.quality.length} meter${r.quality.length === 1 ? '' : 's'} with data issues`, `${bad} serious (no readings, readings going backwards, no serial)`, '#/reports/quality', bad ? 'bad' : r.quality.length ? 'warn' : 'ok')}
        ${rpAttn('doc', `${missingRuns.length} month${missingRuns.length === 1 ? '' : 's'} not billed yet`, missingRuns.slice(0, 3).map(x => `${esc(x.b.name)} ${mShort(x.m)}`).join(' · ') || 'every completed month has a billing run', '#/reports/recoveries', missingRuns.length ? 'warn' : 'ok')}
      </div></div>
      <p class="muted rp-note">Supply is the council meter plus solar. Losses are supply less the meters under it (see Losses & balance). Recovery is the share of supply billed to tenants; the rest is common areas and losses. Changes compare with ${esc(R.prev.label)}.</p>`;
  }
  function viewRpConsumption() {
    const u = urep(); if (!u.r) return uWait(u, 'Consumption', 'Where the supply went');
    const R = rpRange(), r = u.r, pm = monthsBetween(R.prev.a, R.prev.b);
    const idx = ms => ms.map(m => r.months.findIndex(x => x.key === m)).filter(i => i >= 0);
    const sumIdx = (arr, ii) => { const v = ii.map(i => arr[i]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    const flows = ['electricity', 'water'].map(t => { const o = uSum(r, R.months, t); return [H(`<strong>${UT_LABEL[t]}</strong>`, UT_LABEL[t]), H(fmtN(o.council, 1), o.council), t === 'electricity' ? H(fmtN(o.solar, 1), o.solar) : '—', H(fmtN(o.tenants, 1), o.tenants), H(fmtN(o.common, 1), o.common), o.hasCouncil ? H(fmtN(o.loss, 1), o.loss) : '—', fmtPct(o.recovery), UNIT[t]]; });
    const tRows = r.tenants.map(t => {
      const e = sumIdx(t.use.electricity, idx(R.months)), ep = sumIdx(t.use.electricity, idx(pm)), w = sumIdx(t.use.water, idx(R.months)), wp = sumIdx(t.use.water, idx(pm));
      const ch = (a, b) => (a != null && b ? H(`<span class="rp-delta ${a > b * 1.2 ? 'bad' : ''}">${a >= b ? '▲' : '▼'} ${fmtN(Math.abs((a - b) / b * 100), 0)}%</span>`, Math.round((a - b) / b * 100) + '%') : H('—', ''));
      return [H(`<strong>${esc(t.name)}</strong>${t.active ? '' : ' <span class="pill off">moved out</span>'}`, t.name), t.unit, bld(t.building).name, H(fmtN(e, 1), e ?? ''), ch(e, ep), H(fmtN(w, 2), w ?? ''), ch(w, wp)];
    }).sort((a, b) => (+b[3].csv || 0) - (+a[3].csv || 0));
    const blRows = r.buildings.map(b => { const ii = idx(R.months); const s = t => b.months.filter((m, i) => ii.includes(i)).reduce((a, m) => a + (m[t].council || 0) + (m[t].solar || 0), 0); return [b.name, H(fmtN(s('electricity'), 0), s('electricity')), H(fmtN(s('water'), 1), s('water'))]; });
    return rpHead('Consumption', 'Where the council supply went, and use per tenant') + rpBar({ csv: true }) +
      `<div class="card"><header><h2>Supply and where it went</h2></header>${rpTable('rp-flow', ['Utility', ['From council', 'n'], ['Solar', 'n'], ['Billed to tenants', 'n'], ['Common areas', 'n'], ['Losses / unmetered', 'n'], ['Recovery', 'n'], 'Unit'], flows)}</div>
      ${r.buildings.length > 1 ? `<div class="card"><header><h2>Per building</h2></header>${rpTable('rp-bsupply', ['Building', ['Electricity supply (kWh)', 'n'], ['Water supply (kL)', 'n']], blRows)}</div>` : ''}
      <div class="card"><header><h2>Per tenant</h2><small class="muted">Change vs ${esc(R.prev.label)}; red when up more than 20%</small></header>${rpTable('rp-tenants', ['Tenant', 'Shop', 'Building', ['Electricity kWh', 'n'], ['vs prev.', 'n'], ['Water kL', 'n'], ['vs prev.', 'n']], tRows, 'tenant-consumption', { empty: 'No tenants with meters.' })}</div>`;
  }
  const LSTAT = { ok: ['ok', 'Balanced'], loss: ['bad', 'Loss'], over: ['bad', 'Over'], incomplete: ['warn', 'Readings missing'], nocouncil: ['off', 'No council meter'], notree: ['off', 'No tree'] };
  function viewRpLosses() {
    const u = urep(); if (!u.r) return uWait(u, 'Losses & balance', 'Each building against its council meters');
    const R = rpRange(), r = u.r;
    const cell = (b, m, t) => { const x = m[t]; const s = LSTAT[x.status] || ['off', x.status]; return H(`<a href="#/meters/balance/${b.id}" data-balm="${m.month}" class="pill ${s[0]}" title="${s[1]}${x.tolerance != null ? ' · tolerance ' + x.tolerance + '%' : ''}">${x.lossPct != null && x.status !== 'incomplete' ? fmtPct(x.lossPct) : s[1]}</a>`, x.lossPct != null ? x.lossPct : s[1]); };
    const rows = r.buildings.flatMap(b => ['electricity', 'water'].map(t => [H(`<strong>${esc(b.name)}</strong>`, b.name), UT_LABEL[t], ...b.months.filter(m => R.months.includes(m.month)).map(m => cell(b, m, t)), (() => { const o = uSum({ buildings: [b] }, R.months, t); return H(`<strong>${fmtPct(o.lossPct)}</strong>`, o.lossPct ?? ''); })()]));
    const lossVal = r.buildings.flatMap(b => ['electricity', 'water'].map(t => ({ b, t, o: uSum({ buildings: [b] }, R.months, t) }))).filter(x => x.o.loss > 0);
    return rpHead('Losses & balance', 'Council supply against the meters under it, per month') + rpBar({ csv: true }) +
      `<div class="card"><div class="table-wrap">${rpTable('rp-loss', ['Building', 'Utility', ...R.months.map(m => [mShort(m), 'n']), ['Period', 'n']], rows, 'losses')}</div>
        <p class="muted" style="margin:10px 0 0">Click a month to open the building balance with the full meter tree. Green is within the building's tolerance (default 5% electricity, 10% water).</p></div>
      <div class="card"><header><h2>Units lost in the period</h2></header>${rpTable('rp-lossu', ['Building', 'Utility', ['Supply', 'n'], ['Lost', 'n'], ['Loss %', 'n']], lossVal.map(x => [x.b.name, UT_LABEL[x.t], H(fmtN(x.o.supply, 1) + ' ' + UNIT[x.t], x.o.supply), H(fmtN(x.o.loss, 1) + ' ' + UNIT[x.t], x.o.loss), fmtPct(x.o.lossPct)]), null, { empty: 'No losses recorded.' })}</div>`;
  }
  function viewRpRecoveries() {
    const u = urep(); if (!u.r) return uWait(u, 'Tenant recoveries', 'Billing runs');
    const R = rpRange(), r = u.r, runs = r.runs.filter(x => R.months.includes(x.month)).sort((a, b) => b.month.localeCompare(a.month));
    const missing = r.buildings.flatMap(b => R.months.filter(m => m < today().slice(0, 7) && !r.runs.some(x => x.building === b.id && x.month === m)).map(m => [b.name, mLong(m)]));
    const tot = runs.reduce((a, x) => a + x.total, 0), appr = runs.filter(x => x.status === 'approved');
    return rpHead('Tenant recoveries', 'What was billed to tenants') + rpBar({ csv: true }) +
      `<div class="rp-tiles">${rpTile('Billed (incl. VAT)', fmtMoney(tot), null, null, null, { note: `${runs.length} run${runs.length === 1 ? '' : 's'}` })}${rpTile('Approved', fmtMoney(appr.reduce((a, x) => a + x.total, 0)), null, null, null, { note: `${appr.length} approved, ${runs.length - appr.length} draft` })}${rpTile('Months not billed', missing.length, null, null, null, { warn: missing.length > 0, note: 'completed months without a run' })}</div>
      <div class="card"><header><h2>Billing runs</h2><a class="btn sm noprint" href="#/recoveries/runs">All billing runs</a></header>${rpTable('rp-runs', ['Month', 'Building', 'Status', ['Tenants', 'n'], ['Excl. VAT', 'n'], ['Incl. VAT', 'n']], runs.map(x => [H(`<strong>${esc(x.label)}</strong>`, x.label), bld(x.building).name, H(`<span class="pill ${x.status === 'approved' ? 'ok' : 'warn'}">${x.status === 'approved' ? 'Approved' : 'Draft'}</span>`, x.status), x.tenants, H(fmtMoney(x.subtotal), x.subtotal.toFixed(2)), H(fmtMoney(x.total), x.total.toFixed(2))]), 'recoveries', { href: row => '#/recoveries/run/' + (runs.find(x => x.label === row[0].csv && bld(x.building).name === row[1]) || {}).id, foot: [H('<strong>Total</strong>', ''), '', '', '', H(fmtMoney(runs.reduce((a, x) => a + x.subtotal, 0)), ''), H(`<strong>${fmtMoney(tot)}</strong>`, '')] })}</div>
      ${missing.length ? `<div class="card"><header><h2>Not billed yet</h2></header>${rpTable('rp-miss', ['Building', 'Month'], missing)}</div>` : ''}`;
  }
  function viewRpQuality() {
    const u = urep(); if (!u.r) return uWait(u, 'Meter data quality', 'Meters that need a look');
    const r = u.r, all = (S.meters || []).filter(m => !m.removed && r.buildings.some(b => b.id === m.building));
    const counts = {}; r.quality.forEach(q => q.issues.forEach(i => { const k = i.text.replace(/\d+/g, 'n'); counts[k] = (counts[k] || 0) + 1; }));
    const rows = r.quality.slice().sort((a, b) => (b.issues.some(i => i.level === 'bad') - a.issues.some(i => i.level === 'bad'))).map(q => [H(`<strong class="mono">${esc(q.serial || q.meterId)}</strong>`, q.serial || q.meterId), UT_LABEL[q.type], bld(q.building).name, q.location || '—', q.tenant || '—', q.last ? H(dmy(q.last), q.last.slice(0, 10)) : '—', H(q.issues.map(i => `<span class="pill ${i.level}">${esc(i.text)}</span>`).join(' '), q.issues.map(i => i.text).join('; '))]);
    return rpHead('Meter data quality', 'Clean readings make accurate bills and balances') + rpBar({ csv: true }) +
      `<div class="rp-tiles">${rpTile('Meters', all.length, null, null, null, { note: 'in the selected buildings' })}${rpTile('Without issues', fmtPct(pctOf(all.length - r.quality.length, all.length)), null, null, null, { note: `${all.length - r.quality.length} of ${all.length}`, warn: r.quality.length > 0 })}${Object.entries(counts).slice(0, 2).map(([k, n]) => rpTile(esc(k.replace(/ n /g, ' … ').replace(/^n /, '')), n, null, null, null, { note: 'meters' })).join('')}</div>
      <div class="card"><header><h2>Meters to look at</h2><a class="btn sm noprint" href="#/meters/capture">Record readings</a></header>${rpTable('rp-quality', ['Meter', 'Utility', 'Building', 'Shop / area', 'Tenant', ['Last reading', 'n'], 'Issues'], rows, 'meter-data-quality', { href: row => '#/meters/meter/' + encodeURIComponent((r.quality.find(q => (q.serial || q.meterId) === row[0].csv) || {}).meterId || ''), empty: 'All meters look good.' })}</div>`;
  }
  /* ---------------- views: technicians ---------------- */
  const techName = j => ((j && tech(j.tech)) || {}).name || (j && j.techName) || '';
  function viewTechs() {
    return head('Technicians', `${S.technicians.length} in the field team`, isStaff() ? `<a class="btn primary sm" href="#/service/tech/new">${ic('plus')}Add technician</a>` : '') +
      (S.technicians.length ? '' : '<div class="card empty">No technicians yet.</div>') +
      `<div class="grid g2">${S.technicians.map(t => {
      const v = byId(S.vehicles, t.vehicle), j = t.job && byId(S.jobs, t.job);
      const done = S.jobs.filter(x => x.tech === t.id && x.status === 'report').length;
      return `<div class="card"><header><h2>${esc(t.name)}</h2>${statusPill(t.status)}</header><small>${esc(t.skill || '')}</small>
        <dl class="kv" style="margin-top:10px"><dt>Current job</dt><dd>${j && t.status === 'on job' ? `<a href="#/service/job/${j.id}">${j.id} · ${esc(stepLabel(j.status))}</a>` : '—'}</dd>
        <dt>Mobile</dt><dd>${esc(t.phone || '—')}</dd><dt>Email</dt><dd>${esc(t.email || '—')}</dd><dt>Vehicle</dt><dd>${v ? esc(v.reg) : '—'}</dd><dt>Jobs completed</dt><dd>${done}</dd></dl>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${t.phone ? `<a class="btn sm" href="tel:${t.phone.replace(/\s/g, '')}">${ic('phone')}Call</a>` : ''}
        ${t.status !== 'on job' && (isStaff() || S.me.techId === t.id) ? `<button class="btn sm" data-action="duty" data-id="${t.id}">${t.status === 'off' ? 'Set on duty' : 'Set off duty'}</button>` : ''}
        ${isStaff() ? `<a class="btn sm" href="#/service/tech/${t.id}">Edit</a><button class="btn sm danger" data-action="deltech" data-id="${t.id}">Remove</button>` : ''}</div></div>`;
    }).join('')}</div>`;
  }
  /* ---------------- technician home: "My work" ---------------- */
  const URG_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  function techNext(j) {
    const step = { assigned: ['enroute', `${ic('route')}I'm on the way`], enroute: ['onsite', `${ic('pin')}I've arrived on site`] }[j.status];
    if (step) return `<button class="btn primary tj-go" data-action="advance" data-id="${j.id}">${step[1]}</button>`;
    if (j.status === 'onsite') return `<a class="btn primary tj-go" href="#/service/job/${j.id}">${ic('card')}Fill in the job card</a>`;
    if (j.status === 'completed') return `<a class="btn primary tj-go" href="#/service/job/${j.id}">${ic('check')}Get the customer's signature</a>`;
    return `<a class="btn tj-go" href="#/service/job/${j.id}">Open job</a>`;
  }
  function viewTechHome() {
    const me = S.technicians[0] || {};
    const open = S.jobs.filter(j => j.status !== 'report').sort((a, b) => (URG_RANK[a.urgency] ?? 9) - (URG_RANK[b.urgency] ?? 9) || String(a.steps.logged).localeCompare(String(b.steps.logged)));
    const done = S.jobs.filter(j => j.status === 'report').sort((a, b) => String(b.steps.report).localeCompare(String(a.steps.report))).slice(0, 5);
    const v = S.vehicles[0], trips = S.trips.filter(t => t.status !== 'Delivered');
    const duty = me.id && me.status !== 'on job' ? `<button class="btn sm ${me.status === 'off' ? 'primary' : ''}" data-action="duty" data-id="${me.id}">${me.status === 'off' ? 'Go on duty' : 'Go off duty'}</button>` : '';
    return head('My work', `${esc(S.me.name)} · ${me.status === 'off' ? 'off duty' : me.status === 'on job' ? 'on a job' : 'available for new jobs'}`, duty) +
      (!me.id ? '<div class="banner bad"><span class="grow">Your login is not linked to a technician record yet. Ask the admin to link it (Service → Technicians → Edit → App login).</span></div>' : '') +
      `<div class="tj-list">${open.length ? open.map(j => { const b = bld(j.building), bm = contactsOf(b, 'Building Manager')[0] || {};
        return `<div class="card tj ${j.urgency === 'Critical' ? 'alert' : ''}"><header><h2><a href="#/service/job/${j.id}" style="color:inherit">${j.id}</a></h2>${divOf(j) === 'utility' ? '<span class="pill info">Meters</span>' : ''}${urgPill(j.urgency)}${jobStatusPill(j)}</header>
          <div class="tj-where"><strong>${esc(b.name)}</strong><small>${esc(b.area || '')}${j.location ? ' · ' + esc(j.location) : ''}</small></div>
          <p class="tj-fault"><b>${esc(j.equipment)}</b><br>${esc(j.fault)}</p>
          ${techNext(j)}
          <div class="tj-links">${bm.phone ? `<a class="btn sm" href="tel:${bm.phone.replace(/\s/g, '')}">${ic('phone')}${esc(bm.name || 'Building manager')}</a>` : ''}<a class="btn sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([b.name, b.area].filter(Boolean).join(', '))}" target="_blank" rel="noopener">${ic('pin')}Directions</a>${j.unit ? `<a class="btn sm" href="#/service/unit/${j.building}/${encodeURIComponent(j.unit)}">${ic('fcu')}Unit history</a>` : ''}</div></div>`; }).join('')
        : `<div class="card empty">No open jobs right now.${me.status === 'off' ? ' You are off duty.' : ' New jobs appear here and you get an SMS.'}</div>`}</div>
      <div class="grid g2" style="margin-top:14px">
        <div class="card"><header><h3>Recently completed</h3></header>${done.length ? `<div class="rows">${done.map(j => `<a class="row" href="#/service/report/${j.id}" style="color:inherit"><div class="grow"><strong>${j.id} · ${esc(bld(j.building).name)}</strong><small>${esc(j.fault)}</small></div><small class="mono">${dmy(j.steps.report)}</small></a>`).join('')}</div>` : '<p class="muted" style="margin:0">Nothing yet.</p>'}</div>
        <div class="card"><header><h3>My vehicle & trips</h3></header>${v ? `<p style="margin:0 0 8px"><strong>${esc(v.reg)}</strong> · ${esc(v.model)}</p>` : '<p class="muted" style="margin:0 0 8px">No vehicle assigned.</p>'}
          ${trips.length ? `<div class="rows">${trips.map(t => `<div class="row"><div class="grow"><strong>${esc(t.what)}</strong><small>${esc(t.from)} → ${esc(t.to)}</small></div>${statusPill(t.status)}</div>`).join('')}</div>` : '<p class="muted" style="margin:0">No open trips.</p>'}
          <a class="btn sm" href="#/dispatch" style="margin-top:8px">All my trips</a></div>
      </div>`;
  }

  function viewTechEdit(id) {
    const t = id === 'new' ? { status: 'available' } : tech(id);
    if (!t || !isStaff()) return head('Technician not found');
    return head(id === 'new' ? 'Add technician' : 'Edit ' + esc(t.name), 'Technicians receive job SMS on this mobile number', `<a class="btn sm" href="#/service/techs">${ic('back')}All technicians</a>`) +
      `<form class="card form" data-form="tech" data-id="${id === 'new' ? '' : t.id}" style="max-width:640px">
        ${field('Full name', 'name', t.name, 'text', 'required')}${field('Skills / role', 'skill', t.skill, 'text', 'placeholder="e.g. HVAC technician · VRF & splits"')}
        <div class="grid g2">${field('Mobile (for job SMS)', 'phone', t.phone, 'tel', 'placeholder="082 123 4567"')}${field('Email', 'email', t.email, 'email')}</div>
        <div class="grid g2"><div class="field"><label>Vehicle</label><select name="vehicle"><option value="">— none —</option>${S.vehicles.map(v => `<option value="${v.id}" ${t.vehicle === v.id ? 'selected' : ''}>${esc(v.reg)} · ${esc(v.model)}</option>`).join('')}</select></div>
        <div class="field"><label>Status</label><select name="status" ${t.status === 'on job' ? 'disabled' : ''}>${t.status === 'on job' ? '<option>On a job</option>' : [['available', 'Available'], ['off', 'Off duty']].map(([v, l]) => `<option value="${v}" ${t.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>

        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">${ic('check')}Save technician</button>${id === 'new' ? '' : `<button type="button" class="btn danger" data-action="deltech" data-id="${t.id}">Remove technician</button>`}</div></form>
      ${id !== 'new' ? techLoginCard(t) : ''}`;
  }
  function techLoginCard(t) {
    if (role() !== 'admin') return `<div class="card" style="max-width:640px;margin-top:14px"><header><h2>App login</h2></header><p class="muted" style="margin:0">An admin can give this technician a login here.</p></div>`;
    const u = (S.admin.users || []).find(x => x.techId === t.id);
    return `<form class="card form" data-form="techlogin" data-tech="${t.id}" data-user="${u ? u.id : ''}" style="max-width:640px;margin-top:14px"><header><h2>App login</h2>${u ? '<span class="pill ok"><i></i>Has a login</span>' : '<span class="pill off">No login yet</span>'}</header>
      <p class="muted" style="margin:0;font-size:13px">With a login, ${esc(t.name)} sees only their own jobs, job cards, trips and assessments, and can log services on equipment. No monitoring, billing, clients or other staff.</p>
      ${u ? `<p style="margin:0">Signs in as <strong>${esc(u.email)}</strong></p>${field('New password (to reset it)', 'password', '', 'password', 'minlength="8" autocomplete="new-password" required')}<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn">Reset password</button><button type="button" class="btn danger" data-action="deluser" data-id="${u.id}">Remove login</button></div>`
        : `${field('Email (their login)', 'email', t.email, 'email', 'required')}${field('Password (at least 8 characters; give it to them)', 'password', '', 'password', 'minlength="8" autocomplete="new-password" required')}<button class="btn primary">${ic('check')}Create login</button>`}</form>`;
  }


  /* ---------------- views: buildings & contacts ---------------- */
  const CONTACT_ROLES = ['Building Manager', 'Operations Manager', 'Other'];
  const contactsOf = (b, role) => (b.contacts || []).filter(c => !role || c.role === role);
  const telLink = (p, label) => p ? `<a href="tel:${String(p).replace(/\s/g, '')}">${esc(label || p)}</a>` : '—';
  function contactList(b) {
    const list = contactsOf(b);
    if (!list.length) return '<p class="muted" style="margin:6px 0">No contacts yet.</p>';
    return `<div class="rows">${list.map(c => `<div class="row">${icS(c.role === 'Operations Manager' ? 'gear' : c.role === 'Building Manager' ? 'building' : 'users')}<div class="grow"><strong>${esc(c.name)}</strong><small>${esc(c.role)}${c.notify === false ? ' · notifications off' : ''}</small><small>${telLink(c.phone)}${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</small></div></div>`).join('')}</div>`;
  }
  function viewClients() {
    return head('Clients', 'Buildings under service, their managers and equipment') + `<div class="grid g2">${bizBuildings().map(b => `<div class="card"><header><h2>${esc(b.name)}</h2></header><small>${esc(b.client || '')} · ${esc(b.area || '')}</small>
      ${contactList(b)}
      <dl class="kv" style="margin-top:6px"><dt>Open jobs</dt><dd>${openJobs().filter(j => j.building === b.id).length}</dd><dt>Units</dt><dd>${(b.units || []).filter(u => !u.removed).length}</dd></dl>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${isStaff() ? `<a class="btn sm primary" href="#/service/building/${b.id}">${ic('users')}Manage contacts</a>` : ''}<a class="btn sm" href="#/service/equipment/${b.id}">${ic('fcu')}Equipment & history</a></div></div>`).join('')}</div>`;
  }
  const contactRow = (c = { role: 'Building Manager', notify: true }) => `<div class="crow" data-row>
      <input type="hidden" name="c_id" value="${esc(c.id || '')}">
      <div class="field"><label>Name</label><input name="c_name" value="${esc(c.name || '')}" placeholder="Full name"></div>
      <div class="field"><label>Role</label><select name="c_role">${CONTACT_ROLES.map(r => `<option ${c.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="field"><label>Mobile</label><input name="c_phone" type="tel" value="${esc(c.phone || '')}" placeholder="082 123 4567"></div>
      <div class="field"><label>Email</label><input name="c_email" type="email" value="${esc(c.email || '')}"></div>
      <label class="cnotify"><input type="checkbox" name="c_notify" ${c.notify !== false ? 'checked' : ''}> Notify</label>
      <button type="button" class="btn sm danger" data-action="rmrow" aria-label="Remove contact">${ic('x')}</button></div>`;
  function viewBuildingContacts(bid) {
    const b = byId(S.buildings, bid);
    if (!b || !isStaff()) return head('Building not found');
    return head(`${esc(b.name)} · contacts`, 'Building managers and operations managers receive SMS and email updates when "Notify" is ticked', `<a class="btn sm" href="#/service/clients">${ic('back')}Clients</a>`) +
      `<form class="card form" data-form="contacts" data-bid="${b.id}">
        <div id="crows">${(b.contacts && b.contacts.length ? b.contacts : [{ role: 'Building Manager', notify: true }]).map(contactRow).join('')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn sm" data-action="addrow" data-role="Building Manager">${ic('plus')}Add building manager</button><button type="button" class="btn sm" data-action="addrow" data-role="Operations Manager">${ic('plus')}Add operations manager</button><button type="button" class="btn sm" data-action="addrow" data-role="Other">${ic('plus')}Add other contact</button></div>
        <div><button class="btn primary">${ic('check')}Save contacts</button></div></form>`;
  }

  /* ---------------- views: equipment register & service history ---------------- */
  const today = () => new Date().toISOString().slice(0, 10);
  const unitKey = j => j.unit || String(j.equipment || '').split(' · ')[0];
  function unitHistory(bid, uid) {
    const items = [];
    S.services.filter(x => x.building === bid && x.unit === uid).forEach(x => items.push({ kind: 'service', at: x.date + 'T' + (x.at || '').slice(11), rec: x }));
    S.jobs.filter(j => j.building === bid && unitKey(j) === uid).forEach(j => items.push({ kind: 'job', at: j.steps.completed || j.steps.logged, rec: j }));
    S.alarms.filter(a => a.building === bid && a.equip === uid && a.priority !== 'Low').forEach(a => items.push({ kind: 'alarm', at: a.at, rec: a }));
    return items.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  }
  function lastServiced(bid, uid) {
    const d = [...S.services.filter(x => x.building === bid && x.unit === uid).map(x => x.date), ...S.jobs.filter(j => j.building === bid && unitKey(j) === uid && j.steps.completed).map(j => j.steps.completed.slice(0, 10))].sort();
    return d.length ? d[d.length - 1] : null;
  }
  function nextDue(u, last) {
    if (!u.intervalMonths) return null;
    const base = last || u.installed; if (!base) return null;
    const d = new Date(base + 'T12:00:00'); d.setMonth(d.getMonth() + +u.intervalMonths);
    return d.toISOString().slice(0, 10);
  }
  function duePill(due, last, u) {
    if (u && !u.intervalMonths) return '<span class="pill off">No schedule</span>';
    if (!last) return '<span class="pill warn">No service recorded</span>';
    if (!due) return '<span class="pill off">No schedule</span>';
    const days = Math.round((new Date(due) - new Date(today())) / 864e5);
    if (days < 0) return `<span class="pill bad" title="Was due ${dmy(due)}">Overdue ${-days > 60 ? Math.round(-days / 30.4) + ' months' : -days + ' days'}</span>`;
    if (days <= 14) return `<span class="pill warn" title="Due ${dmy(due)}">Due in ${days} day${days === 1 ? '' : 's'}</span>`;
    return `<span class="pill ok">${dmy(due)}</span>`;
  }
  function liveStatus(bid, uid) {
    const bm = ui.bmsCache[bid]; if (!bm) return null;
    for (const k of ['ahus', 'chillers', 'pumps', 'towers', 'fans', 'fcus']) { const e = (bm[k] || []).find(x => x.id === uid); if (e) return e; }
    return null;
  }
  function viewEquipment(bid) {
    const b = byId(S.buildings, bid || ui.site) || S.buildings[0];
    if (!b) return head('Equipment') + '<div class="card empty">No buildings yet.</div>';
    const units = (b.units || []).filter(u => ui.showRemoved || !u.removed);
    const rows = units.map(u => { const last = lastServiced(b.id, u.id); return { u, last, due: nextDue(u, last), open: openJobs().filter(j => j.building === b.id && unitKey(j) === u.id).length, live: liveStatus(b.id, u.id) }; });
    const overdue = rows.filter(r => !r.u.removed && r.u.intervalMonths && (!r.last || (r.due && r.due < today()))).length;
    const soon = rows.filter(r => r.due && r.due >= today() && (new Date(r.due) - new Date(today())) / 864e5 <= 14).length;
    const removedCount = (b.units || []).filter(u => u.removed).length;
    return head(`Equipment · ${esc(b.name)}`, 'Every aircon unit with its full service history',
      `${bizBuildings().length > 1 ? `<select data-change="eqsite" aria-label="Building" style="padding:8px 10px;background:var(--bg2);border:1px solid var(--line2);border-radius:8px">${bizBuildings().map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}${isStaff() ? `<a class="btn primary sm" href="#/service/unitedit/${b.id}/new">${ic('plus')}Add unit</a>` : ''}`) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('fcu', 'Units', (b.units || []).filter(u => !u.removed).length)}${kpi('alert', 'Overdue / never serviced', overdue)}${kpi('clock', 'Due in 14 days', soon)}${kpi('wrench', 'Open calls', rows.reduce((s, r) => s + r.open, 0))}</div>
      <div class="card">${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Unit</th><th class="hide-sm">Location</th><th class="hide-sm">Make / model</th><th>Last service</th><th>Next service</th><th class="hide-sm">Open calls</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="click ${r.u.removed ? 'muted' : ''}" data-href="#/service/unit/${b.id}/${encodeURIComponent(r.u.id)}"><td><strong>${esc(r.u.id)}</strong> ${r.live ? dot(r.live.status) : ''}<br><small>${esc(r.u.type || '')}${r.u.removed ? ' · decommissioned' : ''}</small></td><td class="hide-sm">${esc(r.u.location || '—')}</td><td class="hide-sm">${esc([r.u.make, r.u.model].filter(Boolean).join(' ') || '—')}</td><td class="mono">${r.last ? dmy(r.last) : '—'}</td><td>${r.u.removed ? '—' : duePill(r.due, r.last, r.u)}</td><td class="hide-sm">${r.open || ''}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty">No units registered yet.${isStaff() ? ' Use “Add unit”.' : ''}</div>`}
      ${removedCount ? `<p style="margin:10px 0 0"><a href="#" data-action="toggleremoved">${ui.showRemoved ? 'Hide' : 'Show'} ${removedCount} decommissioned unit${removedCount > 1 ? 's' : ''}</a></p>` : ''}</div>`;
  }
  const SERVICE_TYPES = ['Planned maintenance', 'Repair', 'Inspection', 'Filter change', 'Refrigerant top-up', 'Other'];
  function historyItem(it) {
    const r = it.rec;
    if (it.kind === 'service') return `<li class="done"><span class="dot">${ic('wrench')}</span><div class="grow"><strong>${esc(r.type)}</strong><small>${esc(r.work)}</small>${r.notes ? `<small><em>${esc(r.notes)}</em></small>` : ''}<small>${esc(r.techName || 'Unassigned')} · logged by ${esc(r.by || '')}</small>${(r.billing || {}).lines && r.billing.lines.length ? `<small>${fmtMoney(calcTotals(r.billing.lines).total)} incl. VAT · ${r.invoice && r.invoice.id ? `invoiced ${esc(r.invoice.number || '')}` : 'not invoiced'}</small>` : ''}${isField() ? `<small><a href="#/service/svbilling/${r.id}">${(r.billing || {}).lines && r.billing.lines.length ? 'Parts & labour / invoice' : 'Add parts & labour'}</a></small>` : ''}</div><time>${dmy(r.date)}</time>${isStaff() ? `<button class="btn sm" data-action="delservice" data-id="${r.id}" aria-label="Delete record" title="Delete record">${ic('x')}</button>` : ''}</li>`;
    if (it.kind === 'job') return `<li class="${r.status === 'report' ? 'done' : ''}"><span class="dot">${ic('card')}</span><div class="grow"><strong><a href="#/service/job/${r.id}">${r.id}</a> · ${esc(r.fault)}</strong><small>${jobStatusPill(r)} ${urgPill(r.urgency)} ${esc(r.source || '')}</small>${r.findings ? `<small>Found: ${esc(r.findings)}</small>` : ''}${r.work ? `<small>Done: ${esc(r.work)}</small>` : ''}<small>${esc(techName(r) || 'Unassigned')}${r.status === 'report' ? ` · <a href="#/service/report/${r.id}">signed report</a>` : ''}</small></div><time>${dmy(it.at)}</time></li>`;
    return `<li class="${r.status === 'Active' ? 'bad' : 'done'}"><span class="dot">${ic('alert')}</span><div class="grow"><strong><a href="#/bms/alarm/${r.id}">Alarm</a> · ${esc(r.desc)}</strong><small>${prioPill(r.priority)} ${statusPill(r.status)}${r.jobId ? ` · call ${r.jobId}` : ''}</small></div><time>${dmy(r.at)}</time></li>`;
  }
  function viewUnit(bid, uidRaw) {
    const uid = decodeURIComponent(uidRaw || '');
    const b = byId(S.buildings, bid), u = b && (b.units || []).find(x => x.id === uid);
    if (!u) return head('Unit not found') + `<div class="card empty"><a href="#/service/equipment/${esc(bid || '')}">Back to equipment</a></div>`;
    const hist = unitHistory(b.id, u.id), last = lastServiced(b.id, u.id), due = nextDue(u, last), live = liveStatus(b.id, u.id);
    const nServ = hist.filter(h => h.kind === 'service').length, nJobs = hist.filter(h => h.kind === 'job').length;
    return head(`${esc(u.id)} <small class="muted" style="font-weight:400">${esc(u.type || '')}</small> ${u.removed ? '<span class="pill off">Decommissioned</span>' : duePill(due, last, u)}`, `${esc(b.name)}${u.location ? ' · ' + esc(u.location) : ''}`,
      `<a class="btn sm" href="#/service/equipment/${b.id}">${ic('back')}Equipment</a><button class="btn sm" data-action="print">${ic('print')}Print history</button>${!u.removed ? `<button class="btn sm primary" data-action="logcall" data-bid="${b.id}" data-uid="${esc(u.id)}">${ic('phone')}Log a call</button>` : ''}${isStaff() ? `<a class="btn sm" href="#/service/unitedit/${b.id}/${encodeURIComponent(u.id)}">Edit</a>` : ''}`) +
      `<div class="grid split">
        <div class="card"><header><h2>Service history</h2><small>${nServ} service${nServ === 1 ? '' : 's'} · ${nJobs} call${nJobs === 1 ? '' : 's'}</small></header>
          ${hist.length ? `<ul class="timeline history">${hist.map(historyItem).join('')}</ul>` : '<div class="empty">No history yet.</div>'}</div>
        <div class="grid" style="align-content:start">
          <div class="card"><header><h3>Unit details</h3></header><dl class="kv">
            <dt>Make</dt><dd>${esc(u.make || '—')}</dd><dt>Model</dt><dd>${esc(u.model || '—')}</dd><dt>Serial no.</dt><dd>${esc(u.serial || '—')}</dd>
            <dt>Installed</dt><dd>${u.installed ? dmy(u.installed) : '—'}</dd><dt>Refrigerant</dt><dd>${esc(u.refrigerant || '—')}</dd>${u.capacity ? `<dt>Capacity</dt><dd>${esc(u.capacity)}</dd>` : ''}
            <dt>Service interval</dt><dd>${u.intervalMonths ? `every ${u.intervalMonths} month${u.intervalMonths > 1 ? 's' : ''}` : 'not scheduled'}</dd>
            <dt>Last serviced</dt><dd>${last ? dmy(last) : '—'}</dd><dt>Next service</dt><dd>${due ? dmy(due) : '—'}</dd></dl>
            ${u.notes ? `<p style="margin:10px 0 0;font-size:13px">${esc(u.notes)}</p>` : ''}</div>
          ${live ? `<div class="card"><header><h3>Live from the BMS</h3>${statusPill(live.status)}</header><dl class="kv">${['supplyTemp', 'returnTemp', 'supplyHz', 'load', 'chws', 'chwr', 'hz', 'fan', 'leaving'].filter(k => live[k] != null).map(k => `<dt>${{ supplyTemp: 'Supply air', returnTemp: 'Return air', supplyHz: 'Supply fan', load: 'Load', chws: 'CHW supply', chwr: 'CHW return', hz: 'Speed', fan: 'Fan', leaving: 'Leaving water' }[k]}</dt><dd>${live[k]}${{ supplyTemp: ' °C', returnTemp: ' °C', supplyHz: ' Hz', load: ' %', chws: ' °C', chwr: ' °C', hz: ' Hz', fan: ' %', leaving: ' °C' }[k]}</dd>`).join('')}</dl></div>` : ''}
          ${isField() && !u.removed ? `<form class="card form noprint" data-form="service" data-bid="${b.id}" data-uid="${esc(u.id)}"><header><h3>Log a service</h3></header>
            <div class="grid g2"><div class="field"><label>Date</label><input type="date" name="date" value="${today()}" max="${today()}" required></div>
            <div class="field"><label>Type</label><select name="type">${SERVICE_TYPES.map(x => `<option>${x}</option>`).join('')}</select></div></div>
            <div class="field"><label>Technician</label><select name="tech"><option value="">—</option>${S.technicians.map(t => `<option value="${t.id}" ${S.me.techId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
            <div class="field"><label>Work done</label><textarea name="work" required placeholder="e.g. Filters replaced, coil cleaned, drain flushed"></textarea></div>
            <details><summary class="muted" style="cursor:pointer">Parts & labour (optional, for invoicing)</summary>${linesEditor([])}</details>
            <div class="field"><label>Notes / readings (optional)</label><textarea name="notes" placeholder="e.g. Suction 3.1 bar, discharge 14.8 bar"></textarea></div>
            <button class="btn primary">${ic('check')}Save to history</button></form>` : ''}
        </div></div>`;
  }
  function viewUnitEdit(bid, uidRaw) {
    const isNew = uidRaw === 'new', uid = decodeURIComponent(uidRaw || '');
    const b = byId(S.buildings, bid);
    const u = isNew ? { intervalMonths: 3 } : b && (b.units || []).find(x => x.id === uid);
    if (!b || !u || !isStaff()) return head('Unit not found');
    return head(isNew ? `Add unit · ${esc(b.name)}` : `Edit ${esc(u.id)}`, '', `<a class="btn sm" href="${isNew ? `#/service/equipment/${b.id}` : `#/service/unit/${b.id}/${encodeURIComponent(u.id)}`}">${ic('back')}Back</a>`) +
      `<form class="card form" data-form="unit" data-bid="${b.id}" data-orig="${isNew ? '' : esc(u.id)}" style="max-width:720px">
        <div class="grid g2">${field('Unit ID', 'id', u.id, 'text', 'required placeholder="e.g. AHU-04 or SPL-12"')}${field('Type', 'type', u.type, 'text', 'list="unitTypes" placeholder="e.g. Split unit"')}</div>
        <datalist id="unitTypes">${['Air handling unit', 'Air-cooled chiller', 'Water-cooled chiller', 'Split unit', 'Cassette unit', 'Ducted unit', 'VRF outdoor unit', 'VRF indoor unit', 'Fan coil unit', 'Packaged unit', 'Cooling tower', 'Chilled water pump', 'Extract fan'].map(x => `<option value="${x}">`).join('')}</datalist>
        <div class="field"><label>Location</label><input name="location" value="${esc(u.location || '')}" list="unitLocs"><datalist id="unitLocs">${(b.locations || []).map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
        <div class="grid g3">${field('Make', 'make', u.make)}${field('Model', 'model', u.model)}${field('Serial number', 'serial', u.serial)}</div>
        <div class="grid g3">${field('Installed', 'installed', u.installed, 'date')}${field('Refrigerant', 'refrigerant', u.refrigerant, 'text', 'placeholder="e.g. R410A"')}${field('Capacity', 'capacity', u.capacity, 'text', 'placeholder="e.g. 12 kW"')}</div>
        ${field('Service every (months, 0 = no schedule)', 'intervalMonths', u.intervalMonths ?? 3, 'number', 'min="0" max="60"')}
        <div class="field"><label>Notes</label><textarea name="notes">${esc(u.notes || '')}</textarea></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">${ic('check')}Save unit</button>${isNew ? '' : `<button type="button" class="btn ${u.removed ? '' : 'danger'}" data-action="unitremoved" data-bid="${b.id}" data-uid="${esc(u.id)}" data-v="${u.removed ? '' : '1'}">${u.removed ? 'Restore unit' : 'Decommission unit'}</button>`}</div>
        ${isNew ? '' : '<p class="muted" style="margin:0;font-size:12px">Decommissioning hides the unit from call-outs but keeps its full service history.</p>'}</form>`;
  }

  function viewDocs() {
    return head('Documents', 'Site documentation') + `<div class="card"><div class="table-wrap"><table><thead><tr><th>Document</th><th>Type</th><th class="hide-sm">Size</th><th class="hide-sm">Updated</th><th></th></tr></thead><tbody>
      ${S.documents.map(d => `<tr><td>${ic('doc').replace('<svg', '<svg style="width:16px;height:16px;display:inline;vertical-align:-3px;margin-right:6px;fill:none;stroke:var(--cyan);stroke-width:1.7"')}${esc(d.name)}</td><td><span class="pill">${d.type}</span></td><td class="hide-sm">${d.size}</td><td class="hide-sm">${d.date}</td><td><button class="btn sm" data-action="doc">Open</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  /* ---------------- views: BMS ---------------- */
  const faultBtn = () => S.bms.fault ? `<a class="btn danger sm" href="#/bms/alarm/${S.bms.fault.alarm}">${ic('alert')}Fault in progress</a>` : canSim() ? `<button class="btn danger sm" data-action="fault">${ic('alert')}Simulate fault</button>` : '';
  const avgOf = arr => { const v = arr.filter(x => x != null && !isNaN(x)); return v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : null; };
  function viewOverview() {
    const b = S.bms, zs = b.zones, avg = avgOf(zs.map(z => z.temp));
    const act = activeAlarms().filter(a => a.building === ui.site);
    const run = arr => arr.filter(x => x.status === 'running').length;
    const tr = b.trend.slice(-60), ch = b.chillers.find(c => c.status === 'running') || b.chillers[0] || {};
    const chw = b.pumps.filter(p => /^CHWP/.test(p.id)), cw = b.pumps.filter(p => /^CWP/.test(p.id));
    const updated = b.updatedAt ? `Updated ${hhmm(b.updatedAt)}` : 'Waiting for data';
    return head('Site Overview', `${esc(site().name || '')} · live monitoring · ${updated}`, faultBtn()) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('thermo', 'Avg temperature', nv(avg), avg == null ? '' : '°C')}${kpi('wind', 'Avg humidity', nv(b.humidity), b.humidity == null ? '' : '%')}${kpi('eye', 'CO₂ level', nv(b.co2), b.co2 == null ? '' : 'ppm')}
        <div class="card kpi">${icS(act.length ? 'alert' : 'check')}<div><small>Overall status</small><strong style="color:${act.length ? 'var(--red)' : 'var(--accent)'}">${act.length ? 'Alarm' : 'Normal'}</strong></div></div></div>
      <div class="grid split">
        <div class="card flush"><div style="padding:10px 14px 0;display:flex;justify-content:space-between"><h3>${esc(site().name || '')} · Building BMS</h3><small>Tap a zone or unit</small></div><div class="scene">${bmsBuilding()}</div></div>
        <div class="grid" style="align-content:start">
          ${b.ahus.length ? `<div class="card"><header><h3>AHU overview</h3>${statusPill(b.ahus.some(a => a.status === 'tripped') ? 'Tripped' : 'Normal')}</header><dl class="kv"><dt>AHUs running</dt><dd>${run(b.ahus)}/${b.ahus.length}</dd><dt>Avg supply air</dt><dd>${nv(avgOf(b.ahus.filter(a => a.status === 'running').map(a => a.supplyTemp)), ' °C')}</dd><dt>Avg return air</dt><dd>${nv(avgOf(b.ahus.map(a => a.returnTemp)), ' °C')}</dd></dl></div>` : ''}
          ${b.chillers.length ? `<div class="card"><header><h3>Chilled water plant</h3>${statusPill(b.chillers.some(c => c.status === 'tripped') ? 'Tripped' : 'Normal')}</header><dl class="kv"><dt>CHW supply</dt><dd>${nv(ch.chws, ' °C')}</dd><dt>CHW return</dt><dd>${nv(ch.chwr, ' °C')}</dd><dt>Chillers</dt><dd>${run(b.chillers)} running</dd></dl></div>` : ''}
          ${zs.length ? `<div class="card"><header><h3>Zones${b.fcus.length ? ' & FCUs' : ''}</h3></header><dl class="kv">${b.fcus.length ? `<dt>FCUs online</dt><dd>${b.fcus.filter(f => f.status !== 'off').length}/${b.fcus.length}</dd>` : ''}<dt>Zones in comfort band</dt><dd>${zs.filter(z => zoneState(z) === 'Normal').length}/${zs.length}</dd></dl></div>` : ''}
        </div>
      </div>
      <div class="grid g3" style="margin-top:14px">
        ${b.pumps.length ? `<div class="card"><header><h3>Pumps</h3></header><dl class="kv">${chw.length ? `<dt>CHW pumps</dt><dd>${run(chw)}/${chw.length} running</dd>` : ''}${cw.length ? `<dt>Condenser pumps</dt><dd>${run(cw)}/${cw.length} running</dd>` : ''}<dt>All pumps</dt><dd>${run(b.pumps)}/${b.pumps.length} running</dd></dl></div>` : ''}
        ${b.towers.length ? `<div class="card"><header><h3>Cooling towers</h3></header><dl class="kv"><dt>Fans</dt><dd>${run(b.towers)}/${b.towers.length} running</dd><dt>Leaving water</dt><dd>${nv(b.towers[0].leaving, ' °C')}</dd></dl></div>` : ''}
        <div class="card"><header><h3>Plant performance</h3></header><div style="display:flex;justify-content:space-around;flex-wrap:wrap;gap:6px">${ch.load != null ? gauge(ch.load, 'Chillers') : ''}${b.ahus.length ? gauge(Math.round(run(b.ahus) / b.ahus.length * 100), 'AHUs') : ''}${b.pumps.length ? gauge(Math.round(run(b.pumps) / b.pumps.length * 100), 'Pumps') : ''}</div></div>
      </div>
      <div class="grid g2" style="margin-top:14px">
        ${tr.length > 1 ? `<div class="card"><header><h3>Temperature trend (°C)</h3></header>${lineChart({ series: [{ label: 'Supply air', color: 'var(--cyan)', data: tr.map(p => p.sat) }, { label: 'Zone avg', color: 'var(--accent)', data: tr.map(p => avgOf(Object.values(p.z || {}))) }], times: tr.map(p => p.t) })}</div>` : ''}
        <div class="card"><header><h3>BMS alarms</h3><a href="#/bms/alarms" class="muted">View all</a></header>${alarmTable(S.alarms.filter(a => a.building === ui.site).slice(0, 5))}</div>
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
            <dl class="kv" style="margin-top:10px"><dt>Load</dt><dd>${nv(c.load, ' %')}</dd><dt>CHWS / CHWR</dt><dd>${c.chws ?? '—'} / ${c.chwr ?? '—'} °C</dd></dl>
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
        <dl class="kv"><dt>Supply fan</dt><dd>${a.status === 'tripped' ? '<span style="color:var(--red)">Tripped</span>' : a.supplyHz ? nv(a.supplyHz) + ' Hz' : 'Off'}</dd><dt>Supply air</dt><dd>${nv(a.supplyTemp, ' °C')}</dd><dt>Return air</dt><dd>${nv(a.returnTemp, ' °C')}</dd><dt>CHW valve</dt><dd>${nv(a.chwValve, ' %')}</dd><dt>Filter ΔP</dt><dd>${nv(a.filterDp, ' Pa')}</dd></dl></a>`).join('')}</div>`;
  }
  function viewAhu(id) {
    const a = byId(S.bms.ahus, id);
    if (!a) return head('Unit not found');
    const card = (t, body) => `<div class="card"><header><h3>${t}</h3></header>${body}</div>`;
    return head(`${a.id} — ${a.name} ${statusPill(a.status)}`, '', `<div class="seg">${['Auto', 'Occupied', 'Unoccupied', 'Fire Mode', 'Maintenance'].map(m => `<button data-action="ahumode" data-id="${a.id}" data-v="${m}" class="${a.mode === m ? 'on' : ''}">${m}</button>`).join('')}</div>`) +
      `<div class="card flush ${a.status === 'tripped' ? 'alert' : ''}" style="margin-bottom:14px;background:#061013">${ahuDiagram(a)}</div>
      <div class="grid g4">
        ${card('Key temperatures', `<dl class="kv"><dt>Outside air</dt><dd>${nv(S.bms.outside, ' °C')}</dd><dt>Return air</dt><dd>${nv(a.returnTemp, ' °C')}</dd><dt>Mixed air</dt><dd>${nv(a.mixedTemp, ' °C')}</dd><dt>Supply air</dt><dd>${nv(a.supplyTemp, ' °C')}</dd></dl>`)}
        ${card('Fans & motors', `<dl class="kv"><dt>Supply fan</dt><dd>${a.status === 'tripped' ? '<span style="color:var(--red)">Tripped</span>' : nv(a.supplyHz, ' Hz')}</dd><dt>Return fan</dt><dd>${nv(a.returnHz, ' Hz')}</dd></dl>`)}
        ${card('Valves & coils', `<dl class="kv"><dt>CHW valve</dt><dd>${nv(a.chwValve, ' %')}</dd><dt>CHW in / out</dt><dd>${nv((S.bms.chillers[0] || {}).chws)} / ${nv((S.bms.chillers[0] || {}).chwr)} °C</dd><dt>Mixing damper</dt><dd>${nv(a.damper, ' %')}</dd></dl>`)}
        ${card('Filters & pressures', `<dl class="kv"><dt>Filter differential</dt><dd>${nv(a.filterDp, ' Pa')}</dd><dt>Supply duct static</dt><dd>${a.status === 'running' ? 349 : 0} Pa</dd><dt>Filter condition</dt><dd>${a.filterDp > 200 ? 'Dirty' : 'Clean · OK'}</dd></dl>`)}
      </div>`;
  }
  function viewFcus() {
    return head('FCU Units', `${S.bms.fcus.length} fan coil units online`) + `<div class="card"><div class="table-wrap"><table><thead><tr><th>Unit</th><th>Zone</th><th>Zone temp</th><th>Valve</th><th>Status</th></tr></thead><tbody>
      ${S.bms.fcus.map(f => { const z = byId(S.bms.zones, f.zone) || {}; return `<tr><td><strong>${f.id}</strong></td><td>${f.zone}</td><td class="mono">${nv(z.temp, ' °C')}</td><td style="min-width:110px"><div class="bar"><i style="width:${f.valve}%"></i></div><small>${nv(f.valve, ' %')}</small></td><td>${statusPill(f.status)}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }
  function viewTowers() {
    return head('Cooling Towers', 'Condenser water heat rejection') + `<div class="grid g2">${S.bms.towers.map(t => `<div class="card"><header><h2>${t.id}</h2>${statusPill(t.status)}</header>
      <dl class="kv"><dt>Fan speed</dt><dd>${nv(t.fan, ' %')}</dd><dt>Entering water</dt><dd>${nv(t.entering, ' °C')}</dd><dt>Leaving water</dt><dd>${nv(t.leaving, ' °C')}</dd><dt>Approach</dt><dd>${(t.leaving - 22).toFixed(1)} K</dd></dl><div class="bar" style="margin-top:10px"><i style="width:${t.fan}%"></i></div></div>`).join('')}</div>`;
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
    return head('Zone temperatures · live heat map', `Every zone is held within its comfort band of ${comfort()[0]}–${comfort()[1]} °C`, `<span class="pill ok">Comfort band ${comfort()[0]}–${comfort()[1]} °C</span>`) +
      (out.length ? `<div class="banner bad">${ic('alert').replace('<svg', '<svg style="width:20px;height:20px;fill:none;stroke:var(--red);stroke-width:2"')}<div class="grow"><strong>${out.length} zone${out.length > 1 ? 's' : ''} out of comfort band</strong><br><small>${out.map(z => `${z.id} ${nv(z.temp, ' °C')}`).join(' · ')}</small></div><a class="btn sm" href="#/bms/alarms">View alarms</a></div>` : `<div class="banner ok"><strong>All zones within comfort band</strong></div>`) +
      `<div class="grid split">
        <div class="card flush"><div class="scene">${bmsBuilding({ labels: true })}</div></div>
        <div class="card"><header><h3>Zones</h3><small>Tap to add to trend</small></header>
          <div class="heat">${[...new Set(zs.map(z => z.floor || 1))].sort((a, b) => b - a).map(f => `<div class="floor">Level ${f}</div>` + zs.filter(z => z.floor === f).map(z => {
            const st = zoneState(z), sel = ui.zoneSel.includes(z.id);
            return `<button data-action="zonesel" data-id="${z.id}" style="${st === 'High' ? 'border-color:var(--red);background:var(--red-dim)' : st === 'Low' ? 'border-color:#5b8cff;background:rgba(91,140,255,.15)' : ''};${sel ? 'box-shadow:0 0 0 2px var(--cyan) inset' : ''}"><small>Zone ${z.id}</small><strong>${nv(z.temp, '°')}</strong><small>SP ${z.setpoint != null ? (+z.setpoint).toFixed(1) : '—'} · ${st}</small></button>`;
          }).join('')).join('')}</div></div>
      </div>
      <div class="card" style="margin-top:14px"><header><h3>Zone temperature trend · live</h3>${canSim() ? '<div class="seg"><button data-action="sp" data-v="-0.5">SP −0.5</button><button data-action="sp" data-v="0.5">SP +0.5</button></div>' : ''}</header>
        ${lineChart({ series: ui.zoneSel.map((id, i) => ({ label: 'Zone ' + id, color: colors[i % 4], data: tr.map(p => (p.z || {})[id]) })), times: tr.map(p => p.t), min: comfort()[0] - 4, max: comfort()[1] + 6, band: comfort(), unit: '°' })}
        <small>${canSim() ? 'Set-point buttons adjust the selected zones.' : 'Monitoring is read-only: set-points are changed on the BMS.'}</small></div>`;
  }
  function alarmDetail(a) {
    const job = a.jobId && byId(S.jobs, a.jobId);
    const zid = a.zone || ((/Zone ([\w-]+)/.exec(a.impact || '') || [])[1]) || (S.bms.zones.find(z => zoneState(z) === 'High' || zoneState(z) === 'Low') || {}).id;
    const z = zid && a.building === ui.site ? byId(S.bms.zones, zid) : null;
    const tr = S.bms.trend.slice(-60);
    const closed = a.status !== 'Active';
    const [lo, hi] = comfort();
    const ns = n => n.status === 'failed' ? `<span class="pill bad" title="${esc(n.error || '')}">FAILED</span>` : n.status === 'queued' ? '<span class="pill warn">SENDING…</span>' : `<span class="pill ok">SENT ${hhmm(n.at)}</span>`;
    return `${closed ? `<div class="banner ok"><strong>ALARM CLOSED${job ? ' · ' + job.id : ''}</strong><span class="grow"></span><small>Full audit trail saved to asset record</small></div>` : `<div class="banner bad"><strong class="pulse">● Fault detected · ${esc(a.equip)}</strong><span class="grow">${esc(a.desc)}</span>${job ? `<a class="btn sm" href="#/service/job/${job.id}">Open ${job.id}</a>` : ''}${isStaff() ? `<button class="btn sm" data-action="clearalarm" data-id="${a.id}">Clear manually</button>` : ''}</div>`}
      <div class="grid split">
        <div class="grid" style="align-content:start">
          ${a.building === ui.site && !noBms() ? `<div class="card flush"><div class="scene">${bmsBuilding()}</div></div>` : ''}
          ${z && tr.length > 1 ? `<div class="card"><header><h3>Zone ${esc(z.id)} temperature${closed ? '' : ' · live'}</h3>${statusPill(zoneState(z) === 'Normal' ? 'Normal' : 'High')}</header>${lineChart({ series: [{ label: z.id, color: zoneState(z) === 'Normal' ? 'var(--accent)' : 'var(--red)', data: tr.map(p => (p.z || {})[z.id]) }], times: tr.map(p => p.t), min: lo - 4, max: hi + 6, band: [lo, hi], unit: '°' })}</div>` : ''}
          <div class="card"><header><h3>Alarm history</h3><small>Full audit trail</small></header>${timeline(a.history.map((h, i) => ({ ...h, icon: i === 0 ? 'alert' : 'check', cls: i === 0 ? 'bad' : 'done' })))}</div>
        </div>
        <div class="grid" style="align-content:start">
          <div class="card ${closed ? '' : 'alert'}"><header><h3>Alarm sent to Bothelec</h3><small class="mono">${hhmm(a.at)}</small></header><dl class="kv"><dt>Building</dt><dd>${esc(bld(a.building).name)}</dd><dt>Unit</dt><dd>${esc(a.unit || a.equip)}</dd><dt>Priority</dt><dd>${esc(a.priority)}</dd>${a.reading ? `<dt>Reading</dt><dd style="color:var(--red)">${esc(a.reading)}</dd>` : ''}${a.impact ? `<dt>Impact</dt><dd>${esc(a.impact)}</dd>` : ''}<dt>Time</dt><dd>${dmy(a.at)} · ${new Date(a.at).toLocaleTimeString('en-GB')}</dd></dl></div>
          ${a.response && a.response.length ? `<div class="card"><header><h3>Automated response</h3></header>${timeline(a.response.map((r, i) => ({ ...r, icon: ['alert', 'phone', 'users'][i] || 'check', cls: i === 0 ? 'bad' : 'done' })))}</div>` : ''}
          ${a.notified && a.notified.length ? `<div class="card"><header><h3>Notifications sent</h3><small>SMS & email</small></header><div class="rows">${a.notified.map(n => `<div class="row">${icS(n.channel === 'SMS' ? 'phone' : 'bell')}<div class="grow"><strong>${esc(n.role)} · ${esc(n.channel)}</strong><small>${esc(n.to || '')}</small></div>${ns(n)}</div>`).join('')}</div></div>` : ''}
        </div>
      </div>`;
  }
  function viewAlarms() {
    const list = S.alarms.filter(a => a.building === ui.site);
    const act = list.filter(a => a.status === 'Active');
    const fault = S.bms.fault && byId(S.alarms, S.bms.fault.alarm);
    return head('Alarms', `${esc(site().name || '')} · equipment trips, lost sensors and zones out of control reach Bothelec straight away`, faultBtn()) +
      `<div class="card" style="margin-bottom:14px"><header><h3>${act.length ? act.length + ' active' : 'No active alarms'}</h3></header>${alarmTable(list)}</div>` +
      (fault ? alarmDetail(fault) : '');
  }
  function viewAlarm(id) {
    const a = byId(S.alarms, id);
    if (!a) return head('Alarm not found');
    if (a.building !== ui.site) { setTimeout(() => switchSite(a.building), 0); }
    return head(`${esc(a.equip)} · ${esc(a.desc)}`, esc(bld(a.building).name), `<a class="btn sm" href="#/bms/alarms">${ic('back')}All alarms</a>`) + alarmDetail(a);
  }
  function viewTrends() {
    const tr = S.bms.trend, t = tr.map(p => p.t), zs = S.bms.zones;
    return head('Trends', `Last ${tr.length} samples · live`) + `<div class="grid g2">
      <div class="card"><header><h3>Zone temperatures (°C)</h3></header>${lineChart({ series: [{ label: 'Max', color: 'var(--red)', data: tr.map(p => { const v = Object.values(p.z || {}); return v.length ? Math.max(...v) : null; }) }, { label: 'Average', color: 'var(--accent)', data: tr.map(p => avgOf(Object.values(p.z || {}))) }, { label: 'Min', color: 'var(--cyan)', data: tr.map(p => { const v = Object.values(p.z || {}); return v.length ? Math.min(...v) : null; }) }], times: t, band: [20, 24], min: 16, max: 30 })}</div>
      <div class="card"><header><h3>Chilled water (°C)</h3></header>${lineChart({ series: [{ label: 'Supply', color: 'var(--cyan)', data: tr.map(p => p.chws) }, { label: 'Return', color: 'var(--amber)', data: tr.map(p => p.chwr) }], times: t, min: 4, max: 14 })}</div>
      <div class="card"><header><h3>Supply air (°C)</h3></header>${lineChart({ series: [{ label: 'Avg supply air', color: 'var(--cyan)', data: tr.map(p => p.sat) }], times: t, min: 10, max: 18 })}</div>
      <div class="card"><header><h3>CO₂ (ppm)</h3></header>${lineChart({ series: [{ label: 'CO₂', color: '#c792ea', data: tr.map(p => p.co2) }], times: t, min: 400, max: 1000 })}</div></div>`;
  }
  function viewPoints() {
    const b = S.bms, rows = [];
    b.ahus.forEach(a => {
      rows.push([a.id + '.SF.STS', a.id + ' supply fan status', a.status === 'tripped' ? 'TRIPPED' : a.supplyHz ? 'ON' : 'OFF', 'DI']);
      rows.push([a.id + '.SF.HZ', a.id + ' supply fan speed', nv(a.supplyHz) + ' Hz', 'AI']);
      rows.push([a.id + '.SAT', a.id + ' supply air temp', nv(a.supplyTemp) + ' °C', 'AI']);
      rows.push([a.id + '.RAT', a.id + ' return air temp', nv(a.returnTemp) + ' °C', 'AI']);
      rows.push([a.id + '.CHWV', a.id + ' CHW valve', nv(a.chwValve) + ' %', 'AO']);
      rows.push([a.id + '.FLT.DP', a.id + ' filter ΔP', nv(a.filterDp) + ' Pa', 'AI']);
    });
    b.zones.forEach(z => { rows.push(['ZN.' + z.id + '.T', 'Zone ' + z.id + ' temperature', z.temp + ' °C', 'AI']); rows.push(['ZN.' + z.id + '.SP', 'Zone ' + z.id + ' set-point', z.setpoint.toFixed(1) + ' °C', 'AV']); });
    b.chillers.forEach(c => { rows.push([c.id + '.STS', c.id + ' status', c.status.toUpperCase(), 'DI']); rows.push([c.id + '.LOAD', c.id + ' load', c.load + ' %', 'AI']); });
    b.pumps.forEach(p => rows.push([p.id + '.STS', p.id + ' status', p.status.toUpperCase(), 'DI']));
    return head('Point Register', `${rows.length} BMS points`, `<input type="search" placeholder="Filter points…" data-filter="points" style="padding:8px 12px;background:var(--bg2);border:1px solid var(--line2);border-radius:8px;font-size:16px;min-width:0;flex:1;max-width:280px">`) +
      `<div class="card"><div class="table-wrap"><table id="points"><thead><tr><th>Point</th><th class="hide-sm">Description</th><th>Value</th><th>Type</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="mono"><strong>${r[0]}</strong></td><td class="hide-sm">${r[1]}</td><td class="mono" style="${r[2] === 'TRIPPED' ? 'color:var(--red)' : ''}">${r[2]}</td><td><span class="pill">${r[3]}</span></td></tr>`).join('')}</tbody></table></div></div>`;
  }

  /* ---------------- views: settings (admin) ---------------- */
  const CONNECTOR_EXAMPLES = {
    none: { type: 'none' },
    simulator: { type: 'simulator' },
    modbus: { type: 'modbus', host: '10.8.0.20', port: 502, unitId: 1, intervalSec: 15, staleMinutes: 10, points: [
      { path: 'ahus.AHU-01.status', fc: 1, address: 0, map: { true: 'running', false: 'off' } },
      { path: 'ahus.AHU-01.supplyTemp', fc: 3, address: 100, type: 'int16', scale: 0.1 },
      { path: 'zones.L1-W.temp', fc: 4, address: 10, type: 'float32', wordOrder: 'BE' }] },
    bacnet: { type: 'bacnet', host: '10.8.0.30', port: 47808, intervalSec: 15, staleMinutes: 10, points: [
      { path: 'zones.L1-W.temp', objectType: 'analogInput', instance: 1 },
      { path: 'ahus.AHU-01.status', objectType: 'binaryValue', instance: 3, map: { 0: 'off', 1: 'running' } },
      { path: 'chillers.CH-01.chws', objectType: 'analogInput', instance: 20, network: 2, mac: 5 }] },
    mqtt: { type: 'mqtt', url: 'mqtt://localhost:1883', username: 'site-b1', password: 'change-me', topic: 'bothelec/B1/#', staleMinutes: 10,
      jsonMap: { t_l1w: 'zones.L1-W.temp', ahu1_run: { path: 'ahus.AHU-01.status', map: { 0: 'off', 1: 'running', 2: 'tripped' } } } },
    http: { type: 'http', staleMinutes: 10, keyMap: { t_l1w: 'zones.L1-W.temp', ahu1_run: 'ahus.AHU-01.status' } },
  };
  const GSM_EXAMPLE = { numbers: ['+27821234567'], rules: [{ match: 'AHU.?2.*TRIP', priority: 'Critical', equip: 'AHU-02', desc: 'Supply fan tripped' }, { match: 'RESTORE|NORMAL', clear: true }] };
  const pre = o => esc(JSON.stringify(o, null, 2));
  const field = (label, name, val, type = 'text', extra = '') => `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(val == null ? '' : val)}" ${extra}></div>`;
  const okPill = (ok, yes = 'Configured', no = 'Not configured') => `<span class="pill ${ok ? 'ok' : 'bad'}"><i></i>${ok ? yes : no}</span>`;

  function viewSettings() {
    const A = S.admin, n = A.notifier || {}, st = A.settings;
    return head('SMS & email', 'Notification channels and who gets notified') +
      `<div class="grid g2">
        <div class="card"><header><h2>SMS</h2>${okPill(n.sms && n.sms.configured)}</header><dl class="kv"><dt>Provider</dt><dd>${esc(n.sms && n.sms.provider)}</dd><dt>Detail</dt><dd>${esc(n.sms && n.sms.detail)}</dd></dl>
          <form class="form" data-form="test" style="margin-top:12px"><input type="hidden" name="channel" value="sms"><div class="field"><label>Send a test SMS to</label><input name="to" placeholder="082 123 4567" required></div><button class="btn sm">Send test SMS</button></form></div>
        <div class="card"><header><h2>Email</h2>${okPill(n.email && n.email.configured)}</header><dl class="kv"><dt>Provider</dt><dd>${esc(n.email && n.email.provider)}</dd><dt>From</dt><dd>${esc(n.email && n.email.detail)}</dd></dl>
          <form class="form" data-form="test" style="margin-top:12px"><input type="hidden" name="channel" value="email"><div class="field"><label>Send a test email to</label><input name="to" type="email" required></div><button class="btn sm">Send test email</button></form></div>
      </div>
      <p class="muted" style="font-size:12px">Provider accounts and passwords are set in the server's <code>.env</code> file (never in the browser). Queued: ${n.queued || 0} · failed in last 24 h: ${n.failed24h || 0} · <a href="#/settings/outbox">message log</a></p>
      <div class="grid g2" style="margin-top:14px">
        <form class="card form" data-form="desk"><header><h2>Bothelec service desk</h2></header>
          ${field('Service desk mobile (SMS alerts)', 'phone', st.desk.phone, 'tel')}${field('Service desk email', 'email', st.desk.email, 'email')}${field('Default technician ETA (minutes)', 'etaMinutes', st.etaMinutes, 'number', 'min="5" max="240"')}
          <button class="btn primary">Save</button></form>
        <div class="card"><header><h2>Inbound SMS (GSM alarm modems)</h2></header>
          <p style="margin-top:0">Buildings with a GSM alarm dialler/modem can text alarms to your BulkSMS inbound number (or a Teltonika router can forward SMS). Set the webhook to:</p>
          <code style="word-break:break-all;display:block;padding:8px;background:var(--bg2);border-radius:6px">${esc(location.origin)}/api/hooks/sms-inbound?token=&lt;WEBHOOK_TOKEN from .env&gt;</code>
          <p class="muted" style="font-size:12px">Then list the modem's phone number under the building's GSM settings.</p></div>
      </div>
      <form class="card form" data-form="policy" style="margin-top:14px"><header><h2>Notification policy</h2></header>
        <p class="muted" style="margin:0;font-size:12px">Roles: manager, ops, desk, tech, caller. <code>smsIfUrgent</code> only applies to High/Critical calls.</p>
        <textarea name="policy" rows="22" style="font-family:ui-monospace,monospace;font-size:13px;width:100%;padding:10px;background:var(--bg2);border:1px solid var(--line2);border-radius:8px">${pre(st.policy)}</textarea>
        <button class="btn primary">Save policy</button></form>`;
  }
  function viewSettingsBuildings() {
    const C = S.admin.connectors || {};
    return head('Buildings & BMS links', 'Each building can connect a different way', `<a class="btn primary sm" href="#/settings/building/new">${ic('plus')}Add building</a>`) +
      `<div class="card"><div class="table-wrap"><table><thead><tr><th>Building</th><th>BMS link</th><th>Status</th><th class="hide-sm">Last data</th></tr></thead><tbody>
      ${S.buildings.map(b => { const c = C[b.id] || {}, t = (b.connector || {}).type || 'none'; return `<tr class="click" data-href="#/settings/building/${b.id}"><td><strong>${esc(b.name)}</strong><br><small>${esc(b.client || '')}</small></td><td>${esc(t)}${(b.gsm || {}).numbers && b.gsm.numbers.length ? ' + GSM' : ''}</td><td>${t === 'none' ? '<span class="pill off">Off</span>' : c.error ? `<span class="pill bad" title="${esc(c.error)}"><i></i>Error</span>` : c.lastSeen ? '<span class="pill ok"><i></i>Receiving</span>' : '<span class="pill warn"><i></i>Waiting</span>'}<br><small>${esc(c.error || c.detail || '')}</small></td><td class="hide-sm mono">${c.lastSeen ? hhmm(c.lastSeen) : '—'}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }
  function viewSettingsBuilding(id) {
    const b = id === 'new' ? { name: '', equipment: ['Other / not sure'], locations: ['Plant room'], autoCall: true, comfort: [20, 24], connector: { type: 'none' } } : byId(S.buildings, id);
    if (!b) return head('Building not found');
    const c = (S.admin.connectors || {})[b.id] || {};
    const ingest = `${location.origin}/api/ingest/${b.id}`;
    return head(id === 'new' ? 'Add building' : esc(b.name), id === 'new' ? '' : 'Contacts, alarm rules and BMS connection', `<a class="btn sm" href="#/settings/buildings">${ic('back')}All buildings</a>`) +
      `<form class="form" data-form="building" data-id="${id === 'new' ? '' : b.id}"><div class="grid g2">
        <div class="card form"><header><h2>Building & contacts</h2></header>
          ${field('Building name', 'name', b.name, 'text', 'required')}${field('Client', 'client', b.client)}${field('Area', 'area', b.area)}${field('Client PO portal (e.g. Vantage)', 'portal', b.portal)}
          <div class="field"><label>Services for this building</label><div class="radio-row"><label><input type="checkbox" name="divisions" value="aircon" ${(b.divisions || ['aircon']).includes('aircon') ? 'checked' : ''}><span>Bothelec Aircon Solutions</span></label><label><input type="checkbox" name="divisions" value="utility" ${(b.divisions || []).includes('utility') ? 'checked' : ''}><span>Bothelec Utility Management</span></label></div></div>
          <div class="field"><label>Building & operations managers</label>${id === 'new' ? '<p class="muted" style="margin:4px 0">Add contacts after saving the building.</p>' : contactList(b) + `<a class="btn sm" href="#/service/building/${b.id}" style="width:max-content">${ic('users')}Manage contacts</a>`}</div>
          <div class="grid g2">${field('Comfort band low (°C)', 'comfortLo', (b.comfort || [20, 24])[0], 'number', 'step="0.5"')}${field('Comfort band high (°C)', 'comfortHi', (b.comfort || [20, 24])[1], 'number', 'step="0.5"')}</div>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="autoCall" ${b.autoCall !== false ? 'checked' : ''}> Raise a service call automatically for critical alarms</label>
          <div class="field"><label>Equipment</label>${id === 'new' ? '<p class="muted" style="margin:4px 0">Add units after saving the building.</p>' : `<p style="margin:4px 0">${(b.units || []).filter(u => !u.removed).length} units registered.</p><a class="btn sm" href="#/service/equipment/${b.id}" style="width:max-content">${ic('fcu')}Equipment & service history</a>`}</div>
          <div class="field"><label>Locations (one per line)</label><textarea name="locations" rows="4">${esc((b.locations || []).join('\n'))}</textarea></div>
        </div>
        <div class="grid" style="align-content:start">
          <div class="card form"><header><h2>BMS connection</h2>${id === 'new' ? '' : (c.error ? `<span class="pill bad">Error</span>` : c.lastSeen ? `<span class="pill ok">Data ${hhmm(c.lastSeen)}</span>` : '')}</header>
            ${c.error ? `<div class="banner bad" style="margin:0"><small>${esc(c.error)}</small></div>` : ''}
            <div class="field"><label>Start from a template</label><select data-change="conntpl"><option value="">— choose —</option>${Object.keys(CONNECTOR_EXAMPLES).map(k => `<option>${k}</option>`).join('')}</select></div>
            <div class="field"><label>Connector settings (JSON)</label><textarea name="connector" rows="14" style="font-family:ui-monospace,monospace;font-size:12.5px">${pre(b.connector || { type: 'none' })}</textarea></div>
            <details><summary class="muted" style="cursor:pointer">Which one do I use?</summary><div style="font-size:13px;line-height:1.5">
              <p><b>modbus</b> — BMS controller or Modbus gateway reachable on Modbus TCP (direct, via VPN, or via the 4G router's port forward).</p>
              <p><b>bacnet</b> — BACnet/IP controller reachable over VPN. Use <code>network</code>/<code>mac</code> for MS/TP devices behind a BACnet router.</p>
              <p><b>mqtt</b> — 4G router or gateway publishing readings to an MQTT broker (Teltonika Modbus→MQTT, Node-RED, etc.).</p>
              <p><b>http</b> — router/gateway or the on-site <b>edge agent</b> POSTs readings to the URL below. Best when the site can't accept inbound connections.</p>
              <p>Paths: <code>zones.&lt;id&gt;.temp</code>, <code>ahus.&lt;id&gt;.status|supplyTemp|returnTemp|supplyHz|chwValve|damper|filterDp</code>, <code>chillers.&lt;id&gt;.status|load|chws|chwr</code>, <code>pumps.&lt;id&gt;.status|hz</code>, <code>towers.&lt;id&gt;.status|fan|leaving</code>, <code>fans.&lt;id&gt;.status</code>, <code>humidity</code>, <code>co2</code>, <code>outside</code>. A status of <code>tripped</code> raises a critical alarm and a service call.</p></div></details>
          </div>
          ${id === 'new' ? '' : `<div class="card"><header><h2>Data upload (http / edge agent)</h2></header>
            <div class="field"><label>URL</label><code style="word-break:break-all">${esc(ingest)}</code></div>
            <div class="field" style="margin-top:8px"><label>Token (Authorization: Bearer …)</label><code style="word-break:break-all">${esc(b.ingestToken || '')}</code></div>
            <label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" name="regenToken"> Generate a new token on save</label></div>`}
          <div class="card form"><header><h2>GSM alarm modem (inbound SMS)</h2></header>
            <div class="field"><label>Modem numbers & text rules (JSON)</label><textarea name="gsm" rows="9" style="font-family:ui-monospace,monospace;font-size:12.5px">${pre(b.gsm || { numbers: [], rules: [] })}</textarea></div>
            <small class="muted">Example: ${esc(JSON.stringify(GSM_EXAMPLE))}</small></div>
        </div></div>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn primary">${ic('check')}Save building</button>${id === 'new' ? '' : `<button type="button" class="btn danger" data-action="delbuilding" data-id="${b.id}">Delete building</button>`}</div>
      </form>`;
  }
  function viewSettingsUsers() {
    return head('Users', 'Who can sign in', `<a class="btn primary sm" href="#/settings/user/new">${ic('plus')}Add user</a>`) +
      `<div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th class="hide-sm">Buildings</th></tr></thead><tbody>
      ${S.admin.users.map(u => `<tr class="click" data-href="#/settings/user/${u.id}"><td><strong>${esc(u.name)}</strong></td><td>${esc(u.email)}</td><td><span class="pill">${esc({ admin: 'Admin', desk: 'Service desk', tech: 'Technician', client: 'Client' }[u.role])}</span></td><td class="hide-sm"><small>${u.role === 'client' ? esc((u.buildings || []).map(id => bld(id).name).join(', ') || '—') : 'All'}</small></td></tr>`).join('')}
      </tbody></table></div></div>
      <p class="muted" style="font-size:12px">Admin: everything incl. settings · Service desk: all jobs, alarms, fleet · Technician: own jobs + monitoring · Client: their own buildings only (log calls, follow jobs, see their BMS).</p>`;
  }
  function viewSettingsUser(id) {
    const u = id === 'new' ? { role: 'client', buildings: [] } : byId(S.admin.users, id);
    if (!u) return head('User not found');
    return head(id === 'new' ? 'Add user' : esc(u.name), '', `<a class="btn sm" href="#/settings/users">${ic('back')}All users</a>`) +
      `<form class="card form" data-form="user" data-id="${id === 'new' ? '' : u.id}" style="max-width:640px">
        ${field('Name', 'name', u.name, 'text', 'required')}${field('Email (login)', 'email', u.email, 'email', 'required')}${field('Mobile', 'phone', u.phone, 'tel')}
        <div class="field"><label>Role</label><select name="role">${[['client', 'Client'], ['tech', 'Technician'], ['desk', 'Service desk'], ['admin', 'Admin']].map(([v, l]) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Technician record (technicians only)</label><select name="techId"><option value="new">Create a new technician record</option>${S.technicians.map(t => { const other = S.admin.users.find(x => x.techId === t.id && x.id !== u.id); return `<option value="${t.id}" ${u.techId === t.id ? 'selected' : ''} ${other ? 'disabled' : ''}>${esc(t.name)}${other ? ' (linked to ' + esc(other.email) + ')' : ''}</option>`; }).join('')}</select></div>
        <div class="field"><label>Buildings (clients only)</label><div class="radio-row">${S.buildings.map(b => `<label><input type="checkbox" name="buildings" value="${b.id}" ${(u.buildings || []).includes(b.id) ? 'checked' : ''}><span>${esc(b.name)}</span></label>`).join('')}</div></div>
        ${field(id === 'new' ? 'Password (min 8 characters)' : 'New password (leave blank to keep)', 'password', '', 'password', id === 'new' ? 'required minlength="8" autocomplete="new-password"' : 'minlength="8" autocomplete="new-password"')}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">${ic('check')}Save user</button>${id === 'new' ? '' : `<button type="button" class="btn danger" data-action="deluser" data-id="${u.id}">Delete user</button>`}</div></form>`;
  }
  function viewOutbox() {
    setTimeout(async () => {
      const el = $('#outbox'); if (!el) return;
      try {
        const list = await api('GET', '/api/admin/outbox');
        el.innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Channel</th><th>To</th><th>Message</th><th>Status</th></tr></thead><tbody>${list.map(m => `<tr><td class="mono">${hhmm(m.createdAt)}<br><small>${dmy(m.createdAt)}</small></td><td>${m.channel === 'sms' ? 'SMS' : 'Email'}</td><td><small>${esc(m.to)}</small></td><td><small>${esc(m.subject || m.text || '').slice(0, 120)}</small>${m.error ? `<br><small style="color:var(--red)">${esc(m.error)}</small>` : ''}</td><td>${m.status === 'sent' ? '<span class="pill ok">Sent</span>' : m.status === 'queued' ? `<span class="pill warn">Queued${m.attempts ? ' · retry ' + m.attempts : ''}</span>` : `<span class="pill bad">Failed</span> <button class="btn sm" data-action="retry" data-id="${m.id}">Retry</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No messages sent yet.</div>';
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    }, 0);
    return head('Message log', 'Every SMS and email the system sent, with delivery status', `<a class="btn sm" href="#/settings/outbox">Refresh</a>`) + `<div class="card" id="outbox"><div class="empty">Loading…</div></div>`;
  }
  function viewAccount() {
    return head('My account', `${esc(S.me.name)} · ${esc(S.me.email)}`) +
      `<form class="card form" data-form="password" style="max-width:480px"><header><h2>Change password</h2></header>
        ${field('Current password', 'current', '', 'password', 'required autocomplete="current-password"')}${field('New password (min 8 characters)', 'password', '', 'password', 'required minlength="8" autocomplete="new-password"')}
        <button class="btn primary">Update password</button></form>
      <div class="card" style="max-width:480px;margin-top:14px"><header><h2>${esc(S.me.name)}</h2><span class="pill">${esc({ admin: 'Admin', desk: 'Service desk', tech: 'Technician', client: 'Client' }[S.me.role] || S.me.role)}</span></header>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-action="tour">${ic('eye')}Product tour</button><button class="btn danger" data-action="logout">${ic('back')}Sign out</button></div></div>`;
  }

  /* ---------------- views: vehicles, dispatch, assessments ---------------- */
  function viewVehicles() {
    return head('Vehicles', 'Fleet status') + `<div class="grid g4" style="margin-bottom:14px">${kpi('truck', 'Vehicles', S.vehicles.length)}${kpi('route', 'In transit', S.vehicles.filter(v => v.status === 'in transit').length)}${kpi('pin', 'On site', S.vehicles.filter(v => v.status === 'on site').length)}${kpi('clock', 'Parked', S.vehicles.filter(v => v.status === 'parked').length)}</div>
      <div class="grid g2">${S.vehicles.map(v => `<div class="card"><header><h2>${esc(v.reg)}</h2>${statusPill(v.status)}</header><small>${esc(v.model)}</small>
        <dl class="kv" style="margin-top:10px"><dt>Driver</dt><dd>${esc((tech(v.driver) || {}).name || '—')}</dd><dt>Location</dt><dd>${esc(v.location)}</dd><dt>Odometer</dt><dd>${v.odo != null ? (+v.odo).toLocaleString() + ' km' : '—'}</dd></dl>
        <div style="margin-top:10px"><small>Fuel ${v.fuel}%</small><div class="bar"><i style="width:${v.fuel}%;${v.fuel < 25 ? 'background:var(--red)' : ''}"></i></div></div></div>`).join('')}</div>`;
  }
  const TRIP_FLOW = ['Scheduled', 'In transit', 'Delivered'];
  function viewDispatch() {
    return head('Driver Dispatch', 'Parts, equipment and refrigerant movements', `<a class="btn primary sm" href="#/dispatch/new">${ic('plus')}New trip</a>`) +
      `<div class="card"><div class="table-wrap"><table><thead><tr><th>Trip</th><th>Load</th><th class="hide-sm">Route</th><th>Driver</th><th>Status</th><th></th></tr></thead><tbody>
      ${S.trips.map(t => { const i = TRIP_FLOW.indexOf(t.status); return `<tr><td><strong>${t.id}</strong><br><small class="mono">${hhmm(t.at)}</small></td><td>${esc(t.what)}</td><td class="hide-sm"><small>${esc(t.from)} →<br>${esc(t.to)}</small></td><td>${esc((tech(t.driver) || {}).name || '—')}</td><td>${statusPill(t.status)}</td><td>${i < 2 ? `<button class="btn sm" data-action="trip" data-id="${t.id}">${i === 0 ? 'Depart' : 'Delivered'}</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  }
  function viewDispatchNew() {
    const places = ['Bothelec depot', ...S.buildings.map(b => b.name), 'Supplier — Isando'];
    return head('New trip') + `<form class="card form" data-form="trip" style="max-width:640px">
      <div class="field"><label>Load / description</label><input name="what" required placeholder="e.g. Replacement fan motor"></div>
      <div class="grid g2"><div class="field"><label>From</label><select name="from">${places.map(p => `<option>${esc(p)}</option>`).join('')}</select></div>
      <div class="field"><label>To</label><select name="to">${places.map((p, i) => `<option ${i === 1 ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div></div>
      <div class="grid g2">${isTech() ? `<input type="hidden" name="driver" value="${S.me.techId || ''}">` : ''}<div class="field" ${isTech() ? 'style="display:none"' : ''}><label>Driver</label><select name="driver">${S.technicians.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
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

  /* ---------------- parts & labour, invoicing ---------------- */
  const LINE_KINDS = ['Call-out', 'Labour', 'Part', 'Other'];
  const B = () => S.billing || { vatRate: 15, pricesIncludeVat: false, currency: 'ZAR', catalogue: [] };
  /* A unit rate: up to 4 decimals (R 3.8052), at least 2 (R 73.72). */
  const fmtRate = n => { const [a, d] = (Math.round((+n || 0) * 10000) / 10000).toFixed(4).split('.'); return fmtMoney(0).replace('0.00', '') + a.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + d.replace(/0{1,2}$/, ''); };
  const fmtMoney = n => (B().currency === 'ZAR' ? 'R ' : B().currency + ' ') + (Math.round((+n || 0) * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function calcTotals(lines) {
    const r = n => Math.round(n * 100) / 100, sum = r((lines || []).reduce((a, l) => a + (+l.qty || 0) * (+l.unitPrice || 0), 0)), v = B().vatRate;
    if (B().pricesIncludeVat) { const vat = r(sum - sum / (1 + v / 100)); return { subtotal: r(sum - vat), vat, total: sum }; }
    const vat = r(sum * v / 100); return { subtotal: sum, vat, total: r(sum + vat) };
  }
  const totalsHtml = lines => { const t = calcTotals(lines); return `<dl class="kv ltotals"><dt>Subtotal${B().pricesIncludeVat ? ' (excl. VAT)' : ''}</dt><dd>${fmtMoney(t.subtotal)}</dd><dt>VAT ${B().vatRate}%</dt><dd>${fmtMoney(t.vat)}</dd><dt><strong>Total</strong></dt><dd><strong>${fmtMoney(t.total)}</strong></dd></dl>`; };
  const lineRow = (l = {}) => `<div class="lrow" data-line><input type="hidden" name="l_id" value="${esc(l.id || '')}"><input type="hidden" name="l_code" value="${esc(l.code || '')}">
      <select name="l_kind" aria-label="Type">${LINE_KINDS.map(k => `<option ${l.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
      <input name="l_desc" list="catalogueList" value="${esc(l.description || '')}" placeholder="Description" aria-label="Description">
      <input name="l_qty" type="number" step="0.25" min="0" value="${l.qty ?? 1}" aria-label="Quantity">
      <input name="l_price" type="number" step="0.01" min="0" value="${l.unitPrice ?? ''}" placeholder="0.00" aria-label="Unit price">
      <span class="ltotal">${fmtMoney((+l.qty || 0) * (+l.unitPrice || 0))}</span>
      <button type="button" class="btn sm" data-action="rmline" aria-label="Remove line">${ic('x')}</button></div>`;
  function linesEditor(lines) {
    return `<div data-lines><div class="lrow lhead"><span>Type</span><span>Item</span><span>Qty</span><span>Unit price</span><span>Total</span><span></span></div>
      <div class="lbody">${(lines || []).map(lineRow).join('')}</div>
      <datalist id="catalogueList">${B().catalogue.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><select data-change="addcat" aria-label="Add from price list" style="padding:7px 10px;background:var(--bg2);border:1px solid var(--line2);border-radius:8px;max-width:100%"><option value="">+ Add from price list…</option>${B().catalogue.map(c => `<option value="${esc(c.code)}">${esc(c.name)} · ${fmtMoney(c.rate)}/${esc(c.unit)}</option>`).join('')}</select><button type="button" class="btn sm" data-action="addline">${ic('plus')}Blank line</button></div>
      <div class="ltot">${totalsHtml(lines)}</div></div>`;
  }
  function readLines(root) {
    return [...root.querySelectorAll('[data-line]')].map(r => ({ id: r.querySelector('[name=l_id]').value, code: r.querySelector('[name=l_code]').value, kind: r.querySelector('[name=l_kind]').value, description: r.querySelector('[name=l_desc]').value.trim(), qty: +r.querySelector('[name=l_qty]').value, unitPrice: +r.querySelector('[name=l_price]').value })).filter(l => l.description);
  }
  function refreshLineTotals(root) {
    root.querySelectorAll('[data-line]').forEach(r => { r.querySelector('.ltotal').textContent = fmtMoney((+r.querySelector('[name=l_qty]').value || 0) * (+r.querySelector('[name=l_price]').value || 0)); });
    root.querySelector('.ltot').innerHTML = totalsHtml(readLines(root));
  }
  function linesTable(lines) {
    if (!lines || !lines.length) return '<p class="muted" style="margin:4px 0">No parts or labour recorded.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th style="text-align:right">Total</th></tr></thead><tbody>${lines.map(l => `<tr><td>${esc(l.description)}<br><small>${esc(l.kind)}</small></td><td class="mono">${l.qty}</td><td class="mono">${fmtMoney(l.unitPrice)}</td><td class="mono" style="text-align:right">${fmtMoney(l.qty * l.unitPrice)}</td></tr>`).join('')}</tbody></table></div>${totalsHtml(lines)}`;
  }
  function invoiceLine(rec, kind) {
    const inv = rec.invoice, lines = (rec.billing || {}).lines || [];
    if (inv && inv.id) return `<div class="banner ok" style="margin:10px 0 0"><span class="grow">${ic('doc').replace('<svg', '<svg style="width:16px;height:16px;display:inline;vertical-align:-3px;fill:none;stroke:currentColor;stroke-width:1.8"')} Zoho Books draft invoice <strong>${esc(inv.number || '')}</strong> · ${dmy(inv.at)}</span>${isStaff() && inv.url ? `<a class="btn sm" href="${esc(inv.url)}" target="_blank" rel="noopener">Open in Zoho Books</a>` : ''}</div>`;
    if (!isStaff() || !lines.length) return '';
    return B().zoho ? `<button class="btn sm" style="margin-top:10px" data-action="invoice" data-kind="${kind}" data-id="${rec.id}">${ic('doc')}Create invoice in Zoho Books</button>${B().autoInvoice && kind === 'job' && rec.status !== 'report' ? '<small class="muted" style="display:block;margin-top:4px">Or wait: a draft invoice is created automatically when the report is signed.</small>' : ''}`
      : `<p class="muted" style="font-size:12px;margin:10px 0 0">Connect Zoho Books (Settings → Zoho Books & billing) to turn this into an invoice.</p>`;
  }
  function billingCard(rec, kind) {
    const lines = (rec.billing || {}).lines || [];
    const editable = !(rec.invoice && rec.invoice.id) && (kind === 'job' ? (isStaff() || (isField() && ['onsite', 'completed'].includes(rec.status))) : isField());
    return `<div class="card"><header><h2>Parts & labour</h2>${rec.invoice && rec.invoice.id ? '<span class="pill ok"><i></i>Invoiced</span>' : lines.length ? `<span class="pill info">${fmtMoney(calcTotals(lines).total)}</span>` : ''}</header>
      ${editable ? `<form class="form" data-form="billing" data-kind="${kind}" data-id="${rec.id}">${linesEditor(lines.length ? lines : [])}<button class="btn primary">${ic('check')}Save parts & labour</button></form>` : linesTable(lines)}
      ${invoiceLine(rec, kind)}</div>`;
  }
  function viewServiceBilling(id) {
    const rec = byId(S.services, id);
    if (!rec) return head('Service record not found');
    const b = bld(rec.building);
    return head(`${esc(rec.unit)} · ${esc(rec.type)}`, `${esc(b.name)} · ${dmy(rec.date)} · ${esc(rec.techName || '')}`, `<a class="btn sm" href="#/service/unit/${rec.building}/${encodeURIComponent(rec.unit)}">${ic('back')}Unit history</a>`) +
      `<div class="grid split"><div>${billingCard(rec, 'service')}</div><div class="card" style="align-self:start"><header><h3>Work done</h3></header><p style="margin:0">${esc(rec.work)}</p>${rec.notes ? `<p class="muted">${esc(rec.notes)}</p>` : ''}</div></div>`;
  }

  /* ---------------- settings: Zoho Books & billing ---------------- */
  const catRow = (c = { kind: 'Part', unit: 'each' }) => `<div class="crow cat" data-row>
      <div class="field"><label>Code</label><input name="k_code" value="${esc(c.code || '')}"></div>
      <div class="field"><label>Name</label><input name="k_name" value="${esc(c.name || '')}"></div>
      <div class="field"><label>Type</label><select name="k_kind">${LINE_KINDS.map(k => `<option ${c.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
      <div class="field"><label>Unit</label><input name="k_unit" value="${esc(c.unit || 'each')}"></div>
      <div class="field"><label>Price (excl. VAT)</label><input name="k_rate" type="number" step="0.01" min="0" value="${c.rate ?? ''}"></div>
      <div class="field"><label>Zoho item ID (optional)</label><input name="k_zoho" value="${esc(c.zohoItemId || '')}"></div>
      <button type="button" class="btn sm danger" data-action="rmrow" aria-label="Remove">${ic('x')}</button></div>`;
  function viewSettingsBilling(arg, arg2) {
    const Z = S.admin.zoho || {}, BS = S.admin.settings.billing;
    return head('Zoho Books & billing', 'Clients and contacts are pushed to Zoho Books; approved jobs become draft invoices') +
      `<div class="grid g2">
        ${zohoPanel(arg, arg2)}
        <form class="card form" data-form="billingsettings"><header><h2>Invoicing settings</h2></header>
          <div class="grid g2">${field('VAT rate (%)', 'vatRate', BS.vatRate, 'number', 'step="0.5" min="0" max="50"')}${field('Currency', 'currency', BS.currency, 'text', 'maxlength="3"')}</div>
          ${field('Payment terms (days, for overdue)', 'termsDays', BS.termsDays ?? 30, 'number', 'min="0" max="365"')}
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="pricesIncludeVat" ${BS.pricesIncludeVat ? 'checked' : ''}> Prices include VAT</label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="autoInvoice" ${BS.autoInvoice ? 'checked' : ''}> Skip approval: send to Zoho Books as soon as a job report is signed (normally you approve in the Billing tracker)</label>
          ${field('Zoho tax ID for VAT (optional)', 'zohoTaxId', BS.zohoTaxId, 'text', 'placeholder="From Zoho Books → Settings → Taxes"')}
          <button class="btn primary">${ic('check')}Save</button></form>
      </div>
      <form class="card form" data-form="catalogue" style="margin-top:14px"><header><h2>Price list</h2><small>Used by technicians when recording parts & labour</small></header>
        <div id="crows">${(BS.catalogue || []).map(catRow).join('')}</div>
        <div><button type="button" class="btn sm" data-action="addcatrow">${ic('plus')}Add item</button></div>
        <div><button class="btn primary">${ic('check')}Save price list</button></div></form>
      ${Z.configured ? `<div class="card" style="margin-top:14px"><header><h2>Sync log</h2></header>${(Z.log || []).length ? `<div class="table-wrap"><table><thead><tr><th>Time</th><th>What</th><th>Status</th></tr></thead><tbody>${Z.log.map(x => `<tr><td class="mono">${hhmm(x.createdAt)}<br><small>${dmy(x.createdAt)}</small></td><td>${x.kind === 'contact' ? 'Client ' + esc(bld(x.ref).name) : 'Invoice ' + esc(x.ref.split(':')[1])}${x.error ? `<br><small style="color:var(--red)">${esc(x.error)}</small>` : ''}${x.result && x.result.number ? `<br><small>${esc(x.result.number)}</small>` : ''}</td><td>${x.status === 'done' ? '<span class="pill ok">Done</span>' : x.status === 'queued' ? `<span class="pill warn">Waiting${x.attempts ? ' · retry ' + x.attempts : ''}</span>` : `<span class="pill bad">Failed</span> <button class="btn sm" data-action="zohoretry" data-id="${x.id}">Retry</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nothing synced yet.</div>'}</div>` : ''}`;
  }

  /* ---------------- views: billing tracker ---------------- */
  const PO_STATUS = ['None', 'Pending', 'Approved', 'Not approved'];
  const TK_CLS = { 'Void': 'off', 'Not approved': 'off', 'Paid': 'ok', 'Overdue': 'bad', 'Loaded to portal': 'info', 'Invoiced': 'info', 'Sending to Zoho': 'warn', 'Approved': 'warn', 'In progress': 'off', 'Needs parts & labour': 'warn', 'Quote / PO': 'off', 'PO pending': 'warn', 'Ready to invoice': 'ok' };
  function trackerRows() {
    const terms = B().termsDays ?? 30;
    return (S.tracker || []).filter(t => (t.division || (t.jobId && byId(S.jobs, t.jobId) ? divOf(byId(S.jobs, t.jobId)) : 'aircon')) === ui.biz).map(t => {
      const job = t.jobId && byId(S.jobs, t.jobId), sv = t.serviceId && byId(S.services, t.serviceId), rec = job || sv;
      const lines = rec && rec.billing ? rec.billing.lines || [] : [];
      const live = lines.length ? calcTotals(lines) : null;
      const ex = t.amountEx ?? (live ? live.subtotal : null), incl = t.amountIncl ?? (live ? live.total : null);
      const inv = t.invoice || (rec && rec.invoice && rec.invoice.number ? { number: rec.invoice.number, date: (rec.invoice.at || '').slice(0, 10), source: 'zoho' } : null);
      let overdue = 0;
      if (inv && inv.date && !t.paidDate && !t.void) overdue = Math.max(0, Math.floor((new Date(today()) - new Date(inv.date)) / 864e5) - terms);
      const done = job ? ['completed', 'report'].includes(job.status) : true;
      let st;
      if (t.void) st = 'Void';
      else if (t.poStatus === 'Not approved') st = 'Not approved';
      else if (t.paidDate) st = 'Paid';
      else if (inv) st = overdue > 0 ? 'Overdue' : t.portalDate ? 'Loaded to portal' : 'Invoiced';
      else if (t.approvedAt) st = B().zoho && rec ? 'Sending to Zoho' : 'Approved';
      else if (job && !done) st = 'In progress';
      else if (rec && !lines.length) st = 'Needs parts & labour';
      else if (!rec && ex == null) st = 'Quote / PO';
      else if (t.poStatus === 'Pending') st = 'PO pending';
      else st = 'Ready to invoice';
      const jobDate = job ? (job.steps.completed || job.steps.report || '').slice(0, 10) : sv ? sv.date : (t.legacyJobDate || '');
      return { t, job, sv, rec, b: bld(t.building), inv, ex, incl, overdue, st, jobDate, ref: job ? job.id : sv ? `${sv.unit} · ${sv.type}` : (t.description || ''), run: t.recoveryId };
    }).sort((a, b) => String(b.t.poDate || b.jobDate || b.t.createdAt).localeCompare(String(a.t.poDate || a.jobDate || a.t.createdAt)));
  }
  const TK_FILTERS = [['open', 'Open'], ['ready', 'Ready to invoice'], ['po', 'Awaiting PO'], ['invoiced', 'Invoiced, unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['closed', 'Void / not approved'], ['all', 'All']];
  const tkMatch = (r, f) => ({
    open: !['Paid', 'Void', 'Not approved'].includes(r.st),
    ready: ['Ready to invoice', 'Approved', 'Sending to Zoho'].includes(r.st),
    po: ['PO pending', 'Quote / PO'].includes(r.st) || (!r.t.poNumber && !['Paid', 'Void', 'Not approved'].includes(r.st)),
    invoiced: ['Invoiced', 'Loaded to portal', 'Overdue'].includes(r.st),
    overdue: r.st === 'Overdue', paid: r.st === 'Paid', closed: ['Void', 'Not approved'].includes(r.st), all: true,
  }[f]);
  const sumIncl = rows => rows.reduce((a, r) => a + (r.incl || 0), 0);
  function viewTracker() {
    if (!isStaff()) return head('Billing tracker') + '<div class="card empty">Only the service desk can see the billing tracker.</div>';
    ui.tkFilter = ui.tkFilter || 'open';
    const all = trackerRows();
    const clients = [...new Set(all.map(r => r.b.client || r.b.name))].sort();
    const rows = all.filter(r => tkMatch(r, ui.tkFilter) && (!ui.tkClient || (r.b.client || r.b.name) === ui.tkClient));
    const ready = all.filter(r => r.st === 'Ready to invoice'), unpaid = all.filter(r => tkMatch(r, 'invoiced')), over = all.filter(r => r.st === 'Overdue'), po = all.filter(r => tkMatch(r, 'po'));
    return head('Billing tracker', 'Every job from PO to payment. Rows are added automatically; approve them to invoice.',
      `<a class="btn sm" href="#/service/trackimport">${ic('doc')}Import CSV</a><a class="btn sm" href="#/service/trackrow/new">${ic('plus')}Add PO / quote</a><button class="btn sm" data-action="tkcsv">${ic('doc')}Export CSV</button>`) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('check', `Ready to invoice · ${ready.length}`, fmtMoney(sumIncl(ready)))}${kpi('clipboard', 'Awaiting PO', po.length)}${kpi('doc', `Invoiced, unpaid · ${unpaid.length}`, fmtMoney(sumIncl(unpaid)))}${kpi('alert', `Overdue · ${over.length}`, fmtMoney(sumIncl(over)))}</div>
      <div class="card">
        <div class="tk-bar">
          <select class="tk-fsel" data-change="tkfilter" aria-label="Show">${TK_FILTERS.map(([k, l]) => `<option value="${k}" ${ui.tkFilter === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <div class="seg tk-seg">${TK_FILTERS.map(([k, l]) => `<button data-action="tkfilter" data-v="${k}" class="${ui.tkFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <select data-change="tkclient" aria-label="Client"><option value="">All clients</option>${clients.map(c => `<option ${ui.tkClient === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <input type="search" data-filter="tracker" placeholder="Search PO, job, invoice…" aria-label="Search">
        </div>
        <div class="tk-bar tk-bulk"><label><input type="checkbox" data-tkall> Select all</label><span class="muted" id="tkCount">0 selected</span>
          <button class="btn sm primary" data-action="tkapprove">${ic('check')}${B().zoho ? 'Approve & send to Zoho' : 'Approve for invoicing'}</button>
          <button class="btn sm" data-action="tkportal">Loaded to portal today</button><button class="btn sm" data-action="tkpaid">Mark paid today</button></div>
        ${rows.length ? `<div class="table-wrap"><table class="tk-table" id="tracker"><thead><tr><th></th><th>Status</th><th>Client</th><th>PO</th><th>Job card</th><th>Invoice</th><th style="text-align:right">Amount</th><th>Overdue</th><th>Portal</th><th>Paid</th></tr></thead><tbody>
        ${rows.map(r => `<tr class="click${r.t.critical ? ' tk-crit' : ''}" data-href="#/service/trackrow/${r.t.id}">
          <td><input type="checkbox" data-tkrow="${r.t.id}" aria-label="Select"></td>
          <td><span class="pill ${TK_CLS[r.st] || 'off'}">${esc(r.st)}</span>${r.t.critical ? '<br><span class="pill bad" style="margin-top:3px">Critical</span>' : ''}</td>
          <td>${esc(r.b.client || r.b.name)}<br><small>${esc(r.b.name)}</small></td>
          <td>${r.t.poNumber ? `<span class="tk-po">${esc(r.t.poNumber)}</span>` : '<small class="muted">no PO</small>'}<br><small>${[r.t.poDate ? dmy(r.t.poDate) : '', r.t.poStatus !== 'None' ? r.t.poStatus : ''].filter(Boolean).join(' · ') || '&nbsp;'}</small></td>
          <td>${r.job ? `<a href="#/service/job/${r.job.id}">${r.job.id}</a>` : r.run ? `<a href="#/recoveries/run/${r.run}" class="tk-desc">${esc(r.ref)}</a>` : r.sv ? `<a href="#/service/svbilling/${r.sv.id}">${esc(r.ref)}</a>` : `<span class="tk-desc">${esc(r.ref)}</span>`}<br><small>${r.jobDate ? dmy(r.jobDate) : '&nbsp;'}</small></td>
          <td>${r.inv ? esc(r.inv.number) : '—'}<br><small>${r.inv && r.inv.date ? dmy(r.inv.date) : '&nbsp;'}</small></td>
          <td class="mono" style="text-align:right">${r.incl != null ? fmtMoney(r.incl) : '—'}<br><small>${r.ex != null ? fmtMoney(r.ex) + ' ex VAT' : '&nbsp;'}</small></td>
          <td class="mono" style="${r.overdue ? 'color:var(--red);font-weight:600' : ''}">${r.overdue ? r.overdue + ' days' : '—'}</td>
          <td class="mono">${r.t.portalDate ? dmy(r.t.portalDate) : '—'}</td>
          <td class="mono" style="${r.t.paidDate ? 'color:var(--accent)' : ''}">${r.t.void ? 'VOID' : r.t.paidDate ? dmy(r.t.paidDate) : '—'}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">Nothing here.</div>'}
        <p class="muted" style="font-size:12px;margin:10px 0 0">Overdue counts from the invoice date after ${B().termsDays ?? 30} days' payment terms (Settings → Zoho Books & billing).</p></div>`;
  }
  function viewTrackRow(id) {
    if (!isStaff()) return head('Not found');
    const isNew = id === 'new';
    const r = isNew ? null : trackerRows().find(x => x.t.id === id);
    if (!isNew && !r) return head('Row not found');
    const t = r ? r.t : { poStatus: 'Pending', building: ui.site };
    const b = bld(t.building), manual = !t.jobId && !t.serviceId, zinv = r && r.inv && r.inv.source === 'zoho';
    const portalName = b.portal || 'client portal';
    return head(isNew ? 'Add PO / quote' : (r.job ? `Billing · ${r.job.id}` : `Billing · ${esc(r.ref || t.poNumber || 'PO')}`), r ? `${esc(b.client || b.name)} · ${esc(b.name)}` : 'For POs and quotes that are not linked to a service call',
      `<a class="btn sm" href="#/service/tracker">${ic('back')}Billing tracker</a>${r && r.job ? `<a class="btn sm" href="#/service/job/${r.job.id}">Open job</a>` : ''}`) +
      `<div class="grid split"><form class="card form" data-form="tracker" data-id="${isNew ? '' : t.id}">
        ${r ? `<header><h2>Status</h2><span class="pill ${TK_CLS[r.st] || 'off'}">${esc(r.st)}</span></header>` : ''}
        ${manual ? `<div class="field"><label>Client building</label><select name="building">${S.buildings.map(x => `<option value="${x.id}" ${x.id === t.building ? 'selected' : ''}>${esc(x.client || x.name)} · ${esc(x.name)}</option>`).join('')}</select></div>
          ${field('Description', 'description', t.description, 'text', 'placeholder="e.g. Quote: replace server-room split unit" required')}
          ${field('Amount excl. VAT', 'amountEx', t.amountEx, 'number', 'step="0.01" min="0"')}` : ''}
        <div class="grid g2">${field('PO number', 'poNumber', t.poNumber)}${field('PO received', 'poDate', t.poDate, 'date')}</div>
        <div class="grid g2"><div class="field"><label>PO approval</label><select name="poStatus">${PO_STATUS.map(x => `<option ${t.poStatus === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          <label style="display:flex;gap:8px;align-items:center;margin-top:18px"><input type="checkbox" name="critical" ${t.critical ? 'checked' : ''}> Critical</label></div>
        ${zinv ? `<div class="field"><label>Invoice</label><p style="margin:4px 0">${esc(r.inv.number)} · ${dmy(r.inv.date)} (Zoho Books)${r.rec && r.rec.invoice && r.rec.invoice.url ? ` · <a href="${esc(r.rec.invoice.url)}" target="_blank" rel="noopener">Open in Zoho</a>` : ''}</p></div>`
          : `<div class="grid g2">${field('Invoice number', 'invoiceNumber', r && r.inv ? r.inv.number : '', 'text', B().zoho ? 'placeholder="Filled in by Zoho when sent"' : 'placeholder="e.g. INV-0012430"')}${field('Invoice date', 'invoiceDate', r && r.inv ? r.inv.date : '', 'date')}</div>`}
        <div class="grid g2">${field(`Loaded to ${esc(portalName)}`, 'portalDate', t.portalDate, 'date')}${field('Date paid', 'paidDate', t.paidDate, 'date')}</div>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="void" ${t.void ? 'checked' : ''}> Void</label>
        <div class="field"><label>Notes</label><textarea name="notes">${esc(t.notes || '')}</textarea></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">${ic('check')}Save</button>
          ${r && ['Ready to invoice', 'PO pending'].includes(r.st) && r.rec ? `<button type="button" class="btn" data-action="tkapproveone" data-id="${t.id}">${B().zoho ? 'Approve & send to Zoho' : 'Approve for invoicing'}</button>` : ''}
          ${!isNew && manual ? `<button type="button" class="btn danger" data-action="tkdelete" data-id="${t.id}">Delete</button>` : ''}</div>
      </form>
      ${r ? `<div class="grid" style="align-content:start"><div class="card"><header><h3>Amount</h3></header><dl class="kv"><dt>Excl. VAT</dt><dd>${r.ex != null ? fmtMoney(r.ex) : '—'}</dd><dt>Incl. VAT</dt><dd><strong>${r.incl != null ? fmtMoney(r.incl) : '—'}</strong></dd>${r.overdue ? `<dt>Overdue</dt><dd style="color:var(--red)">${r.overdue} days</dd>` : ''}</dl>
        ${r.rec && r.rec.billing && r.rec.billing.lines && r.rec.billing.lines.length ? `<div style="margin-top:10px">${linesTable(r.rec.billing.lines)}</div>` : ''}
        ${r.job && !(r.rec.billing && r.rec.billing.lines && r.rec.billing.lines.length) ? `<p class="muted">No parts & labour recorded yet. <a href="#/service/job/${r.job.id}">Add them on the job</a>.</p>` : ''}</div>
        ${t.approvedAt ? `<div class="card"><small>Approved by ${esc(t.approvedBy || '')} · ${dmy(t.approvedAt)}</small></div>` : ''}</div>` : ''}</div>`;
  }
  function trackerCsv() {
    const rows = trackerRows();
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const head = ['Status', 'Client', 'Building', 'PO received date', 'Critical', 'PO approval', 'PO #', 'Job card nr', 'Job card date', 'Invoice', 'Invoice date', 'Amount', 'Ex VAT amount', 'Overdue days', 'Loaded to portal', 'Date paid', 'Notes'];
    const body = rows.map(r => [r.st, r.b.client || r.b.name, r.b.name, r.t.poDate, r.t.critical ? 'Yes' : '', r.t.poStatus === 'None' ? '' : r.t.poStatus, r.t.poNumber, r.job ? r.job.id : r.ref, r.jobDate, r.inv ? r.inv.number : '', r.inv ? r.inv.date : '', r.incl != null ? r.incl.toFixed(2) : '', r.ex != null ? r.ex.toFixed(2) : '', r.overdue || '', r.t.portalDate, r.t.void ? 'VOID' : r.t.paidDate, r.t.notes].map(q).join(','));
    const blob = new Blob(['﻿' + [head.map(q).join(','), ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `billing-tracker-${today()}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  async function tkApprove(ids) {
    const r = await act('POST', '/api/tracker/approve', { ids });
    if (!r) return false;
    toast(`${r.approved} approved${r.sent ? `, ${r.sent} sent to Zoho Books` : ''}`, r.skipped.length ? 'Skipped: ' + r.skipped.slice(0, 4).join('; ') + (r.skipped.length > 4 ? '…' : '') : (B().zoho ? 'Draft invoices appear in a few seconds' : 'Add the invoice numbers when invoiced'), r.skipped.length && !r.approved ? 'bad' : '');
    render(true);
    return true;
  }
  const tkSelected = () => [...document.querySelectorAll('[data-tkrow]:checked')].map(x => x.dataset.tkrow);

  /* ---------------- Zoho connect panel ---------------- */
  const ZOHO_DCS = [['com', 'zoho.com (global / US)'], ['eu', 'zoho.eu (Europe)'], ['in', 'zoho.in (India)'], ['com.au', 'zoho.com.au (Australia)'], ['jp', 'zoho.jp (Japan)'], ['ca', 'zohocloud.ca (Canada)'], ['sa', 'zoho.sa (Saudi Arabia)']];
  function zohoPanel(arg, arg2) {
    const Z = S.admin.zoho || {}, M = Z.meta || {};
    const banner = arg === 'error' ? `<div class="banner bad" style="margin:0 0 10px"><span class="grow">${esc(arg2 || 'Connection failed')}</span></div>` : arg === 'connected' ? `<div class="banner ok" style="margin:0 0 10px"><strong>Zoho Books connected.</strong></div>` : '';
    if (Z.configured) return `<div class="card"><header><h2>Zoho Books</h2><span class="pill ok"><i></i>Connected</span></header>${banner}
      <dl class="kv"><dt>Organisation</dt><dd>${esc(M.orgName || Z.org)}</dd><dt>Data centre</dt><dd>${esc(Z.dc)}</dd>
      <dt>Connected</dt><dd>${M.source === 'app' ? `by ${esc(M.connectedBy || '')} · ${M.connectedAt ? dmy(M.connectedAt) : ''}` : 'from the server .env file'}</dd>
      <dt>Waiting to sync</dt><dd>${Z.queued}</dd><dt>Failed</dt><dd>${Z.failed}</dd></dl>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn sm" data-action="zohotest">Test connection</button><button class="btn sm" data-action="zohosync">Sync all clients now</button>${M.source === 'app' ? '<button class="btn sm danger" data-action="zohodisconnect">Disconnect</button>' : ''}</div></div>`;
    if (Z.hasToken) {
      setTimeout(async () => { const el = $('#zohoOrgs'); if (!el) return; try { const orgs = await api('GET', '/api/admin/zoho/orgs'); el.innerHTML = orgs.length ? orgs.map(o => `<option value="${esc(o.id)}">${esc(o.name)} · ${esc(o.currency)} · ${esc(o.id)}</option>`).join('') : '<option value="">No Zoho Books organisation found on this account</option>'; } catch (e) { el.innerHTML = `<option value="">${esc(e.message)}</option>`; } }, 0);
      return `<form class="card form" data-form="zohoorg"><header><h2>Zoho Books</h2><span class="pill warn"><i></i>Choose organisation</span></header>${banner}
        <div class="field"><label>Which Zoho Books organisation should invoices go to?</label><select name="orgId" id="zohoOrgs"><option>Loading…</option></select></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">${ic('check')}Use this organisation</button>${M.source === 'app' ? '<button type="button" class="btn sm danger" data-action="zohodisconnect">Disconnect</button>' : ''}</div></form>`;
    }
    const cb = location.origin + '/api/zoho/callback';
    return `<form class="card form" data-form="zohoconnect"><header><h2>Connect Zoho Books</h2><span class="pill warn"><i></i>Not connected</span></header>${banner}
      <ol style="margin:0;padding-left:20px;line-height:1.65;font-size:13px">
        <li>Sign in to the <b>Zoho API Console</b> for your Zoho region (for zoho.com: <a href="https://api-console.zoho.com" target="_blank" rel="noopener">api-console.zoho.com</a>) with the same Zoho account that owns your Zoho Books.</li>
        <li>Click <b>Add Client</b> → <b>Server-based Applications</b>. Client name: <i>Bothelec Aircon Platform</i>.</li>
        <li>Homepage URL: <code class="copy">${esc(location.origin)}</code><br>Authorized Redirect URI: <code class="copy">${esc(cb)}</code></li>
        <li>Create, then copy the <b>Client ID</b> and <b>Client Secret</b> into the boxes below and click Connect.</li></ol>
      <div class="field"><label>Zoho region (the end of your Zoho address)</label><select name="dc">${ZOHO_DCS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      ${field('Client ID', 'clientId', '', 'text', 'required autocomplete="off" spellcheck="false"')}${field('Client Secret', 'clientSecret', '', 'password', 'required autocomplete="off"')}
      <button class="btn primary">${ic('check')}Connect Zoho Books</button>
      <p class="muted" style="margin:0;font-size:12px">You'll be sent to Zoho to approve access, then brought back here. The secret is stored on the server only.${location.protocol === 'http:' && !/localhost|127\.0\.0\.1/.test(location.hostname) ? ' <b>Use the https:// address of the platform for this step.</b>' : ''}</p></form>`;
  }

  /* ---------------- tracker: CSV import from the old spreadsheet ---------------- */
  const IMP_FIELDS = [
    ['poDate', 'PO received date', /p\.?o.*(rec|rcv)|receiv|recieval/i], ['critical', 'Critical', /critical/i], ['poStatus', 'Approval', /approv/i],
    ['poNumber', 'PO number', /p\.?o\.?\s*(#|no|num)|order\s*(#|no)/i], ['jobRef', 'Job card number', /job\s*card\s*(n|#)|job\s*(no|#|nr)/i], ['jobDate', 'Job card date', /job\s*card\s*date|jobcard\s*date/i],
    ['invoiceNumber', 'Invoice number', /inv(oice)?(?!.*date)/i], ['invoiceDate', 'Invoice date', /inv(oice)?.*date/i], ['amountIncl', 'Amount (incl. VAT)', /^amount$|incl/i],
    ['amountEx', 'Amount ex VAT', /ex\.?\s*vat|excl/i], ['portalDate', 'Loaded to portal', /loaded|portal|uploaded/i], ['paidDate', 'Date paid / VOID', /paid/i]];
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/).find(l => l.trim()) || '';
    const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.map(r => r.map(x => x.trim()));
  }
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  function impDate(v) {
    v = String(v || '').trim(); if (!v || /^1900|\/1900$|^0+$/.test(v)) return '';
    const pad = n => String(n).padStart(2, '0'), ok = (y, m, d) => (y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : '');
    let m;
    if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v))) return ok(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(v))) return ok(+m[3], +m[2], +m[1]);
    if ((m = /^(\d{1,2})[\s-]([a-z]{3,4})[a-z]*[\s-](\d{4})/i.exec(v)) && MONTHS[m[2].toLowerCase()]) return ok(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    if (/^\d{5}(\.\d+)?$/.test(v)) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+v) * 864e5); return ok(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    return '';
  }
  function impMoney(v) {
    let s = String(v || '').replace(/[R\s ]/g, '').replace(/^ZAR/i, '');
    if (!s || /^-+$/.test(s)) return null;
    if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, ''); else if (/,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
    const n = parseFloat(s); return isNaN(n) ? null : n;
  }
  function impRow(cells, map) {
    const g = k => (map[k] === '' || map[k] == null ? '' : cells[+map[k]] || '');
    const appr = g('poStatus'), paid = g('paidDate');
    return {
      poDate: impDate(g('poDate')), critical: !!g('critical') && !/^(no|n|0|false|-)$/i.test(g('critical')),
      poStatus: /not/i.test(appr) ? 'Not approved' : /pend/i.test(appr) ? 'Pending' : /approv|yes/i.test(appr) ? 'Approved' : '',
      poNumber: g('poNumber').replace(/^-$/, ''), jobRef: g('jobRef').replace(/^-$/, ''), jobDate: impDate(g('jobDate')),
      invoiceNumber: g('invoiceNumber').replace(/^-$/, ''), invoiceDate: impDate(g('invoiceDate')),
      amountIncl: impMoney(g('amountIncl')), amountEx: impMoney(g('amountEx')), portalDate: impDate(g('portalDate')),
      paidDate: /void/i.test(paid) ? '' : impDate(paid), void: /void/i.test(paid),
    };
  }
  function impParsed() {
    const I = ui.imp; if (!I) return [];
    return I.body.map((cells, i) => ({ line: I.headerRow + i + 2, ...impRow(cells, I.map) }))
      .map(r => { const bare = !r.poNumber && !r.invoiceNumber && !r.jobRef && !r.poStatus; return { ...r, empty: bare && r.amountIncl == null && r.amountEx == null, total: bare && (r.amountIncl != null || r.amountEx != null) }; })
      .map(r => ({ ...r, empty: r.empty || r.total, dup: !!(S.tracker || []).find(t => (r.invoiceNumber && t.invoice && t.invoice.number === r.invoiceNumber)) }));
  }
  function viewTrackImport() {
    if (!isStaff()) return head('Not found');
    const I = ui.imp;
    let body = `<form class="card form" data-form="impfile" style="max-width:720px"><header><h2>1 · Choose the file</h2></header>
      <p style="margin:0">In Excel: <b>File → Save As → CSV (Comma delimited)</b>. Import one client's sheet at a time.</p>
      <div class="field"><label>Client building for these rows</label><select name="building">${S.buildings.map(b => `<option value="${b.id}" ${I && I.building === b.id ? 'selected' : ''}>${esc(b.client || b.name)} · ${esc(b.name)}</option>`).join('')}</select></div>
      <div class="field"><label>CSV file</label><input type="file" name="file" accept=".csv,text/csv" data-impfile></div></form>`;
    if (I) {
      const rows = impParsed(), good = rows.filter(r => !r.empty && !r.dup);
      body += `<div class="card" style="margin-top:14px"><header><h2>2 · Check the columns</h2><small>${esc(I.name)} · ${I.body.length} data rows</small></header>
        <div class="grid g3">${IMP_FIELDS.map(([k, l]) => `<div class="field"><label>${l}</label><select data-impmap="${k}"><option value="">— not in file —</option>${I.headers.map((h, i) => `<option value="${i}" ${String(I.map[k]) === String(i) ? 'selected' : ''}>${esc(h || 'Column ' + (i + 1))}</option>`).join('')}</select></div>`).join('')}</div>
        <p class="muted" style="font-size:12px;margin:8px 0 0">"Overdue" is not imported: the tracker works it out from the invoice date. Dates like 1900-01-00 are treated as empty; VOID in the paid column marks the row void.</p></div>
      <div class="card" style="margin-top:14px"><header><h2>3 · Preview</h2><small>${good.length} to import · ${rows.filter(r => r.dup).length} already in the tracker · ${rows.filter(r => r.empty).length} empty or totals rows (skipped)</small></header>
        <div class="table-wrap"><table class="tk-table"><thead><tr><th>Line</th><th></th><th>PO received</th><th>Approval</th><th>PO #</th><th>Job card</th><th>Invoice</th><th style="text-align:right">Amount</th><th style="text-align:right">Ex VAT</th><th>Portal</th><th>Paid</th></tr></thead><tbody>
        ${rows.slice(0, 40).map(r => `<tr class="${r.empty || r.dup ? 'muted' : ''}"><td class="mono">${r.line}</td><td>${r.total ? '<small>totals row</small>' : r.empty ? '<small>empty</small>' : r.dup ? '<small>duplicate</small>' : '<span class="pill ok">new</span>'}${r.critical ? ' <span class="pill bad">Critical</span>' : ''}</td>
          <td class="mono">${r.poDate ? dmy(r.poDate) : '—'}</td><td>${esc(r.poStatus || (r.poNumber ? 'Approved' : '—'))}</td><td class="mono tk-po">${esc(r.poNumber || '')}</td><td>${esc(r.jobRef || '')}<br><small>${r.jobDate ? dmy(r.jobDate) : ''}</small></td>
          <td>${esc(r.invoiceNumber || '—')}<br><small>${r.invoiceDate ? dmy(r.invoiceDate) : ''}</small></td><td class="mono" style="text-align:right">${r.amountIncl != null ? fmtMoney(r.amountIncl) : '—'}</td><td class="mono" style="text-align:right">${r.amountEx != null ? fmtMoney(r.amountEx) : '—'}</td>
          <td class="mono">${r.portalDate ? dmy(r.portalDate) : '—'}</td><td class="mono">${r.void ? 'VOID' : r.paidDate ? dmy(r.paidDate) : '—'}</td></tr>`).join('')}</tbody></table></div>
        ${rows.length > 40 ? `<p class="muted" style="font-size:12px">Showing the first 40 of ${rows.length} rows.</p>` : ''}
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn primary" data-action="impgo" ${good.length ? '' : 'disabled'}>${ic('check')}Import ${good.length} row${good.length === 1 ? '' : 's'}</button><button class="btn" data-action="impclear">Start again</button></div></div>`;
    }
    return head('Import from spreadsheet', 'Bring your existing PO / invoice tracking sheet into the billing tracker', `<a class="btn sm" href="#/service/tracker">${ic('back')}Billing tracker</a>`) + body;
  }
  function impLoad(file, building) {
    const fr = new FileReader();
    fr.onload = () => {
      const all = parseCsv(String(fr.result)).filter(r => r.some(c => c));
      const hi = Math.max(0, all.findIndex(r => r.filter(c => /[a-z]/i.test(c)).length >= 3 && IMP_FIELDS.some(([, , re]) => r.some(c => re.test(c)))));
      const headers = all[hi] || [];
      const map = {}; const used = new Set();
      for (const [k, , re] of [...IMP_FIELDS].sort((a, b) => (a[0] === 'poNumber' ? -1 : b[0] === 'poNumber' ? 1 : 0))) {
        const i = headers.findIndex((h, j) => !used.has(j) && re.test(h) && !(k === 'invoiceNumber' && /date/i.test(h)) && !(k === 'poNumber' && /rec/i.test(h)) && !(k === 'portalDate' && /#|p\.?o/i.test(h)));
        if (i >= 0) { map[k] = i; used.add(i); }
      }
      ui.imp = { name: file.name, building, headers, headerRow: hi, body: all.slice(hi + 1), map };
      render(true);
    };
    fr.readAsText(file);
  }

  /* ================= Bothelec Utility Management ================= */
  const UT_LABEL = { electricity: 'Electricity', water: 'Water', solar: 'Solar' };
  const UT_ICON = { electricity: 'bolt', water: 'wind', solar: 'trend' };
  const meterById = id => (S.meters || []).find(m => m.id === id);
  const tenantById = id => (S.tenants || []).find(t => t.id === id);
  const fmtN = (n, d = 2) => (n == null || isNaN(n) ? '—' : (+n).toLocaleString('en-ZA', { maximumFractionDigits: d }));
  const lastMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
  const readingAge = m => (m.last ? Math.floor((Date.now() - Date.parse(m.last.ts)) / 864e5) : null);
  const bizSelect = (bid, change) => bizBuildings().length > 1 ? `<select data-change="${change}" aria-label="Building" class="hsel">${bizBuildings().map(b => `<option value="${b.id}" ${b.id === bid ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : '';
  const utilBld = id => bld(id || '').id ? bld(id) : (bizBuildings().find(b => b.id === ui.site) || bizBuildings()[0] || {});

  function jobReadingsCard(j, i) {
    const ms = (S.meters || []).filter(m => m.building === j.building && !m.removed).sort((a, b) => (a.id === j.meter ? -1 : b.id === j.meter ? 1 : 0));
    const done = j.readings || [];
    const editable = isField() && i >= 3 && i < 5;
    return `<div class="card"><header><h2>Meter readings</h2><small>${done.length} recorded on this job</small></header>
      ${done.length ? `<div class="table-wrap"><table><tbody>${done.map(r => `<tr><td><a href="#/meters/meter/${encodeURIComponent(r.meter)}">${esc(r.meter)}</a></td><td class="mono" style="text-align:right">${fmtN(r.value)}</td><td class="mono">${dmy(r.ts)} ${hhmm(r.ts)}</td><td>${r.photo ? `<a href="${esc(r.photo)}" target="_blank" rel="noopener">photo</a>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${editable && ms.length ? `<form class="form" data-form="capture" data-bid="${j.building}" data-job="${j.id}" style="margin-top:8px"><input type="hidden" name="date" value="${today()}"><input type="hidden" name="time" value="${new Date().toTimeString().slice(0, 5)}">
        ${ms.map(m => `<div class="cap-row" data-cap="${esc(m.id)}"><div><strong>${esc(m.id)}</strong> <small class="muted">${UT_LABEL[m.type]} · ${esc(m.location || '')}</small><br><small class="muted">Last: ${m.last ? fmtN(m.last.value) + ' on ' + dmy(m.last.ts) : 'none'}</small></div><input type="number" step="any" min="0" inputmode="decimal" placeholder="${esc(m.unit)}" aria-label="Reading for ${esc(m.id)}"><label class="btn sm cap-photo">${ic('camera')}<input type="file" accept="image/*" capture="environment" hidden data-capphoto="${esc(m.id)}"></label></div>`).join('')}
        <button class="btn">${ic('check')}Save readings</button></form>` : ''}
      ${!editable && !done.length ? '<p class="muted" style="margin:0">Readings can be recorded once on site.</p>' : ''}</div>`;
  }
  function viewUtilDashboard() {
    const ms = (S.meters || []).filter(m => !m.removed && bizBuildings().some(b => b.id === m.building));
    const due = ms.filter(m => readingAge(m) == null || readingAge(m) > 35);
    const runs = (S.recoveries || []).slice(0, 6);
    return head('Dashboard', `${esc(S.me.name)} · Bothelec Utility Management`, `${isStaff() ? `<a class="btn primary sm" href="#/meters/setup/new">${ic('plus')}Set up a building</a>` : ''}<a class="btn sm" href="#/meters/capture">${ic('check')}Record readings</a>${isStaff() ? `<a class="btn sm" href="#/recoveries/runs">${ic('doc')}Billing runs</a>` : ''}`) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('building', 'Sites', bizBuildings().length)}${kpi('bolt', 'Meters', ms.length)}${kpi('clock', 'Readings due', due.length)}${kpi('users', 'Tenants', (S.tenants || []).filter(t => t.active !== false && bizBuildings().some(b => b.id === t.building)).length)}</div>
      <div class="grid g2">
        <div class="card"><header><h2>Readings due</h2><small>no reading in 35 days</small></header>${due.length ? `<div class="rows">${due.slice(0, 8).map(m => `<a class="row" href="#/meters/meter/${encodeURIComponent(m.id)}" style="color:inherit">${icS(UT_ICON[m.type])}<div class="grow"><strong>${esc(m.id)}</strong><small>${esc(bld(m.building).name)} · ${esc(m.location || '')}</small></div><small>${m.last ? readingAge(m) + ' days' : 'never'}</small></a>`).join('')}</div>` : '<p class="muted" style="margin:0">All meters have a recent reading.</p>'}</div>
        <div class="card"><header><h2>Tenant billing</h2><a href="#/recoveries/runs" class="muted">All runs</a></header>${runs.length ? `<div class="rows">${runs.map(r => `<a class="row" href="#/recoveries/run/${r.id}" style="color:inherit"><div class="grow"><strong>${esc(r.label)} · ${esc(bld(r.building).name)}</strong><small>${r.lines.length} tenants${r.warnings ? ' · ' + r.warnings + ' warnings' : ''}</small></div><span class="pill ${r.status === 'approved' ? 'ok' : 'warn'}">${r.status === 'approved' ? 'Approved' : 'Draft'}</span><small class="mono">${fmtMoney(r.total)}</small></a>`).join('')}</div>` : '<p class="muted" style="margin:0">No billing runs yet.</p>'}</div>
      </div>`;
  }

  function viewMetersOverview() {
    return head('Sites overview', 'Meters, tenants and consumption per site', isStaff() ? `<a class="btn primary sm" href="#/meters/setup/new">${ic('plus')}Set up a building</a>` : '') + `<div class="grid g2">${bizBuildings().map(b => {
      const ms = (S.meters || []).filter(m => m.building === b.id && !m.removed), ts = (S.tenants || []).filter(t => t.building === b.id && t.active !== false);
      const sum = type => ms.filter(m => m.type === type && m.use30 != null).reduce((a, m) => a + m.use30, 0);
      const run = (S.recoveries || []).find(r => r.building === b.id);
      return `<div class="card"><header><h2>${esc(b.name)}</h2></header><small>${esc(b.client || '')} · ${esc(b.area || '')}</small>
        <dl class="kv" style="margin-top:10px"><dt>Tenants</dt><dd>${ts.length}</dd><dt>Meters</dt><dd>${['electricity', 'water', 'solar'].map(t => { const n = ms.filter(m => m.type === t).length; return n ? `${n} ${UT_LABEL[t].toLowerCase()}` : ''; }).filter(Boolean).join(' · ') || '—'}</dd>
        <dt>Electricity (30 days)</dt><dd>${fmtN(sum('electricity'), 0)} kWh</dd><dt>Water (30 days)</dt><dd>${fmtN(sum('water'), 1)} kL</dd>${ms.some(m => m.type === 'solar') ? `<dt>Solar (30 days)</dt><dd>${fmtN(sum('solar'), 0)} kWh</dd>` : ''}
        <dt>Last billing run</dt><dd>${run ? `<a href="#/recoveries/run/${run.id}">${esc(run.label)}</a>` : '—'}</dd></dl>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${isStaff() ? `<a class="btn sm primary" href="#/meters/setup/${b.id}/2">${ic('gear')}Setup</a>` : ''}<a class="btn sm" href="#/meters/balance/${b.id}">${ic('trend')}Balance</a>${isStaff() ? `<a class="btn sm" href="#/recoveries/btariffs/${b.id}">${ic('list')}Tariffs</a>` : ''}<a class="btn sm" href="#/meters/register/${b.id}">${ic('fcu')}Meters</a><a class="btn sm" href="#/meters/capture/${b.id}">${ic('check')}Record readings</a>${isStaff() ? `<a class="btn sm" href="#/recoveries/tenants/${b.id}">${ic('users')}Tenants</a>` : ''}</div></div>`;
    }).join('') || `<div class="card empty">No buildings use utility management yet.${isStaff() ? ' <a href="#/meters/setup/new">Set up your first building</a>.' : ''}</div>`}</div>`;
  }

  function viewMeterRegister(bid) {
    const b = utilBld(bid); if (!b.id) return head('Meters') + '<div class="card empty">No utility buildings yet.</div>';
    const ms = (S.meters || []).filter(m => m.building === b.id && (ui.showRemoved || !m.removed));
    const removed = (S.meters || []).filter(m => m.building === b.id && m.removed).length;
    return head(`Meters · ${esc(b.name)}`, 'Electricity, water and solar meters', `${bizSelect(b.id, 'msite')}<a class="btn sm" href="#/meters/capture/${b.id}">${ic('check')}Record readings</a>${isStaff() ? `<a class="btn primary sm" href="#/meters/edit/new/${b.id}">${ic('plus')}Add meter</a>` : ''}`) +
      `<div class="card">${ms.length ? `<div class="table-wrap"><table><thead><tr><th>Meter</th><th class="hide-sm">Location</th><th>Tenant</th><th>Last reading</th><th style="text-align:right">Use (30 days)</th><th class="hide-sm">Readings by</th></tr></thead><tbody>
        ${ms.map(m => { const t = tenantById(m.tenantId), age = readingAge(m); return `<tr class="click ${m.removed ? 'muted' : ''}" data-href="#/meters/meter/${encodeURIComponent(m.id)}"><td><strong>${esc(m.id)}</strong><br><small>${UT_LABEL[m.type]}${m.multiplier !== 1 ? ' · ×' + m.multiplier : ''}${m.removed ? ' · removed' : ''}</small></td><td class="hide-sm">${esc(m.location || '—')}</td><td>${t ? esc(t.name) + `<br><small>${esc(t.unit || '')}</small>` : '<small class="muted">common / landlord</small>'}</td>
          <td class="mono">${m.last ? fmtN(m.last.value) + ' ' + esc(m.unit) : '—'}<br><small style="${age != null && age > 35 ? 'color:var(--amber)' : ''}">${m.last ? dmy(m.last.ts) : 'no readings'}</small></td><td class="mono" style="text-align:right">${m.use30 != null ? fmtN(m.use30, 1) + ' ' + esc(m.unit) : '—'}</td><td class="hide-sm"><small>${{ manual: 'Manual / CSV', connector: 'Building link', m2m: 'M2M Solutions', meterhead: 'M2M Solutions' }[m.comm] || 'Manual'}</small></td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="empty">No meters yet.${isStaff() ? ' Use “Add meter”.' : ''}</div>`}
      ${removed ? `<p style="margin:10px 0 0"><a href="#" data-action="toggleremoved">${ui.showRemoved ? 'Hide' : 'Show'} ${removed} removed meter${removed > 1 ? 's' : ''}</a></p>` : ''}</div>`;
  }

  function viewMeter(idRaw) {
    const m = meterById(decodeURIComponent(idRaw || '')); if (!m) return head('Meter not found');
    const b = bld(m.building), t = tenantById(m.tenantId);
    setTimeout(async () => {
      const el = $('#mreads'); if (!el) return;
      try {
        const rs = await api('GET', `/api/meters/${encodeURIComponent(m.id)}/readings`);
        const pts = rs.slice(-120);
        const rows = rs.slice().reverse().slice(0, 40).map((r, i, arr) => { const prev = arr[i + 1]; const use = prev ? (r.value - prev.value) * (m.multiplier || 1) : null; return `<tr><td class="mono">${dmy(r.ts)}<br><small>${hhmm(r.ts)}</small></td><td class="mono" style="text-align:right">${fmtN(r.value)}</td><td class="mono" style="text-align:right;${use != null && use < 0 ? 'color:var(--red)' : ''}">${use != null ? fmtN(use, 2) + ' ' + esc(m.unit) : '—'}</td><td><small>${esc(r.source || '')}${r.by ? ' · ' + esc(r.by) : ''}${r.note ? ' · ' + esc(r.note) : ''}</small>${r.photo ? ` · <a href="${esc(r.photo)}" target="_blank" rel="noopener">photo</a>` : ''}</td>${isStaff() ? `<td><button class="btn sm" data-action="delreading" data-meter="${esc(m.id)}" data-ts="${esc(r.ts)}" aria-label="Delete reading">${ic('x')}</button></td>` : ''}</tr>`; }).join('');
        el.innerHTML = rs.length ? `${pts.length > 1 ? lineChart({ series: [{ label: 'Meter reading', color: 'var(--cyan)', data: pts.map(r => r.value) }], times: pts.map(r => r.ts) }) : ''}
          <div class="table-wrap"><table><thead><tr><th>Date</th><th style="text-align:right">Reading</th><th style="text-align:right">Use since previous</th><th>Source</th>${isStaff() ? '<th></th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">No readings yet.</div>';
      } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    }, 0);
    return head(`${esc(m.id)} <small class="muted" style="font-weight:400">${UT_LABEL[m.type]} meter</small>${m.removed ? ' <span class="pill off">Removed</span>' : ''}`, `${esc(b.name)}${m.location ? ' · ' + esc(m.location) : ''}`,
      `<a class="btn sm" href="#/meters/register/${b.id}">${ic('back')}Meters</a>${isStaff() ? `<a class="btn sm" href="#/meters/edit/${encodeURIComponent(m.id)}">Edit</a>` : ''}`) +
      `<div class="grid split"><div class="card"><header><h2>Readings</h2><small>${esc(m.unit)}</small></header><div id="mreads"><div class="empty">Loading…</div></div></div>
        <div class="grid" style="align-content:start">
          <div class="card"><header><h3>Meter details</h3></header><dl class="kv"><dt>Tenant</dt><dd>${t ? esc(t.name) + (t.unit ? ' · ' + esc(t.unit) : '') : 'Common area / landlord'}</dd><dt>Serial no.</dt><dd>${esc(m.serial || '—')}</dd><dt>Make / model</dt><dd>${esc([m.make, m.model].filter(Boolean).join(' ') || '—')}</dd>
            <dt>Role</dt><dd>${m.type === 'solar' ? 'Solar (supply)' : ROLE_LABEL[m.role || 'sub']}</dd><dt>${m.type === 'solar' ? 'Feeds into' : 'Fed from'}</dt><dd>${m.parentId && meterById(m.parentId) ? `<a href="#/meters/meter/${encodeURIComponent(m.parentId)}">${esc(mLabel(meterById(m.parentId)))}</a>` : '—'}</dd><dt>Multiplier (CT ratio)</dt><dd>${m.multiplier}</dd><dt>Tariff</dt><dd>${esc(((S.tariffs || []).find(x => x.id === m.tariffId) || {}).name || 'Default for ' + UT_LABEL[m.type].toLowerCase())}</dd><dt>Readings by</dt><dd>${{ manual: 'Manual / CSV', connector: 'Building link', m2m: 'M2M Solutions', meterhead: 'M2M Solutions' }[m.comm] || 'Manual'}</dd><dt>Installed</dt><dd>${m.installed ? dmy(m.installed) : '—'}</dd>${m.live ? `<dt>Live value</dt><dd>${fmtN(m.live.value)} · ${hhmm(m.live.at)}</dd>` : ''}</dl></div>
          ${isField() && !m.removed ? `<form class="card form" data-form="reading" data-meter="${esc(m.id)}"><header><h3>Record a reading</h3></header>
            <div class="grid g2"><div class="field"><label>Date</label><input type="date" name="date" value="${today()}" max="${today()}" required></div><div class="field"><label>Time</label><input type="time" name="time" value="${new Date().toTimeString().slice(0, 5)}"></div></div>
            <div class="field"><label>Reading (${esc(m.unit)} register)</label><input name="value" type="number" step="any" min="0" inputmode="decimal" required placeholder="${m.last ? 'last: ' + m.last.value : ''}"></div>
            <div class="field"><label>Photo of the meter (optional)</label><input type="file" accept="image/*" capture="environment" data-mphoto></div>
            <div class="field"><label>Note (optional)</label><input name="note"></div>
            <button class="btn primary">${ic('check')}Save reading</button></form>` : ''}
        </div></div>`;
  }

  function viewMeterEdit(idRaw, bid) {
    const isNew = idRaw === 'new', m = isNew ? { type: 'electricity', multiplier: 1, comm: 'manual', building: bid || utilBld().id } : meterById(decodeURIComponent(idRaw || ''));
    if (!m || !isStaff()) return head('Meter not found');
    const b = bld(m.building), tenants = (S.tenants || []).filter(t => t.building === m.building);
    return head(isNew ? 'Add meter' : `Edit ${esc(m.id)}`, esc(b.name || ''), `<a class="btn sm" href="${isNew ? '#/meters/register/' + (b.id || '') : '#/meters/meter/' + encodeURIComponent(m.id)}">${ic('back')}Back</a>`) +
      `<form class="card form" data-form="meter" data-orig="${isNew ? '' : esc(m.id)}" style="max-width:760px">
        <div class="grid g2">${field('Meter ID', 'id', m.id, 'text', 'required placeholder="e.g. E-SHOP4"')}<div class="field"><label>Building</label><select name="building" data-change="meterbld">${S.buildings.map(x => `<option value="${x.id}" ${x.id === m.building ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
        <div class="grid g3"><div class="field"><label>Type</label><select name="type">${['electricity', 'water', 'solar'].map(t => `<option value="${t}" ${m.type === t ? 'selected' : ''}>${UT_LABEL[t]}</option>`).join('')}</select></div>${field('Multiplier / CT ratio', 'multiplier', m.multiplier, 'number', 'step="any" min="0"')}${field('Serial number', 'serial', m.serial)}</div>
        <div class="grid g3">${field('Make', 'make', m.make)}${field('Model', 'model', m.model)}${field('Location', 'location', m.location, 'text', 'placeholder="e.g. Shop 4 DB"')}</div>
        <div class="grid g2"><div class="field"><label>Tenant billed for this meter</label><select name="tenantId"><option value="">Common area / landlord (not billed to a tenant)</option>${tenants.map(t => `<option value="${t.id}" ${m.tenantId === t.id ? 'selected' : ''}>${esc(t.name)}${t.unit ? ' · ' + esc(t.unit) : ''}</option>`).join('')}</select></div>
          <div class="field"><label>Tariff</label><select name="tariffId">${m.type ? tariffOptions(m) : `<option value="">Default for the meter type</option>${(S.tariffs || []).filter(t => !t.building || t.building === m.building).map(t => `<option value="${t.id}" ${m.tariffId === t.id ? 'selected' : ''}>${esc(t.name)} (${UT_LABEL[t.type]})</option>`).join('')}`}</select></div></div>
        <div class="grid g2"><div class="field"><label>How readings arrive</label><select name="comm"><option value="manual" ${m.comm === 'manual' ? 'selected' : ''}>Manual reading / CSV import</option><option value="connector" ${m.comm === 'connector' ? 'selected' : ''}>Building link (Modbus / MQTT / HTTP)</option><option value="m2m" ${m.comm === 'm2m' || m.comm === 'meterhead' ? 'selected' : ''}>M2M Solutions (API)</option></select></div>${field('Installed', 'installed', m.installed, 'date')}</div>
        <p class="muted" style="margin:0;font-size:12px">Building link: map the meter's register to the path <code>meters.${esc(m.id || 'METER-ID')}.reading</code> in the building's connection settings.</p>
        <div class="field"><label>Notes</label><textarea name="notes">${esc(m.notes || '')}</textarea></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">${ic('check')}Save meter</button>${isNew ? '' : `<button type="button" class="btn ${m.removed ? '' : 'danger'}" data-action="meterremoved" data-id="${esc(m.id)}" data-v="${m.removed ? '' : '1'}">${m.removed ? 'Restore meter' : 'Remove meter'}</button>`}</div></form>`;
  }

  /* Reading round: every meter in a building on one screen (for technicians on site). */
  function viewReadingsCapture(bid) {
    const b = utilBld(bid); if (!b.id) return head('Record readings') + '<div class="card empty">No utility buildings yet.</div>';
    const ms = (S.meters || []).filter(m => m.building === b.id && !m.removed);
    return head(`Record readings · ${esc(b.name)}`, 'Enter the register reading for each meter; leave blank to skip', bizSelect(b.id, 'capsite')) +
      `<form class="card form" data-form="capture" data-bid="${b.id}">
        <div class="grid g2"><div class="field"><label>Date</label><input type="date" name="date" value="${today()}" max="${today()}"></div><div class="field"><label>Time</label><input type="time" name="time" value="${new Date().toTimeString().slice(0, 5)}"></div></div>
        ${ms.map(m => `<div class="cap-row" data-cap="${esc(m.id)}"><div><strong>${esc(m.id)}</strong> <small class="muted">${UT_LABEL[m.type]} · ${esc(m.location || '')}${m.tenantId ? ' · ' + esc((tenantById(m.tenantId) || {}).name || '') : ''}</small><br><small class="muted">Last: ${m.last ? fmtN(m.last.value) + ' ' + esc(m.unit) + ' on ' + dmy(m.last.ts) : 'none'}</small></div>
          <input name="v_${esc(m.id)}" type="number" step="any" min="0" inputmode="decimal" placeholder="${esc(m.unit)}" aria-label="Reading for ${esc(m.id)}"><label class="btn sm cap-photo">${ic('camera')}<input type="file" accept="image/*" capture="environment" hidden data-capphoto="${esc(m.id)}"></label></div>`).join('') || '<div class="empty">No meters in this building.</div>'}
        <button class="btn primary">${ic('check')}Save readings</button></form>`;
  }

  function viewReadingsImport() {
    const I = ui.rimp;
    let body = `<div class="card form" style="max-width:720px"><header><h2>Import meter readings</h2></header>
      <p style="margin:0">A CSV with columns for the <b>meter</b> (ID or serial number), the <b>date</b>, optionally the <b>time</b>, and the <b>reading</b>. Excel: Save As → CSV.</p>
      <div class="field"><label>CSV file</label><input type="file" accept=".csv,text/csv" data-rimpfile></div></div>`;
    if (I) {
      const rows = rimpRows(), good = rows.filter(r => r.ok);
      body += `<div class="card" style="margin-top:14px"><header><h2>Columns</h2><small>${esc(I.name)} · ${I.body.length} rows</small></header><div class="grid g4">${[['meter', 'Meter ID / serial'], ['date', 'Date'], ['time', 'Time'], ['value', 'Reading']].map(([k, l]) => `<div class="field"><label>${l}</label><select data-rimpmap="${k}"><option value="">—</option>${I.headers.map((h, i) => `<option value="${i}" ${String(I.map[k]) === String(i) ? 'selected' : ''}>${esc(h || 'Column ' + (i + 1))}</option>`).join('')}</select></div>`).join('')}</div></div>
        <div class="card" style="margin-top:14px"><header><h2>Preview</h2><small>${good.length} ready · ${rows.length - good.length} with problems</small></header><div class="table-wrap"><table><thead><tr><th>Line</th><th>Meter</th><th>Date</th><th style="text-align:right">Reading</th><th></th></tr></thead><tbody>
        ${rows.slice(0, 30).map(r => `<tr class="${r.ok ? '' : 'muted'}"><td class="mono">${r.line}</td><td>${esc(r.meter)}</td><td class="mono">${r.date ? dmy(r.date) : '—'} ${esc(r.time || '')}</td><td class="mono" style="text-align:right">${r.value != null ? fmtN(r.value) : '—'}</td><td><small>${r.ok ? '<span class="pill ok">ok</span>' : esc(r.why)}</small></td></tr>`).join('')}</tbody></table></div>
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" data-action="rimpgo" ${good.length ? '' : 'disabled'}>${ic('check')}Import ${good.length} readings</button><button class="btn" data-action="rimpclear">Start again</button></div></div>`;
    }
    return head('Import readings', 'Bring in readings from a spreadsheet or a meter-reading app') + body;
  }
  function rimpRows() {
    const I = ui.rimp; if (!I) return [];
    const g = (c, k) => (I.map[k] === '' || I.map[k] == null ? '' : c[+I.map[k]] || '');
    return I.body.map((c, i) => {
      const meter = g(c, 'meter').trim(), date = impDate(g(c, 'date')), time = (/^(\d{1,2}):(\d{2})/.exec(g(c, 'time') || g(c, 'date').split(/[ T]/)[1] || '') || []).slice(1, 3).map(x => x.padStart(2, '0')).join(':'), value = impMoney(g(c, 'value'));
      const m = (S.meters || []).find(x => x.id === meter || (x.serial && x.serial === meter));
      const why = !m ? 'unknown meter' : !date ? 'no date' : value == null ? 'no reading' : '';
      return { line: I.headerRow + i + 2, meter, date, time, value, ok: !why, why, meterId: m && m.id };
    });
  }

  function viewTenants(bid) {
    const b = utilBld(bid); if (!b.id) return head('Tenants') + '<div class="card empty">No utility buildings yet.</div>';
    const ts = (S.tenants || []).filter(t => t.building === b.id);
    return head(`Tenants · ${esc(b.name)}`, 'Who is billed for which meters', `${bizSelect(b.id, 'tsite')}${isStaff() ? `<a class="btn primary sm" href="#/recoveries/tenant/new/${b.id}">${ic('plus')}Add tenant</a>` : ''}`) +
      `<div class="card">${ts.length ? `<div class="table-wrap"><table><thead><tr><th>Tenant</th><th>Unit</th><th class="hide-sm">Contact</th><th>Meters</th><th></th></tr></thead><tbody>${ts.map(t => { const ms = (S.meters || []).filter(m => m.tenantId === t.id && !m.removed); return `<tr class="${isStaff() ? 'click' : ''} ${t.active === false ? 'muted' : ''}" ${isStaff() ? `data-href="#/recoveries/tenant/${t.id}"` : ''}><td><strong>${esc(t.name)}</strong>${t.active === false ? '<br><small>moved out</small>' : ''}</td><td>${esc(t.unit || '—')}</td><td class="hide-sm">${esc(t.contact || '')}<br><small>${esc(t.email || 'no email: statement not emailed')}</small></td><td>${ms.map(m => `<a href="#/meters/meter/${encodeURIComponent(m.id)}">${esc(m.id)}</a>`).join(', ') || '<small class="muted">none: assign meters on the meter page</small>'}</td><td>${t.zoho && t.zoho.contactId ? '<span class="pill ok">In Zoho</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">No tenants yet.</div>'}</div>`;
  }
  function viewTenantEdit(id, bid) {
    const isNew = id === 'new', t = isNew ? { building: bid || utilBld().id, active: true } : tenantById(id);
    if (!t || !isStaff()) return head('Tenant not found');
    return head(isNew ? 'Add tenant' : `Edit ${esc(t.name)}`, esc(bld(t.building).name || ''), `<a class="btn sm" href="#/recoveries/tenants/${t.building}">${ic('back')}Tenants</a>`) +
      `<form class="card form" data-form="tenant" data-id="${isNew ? '' : t.id}" style="max-width:640px">
        <div class="field"><label>Building</label><select name="building">${bizBuildings().map(x => `<option value="${x.id}" ${x.id === t.building ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="grid g2">${field('Tenant (company) name', 'name', t.name, 'text', 'required')}${field('Unit / shop', 'unit', t.unit, 'text', 'placeholder="e.g. Shop 4"')}</div>
        <div class="grid g2">${field('Contact person', 'contact', t.contact)}${field('Mobile', 'phone', t.phone, 'tel')}</div>
        <div class="grid g2">${field('Email for statements', 'email', t.email, 'email')}${field('VAT number', 'vatNo', t.vatNo)}</div>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="active" ${t.active !== false ? 'checked' : ''}> Current tenant (untick when they move out)</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">${ic('check')}Save tenant</button>${isNew ? '' : `<button type="button" class="btn danger" data-action="deltenant" data-id="${t.id}">Delete</button>`}</div></form>`;
  }

  function viewRuns() {
    const runs = S.recoveries || [];
    return head('Billing runs', 'Monthly tenant recoveries from meter readings') +
      (isStaff() ? `<form class="card form" data-form="newrun" style="margin-bottom:14px"><header><h2>New billing run</h2></header><div class="grid g3"><div class="field"><label>Building</label><select name="building">${bizBuildings().map(b => `<option value="${b.id}" ${b.id === ui.site ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div><div class="field"><label>Month</label><input type="month" name="month" value="${lastMonth()}" required></div><div class="field"><label>&nbsp;</label><button class="btn primary">${ic('check')}Calculate</button></div></div></form>` : '') +
      `<div class="card">${runs.length ? `<div class="table-wrap"><table><thead><tr><th>Month</th><th>Building</th><th>Tenants</th><th style="text-align:right">Total incl. VAT</th><th>Status</th></tr></thead><tbody>${runs.map(r => `<tr class="click" data-href="#/recoveries/run/${r.id}"><td><strong>${esc(r.label)}</strong></td><td>${esc(bld(r.building).name)}</td><td>${r.lines.length}${r.warnings ? ` <span class="pill warn">${r.warnings} warning${r.warnings > 1 ? 's' : ''}</span>` : ''}</td><td class="mono" style="text-align:right">${fmtMoney(r.total)}</td><td><span class="pill ${r.status === 'approved' ? 'ok' : 'warn'}">${r.status === 'approved' ? 'Approved' : 'Draft'}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No billing runs yet.</div>'}</div>`;
  }
  function viewRun(id) {
    const r = (S.recoveries || []).find(x => x.id === id); if (!r) return head('Billing run not found');
    const draft = r.status === 'draft';
    return head(`${esc(r.label)} · ${esc(bld(r.building).name)}`, `${r.lines.length} tenants · total ${fmtMoney(r.total)} incl. VAT${r.approvedAt ? ' · approved by ' + esc(r.approvedBy) + ' ' + dmy(r.approvedAt) : ''}`,
      `<a class="btn sm" href="#/recoveries/runs">${ic('back')}Billing runs</a>${isStaff() && draft ? `<a class="btn sm" href="#/recoveries/btariffs/${r.building}">Tariffs</a><button class="btn sm" data-action="runrecalc" data-id="${r.id}">Recalculate</button><button class="btn sm danger" data-action="rundelete" data-id="${r.id}">Delete</button><button class="btn sm primary" data-action="runapprove" data-id="${r.id}">${ic('check')}Approve & email statements</button>` : ''}${!draft && isStaff() ? `<a class="btn sm" href="#/service/tracker">${ic('list')}Billing tracker</a>` : ''}`) +
      (draft && r.warnings ? `<div class="banner bad"><span class="grow"><strong>${r.warnings} warning${r.warnings > 1 ? 's' : ''}.</strong> Check the readings below before approving; meters without enough readings are billed as zero.</span></div>` : '') +
      (draft ? '<div class="banner ok"><span class="grow">Draft: add or correct readings, then <b>Recalculate</b>. <b>Approve</b> emails each tenant their statement and adds them to the billing tracker for invoicing.</span></div>' : '') +
      `<div class="grid g2">${r.lines.map(l => `<div class="card"><header><h2>${esc(l.tenant)}</h2><small>${esc(l.unit || '')}</small></header>
        ${l.items.length ? l.items.map(it => `<div class="ru-item"><div class="ru-head"><a href="#/meters/meter/${encodeURIComponent(it.meterId)}"><strong>${esc(it.meterId)}</strong></a> <small class="muted">${UT_LABEL[it.type]} · ${esc(it.tariff)}</small></div>
          <small class="mono">${it.open ? fmtN(it.open.value) + ' (' + dmy(it.open.ts) + ')' : '—'} → ${it.close ? fmtN(it.close.value) + ' (' + dmy(it.close.ts) + ')' : '—'}${it.multiplier !== 1 ? ' × ' + it.multiplier : ''} = <b>${fmtN(it.consumption, 2)} ${esc(it.unit)}</b></small>
          ${it.warnings.map(w => `<div class="ru-warn">${ic('alert')}${esc(w)}</div>`).join('')}
          ${it.charges.length ? `<table class="ru-ch">${it.charges.map(c => `<tr><td>${esc(c.desc)}</td><td class="mono">${fmtN(c.qty, 3)} × ${fmtRate(c.rate)}</td><td class="mono" style="text-align:right">${fmtMoney(c.amount)}</td></tr>`).join('')}</table>` : ''}</div>`).join('') : '<p class="muted">No meters assigned to this tenant.</p>'}
        <dl class="kv ltotals"><dt>Subtotal</dt><dd>${fmtMoney(l.subtotal)}</dd><dt>VAT</dt><dd>${fmtMoney(l.vat)}</dd><dt><strong>Total</strong></dt><dd><strong>${fmtMoney(l.total)}</strong></dd></dl>
        <small class="muted">${l.emailed ? 'Statement emailed ' + dmy(l.emailed) : (tenantById(l.tenantId) || {}).email ? '' : 'No email address: statement not emailed'}${l.invoice && l.invoice.number ? ' · Zoho invoice ' + esc(l.invoice.number) : ''}</small></div>`).join('')}</div>`;
  }
  /* Tariffs: your tariffs (editable) and the municipal tariff library to copy from. All amounts exclude VAT. */
  const MONTHS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const TU = { electricity: 'kWh', water: 'kL', solar: 'kWh' };
  function viewTariffs() {
    if (!isStaff()) return head('Tariffs');
    if (!ui.tlib) { ui.tlib = { loading: true }; api('GET', '/api/tariffs/library').then(r => { ui.tlib = r; if (current.key === 'recoveries/tariffs') render(true); }).catch(e => { ui.tlib = { error: e.message }; }); }
    const tf = S.tariffs || [], tab = ui.tfTab || 'mine';
    const tabs = `<div class="seg noprint" role="tablist">${[['mine', `Your tariffs (${tf.length})`], ['library', 'Tariff library']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-action="tftab" data-v="${k}">${l}</button>`).join('')}</div>`;
    return head('Tariffs', 'Rates used to bill tenants. All amounts exclude VAT; VAT is added on the statement.') + tabs +
      (tab === 'library' ? tariffLibraryView() : `<div class="banner" style="margin-bottom:12px"><span class="grow">Business, residential and water tariffs for Johannesburg, Tshwane and Govan Mbeki are in the <a href="#" data-action="tftab" data-v="library">Tariff library</a>. You can also pick them straight from a building's tariff dropdowns.</span></div>` +
`<form class="form" data-form="tariffs"><div id="tfrows" class="tf-list">${tf.map(tariffCard).join('') || '<div class="card empty">No tariffs yet. Add one from the tariff library.</div>'}</div>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button type="button" class="btn sm" data-action="tftab" data-v="library">${ic('list')}Add from the library</button><button type="button" class="btn sm" data-action="addtariff">${ic('plus')}Blank tariff</button><button class="btn primary">${ic('check')}Save tariffs</button></div></form>`);
  }
  const fmtR = v => fmtRate(v);
  function tariffSummary(t) {
    const u = TU[t.type], bl = list => list.map((b, k) => { const from = k ? list[k - 1].upTo : 0; return `${list.length === 1 ? 'all' : b.upTo == null ? `above ${fmtN(from, 0)}` : `${fmtN(from, 0)}–${fmtN(b.upTo, 0)}`}: <strong>${fmtR(b.rate)}</strong>`; }).join(' · ');
    return `<div class="tf-sum">
      <div><small>${t.winterBlocks ? `Summer (${MONTHS3.filter((m, k) => !t.winterMonths.includes(k + 1)).length} months)` : 'Rates'} per ${u}</small><div>${bl(t.blocks)}</div></div>
      ${t.winterBlocks ? `<div><small>Winter (${t.winterMonths.map(m => MONTHS3[m - 1]).join(', ')}) per ${u}</small><div>${bl(t.winterBlocks)}</div></div>` : ''}
      ${t.fixed.length ? `<div><small>Fixed per month</small><div>${t.fixed.map(x => `${esc(x.desc)} <strong>${fmtMoney(x.amount)}</strong>`).join(' · ')}</div></div>` : ''}
      ${t.sewer ? `<div><small>Sewer per kL of water</small><div>${t.sewer.blocks.map(b => `${b.upTo == null ? 'rest' : 'to ' + b.upTo + ' kL'}: <strong>${fmtR(b.rate)}</strong>${b.pct !== 100 ? ` on ${b.pct}%` : ''}`).join(' · ')}${t.sewer.fixed.map(x => ` · ${esc(x.desc)} <strong>${fmtMoney(x.amount)}</strong>`).join('')}</div></div>` : t.sewerPct ? `<div><small>Sewer</small><div>${t.sewerPct}% of the water charge</div></div>` : ''}
      ${t.levy ? `<div><small>Levy</small><div>${esc(t.levy.desc)} <strong>${fmtR(t.levy.rate)}</strong>/${u}${t.levy.freeUnits ? ` above ${t.levy.freeUnits} ${u}` : ''}</div></div>` : ''}
      ${t.surchargePct ? `<div><small>Surcharge</small><div><strong>${t.surchargePct}%</strong> on the charges</div></div>` : ''}</div>`;
  }
  function tariffLibraryView() {
    const L = ui.tlib;
    if (!L || L.loading) return '<div class="card empty pulse">Loading the tariff library…</div>';
    if (L.error) return `<div class="card empty">${esc(L.error)}</div>`;
    const mine = new Set((S.tariffs || []).map(t => t.libraryKey).filter(Boolean));
    const groups = [...new Set(L.library.map(t => (t.region || 'Gauteng') + '|' + t.municipality))];
    return `<div class="banner" style="margin-bottom:14px"><span class="grow">Published municipal tariffs, excluding VAT, grouped by province. <strong>Add</strong> copies a tariff into your tariffs, where you can change it. Check the figures against the municipality's tariff booklet before billing.</span></div>` +
      groups.map(g => `<h2 class="tf-group">${esc(g.split('|')[0])} · ${esc(g.split('|')[1])}</h2><div class="tf-list">${L.library.filter(t => (t.region || 'Gauteng') + '|' + t.municipality === g).map(t => `<div class="card tf-lib" data-libkey="${esc(t.libraryKey)}">
        <header><div><h3>${esc(t.name)}</h3><small class="muted">${esc(t.category || '')} · ${UT_LABEL[t.type]} · ${dmy(t.effective)} – ${t.until ? dmy(t.until) : 'open'}</small>${tfEnded(t) ? ' <span class="pill warn"><i></i>Ended: for older months only</span>' : ''}</div>
          ${mine.has(t.libraryKey) ? '<span class="pill ok"><i></i>In your tariffs</span>' : `<button class="btn primary sm" data-action="tflibadd" data-key="${esc(t.libraryKey)}">${ic('plus')}Add</button>`}</header>
        ${tariffSummary(t)}
        ${(t.notes || []).length ? `<ul class="tf-notes">${t.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        ${tariffTry(t.libraryKey, t.type)}
        ${srcLink(t.source)}</div>`).join('')}</div>`).join('') +
      `<div class="card" style="margin-top:14px"><header><h2>Not in the library yet</h2></header><div class="rows">${L.pending.map(p => `<div class="row"><div class="grow"><strong>${esc(p.municipality)}</strong> · ${esc(p.what)}<br><small class="muted">${esc(p.why)}</small></div></div>`).join('')}</div></div>`;
  }
  const srcLink = src => (src ? `<small class="muted">Source: ${src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.title)}</a>` : esc(src.title)}</small>` : '');
  const tfEnded = t => !!(t.until && t.until < today());
  const tariffTry = (id, type) => `<div class="tf-try" data-tftry="${esc(id)}"><label>Try it</label><input type="number" min="0" step="any" name="tq" placeholder="${TU[type]} in a month" aria-label="Consumption in ${TU[type]}"><input type="month" name="tm" value="${today().slice(0, 7)}" aria-label="Month"><button type="button" class="btn sm" data-action="tfquote">Work out</button><div class="tf-out"></div></div>`;
  const blockRow = (b, pct) => `<div class="tf-block${pct ? ' pct' : ''}" data-block><input name="upTo" type="number" step="any" min="0" value="${b.upTo == null ? '' : b.upTo}" placeholder="and above" aria-label="Up to"><input name="rate" type="number" step="any" min="0" value="${b.rate ?? ''}" placeholder="R per unit" aria-label="Rate in rand per unit">${pct ? `<input name="pct" type="number" step="any" min="0" max="100" value="${b.pct ?? 100}" aria-label="Share of water counted as sewage (%)" title="% of the water counted">` : ''}<button type="button" class="btn sm" data-action="rmblock" aria-label="Remove block" title="Remove block">${ic('x')}</button></div>`;
  const fixedRow = x => `<div class="tf-fixed" data-fixed><input name="fdesc" value="${esc(x.desc || '')}" placeholder="Description" aria-label="Charge description"><input name="famount" type="number" step="0.01" min="0" value="${x.amount ?? ''}" placeholder="R per month" aria-label="Rand per month"><button type="button" class="btn sm" data-action="rmfixed" aria-label="Remove charge" title="Remove charge">${ic('x')}</button></div>`;
  const blockList = (attr, list, pct) => `<div data-${attr}>${(list && list.length ? list : [{ upTo: null, rate: '' }]).map(b => blockRow(b, pct)).join('')}</div><button type="button" class="btn sm" data-action="addblock" data-into="${attr}" style="width:max-content">${ic('plus')}Add block</button>`;
  function tariffCard(t) {
    t = t || { name: '', type: 'electricity', fixed: [], blocks: [{ upTo: null, rate: '' }], winterBlocks: null, winterMonths: [6, 7, 8], levy: null, surchargePct: 0, sewer: null, sewerPct: 0 };
    const u = TU[t.type] || 'unit', open = !t.id || ui.tfOpen === t.id;
    return `<details class="card form tf-card" data-tariff data-id="${esc(t.id || '')}" data-lib="${esc(t.libraryKey || '')}" ${open ? 'open' : ''}>
      <summary><div class="tf-head"><div class="grow"><strong>${esc(t.name || 'New tariff')}</strong><br><small class="muted">${UT_LABEL[t.type] || ''}${t.building ? ` · <span class="pill info"><i></i>Only ${esc(bld(t.building).name)}</span>` : t.municipality ? ' · ' + esc(t.municipality) : ''}${t.effective ? ' · from ' + dmy(t.effective) : ''}${tfEnded(t) ? ` · <span class="pill warn"><i></i>Ended ${dmy(t.until)}</span>` : ''}${(S.meters || []).filter(m => m.tariffId === t.id && !m.removed).length ? ` · on ${(S.meters || []).filter(m => m.tariffId === t.id && !m.removed).length} meter(s)` : ''}</small></div><span class="btn sm">Edit</span></div>
      ${t.id ? tariffSummary(t) : ''}${srcLink(t.source)}</summary>
      <div class="grid g2">${field('Name', 't_name', t.name)}<div class="field"><label>Type</label><select name="t_type">${['electricity', 'water', 'solar'].map(x => `<option value="${x}" ${t.type === x ? 'selected' : ''}>${UT_LABEL[x]}</option>`).join('')}</select></div></div>
      <div class="field"><label>${t.winterBlocks ? 'Summer rates' : 'Rates'}: up to (${u} per month) and rand per ${u}. Leave the last "up to" empty.</label>${blockList('blocks', t.blocks)}</div>
      <label class="tf-check"><input type="checkbox" name="t_seasonal" data-change="tfseason" ${t.winterBlocks ? 'checked' : ''}> Different rates in winter</label>
      <div class="tf-winter" ${t.winterBlocks ? '' : 'hidden'}><div class="field"><label>Winter months</label><div class="tf-months">${MONTHS3.map((m, k) => `<label><input type="checkbox" name="t_wm" value="${k + 1}" ${(t.winterMonths && t.winterMonths.length ? t.winterMonths : [6, 7, 8]).includes(k + 1) ? 'checked' : ''}>${m}</label>`).join('')}</div></div>
        <div class="field"><label>Winter rates per ${u}</label>${blockList('winter', t.winterBlocks || t.blocks)}</div></div>
      <div class="field"><label>Fixed charges per month (rand, per meter)</label><div data-fixedlist>${(t.fixed || []).map(fixedRow).join('')}</div><button type="button" class="btn sm" data-action="addfixed" style="width:max-content">${ic('plus')}Add fixed charge</button></div>
      <div class="grid g2">
        <div class="field"><label>Levy per ${u} (e.g. network surcharge)</label><div class="tf-levy"><input name="l_desc" value="${esc(t.levy ? t.levy.desc : '')}" placeholder="Description" aria-label="Levy description"><input name="l_rate" type="number" step="any" min="0" value="${t.levy ? t.levy.rate : ''}" placeholder="R per ${u}" aria-label="Levy rand per unit"><input name="l_free" type="number" step="any" min="0" value="${t.levy && t.levy.freeUnits ? t.levy.freeUnits : ''}" placeholder="free ${u}" aria-label="Units free of the levy"></div></div>
        ${field('Surcharge % on the charges', 't_surcharge', t.surchargePct || '', 'number', 'step="0.1" min="0" max="50"')}</div>
      <div class="tf-sewer" ${t.type === 'water' ? '' : 'hidden'}>
        <div class="field"><label>Sewer per kL of water: up to (kL), rand per kL, and % of the water counted as sewage</label>${blockList('sewer', t.sewer ? t.sewer.blocks : [], true)}</div>
        <div class="field"><label>Sewer fixed charges per month</label><div data-sfixedlist>${(t.sewer ? t.sewer.fixed : []).map(fixedRow).join('')}</div><button type="button" class="btn sm" data-action="addfixed" data-into="sfixedlist" style="width:max-content">${ic('plus')}Add sewer charge</button></div>
        ${!t.sewer && t.sewerPct ? field('Or: sewer as % of the water charge', 't_sewer', t.sewerPct, 'number', 'step="1" min="0" max="200"') : '<input type="hidden" name="t_sewer" value="0">'}</div>
      ${t.id ? tariffTry(t.id, t.type) : ''}
      <button type="button" class="btn sm danger" data-action="rmtariff" style="width:max-content">Remove tariff</button></details>`;
  }
  function readTariffCard(c) {
    const v = n => (c.querySelector(`[name=${n}]`) || {}).value;
    const blocks = attr => [...c.querySelectorAll(`[data-${attr}] [data-block]`)].map(b => ({ upTo: b.querySelector('[name=upTo]').value, rate: b.querySelector('[name=rate]').value, pct: (b.querySelector('[name=pct]') || {}).value })).filter(b => b.rate !== '');
    const fixed = sel => [...c.querySelectorAll(`[data-${sel}] [data-fixed]`)].map(x => ({ desc: x.querySelector('[name=fdesc]').value, amount: x.querySelector('[name=famount]').value }));
    const seasonal = c.querySelector('[name=t_seasonal]').checked, type = v('t_type');
    const keep = (S.tariffs || []).find(t => t.id === c.dataset.id) || {};
    return { id: c.dataset.id, name: v('t_name'), type, blocks: blocks('blocks'), winterBlocks: seasonal ? blocks('winter') : null, winterMonths: [...c.querySelectorAll('[name=t_wm]:checked')].map(x => +x.value),
      fixed: fixed('fixedlist'), levy: v('l_rate') ? { desc: v('l_desc'), rate: v('l_rate'), freeUnits: v('l_free') } : null, surchargePct: v('t_surcharge'),
      sewer: type === 'water' && blocks('sewer').length ? { blocks: blocks('sewer'), fixed: fixed('sfixedlist') } : type === 'water' && fixed('sfixedlist').length ? { blocks: [], fixed: fixed('sfixedlist') } : null, sewerPct: v('t_sewer'),
      building: keep.building, libraryKey: keep.libraryKey, municipality: keep.municipality, category: keep.category, effective: keep.effective, until: keep.until, source: keep.source, notes: keep.notes };
  }

  /* ---------------- tariffs per building ---------------- */
  const tariffFits = (t, m) => t.type === m.type && (!t.building || t.building === m.building);
  const defaultTariffFor = m => (S.tariffs || []).find(t => t.type === m.type && t.building === m.building) || (S.tariffs || []).find(t => t.type === m.type && !t.building);
  const tariffOf = m => (S.tariffs || []).find(t => t.id === m.tariffId && tariffFits(t, m)) || defaultTariffFor(m);
  const tariffChoices = (type, bid) => (S.tariffs || []).filter(t => t.type === type && (!t.building || t.building === bid));
  const tariffUsers = id => [...new Set((S.meters || []).filter(m => !m.removed && (tariffOf(m) || {}).id === id).map(m => m.building))];
  /* The tariff library is offered in every tariff dropdown: picking one adds it to your tariffs when you save. */
  function tariffLib() {
    if (!ui.tlib && isStaff()) { ui.tlib = { loading: true }; api('GET', '/api/tariffs/library').then(r => { ui.tlib = r; if (['recoveries/btariffs', 'meters/setup'].includes(current.key)) render(true); }).catch(e => { ui.tlib = { error: e.message }; }); }
    return (ui.tlib && ui.tlib.library) || [];
  }
  const tariffOptions = (m, withDefault = true) => {
    const ch = tariffChoices(m.type, m.building), d = defaultTariffFor(m), have = new Set((S.tariffs || []).map(t => t.libraryKey).filter(Boolean));
    const lib = tariffLib().filter(t => t.type === m.type && !have.has(t.libraryKey));
    const groups = [...new Set(lib.map(t => `${t.region || 'Gauteng'} · ${t.municipality}`))];
    return (withDefault ? `<option value="">Default${d ? ' (' + esc(d.name) + ')' : ''}</option>` : '') +
      `<optgroup label="Your tariffs">${ch.map(t => `<option value="${t.id}" ${m.tariffId === t.id ? 'selected' : ''}>${esc(t.name)}${t.building ? ' · this building only' : ''}</option>`).join('')}</optgroup>` +
      groups.map(g => `<optgroup label="Library: ${esc(g)}">${lib.filter(t => `${t.region || 'Gauteng'} · ${t.municipality}` === g).map(t => `<option value="lib:${esc(t.libraryKey)}">${esc(t.category || '')} · ${esc(t.name)}${tfEnded(t) ? ` · ended ${dmy(t.until)}` : ''}</option>`).join('')}</optgroup>`).join('');
  };
  function viewBuildingTariffs(bid) {
    if (!isStaff()) return head('Building tariffs');
    const b = utilBld(bid); if (!b.id) return head('Building tariffs') + '<div class="card empty">No utility buildings yet.</div>';
    const ms = (S.meters || []).filter(m => m.building === b.id && !m.removed && m.type !== 'solar').sort((x, y) => String(x.location).localeCompare(String(y.location), undefined, { numeric: true }) || x.type.localeCompare(y.type));
    const used = [...new Map(ms.map(m => tariffOf(m)).filter(Boolean).map(t => [t.id, t])).values()];
    const drafts = (S.recoveries || []).filter(r => r.building === b.id && r.status === 'draft');
    const card = t => {
      const here = ms.filter(m => (tariffOf(m) || {}).id === t.id), others = tariffUsers(t.id).filter(x => x !== b.id);
      return `<div class="card tf-lib" data-btariff="${t.id}"><header><div><h3>${esc(t.name)}</h3><small class="muted">${UT_LABEL[t.type]} · ${here.length} meter${here.length === 1 ? '' : 's'} here${t.building ? ' · <span class="pill info"><i></i>This building only</span>' : others.length ? ` · also used at ${others.map(x => esc(bld(x).name)).join(', ')}` : ' · not used at other buildings'}</small></div>
        <span class="tf-acts">${t.building || !others.length ? `<a class="btn primary sm" href="#/recoveries/tariff/${t.id}/${b.id}">${ic('gear')}Edit</a>` : `<button class="btn primary sm" data-action="tfcustom" data-bid="${b.id}" data-id="${t.id}">${ic('gear')}Edit for this building only</button><a class="btn sm" href="#/recoveries/tariff/${t.id}/${b.id}">Edit for all ${others.length + 1} buildings</a>`}</span></header>
        ${tariffSummary(t)}</div>`;
    };
    return head(`Tariffs · ${esc(b.name)}`, 'The tariffs this building is billed on. Amounts exclude VAT.', `${bizSelect(b.id, 'btsite')}<a class="btn sm" href="#/recoveries/tariffs">${ic('list')}All tariffs</a>`) +
      (drafts.length ? `<div class="banner"><span class="grow">${drafts.length} draft billing run${drafts.length === 1 ? '' : 's'} (${drafts.map(r => esc(r.label)).join(', ')}) will be recalculated when you change a tariff here. Approved runs keep what was billed.</span></div>` : '') +
      `<h2 class="tf-group">Tariffs in use</h2><div class="tf-list">${used.map(card).join('') || '<div class="card empty">No tariffs linked yet. Link them to the meters below.</div>'}</div>
      <h2 class="tf-group">Tariff per meter</h2>
      <form class="card form" data-form="btariffs" data-bid="${b.id}">
        <div class="grid g2"><div class="field"><label>All electricity meters</label><select data-change="suall" data-type="electricity"><option value="-">— choose —</option>${tariffOptions({ type: 'electricity', building: b.id })}</select></div><div class="field"><label>All water meters</label><select data-change="suall" data-type="water"><option value="-">— choose —</option>${tariffOptions({ type: 'water', building: b.id })}</select></div></div>
        ${ms.length ? `<div class="table-wrap"><table><thead><tr><th>Shop / area</th><th>Meter</th><th>Tariff</th></tr></thead><tbody>${ms.map(m => `<tr><td><strong>${esc(m.location || '—')}</strong><br><small>${esc((tenantById(m.tenantId) || {}).name || (m.role === 'council' ? 'Council supply' : m.role === 'check' ? 'Check meter' : 'Common area'))}${m.tenantId ? '' : ' · not billed to a tenant'}</small></td><td>${UT_LABEL[m.type]}<br><small class="mono">${esc(m.serial || m.id)}</small></td><td><select data-sutariff="${esc(m.id)}" data-type="${m.type}" class="hsel" style="width:100%">${tariffOptions(m)}</select></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No meters yet.</div>'}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">${ic('check')}Save meter tariffs</button><a class="btn sm" href="#/recoveries/tariffs" data-action="tftab" data-v="library">${ic('plus')}Add a tariff from the library</a></div></form>`;
  }
  function viewTariffEdit(id, bid) {
    if (!isStaff()) return head('Tariff');
    const t = (S.tariffs || []).find(x => x.id === id); if (!t) return head('Tariff not found') + `<div class="card empty"><a href="#/recoveries/tariffs">All tariffs</a></div>`;
    const users = tariffUsers(id), back = bid && bld(bid).id ? `#/recoveries/btariffs/${bid}` : '#/recoveries/tariffs';
    ui.tfOpen = id;
    return head(`Edit tariff`, esc(t.name), `<a class="btn sm" href="${back}">${ic('back')}Back</a>`) +
      `<div class="banner ${users.length > 1 ? 'bad' : ''}"><span class="grow">${t.building ? `This tariff is only for <strong>${esc(bld(t.building).name)}</strong>.` : users.length ? `Changes apply to <strong>${users.length} building${users.length === 1 ? '' : 's'}</strong>: ${users.map(x => esc(bld(x).name)).join(', ')}.${bid && users.length > 1 ? ` To change it for ${esc(bld(bid).name)} only, go back and choose <em>Edit for this building only</em>.` : ''}` : 'No meters use this tariff yet.'} Draft billing runs are recalculated when you save; approved runs keep what was billed.</span></div>
      <form class="form" data-form="tariffone" data-id="${t.id}" data-back="${back}"><div class="tf-list">${tariffCard(t)}</div>
        <div style="display:flex;gap:8px;margin-top:14px"><button class="btn primary">${ic('check')}Save tariff</button><a class="btn sm" href="${back}">Cancel</a></div></form>`;
  }

  /* ---------------- utility: guided building setup ---------------- */
  const SETUP_STEPS = ['Building', 'Shops & meters', 'Meter tree', 'Bulk check', 'Tariffs', 'Done'];
  function setupStepper(bid, step) {
    return `<ol class="stepper">${SETUP_STEPS.map((l, i) => { const n = i + 1, can = bid !== 'new' || n === 1; return `<li class="${n === step ? 'on' : n < step ? 'done' : ''}">${can ? `<a href="#/meters/setup/${bid}/${n}">` : '<span>'}<b>${n < step ? '✓' : n}</b><span>${l}</span>${can ? '</a>' : '</span>'}</li>`; }).join('')}</ol>`;
  }
  function setupInitialRows(bid) {
    const ms = (S.meters || []).filter(m => m.building === bid && !m.removed);
    const serial = (pred, type) => (ms.find(m => pred(m) && m.type === type) || {}).serial || '';
    const rows = (S.tenants || []).filter(t => t.building === bid && t.active !== false).map(t => ({ tenantId: t.id, kind: 'shop', unit: t.unit || '', name: t.name, email: t.email || '', elecSerial: serial(m => m.tenantId === t.id, 'electricity'), waterSerial: serial(m => m.tenantId === t.id, 'water') }));
    const kindOf = m => (m.role === 'council' ? 'council' : m.role === 'check' ? 'check' : 'common');
    const groups = [...new Map(ms.filter(m => !m.tenantId && m.type !== 'solar').map(m => [(m.location || 'Common area') + '|' + kindOf(m), { loc: m.location || 'Common area', kind: kindOf(m) }])).values()].sort((x, y) => ['council', 'check', 'common'].indexOf(x.kind) - ['council', 'check', 'common'].indexOf(y.kind));
    rows.unshift(...groups.filter(g => g.kind !== 'common').map(g => ({ kind: g.kind, unit: g.loc, elecSerial: serial(m => !m.tenantId && (m.location || 'Common area') === g.loc && kindOf(m) === g.kind, 'electricity'), waterSerial: serial(m => !m.tenantId && (m.location || 'Common area') === g.loc && kindOf(m) === g.kind, 'water') })));
    const commons = groups.filter(g => g.kind === 'common').map(g => g.loc);
    commons.forEach(loc => rows.push({ kind: 'common', unit: loc, name: '', email: '', elecSerial: serial(m => !m.tenantId && (m.location || 'Common area') === loc, 'electricity'), waterSerial: serial(m => !m.tenantId && (m.location || 'Common area') === loc, 'water') }));
    return rows.length ? rows : [{ kind: 'council', unit: 'Council supply' }, { kind: 'shop' }, { kind: 'shop' }, { kind: 'common', unit: 'Common area' }];
  }
  const setupRow = (r = { kind: 'shop' }) => `<div class="su-row ${r.kind !== 'shop' && r.kind ? 'is-common' : ''} sk-${r.kind || 'shop'}" data-surow data-tenant="${esc(r.tenantId || '')}">
      <div class="field"><label>Type</label><select name="kind" data-change="sukind"><option value="shop" ${!r.kind || r.kind === 'shop' ? 'selected' : ''}>Shop</option><option value="common" ${r.kind === 'common' ? 'selected' : ''}>Common area</option><option value="council" ${r.kind === 'council' ? 'selected' : ''}>Council / bulk meter</option><option value="check" ${r.kind === 'check' ? 'selected' : ''}>Check meter (sub-main)</option></select></div>
      <div class="field"><label>Shop no. / area</label><input name="unit" value="${esc(r.unit || '')}" placeholder="${r.kind === 'common' ? 'Common area' : 'Shop 4'}"></div>
      <div class="field su-tenant"><label>Tenant</label><input name="name" value="${esc(r.name || '')}" placeholder="Tenant name"></div>
      <div class="field su-tenant"><label>Statement email</label><input name="email" type="email" value="${esc(r.email || '')}" placeholder="optional"></div>
      <div class="field"><label>${ic('bolt')} Electricity meter serial</label><input name="elecSerial" value="${esc(r.elecSerial || '')}" spellcheck="false" autocapitalize="characters"></div>
      <div class="field"><label>${ic('wind')} Water meter serial</label><input name="waterSerial" value="${esc(r.waterSerial || '')}" spellcheck="false" autocapitalize="characters"></div>
      <button type="button" class="btn sm" data-action="surm" aria-label="Remove row" title="Remove row">${ic('x')}</button></div>`;
  function viewSetup(bid, stepRaw) {
    if (!isStaff()) return head('Building setup') + '<div class="card empty">Only the service desk and admin can set up buildings.</div>';
    bid = bid || 'new';
    const step = bid === 'new' ? 1 : Math.min(6, Math.max(1, +stepRaw || 2));
    const b = bid === 'new' ? {} : (S.buildings.find(x => x.id === bid) || {});
    if (bid !== 'new' && !b.id) return head('Building not found');
    let body = '';
    if (step === 1) {
      const others = S.buildings.filter(x => !(x.divisions || []).includes('utility'));
      body = `<form class="card form" data-form="sustep1" data-bid="${bid === 'new' ? '' : b.id}" style="max-width:640px">
        <header><h2>${bid === 'new' ? 'New building' : 'Building details'}</h2></header>
        ${bid === 'new' && others.length ? `<div class="field"><label>Add utility management to an existing building</label><select name="existing"><option value="">— no, a new building —</option>${others.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div><p class="muted" style="margin:0;font-size:12px">Or fill in a new building below.</p>` : ''}
        ${field('Building name', 'name', b.name, 'text', 'placeholder="e.g. Sandton Retail Centre"')}<div class="grid g2">${field('Owner / client', 'client', b.client, 'text', 'placeholder="e.g. Sandton Retail Holdings"')}${field('Area', 'area', b.area)}</div>
        <button class="btn primary">Save and continue ${ic('back').replace('<svg', '<svg style="transform:scaleX(-1)"')}</button></form>`;
    } else if (step === 2) {
      body = `<form class="card form" data-form="sustep2" data-bid="${b.id}">
        <header><h2>Shops, common areas and meters</h2></header>
        <p class="muted" style="margin:0">One row per shop, common area, <b>council (bulk) meter</b> or check meter. Type the <b>serial number</b> printed on each meter: an existing meter with that serial is linked, otherwise it is added.</p>
        <div id="surows">${setupInitialRows(b.id).map(setupRow).join('')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn sm" data-action="suadd" data-kind="council">${ic('plus')}Add the council meter</button><button type="button" class="btn sm" data-action="suadd" data-kind="check">${ic('plus')}Add a check meter</button><button type="button" class="btn sm" data-action="suadd" data-kind="shop">${ic('plus')}Add a shop</button><button type="button" class="btn sm" data-action="suadd" data-kind="common">${ic('plus')}Add a common area</button></div>
        <div id="suerr"></div>
        <div><button class="btn primary">Save and check meters ${ic('back').replace('<svg', '<svg style="transform:scaleX(-1)"')}</button></div></form>`;
    } else if (step === 3) {
      body = viewSetupTree(b);
    } else if (step === 4) {
      const C = (ui.suCheck || {})[b.id];
      if (!C) setTimeout(() => runBulkCheck(b.id), 0);
      body = `<div class="card"><header><h2>Bulk check</h2><button class="btn sm" data-action="sucheck" data-bid="${b.id}">${ic('reset')}Check all meters again</button></header>
        ${!C ? '<div class="empty pulse">Checking every meter…</div>' : `<div class="su-sum"><span class="pill ok"><i></i>${C.ok_} OK</span><span class="pill warn"><i></i>${C.warn} to watch</span><span class="pill bad"><i></i>${C.bad} need attention</span><small class="muted">checked ${hhmm(C.checkedAt)}</small></div>
          ${C.meters.length ? `<div class="su-checks">${C.meters.sort((x, y) => ({ bad: 0, warn: 1, ok: 2 }[x.status] - { bad: 0, warn: 1, ok: 2 }[y.status]) || String(x.location).localeCompare(String(y.location))).map(m => `<div class="su-check ${m.status}">
            <div class="su-ch-head"><span class="pill ${m.status === 'ok' ? 'ok' : m.status === 'warn' ? 'warn' : 'bad'}"><i></i>${m.status === 'ok' ? 'OK' : m.status === 'warn' ? 'Watch' : 'Attention'}</span><div class="grow"><strong>${esc(m.location || '—')}</strong> · ${UT_LABEL[m.type]} <span class="mono">${esc(m.serial || m.id)}</span><br><small class="muted">${esc(m.tenant || 'Common area')} · last reading ${m.readings[0] ? fmtN(m.readings[0].value) + ' ' + esc(m.unit) + ' on ' + dmy(m.readings[0].ts) : 'none'}</small></div><button class="btn sm" data-action="suopen" data-id="${esc(m.id)}">${ui.suOpen === m.id ? 'Close' : 'Check meter'}</button></div>
            ${m.issues.length ? `<ul class="su-issues">${m.issues.map(i => `<li class="${i.level}">${esc(i.text)}</li>`).join('')}</ul>` : ''}
            ${ui.suOpen === m.id ? `<div class="su-detail"><div class="grid g2"><div><small class="muted">LAST READINGS</small>${m.readings.length ? `<table class="ru-ch">${m.readings.map(r => `<tr><td class="mono">${dmy(r.ts)} ${hhmm(r.ts)}</td><td class="mono" style="text-align:right">${fmtN(r.value)} ${esc(m.unit)}</td><td><small>${esc(r.source || '')}</small></td></tr>`).join('')}</table>` : '<p class="muted">No readings yet.</p>'}<a href="#/meters/meter/${encodeURIComponent(m.id)}" class="muted" style="font-size:12px">Full history</a></div>
              <form class="form" data-form="sutest" data-meter="${esc(m.id)}" data-bid="${b.id}"><small class="muted">TAKE A READING NOW</small><div class="field"><input name="value" type="number" step="any" min="0" inputmode="decimal" placeholder="Reading in ${esc(m.unit)}" required></div><div class="field"><label>Photo (optional)</label><input type="file" accept="image/*" capture="environment" data-mphoto></div><button class="btn sm primary">${ic('check')}Save reading and recheck</button></form></div></div>` : ''}
          </div>`).join('')}</div>` : '<div class="empty">No meters yet. Add serials in step 2.</div>'}
          <div style="margin-top:12px"><a class="btn primary" href="#/meters/setup/${b.id}/5">Continue to tariffs ${ic('back').replace('<svg', '<svg style="transform:scaleX(-1)"')}</a></div>`}</div>`;
    } else if (step === 5) {
      const ms = (S.meters || []).filter(m => m.building === b.id && !m.removed && m.type !== 'solar').sort((x, y) => String(x.location).localeCompare(String(y.location), undefined, { numeric: true }) || x.type.localeCompare(y.type));
      const opts = (type, sel) => tariffOptions({ type, building: b.id, tariffId: sel });
      body = `<form class="card form" data-form="sustep4" data-bid="${b.id}"><header><h2>Link tariffs</h2><span style="display:flex;gap:8px"><a class="btn sm" href="#/recoveries/btariffs/${b.id}">Edit tariff rates</a><a class="btn sm" href="#/meters/setup/${b.id}/6">Skip for now</a></span></header>
        ${(S.tariffs || []).some(t => /sample/i.test(t.name)) ? '<div class="banner bad" style="margin:0"><span class="grow">Some tariffs still have <b>sample rates</b>. Set your real rates under “Edit tariff rates” before billing.</span></div>' : ''}
        <div class="grid g2"><div class="field"><label>Apply to all electricity meters</label><select data-change="suall" data-type="electricity"><option value="-">— choose —</option>${opts('electricity')}</select></div><div class="field"><label>Apply to all water meters</label><select data-change="suall" data-type="water"><option value="-">— choose —</option>${opts('water')}</select></div></div>
        ${ms.length ? `<div class="table-wrap"><table><thead><tr><th>Shop / area</th><th>Meter</th><th>Tariff</th></tr></thead><tbody>${ms.map(m => `<tr><td><strong>${esc(m.location || '—')}</strong><br><small>${esc((tenantById(m.tenantId) || {}).name || 'Common area')}</small></td><td>${UT_LABEL[m.type]}<br><small class="mono">${esc(m.serial || m.id)}</small></td><td><select data-sutariff="${esc(m.id)}" data-type="${m.type}" style="width:100%;padding:8px;background:var(--bg2);border:1px solid var(--line2);border-radius:8px">${opts(m.type, m.tariffId)}</select></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No meters yet.</div>'}
        <div><button class="btn primary">Save tariffs and finish ${ic('back').replace('<svg', '<svg style="transform:scaleX(-1)"')}</button></div></form>`;
    } else {
      const ms = (S.meters || []).filter(m => m.building === b.id && !m.removed), ts = (S.tenants || []).filter(t => t.building === b.id && t.active !== false);
      const commons = new Set(ms.filter(m => !m.tenantId && m.type !== 'solar' && !['council', 'check'].includes(m.role)).map(m => m.location)).size, bulk = ms.filter(m => ['council', 'check'].includes(m.role)).length;
      body = `<div class="card" style="max-width:720px"><header><h2>${esc(b.name)} is set up</h2><span class="pill ok"><i></i>Ready</span></header>
        <dl class="kv"><dt>Shops (tenants)</dt><dd>${ts.length}</dd><dt>Common areas</dt><dd>${commons}</dd><dt>Council & check meters</dt><dd>${bulk}</dd><dt>Electricity meters</dt><dd>${ms.filter(m => m.type === 'electricity').length}</dd><dt>Water meters</dt><dd>${ms.filter(m => m.type === 'water').length}</dd><dt>Meters with a linked tariff</dt><dd>${ms.filter(m => m.tariffId).length} of ${ms.length} (others use the default)</dd></dl>
        <p style="margin:12px 0 0">Next: take readings at the start of each month, then create the billing run.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><a class="btn primary" href="#/meters/capture/${b.id}">${ic('check')}Record readings</a><a class="btn" href="#/recoveries/runs">${ic('doc')}Billing runs</a><a class="btn" href="#/meters/balance/${b.id}">${ic('trend')}Building balance</a><a class="btn" href="#/recoveries/btariffs/${b.id}">${ic('list')}Tariffs</a><a class="btn" href="#/meters/setup/${b.id}/2">Edit shops & meters</a></div></div>`;
    }
    return head(bid === 'new' ? 'Set up a building' : `Set up · ${esc(b.name)}`, 'Building → shops & meters → meter tree → bulk check → tariffs', bid !== 'new' ? `<a class="btn sm" href="#/meters/overview">${ic('back')}Sites</a>` : '') + setupStepper(bid, step) + body;
  }
  async function runBulkCheck(bid) {
    try { const r = await api('GET', '/api/utility/check/' + bid); ui.suCheck = ui.suCheck || {}; ui.suCheck[bid] = r; if (current.key === 'meters/setup') render(true); }
    catch (e) { toast('Bulk check failed', e.message, 'bad'); }
  }

  /* ---------------- utility: meter tree & building balance ---------------- */
  const ROLE_LABEL = { council: 'Council / bulk meter', check: 'Check meter (sub-main)', sub: 'Sub-meter' };
  const mLabel = m => `${m.location || '—'} · ${m.serial || m.id}${m.tenantId ? ' · ' + ((tenantById(m.tenantId) || {}).name || '') : ''}`;
  function treeItems(bid) { return (S.meters || []).filter(m => m.building === bid && !m.removed); }
  function viewSetupTree(b) {
    const ms = treeItems(b.id), tol = Object.assign({ electricity: 5, water: 10 }, b.balanceTolerance || {});
    const section = type => {
      const list = ms.filter(m => m.type === type || (type === 'electricity' && m.type === 'solar'));
      if (!list.length) return '';
      const parents = ms.filter(m => m.type === type);
      return `<div class="card" style="margin-bottom:14px"><header><h2>${ic(UT_ICON[type])} ${UT_LABEL[type]}</h2><button type="button" class="btn sm" data-action="tree-all" data-type="${type}">Put all shops & common areas under the council meter</button></header>
        <div class="grid split"><div><div class="tree-rows">${list.map(m => `<div class="tree-row" data-tree="${esc(m.id)}" data-type="${m.type}">
          <div class="tree-name"><strong>${esc(m.location || '—')}</strong><small class="muted">${m.type === 'solar' ? 'Solar · ' : ''}${esc(m.serial || m.id)}${m.tenantId ? ' · ' + esc((tenantById(m.tenantId) || {}).name || '') : ''}</small></div>
          ${m.type === 'solar' ? '<div class="field"><label>Role</label><input value="Solar (adds supply)" disabled></div>' : `<div class="field"><label>Role</label><select name="role" data-change="treechg">${Object.entries(ROLE_LABEL).map(([v, l]) => `<option value="${v}" ${(m.role || 'sub') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`}
          <div class="field"><label>${m.type === 'solar' ? 'Feeds into' : 'Fed from'}</label><select name="parent" data-change="treechg" ${(m.role || 'sub') === 'council' ? 'disabled' : ''}><option value="">${m.type === 'solar' ? '— not linked —' : '— top level —'}</option>${parents.filter(p => p.id !== m.id).map(p => `<option value="${esc(p.id)}" ${m.parentId === p.id ? 'selected' : ''}>${esc(mLabel(p))}</option>`).join('')}</select></div>
        </div>`).join('')}</div></div>
        <div><small class="muted">PREVIEW</small><div class="tree-preview" data-preview="${type}"></div></div></div></div>`;
    };
    setTimeout(() => ['electricity', 'water'].forEach(drawTreePreview), 0);
    return `<form data-form="sutree" data-bid="${b.id}">
      <div class="banner ok" style="margin-top:0"><span class="grow">Set the <b>council (bulk) meter</b> at the top, then choose what each meter is <b>fed from</b>. Check meters (sub-mains) can sit in between. Solar is added to the supply of the meter it feeds into.</span></div>
      ${ms.length ? section('electricity') + section('water') : '<div class="card empty">No meters yet. Add them in step 2.</div>'}
      <div class="card form"><header><h3>Balance tolerance</h3></header><div class="grid g2">${field('Electricity: allowed difference (%)', 'tolE', tol.electricity, 'number', 'step="0.5" min="0" max="50"')}${field('Water: allowed difference (%)', 'tolW', tol.water, 'number', 'step="0.5" min="0" max="50"')}</div>
        <div><button class="btn primary">Save tree and check meters ${ic('back').replace('<svg', '<svg style="transform:scaleX(-1)"')}</button></div></div></form>`;
  }
  /* Live preview from the current choices on the page. */
  function drawTreePreview(type) {
    const box = document.querySelector(`[data-preview="${type}"]`); if (!box) return;
    const rows = [...document.querySelectorAll('[data-tree]')].map(r => ({ id: r.dataset.tree, type: r.dataset.type, role: (r.querySelector('[name=role]') || {}).value || 'sub', parent: r.querySelector('[name=parent]').value, m: meterById(r.dataset.tree) }))
      .filter(x => x.type === type || (type === 'electricity' && x.type === 'solar'));
    const ids = new Set(rows.map(r => r.id));
    const kids = id => rows.filter(r => r.parent === id && r.role !== 'council');
    const seen = new Set();
    const li = r => { if (seen.has(r.id)) return `<li class="tp-loop">${esc(mLabel(r.m))} · loop!</li>`; seen.add(r.id); const k = kids(r.id); return `<li class="tp-${r.type === 'solar' ? 'solar' : r.role}"><span>${r.type === 'solar' ? '☀ ' : ''}${esc(mLabel(r.m))}${r.role === 'council' ? ' <b>COUNCIL</b>' : r.role === 'check' ? ' <b>CHECK</b>' : ''}</span>${k.length ? `<ul>${k.map(li).join('')}</ul>` : ''}</li>`; };
    const tops = rows.filter(r => r.role === 'council' || !r.parent || !ids.has(r.parent));
    const council = tops.filter(r => r.role === 'council'), loose = tops.filter(r => r.role !== 'council');
    box.innerHTML = (council.length ? `<ul class="tp">${council.map(li).join('')}</ul>` : '<p class="muted" style="margin:6px 0">No council meter yet: set one meter’s role to “Council / bulk meter”.</p>') +
      (loose.length ? `<p class="tp-loose">Not under the council meter: ${loose.map(r => esc(mLabel(r.m))).join(', ')}</p>` : '');
    loose.forEach(r => kids(r.id).forEach(function walk(k) { seen.add(k.id); kids(k.id).forEach(walk); })); // everything reachable is placed
    const looped = rows.filter(r => !seen.has(r.id) && !loose.includes(r));
    if (looped.length) box.insertAdjacentHTML('beforeend', `<p class="tp-loose" style="color:var(--red)">Loop: ${looped.map(r => esc(mLabel(r.m))).join(' → ')} feed each other. Change one of them.</p>`);
  }

  const BAL_STATUS = { ok: ['ok', 'Balanced'], loss: ['bad', 'Losses above tolerance'], over: ['bad', 'Sub-meters exceed supply'], incomplete: ['warn', 'Readings missing'], nosupply: ['warn', 'No supply recorded'] };
  function viewBalance(bid) {
    const b = utilBld(bid); if (!b.id) return head('Building balance') + '<div class="card empty">No utility buildings yet.</div>';
    ui.balMonth = ui.balMonth || lastMonth();
    const key = b.id + '|' + ui.balMonth;
    if (!ui.bal || ui.bal.key !== key) { ui.bal = { key, loading: true }; api('GET', `/api/utility/balance/${b.id}?month=${ui.balMonth}`).then(r => { ui.bal = { key, r }; if (current.key === 'meters/balance') render(true); }).catch(e => { ui.bal = { key, error: e.message }; if (current.key === 'meters/balance') render(true); }); }
    const top = `<div class="bal-bar">${bizSelect(b.id, 'balsite')}<input type="month" class="hsel" data-change="balmonth" value="${ui.balMonth}" max="${today().slice(0, 7)}" aria-label="Month">${isStaff() ? `<a class="btn sm" href="#/meters/setup/${b.id}/3">${ic('gear')}Meter tree</a>` : ''}</div>`;
    let body;
    if (ui.bal.loading) body = '<div class="card empty pulse">Working out the balance…</div>';
    else if (ui.bal.error) body = `<div class="card empty">${esc(ui.bal.error)}</div>`;
    else {
      const T = ui.bal.r.trees;
      body = ['electricity', 'water'].map(type => {
        const t = T[type]; if (!t.councils.length && !t.loose.length) return '';
        const summary = t.councils.map(c => c.balance ? balSummary(c, type) : `<div class="card"><header><h2>${ic(UT_ICON[type])} ${UT_LABEL[type]}</h2></header><p class="muted" style="margin:0">The council meter ${esc(c.serial || c.id)} has no meters under it yet. <a href="#/meters/setup/${b.id}/3">Set up the meter tree</a>.</p></div>`).join('') ||
          `<div class="card"><header><h2>${ic(UT_ICON[type])} ${UT_LABEL[type]}</h2><span class="pill warn">No council meter</span></header><p class="muted" style="margin:0">Add the council (bulk) ${type} meter and put the other meters under it to balance the building.</p></div>`;
        const tree = `<div class="card"><header><h3>${UT_LABEL[type]} meter tree · ${esc(ui.bal.r.label)}</h3><small class="muted">tolerance ±${t.tolerance}%</small></header><ul class="bt">${[...t.councils, ...t.loose].map(n => balNode(n)).join('')}</ul>
          ${t.loose.length ? `<p class="tp-loose">Not under a council meter: ${t.loose.map(n => esc(n.location || n.serial)).join(', ')}</p>` : ''}${t.orphanSolar.length ? `<p class="tp-loose">Solar not linked: ${t.orphanSolar.map(n => esc(n.serial || n.id)).join(', ')}</p>` : ''}</div>`;
        return `<div class="grid split" style="margin-bottom:14px">${summary}${tree}</div>`;
      }).join('') || `<div class="card empty">No meters yet.${isStaff() ? ` <a href="#/meters/setup/${b.id}/2">Add meters</a>.` : ''}</div>`;
    }
    return head(`Building balance · ${esc(b.name)}`, 'Council supply against the meters it feeds', '') + top + body;
  }
  function balSummary(c, type) {
    const bl = c.balance, st = BAL_STATUS[bl.status], unit = c.unit;
    const pct = Math.max(0, Math.min(100, bl.supply > 0 ? bl.metered / bl.supply * 100 : 0));
    return `<div class="card bal-sum ${st[0]}"><header><h2>${ic(UT_ICON[type])} ${UT_LABEL[type]}</h2><span class="pill ${st[0]}"><i></i>${st[1]}</span></header>
      <dl class="kv"><dt>Council meter ${esc(c.serial || c.id)}</dt><dd>${fmtN(c.use, 1)} ${esc(unit)}</dd>${c.solar.length ? `<dt>+ Solar</dt><dd>${fmtN(c.solar.reduce((a, x) => a + (x.use || 0), 0), 1)} ${esc(unit)}</dd>` : ''}<dt><b>Supply</b></dt><dd><b>${fmtN(bl.supply, 1)} ${esc(unit)}</b></dd>
        <dt>Metered under it</dt><dd>${fmtN(bl.metered, 1)} ${esc(unit)}</dd><dt><b>${bl.diff >= 0 ? 'Unaccounted' : 'Over-metered'}</b></dt><dd><b style="${bl.status === 'ok' ? '' : 'color:var(--red)'}">${fmtN(Math.abs(bl.diff), 1)} ${esc(unit)} · ${bl.pct == null ? '—' : fmtN(Math.abs(bl.pct), 1) + '%'}</b></dd></dl>
      <div class="bal-meter"><i style="width:${pct}%"></i></div><small class="muted">${fmtN(pct, 1)}% of supply is metered · tolerance ±${bl.tolerance}%</small>
      ${bl.missing.length ? `<p class="tp-loose">Readings missing for: ${bl.missing.map(esc).join(', ')}</p>` : ''}
      ${bl.status === 'loss' ? '<p style="margin:8px 0 0;font-size:13px">Possible causes: a leak or fault, an unmetered connection or bypass, a stopped meter, or a missed reading.</p>' : bl.status === 'over' ? '<p style="margin:8px 0 0;font-size:13px">The sub-meters add up to more than the supply: check CT ratios / multipliers, a meter counted twice, or the council reading.</p>' : ''}</div>`;
  }
  function balNode(n) {
    const bl = n.balance, st = bl && BAL_STATUS[bl.status];
    return `<li class="bt-${n.role}${n.type === 'solar' ? ' bt-solar' : ''}"><div class="bt-row"><span class="bt-name"><a href="#/meters/meter/${encodeURIComponent(n.id)}">${esc(n.location || n.serial || n.id)}</a> <small class="muted">${esc(n.serial || '')}${n.tenant ? ' · ' + esc(n.tenant) : ''}${n.role === 'council' ? ' · council' : n.role === 'check' ? ' · check meter' : ''}${n.type === 'solar' ? ' · solar' : ''}</small></span>
      <span class="bt-use mono">${n.ok ? fmtN(n.use, 1) + ' ' + esc(n.unit) : '<span style="color:var(--amber)">no readings</span>'}</span>
      ${bl ? `<span class="pill ${st[0]}" title="${esc(st[1])}">${bl.pct == null ? '—' : (bl.diff >= 0 ? '' : '−') + fmtN(Math.abs(bl.pct), 1) + '%'}</span>` : ''}</div>
      ${n.solar.length || n.children.length ? `<ul>${n.solar.map(balNode).join('')}${n.children.map(balNode).join('')}</ul>` : ''}</li>`;
  }

  /* ---------------- intro / product tour (click-through) ---------------- */
  const INTRO_KEY = 'bothelec.introSeen';
  function introBms(fault) {
    const zones = [];
    const t = { 'L1-W': 22.1, 'L1-C': 22.4, 'L1-E': 21.8, 'L2-W': 22.3, 'L2-C': fault ? 26.4 : 22.6, 'L2-E': 22.0, 'L3-W': 21.7, 'L3-C': 22.2, 'L3-E': 22.5 };
    Object.entries(t).forEach(([id, temp]) => zones.push({ id, floor: +id[1], pos: id.slice(3), temp, setpoint: 22, online: true }));
    const ahus = [1, 2, 3, 4, 5, 6].map(n => ({ id: 'AHU-0' + n, status: fault && n === 2 ? 'tripped' : n === 5 ? 'off' : 'running' }));
    return { zones, ahus };
  }
  const ivA = (ms, html, cls = '') => `<div class="a ${cls}" style="--d:${ms}ms">${html}</div>`;
  const phone = (title, body) => `<div class="iv-phone"><div class="iv-notch"></div><div class="iv-phead"><img src="icon.svg" width="20" height="20" alt=""><strong>${title}</strong></div>${body}</div>`;
  const pfield = (ms, label, val) => ivA(ms, `<div class="iv-pf"><small>${label}</small><span>${val}</span><i>✓</i></div>`);
  const tstep = (ms, icon, label, detail, time, cls = '') => ivA(ms, `<div class="iv-step ${cls}"><span class="dot">${ic(icon)}</span><div><strong>${label}</strong><small>${detail}</small></div><time>${time}</time></div>`);
  const notif = (ms, ch, who, text, time) => ivA(ms, `<div class="iv-notif"><div class="iv-nh"><span class="pill ${ch === 'SMS' ? 'info' : 'ok'}">${ch}</span><small>${time}</small></div><strong>${who}</strong><small>${text}</small></div>`);

  const INTRO = [
    { tag: 'Introduction', caption: 'Welcome to Bothelec Aircon Solutions.',
      html: () => `<div class="iv-hero">${heroScene({ nodes: [] })}<div class="iv-logo">${ivA(200, '<img src="icon.svg" width="76" height="76" alt="">')}${ivA(500, '<h1>BOTHELEC AIRCON SOLUTIONS</h1>')}${ivA(900, '<p>One connected platform for service and building performance</p>')}</div></div>` },
    { tag: 'One platform', caption: 'One connected platform for your service requests, our technicians and your building’s plant, so nothing gets lost between the call and the fix.',
      html: () => `<div class="iv-hero a" style="--d:0ms">${heroScene({ nodes: [{ x: 150, y: 150, small: 'Client', label: 'Service requests', c: 'var(--cyan)' }, { x: 660, y: 140, small: 'Field team', label: 'Technicians', c: 'var(--accent)' }, { x: 430, y: 40, small: 'Building', label: 'Plant & BMS', c: '#ffd166' }] })}</div>` },
    { tag: 'Service requests', caption: 'Log a call in seconds: choose the building, the equipment and the location, describe the fault and add a photo.',
      html: () => `<div class="iv-split">${phone('New call-out', pfield(300, 'Building', 'Demonstration Building') + pfield(700, 'Equipment', 'AHU-02 · Air handling unit') + pfield(1100, 'Location', 'Level 2 · Central zone') + pfield(1500, 'Fault', 'Office not cooling, warm air') + pfield(1900, 'Urgency', '<span class="pill warn">High</span>') + pfield(2300, 'Photo', '1 attached') + ivA(2700, '<div class="iv-pbtn">Log call</div>'))}
        <div class="iv-col">${ivA(3300, `<div class="card glow iv-card"><header><h3>Bothelec service desk</h3><span class="pill ok"><i></i>Live</span></header><strong>New call BA-1048</strong><br><small>Demonstration Building · AHU-02 · High</small></div>`)}
        ${ivA(3900, `<div class="card iv-card"><header><h3>Routing</h3></header><small>Matched on skills and availability</small><br><strong>J. Mokoena assigned</strong></div>`)}</div></div>` },
    { tag: 'Live progress', caption: 'Follow every step in real time: call logged, technician assigned, on the way, on site, work completed and report ready.',
      html: () => `<div class="card iv-wide"><header><h2>Call BA-1048 · live progress</h2></header>${tstep(200, 'phone', 'Call logged', 'BA-1048 received by Bothelec', '08:12')}${tstep(800, 'users', 'Technician assigned', 'J. Mokoena allocated', '08:15')}${tstep(1400, 'route', 'On the way', 'ETA 25 minutes', '08:31')}${tstep(2000, 'pin', 'Arrived on site', 'Technician checked in', '08:56')}${tstep(2600, 'wrench', 'Work completed', 'Fan belt replaced, unit tested', '10:18')}${tstep(3200, 'card', 'Report ready', 'Signed job card available', '10:21')}</div>` },
    { tag: 'Everyone informed', caption: 'From that moment, everyone stays informed. The building manager and operations manager get an SMS or email at every step.',
      html: () => `<div class="iv-split">${phone('Building Manager', notif(300, 'SMS', 'BA-1048 · Call logged', 'Office not cooling · High', '08:12') + notif(1000, 'SMS', 'BA-1048 · On the way', 'J. Mokoena, ETA 25 min', '08:31') + notif(1700, 'Email', 'BA-1048 · Work completed', 'Fan belt replaced', '10:18') + notif(2400, 'Email', 'Signed report', 'Report, photos & signature', '10:21'))}
        ${phone('Operations Manager', notif(600, 'Email', 'BA-1048 · Call logged', 'Demonstration Building', '08:12') + notif(1300, 'Email', 'Technician assigned', 'J. Mokoena', '08:15') + notif(2000, 'Email', 'BA-1048 · Work completed', 'Unit tested', '10:18') + notif(2700, 'Email', 'Signed report', 'Shared automatically', '10:21'))}</div>` },
    { tag: 'Digital job card', caption: 'On site, the technician records the findings, the work done and photographs, and captures the customer’s signature.',
      html: () => `<div class="card iv-wide iv-job"><header><h2>Digital job card · BA-1048</h2>${ivA(4200, '<span class="pill ok"><i></i>Signed</span>')}</header>
        <div class="grid g2"><div>${ivA(200, '<small class="muted">FINDINGS</small><p>Supply fan belt worn and slipping. Low airflow to Level 2.</p>')}${ivA(700, '<small class="muted">WORK COMPLETED</small><p>Fan belt replaced and tensioned. Airflow verified.</p>')}
        ${ivA(1200, `<small class="muted">PHOTOGRAPHS</small><div class="iv-photos">${[0, 1, 2].map(i => `<span style="--d:${1300 + i * 250}ms" class="a"><svg viewBox="0 0 60 60"><rect width="60" height="60" fill="#132a30"/><circle cx="${18 + i * 8}" cy="20" r="7" fill="#3fd2e3" opacity=".6"/><path d="M0 50 20 30 34 42 44 34 60 48V60H0z" fill="#b6d433" opacity=".5"/></svg></span>`).join('')}</div>`)}</div>
        <div>${ivA(2200, `<small class="muted">CUSTOMER SIGNATURE</small><div class="iv-sig"><svg viewBox="0 0 300 110"><path class="iv-draw" d="M20 80 C40 20 60 20 62 70 S90 40 100 60 S130 85 140 50 S170 30 180 65 S215 70 230 45 S260 40 280 55"/></svg></div><small>L. Pillay · Building manager</small>`)}
        ${ivA(4400, '<div class="banner ok" style="margin:12px 0 0"><strong>✓ Signed report shared with the client</strong></div>')}</div></div></div>` },
    { tag: 'Building monitoring', caption: 'Then there is the building itself: air handling units, chillers, pumps and every zone, monitored live and held within its comfort band.',
      html: () => `<div class="iv-split iv-bms"><div class="card flush a" style="--d:0ms"><div class="scene">${bmsBuilding({ bms: introBms(false), labels: true })}</div></div>
        <div class="iv-col iv-kpis">${ivA(600, kpi('thermo', 'Avg temperature', '22.2', '°C'))}${ivA(900, kpi('wind', 'Avg humidity', '54', '%'))}${ivA(1200, kpi('eye', 'CO₂ level', '615', 'ppm'))}${ivA(1500, '<div class="banner ok" style="margin:0"><strong>All zones within comfort band 20–24 °C</strong></div>')}</div></div>` },
    { tag: 'Automatic response', caption: 'When equipment trips or a zone runs out of control, Bothelec gets the alarm straight away. A call is raised, a technician is dispatched and the managers are notified.',
      html: () => `<div class="iv-split iv-bms"><div class="card flush alert a" style="--d:0ms"><div class="scene">${bmsBuilding({ bms: introBms(true) })}</div></div>
        <div class="card iv-col">${tstep(500, 'alert', 'Alarm raised', 'AHU-02 supply fan tripped · L2-C 26.4 °C', '14:32', 'bad')}${tstep(1200, 'phone', 'Call BA-1052 raised automatically', 'Priority: critical', '14:33')}${tstep(1900, 'users', 'Technician dispatched', 'J. Mokoena · ETA 25 min', '14:35')}${tstep(2600, 'bell', 'Managers notified', 'SMS + email, same moment', '14:35')}${tstep(3300, 'check', 'Fixed · alarm closed', 'Back in comfort band · history saved', '15:25')}</div></div>` },
    { tag: 'Get started', caption: 'Less downtime, faster response and complete transparency, for our clients and our team.',
      html: () => `<div class="iv-end">${ivA(100, '<img src="icon.svg" width="64" height="64" alt="">')}${ivA(300, '<h1>BOTHELEC AIRCON SOLUTIONS</h1>')}${ivA(500, '<p class="muted">Connected service · Monitored buildings</p>')}
        <div class="grid g3">${ivA(800, `<div class="card feature">${icS('clock')}<div><strong>Less downtime</strong><p>Faults caught early, before occupants notice</p></div></div>`)}${ivA(1000, `<div class="card feature">${icS('bolt')}<div><strong>Faster response</strong><p>Alerts and calls reach Bothelec instantly</p></div></div>`)}${ivA(1200, `<div class="card feature">${icS('eye')}<div><strong>Complete transparency</strong><p>Every step, every reading, every record</p></div></div>`)}</div>
        ${ivA(1500, '<button class="btn primary iv-go" data-intro="done">Get started</button>')}</div>` },
  ];
  const intro = { i: 0, el: null };
  function showIntro(start = 0) {
    intro.i = start;
    if (!intro.el) {
      intro.el = document.createElement('div');
      intro.el.className = 'intro';
      intro.el.setAttribute('role', 'dialog');
      intro.el.setAttribute('aria-label', 'Introduction');
      document.body.appendChild(intro.el);
      let x0 = null;
      intro.el.addEventListener('pointerdown', e => { x0 = e.clientX; });
      intro.el.addEventListener('pointerup', e => { if (x0 != null && Math.abs(e.clientX - x0) > 60 && !e.target.closest('button')) introGo(intro.i + (e.clientX < x0 ? 1 : -1)); x0 = null; });
      intro.el.addEventListener('click', e => {
        const b = e.target.closest('[data-intro]'); if (!b) return;
        const v = b.dataset.intro;
        if (v === 'next') introGo(intro.i + 1); else if (v === 'back') introGo(intro.i - 1); else if (v === 'done' || v === 'skip') closeIntro(); else introGo(+v);
      });
    }
    document.body.classList.add('intro-open');
    drawIntro();
  }
  function drawIntro() {
    const s = INTRO[intro.i], n = INTRO.length, last = intro.i === n - 1;
    intro.el.innerHTML = `<header class="iv-top"><div class="brand"><img src="icon.svg" width="34" height="34" alt=""><span><strong>BOTHELEC</strong><small>Aircon Solutions</small></span></div>
        <div class="iv-count"><strong>${String(intro.i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</strong><small>${esc(s.tag)}</small></div>
        <button class="btn sm iv-skip" data-intro="skip">${last ? 'Close' : 'Skip'}</button></header>
      <div class="iv-bar"><i style="width:${(intro.i + 1) / n * 100}%"></i></div>
      <section class="iv-stage" aria-live="polite"><div class="iv-fit">${s.html()}</div></section>
      <p class="iv-caption">${esc(s.caption)}</p>
      <nav class="iv-nav"><button class="btn" data-intro="back" ${intro.i === 0 ? 'disabled' : ''}>${ic('back')}Back</button>
        <div class="iv-dots">${INTRO.map((x, k) => `<button data-intro="${k}" class="${k === intro.i ? 'on' : ''}" aria-label="Slide ${k + 1}: ${esc(x.tag)}"></button>`).join('')}</div>
        <button class="btn primary" data-intro="${last ? 'done' : 'next'}">${last ? 'Get started' : 'Next'}${last ? '' : ic('back').replace('<svg', '<svg style="transform:scaleX(-1)"')}</button></nav>`;
    fitIntro();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitIntro);
  }
  /* Scale the slide down to fit small screens instead of scrolling. */
  function fitIntro() {
    const st = intro.el && intro.el.querySelector('.iv-stage'), f = st && st.firstElementChild;
    if (!f) return;
    f.style.transform = ''; f.style.marginBottom = '';
    const cs = getComputedStyle(st);
    const avail = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const h = f.offsetHeight;
    if (h > avail && avail > 0) {
      const k = Math.max(0.55, avail / h);
      f.style.transform = `scale(${k})`;
      f.style.marginBottom = `${h * k - h}px`;
    }
  }
  window.addEventListener('resize', () => { if (intro.el) fitIntro(); });
  function introGo(k) { if (k < 0 || k >= INTRO.length || k === intro.i) return; intro.i = k; drawIntro(); }
  function closeIntro() {
    try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) { /* storage blocked */ }
    if (intro.el) { intro.el.remove(); intro.el = null; }
    document.body.classList.remove('intro-open');
    const f = $('#view input'); if (f && !S) f.focus();
  }
  document.addEventListener('keydown', e => {
    if (!intro.el) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); introGo(intro.i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); introGo(intro.i - 1); }
    else if (e.key === 'Escape') closeIntro();
    else if (e.key === 'Enter' && intro.i === INTRO.length - 1) closeIntro();
  });
  function introSeen() { try { return localStorage.getItem(INTRO_KEY) === '1'; } catch (e) { return true; } }

  /* ---------------- router ---------------- */
  const ROUTES = {
    dashboard: (a1, a2) => (isTech() ? viewTechHome() : isUtil() ? viewUtilDashboard() : viewDashboard(a1, a2)),
    'service/live': viewLive, 'service/callout': viewCallout, 'service/jobcards': viewJobCards, 'service/job': viewJob, 'service/report': viewReport,
    'reports/overview': viewReportsHome, 'reports/service': viewSvcLevels, 'reports/techs': viewRpTechs, 'reports/buildings': viewRpBuildings, 'reports/equipment': viewRpEquipment, 'reports/finance': viewRpFinance,
    'reports/consumption': viewRpConsumption, 'reports/losses': viewRpLosses, 'reports/recoveries': viewRpRecoveries, 'reports/quality': viewRpQuality,
    'service/techs': viewTechs, 'service/notifications': viewNotifs, 'service/reports': viewReports, 'service/clients': viewClients, 'service/documents': viewDocs,
    'bms/overview': viewOverview, 'bms/chillers': viewChillers, 'bms/ahus': viewAhus, 'bms/ahu': viewAhu, 'bms/fcus': viewFcus, 'bms/towers': viewTowers,
    'bms/pumps': viewPumps, 'bms/fans': viewFans, 'bms/zones': viewZones, 'bms/alarms': viewAlarms, 'bms/alarm': viewAlarm, 'bms/trends': viewTrends, 'bms/points': viewPoints,
    vehicles: viewVehicles, dispatch: viewDispatch, 'dispatch/new': viewDispatchNew,
    assessments: viewAssessments, 'assessments/new': viewAssessNew,
    settings: viewSettings, 'settings/buildings': viewSettingsBuildings, 'settings/building': viewSettingsBuilding, 'settings/users': viewSettingsUsers, 'settings/user': viewSettingsUser, 'settings/outbox': viewOutbox, 'settings/billing': viewSettingsBilling, 'service/tracker': viewTracker, 'service/trackimport': viewTrackImport, 'service/trackrow': viewTrackRow, 'service/svbilling': viewServiceBilling,
    account: viewAccount,
    'meters/setup': viewSetup, 'meters/balance': viewBalance, 'meters/overview': viewMetersOverview, 'meters/register': viewMeterRegister, 'meters/meter': viewMeter, 'meters/edit': viewMeterEdit, 'meters/capture': viewReadingsCapture, 'meters/import': viewReadingsImport,
    'recoveries/runs': viewRuns, 'recoveries/run': viewRun, 'recoveries/tenants': viewTenants, 'recoveries/tenant': viewTenantEdit, 'recoveries/tariffs': viewTariffs, 'recoveries/btariffs': viewBuildingTariffs, 'recoveries/tariff': viewTariffEdit,
    'service/equipment': viewEquipment, 'service/unit': viewUnit, 'service/unitedit': viewUnitEdit, 'service/tech': viewTechEdit, 'service/building': viewBuildingContacts,
  };
  const LIVE = new Set(['dashboard', 'service/live', 'bms/overview', 'bms/chillers', 'bms/ahus', 'bms/ahu', 'bms/fcus', 'bms/towers', 'bms/pumps', 'bms/fans', 'bms/zones', 'bms/alarms', 'bms/alarm', 'bms/trends']);
  let current = { key: 'dashboard', mod: 'dashboard' };
  function parse() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (!parts.length) return { key: 'dashboard', mod: 'dashboard' };
    const key = parts.slice(0, 2).join('/');
    if (parts.length >= 2 && ROUTES[key]) return { key, arg: parts[2], arg2: parts[3], mod: parts[0] };
    if (ROUTES[parts[0]]) return { key: parts[0], arg: parts[1], mod: parts[0] === 'account' ? 'dashboard' : parts[0] };
    return { key: 'dashboard', mod: 'dashboard' };
  }
  const isLive = () => LIVE.has(current.key) && !document.hidden;
  function render(soft) {
    if (!S) return;
    document.body.classList.remove('auth');
    current = parse();
    let mod = MODULES.find(m => m.id === current.mod) || MODULES[0];
    const TECH_BLOCKED = ['service/tracker', 'service/trackrow', 'service/trackimport', 'service/reports', 'service/documents', 'service/clients', 'service/building', 'service/techs', 'service/tech', 'service/unitedit'];
    if (/^(meters|recoveries)\//.test(current.key) && current.arg && S.buildings.some(b => b.id === current.arg)) ui.site = current.arg; // sidebar follows the building on screen
    if (isUtil() && /^service\/track/.test(current.key) && role() !== 'tech') mod = MODULES.find(m => m.id === 'recoveries'); // the billing tracker is shared by both companies
    if (mod.biz && mod.biz !== ui.biz) { const want = mod.biz; ui.biz = want; try { localStorage.setItem('bothelec.biz', want); } catch (e) { /* storage blocked */ } }
    if ((mod.roles && !mod.roles.includes(role())) || (isTech() && TECH_BLOCKED.includes(current.key))) { mod = MODULES[0]; current = { key: 'dashboard', mod: 'dashboard' }; }
    if (!isStaff() && ['reports/finance', 'reports/techs'].includes(current.key)) current = { key: 'reports/overview', mod: 'reports' };
    if (isUtil() && ['reports/service', 'reports/techs', 'reports/buildings', 'reports/equipment', 'reports/finance'].includes(current.key)) current = { key: 'reports/overview', mod: 'reports' };
    renderNav(mod, current.key);
    ui.rpCsv = null;
    const view = $('#view');
    const bmsView = current.key.startsWith('bms/') && !['bms/alarms', 'bms/alarm'].includes(current.key);
    try {
      view.innerHTML = bmsView && noBms() ? head(esc(site().name || 'Info Hub')) + noBmsCard() : ROUTES[current.key](current.arg, current.arg2);
    } catch (e) {
      console.error(e);
      view.innerHTML = head('Something went wrong') + `<div class="card empty">${esc(e.message)}</div>`;
    }
    if (!soft) window.scrollTo(0, 0);
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
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1a1e';
    let drawing = false;
    const pos = e => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    c.addEventListener('pointerdown', e => { drawing = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); });
    c.addEventListener('pointermove', e => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); ui.sigDirty = true; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => c.addEventListener(t, () => { drawing = false; }));
  }

  /* ---------------- photos (downscaled in the browser before upload) ---------------- */
  function readPhotos(files) {
    return Promise.all([...files].slice(0, 6).map(f => new Promise(res => {
      const img = new Image(), url = URL.createObjectURL(f);
      img.onload = () => {
        const s = Math.min(1, 1280 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = img.width * s; cv.height = img.height * s;
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => res(null);
      img.src = url;
    }))).then(a => a.filter(Boolean));
  }

  /* ---------------- events ---------------- */
  const goSettingsRefresh = async (msg, hash) => { await refresh(); if (msg) toast(msg); if (hash) location.hash = hash; else render(true); };
  const ACTIONS = {
    fault: async () => { const r = await act('POST', `/api/bms/${encodeURIComponent(ui.site)}/simulate-fault`, {}, ['Fault simulated', 'AHU-02 supply fan tripped']); if (r && r.alarm) location.hash = '#/bms/alarm/' + r.alarm; },
    jobfilter: el => { ui.jobFilter = el.dataset.v; render(true); },
    advance: async el => { el.disabled = true; const r = await act('POST', `/api/jobs/${el.dataset.id}/advance`, {}); if (r) toast('Updated', 'Building & operations managers notified'); },
    sigclear: () => mountSignature(),
    sign: async el => {
      const c = $('#sig'), name = $('#signedBy').value.trim();
      if (!ui.sigDirty) return toast('Signature needed', 'Ask the customer to sign in the box.', 'bad');
      if (!name) return toast('Name needed', 'Enter the name of the person signing.', 'bad');
      el.disabled = true;
      const sig = c.toDataURL('image/png');
      ui.sigDirty = false;
      const r = await act('POST', `/api/jobs/${el.dataset.id}/sign`, { signature: sig, name }, ['Signed report shared', 'Emailed to the building & operations managers']);
      if (!r) { el.disabled = false; }
    },
    print: () => window.print(),
    duty: el => act('POST', `/api/techs/${el.dataset.id}/duty`, {}),
    doc: () => toast('Document storage', 'Upload documents to your file storage and link them here.'),
    ahumode: () => toast('Read-only monitoring', 'Change AHU modes on the BMS controller.'),
    zonesel: el => { const id = el.dataset.id; ui.zoneSel = ui.zoneSel.includes(id) ? ui.zoneSel.filter(x => x !== id) : [...ui.zoneSel, id].slice(-4); render(true); },
    sp: el => act('POST', `/api/bms/${encodeURIComponent(ui.site)}/setpoint`, { zones: ui.zoneSel, delta: +el.dataset.v }, ['Set-point adjusted', ui.zoneSel.join(', ')]),
    trip: el => act('POST', `/api/trips/${el.dataset.id}/advance`, {}),
    clearalarm: el => { if (confirm('Clear this alarm manually?')) act('POST', `/api/alarms/${el.dataset.id}/clear`, {}, ['Alarm cleared']); },
    tour: () => showIntro(0),
    suadd: el => { const k = el.dataset.kind; const html = setupRow({ kind: k, unit: { common: 'Common area', council: 'Council supply', check: '' }[k] || '' }); if (k === 'council') $('#surows').insertAdjacentHTML('afterbegin', html); else $('#surows').insertAdjacentHTML('beforeend', html); const row = k === 'council' ? $('#surows').firstElementChild : $('#surows').lastElementChild; row.querySelector(k === 'shop' || k === 'check' ? '[name=unit]' : '[name=elecSerial]').focus(); },
    surm: el => el.closest('[data-surow]').remove(),
    sucheck: el => { (ui.suCheck || {})[el.dataset.bid] = null; render(true); },
    'tree-all': el => { const type = el.dataset.type; const rows = [...document.querySelectorAll(`[data-tree][data-type="${type}"]`)]; const council = rows.find(r => (r.querySelector('[name=role]') || {}).value === 'council'); if (!council) return toast('Choose the council meter first', 'Set one meter’s role to “Council / bulk meter”.', 'bad'); rows.forEach(r => { if (r === council) return; const m = meterById(r.dataset.tree); const role = r.querySelector('[name=role]').value; if (role === 'sub' && (m.tenantId || /common/i.test(m.location || '') || !r.querySelector('[name=parent]').value)) r.querySelector('[name=parent]').value = council.dataset.tree; }); ['electricity', 'water'].forEach(drawTreePreview); },
    suopen: el => { ui.suOpen = ui.suOpen === el.dataset.id ? null : el.dataset.id; render(true); },
    meterremoved: async el => { const on = !!el.dataset.v; if (on && !confirm('Remove this meter? Its readings are kept.')) return; if (await act('POST', `/api/meters/${encodeURIComponent(el.dataset.id)}/removed`, { removed: on }, [on ? 'Meter removed' : 'Meter restored'])) location.hash = '#/meters/register'; },
    delreading: async el => { if (confirm('Delete this reading?') && await act('DELETE', `/api/meters/${encodeURIComponent(el.dataset.meter)}/readings/${encodeURIComponent(el.dataset.ts)}`, undefined, ['Reading deleted'])) render(true); },
    deltenant: async el => { if (confirm('Delete this tenant?') && await act('DELETE', `/api/tenants/${el.dataset.id}`, undefined, ['Tenant deleted'])) location.hash = '#/recoveries/tenants'; },
    runrecalc: async el => { if (await act('POST', `/api/recoveries/${el.dataset.id}/recalc`, {}, ['Recalculated'])) render(true); },
    rundelete: async el => { if (confirm('Delete this draft billing run?') && await act('DELETE', `/api/recoveries/${el.dataset.id}`, undefined, ['Billing run deleted'])) location.hash = '#/recoveries/runs'; },
    runapprove: async el => { const r = (S.recoveries || []).find(x => x.id === el.dataset.id); if (!confirm(`Approve ${r.label}? Each tenant with an email address is sent their statement, and the statements are added to the billing tracker.`)) return; const x = await act('POST', `/api/recoveries/${el.dataset.id}/approve`, {}); if (x) { toast('Billing run approved', `${x.rows} statements · ${x.emailed} emailed · now in the billing tracker`); render(true); } },
    addtariff: () => { const r = $('#tfrows'); r.querySelector('.empty') && r.querySelector('.empty').remove(); r.insertAdjacentHTML('beforeend', tariffCard()); },
    rmtariff: el => el.closest('[data-tariff]').remove(),
    addblock: el => { const into = el.dataset.into || 'blocks'; el.closest('[data-tariff]').querySelector(`[data-${into}]`).insertAdjacentHTML('beforeend', blockRow({ upTo: null, rate: '' }, into === 'sewer')); },
    addfixed: el => el.closest('[data-tariff]').querySelector(`[data-${el.dataset.into || 'fixedlist'}]`).insertAdjacentHTML('beforeend', fixedRow({})),
    rmfixed: el => el.closest('[data-fixed]').remove(),
    tftab: el => { ui.tfTab = el.dataset.v; if (current.key !== 'recoveries/tariffs') location.hash = '#/recoveries/tariffs'; else render(true); },
    tfcustom: async el => { el.disabled = true; const r = await act('POST', `/api/utility/tariffs/${el.dataset.bid}/customise`, { tariffId: el.dataset.id }, ['Copied for this building', 'Its meters now use the copy. Other buildings are not affected.']); if (r && r.tariff) location.hash = `#/recoveries/tariff/${r.tariff.id}/${el.dataset.bid}`; else el.disabled = false; },
    tflibadd: async el => { el.disabled = true; const r = await act('POST', '/api/tariffs/library', { key: el.dataset.key }, ['Tariff added', 'Edit it under Your tariffs, then link it to meters.']); if (r && r.tariff) { ui.tfOpen = r.tariff.id; } render(true); },
    tfquote: async el => {
      const box = el.closest('[data-tftry]'), out = box.querySelector('.tf-out'), qty = box.querySelector('[name=tq]').value, month = box.querySelector('[name=tm]').value;
      if (qty === '') { out.innerHTML = '<small class="muted">Enter the consumption first.</small>'; return; }
      const card = el.closest('[data-tariff]');
      try {
        const r = await api('POST', '/api/tariffs/quote', card ? { tariff: readTariffCard(card), consumption: qty, month } : { id: box.dataset.tftry, consumption: qty, month });
        out.innerHTML = `<table class="tf-q"><tbody>${r.lines.map(l => `<tr><td>${esc(l.desc)}</td><td class="mono n">${l.qty !== 1 ? fmtN(l.qty, 3) + ' × ' + fmtN(l.rate, 4) : ''}</td><td class="mono n">${fmtMoney(l.amount)}</td></tr>`).join('')}
          <tr class="rp-foot"><td>Excl. VAT${r.winter ? ' · winter rates' : ''}</td><td></td><td class="mono n">${fmtMoney(r.subtotal)}</td></tr><tr><td>VAT</td><td></td><td class="mono n">${fmtMoney(r.vat)}</td></tr><tr class="rp-foot"><td>Total</td><td></td><td class="mono n"><strong>${fmtMoney(r.total)}</strong></td></tr></tbody></table>`;
      } catch (e) { out.innerHTML = `<small style="color:var(--red)">${esc(e.message)}</small>`; }
    },
    rmblock: el => el.closest('[data-block]').remove(),
    rimpclear: () => { ui.rimp = null; render(true); },
    rimpgo: async el => { const rows = rimpRows().filter(r => r.ok).map(r => ({ line: r.line, meter: r.meterId, date: r.date, time: r.time, value: r.value })); el.disabled = true; const x = await act('POST', '/api/readings/import', { rows }); if (x) { toast(`${x.imported} readings imported`, x.skipped.length ? x.skipped.length + ' skipped' : ''); ui.rimp = null; location.hash = '#/meters/register'; } else el.disabled = false; },
    zohodisconnect: async () => { if (confirm('Disconnect Zoho Books? Invoices already in Zoho stay there.') && await act('POST', '/api/admin/zoho/disconnect', {}, ['Zoho Books disconnected'])) location.hash = '#/settings/billing'; },
    impclear: () => { ui.imp = null; render(true); },
    impgo: async el => {
      const rows = impParsed().filter(r => !r.empty && !r.dup);
      if (!rows.length) return;
      el.disabled = true;
      const r = await act('POST', '/api/tracker/import', { building: ui.imp.building, rows });
      if (!r) { el.disabled = false; return; }
      toast(`${r.imported} rows imported`, r.skipped.length ? `${r.skipped.length} skipped (empty or already in the tracker)` : 'All rows imported');
      ui.imp = null; ui.tkFilter = 'all'; location.hash = '#/service/tracker';
    },
    tkfilter: el => { ui.tkFilter = el.dataset.v; render(true); },
    tkcsv: () => trackerCsv(),
    rpcsv: () => { const c = ui.rpCsv; if (!c) return toast('Nothing to export', '', 'bad'); const R = rpRange(); downloadCsv(`${c.name}-${R.a}${R.b !== R.a ? '-to-' + R.b : ''}`, c.head, c.rows); },
    rpprint: () => window.print(),
    tkapprove: async () => { const ids = tkSelected(); if (!ids.length) return toast('Select rows first', 'Tick the rows you want to approve.', 'bad'); await tkApprove(ids); },
    tkapproveone: async el => { if (await tkApprove([el.dataset.id])) location.hash = '#/service/tracker'; },
    tkportal: async () => { const ids = tkSelected(); if (!ids.length) return toast('Select rows first', '', 'bad'); const r = await act('POST', '/api/tracker/bulk', { ids, action: 'portal' }); if (r) { toast(`${r.updated} marked as loaded to portal`, 'Only invoiced rows are updated'); render(true); } },
    tkpaid: async () => { const ids = tkSelected(); if (!ids.length) return toast('Select rows first', '', 'bad'); if (!confirm(`Mark ${ids.length} row(s) as paid today?`)) return; const r = await act('POST', '/api/tracker/bulk', { ids, action: 'paid' }); if (r) { toast(`${r.updated} marked as paid`, 'Only invoiced rows are updated'); render(true); } },
    tkdelete: async el => { if (confirm('Delete this PO / quote row?') && await act('DELETE', `/api/tracker/${el.dataset.id}`, undefined, ['Row deleted'])) location.hash = '#/service/tracker'; },
    addline: el => { const root = el.closest('[data-lines]'); root.querySelector('.lbody').insertAdjacentHTML('beforeend', lineRow({ kind: 'Part', qty: 1 })); root.querySelector('.lbody').lastElementChild.querySelector('[name=l_desc]').focus(); },
    rmline: el => { const root = el.closest('[data-lines]'); el.closest('[data-line]').remove(); refreshLineTotals(root); },
    invoice: async el => { el.disabled = true; await act('POST', `/api/${el.dataset.kind === 'job' ? 'jobs' : 'services'}/${el.dataset.id}/invoice`, {}, ['Sending to Zoho Books', 'The draft invoice appears here in a few seconds']); },
    zohotest: async () => { try { const r = await api('POST', '/api/admin/zoho/test', {}); toast('Connected to Zoho Books', `${r.organisation.name} · ${r.organisation.currency}`); } catch (e) { toast('Zoho Books connection failed', e.message, 'bad'); } },
    zohosync: async () => { if (await act('POST', '/api/admin/zoho/sync', {}, ['Syncing clients to Zoho Books'])) render(true); },
    zohoretry: async el => { if (await act('POST', `/api/admin/zoho/${el.dataset.id}/retry`, {}, ['Retrying'])) render(true); },
    addcatrow: () => { $('#crows').insertAdjacentHTML('beforeend', catRow()); $('#crows').lastElementChild.querySelector('input[name=k_code]').focus(); },
    deltech: async el => { const t = tech(el.dataset.id); if (t && confirm(`Remove ${t.name} from the technicians list? Their past jobs stay in the history.`) && await act('DELETE', `/api/techs/${t.id}`, undefined, ['Technician removed'])) { location.hash = '#/service/techs'; render(true); } },
    addrow: el => { $('#crows').insertAdjacentHTML('beforeend', contactRow({ role: el.dataset.role, notify: true })); const r = $('#crows').lastElementChild; r.querySelector('input[name=c_name]').focus(); },
    rmrow: el => el.closest('[data-row]').remove(),
    toggleremoved: () => { ui.showRemoved = !ui.showRemoved; render(true); },
    unitremoved: async el => { const on = !!el.dataset.v; if (on && !confirm('Decommission this unit? Its service history is kept.')) return; if (await act('POST', `/api/buildings/${el.dataset.bid}/units/${encodeURIComponent(el.dataset.uid)}/removed`, { removed: on }, [on ? 'Unit decommissioned' : 'Unit restored'])) { location.hash = `#/service/equipment/${el.dataset.bid}`; render(true); } },
    delservice: async el => { if (confirm('Delete this service record?') && await act('DELETE', `/api/services/${el.dataset.id}`, undefined, ['Record deleted'])) render(true); },
    logcall: el => { const b = bld(el.dataset.bid); ui.prefill = { building: b.id, equipment: (b.equipment || []).find(e => e.split(' · ')[0] === el.dataset.uid) }; location.hash = '#/service/callout'; },
    reassign: async el => { const v = $('#reassignTech').value; if (!v) return toast('No technician available', 'Set someone on duty first.', 'bad'); if (await act('POST', `/api/jobs/${el.dataset.id}/assign`, { tech: v }, ['Technician assigned', 'They have been sent an SMS'])) render(true); },
    logout: async () => { try { await api('POST', '/api/logout', {}); } catch (e) { /* ignore */ } S = null; ui.bmsCache = {}; showLogin(); },
    retry: async el => { await act('POST', `/api/admin/outbox/${el.dataset.id}/retry`, {}, ['Retrying']); render(true); },
    deluser: async el => { if (confirm('Delete this login?') && await act('DELETE', `/api/admin/users/${el.dataset.id}`)) { if (current.key === 'service/tech') render(true); else location.hash = '#/settings/users'; }; },
    delbuilding: async el => { if (confirm('Delete this building and its BMS history? Jobs are kept.') && await act('DELETE', `/api/admin/buildings/${el.dataset.id}`)) location.hash = '#/settings/buildings'; },
  };
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (a) { e.preventDefault(); ACTIONS[a.dataset.action] && ACTIONS[a.dataset.action](a); return; }
    const bm = e.target.closest('[data-balm]'); if (bm) ui.balMonth = bm.dataset.balm;
    const r = e.target.closest('tr[data-href]');
    if (r && !e.target.closest('a,button,input,label,select')) location.hash = r.dataset.href;
  });
  const bindTimers = {};
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.bind) {
      const j = byId(S.jobs, el.dataset.id); if (j) j[el.dataset.bind] = el.value;
      clearTimeout(bindTimers[el.dataset.bind]);
      bindTimers[el.dataset.bind] = setTimeout(() => api('PATCH', `/api/jobs/${el.dataset.id}`, { [el.dataset.bind]: el.value }).catch(err => toast('Not saved', err.message, 'bad')), 600);
    }
    const lroot = el.closest && el.closest('[data-lines]');
    if (lroot) {
      if (el.name === 'l_desc') { const c = B().catalogue.find(x => x.name === el.value); const row = el.closest('[data-line]'); if (c && row) { row.querySelector('[name=l_price]').value = c.rate; row.querySelector('[name=l_kind]').value = c.kind; row.querySelector('[name=l_code]').value = c.code; } }
      refreshLineTotals(lroot);
    }
    if (el.dataset.filter === 'tracker') { const q = el.value.toLowerCase(); document.querySelectorAll('#tracker tbody tr').forEach(tr => { tr.hidden = !tr.textContent.toLowerCase().includes(q); }); }
    if (el.dataset.filter === 'points') { const q = el.value.toLowerCase(); document.querySelectorAll('#points tbody tr').forEach(tr => { tr.hidden = !tr.textContent.toLowerCase().includes(q); }); }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.change === 'site') switchSite(el.value);
    if (el.id === 'bizSel') switchBiz(el.value);
    if (el.dataset.change === 'sukind') { const row = el.closest('[data-surow]'); row.classList.toggle('is-common', el.value !== 'shop'); const u = row.querySelector('[name=unit]'); if (!u.value) u.value = { common: 'Common area', council: 'Council supply' }[el.value] || ''; }
    if (el.dataset.change === 'treechg') { const row = el.closest('[data-tree]'); const roleSel = row.querySelector('[name=role]'); const par = row.querySelector('[name=parent]'); if (roleSel) { par.disabled = roleSel.value === 'council'; if (roleSel.value === 'council') par.value = ''; } ['electricity', 'water'].forEach(drawTreePreview); }
    if (el.dataset.change === 'btsite') { location.hash = '#/recoveries/btariffs/' + el.value; }
    if (el.dataset.change === 'balsite') { location.hash = '#/meters/balance/' + el.value; }
    if (el.dataset.change === 'rpperiod') { ui.rp.period = el.value; if (el.value === 'custom') { const R0 = rpRange(); ui.rp.from = R0.a; ui.rp.to = R0.b; } render(true); }
    if (el.dataset.change === 'rpfrom' && el.value) { ui.rp.from = el.value; render(true); }
    if (el.dataset.change === 'rpto' && el.value) { ui.rp.to = el.value; render(true); }
    if (el.dataset.change === 'rpbld') { ui.rp.building = el.value; render(true); }
    if (el.dataset.change === 'tfseason') el.closest('[data-tariff]').querySelector('.tf-winter').hidden = !el.checked;
    if (el.name === 't_type' && el.closest('[data-tariff]')) el.closest('[data-tariff]').querySelector('.tf-sewer').hidden = el.value !== 'water';
    if (el.dataset.change === 'balmonth' && el.value) { ui.balMonth = el.value; render(true); }
    if (el.dataset.change === 'suall' && el.value !== '-') { document.querySelectorAll(`[data-sutariff][data-type="${el.dataset.type}"]`).forEach(x => { x.value = el.value; }); }
    if (el.dataset.change === 'msite') location.hash = '#/meters/register/' + el.value;
    if (el.dataset.change === 'capsite') location.hash = '#/meters/capture/' + el.value;
    if (el.dataset.change === 'tsite') location.hash = '#/recoveries/tenants/' + el.value;
    if (el.dataset.mphoto && el.files[0]) readPhotos(el.files).then(l => { ui.mphoto = l[0]; toast('Photo attached'); });
    if (el.dataset.capphoto && el.files[0]) readPhotos(el.files).then(l => { ui.capPhotos = ui.capPhotos || {}; ui.capPhotos[el.dataset.capphoto] = l[0]; el.closest('label').classList.add('primary'); });
    if (el.matches && el.matches('[data-rimpfile]') && el.files[0]) { const fr = new FileReader(); fr.onload = () => { const all = parseCsv(String(fr.result)).filter(r => r.some(c => c)); const hi = Math.max(0, all.findIndex(r => r.some(c => /meter|serial/i.test(c)))); const h = all[hi] || []; const find = re => { const i = h.findIndex(x => re.test(x)); return i < 0 ? '' : i; }; ui.rimp = { name: el.files[0].name, headers: h, headerRow: hi, body: all.slice(hi + 1), map: { meter: find(/meter|serial/i), date: find(/date|day/i), time: find(/time/i), value: find(/read|value|kwh|kl|register/i) } }; render(true); }; fr.readAsText(el.files[0]); }
    if (el.dataset.rimpmap && ui.rimp) { ui.rimp.map[el.dataset.rimpmap] = el.value; render(true); }
    if (el.dataset.change === 'addcat' && el.value) {
      const c = B().catalogue.find(x => x.code === el.value), root = el.closest('[data-lines]');
      if (c) { root.querySelector('.lbody').insertAdjacentHTML('beforeend', lineRow({ kind: c.kind, code: c.code, description: c.name, qty: 1, unitPrice: c.rate })); refreshLineTotals(root); }
      el.value = '';
    }
    if (el.matches && el.matches('[data-impfile]') && el.files[0]) impLoad(el.files[0], el.form.building.value);
    if (el.form && el.form.dataset.form === 'impfile' && el.name === 'building' && ui.imp) ui.imp.building = el.value;
    if (el.dataset.impmap && ui.imp) { ui.imp.map[el.dataset.impmap] = el.value; render(true); }
    if (el.dataset.change === 'tkfilter') { ui.tkFilter = el.value; render(true); }
    if (el.dataset.change === 'tkclient') { ui.tkClient = el.value; render(true); }
    if (el.matches && el.matches('[data-tkall]')) document.querySelectorAll('#tracker tbody tr').forEach(tr => { if (!tr.hidden) tr.querySelector('[data-tkrow]').checked = el.checked; });
    if (el.matches && el.matches('[data-tkall], [data-tkrow]')) { const n = tkSelected().length; const c = $('#tkCount'); if (c) c.textContent = `${n} selected`; }
    if (el.dataset.change === 'eqsite') location.hash = '#/service/equipment/' + el.value;
    if (el.dataset.change === 'building') {
      const b = bld(el.value), f = el.form;
      f.equipment.innerHTML = (isUtil() ? b.meterEquipment || ['Other / not sure'] : b.equipment || []).map(x => `<option>${esc(x)}</option>`).join('');
      f.location.innerHTML = (b.locations || []).map(x => `<option>${esc(x)}</option>`).join('');
    }
    if (el.dataset.change === 'conntpl' && el.value) {
      const ta = el.form.connector;
      if (!ta.value.trim() || /"type":\s*"none"/.test(ta.value) || confirm('Replace the current connector settings with the template?')) ta.value = JSON.stringify(CONNECTOR_EXAMPLES[el.value], null, 2);
      el.value = '';
    }
    if (el.dataset.photos) {
      readPhotos(el.files).then(async list => {
        if (!list.length) return;
        const th = $('#thumbs');
        if (el.dataset.photos === 'pending') { ui.pendingPhotos.push(...list); if (th) th.insertAdjacentHTML('beforeend', list.map(p => `<img src="${p}" alt="Photo">`).join('')); toast(`${list.length} photo(s) attached`); }
        else { const r = await act('POST', `/api/jobs/${el.dataset.photos}/photos`, { photos: list }, [`${list.length} photo(s) uploaded`]); if (r) render(true); }
      });
    }
  });
  const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  function parseJson(txt, what) { try { return JSON.parse(txt); } catch (e) { toast(`${what} is not valid JSON`, e.message, 'bad'); return undefined; } }
  document.addEventListener('submit', async e => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const btn = f.querySelector('button:not([type=button])'); if (btn) btn.disabled = true;
    try {
      switch (f.dataset.form) {
        case 'login': {
          try { await api('POST', '/api/login', { email: d.email, password: d.password }); ui.lastFeed = null; await refresh(); render(); }
          catch (err) { $('#loginErr').textContent = err.message; }
          break;
        }
        case 'callout': {
          const r = await act('POST', '/api/jobs', { building: d.building, equipment: d.equipment, location: d.location, fault: d.fault, urgency: d.urgency, photos: ui.pendingPhotos, division: ui.biz, contact: d.contact, contactPhone: d.contactPhone, contactEmail: d.contactEmail }, ['Call logged', 'Your request landed at the Bothelec service desk']);
          if (r && r.id) { ui.pendingPhotos = []; location.hash = '#/service/job/' + r.id; }
          break;
        }
        case 'trip': {
          const [hh, mm] = (d.time || '00:00').split(':'); const at = new Date(); at.setHours(+hh, +mm, 0, 0);
          if (await act('POST', '/api/trips', { what: d.what, from: d.from, to: d.to, driver: d.driver, at: at.toISOString() }, ['Trip scheduled', d.what])) location.hash = '#/dispatch';
          break;
        }
        case 'assess': {
          const items = ASSESS_ITEMS.map((name, i) => ({ name, rating: +d['r' + i] }));
          const r = await act('POST', '/api/assessments', { building: d.building, by: d.by, type: d.type, items, notes: d.notes }, ['Assessment saved']);
          if (r && r.id) location.hash = '#/assessments/' + r.id;
          break;
        }
        case 'test': {
          try { const r = await api('POST', '/api/admin/test', { channel: d.channel, to: d.to }); toast(r.ok ? 'Test queued' : 'Test failed', r.ok ? 'Check the message log for delivery status.' : r.error, r.ok ? '' : 'bad'); }
          catch (err) { toast('Test failed', err.message, 'bad'); }
          break;
        }
        case 'desk': if (await act('PUT', '/api/admin/settings', { desk: { phone: d.phone, email: d.email }, etaMinutes: +d.etaMinutes }, ['Saved'])) render(true); break;
        case 'policy': { const p = parseJson(d.policy, 'Policy'); if (p && await act('PUT', '/api/admin/settings', { policy: p }, ['Policy saved'])) render(true); break; }
        case 'building': {
          const connector = parseJson(d.connector, 'Connector settings'); if (connector === undefined) break;
          const gsm = parseJson(d.gsm, 'GSM settings'); if (gsm === undefined) break;
          const body = { id: f.dataset.id || undefined, name: d.name, client: d.client, area: d.area, portal: d.portal, divisions: new FormData(f).getAll('divisions'),
            comfort: [+d.comfortLo || 20, +d.comfortHi || 24], autoCall: !!d.autoCall, locations: lines(d.locations), connector, gsm, regenToken: !!d.regenToken };
          const r = await act('POST', '/api/admin/buildings', body, ['Building saved', 'BMS connection restarted']);
          if (r && r.building) { ui.bmsCache = {}; if (ui.site === r.building.id) await loadBms(); location.hash = '#/settings/building/' + r.building.id; render(true); }
          break;
        }
        case 'user': {
          const body = { id: f.dataset.id || undefined, name: d.name, email: d.email, phone: d.phone, role: d.role, techId: d.techId, buildings: new FormData(f).getAll('buildings') };
          if (d.password) body.password = d.password;
          const r = await act('POST', '/api/admin/users', body, ['User saved']);
          if (r) location.hash = '#/settings/users';
          break;
        }
        case 'billing': {
          const r = await act('PUT', `/api/${f.dataset.kind === 'job' ? 'jobs' : 'services'}/${f.dataset.id}/billing`, { lines: readLines(f) }, ['Parts & labour saved']);
          if (r) render(true);
          break;
        }
        case 'billingsettings': if (await act('PUT', '/api/admin/settings', { billing: { vatRate: +d.vatRate, termsDays: +d.termsDays, currency: d.currency, pricesIncludeVat: !!d.pricesIncludeVat, autoInvoice: !!d.autoInvoice, zohoTaxId: d.zohoTaxId } }, ['Invoicing settings saved'])) render(true); break;
        case 'catalogue': {
          const catalogue = [...f.querySelectorAll('[data-row]')].map(r => ({ code: r.querySelector('[name=k_code]').value, name: r.querySelector('[name=k_name]').value, kind: r.querySelector('[name=k_kind]').value, unit: r.querySelector('[name=k_unit]').value, rate: +r.querySelector('[name=k_rate]').value, zohoItemId: r.querySelector('[name=k_zoho]').value }));
          if (await act('PUT', '/api/admin/settings', { billing: { catalogue } }, ['Price list saved'])) render(true);
          break;
        }
        case 'zohoconnect': {
          try { const r = await api('POST', '/api/admin/zoho/connect', { dc: d.dc, clientId: d.clientId, clientSecret: d.clientSecret, redirectUri: location.origin + '/api/zoho/callback' }); location.href = r.url; }
          catch (err) { toast('Could not start the connection', err.message, 'bad'); }
          break;
        }
        case 'zohoorg': if (d.orgId && await act('POST', '/api/admin/zoho/org', { orgId: d.orgId }, ['Organisation selected', 'Zoho Books is connected'])) location.hash = '#/settings/billing'; break;
        case 'impfile': break;
        case 'tracker': {
          const body = { poNumber: d.poNumber, poDate: d.poDate, poStatus: d.poStatus, critical: !!d.critical, portalDate: d.portalDate, paidDate: d.paidDate, void: !!d.void, notes: d.notes };
          if (d.invoiceNumber !== undefined) { body.invoiceNumber = d.invoiceNumber; body.invoiceDate = d.invoiceDate; }
          if (d.building !== undefined) { body.building = d.building; body.description = d.description; body.amountEx = d.amountEx; }
          const r = f.dataset.id ? await act('PUT', `/api/tracker/${f.dataset.id}`, body, ['Saved']) : await act('POST', '/api/tracker', body, ['PO / quote added']);
          if (r) location.hash = '#/service/tracker';
          break;
        }
        case 'techlogin': {
          const t = tech(f.dataset.tech), u = (S.admin.users || []).find(x => x.id === f.dataset.user);
          const body = u ? { ...u, techId: t.id, password: d.password } : { name: t.name, email: d.email, phone: t.phone, role: 'tech', techId: t.id, password: d.password, buildings: [] };
          if (await act('POST', '/api/admin/users', body, [u ? 'Password reset' : 'Login created', u ? 'Give them the new password' : `${t.name} can now sign in with ${d.email}`])) render(true);
          break;
        }
        case 'reading': {
          const x = await act('POST', `/api/meters/${encodeURIComponent(f.dataset.meter)}/readings`, { date: d.date, time: d.time, value: d.value, note: d.note, photo: ui.mphoto, jobId: f.dataset.job || undefined });
          if (x) { toast('Reading saved', x.warning || ''); if (x.warning) toast('Check this reading', x.warning, 'bad'); ui.mphoto = null; render(true); }
          break;
        }
        case 'capture': {
          let n = 0, warn = [];
          for (const row of f.querySelectorAll('[data-cap]')) {
            const id = row.dataset.cap, v = row.querySelector('input[type=number]').value; if (v === '') continue;
            try { const x = await api('POST', `/api/meters/${encodeURIComponent(id)}/readings`, { date: d.date, time: d.time, value: v, photo: (ui.capPhotos || {})[id], jobId: f.dataset.job || undefined }); n++; if (x.warning) warn.push(id + ': ' + x.warning); } catch (err) { warn.push(id + ': ' + err.message); }
          }
          ui.capPhotos = {}; await refresh();
          toast(`${n} reading${n === 1 ? '' : 's'} saved`, warn.join(' · '), warn.length ? 'bad' : '');
          if (!f.dataset.job) location.hash = '#/meters/register/' + f.dataset.bid; else render(true);
          break;
        }
        case 'meter': {
          const r = await act('POST', '/api/meters', { originalId: f.dataset.orig || undefined, meter: { id: d.id, building: d.building, type: d.type, multiplier: d.multiplier, serial: d.serial, make: d.make, model: d.model, location: d.location, tenantId: d.tenantId, tariffId: d.tariffId, comm: d.comm, installed: d.installed, notes: d.notes } }, ['Meter saved']);
          if (r && r.meter) location.hash = '#/meters/meter/' + encodeURIComponent(r.meter.id);
          break;
        }
        case 'tenant': {
          const r = await act('POST', '/api/tenants', { id: f.dataset.id || undefined, building: d.building, name: d.name, unit: d.unit, contact: d.contact, phone: d.phone, email: d.email, vatNo: d.vatNo, active: !!d.active }, ['Tenant saved']);
          if (r) location.hash = '#/recoveries/tenants/' + d.building;
          break;
        }
        case 'newrun': {
          const r = await act('POST', '/api/recoveries', { building: d.building, month: d.month }, ['Billing run calculated']);
          if (r && r.run) location.hash = '#/recoveries/run/' + r.run.id;
          break;
        }
        case 'tariffone': {
          const t = readTariffCard(f.querySelector('[data-tariff]'));
          try { const r = await api('PUT', `/api/tariffs/${f.dataset.id}`, { tariff: t }); toast('Tariff saved', r.recalculated ? `${r.recalculated} draft billing run${r.recalculated === 1 ? '' : 's'} recalculated` : ''); await refresh(); location.hash = f.dataset.back; }
          catch (err) { toast('Could not save the tariff', err.message, 'bad'); }
          break;
        }
        case 'btariffs': {
          const assign = [...f.querySelectorAll('[data-sutariff]')].map(x => ({ meterId: x.dataset.sutariff, tariffId: x.value }));
          if (await act('POST', `/api/utility/tariffs/${f.dataset.bid}`, { assign }, ['Meter tariffs saved'])) render(true);
          break;
        }
        case 'tariffs': {
          const tariffs = [...f.querySelectorAll('[data-tariff]')].map(readTariffCard);
          if (await act('PUT', '/api/tariffs', { tariffs }, ['Tariffs saved'])) { ui.tfOpen = null; render(true); }
          break;
        }
        case 'sustep1': {
          let bid = d.existing || f.dataset.bid || '';
          if (!bid && !String(d.name || '').trim()) { toast('Enter the building name', 'Or choose an existing building.', 'bad'); break; }
          const r = await act('POST', '/api/utility/building', { id: bid || undefined, name: d.name, client: d.client, area: d.area });
          if (r && r.building) { ui.biz = 'utility'; ui.site = r.building.id; location.hash = `#/meters/setup/${r.building.id}/2`; }
          break;
        }
        case 'sustep2': {
          const rows = [...f.querySelectorAll('[data-surow]')].map(r => ({ tenantId: r.dataset.tenant, kind: r.querySelector('[name=kind]').value, unit: r.querySelector('[name=unit]').value, name: r.querySelector('[name=name]').value, email: r.querySelector('[name=email]').value, elecSerial: r.querySelector('[name=elecSerial]').value, waterSerial: r.querySelector('[name=waterSerial]').value }));
          try {
            const r = await api('POST', `/api/utility/setup/${f.dataset.bid}`, { rows });
            $('#suerr').innerHTML = '';
            toast('Shops and meters saved', `${r.tenants} shops · ${r.created} meters added · ${r.linked} linked${r.unlinked ? ` · ${r.unlinked} replaced (history kept)` : ''}`);
            ui.suCheck = {}; await refresh(); location.hash = `#/meters/setup/${f.dataset.bid}/3`;
          } catch (err) { $('#suerr').innerHTML = `<div class="banner bad" style="margin:0"><span class="grow" style="white-space:pre-line">${esc(err.message)}</span></div>`; $('#suerr').scrollIntoView({ block: 'center' }); }
          break;
        }
        case 'rpsla': {
          const sla = Object.fromEntries(URGS.map(u => [u, { respond: +d[u + '_respond'], fix: +d[u + '_fix'] }]));
          if (await act('PUT', '/api/admin/settings', { sla }, ['Service-level targets saved'])) render(true);
          break;
        }
        case 'sutree': {
          const items = [...f.querySelectorAll('[data-tree]')].map(r => ({ meterId: r.dataset.tree, role: (r.querySelector('[name=role]') || {}).value || 'sub', parentId: r.querySelector('[name=parent]').value }));
          try {
            await api('POST', `/api/utility/tree/${f.dataset.bid}`, { items });
            await api('POST', `/api/utility/tolerance/${f.dataset.bid}`, { electricity: d.tolE, water: d.tolW });
            toast('Meter tree saved'); ui.suCheck = {}; await refresh(); location.hash = `#/meters/setup/${f.dataset.bid}/4`;
          } catch (err) { toast('Could not save the tree', err.message, 'bad'); }
          break;
        }
        case 'sutest': {
          const x = await act('POST', `/api/meters/${encodeURIComponent(f.dataset.meter)}/readings`, { value: d.value, photo: ui.mphoto });
          if (x) { ui.mphoto = null; if (x.warning) toast('Check this reading', x.warning, 'bad'); else toast('Reading saved'); (ui.suCheck || {})[f.dataset.bid] = null; render(true); }
          break;
        }
        case 'sustep4': {
          const assign = [...f.querySelectorAll('[data-sutariff]')].map(x => ({ meterId: x.dataset.sutariff, tariffId: x.value }));
          if (await act('POST', `/api/utility/tariffs/${f.dataset.bid}`, { assign }, ['Tariffs linked'])) location.hash = `#/meters/setup/${f.dataset.bid}/6`;
          break;
        }
        case 'tech': {
          const r = await act('POST', '/api/techs', { id: f.dataset.id || undefined, name: d.name, skill: d.skill, phone: d.phone, email: d.email, vehicle: d.vehicle, status: d.status }, ['Technician saved']);
          if (r) location.hash = '#/service/techs';
          break;
        }
        case 'contacts': {
          const contacts = [...f.querySelectorAll('[data-row]')].map(r => ({ id: r.querySelector('[name=c_id]').value, name: r.querySelector('[name=c_name]').value, role: r.querySelector('[name=c_role]').value, phone: r.querySelector('[name=c_phone]').value, email: r.querySelector('[name=c_email]').value, notify: r.querySelector('[name=c_notify]').checked }));
          if (await act('PUT', `/api/buildings/${f.dataset.bid}/contacts`, { contacts }, ['Contacts saved', 'They will receive notifications for this building'])) location.hash = '#/service/clients';
          break;
        }
        case 'unit': {
          const r = await act('POST', `/api/buildings/${f.dataset.bid}/units`, { originalId: f.dataset.orig || undefined, unit: { id: d.id, type: d.type, location: d.location, make: d.make, model: d.model, serial: d.serial, installed: d.installed, refrigerant: d.refrigerant, capacity: d.capacity, intervalMonths: d.intervalMonths, notes: d.notes } }, ['Unit saved']);
          if (r && r.unit) location.hash = `#/service/unit/${f.dataset.bid}/${encodeURIComponent(r.unit.id)}`;
          break;
        }
        case 'service': {
          if (await act('POST', '/api/services', { building: f.dataset.bid, unit: f.dataset.uid, date: d.date, type: d.type, tech: d.tech, work: d.work, notes: d.notes, billing: { lines: readLines(f) } }, ['Saved to service history'])) render(true);
          break;
        }
        case 'password': if (await act('POST', '/api/me/password', { current: d.current, password: d.password }, ['Password changed', 'Sign in again on your other devices.'])) f.reset(); break;
      }
    } finally { if (btn) btn.disabled = false; }
  });
  $('#bellBtn').addEventListener('click', () => { location.hash = '#/service/notifications'; });
  window.addEventListener('hashchange', () => render());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S) refresh().catch(() => {}); });

  function clock() {
    const d = new Date();
    $('#clock').textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    $('#date').textContent = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!S) return;
    const pill = $('#bmsPill');
    const bad = activeAlarms().length;
    pill.className = 'pill ' + (bad ? 'bad' : 'ok');
    pill.innerHTML = `<i></i>${bad ? bad + ' Alarm' + (bad > 1 ? 's' : '') : 'All normal'}`;
  }

  /* ---------------- boot ---------------- */
  clock();
  setInterval(clock, 1000);
  if (!introSeen()) showIntro(0);
  refresh().then(() => render()).catch(() => { if (!S) showLogin(); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
