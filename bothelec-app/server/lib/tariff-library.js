'use strict';
/* Municipal tariff library: published tariffs that can be copied into Settings → Tariffs and then edited.
 *
 * All amounts EXCLUDE VAT (the billing run adds VAT). Rates are in rand per unit (c/kWh ÷ 100).
 * Each entry records where the figures come from. Check the municipality's final tariff booklet before billing
 * and update the entry every July when new tariffs take effect.
 *
 * Tariff shape (also used for tariffs saved in Settings):
 *   blocks        [{ upTo, rate }]  inclining blocks per month; last block has upTo null
 *   winterBlocks  same, used in winterMonths (high-demand season) when set
 *   winterMonths  [6, 7, 8] = June–August
 *   fixed         [{ desc, amount }]  rand per month per meter
 *   levy          { desc, rate, freeUnits }  rand per unit on consumption above freeUnits
 *   surchargePct  % on the energy / water charges and fixed charges (not on the levy)
 *   sewer         { blocks: [{ upTo, rate, pct }], fixed: [{ desc, amount }] }  water only: charged per kL of water,
 *                 pct = share of the water in that block counted as sewage (100 = all of it)
 */

const JHB_EL = { title: 'City Power tariffs 2026/27, Council item 76 Annexure B; matches the final approved 2026/27 booklet on every line both publish', url: 'https://propertywheel.co.za/wp-content/uploads/ITEM-76-.pdf' };
const JHB_FINAL = { title: 'City of Johannesburg approved tariffs 2026/27 (final booklet)', url: 'https://joburg.org.za/documents_/Documents/Approved-Tarrifs-for-2026-27/Combined-tariffs-2026-2027-final.pdf' };
const JHB_WATER = { title: 'Johannesburg Water approved tariffs 2026/27', url: 'https://joburg.org.za/documents_/Documents/Approved-Tarrifs-for-2026-27/Water-Tariffs-2026-2027-final.pdf' };
const JHB_SEWER = { title: 'Johannesburg Water tariffs 2026/27, Council item 77', url: 'https://propertywheel.co.za/wp-content/uploads/ITEM-77-.pdf' };
const TSH = { title: 'City of Tshwane tariff increase 2026/27 (published by Martinique, sectional-title administrators)', url: 'https://martinique.co.za/wp-content/uploads/2026/07/260701-City-of-Tshwane-Tariffs.pdf' };
const GMM = { title: 'Govan Mbeki Local Municipality approved electricity tariff book 2025/2026 (uploaded)', url: '' };
const GMM_FIXED = (main, label = 'Fixed charge') => [...(main ? [{ desc: label, amount: main }] : []), { desc: 'Retail / customer-related (availability) charge', amount: 193.95 }, { desc: 'Distribution network capacity charge', amount: 123.52 }];
const GMM_NOTES = ['2025/26 tariff (1 July 2025 – 30 June 2026): use for months up to June 2026, and add the 2026/27 tariff for later months.', 'Low-demand season September–May, high-demand season June–August.', 'The R/POD charges are taken as per month per point of delivery.'];
const c = v => Math.round(v * 100) / 10000; // c/kWh → R/kWh, keeping 4 decimals
const bl = (pairs, conv = x => x) => pairs.map(([upTo, rate]) => ({ upTo, rate: conv(rate) }));
const JHB_RES_BLOCKS = s => bl([[500, s[0]], [1000, s[1]], [2000, s[2]], [3000, s[3]], [null, s[4]]], c);
const JHB_NETWORK = { desc: 'Network surcharge (6c/kWh)', rate: 0.06, freeUnits: 0 };
const JHB_NETWORK_RES = { desc: 'Network surcharge (6c/kWh above 500 kWh)', rate: 0.06, freeUnits: 500 };

