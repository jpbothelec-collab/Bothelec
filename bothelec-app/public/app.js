/* Bothelec Aircon Solutions — Operations, Service & Building Monitoring web app.
 * Vanilla JS single-page app. Hash routing, event delegation, simulated BMS feed. */
(function () {
  'use strict';

  let S = null; // filled from /api/state
  let STEPS = [];
  const EMPTY_BMS = { zones: [], ahus: [], chillers: [], pumps: [], towers: [], fans: [], fcus: [], trend: [], fault: null };
  const ui = { jobFilter: 'open', zoneSel: [], pendingPhotos: [], sigDirty: false, unread: 0, site: null, lastFeed: null, bmsCache: {}, pendingRender: false };
  try { ui.site = localStorage.getItem('bothelec.site'); } catch (e) { /* storage blocked */ }

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
    ['service/live', 'Live Jobs', 'grid'], ['service/callout', 'Call-outs', 'phone'], ['service/jobcards', 'Job Cards', 'card'],
    ['service/techs', 'Technicians', 'users', 'staff'], ['service/notifications', 'Notifications', 'bell'], ['assessments', 'Assessments', 'clipboard', 'field'],
    ['service/reports', 'Reports', 'chart'], ['service/clients', 'Clients', 'building', 'staff'], ['service/documents', 'Documents', 'doc'],
  ];
  const BMS_SIDE = [
    ['bms/overview', 'Site Overview', 'building'], ['bms/chillers', 'Chiller Plants', 'snow'], ['bms/ahus', 'AHUs & Ventilation', 'wind'],
    ['bms/fcus', 'FCU Units', 'fcu'], ['bms/towers', 'Cooling Towers', 'tower'], ['bms/pumps', 'Pumps & Booster Sets', 'pump'],
    ['bms/fans', 'Fans & Extracts', 'fan'], ['bms/zones', 'Temperatures', 'thermo'], ['bms/alarms', 'Alarms', 'alert'],
    ['bms/trends', 'Trends', 'trend'], ['bms/points', 'Point Register', 'list'], ['service/documents', 'Documents', 'doc'],
  ];
  const SETTINGS_SIDE = [['settings', 'SMS & email', 'bell'], ['settings/buildings', 'Buildings & BMS links', 'building'], ['settings/users', 'Users', 'users'], ['settings/outbox', 'Message log', 'list']];
  const MODULES = [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid', home: 'dashboard', side: SERVICE_SIDE, sub: 'Operations & Service' },
    { id: 'bms', label: 'Info Hub', icon: 'info', home: 'bms/overview', side: BMS_SIDE, sub: 'Building Monitoring Centre' },
    { id: 'service', label: 'Service & Maintenance', short: 'Service', icon: 'wrench', home: 'service/live', side: SERVICE_SIDE, sub: 'Operations & Service' },
    { id: 'vehicles', label: 'Vehicles', icon: 'truck', home: 'vehicles', side: [['vehicles', 'Fleet', 'truck'], ['vehicles/service', 'Service schedule', 'wrench']], sub: 'Fleet', roles: ['admin', 'desk', 'tech'] },
    { id: 'dispatch', label: 'Driver Dispatch', short: 'Dispatch', icon: 'pin', home: 'dispatch', side: [['dispatch', 'Trips & deliveries', 'route'], ['dispatch/new', 'New trip', 'plus']], sub: 'Logistics', roles: ['admin', 'desk', 'tech'] },
    { id: 'assessments', label: 'Assessments', short: 'Assess', icon: 'clipboard', home: 'assessments', side: [['assessments', 'All assessments', 'clipboard'], ['assessments/new', 'New assessment', 'plus']], sub: 'Site assessments', roles: ['admin', 'desk', 'tech'] },
    { id: 'settings', label: 'Settings', icon: 'gear', home: 'settings', side: SETTINGS_SIDE, sub: 'Administration', roles: ['admin'] },
  ];
  const role = () => (S && S.me ? S.me.role : 'client');
  const isStaff = () => role() === 'admin' || role() === 'desk';
  const isField = () => role() !== 'client';
  const sideAllowed = item => !item[3] || (item[3] === 'staff' ? isStaff() : isField());
  const site = () => (S && S.buildings.find(b => b.id === ui.site)) || {};
  const canSim = () => isStaff() && (site().connector || {}).type === 'simulator';

  function renderNav(mod, key) {
    $('#modules').innerHTML = MODULES.filter(m => !m.roles || m.roles.includes(role())).map(m =>
      `<a href="#/${m.home}" class="${m.id === mod.id ? 'active' : ''}" title="${esc(m.label)}">${ic(m.icon)}<span class="l">${esc(m.label)}</span><span class="s">${esc(m.short || m.label)}</span></a>`).join('');
    const b = site();
    $('#siteName').textContent = b.name || 'No building';
    $('#siteArea').textContent = b.area || '';
    const activeAlarms = S.alarms.filter(a => a.status === 'Active' && a.building === ui.site).length;
    const conn = (b.connector || {}).type || 'none';
    $('#sidebar').innerHTML = `
      <div class="site-card">${icS('building')}<div style="min-width:0;flex:1">${S.buildings.length > 1
        ? `<select data-change="site" aria-label="Building" style="width:100%;background:transparent;border:0;font-weight:650;font-size:12px;padding:0">${S.buildings.map(x => `<option value="${x.id}" ${x.id === ui.site ? 'selected' : ''} style="background:#0d1c21">${esc(x.name)}</option>`).join('')}</select>`
        : `<strong>${esc(b.name || '—')}</strong>`}<small>${esc(b.area || '')}</small>
        <span class="pill ${conn === 'none' ? 'off' : 'ok'}" style="margin-top:3px;width:max-content"><i></i>${conn === 'none' ? 'No BMS link' : conn === 'simulator' ? 'Simulated' : 'BMS ' + conn}</span></div></div>
      <nav class="side">${mod.side.filter(sideAllowed).map(([href, label, icon]) => {
        const on = key === href || (key.startsWith(href + '/') && href.includes('/')) || (href === 'bms/ahus' && key === 'bms/ahu') || (href === 'service/jobcards' && (key === 'service/job' || key === 'service/report')) || (href === 'bms/alarms' && key === 'bms/alarm') || (href === 'settings/buildings' && key === 'settings/building') || (href === 'settings/users' && key === 'settings/user');
        const count = href === 'bms/alarms' && activeAlarms ? `<span class="count">${activeAlarms}</span>` : '';
        return `<a href="#/${href}" class="${on ? 'active' : ''}">${ic(icon)}<span>${esc(label)}</span>${count}</a>`;
      }).join('')}</nav>
      ${mod.id === 'bms' && S.bms.ahus.length ? `<div class="side-label">AHU units (${S.bms.ahus.length})</div><nav class="side">${S.bms.ahus.map(a =>
        `<a href="#/bms/ahu/${a.id}" class="${key === 'bms/ahu' && current.arg === a.id ? 'active' : ''}">${ic('wind')}<span>${a.id}</span><span style="margin-left:auto">${dot(a.status)}</span></a>`).join('')}</nav>` : ''}
      <div class="side-label">Signed in</div><div class="side acct"><a href="#/account">${ic('users')}<span>${esc(S.me.name)}</span></a><a href="#" data-action="logout">${ic('back')}<span>Sign out</span></a></div>`;
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
    if (!ui.site) { S.bms = normalizeBms(null); return; }
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
    if (!S.buildings.find(b => b.id === ui.site)) ui.site = (S.buildings.find(b => b.connector && b.connector.type !== 'none') || S.buildings[0] || {}).id || null;
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
  const NO_AUTO = new Set(['service/callout', 'dispatch/new', 'assessments/new', 'settings', 'settings/building', 'settings/user', 'settings/users', 'settings/buildings', 'settings/outbox', 'account', 'bms/points']);
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
      <button class="btn primary" type="submit">Sign in</button><small id="loginErr" style="color:var(--red)"></small></form>`;
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
    const zonesAll = S.bms.zones;
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
    S.bms.ahus.slice(0, 6).map((a, i) => ({ a, x: x0 + 0.6 + (i % 3) * 2.9, y: y0 + 0.4 + Math.floor(i / 3) * 1.8 }))
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
    const list = ui.jobFilter === 'open' ? openJobs() : ui.jobFilter === 'done' ? S.jobs.filter(j => j.status === 'report') : S.jobs;
    const crit = openJobs().filter(j => j.urgency === 'Critical' || j.urgency === 'High').length;
    const done = S.jobs.filter(j => j.status === 'report' && Date.now() - new Date(j.steps.report) < 864e5).length;
    return head('Live Jobs', 'Client portfolio · live view', `<a class="btn primary sm" href="#/service/callout">${ic('plus')}New call-out</a>`) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('wrench', 'Open jobs', openJobs().length)}${kpi('alert', 'High / critical', crit)}${kpi('route', 'On the way', S.jobs.filter(j => j.status === 'enroute').length)}${kpi('check', 'Closed (24 h)', done)}</div>
      <div class="card"><header><h2>Jobs</h2><div class="seg">${[['open', 'Open'], ['all', 'All'], ['done', 'Completed']].map(([k, l]) => `<button data-action="jobfilter" data-v="${k}" class="${ui.jobFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div></header>${jobsTable(list)}</div>`;
  }
  function viewCallout() {
    const b = site().id ? site() : (S.buildings[0] || { equipment: [], locations: [] });
    ui.pendingPhotos = [];
    if (!S.buildings.length) return head('New call-out') + '<div class="card empty">No buildings are linked to your account yet.</div>';
    return head('New call-out', 'Client app → Bothelec service desk') +
      `<div class="grid split">
        <form class="card form" data-form="callout">
          <header><h2>New call-out</h2><span class="pill">DRAFT</span></header>
          <div class="field"><label for="f-b">Building</label><select id="f-b" name="building" data-change="building">${S.buildings.map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="f-e">Equipment</label><select id="f-e" name="equipment">${(b.equipment || []).map(e => `<option>${esc(e)}</option>`).join('')}</select></div>
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
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${t && t.phone ? `<a class="btn sm" href="tel:${t.phone.replace(/\s/g, '')}">${ic('phone')}Call technician</a>` : ''}<a class="btn sm" href="tel:${(b.managerPhone || '').replace(/\s/g, '')}">${ic('phone')}Building manager</a></div>
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
        <h2 style="margin:18px 0 6px">Customer sign-off</h2>${j.signature ? `<img class="sig-img" src="${j.signature}" alt="Signature"><p><small>Signed by ${esc(j.signedBy)} · ${hhmm(j.steps.report)}</small></p>` : '<p class="muted">Signed on paper / legacy record.</p>'}
        <h2 style="margin:18px 0 6px">Timeline</h2>${timeline(STEPS.filter(s => j.steps[s.key]).map(s => ({ label: s.label, at: j.steps[s.key], icon: s.icon })))}
      </article>`;
  }
  function viewTechs() {
    return head('Technicians', 'Field team status') + `<div class="grid g2">${S.technicians.map(t => {
      const v = byId(S.vehicles, t.vehicle), j = t.job && byId(S.jobs, t.job);
      return `<div class="card"><header><h2>${esc(t.name)}</h2>${statusPill(t.status)}</header><small>${esc(t.skill)}</small>
        <dl class="kv" style="margin-top:10px"><dt>Current job</dt><dd>${j && t.status === 'on job' ? `<a href="#/service/job/${j.id}">${j.id} · ${esc(stepLabel(j.status))}</a>` : '—'}</dd><dt>Vehicle</dt><dd>${v ? esc(v.reg) : '—'}</dd><dt>Location</dt><dd>${v ? esc(v.location) : '—'}</dd></dl>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${t.phone ? `<a class="btn sm" href="tel:${t.phone.replace(/\s/g, '')}">${ic('phone')}Call</a>` : ''}
        ${t.status !== 'on job' && (isStaff() || S.me.techId === t.id) ? `<button class="btn sm" data-action="duty" data-id="${t.id}">${t.status === 'off' ? 'Set on duty' : 'Set off duty'}</button>` : ''}</div></div>`;
    }).join('')}</div>`;
  }
  function viewNotifs() {
    ui.unread = 0; updateBell();
    return head('Notifications', 'From the moment a call is logged, everyone stays informed') +
      `<div class="grid split"><div class="card"><header><h2>Activity feed</h2><small>${S.feed.length} events</small></header>${feedList(60)}</div>
      <div class="card" style="align-self:start"><header><h2>Who gets notified</h2></header><div class="table-wrap"><table><thead><tr><th>Recipient</th><th>Channel</th></tr></thead><tbody>${[['Building Manager', 'SMS + email'], ['Operations Manager', 'SMS + email'], ['Bothelec service desk', 'Live board + SMS + email'], ['Technician', 'SMS + app'], ['Caller', 'Email']].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted" style="font-size:12px">Which step goes to whom, by SMS or email, is set by the admin under Settings → SMS & email.</p></div></div>`;
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
      <dl class="kv" style="margin-top:10px"><dt>Building manager</dt><dd><a href="tel:${(b.managerPhone || "").replace(/\s/g, '')}">${esc(b.manager)}</a></dd><dt>Operations manager</dt><dd><a href="tel:${(b.opsPhone || "").replace(/\s/g, '')}">${esc(b.ops)}</a></dd>
      <dt>Open jobs</dt><dd>${openJobs().filter(j => j.building === b.id).length}</dd><dt>Assets</dt><dd>${b.equipment.length - 1}</dd></dl></div>`).join('')}</div>`;
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
          ${field('Building name', 'name', b.name, 'text', 'required')}${field('Client', 'client', b.client)}${field('Area', 'area', b.area)}
          <div class="grid g2">${field('Building manager', 'manager', b.manager)}${field('Manager mobile', 'managerPhone', b.managerPhone, 'tel')}</div>${field('Manager email', 'managerEmail', b.managerEmail, 'email')}
          <div class="grid g2">${field('Operations manager', 'ops', b.ops)}${field('Ops mobile', 'opsPhone', b.opsPhone, 'tel')}</div>${field('Ops email', 'opsEmail', b.opsEmail, 'email')}
          <div class="grid g2">${field('Comfort band low (°C)', 'comfortLo', (b.comfort || [20, 24])[0], 'number', 'step="0.5"')}${field('Comfort band high (°C)', 'comfortHi', (b.comfort || [20, 24])[1], 'number', 'step="0.5"')}</div>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="autoCall" ${b.autoCall !== false ? 'checked' : ''}> Raise a service call automatically for critical alarms</label>
          <div class="field"><label>Equipment (one per line, "ID · description")</label><textarea name="equipment" rows="6">${esc((b.equipment || []).join('\n'))}</textarea></div>
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
        <button class="btn primary">Update password</button></form>`;
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
    const places = ['Bothelec depot', ...S.buildings.map(b => b.name), 'Supplier — Isando'];
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
    settings: viewSettings, 'settings/buildings': viewSettingsBuildings, 'settings/building': viewSettingsBuilding, 'settings/users': viewSettingsUsers, 'settings/user': viewSettingsUser, 'settings/outbox': viewOutbox,
    account: viewAccount,
  };
  const LIVE = new Set(['dashboard', 'service/live', 'bms/overview', 'bms/chillers', 'bms/ahus', 'bms/ahu', 'bms/fcus', 'bms/towers', 'bms/pumps', 'bms/fans', 'bms/zones', 'bms/alarms', 'bms/alarm', 'bms/trends']);
  let current = { key: 'dashboard', mod: 'dashboard' };
  function parse() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (!parts.length) return { key: 'dashboard', mod: 'dashboard' };
    const key = parts.slice(0, 2).join('/');
    if (parts.length >= 2 && ROUTES[key]) return { key, arg: parts[2], mod: parts[0] };
    if (ROUTES[parts[0]]) return { key: parts[0], arg: parts[1], mod: parts[0] === 'account' ? 'dashboard' : parts[0] };
    return { key: 'dashboard', mod: 'dashboard' };
  }
  const isLive = () => LIVE.has(current.key) && !document.hidden;
  function render(soft) {
    if (!S) return;
    document.body.classList.remove('auth');
    current = parse();
    let mod = MODULES.find(m => m.id === current.mod) || MODULES[0];
    if (mod.roles && !mod.roles.includes(role())) { mod = MODULES[0]; current = { key: 'dashboard', mod: 'dashboard' }; }
    renderNav(mod, current.key);
    const view = $('#view');
    const bmsView = current.key.startsWith('bms/') && !['bms/alarms', 'bms/alarm'].includes(current.key);
    try {
      view.innerHTML = bmsView && noBms() ? head(esc(site().name || 'Info Hub')) + noBmsCard() : ROUTES[current.key](current.arg);
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
    logout: async () => { try { await api('POST', '/api/logout', {}); } catch (e) { /* ignore */ } S = null; ui.bmsCache = {}; showLogin(); },
    retry: async el => { await act('POST', `/api/admin/outbox/${el.dataset.id}/retry`, {}, ['Retrying']); render(true); },
    deluser: async el => { if (confirm('Delete this user?') && await act('DELETE', `/api/admin/users/${el.dataset.id}`)) location.hash = '#/settings/users'; },
    delbuilding: async el => { if (confirm('Delete this building and its BMS history? Jobs are kept.') && await act('DELETE', `/api/admin/buildings/${el.dataset.id}`)) location.hash = '#/settings/buildings'; },
  };
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (a) { e.preventDefault(); ACTIONS[a.dataset.action] && ACTIONS[a.dataset.action](a); return; }
    const r = e.target.closest('tr[data-href]');
    if (r && !e.target.closest('a,button')) location.hash = r.dataset.href;
  });
  const bindTimers = {};
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.bind) {
      const j = byId(S.jobs, el.dataset.id); if (j) j[el.dataset.bind] = el.value;
      clearTimeout(bindTimers[el.dataset.bind]);
      bindTimers[el.dataset.bind] = setTimeout(() => api('PATCH', `/api/jobs/${el.dataset.id}`, { [el.dataset.bind]: el.value }).catch(err => toast('Not saved', err.message, 'bad')), 600);
    }
    if (el.dataset.filter === 'points') { const q = el.value.toLowerCase(); document.querySelectorAll('#points tbody tr').forEach(tr => { tr.hidden = !tr.textContent.toLowerCase().includes(q); }); }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.change === 'site') switchSite(el.value);
    if (el.dataset.change === 'building') {
      const b = bld(el.value), f = el.form;
      f.equipment.innerHTML = (b.equipment || []).map(x => `<option>${esc(x)}</option>`).join('');
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
          const r = await act('POST', '/api/jobs', { building: d.building, equipment: d.equipment, location: d.location, fault: d.fault, urgency: d.urgency, photos: ui.pendingPhotos, contact: d.contact, contactPhone: d.contactPhone, contactEmail: d.contactEmail }, ['Call logged', 'Your request landed at the Bothelec service desk']);
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
          const body = { id: f.dataset.id || undefined, name: d.name, client: d.client, area: d.area, manager: d.manager, managerPhone: d.managerPhone, managerEmail: d.managerEmail, ops: d.ops, opsPhone: d.opsPhone, opsEmail: d.opsEmail,
            comfort: [+d.comfortLo || 20, +d.comfortHi || 24], autoCall: !!d.autoCall, equipment: lines(d.equipment), locations: lines(d.locations), connector, gsm, regenToken: !!d.regenToken };
          const r = await act('POST', '/api/admin/buildings', body, ['Building saved', 'BMS connection restarted']);
          if (r && r.building) { ui.bmsCache = {}; if (ui.site === r.building.id) await loadBms(); location.hash = '#/settings/building/' + r.building.id; render(true); }
          break;
        }
        case 'user': {
          const body = { id: f.dataset.id || undefined, name: d.name, email: d.email, phone: d.phone, role: d.role, buildings: new FormData(f).getAll('buildings') };
          if (d.password) body.password = d.password;
          const r = await act('POST', '/api/admin/users', body, ['User saved']);
          if (r) location.hash = '#/settings/users';
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
  refresh().then(() => render()).catch(() => { if (!S) showLogin(); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
