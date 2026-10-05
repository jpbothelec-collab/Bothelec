"""Fare engine.

fare = (base + per_km × km + per_min × minutes) × surge + booking_fee
fare = max(fare, minimum)
"""
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings


@dataclass(frozen=True)
class Tariff:
    label: str
    base: Decimal
    per_km: Decimal
    per_min: Decimal
    minimum: Decimal
    booking_fee: Decimal
    seats: int


TARIFFS = {
    "economy": Tariff("Economy", Decimal("10.00"), Decimal("7.50"), Decimal("0.90"),
                      Decimal("30.00"), Decimal("3.00"), 4),
    "comfort": Tariff("Comfort", Decimal("15.00"), Decimal("10.00"), Decimal("1.20"),
                      Decimal("45.00"), Decimal("3.00"), 4),
    "xl":      Tariff("XL", Decimal("20.00"), Decimal("13.00"), Decimal("1.50"),
                      Decimal("60.00"), Decimal("3.00"), 6),
}

CANCELLATION_FEE = Decimal("25.00")
MAX_SURGE = Decimal("2.5")


def _money(x):
    return Decimal(x).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_fare(vehicle_class, km, minutes, surge=Decimal("1.0")):
    t = TARIFFS[vehicle_class]
    km, minutes, surge = Decimal(str(km)), Decimal(str(minutes)), Decimal(str(surge))
    fare = (t.base + t.per_km * km + t.per_min * minutes) * surge + t.booking_fee
    return _money(max(fare, t.minimum))


def surge_multiplier(open_requests, online_drivers):
    """Demand/supply surge: +0.25× for every extra request per available driver."""
    if open_requests <= online_drivers or open_requests == 0:
        return Decimal("1.0")
    ratio = Decimal(open_requests) / Decimal(max(online_drivers, 1))
    surge = Decimal("1.0") + (ratio - 1) * Decimal("0.25")
    return min(surge, MAX_SURGE).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def split_fare(fare):
    """Return (platform_fee, driver_earnings)."""
    fee = _money(Decimal(fare) * Decimal(str(settings.PLATFORM_COMMISSION)))
    return fee, _money(Decimal(fare) - fee)
