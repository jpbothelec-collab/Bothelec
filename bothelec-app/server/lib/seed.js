'use strict';
/* Initial data. With SEED_DEMO=true a demonstration site (simulated BMS) and sample jobs are created.
 * Without it the system starts empty apart from the admin user. Contact details are placeholders:
 * edit them in Settings → Buildings before going live. */
const { emptyBms } = require('./util');

const STEPS = [
  { key: 'logged', label: 'Call logged', icon: 'phone' },
  { key: 'assigned', label: 'Technician assigned', icon: 'users' },
  { key: 'enroute', label: 'On the way', icon: 'route' },
  { key: 'onsite', label: 'Arrived on site', icon: 'pin' },
  { key: 'completed', label: 'Work completed', icon: 'wrench' },
  { key: 'report', label: 'Report ready', icon: 'card' },
];

/* Who is notified, on which channel, for each job step and alarm priority.
 * Roles: manager (building manager), ops (operations manager), desk (Bothelec service desk),
 * tech (assigned technician), caller (person who logged the call). Editable in Settings. */
const DEFAULT_POLICY = {
  jobSteps: {
    logged: { email: ['manager', 'ops', 'desk', 'caller'], sms: [] , smsIfUrgent: ['desk'] },
    assigned: { email: ['manager', 'ops'], sms: ['tech'] },
    enroute: { email: [], sms: ['manager'] },
    onsite: { email: ['manager'], sms: [] },
    completed: { email: ['manager', 'ops'], sms: [] },
    report: { email: ['manager', 'ops', 'desk', 'caller'], sms: ['manager'] },
  },
  alarms: {
    Critical: { email: ['manager', 'ops', 'desk'], sms: ['manager', 'ops', 'desk'] },
    High: { email: ['manager', 'ops', 'desk'], sms: ['desk'] },
    Medium: { email: ['desk'], sms: [] },
    Low: { email: [], sms: [] },
  },
  alarmCleared: { email: ['manager', 'ops', 'desk'], sms: [] },
};

function minsAgo(m) { return new Date(Date.now() - m * 60000).toISOString(); }

function demoBms() {
  const b = emptyBms();
  [1, 2, 3].forEach(f => ['W', 'C', 'E'].forEach(p => {
    const t = +(21.6 + Math.random() * 1.2).toFixed(1);
    b.zones.push({ id: 'L' + f + '-' + p, floor: f, pos: p, temp: t, target: t, setpoint: 22.0, online: true });
  }));
  b.ahus = [1, 2, 3, 4, 5, 6].map(n => ({
    id: 'AHU-0' + n, name: ['East Wing', 'Central', 'West Wing', 'Level 3', 'Lobby', 'Kitchen'][n - 1],
    status: n === 5 ? 'off' : 'running', supplyHz: 48, returnHz: 42, supplyTemp: 13.4, returnTemp: 22.9,
    mixedTemp: 24.7, outsideTemp: 28.3, chwValve: 64, damper: 51, filterDp: 118, mode: 'Auto',
  }));
  b.chillers = [
    { id: 'CH-01', name: 'Air-cooled chiller', status: 'running', load: 78, chws: 6.4, chwr: 12.1, comps: ['run', 'run'] },
    { id: 'CH-02', name: 'Air-cooled chiller', status: 'standby', load: 0, chws: null, chwr: null, comps: ['stby', 'stby'] },
  ];
  b.pumps = [
    { id: 'CHWP-01', type: 'Chilled water pump', status: 'running', hz: 48 },
    { id: 'CHWP-02', type: 'Chilled water pump', status: 'standby', hz: 0 },
    { id: 'CHWP-03', type: 'Chilled water pump', status: 'standby', hz: 0 },
    { id: 'CWP-01', type: 'Condenser water pump', status: 'running', hz: 46 },
    { id: 'CWP-02', type: 'Condenser water pump', status: 'running', hz: 45 },
    { id: 'BS-01', type: 'Domestic booster set', status: 'running', hz: 38 },
  ];
  b.towers = [
    { id: 'CT-01', status: 'running', fan: 72, leaving: 27.4, entering: 31.8 },
    { id: 'CT-02', status: 'running', fan: 64, leaving: 27.6, entering: 31.5 },
  ];
  b.fans = [
    { id: 'EF-01', name: 'Toilet extract L1', status: 'running' }, { id: 'EF-02', name: 'Toilet extract L2', status: 'running' },
    { id: 'EF-03', name: 'Toilet extract L3', status: 'running' }, { id: 'KEF-01', name: 'Kitchen extract', status: 'running' },
    { id: 'BEF-01', name: 'Basement car park extract', status: 'standby' }, { id: 'SPF-01', name: 'Stair pressurisation', status: 'standby' },
  ];
  b.zones.forEach((z, i) => {
    b.fcus.push({ id: 'FCU-L' + z.floor + '-0' + (i % 3 * 2 + 1), zone: z.id, status: 'running', valve: 50 });
    b.fcus.push({ id: 'FCU-L' + z.floor + '-0' + (i % 3 * 2 + 2), zone: z.id, status: 'running', valve: 50 });
  });
  b.humidity = 54; b.co2 = 615; b.outside = 28.3;
  return b;
}

