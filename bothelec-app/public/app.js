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
    ['service/live', 'Live Jobs', 'grid'], ['service/callout', 'Call-outs', 'phone'], ['service/jobcards', 'Job Cards', 'card'], ['service/equipment', 'Equipment & history', 'fcu'],
    ['service/techs', 'Technicians', 'users', 'staff'], ['service/notifications', 'Notifications', 'bell'], ['assessments', 'Assessments', 'clipboard', 'field'],
    ['service/tracker', 'Billing tracker', 'list', 'staff'], ['service/reports', 'Reports', 'chart'], ['service/clients', 'Clients', 'building', 'staff'], ['service/documents', 'Documents', 'doc'],
  ];
  const BMS_SIDE = [
    ['bms/overview', 'Site Overview', 'building'], ['bms/chillers', 'Chiller Plants', 'snow'], ['bms/ahus', 'AHUs & Ventilation', 'wind'],
    ['bms/fcus', 'FCU Units', 'fcu'], ['bms/towers', 'Cooling Towers', 'tower'], ['bms/pumps', 'Pumps & Booster Sets', 'pump'],
    ['bms/fans', 'Fans & Extracts', 'fan'], ['bms/zones', 'Temperatures', 'thermo'], ['bms/alarms', 'Alarms', 'alert'],
    ['bms/trends', 'Trends', 'trend'], ['bms/points', 'Point Register', 'list'], ['service/documents', 'Documents', 'doc'],
  ];
  const SETTINGS_SIDE = [['settings', 'SMS & email', 'bell'], ['settings/billing', 'Zoho Books & billing', 'doc'], ['settings/buildings', 'Buildings & BMS links', 'building'], ['settings/users', 'Users', 'users'], ['settings/outbox', 'Message log', 'list']];
  const MODULES = [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid', home: 'dashboard', side: SERVICE_SIDE, sub: 'Operations & Service' },
    { id: 'bms', label: 'Info Hub', icon: 'info', home: 'bms/overview', side: BMS_SIDE, sub: 'Building Monitoring Centre' },
    { id: 'service', label: 'Service & Maintenance', short: 'Service', icon: 'wrench', home: 'service/live', side: SERVICE_SIDE, sub: 'Operations & Service' },
    { id: 'vehicles', label: 'Vehicles', icon: 'truck', home: 'vehicles', side: [['vehicles', 'Fleet', 'truck']], sub: 'Fleet', roles: ['admin', 'desk', 'tech'] },
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
        const on = key === href || (key.startsWith(href + '/') && href.includes('/')) || (href === 'bms/ahus' && key === 'bms/ahu') || (href === 'service/jobcards' && (key === 'service/job' || key === 'service/report')) || (href === 'bms/alarms' && key === 'bms/alarm') || (href === 'settings/buildings' && key === 'settings/building') || (href === 'settings/users' && key === 'settings/user') || (href === 'service/equipment' && (key === 'service/unit' || key === 'service/unitedit')) || (href === 'service/techs' && key === 'service/tech') || (href === 'service/clients' && key === 'service/building') || (href === 'service/tracker' && (key === 'service/trackrow' || key === 'service/trackimport'));
        const count = href === 'bms/alarms' && activeAlarms ? `<span class="count">${activeAlarms}</span>` : '';
        return `<a href="#/${href}" class="${on ? 'active' : ''}">${ic(icon)}<span>${esc(label)}</span>${count}</a>`;
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
  const NO_AUTO = new Set(['service/trackimport', 'service/tracker', 'service/trackrow', 'settings/billing', 'service/svbilling', 'service/callout', 'service/tech', 'service/building', 'service/unitedit', 'service/unit', 'dispatch/new', 'assessments/new', 'settings', 'settings/building', 'settings/user', 'settings/users', 'settings/buildings', 'settings/outbox', 'account', 'bms/points']);
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
  const openJobs = () => S.jobs.filter(j => j.status !== 'report');
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
    const list = ui.jobFilter === 'open' ? openJobs() : ui.jobFilter === 'done' ? S.jobs.filter(j => j.status === 'report') : S.jobs;
    const crit = openJobs().filter(j => j.urgency === 'Critical' || j.urgency === 'High').length;
    const done = S.jobs.filter(j => j.status === 'report' && Date.now() - new Date(j.steps.report) < 864e5).length;
    return head('Live Jobs', 'Client portfolio · live view', `<a class="btn primary sm" href="#/service/callout">${ic('plus')}New call-out</a>`) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('wrench', 'Open jobs', openJobs().length)}${kpi('alert', 'High / critical', crit)}${kpi('route', 'On the way', S.jobs.filter(j => j.status === 'enroute').length)}${kpi('check', 'Closed (24 h)', done)}</div>
      <div class="card"><header><h2>Jobs</h2><div class="seg">${[['open', 'Open'], ['all', 'All'], ['done', 'Completed']].map(([k, l]) => `<button data-action="jobfilter" data-v="${k}" class="${ui.jobFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div></header>${jobsTable(list)}</div>`;
  }
  function viewCallout() {
    const pf = ui.prefill; ui.prefill = null;
    const b = (pf && bld(pf.building).id ? bld(pf.building) : null) || (site().id ? site() : (S.buildings[0] || { equipment: [], locations: [] }));
    ui.pendingPhotos = [];
    if (!S.buildings.length) return head('New call-out') + '<div class="card empty">No buildings are linked to your account yet.</div>';
    return head('New call-out', 'Client app → Bothelec service desk') +
      `<div class="grid split">
        <form class="card form" data-form="callout">
          <header><h2>New call-out</h2><span class="pill">DRAFT</span></header>
          <div class="field"><label for="f-b">Building</label><select id="f-b" name="building" data-change="building">${S.buildings.map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="f-e">Equipment</label><select id="f-e" name="equipment">${(b.equipment || []).map(e => `<option ${pf && pf.equipment === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
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
    const done = S.jobs.filter(j => j.status === 'report');
    const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    const resp = avg(S.jobs.filter(j => j.steps.onsite).map(j => mins(j.steps.logged, j.steps.onsite)));
    const site = avg(S.jobs.filter(j => j.steps.completed && j.steps.onsite).map(j => mins(j.steps.onsite, j.steps.completed)));
    return head('Reports', 'Signed service reports and performance') +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('doc', 'Signed reports', done.length)}${kpi('clock', 'Avg. response', dur(resp))}${kpi('wrench', 'Avg. time on site', dur(site))}${kpi('check', 'First-time fix', '100', '%')}</div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Report</th><th>Building</th><th class="hide-sm">Equipment</th><th>Technician</th><th>Date</th></tr></thead><tbody>
      ${done.map(j => `<tr class="click" data-href="#/service/report/${j.id}"><td><strong>${j.id}</strong></td><td>${esc(bld(j.building).name)}</td><td class="hide-sm">${esc(j.equipment)}</td><td>${esc(techName(j) || '—')}</td><td>${dmy(j.steps.report)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No signed reports yet.</td></tr>'}
      </tbody></table></div></div>`;
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
  function viewTechEdit(id) {
    const t = id === 'new' ? { status: 'available' } : tech(id);
    if (!t || !isStaff()) return head('Technician not found');
    return head(id === 'new' ? 'Add technician' : 'Edit ' + esc(t.name), 'Technicians receive job SMS on this mobile number', `<a class="btn sm" href="#/service/techs">${ic('back')}All technicians</a>`) +
      `<form class="card form" data-form="tech" data-id="${id === 'new' ? '' : t.id}" style="max-width:640px">
        ${field('Full name', 'name', t.name, 'text', 'required')}${field('Skills / role', 'skill', t.skill, 'text', 'placeholder="e.g. HVAC technician · VRF & splits"')}
        <div class="grid g2">${field('Mobile (for job SMS)', 'phone', t.phone, 'tel', 'placeholder="082 123 4567"')}${field('Email', 'email', t.email, 'email')}</div>
        <div class="grid g2"><div class="field"><label>Vehicle</label><select name="vehicle"><option value="">— none —</option>${S.vehicles.map(v => `<option value="${v.id}" ${t.vehicle === v.id ? 'selected' : ''}>${esc(v.reg)} · ${esc(v.model)}</option>`).join('')}</select></div>
        <div class="field"><label>Status</label><select name="status" ${t.status === 'on job' ? 'disabled' : ''}>${t.status === 'on job' ? '<option>On a job</option>' : [['available', 'Available'], ['off', 'Off duty']].map(([v, l]) => `<option value="${v}" ${t.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <p class="muted" style="margin:0;font-size:12px">To let this technician sign in to the app, add a user with the Technician role under Settings → Users and link it to this record.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">${ic('check')}Save technician</button>${id === 'new' ? '' : `<button type="button" class="btn danger" data-action="deltech" data-id="${t.id}">Remove technician</button>`}</div></form>`;
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
    return head('Clients', 'Buildings under service, their managers and equipment') + `<div class="grid g2">${S.buildings.map(b => `<div class="card"><header><h2>${esc(b.name)}</h2></header><small>${esc(b.client || '')} · ${esc(b.area || '')}</small>
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
      `${S.buildings.length > 1 ? `<select data-change="eqsite" aria-label="Building" style="padding:8px 10px;background:var(--bg2);border:1px solid var(--line2);border-radius:8px">${S.buildings.map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}${isStaff() ? `<a class="btn primary sm" href="#/service/unitedit/${b.id}/new">${ic('plus')}Add unit</a>` : ''}`) +
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
        <button class="btn primary">Update password</button></form>`;
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

  /* ---------------- parts & labour, invoicing ---------------- */
  const LINE_KINDS = ['Call-out', 'Labour', 'Part', 'Other'];
  const B = () => S.billing || { vatRate: 15, pricesIncludeVat: false, currency: 'ZAR', catalogue: [] };
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
    return (S.tracker || []).map(t => {
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
      return { t, job, sv, rec, b: bld(t.building), inv, ex, incl, overdue, st, jobDate, ref: job ? job.id : sv ? `${sv.unit} · ${sv.type}` : (t.description || '') };
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
          <td>${r.job ? `<a href="#/service/job/${r.job.id}">${r.job.id}</a>` : r.sv ? `<a href="#/service/svbilling/${r.sv.id}">${esc(r.ref)}</a>` : `<span class="tk-desc">${esc(r.ref)}</span>`}<br><small>${r.jobDate ? dmy(r.jobDate) : '&nbsp;'}</small></td>
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
    dashboard: viewDashboard,
    'service/live': viewLive, 'service/callout': viewCallout, 'service/jobcards': viewJobCards, 'service/job': viewJob, 'service/report': viewReport,
    'service/techs': viewTechs, 'service/notifications': viewNotifs, 'service/reports': viewReports, 'service/clients': viewClients, 'service/documents': viewDocs,
    'bms/overview': viewOverview, 'bms/chillers': viewChillers, 'bms/ahus': viewAhus, 'bms/ahu': viewAhu, 'bms/fcus': viewFcus, 'bms/towers': viewTowers,
    'bms/pumps': viewPumps, 'bms/fans': viewFans, 'bms/zones': viewZones, 'bms/alarms': viewAlarms, 'bms/alarm': viewAlarm, 'bms/trends': viewTrends, 'bms/points': viewPoints,
    vehicles: viewVehicles, dispatch: viewDispatch, 'dispatch/new': viewDispatchNew,
    assessments: viewAssessments, 'assessments/new': viewAssessNew,
    settings: viewSettings, 'settings/buildings': viewSettingsBuildings, 'settings/building': viewSettingsBuilding, 'settings/users': viewSettingsUsers, 'settings/user': viewSettingsUser, 'settings/outbox': viewOutbox, 'settings/billing': viewSettingsBilling, 'service/tracker': viewTracker, 'service/trackimport': viewTrackImport, 'service/trackrow': viewTrackRow, 'service/svbilling': viewServiceBilling,
    account: viewAccount,
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
    if (mod.roles && !mod.roles.includes(role())) { mod = MODULES[0]; current = { key: 'dashboard', mod: 'dashboard' }; }
    renderNav(mod, current.key);
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
    deluser: async el => { if (confirm('Delete this user?') && await act('DELETE', `/api/admin/users/${el.dataset.id}`)) location.hash = '#/settings/users'; },
    delbuilding: async el => { if (confirm('Delete this building and its BMS history? Jobs are kept.') && await act('DELETE', `/api/admin/buildings/${el.dataset.id}`)) location.hash = '#/settings/buildings'; },
  };
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (a) { e.preventDefault(); ACTIONS[a.dataset.action] && ACTIONS[a.dataset.action](a); return; }
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
          const body = { id: f.dataset.id || undefined, name: d.name, client: d.client, area: d.area, portal: d.portal,
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
