/* Trigon Air — data layer.
 * All state lives in one object persisted to localStorage. Swap `Store.load/save`
 * for API calls to connect a real backend (service desk DB + BMS gateway). */
(function () {
  'use strict';

  const KEY = 'trigon.state.v1';

  const STEPS = [
    { key: 'logged', label: 'Call logged', icon: 'phone' },
    { key: 'assigned', label: 'Technician assigned', icon: 'users' },
    { key: 'enroute', label: 'On the way', icon: 'route' },
    { key: 'onsite', label: 'Arrived on site', icon: 'pin' },
    { key: 'completed', label: 'Work completed', icon: 'wrench' },
    { key: 'report', label: 'Report ready', icon: 'card' },
  ];

  const RECIPIENTS = [
    { role: 'Building Manager', channel: 'App + email' },
    { role: 'Operations Manager', channel: 'App + email' },
    { role: 'Trigon service desk', channel: 'Live board' },
    { role: 'Technician', channel: 'Mobile app' },
  ];

  function minsAgo(m) { return new Date(Date.now() - m * 60000).toISOString(); }

  function seed() {
    const buildings = [
      {
        id: 'B1', name: 'Demonstration Building', client: 'Demonstration Site', area: 'Midrand',
        manager: 'L. Pillay', managerPhone: '+27 11 555 0101', ops: 'R. Botha', opsPhone: '+27 11 555 0102',
        equipment: ['AHU-01 · Air handling unit', 'AHU-02 · Air handling unit', 'AHU-03 · Air handling unit',
          'CH-01 · Air-cooled chiller', 'CH-02 · Air-cooled chiller', 'CHWP-01 · Chilled water pump',
          'CT-01 · Cooling tower', 'FCU-L2-04 · Fan coil unit', 'Other / not sure'],
        locations: ['Roof plant', 'Basement plant room', 'Level 1 - West zone', 'Level 1 - Central zone',
          'Level 2 - Central zone', 'Level 2 - East zone', 'Level 3 - West zone', 'Level 3 - East zone'],
      },
      {
        id: 'B2', name: 'Rosebank Office Park — Block C', client: 'Rosebank Properties', area: 'Rosebank',
        manager: 'M. Khumalo', managerPhone: '+27 11 555 0201', ops: 'D. Smith', opsPhone: '+27 11 555 0202',
        equipment: ['VRF-01 · Outdoor unit', 'VRF-02 · Outdoor unit', 'Split unit · Server room', 'Extract fan EF-01', 'Other / not sure'],
        locations: ['Roof', 'Ground floor', 'Level 1', 'Level 2', 'Server room'],
      },
      {
        id: 'B3', name: 'Centurion Medical Suites', client: 'CMS Holdings', area: 'Centurion',
        manager: 'A. Govender', managerPhone: '+27 12 555 0301', ops: 'K. Mahlangu', opsPhone: '+27 12 555 0302',
        equipment: ['AHU-T1 · Theatre AHU', 'Chiller CH-A', 'Packaged unit PU-02', 'Other / not sure'],
        locations: ['Theatre 1', 'Theatre 2', 'Ward A', 'Roof plant'],
      },
    ];

    const technicians = [
      { id: 'T1', name: 'J. Mokoena', skill: 'HVAC senior · Chillers & AHUs', phone: '+27 82 555 1001', status: 'available', vehicle: 'V1' },
      { id: 'T2', name: 'T. Naidoo', skill: 'HVAC technician · VRF & splits', phone: '+27 82 555 1002', status: 'available', vehicle: 'V2' },
      { id: 'T3', name: 'S. van Wyk', skill: 'Controls & BMS', phone: '+27 82 555 1003', status: 'available', vehicle: 'V3' },
      { id: 'T4', name: 'P. Dlamini', skill: 'Refrigeration technician', phone: '+27 82 555 1004', status: 'off', vehicle: 'V4' },
    ];

    const jobs = [];
    function mkJob(n, o, stepsMinsAgo) {
      const job = Object.assign({
        id: 'TR-' + n, source: 'Client app', urgency: 'Medium', photos: [], findings: '', work: '',
        signature: null, signedBy: '', notifications: [], steps: {},
      }, o);
      stepsMinsAgo.forEach((m, i) => { job.steps[STEPS[i].key] = minsAgo(m); });
      job.status = STEPS[stepsMinsAgo.length - 1].key;
      // seed delivery log for every completed step
      STEPS.slice(0, stepsMinsAgo.length).forEach(s => {
        RECIPIENTS.forEach(r => job.notifications.push({ step: s.key, role: r.role, channel: r.channel, at: job.steps[s.key] }));
      });
      jobs.push(job);
      return job;
    }
    mkJob(1048, {
      building: 'B1', equipment: 'AHU-02 · Air handling unit', location: 'Level 2 - Central zone',
      fault: 'Office not cooling, warm air', urgency: 'High', tech: 'T1',
      findings: 'Supply fan belt worn and slipping. Low airflow to Level 2.',
      work: 'Fan belt replaced and tensioned. Airflow and set-point verified.', signedBy: 'L. Pillay',
    }, [1450, 1443, 1427, 1402, 1324, 1321]);
    mkJob(1049, { building: 'B2', equipment: 'Split unit · Server room', location: 'Server room', fault: 'Unit leaking water onto floor', urgency: 'High', tech: 'T2' }, [70, 62, 35]);
    mkJob(1050, { building: 'B3', equipment: 'Packaged unit PU-02', location: 'Ward A', fault: 'Noisy compressor', urgency: 'Medium', tech: 'T3' }, [40, 31]);
    mkJob(1051, { building: 'B1', equipment: 'FCU-L2-04 · Fan coil unit', location: 'Level 2 - East zone', fault: 'Thermostat display blank', urgency: 'Low' }, [12]);
    technicians[1].status = 'on job'; technicians[1].job = 'TR-1049';
    technicians[2].status = 'on job'; technicians[2].job = 'TR-1050';

    const zones = [];
    [1, 2, 3].forEach(f => ['W', 'C', 'E'].forEach(p => {
      const t = 21.6 + Math.random() * 1.2;
      zones.push({ id: 'L' + f + '-' + p, floor: f, pos: p, temp: +t.toFixed(1), target: +t.toFixed(1), setpoint: 22.0, online: true });
    }));

    const ahus = [1, 2, 3, 4, 5, 6].map(n => ({
      id: 'AHU-0' + n, name: ['East Wing', 'Central', 'West Wing', 'Level 3', 'Lobby', 'Kitchen'][n - 1],
      status: n === 5 ? 'off' : 'running', supplyHz: 48, returnHz: 42, supplyTemp: 13.4, returnTemp: 22.9,
      mixedTemp: 24.7, outsideTemp: 28.3, chwValve: 64, damper: 51, filterDp: 118, mode: 'Auto',
    }));

    const chillers = [
      { id: 'CH-01', name: 'Air-cooled chiller', status: 'running', load: 78, chws: 6.4, chwr: 12.1, comps: ['run', 'run'] },
      { id: 'CH-02', name: 'Air-cooled chiller', status: 'standby', load: 0, chws: null, chwr: null, comps: ['stby', 'stby'] },
    ];
    const pumps = [
      { id: 'CHWP-01', type: 'Chilled water pump', status: 'running', hz: 48 },
      { id: 'CHWP-02', type: 'Chilled water pump', status: 'standby', hz: 0 },
      { id: 'CHWP-03', type: 'Chilled water pump', status: 'standby', hz: 0 },
      { id: 'CWP-01', type: 'Condenser water pump', status: 'running', hz: 46 },
      { id: 'CWP-02', type: 'Condenser water pump', status: 'running', hz: 45 },
      { id: 'BS-01', type: 'Domestic booster set', status: 'running', hz: 38 },
    ];
    const towers = [
      { id: 'CT-01', status: 'running', fan: 72, leaving: 27.4, entering: 31.8 },
      { id: 'CT-02', status: 'running', fan: 64, leaving: 27.6, entering: 31.5 },
    ];
    const fans = [
      { id: 'EF-01', name: 'Toilet extract L1', status: 'running' },
      { id: 'EF-02', name: 'Toilet extract L2', status: 'running' },
      { id: 'EF-03', name: 'Toilet extract L3', status: 'running' },
      { id: 'KEF-01', name: 'Kitchen extract', status: 'running' },
      { id: 'BEF-01', name: 'Basement car park extract', status: 'standby' },
      { id: 'SPF-01', name: 'Stair pressurisation', status: 'standby' },
    ];
    const fcus = [];
    zones.forEach((z, i) => {
      fcus.push({ id: 'FCU-L' + z.floor + '-0' + (i % 3 * 2 + 1), zone: z.id, status: 'running', valve: 40 + Math.round(Math.random() * 30) });
      fcus.push({ id: 'FCU-L' + z.floor + '-0' + (i % 3 * 2 + 2), zone: z.id, status: 'running', valve: 40 + Math.round(Math.random() * 30) });
    });

    const alarms = [
      { id: 'A1', at: minsAgo(140), priority: 'Low', equip: 'Set-point adjusted', desc: 'Zone L3-W set-point 22.0 → 21.5 °C', status: 'Info', history: [] },
      { id: 'A2', at: minsAgo(250), priority: 'Medium', equip: 'AHU-03', desc: 'Filter ΔP high', status: 'Cleared', history: [] },
      { id: 'A3', at: minsAgo(400), priority: 'Low', equip: 'CT-02', desc: 'Fan run-hours service due', status: 'Cleared', history: [] },
    ];

    const vehicles = [
      { id: 'V1', reg: 'JM 42 KL GP', model: 'Toyota Hilux 2.4 GD-6', driver: 'T1', status: 'on site', location: 'Midrand', odo: 84210, nextService: 90000, fuel: 64 },
      { id: 'V2', reg: 'TN 18 PX GP', model: 'Nissan NP200', driver: 'T2', status: 'on site', location: 'Rosebank', odo: 121480, nextService: 125000, fuel: 38 },
      { id: 'V3', reg: 'SV 77 BB GP', model: 'Toyota Hilux 2.4 GD-6', driver: 'T3', status: 'in transit', location: 'N1 → Centurion', odo: 55302, nextService: 60000, fuel: 81 },
      { id: 'V4', reg: 'PD 09 TR GP', model: 'Isuzu D-Max 250', driver: 'T4', status: 'parked', location: 'Trigon depot', odo: 143900, nextService: 140000, fuel: 22 },
    ];

    const trips = [
      { id: 'D-301', what: 'Refrigerant R410A × 2 cylinders', from: 'Trigon depot', to: 'Rosebank Office Park — Block C', driver: 'T2', vehicle: 'V2', status: 'Delivered', at: minsAgo(55) },
      { id: 'D-302', what: 'Replacement V-belts (AHU set)', from: 'Supplier — Isando', to: 'Trigon depot', driver: 'T4', vehicle: 'V4', status: 'Scheduled', at: minsAgo(-90) },
      { id: 'D-303', what: 'Compressor contactor kit', from: 'Trigon depot', to: 'Centurion Medical Suites', driver: 'T3', vehicle: 'V3', status: 'In transit', at: minsAgo(10) },
    ];

    const assessments = [
      { id: 'AS-021', building: 'B1', date: minsAgo(60 * 24 * 6), by: 'T3', type: 'Annual plant condition', score: 82,
        items: [{ name: 'Chillers', rating: 4 }, { name: 'AHUs', rating: 3 }, { name: 'Pumps', rating: 4 }, { name: 'Cooling towers', rating: 4 }, { name: 'Controls / BMS', rating: 5 }],
        notes: 'AHU-02 belt wear noted. Recommend 6-monthly belt replacement.' },
      { id: 'AS-022', building: 'B3', date: minsAgo(60 * 24 * 2), by: 'T1', type: 'Theatre air quality', score: 91,
        items: [{ name: 'HEPA filters', rating: 5 }, { name: 'Pressure cascade', rating: 4 }, { name: 'Humidity control', rating: 5 }],
        notes: 'All theatres within spec.' },
    ];

    const documents = [
      { name: 'Service Level Agreement — Demonstration Site', type: 'PDF', size: '412 KB', date: '2026-01-14' },
      { name: 'Planned maintenance schedule 2026', type: 'XLSX', size: '88 KB', date: '2026-02-02' },
      { name: 'As-built HVAC drawings — Rev C', type: 'PDF', size: '6.1 MB', date: '2025-09-30' },
      { name: 'BMS point schedule', type: 'XLSX', size: '120 KB', date: '2025-10-11' },
      { name: 'Refrigerant log book', type: 'PDF', size: '230 KB', date: '2026-10-01' },
    ];

    return {
      version: 1, seq: 1052, buildings, technicians, jobs, feed: [],
      bms: { zones, ahus, chillers, pumps, towers, fans, fcus, humidity: 54, co2: 615, outside: 28.3, trend: [], fault: null },
      alarms, vehicles, trips, assessments, documents,
    };
  }

  const Store = {
    STEPS, RECIPIENTS,
    state: null,
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) { const s = JSON.parse(raw); if (s && s.version === 1) { this.state = s; return s; } }
      } catch (e) { /* storage unavailable */ }
      this.state = seed();
      return this.state;
    },
    save() {
      clearTimeout(this._t);
      this._t = setTimeout(() => {
        try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* quota / private mode */ }
      }, 250);
    },
    reset() {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      this.state = seed();
      return this.state;
    },
  };

  window.Store = Store;
})();
