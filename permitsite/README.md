# permitsite v3 — Abnormal Load Permit Portal

Django-based portal for South African provincial abnormal load permits.
**v3 rewrites the fee engine to exactly match the Excel `Permit_program_edit.xlsx` tariff tables.**

---

## What changed from v2

### calc.py — Excel-aligned fee engine

| | v2 (old) | v3 (this release) |
|---|---|---|
| **Fee model** | Flat R/tonne over GCM (no distance) | **c/km × distance** — matches Excel exactly |
| **GTN mass rate** | R120/tonne placeholder | **34.80 c/km** |
| **LIMP mass rate** | R140/tonne placeholder | **50.54 c/km** |
| **NWEST mass rate** | R130/tonne placeholder | **34.80 c/km** |
| **ECAPE mass rate** | R135/tonne placeholder | **34.80 c/km** |
| **OTHER mass rate** | R125/tonne placeholder | **34.80 c/km** |
| **Width surcharge** | Not implemented | **0.07 c/km (GTN/NWEST/ECAPE/OTHER), 0.10 c/km (LIMP)** |
| **Basic fee GTN** | R1,450 placeholder | **R300** |
| **Basic fee LIMP** | R2,000 placeholder | **R415** |
| **Escort / RUF** | Not implemented | **Full Road Usage Factor calculation** |
| **Height warnings** | Not implemented | **4-band height check** |
| **Distance input** | Not required | **Required per province** |
| **Period permits** | Not implemented | `calc.period_permit_fee()` added |

### models.py — Province extended

`Province` now stores:
- `mass_cpk` — mass fee in cents per km
- `length_cpk` — over-length fee in c/km per metre over 22 m
- `width_cpk` — over-width fee in c/km per metre over 2.5 m
- `basic_fee` — fixed permit fee in Rands
- `fee_minimum` — minimum fee floor
- `engineering_fee` — PPRO/agent fee

`PermitLine` now stores `distance_km` (km driven in that province).

### views.py

- `application_create` reads `dist_<CODE>` POST fields per province
- New AJAX endpoint `fee_preview` returns live fee estimates + escort info
- `application_detail` shows escort requirement + RUF

### templates/permits/form.html

- Province table with per-row distance input
- Live AJAX fee preview (updates as user types)
- Escort requirement box (RUF + height band)
- Auto-detect provinces button

---

## Fee formula (matches Excel)

```
fee = (mass_cpk × km + width_cpk × over_width_m × km) / 100 + basic_fee
fee = max(fee, fee_minimum)
```

**Escort (Road Usage Factor):**
```
RUF = (width_mm / 1617.57) × (length_m / 7.5)
RUF < 0.33         → No escort
0.33 ≤ RUF < 0.54  → Flags & Abnormal Board only
0.54 ≤ RUF < 0.94  → 1 Own Escort
0.95 ≤ RUF < 2.73  → 2 Own Escorts
RUF ≥ 2.73         → 2 Traffic Officer Escorts
```

---

## Quick start

```bash
pip install django reportlab
cd permitsite
python manage.py migrate
python manage.py seed        # loads provinces + vehicle configs + admin user
python manage.py runserver
```

Login: `admin` / `admin12345`

---

## Province tariff reference (from Excel FEES sheet)

| Province | Mass (c/km) | Width (c/km) | Basic fee | Min fee | Eng. fee |
|---|---|---|---|---|---|
| Gauteng (GTN) | 34.80 | 0.07 | R300 | R300 | R810 |
| Limpopo (LIMP) | 50.54 | 0.10 | R415 | R415 | R1 085 |
| North West (NWEST) | 34.80 | 0.07 | R300 | R300 | R810 |
| Eastern Cape (ECAPE) | 34.80 | 0.07 | R300 | R300 | R810 |
| Other (OTHER) | 34.80 | 0.07 | R415 | R415 | R1 085 |

---

## What the Excel has that is not yet in the web app

- Namibia permit support
- Stability / ESWM (Equivalent Single Wheel Mass) axle calculations
- Agent & courier fee invoicing
- Print-ready permit certificate with official stamp layout
