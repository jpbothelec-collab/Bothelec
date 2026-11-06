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
 * Roles: manager (building manager), ops (operations manager), desk (Trigon service desk),
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
    buildings: [], technicians: [], jobs: [], feed: [], alarms: [], vehicles: [], trips: [], assessments: [], documents: [], bms: {},
  };
  if (!demo) return s;

  s.meta.seq = 1052;
  s.buildings = [
    {
      id: 'B1', name: 'Demonstration Building', client: 'Demonstration Site', area: 'Midrand',
      manager: 'L. Pillay', managerPhone: '+27 11 555 0101', managerEmail: 'building.manager@example.com',
      ops: 'R. Botha', opsPhone: '+27 11 555 0102', opsEmail: 'operations.manager@example.com',
      equipment: ['AHU-01 · Air handling unit', 'AHU-02 · Air handling unit', 'AHU-03 · Air handling unit', 'CH-01 · Air-cooled chiller', 'CH-02 · Air-cooled chiller', 'CHWP-01 · Chilled water pump', 'CT-01 · Cooling tower', 'FCU-L2-04 · Fan coil unit', 'Other / not sure'],
      locations: ['Roof plant', 'Basement plant room', 'Level 1 - West zone', 'Level 1 - Central zone', 'Level 2 - Central zone', 'Level 2 - East zone', 'Level 3 - West zone', 'Level 3 - East zone'],
      autoCall: true, comfort: [20, 24],
      connector: { type: 'simulator' },
    },
    {
      id: 'B2', name: 'Rosebank Office Park — Block C', client: 'Rosebank Properties', area: 'Rosebank',
      manager: 'M. Khumalo', managerPhone: '+27 11 555 0201', managerEmail: '', ops: 'D. Smith', opsPhone: '+27 11 555 0202', opsEmail: '',
      equipment: ['VRF-01 · Outdoor unit', 'VRF-02 · Outdoor unit', 'Split unit · Server room', 'Extract fan EF-01', 'Other / not sure'],
      locations: ['Roof', 'Ground floor', 'Level 1', 'Level 2', 'Server room'], autoCall: true, comfort: [20, 24],
      connector: { type: 'none' },
    },
    {
      id: 'B3', name: 'Centurion Medical Suites', client: 'CMS Holdings', area: 'Centurion',
      manager: 'A. Govender', managerPhone: '+27 12 555 0301', managerEmail: '', ops: 'K. Mahlangu', opsPhone: '+27 12 555 0302', opsEmail: '',
      equipment: ['AHU-T1 · Theatre AHU', 'Chiller CH-A', 'Packaged unit PU-02', 'Other / not sure'],
      locations: ['Theatre 1', 'Theatre 2', 'Ward A', 'Roof plant'], autoCall: true, comfort: [20, 24],
      connector: { type: 'none' },
    },
  ];
  s.technicians = [
    { id: 'T1', name: 'J. Mokoena', skill: 'HVAC senior · Chillers & AHUs', phone: '+27 82 555 1001', email: '', status: 'available', vehicle: 'V1' },
    { id: 'T2', name: 'T. Naidoo', skill: 'HVAC technician · VRF & splits', phone: '+27 82 555 1002', email: '', status: 'available', vehicle: 'V2' },
    { id: 'T3', name: 'S. van Wyk', skill: 'Controls & BMS', phone: '+27 82 555 1003', email: '', status: 'available', vehicle: 'V3' },
    { id: 'T4', name: 'P. Dlamini', skill: 'Refrigeration technician', phone: '+27 82 555 1004', email: '', status: 'off', vehicle: 'V4' },
  ];
  const mk = (n, o, ago) => {
    const job = Object.assign({ id: 'TR-' + n, source: 'Client app', urgency: 'Medium', photos: [], findings: '', work: '', signature: null, signedBy: '', notifications: [], steps: {} }, o);
    ago.forEach((m, i) => { job.steps[STEPS[i].key] = minsAgo(m); });
    job.status = STEPS[ago.length - 1].key;
    s.jobs.push(job);
  };
  mk(1048, { building: 'B1', equipment: 'AHU-02 · Air handling unit', location: 'Level 2 - Central zone', fault: 'Office not cooling, warm air', urgency: 'High', tech: 'T1', findings: 'Supply fan belt worn and slipping. Low airflow to Level 2.', work: 'Fan belt replaced and tensioned. Airflow and set-point verified.', signedBy: 'L. Pillay' }, [1450, 1443, 1427, 1402, 1324, 1321]);
  mk(1049, { building: 'B2', equipment: 'Split unit · Server room', location: 'Server room', fault: 'Unit leaking water onto floor', urgency: 'High', tech: 'T2' }, [70, 62, 35]);
  mk(1050, { building: 'B3', equipment: 'Packaged unit PU-02', location: 'Ward A', fault: 'Noisy compressor', urgency: 'Medium', tech: 'T3' }, [40, 31]);
  mk(1051, { building: 'B1', equipment: 'FCU-L2-04 · Fan coil unit', location: 'Level 2 - East zone', fault: 'Thermostat display blank', urgency: 'Low' }, [12]);
  s.technicians[1].status = 'on job'; s.technicians[1].job = 'TR-1049';
  s.technicians[2].status = 'on job'; s.technicians[2].job = 'TR-1050';

  s.bms.B1 = Object.assign(demoBms(), { id: 'B1' });
  s.alarms = [
    { id: 'A1', building: 'B1', at: minsAgo(140), priority: 'Low', equip: 'Set-point adjusted', desc: 'Zone L3-W set-point 22.0 → 21.5 °C', status: 'Info', history: [] },
    { id: 'A2', building: 'B1', at: minsAgo(250), priority: 'Medium', equip: 'AHU-03', desc: 'Filter ΔP high', status: 'Cleared', history: [] },
  ];
  s.vehicles = [
    { id: 'V1', reg: 'JM 42 KL GP', model: 'Toyota Hilux 2.4 GD-6', driver: 'T1', status: 'parked', location: 'Trigon depot', odo: 84210, nextService: 90000, fuel: 64 },
    { id: 'V2', reg: 'TN 18 PX GP', model: 'Nissan NP200', driver: 'T2', status: 'on site', location: 'Rosebank', odo: 121480, nextService: 125000, fuel: 38 },
    { id: 'V3', reg: 'SV 77 BB GP', model: 'Toyota Hilux 2.4 GD-6', driver: 'T3', status: 'in transit', location: 'N1 → Centurion', odo: 55302, nextService: 60000, fuel: 81 },
    { id: 'V4', reg: 'PD 09 TR GP', model: 'Isuzu D-Max 250', driver: 'T4', status: 'parked', location: 'Trigon depot', odo: 143900, nextService: 140000, fuel: 22 },
  ];
  s.trips = [
    { id: 'D-301', what: 'Refrigerant R410A × 2 cylinders', from: 'Trigon depot', to: 'Rosebank Office Park — Block C', driver: 'T2', vehicle: 'V2', status: 'Delivered', at: minsAgo(55) },
    { id: 'D-302', what: 'Replacement V-belts (AHU set)', from: 'Supplier — Isando', to: 'Trigon depot', driver: 'T4', vehicle: 'V4', status: 'Scheduled', at: minsAgo(-90) },
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

module.exports = { seed, STEPS, DEFAULT_POLICY };
