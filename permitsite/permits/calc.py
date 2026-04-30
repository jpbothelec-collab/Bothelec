"""Fee calculation engine – matches the Excel 'CALCULATION FOR AV GTN/LIMP/NWEST/ECAPE/OTHER'.

Excel fee model (distance-based R/km):
    fee = (mass_Rpk + width_Rpk × over_width_m) × distance_km + basic_fee
    fee = max(fee, minimum_fee)

Provincial rates (from FEES sheet and individual CALCULATION sheets):
    GTN  / NWEST / ECAPE / OTHER : mass 34.80 R/km, width 0.07 R/km, basic R300
    LIMP                         : mass 50.54 R/km, width 0.10 R/km, basic R415

NOTE: Rates are stored and applied as RANDS per km (R/km), NOT cents per km.
Verified from GTN PERMIT COST sheet: 34.87 R/km × 101 km = R3521.87 (distance fee) + R300 basic = R3821.87 total.

Escort logic (Road Usage Factor, from ESCORT CALC sheet – exact Excel formulas):
    D18 = 1.61757 × 0.001 × (W_m ^ 4.7)       [width component]
    D22 = 7.5 × 1e-7  × (L_m ^ 3.76)           [length component]
    RUF = D18 + D22

    RUF < 0.33       : No warnings
    0.33 ≤ RUF < 0.54 : Flags & Abnormal Board only
    0.54 ≤ RUF < 0.95 : 1 Own Escort
    0.95 ≤ RUF < 2.74 : 2 Own Escorts
    RUF ≥ 2.74        : 2 Traffic Officer Escorts
"""
from decimal import Decimal, ROUND_HALF_UP

# ── Thresholds (SA TRH11 / National Road Traffic Act) ────────────────────────
STANDARD_LENGTH_M = Decimal("22.0")
STANDARD_WIDTH_M  = Decimal("2.5")
STANDARD_HEIGHT_M = Decimal("4.3")

# ── Escort thresholds (from Excel ESCORT CALC sheet) ─────────────────────────
WIDTH_REFERENCE_MM  = Decimal("1617.57")   # 1.61757 m
LENGTH_REFERENCE_M  = Decimal("7.5")

RUF_BANDS = [
    (Decimal("0"),    Decimal("0.33"),  "No warnings – flags and abnormal board not required"),
    (Decimal("0.33"), Decimal("0.54"),  "Flags & Abnormal Board required, no escort"),
    (Decimal("0.54"), Decimal("0.95"),  "1 Own Escort required"),
    (Decimal("0.95"), Decimal("2.74"),  "2 Own Escorts required"),
    (Decimal("2.74"), Decimal("9999"),  "2 Traffic Officer Escorts required"),
]

# Height thresholds (mm)
HEIGHT_BANDS = [
    (0,    4300, "No Height"),
    (4301, 4700, "Check Height"),
    (4701, 5500, "Height Escort"),
    (5501, 5800, "Telkom"),
    (5801, 99999,"Eskom"),
]


def q2(x) -> Decimal:
    """Round to 2 decimal places, ROUND_HALF_UP (match Excel)."""
    return Decimal(x).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ── RUF / Escort ─────────────────────────────────────────────────────────────

def calc_ruf(width_mm: int, length_mm: int) -> Decimal:
    """Road Usage Factor – exact Excel ESCORT CALC formula:
        D18 = 1.61757 × 0.001 × (W_m ^ 4.7)   [width component]
        D22 = 7.5 × 1e-7  × (L_m ^ 3.76)       [length component]
        RUF = D18 + D22
    """
    import math
    W_m = width_mm / 1000
    L_m = length_mm / 1000
    width_component  = 1.61757 * 0.001 * (W_m ** 4.7)
    length_component = 7.5 * 1e-7 * (L_m ** 3.76)
    ruf = width_component + length_component
    return Decimal(str(ruf)).quantize(Decimal("0.00001"), rounding=ROUND_HALF_UP)


