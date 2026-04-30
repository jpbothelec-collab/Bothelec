"""Seed provinces and vehicle configs from the Excel fee tables.

Province rates match the Excel exactly:
  GTN / NWEST / ECAPE / OTHER : mass 34.80 c/km, width 0.07 c/km, basic R300
  LIMP                        : mass 50.54 c/km, width 0.10 c/km, basic R415

Source sheets: FEES, GTN PERMIT COST, LIMP PERMIT COST, NWEST PERMIT COST,
               ECAPE PERMIT COST, OTHER PERMIT COST.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from permits.models import Province
from fleet.models import VehicleConfig


class Command(BaseCommand):
    help = "Seed initial provinces, fee schedules and vehicle configs"

    def handle(self, *args, **opts):
        # ── Vehicle configs (from AV_INPUTS in Excel) ────────────────────────
        configs = [
            dict(code="TT3+TA3", description="TT3+TA3 Interlink",
                 tare_kg=22000, gcm_kg=56000,
                 group1_max_kg=7700, group2_max_kg=18000, group3_max_kg=18000,
                 group4_max_kg=0,    group5_max_kg=0, wheel_track_mm=1800),
            dict(code="TT3+TA4", description="TT3+TA4 Superlink",
                 tare_kg=24000, gcm_kg=56000,
                 group1_max_kg=7700, group2_max_kg=18000, group3_max_kg=24000,
                 group4_max_kg=18000, group5_max_kg=0, wheel_track_mm=1800),
            dict(code="TD1+TA3", description="TD1+TA3 Rigid & Lowbed",
                 tare_kg=25000, gcm_kg=56000,
                 group1_max_kg=7700, group2_max_kg=18000, group3_max_kg=24000,
                 group4_max_kg=18000, group5_max_kg=0, wheel_track_mm=1800),
            dict(code="MULTI", description="Multi-Axle Modular",
                 tare_kg=35000, gcm_kg=90000,
                 group1_max_kg=7700, group2_max_kg=24000, group3_max_kg=24000,
                 group4_max_kg=24000, group5_max_kg=18000, wheel_track_mm=1800),
        ]
        for c in configs:
            VehicleConfig.objects.update_or_create(code=c["code"], defaults=c)
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(configs)} vehicle configs"))

        # ── Province fee schedules (from Excel FEES + individual cost sheets) ─
        # Rates are in cents-per-km (c/km).
        # GTN/NWEST/ECAPE/OTHER share the same tariff: 34.80 c/km mass, 0.07 c/km width
        # LIMP uses the "LIMP VERKEERD" rate: 50.54 c/km mass, 0.10 c/km width
        provinces = [
            dict(code="GTN",   name="Gauteng",
                 mass_cpk="34.80", length_cpk="0",    width_cpk="0.07",
                 basic_fee="300",  fee_minimum="300",  engineering_fee="810"),
            dict(code="LIMP",  name="Limpopo",
                 mass_cpk="50.54", length_cpk="0",    width_cpk="0.10",
                 basic_fee="415",  fee_minimum="415",  engineering_fee="1085"),
            dict(code="NWEST", name="North West",
                 mass_cpk="34.80", length_cpk="0",    width_cpk="0.07",
                 basic_fee="300",  fee_minimum="300",  engineering_fee="810"),
            dict(code="ECAPE", name="Eastern Cape",
                 mass_cpk="34.80", length_cpk="0",    width_cpk="0.07",
                 basic_fee="300",  fee_minimum="300",  engineering_fee="810"),
            dict(code="OTHER", name="Other (WC/KZN/FS/NC/MP)",
                 mass_cpk="34.80", length_cpk="0",    width_cpk="0.07",
                 basic_fee="415",  fee_minimum="415",  engineering_fee="1085"),
        ]
        for p in provinces:
            Province.objects.update_or_create(code=p["code"], defaults=p)
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(provinces)} provinces"))

        # ── Default superuser ─────────────────────────────────────────────────
        if not User.objects.filter(is_superuser=True).exists():
            User.objects.create_superuser("admin", "admin@example.com", "admin12345")
            self.stdout.write(self.style.SUCCESS("Created admin / admin12345 superuser"))