function seed(demo) {
  const s = {
    meta: { id: 'meta', seq: 1048 },
    buildings: [], technicians: [], jobs: [], services: [], tracker: [], meters: [], tenants: [], recoveries: [], readings: [], feed: [], alarms: [], vehicles: [], trips: [], assessments: [], documents: [], bms: {},
  };
  if (!demo) return s;

  s.meta.seq = 1052;
  const unit = (id, type, location, make, model, serial, installed, refrigerant, intervalMonths = 3) => ({ id, type, location, make, model, serial, installed, refrigerant, capacity: '', intervalMonths, notes: '', removed: false });
  const contact = (name, role, phone, email) => ({ id: 'C' + Math.random().toString(36).slice(2, 7), name, role, phone, email, notify: true });
  s.buildings = [
    {
      id: 'B1', name: 'Demonstration Building', client: 'Demonstration Site', area: 'Midrand',
      contacts: [contact('L. Pillay', 'Building Manager', '+27 11 555 0101', 'building.manager@example.com'), contact('R. Botha', 'Operations Manager', '+27 11 555 0102', 'operations.manager@example.com')],
      units: [
        unit('AHU-01', 'Air handling unit', 'Roof plant', 'Carrier', '39HQ-12', 'C39-110233', '2019-03-14', ''),
        unit('AHU-02', 'Air handling unit', 'Roof plant', 'Carrier', '39HQ-12', 'C39-110234', '2019-03-14', ''),
        unit('AHU-03', 'Air handling unit', 'Roof plant', 'Carrier', '39HQ-10', 'C39-110298', '2019-03-14', ''),
        unit('CH-01', 'Air-cooled chiller', 'Roof plant', 'Daikin', 'EWAD-TZ 400', 'DK-4471902', '2019-02-20', 'R134a', 6),
        unit('CH-02', 'Air-cooled chiller', 'Roof plant', 'Daikin', 'EWAD-TZ 400', 'DK-4471903', '2019-02-20', 'R134a', 6),
        unit('CHWP-01', 'Chilled water pump', 'Basement plant room', 'Grundfos', 'NBG 80-65', 'GF-88231', '2019-02-20', '', 6),
        unit('CT-01', 'Cooling tower', 'Roof plant', 'BAC', 'VTL-150', 'BAC-77410', '2019-02-25', '', 3),
        unit('FCU-L2-04', 'Fan coil unit', 'Level 2 - East zone', 'Samsung', 'AM071', 'SM-2201-04', '2021-07-08', 'R410A', 6),
      ],
      locations: ['Roof plant', 'Basement plant room', 'Level 1 - West zone', 'Level 1 - Central zone', 'Level 2 - Central zone', 'Level 2 - East zone', 'Level 3 - West zone', 'Level 3 - East zone'],
      autoCall: true, comfort: [20, 24],
      connector: { type: 'simulator' },
    },
    {
      id: 'B2', name: 'Rosebank Office Park — Block C', client: 'Rosebank Properties', area: 'Rosebank',
      contacts: [contact('M. Khumalo', 'Building Manager', '+27 11 555 0201', ''), contact('D. Smith', 'Operations Manager', '+27 11 555 0202', '')],
      units: [
        unit('VRF-01', 'VRF outdoor unit', 'Roof', 'Daikin', 'RXYQ20U', 'DV-301122', '2020-11-02', 'R410A'),
        unit('VRF-02', 'VRF outdoor unit', 'Roof', 'Daikin', 'RXYQ20U', 'DV-301123', '2020-11-02', 'R410A'),
        unit('SPL-SR1', 'Split unit (server room)', 'Server room', 'Mitsubishi Electric', 'MSZ-LN35', 'ME-55871', '2022-04-19', 'R32'),
        unit('EF-01', 'Extract fan', 'Roof', 'Systemair', 'MUB 042', 'SA-10042', '2020-11-02', '', 12),
      ],
      locations: ['Roof', 'Ground floor', 'Level 1', 'Level 2', 'Server room'], autoCall: true, comfort: [20, 24],
      connector: { type: 'none' },
    },
    {
      id: 'B3', name: 'Centurion Medical Suites', client: 'CMS Holdings', area: 'Centurion',
      contacts: [contact('A. Govender', 'Building Manager', '+27 12 555 0301', ''), contact('K. Mahlangu', 'Operations Manager', '+27 12 555 0302', '')],
      units: [
        unit('AHU-T1', 'Theatre AHU', 'Roof plant', 'Trane', 'CLCF 14', 'TR-998812', '2018-09-01', '', 1),
        unit('CH-A', 'Chiller', 'Roof plant', 'Carrier', '30RB 262', 'CR-30RB-4410', '2018-09-01', 'R410A', 6),
        unit('PU-02', 'Packaged unit', 'Ward A', 'York', 'YPAL 060', 'YK-602210', '2020-01-15', 'R410A'),
      ],
      locations: ['Theatre 1', 'Theatre 2', 'Ward A', 'Roof plant'], autoCall: true, comfort: [20, 24],
      connector: { type: 'none' },
    },
  ];
  s.buildings.forEach(b => { b.equipment = [...b.units.map(u => `${u.id} · ${u.type}`), 'Other / not sure']; b.divisions = ['aircon']; });
  s.buildings[1].divisions = ['aircon', 'utility'];

  /* ---------- Bothelec Utility Management demo: a retail centre with tenants, meters and monthly readings ---------- */
  s.buildings.push({
    id: 'B4', name: 'Sandton Retail Centre', client: 'Sandton Retail Holdings', area: 'Sandton', divisions: ['utility'],
    contacts: [contact('N. Pretorius', 'Building Manager', '+27 11 555 0401', 'centre.manager@example.com'), contact('F. Adams', 'Operations Manager', '+27 11 555 0402', '')],
    units: [], equipment: ['Other / not sure'], locations: ['Main DB room', 'Ground floor', 'Level 1', 'Roof'], autoCall: false, comfort: [20, 24], connector: { type: 'none' },
  });
  const tn = (id, building, name, unit, contactName, email) => s.tenants.push({ id, building, name, unit, contact: contactName, email, phone: '', vatNo: '', active: true, createdAt: new Date().toISOString() });
  tn('TN-CAFE', 'B4', 'Bean There Café', 'Shop 1', 'K. Moodley', 'cafe@example.com');
  tn('TN-PHARM', 'B4', 'Sandton Pharmacy', 'Shop 2', 'R. Patel', 'pharmacy@example.com');
  tn('TN-BOUT', 'B4', 'Loom Boutique', 'Shop 3', 'T. Mabaso', '');
  tn('TN-ROSE1', 'B2', 'Acme Consulting', 'Level 1', 'J. Smith', 'accounts@example.com');
  const mt = (id, building, type, location, tenantId, serial, multiplier = 1) => s.meters.push({ id, building, type, unit: type === 'water' ? 'kL' : 'kWh', serial, make: type === 'water' ? 'Kent' : 'Landis+Gyr', model: type === 'water' ? 'PSM-T 20mm' : 'E650', location, multiplier, tenantId, tariffId: null, comm: 'manual', installed: '2023-03-01', notes: '', removed: false, createdAt: new Date().toISOString() });
  mt('E-S1', 'B4', 'electricity', 'Shop 1 DB', 'TN-CAFE', 'LG-881201');
  mt('E-S2', 'B4', 'electricity', 'Shop 2 DB', 'TN-PHARM', 'LG-881202');
  mt('E-S3', 'B4', 'electricity', 'Shop 3 DB', 'TN-BOUT', 'LG-881203');
  mt('E-MAIN', 'B4', 'electricity', 'Main incomer (CT 400/5)', null, 'LG-880001', 80);
  mt('W-S1', 'B4', 'water', 'Shop 1', 'TN-CAFE', 'KT-55101');
  mt('W-S2', 'B4', 'water', 'Shop 2', 'TN-PHARM', 'KT-55102');
  mt('SOL-1', 'B4', 'solar', 'Roof inverter', null, 'SMA-200177');
  mt('E-L1', 'B2', 'electricity', 'Level 1 DB', 'TN-ROSE1', 'LG-771101');
  mt('E-CA', 'B4', 'electricity', 'Common area lighting & HVAC', null, 'LG-881290');
  mt('W-MAIN', 'B4', 'water', 'Council water connection', null, 'COJ-W-44120');
  const roleOf = { 'E-MAIN': 'council', 'W-MAIN': 'council' };
  const parentOf = { 'E-S1': 'E-MAIN', 'E-S2': 'E-MAIN', 'E-S3': 'E-MAIN', 'E-CA': 'E-MAIN', 'SOL-1': 'E-MAIN', 'W-S1': 'W-MAIN', 'W-S2': 'W-MAIN' };
  s.meters.forEach(m => { m.role = roleOf[m.id] || 'sub'; m.parentId = parentOf[m.id] || null; if (m.id === 'E-MAIN') m.location = 'Council electricity supply (CT 400/5)'; });
  // Readings on the 1st of the last 6 months plus a recent one. Sub-meters vary month to month; the council meters are
  // worked out from them so the building balances, with normal losses, one month over tolerance and one water leak.
  const now = new Date(), stamps = [];
  for (let k = 5; k >= 0; k--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1, 7, 30)); if (d <= now) stamps.push(d.toISOString()); }
  const recent = new Date(now.getTime() - 2 * 864e5); if (recent.getUTCDate() > 3) stamps.push(recent.toISOString());
  const share = i => (i === stamps.length - 1 && recent.getUTCDate() > 3 ? 0.3 : 1); // the recent reading covers part of a month
  const subs = { 'E-S1': [41250, 2350], 'E-S2': [18830, 1180], 'E-S3': [9220, 640], 'E-CA': [15400, 520], 'SOL-1': [52300, 1450], 'W-S1': [812.4, 18.6], 'W-S2': [231.7, 4.2], 'E-L1': [27110, 1720] };
  const vals = {};
  Object.entries(subs).forEach(([m, [startV, per]]) => { let v = startV; vals[m] = stamps.map((ts, i) => { if (i > 0) v += per * share(i) * (0.88 + ((i * 5 + m.length * 3) % 7) / 25); return +v.toFixed(2); }); });
  const use = (m, i) => vals[m][i] - vals[m][i - 1];
  let em = 3120, wm = 1840.5; vals['E-MAIN'] = [em]; vals['W-MAIN'] = [wm];
  for (let i = 1; i < stamps.length; i++) {
    const eLoss = i === 2 ? 0.09 : 0.03, wLoss = i === 3 ? 0.18 : 0.04;
    const shops = use('E-S1', i) + use('E-S2', i) + use('E-S3', i) + use('E-CA', i);
    em += (shops * (1 + eLoss) - use('SOL-1', i)) / 80; vals['E-MAIN'].push(+em.toFixed(3));
    wm += (use('W-S1', i) + use('W-S2', i)) * (1 + wLoss); vals['W-MAIN'].push(+wm.toFixed(2));
  }
  Object.entries(vals).forEach(([m, list]) => list.forEach((v, i) => s.readings.push({ meter: m, ts: stamps[i], value: v, source: 'manual', by: 'S. van Wyk' })));

  s.technicians = [
    { id: 'T1', name: 'J. Mokoena', skill: 'HVAC senior · Chillers & AHUs', phone: '+27 82 555 1001', email: '', status: 'available', vehicle: 'V1' },
    { id: 'T2', name: 'T. Naidoo', skill: 'HVAC technician · VRF & splits', phone: '+27 82 555 1002', email: '', status: 'available', vehicle: 'V2' },
    { id: 'T3', name: 'S. van Wyk', skill: 'Controls & BMS', phone: '+27 82 555 1003', email: '', status: 'available', vehicle: 'V3' },
    { id: 'T4', name: 'P. Dlamini', skill: 'Refrigeration technician', phone: '+27 82 555 1004', email: '', status: 'off', vehicle: 'V4' },
  ];
  const mk = (n, o, ago) => {
    const job = Object.assign({ id: 'BA-' + n, source: 'Client app', urgency: 'Medium', photos: [], findings: '', work: '', signature: null, signedBy: '', notifications: [], steps: {} }, o);
    ago.forEach((m, i) => { job.steps[STEPS[i].key] = minsAgo(m); });
    job.status = STEPS[ago.length - 1].key;
    s.jobs.push(job);
  };
  mk(1048, { building: 'B1', unit: 'AHU-02', techName: 'J. Mokoena', equipment: 'AHU-02 · Air handling unit', location: 'Level 2 - Central zone', fault: 'Office not cooling, warm air', urgency: 'High', tech: 'T1', findings: 'Supply fan belt worn and slipping. Low airflow to Level 2.', work: 'Fan belt replaced and tensioned. Airflow and set-point verified.', signedBy: 'L. Pillay', billing: { lines: [{ id: 'l1', kind: 'Call-out', code: 'CALLOUT', description: 'Call-out fee', qty: 1, unitPrice: 650 }, { id: 'l2', kind: 'Labour', code: 'LAB-HR', description: 'Labour (technician)', qty: 1.5, unitPrice: 550 }, { id: 'l3', kind: 'Part', code: 'BELT-A', description: 'V-belt (A section)', qty: 2, unitPrice: 260 }], notes: '' } }, [1450, 1443, 1427, 1402, 1324, 1321]);
  mk(1047, { building: 'B2', unit: 'VRF-02', tech: 'T2', techName: 'T. Naidoo', equipment: 'VRF-02 · VRF outdoor unit', location: 'Roof', fault: 'VRF-02 error code E7, no cooling on level 2', urgency: 'High',
    findings: 'Outdoor fan motor capacitor failed.', work: 'Capacitor replaced, unit tested, error cleared.', signedBy: 'M. Khumalo',
    billing: { lines: [{ id: 'm1', kind: 'Call-out', code: 'CALLOUT', description: 'Call-out fee', qty: 1, unitPrice: 650 }, { id: 'm2', kind: 'Labour', code: 'LAB-HR', description: 'Labour (technician)', qty: 2, unitPrice: 550 }, { id: 'm3', kind: 'Part', code: 'CAP-35', description: 'Run capacitor 35 µF', qty: 1, unitPrice: 310 }], notes: '' } }, [4400, 4390, 4360, 4330, 4250, 4245]);
  mk(1049, { building: 'B2', equipment: 'SPL-SR1 · Split unit (server room)', location: 'Server room', fault: 'Unit leaking water onto floor', urgency: 'High', tech: 'T2' }, [70, 62, 35]);
  mk(1050, { building: 'B3', equipment: 'PU-02 · Packaged unit', location: 'Ward A', fault: 'Noisy compressor', urgency: 'Medium', tech: 'T3' }, [40, 31]);
  mk(1051, { building: 'B1', equipment: 'FCU-L2-04 · Fan coil unit', location: 'Level 2 - East zone', fault: 'Thermostat display blank', urgency: 'Low' }, [12]);
  const daysAgo = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  /* Six months of completed call-outs so the reports have history (deterministic, not random per start-up). */
  let rs = 7; const rnd = () => ((rs = (rs * 16807) % 2147483647) - 1) / 2147483646;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const FAULTS = {
    'Air handling unit': ['Office not cooling, warm air', 'Fan making a loud noise', 'Filter alarm on BMS', 'Low airflow on the floor'],
    'Air-cooled chiller': ['Chiller tripped on high pressure', 'Chilled water temperature too high', 'Compressor not starting'],
    'Chilled water pump': ['Pump vibrating and noisy', 'Pump tripped'], 'Cooling tower': ['Tower fan not running', 'Water overflowing from basin'],
    'Fan coil unit': ['Thermostat display blank', 'Unit dripping water', 'Not cooling'], 'VRF outdoor unit': ['Error code on controller, no cooling', 'Unit tripping the breaker'],
    'Split unit (server room)': ['Server room too warm', 'Unit leaking water onto floor'], 'Extract fan': ['Fan not running'],
    'Theatre AHU': ['Theatre pressure alarm', 'Theatre too warm'], Chiller: ['Chiller alarm on BMS', 'High discharge pressure'], 'Packaged unit': ['Noisy compressor', 'Not cooling'],
  };
  const WORK = ['Replaced worn part and tested', 'Cleaned coil and drain, unit back in service', 'Reset protection, found loose terminal and tightened', 'Replaced capacitor, unit running normally', 'Topped up refrigerant after leak repair', 'Replaced thermostat and recommissioned'];
  const RESP = { Critical: [35, 150], High: [50, 280], Medium: [90, 1500], Low: [300, 4500] };
  const techFor = { 'Air-cooled chiller': 'T1', 'Air handling unit': 'T1', 'Theatre AHU': 'T1', Chiller: 'T4', 'VRF outdoor unit': 'T2', 'Split unit (server room)': 'T2', 'Fan coil unit': 'T2', 'Packaged unit': 'T4' };
  const hist = [], OPEN_UNITS = new Set(['AHU-02', 'VRF-02', 'SPL-SR1', 'PU-02', 'FCU-L2-04']);
  let prev = null;
  for (let n = 0; n < 46; n++) {
    const day = 182 - n * 3.9 - rnd() * 2;
    const allUnits = s.buildings.slice(0, 3).flatMap(x => x.units.map(u => ({ b: x, u })));
    let { b, u } = allUnits[(n * 4) % allUnits.length]; // each unit roughly every two months
    if (day < 40) for (let k = 1; OPEN_UNITS.has(u.id) && k < allUnits.length; k++) ({ b, u } = allUnits[(n * 4 + k) % allUnits.length]); // recent history avoids units with a call open today
    if (prev && rnd() < 0.08) ({ b, u } = prev); // now and then a repeat call on the same unit
    const urgency = pick(['Critical', 'High', 'High', 'Medium', 'Medium', 'Medium', 'Low']);
    const [r0, r1] = RESP[urgency], resp = Math.round(r0 + rnd() * (r1 - r0)), fix = Math.round(45 + rnd() * 260);
    const tech = rnd() < 0.7 ? (techFor[u.type] || 'T3') : pick(['T1', 'T2', 'T3', 'T4']);
    const lt = new Date(Date.now() - day * 864e5); lt.setUTCHours(5 + Math.floor(rnd() * 9), Math.floor(rnd() * 60)); // 07:00–16:00 SAST
    const logged = Math.max(60 * 24 * 5, Math.round((Date.now() - lt) / 60000));
    const hrs = Math.max(1, Math.round(fix / 60));
    const lines = [{ id: 'h1', kind: 'Call-out', code: 'CALLOUT', description: 'Call-out fee', qty: 1, unitPrice: 650 }, { id: 'h2', kind: 'Labour', code: 'LAB-HR', description: 'Labour (technician)', qty: hrs, unitPrice: 550 }];
    if (rnd() < 0.55) lines.push({ id: 'h3', kind: 'Part', code: 'PART', description: pick(['Run capacitor', 'Fan belt', 'Contactor', 'Thermostat', 'Filter set', 'Refrigerant R410A (kg)']), qty: 1, unitPrice: Math.round(250 + rnd() * 2600) });
    const id = 'BA-' + (1000 + n);
    mk(1000 + n, { building: b.id, unit: u.id, equipment: `${u.id} · ${u.type}`, location: u.location, fault: pick(FAULTS[u.type] || ['Not cooling']), urgency, tech, techName: (s.technicians.find(t => t.id === tech) || {}).name,
      source: pick(['Client app', 'Client app', 'Phone', 'BMS automatic', 'Email']), findings: 'Fault found and diagnosed on site.', work: pick(WORK), signedBy: b.contacts[0].name, signature: null,
      billing: { lines } }, [logged, logged - 8, logged - 15, logged - resp, logged - resp - fix, logged - resp - fix - 6]);
    hist.push({ id, b: b.id, lines, day });
    prev = { b, u };
  }
  const sv = (n, building, unit, d, type, tech, work, notes = '') => s.services.push({ id: 'SV' + n, building, unit, date: daysAgo(d), type, tech, techName: (s.technicians.find(t => t.id === tech) || {}).name || '', work, notes, by: 'Seed', at: new Date(Date.now() - d * 864e5).toISOString() });
  sv(1, 'B1', 'AHU-02', 182, 'Planned maintenance', 'T1', 'Quarterly service: filters replaced, belts checked, coil cleaned, drain flushed.', 'Belt showing early wear.');
  sv(2, 'B1', 'AHU-02', 92, 'Planned maintenance', 'T1', 'Quarterly service: filters replaced, bearings greased, belt re-tensioned.');
  sv(3, 'B1', 'AHU-01', 95, 'Planned maintenance', 'T1', 'Quarterly service: filters replaced, coil cleaned.');
  sv(4, 'B1', 'AHU-03', 40, 'Filter change', 'T3', 'Pre-filters and bag filters replaced after filter ΔP alarm.');
  sv(5, 'B1', 'CH-01', 150, 'Planned maintenance', 'T1', '6-monthly service: refrigerant pressures logged, condenser coils washed, oil checked.', 'Suction 3.1 bar / discharge 14.8 bar.');
  sv(6, 'B1', 'CT-01', 30, 'Inspection', 'T3', 'Basin cleaned, water treatment dosing verified, fan belt checked.');
  sv(7, 'B2', 'SPL-SR1', 120, 'Planned maintenance', 'T2', 'Indoor unit cleaned, drain line flushed, gas pressures checked.');
  sv(9, 'B1', 'CH-02', 160, 'Planned maintenance', 'T1', '6-monthly service on standby chiller: run test, pressures logged, coils washed.');
  sv(10, 'B1', 'CHWP-01', 75, 'Inspection', 'T3', 'Pump vibration and bearing temperature checked, mechanical seal inspected.');
  sv(11, 'B1', 'FCU-L2-04', 200, 'Planned maintenance', 'T2', 'Filter cleaned, condensate tray treated, fan speed checked.');
  sv(12, 'B2', 'VRF-01', 60, 'Planned maintenance', 'T2', 'Outdoor coil cleaned, operating pressures and error log checked.');
  sv(13, 'B2', 'VRF-02', 60, 'Planned maintenance', 'T2', 'Outdoor coil cleaned, operating pressures and error log checked.');
  sv(14, 'B3', 'CH-A', 100, 'Refrigerant top-up', 'T4', 'Small leak found on service valve and repaired; 1.2 kg R410A added.', 'Leak test passed.');
  sv(15, 'B3', 'PU-02', 45, 'Repair', 'T3', 'Compressor contactor replaced.');
  sv(8, 'B3', 'AHU-T1', 20, 'Planned maintenance', 'T1', 'Monthly theatre AHU service: HEPA ΔP logged, pressure cascade verified.');
  /* Billing tracker demo rows (job rows are added automatically) */
  const d = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const tk = (id, o) => s.tracker.push(Object.assign({ id, building: 'B1', jobId: null, serviceId: null, poNumber: '', poDate: '', poStatus: 'None', critical: false, approvedAt: null, approvedBy: '', invoice: null, amountEx: null, amountIncl: null, portalDate: '', paidDate: '', void: false, notes: '', description: '', createdAt: new Date().toISOString() }, o));
  tk('TK-demo1', { jobId: 'BA-1048', poNumber: '1046130', poDate: d(3), poStatus: 'Approved', approvedAt: new Date().toISOString(), approvedBy: 'Seed', invoice: { number: 'INV-0012430', date: d(1), source: 'manual' }, amountEx: 1820, amountIncl: 2093, portalDate: d(1) });
  tk('TK-demo2', { building: 'B2', description: 'Quote: replace server-room split unit', poNumber: '1048452', poDate: d(12), poStatus: 'Pending', amountEx: 77052.9, amountIncl: 88610.84 });
  tk('TK-demo3', { building: 'B3', description: 'Quote: theatre AHU coil replacement', poStatus: 'Not approved', poDate: d(40), amountEx: 221646.61, amountIncl: 254893.6 });
  tk('TK-demo4', { building: 'B2', description: 'Annual maintenance contract — Q3', poNumber: '1045854', poDate: d(120), poStatus: 'Approved', invoice: { number: 'INV-0012323', date: d(75), source: 'manual' }, amountEx: 24692.11, amountIncl: 28395.93, portalDate: d(74) });
  tk('TK-demo5', { building: 'B1', description: 'Annual maintenance contract — Q2', poNumber: '1044321', poDate: d(160), poStatus: 'Approved', invoice: { number: 'INV-0012201', date: d(130), source: 'manual' }, amountEx: 24692.11, amountIncl: 28395.93, portalDate: d(129), paidDate: d(95) });
  hist.forEach((h, i) => {
    const ex = h.lines.reduce((a, l) => a + l.qty * l.unitPrice, 0), done = d(Math.floor(h.day));
    const inv = h.day > 12 ? { number: 'INV-00' + (11800 + i), date: d(Math.floor(h.day) - 3), source: 'manual' } : null;
    tk('TK-h' + i, { building: h.b, jobId: h.id, poNumber: String(1040000 + i * 37), poDate: done, poStatus: 'Approved', approvedAt: inv ? new Date(Date.now() - (h.day - 2) * 864e5).toISOString() : null, approvedBy: inv ? 'Seed' : '',
      invoice: inv, amountEx: Math.round(ex * 100) / 100, amountIncl: Math.round(ex * 115) / 100, portalDate: inv ? inv.date : '', paidDate: inv && h.day > 38 && i % 7 ? d(Math.floor(h.day) - 32) : '' });
  });
  s.technicians[1].status = 'on job'; s.technicians[1].job = 'BA-1049';
  s.technicians[2].status = 'on job'; s.technicians[2].job = 'BA-1050';

  s.bms.B1 = Object.assign(demoBms(), { id: 'B1' });
  s.alarms = [
    { id: 'A1', building: 'B1', at: minsAgo(140), priority: 'Low', equip: 'Set-point adjusted', desc: 'Zone L3-W set-point 22.0 → 21.5 °C', status: 'Info', history: [] },
    { id: 'A2', building: 'B1', at: minsAgo(250), priority: 'Medium', equip: 'AHU-03', desc: 'Filter ΔP high', status: 'Cleared', history: [] },
  ];
  s.vehicles = [
    { id: 'V1', reg: 'JM 42 KL GP', model: 'Toyota Hilux 2.4 GD-6', driver: 'T1', status: 'parked', location: 'Bothelec depot', odo: 84210, fuel: 64 },
    { id: 'V2', reg: 'TN 18 PX GP', model: 'Nissan NP200', driver: 'T2', status: 'on site', location: 'Rosebank', odo: 121480, fuel: 38 },
    { id: 'V3', reg: 'SV 77 BB GP', model: 'Toyota Hilux 2.4 GD-6', driver: 'T3', status: 'in transit', location: 'N1 → Centurion', odo: 55302, fuel: 81 },
    { id: 'V4', reg: 'PD 09 TR GP', model: 'Isuzu D-Max 250', driver: 'T4', status: 'parked', location: 'Bothelec depot', odo: 143900, fuel: 22 },
  ];
  s.trips = [
    { id: 'D-301', what: 'Refrigerant R410A × 2 cylinders', from: 'Bothelec depot', to: 'Rosebank Office Park — Block C', driver: 'T2', vehicle: 'V2', status: 'Delivered', at: minsAgo(55) },
    { id: 'D-302', what: 'Replacement V-belts (AHU set)', from: 'Supplier — Isando', to: 'Bothelec depot', driver: 'T4', vehicle: 'V4', status: 'Scheduled', at: minsAgo(-90) },
  ];
  s.assessments = [
    { id: 'AS-021', building: 'B1', date: minsAgo(60 * 24 * 6), by: 'T3', type: 'Annual plant condition', score: 82, items: [{ name: 'Chillers', rating: 4 }, { name: 'AHUs', rating: 3 }, { name: 'Pumps', rating: 4 }, { name: 'Cooling towers', rating: 4 }, { name: 'Controls / BMS', rating: 5 }], notes: 'AHU-02 belt wear noted. Recommend 6-monthly belt replacement.' },
  ];
  s.documents = [
    { id: 'DOC1', name: 'Service Level Agreement — Demonstration Site', type: 'PDF', size: '412 KB', date: '2026-01-14' },
    { id: 'DOC2', name: 'Planned maintenance schedule 2026', type: 'XLSX', size: '88 KB', date: '2026-02-02' },
    { id: 'DOC3', name: 'As-built HVAC drawings — Rev C', type: 'PDF', size: '6.1 MB', date: '2025-09-30' },
  ];
  return s;
}

