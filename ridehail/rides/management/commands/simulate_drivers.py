"""Keep idle demo drivers online and drifting around so riders see cars on the map."""
import random
import time

from django.core.management.base import BaseCommand

from accounts.models import DriverProfile
from rides.models import Ride


class Command(BaseCommand):
    help = "Move online drivers who are not on a trip every few seconds (demo only)."

    def add_arguments(self, parser):
        parser.add_argument("--interval", type=float, default=5.0)

    def handle(self, *args, interval, **opts):
        self.stdout.write("Simulating drivers - Ctrl+C to stop.")
        while True:
            busy = Ride.objects.filter(status__in=Ride.DRIVER_ACTIVE_STATUSES).values_list("driver_id", flat=True)
            for d in DriverProfile.objects.filter(is_online=True, lat__isnull=False).exclude(user_id__in=busy):
                d.set_location(d.lat + random.uniform(-0.002, 0.002), d.lng + random.uniform(-0.002, 0.002))
            time.sleep(interval)
