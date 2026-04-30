from django.db import models
from django.conf import settings


class VehicleConfig(models.Model):
    """Axle-mass and geometry limits for a vehicle configuration (TT3+TA3, etc.).
    Seeded from AV_INPUTS in the source Excel. Editable per-client."""
    CONFIG_CHOICES = [
        ("TT3+TA3", "TT3+TA3 Interlink"),
        ("TT3+TA4", "TT3+TA4 Superlink"),
        ("TD1+TA3", "TD1+TA3 Rigid & Lowbed"),
        ("MULTI", "Multi-Axle Modular"),
    ]
    code = models.CharField(max_length=20, choices=CONFIG_CHOICES, unique=True)
    description = models.CharField(max_length=120)
    tare_kg = models.PositiveIntegerField()
    gcm_kg = models.PositiveIntegerField(help_text="Gross Combination Mass")
    group1_max_kg = models.PositiveIntegerField(default=7700, help_text="Steer axle max")
    group2_max_kg = models.PositiveIntegerField(default=18000, help_text="Drive tandem max")
    group3_max_kg = models.PositiveIntegerField(default=24000)
    group4_max_kg = models.PositiveIntegerField(default=0)
    group5_max_kg = models.PositiveIntegerField(default=0)
    wheel_track_mm = models.PositiveIntegerField(default=1800)
    default_tyre_load_kg = models.PositiveIntegerField(default=3000)

    def __str__(self):
        return f"{self.code} - {self.description}"


class Vehicle(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="vehicles")
    fleet_number = models.CharField(max_length=40)
    registration = models.CharField(max_length=20)
    config = models.ForeignKey(VehicleConfig, on_delete=models.PROTECT)
    tare_kg_override = models.PositiveIntegerField(null=True, blank=True, help_text="Actual tare of this specific vehicle, if different from config default")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["fleet_number"]
        unique_together = [("owner", "fleet_number")]

    def __str__(self):
        return f"{self.fleet_number} ({self.registration}) - {self.config.code}"

    @property
    def effective_tare(self):
        return self.tare_kg_override or self.config.tare_kg