const LIBRARY = [
  /* ---------- City of Johannesburg: electricity (City Power) ---------- */
  {
    key: 'jhb-el-business', region: 'Gauteng', municipality: 'City of Johannesburg (City Power)', category: 'Business', type: 'electricity',
    name: 'Joburg City Power · Business conventional & prepaid (≤100 kVA) 2026/27',
    effective: '2026-07-01', until: '2027-06-30', source: JHB_EL,
    blocks: JHB_RES_BLOCKS([380.52, 417.67, 437.99, 453.96, 468.69]),
    winterBlocks: JHB_RES_BLOCKS([398.37, 433.70, 453.06, 468.71, 482.28]), winterMonths: [6, 7, 8],
    fixed: [{ desc: 'Service charge', amount: 890.45 }, { desc: 'Network charge', amount: 853.72 }],
    levy: JHB_NETWORK, surchargePct: 2,
    notes: ['Summer September–May, winter June–August.', 'Fixed charges are per council account per month: if tenants are sub-metered off one council account, reduce or remove them on each tenant tariff, or bill them once to the landlord.', 'The 2% business surcharge is applied to the energy and fixed charges.'],
  },
  {
    key: 'jhb-el-dom-1p60', region: 'Gauteng', municipality: 'City of Johannesburg (City Power)', category: 'Residential', type: 'electricity',
    name: 'Joburg City Power · Domestic single-phase 60 A conventional 2026/27',
    effective: '2026-07-01', until: '2027-06-30', source: JHB_EL,
    blocks: JHB_RES_BLOCKS([288.27, 330.82, 355.23, 374.79, 393.19]),
    fixed: [{ desc: 'Service charge', amount: 235.79 }, { desc: 'Capacity charge (60 A)', amount: 694.58 }],
    levy: JHB_NETWORK_RES, surchargePct: 0,
    notes: ['No seasonal difference on this tariff.', 'The network surcharge applies only above 500 kWh a month for households.'],
  },
  {
    key: 'jhb-el-dom-3p80', region: 'Gauteng', municipality: 'City of Johannesburg (City Power)', category: 'Residential', type: 'electricity',
    name: 'Joburg City Power · Domestic three-phase 80 A conventional 2026/27',
    effective: '2026-07-01', until: '2027-06-30', source: JHB_EL,
    blocks: JHB_RES_BLOCKS([280.76, 322.21, 345.98, 365.03, 382.94]),
    fixed: [{ desc: 'Service charge', amount: 304.12 }, { desc: 'Capacity charge (80 A)', amount: 1227.18 }],
    levy: JHB_NETWORK_RES, surchargePct: 0, notes: ['The network surcharge applies only above 500 kWh a month for households.'],
  },
  {
    key: 'jhb-el-dom-prepaid', region: 'Gauteng', municipality: 'City of Johannesburg (City Power)', category: 'Residential', type: 'electricity',
    name: 'Joburg City Power · Domestic prepaid (low) 2026/27',
    effective: '2026-07-01', until: '2027-06-30', source: JHB_FINAL,
    blocks: bl([[350, 272.37], [500, 333.18], [null, 413.06]], c), fixed: [],
    levy: JHB_NETWORK_RES, surchargePct: 0, notes: ['No fixed charges on the low prepaid tariff.'],
  },
  {
    key: 'jhb-el-dom-prepaid-high', region: 'Gauteng', municipality: 'City of Johannesburg (City Power)', category: 'Residential', type: 'electricity',
    name: 'Joburg City Power · Domestic prepaid (high) 2026/27',
    effective: '2026-07-01', until: '2027-06-30', source: JHB_FINAL,
    blocks: bl([[350, 290.46], [500, 333.18], [null, 379.64]], c), fixed: [{ desc: 'Service charge', amount: 70 }],
    levy: JHB_NETWORK_RES, surchargePct: 0, notes: ['For prepaid customers using more than about 500 kWh a month on average.'],
  },
  /* ---------- City of Johannesburg: water and sewer (Johannesburg Water) ---------- */
  {
    key: 'jhb-water-business', region: 'Gauteng', municipality: 'City of Johannesburg (Johannesburg Water)', category: 'Business', type: 'water',
    name: 'Joburg Water · Commercial / industrial water & sewer 2026/27',
    effective: '2026-07-01', until: '2027-06-30', source: JHB_WATER,
    blocks: bl([[200, 73.72], [null, 77.77]]),
    fixed: [{ desc: 'Water demand management levy', amount: 413.84 }],
    surchargePct: 2,
    sewer: { blocks: [{ upTo: null, rate: 58.66, pct: 100 }], fixed: [] },
    notes: ['Sewer: R58.66 per kL of metered water (Council item 77, non-residential sewer 3.2).', 'A 2% surcharge applies to non-residential water and sewer.', 'The demand management levy is per unit per month.'],
  },
  {
    key: 'jhb-water-residential', region: 'Gauteng', municipality: 'City of Johannesburg (Johannesburg Water)', category: 'Residential', type: 'water',
    name: 'Joburg Water · Domestic conventional water & sewer (per kL) 2026/27',
    effective: '2026-07-01', until: '2027-06-30', source: JHB_WATER,
    blocks: bl([[6, 0], [10, 33.57], [15, 35.04], [20, 49.13], [30, 67.91], [40, 74.26], [50, 93.69], [null, 100.40]]),
    fixed: [{ desc: 'Water demand management levy', amount: 107.74 }], surchargePct: 0,
    sewer: { blocks: [{ upTo: 6, rate: 0, pct: 100 }, { upTo: 10, rate: 16.45, pct: 100 }, { upTo: 15, rate: 20.82, pct: 100 }, { upTo: 20, rate: 23.32, pct: 100 }, { upTo: null, rate: 34.62, pct: 100 }], fixed: [] },
    notes: ['First 6 kL free.', 'Joburg bills household sewer on a conventional meter by erf size (R397.85–R1 688.12 per erf per month); for sub-metered flats this tariff uses the per-kL residential scale instead (Council item 77, 2.4.1).'],
  },
  /* ---------- City of Tshwane: residential ---------- */
  {
    key: 'tsh-el-residential', region: 'Gauteng', municipality: 'City of Tshwane', category: 'Residential', type: 'electricity',
    name: 'Tshwane · Residential electricity (blocks) 2026/27',
    effective: '2026-07-01', until: '2027-06-30', source: TSH,
    blocks: bl([[100, 3.2412], [400, 3.7932], [650, 4.1327], [null, 4.4551]]), fixed: [], surchargePct: 0,
    notes: ['Energy blocks only: add the fixed / capacity charge for the connection size from the municipal account.'],
  },
  {
    key: 'tsh-water-residential', region: 'Gauteng', municipality: 'City of Tshwane', category: 'Residential', type: 'water',
    name: 'Tshwane · Residential water & sanitation 2026/27',
    effective: '2026-07-01', until: '2027-06-30', source: TSH,
    blocks: bl([[9, 0], [18, 36.01], [30, 48.73], [42, 56.13], [60, 60.02], [null, 64.26]]),
    fixed: [{ desc: 'Water network access charge', amount: 203.70 }], surchargePct: 0,
    sewer: { blocks: [{ upTo: 9, rate: 0, pct: 100 }, { upTo: 12, rate: 23.49, pct: 90 }, { upTo: 18, rate: 23.49, pct: 75 }, { upTo: 24, rate: 23.49, pct: 60 }, { upTo: 30, rate: 23.49, pct: 52 }, { upTo: 42, rate: 23.49, pct: 10 }, { upTo: null, rate: 23.49, pct: 1 }], fixed: [{ desc: 'Sanitation network access charge', amount: 108 }] },
    notes: ['Sanitation is charged on a falling share of the water used: 90% of 10–12 kL down to 1% above 42 kL.'],
  },
];