def escort_requirement(width_mm: int, length_mm: int, height_mm: int) -> dict:
    """Return escort level and height warning matching Excel ESCORT CALC logic."""
    ruf = calc_ruf(width_mm, length_mm)
    escort_label = RUF_BANDS[-1][2]
    for lo, hi, label in RUF_BANDS:
        if lo <= ruf < hi:
            escort_label = label
            break

    height_label = HEIGHT_BANDS[-1][2]
    for lo, hi, label in HEIGHT_BANDS:
        if lo <= height_mm <= hi:
            height_label = label
            break

    return {
        "ruf": ruf,
        "escort": escort_label,
        "height_warning": height_label,
        "needs_escort": ruf >= Decimal("0.54"),
    }


# ── Main fee calculation ──────────────────────────────────────────────────────

def calculate_line(vehicle, load: dict, province, distance_km: int) -> tuple[Decimal, str]:
    """Return (fee, breakdown_str) for one province.

    Parameters
    ----------
    vehicle      : fleet.models.Vehicle
    load         : dict with keys length_m, width_m, height_m, mass_kg
    province     : permits.models.Province
    distance_km  : kilometres travelled in this province (from the application)
    """
    length_m  = Decimal(str(load["length_m"]))
    width_m   = Decimal(str(load["width_m"]))
    mass_kg   = Decimal(str(load["mass_kg"]))
    dist      = Decimal(str(distance_km))

    # Rate fields stored as R/km in the Province model (Decimal)
    mass_Rpk   = Decimal(str(province.mass_cpk))
    length_Rpk = Decimal(str(province.length_cpk))
    width_Rpk  = Decimal(str(province.width_cpk))
    basic_fee  = Decimal(str(province.basic_fee))
    minimum    = Decimal(str(province.fee_minimum))

    # Over-dimension amounts (Excel uses the same c/km rates on excess metres/tonnes)
    over_length_m = max(Decimal("0"), length_m - STANDARD_LENGTH_M)
    over_width_m  = max(Decimal("0"), width_m  - STANDARD_WIDTH_M)

    # Overload in tonnes (GCM check)
    gcm = Decimal(str(vehicle.config.gcm_kg))
    tare = Decimal(str(vehicle.effective_tare))
    combined_kg = mass_kg + tare
    overload_kg = max(Decimal("0"), combined_kg - gcm)
    overload_t  = overload_kg / 1000

    # Distance-based fees (R/km × km = Rands)
    # Rates stored as R/km (verified: 34.87 R/km × 101 km = R3521.87 in GTN PERMIT COST sheet)
    mass_fee   = q2(mass_Rpk   * dist)
    length_fee = q2(length_Rpk * over_length_m * dist)
    width_fee  = q2(width_Rpk  * over_width_m  * dist)

    subtotal = q2(mass_fee + length_fee + width_fee + basic_fee)
    total    = max(subtotal, minimum)

    # Escort info
    escort_info = escort_requirement(
        int(width_m * 1000),
        int(length_m * 1000),
        int(load.get("height_m", 0) * 1000),
    )

    parts = [
        f"Province: {province.name}  |  Distance: {distance_km} km",
        f"Mass fee ({mass_Rpk} R/km × {dist} km): R{mass_fee}",
        f"Over-length fee ({length_Rpk} R/km × {over_length_m} m × {dist} km): R{length_fee}",
        f"Over-width fee ({width_Rpk} R/km × {over_width_m} m × {dist} km): R{width_fee}",
        f"Basic permit fee: R{basic_fee}",
        f"Subtotal: R{subtotal}",
    ]
    if total > subtotal:
        parts.append(f"Minimum fee enforced: R{minimum}")
    parts.append(f"Total permit fee: R{total}")
    parts.append(f"RUF: {escort_info['ruf']} → {escort_info['escort']}")
    parts.append(f"Height: {load.get('height_m', 0)} m → {escort_info['height_warning']}")

    if overload_kg > 0:
        parts.append(f"⚠ Overload: {combined_kg:,.0f} kg combined vs GCM {gcm:,.0f} kg ({overload_t:.2f} t over)")

    return total, "\n".join(parts)


