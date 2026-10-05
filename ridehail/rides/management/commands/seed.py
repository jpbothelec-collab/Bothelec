"""Create demo users: an admin, a rider and a few approved drivers around Johannesburg."""
import random

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import DriverProfile, Profile

DEMO_DRIVERS = [
    ("thabo", "Thabo", "Toyota", "Corolla", "White", "economy"),
    ("lerato", "Lerato", "VW", "Polo", "Silver", "economy"),
    ("sipho", "Sipho", "Suzuki", "Swift", "Red", "economy"),
    ("naledi", "Naledi", "Mercedes", "C200", "Black", "comfort"),
    ("johan", "Johan", "Toyota", "Avanza", "Grey", "xl"),
]
CENTRE = (-26.1076, 28.0567)  # Sandton


class Command(BaseCommand):
    help = "Seed demo admin, rider and drivers (password for all demo users: demo12345)."

    def handle(self, *args, **opts):
        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser("admin", "admin@example.com", "admin12345")
            self.stdout.write("admin / admin12345")

        rider, created = User.objects.get_or_create(username="rider", defaults={"first_name": "Amara"})
        if created:
            rider.set_password("demo12345")
            rider.save()
        Profile.objects.get_or_create(user=rider, defaults={"role": Profile.RIDER, "phone": "+27 82 000 0001"})

        for i, (username, name, make, model, colour, cls) in enumerate(DEMO_DRIVERS):
            user, created = User.objects.get_or_create(username=username, defaults={"first_name": name})
            if created:
                user.set_password("demo12345")
                user.save()
            Profile.objects.get_or_create(user=user, defaults={"role": Profile.DRIVER,
                                                               "phone": f"+27 82 000 01{i:02d}"})
            DriverProfile.objects.update_or_create(user=user, defaults=dict(
                licence_number=f"DL{100000 + i}", prdp_number=f"PRDP{i:04d}",
                vehicle_make=make, vehicle_model=model, vehicle_colour=colour,
                vehicle_plate=f"DEMO{i:02d}GP", vehicle_class=cls,
                is_approved=True, is_online=True,
                lat=CENTRE[0] + random.uniform(-0.03, 0.03),
                lng=CENTRE[1] + random.uniform(-0.03, 0.03),
                location_updated_at=timezone.now(),
            ))
        self.stdout.write(self.style.SUCCESS(
            "Seeded. Rider: rider / demo12345. Drivers: " + ", ".join(d[0] for d in DEMO_DRIVERS)
            + " (password demo12345). Run `manage.py simulate_drivers` to keep them online."))