LIBRARY.push(
  /* ---------- Mpumalanga: Govan Mbeki Local Municipality (Secunda, eMbalenhle, Bethal) ---------- */
  {
    key: 'gmm-el-domestic-2526', region: 'Mpumalanga', municipality: 'Govan Mbeki Local Municipality', category: 'Residential', type: 'electricity',
    name: 'Govan Mbeki · Domestic conventional & prepaid 2025/26', effective: '2025-07-01', until: '2026-06-30', source: GMM,
    blocks: bl([[50, 192.80], [350, 247.89], [600, 336.31], [null, 403.65]], c), fixed: GMM_FIXED(0), surchargePct: 0,
    notes: [GMM_NOTES[0], GMM_NOTES[2], 'Inclining blocks: 0–50, 51–350, 351–600, above 600 kWh.'],
  },
  {
    key: 'gmm-el-commercial-1p-2526', region: 'Mpumalanga', municipality: 'Govan Mbeki Local Municipality', category: 'Business', type: 'electricity',
    name: 'Govan Mbeki · Commercial single-phase (conventional & prepaid) 2025/26', effective: '2025-07-01', until: '2026-06-30', source: GMM,
    blocks: bl([[null, 321.52]], c), winterBlocks: bl([[null, 416.89]], c), winterMonths: [6, 7, 8], fixed: GMM_FIXED(1375.45), surchargePct: 0, notes: GMM_NOTES,
  },
  {
    key: 'gmm-el-commercial-3p-2526', region: 'Mpumalanga', municipality: 'Govan Mbeki Local Municipality', category: 'Business', type: 'electricity',
    name: 'Govan Mbeki · Commercial 2- & 3-phase (conventional & prepaid) 2025/26', effective: '2025-07-01', until: '2026-06-30', source: GMM,
    blocks: bl([[null, 315.50]], c), winterBlocks: bl([[null, 416.89]], c), winterMonths: [6, 7, 8], fixed: GMM_FIXED(2126.41), surchargePct: 0, notes: GMM_NOTES,
  },
  {
    key: 'gmm-el-institution-2526', region: 'Mpumalanga', municipality: 'Govan Mbeki Local Municipality', category: 'Institution', type: 'electricity',
    name: 'Govan Mbeki · Institution single-phase (worship, NGOs, welfare, sports clubs) 2025/26', effective: '2025-07-01', until: '2026-06-30', source: GMM,
    blocks: bl([[null, 321.52]], c), winterBlocks: bl([[null, 416.89]], c), winterMonths: [6, 7, 8], fixed: GMM_FIXED(376.84), surchargePct: 0, notes: GMM_NOTES,
  },
);
LIBRARY.forEach(t => { t.region = t.region || 'Gauteng'; });

/* Not yet in the library, and why. Shown on the Tariffs page. */
const PENDING = [
  { municipality: 'City of Tshwane', what: 'Business electricity, water and sanitation', why: 'The city has not published a consolidated 2026/27 business schedule we could verify. Upload the tariff schedule to add it.' },
  { municipality: 'City of Ekurhuleni', what: 'All tariffs (Schedules 2–4)', why: 'Published in Annexure F of the 2026/27 budget; the city website could not be read from here. Upload the schedule to add it.' },
  { municipality: 'Govan Mbeki Local Municipality', what: '2026/27 tariffs; water and sanitation', why: 'Only the 2025/26 electricity book has been uploaded. Upload the 2026/27 tariff book (and the water / sanitation tariffs) to add them.' },
  { municipality: 'Govan Mbeki Local Municipality', what: 'Industrial & commercial time-of-use (LV / HV), domestic bulk supply, SSEG', why: 'These need peak / standard / off-peak and kVA demand readings, which the meters do not record yet.' },
  { municipality: 'City of Johannesburg', what: 'Large power user (demand / time-of-use)', why: 'Needs kVA demand and time-of-use readings, which the meters do not record yet.' },
];

module.exports = { LIBRARY, PENDING };
