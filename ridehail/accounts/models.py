from django.conf import settings
from django.db import models
from django.utils import timezone


class Profile(models.Model):
    """Every user is either a rider or a driver."""
    RIDER = "rider"
    DRIVER = "driver"
    ROLES = [(RIDER, "Rider"), (DRIVER, "Driver")]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name="profile")
    role = models.CharField(max_length=10, choices=ROLES, default=RIDER)
    phone = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_driver(self):
        return self.role == self.DRIVER

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class DriverProfile(models.Model):
    """Driver, vehicle and live-location details.

    Drivers must be approved by staff (licence, PrDP, vehicle roadworthy and
    operating licence checked) before they can go online.
    """
    ECONOMY = "economy"
    COMFORT = "comfort"
    XL = "xl"
    VEHICLE_CLASSES = [(ECONOMY, "Economy"), (COMFORT, "Comfort"), (XL, "XL (6 seats)")]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name="driver")
    licence_number = models.CharField(max_length=40)
    prdp_number = models.CharField("PrDP number", max_length=40, blank=True,
                                   help_text="Professional Driving Permit")
    operating_licence = models.CharField(max_length=60, blank=True,
                                         help_text="NLTA e-hailing operating licence")

    vehicle_make = models.CharField(max_length=40)
    vehicle_model = models.CharField(max_length=40)
    vehicle_colour = models.CharField(max_length=30)
    vehicle_plate = models.CharField(max_length=20, unique=True)
    vehicle_class = models.CharField(max_length=10, choices=VEHICLE_CLASSES, default=ECONOMY)

    is_approved = models.BooleanField(default=False)
    is_online = models.BooleanField(default=False)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    location_updated_at = models.DateTimeField(null=True, blank=True)

    def set_location(self, lat, lng):
        self.lat, self.lng = lat, lng
        self.location_updated_at = timezone.now()
        self.save(update_fields=["lat", "lng", "location_updated_at"])

    @property
    def vehicle_label(self):
        return f"{self.vehicle_colour} {self.vehicle_make} {self.vehicle_model} · {self.vehicle_plate}"

    @property
    def rating(self):
        from rides.models import Ride
        agg = Ride.objects.filter(driver=self.user, rating_for_driver__isnull=False) \
            .aggregate(avg=models.Avg("rating_for_driver"))
        return round(agg["avg"], 2) if agg["avg"] else None

    def __str__(self):
        return f"{self.user.username} – {self.vehicle_label}"