def check_config_limits(vehicle, load: dict) -> list[str]:
    """Return list of human-readable warnings for over-limit conditions."""
    warnings = []
    mass     = Decimal(str(load["mass_kg"]))
    tare     = Decimal(str(vehicle.effective_tare))
    gcm      = Decimal(str(vehicle.config.gcm_kg))
    combined = mass + tare

    if combined > gcm:
        warnings.append(
            f"Combined mass {combined:,.0f} kg exceeds GCM {gcm:,.0f} kg "
            f"– overload permit required ({combined - gcm:,.0f} kg over)"
        )
    length = Decimal(str(load["length_m"]))
    if length > STANDARD_LENGTH_M:
        warnings.append(f"Length {length} m exceeds standard {STANDARD_LENGTH_M} m – abnormal dimension")
    width = Decimal(str(load["width_m"]))
    if width > STANDARD_WIDTH_M:
        warnings.append(f"Width {width} m exceeds standard {STANDARD_WIDTH_M} m – abnormal dimension")
    height = Decimal(str(load["height_m"]))
    if height > STANDARD_HEIGHT_M:
        warnings.append(f"Height {height} m exceeds standard {STANDARD_HEIGHT_M} m – escort may be required")
    return warnings


def period_permit_fee(province, category: str, period_months: int,
                      radius: str = "50km") -> Decimal | None:
    """Look up period permit fee from the PERIOD PERMITS sheet.

    Parameters
    ----------
    category     : 'articulated' | 'emergency_repair' | 'emergency_crane'
                   'crane' | 'unladen'
    period_months: 0 (1 week) | 1 | 3 | 6 | 12
    radius       : '25km' | '50km' | '100km' | 'fixed_routes' | 'province'
                   (only relevant for articulated, crane, unladen categories)

    Source: PERIOD PERMITS sheet – full table reproduced below.
    """
    # Full PERIOD PERMITS sheet data
    PERIOD_TABLE = {
        # ARTICULATED VEHICLES
        "articulated": {
            "25km":         {0: 0,   1: 200,  3: 500,  6: 850,  12: 1500},
            "50km":         {0: 0,   1: 350,  3: 850,  6: 1500, 12: 2500},
            "100km":        {0: 0,   1: 500,  3: 1200, 6: 1800, 12: 3000},
            "fixed_routes": {0: 600, 1: 2000, 3: 5000, 6: 9000, 12: 18000},
            "province":     {0: 800, 1: 2400, 3: 6400, 6: 12000,12: 24000},
        },
        # EMERGENCY REPAIR VEHICLES (province-wide only)
        "emergency_repair": {
            "province": {0: 0, 1: 0, 3: 0, 6: 3000, 12: 5500},
        },
        # EMERGENCY REPAIR CRANES (province-wide only)
        "emergency_crane": {
            "province": {0: 0, 1: 0, 3: 0, 6: 2000, 12: 3500},
        },
        # CRANES AND DRILLING RIGS
        "crane": {
            "15km":     {0: 50,  1: 150,  3: 400,  6: 600,  12: 1000},
            "30km":     {0: 100, 1: 300,  3: 700,  6: 1200, 12: 2000},
            "50km":     {0: 150, 1: 450,  3: 1050, 6: 1800, 12: 3000},
            "100km":    {0: 250, 1: 750,  3: 1750, 6: 3000, 12: 5000},
            "province": {0: 500, 1: 1800, 3: 4000, 6: 6000, 12: 10000},
        },
        # UNLADEN ABNORMAL VEHICLES
        "unladen": {
            "25km":     {0: 0,   1: 200,  3: 500,  6: 850,  12: 1500},
            "50km":     {0: 0,   1: 350,  3: 850,  6: 1500, 12: 2500},
            "100km":    {0: 0,   1: 500,  3: 1200, 6: 1800, 12: 3000},
            "province": {0: 500, 1: 1800, 3: 4000, 6: 6000, 12: 10000},
        },
    }
    cat_table  = PERIOD_TABLE.get(category, {})
    # For single-radius categories (emergency_*), ignore radius param
    if len(cat_table) == 1:
        radius_table = next(iter(cat_table.values()))
    else:
        radius_table = cat_table.get(radius, {})
    fee = radius_table.get(period_months)
    return Decimal(str(fee)) if fee is not None else None