/* Price list for parts & labour (edit in Settings → Zoho Books & billing). Prices exclude VAT. */
const DEFAULT_BILLING = () => ({
  currency: 'ZAR', vatRate: 15, pricesIncludeVat: false, autoInvoice: false, termsDays: 30, trackerV1: true, zohoTaxId: '',
  catalogue: [
    { code: 'CALLOUT', name: 'Call-out fee', kind: 'Call-out', unit: 'each', rate: 650, zohoItemId: '' },
    { code: 'LAB-HR', name: 'Labour (technician)', kind: 'Labour', unit: 'hour', rate: 550, zohoItemId: '' },
    { code: 'LAB-AH', name: 'Labour after hours', kind: 'Labour', unit: 'hour', rate: 825, zohoItemId: '' },
    { code: 'PM-SPLIT', name: 'Planned service: split unit', kind: 'Labour', unit: 'each', rate: 750, zohoItemId: '' },
    { code: 'PM-AHU', name: 'Planned service: AHU', kind: 'Labour', unit: 'each', rate: 2400, zohoItemId: '' },
    { code: 'FLT-G4', name: 'Filter G4 panel', kind: 'Part', unit: 'each', rate: 180, zohoItemId: '' },
    { code: 'BELT-A', name: 'V-belt (A section)', kind: 'Part', unit: 'each', rate: 260, zohoItemId: '' },
    { code: 'GAS-R410A', name: 'Refrigerant R410A', kind: 'Part', unit: 'kg', rate: 420, zohoItemId: '' },
    { code: 'GAS-R32', name: 'Refrigerant R32', kind: 'Part', unit: 'kg', rate: 380, zohoItemId: '' },
    { code: 'CAP-35', name: 'Run capacitor 35 µF', kind: 'Part', unit: 'each', rate: 310, zohoItemId: '' },
  ],
});

module.exports = { seed, STEPS, DEFAULT_POLICY, DEFAULT_BILLING };