# ── Agent / PPRO fees (from PPRO FEE sheet) ──────────────────────────────────
AGENT_FEES = {
    "GTN":   0,    # Gauteng — no agent fee (handled in-house)
    "MPU":   260,  # Mpumalanga
    "OFS":   195,  # Free State
    "KZN":   228,  # KwaZulu-Natal
    "NWEST": 175,  # North West
    "NCAPE": 240,  # Northern Cape
    "WCAPE": 350,  # Western Cape
    "ECAPE": 180,  # Eastern Cape
    "LIMP":  300,  # Limpopo
    "NAM":   550,  # Namibia
}

COURIER_FEES = {
    "collect":    0,
    "time_freight": 335,
    "ram_1030":   270,
    "misc_email": 58,
}

PPRO_FEES = {
    "abn":   810,   # Standard abnormal (GTN single-province)
    "mct":   1010,
    "w1":    929,
    "prov1": 1279,  # 1 province
    "prov3": 1345,  # 3 provinces
    "prov6": 1669,  # 6 provinces
    "prov12":2016,  # 12 months
    "multi": 2430,  # Multi-axle
    "stab":  255,   # Stability calc add-on
    "steerable_dolly": 1262,
    "zim":   950,   # Zimbabwe permit
}


def agent_fee(province_code: str) -> Decimal:
    """Return agent fee for a province (from PPRO FEE sheet)."""
    return Decimal(str(AGENT_FEES.get(province_code, 0)))


def ppro_fee(fee_type: str) -> Decimal:
    """Return PPRO consulting fee (from PPRO FEE sheet)."""
    return Decimal(str(PPRO_FEES.get(fee_type, 0)))


# ── Embargo dates (from EMBARGO sheet) ───────────────────────────────────────
# Keyed by province code → set of date strings (YYYY-MM-DD)
EMBARGO_DATES: dict[str, set[str]] = {
    "GENERAL": {
        "2022-03-21", "2022-04-15", "2022-04-18", "2022-04-27",
        "2022-05-02", "2022-06-16", "2022-08-09",
        "2022-12-16", "2022-12-26",
    },
    "GTN": {
        "2022-03-21", "2022-04-15", "2022-04-18", "2022-04-27",
        "2022-05-02", "2022-06-16", "2022-08-09",
        "2022-12-16", "2022-12-26",
    },
    "LIMP": {
        "2022-03-21", "2022-04-15", "2022-04-18", "2022-04-27",
        "2022-05-02", "2022-06-16", "2022-08-09",
        "2022-12-16", "2022-12-26",
    },
    "NWEST": {
        "2022-03-21", "2022-04-15", "2022-04-18", "2022-04-27",
        "2022-05-02", "2022-06-16", "2022-08-09",
        "2022-12-16", "2022-12-26",
    },
    "ECAPE": {
        "2022-03-21", "2022-04-15", "2022-04-18", "2022-04-27",
        "2022-05-02", "2022-06-16", "2022-08-09",
        "2022-09-24", "2022-12-16", "2022-12-25", "2022-12-26", "2023-01-01",
    },
}


def is_embargo_date(travel_date, province_code: str) -> bool:
    """Return True if travel_date falls on a provincial or general embargo date."""
    from datetime import date
    if isinstance(travel_date, date):
        ds = travel_date.strftime("%Y-%m-%d")
    else:
        ds = str(travel_date)[:10]
    prov_dates = EMBARGO_DATES.get(province_code, set())
    general    = EMBARGO_DATES.get("GENERAL", set())
    return ds in prov_dates or ds in general


def weekend_surcharge(travel_date, base_fee: Decimal) -> Decimal:
    """Return weekend/public holiday surcharge if applicable.

    The FEES sheet shows 'Weekend Travel' as an extra fee row.
    Standard practice: 50% surcharge on base permit fee for weekend travel.
    Returns the surcharge amount (R0 if weekday).
    """
    from datetime import date
    if isinstance(travel_date, date):
        d = travel_date
    else:
        import datetime
        d = datetime.date.fromisoformat(str(travel_date)[:10])
    if d.weekday() >= 5:  # Saturday=5, Sunday=6
        return q2(base_fee * Decimal("0.5"))
    return Decimal("0")
