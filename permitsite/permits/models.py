from django.db import models
from django.conf import settings
from fleet.models import Vehicle


class Province(models.Model):
    """Province with Excel-correct fee schedule (distance-based R/km rates)."""
    PROVINCE_CHOICES = [
        ("GTN",   "Gauteng"),
        ("LIMP",  "Limpopo"),
        ("NWEST", "North West"),
        ("ECAPE", "Eastern Cape"),
        ("OTHER", "Other (WC/KZN/FS/NC/MP)"),
    ]
    code = models.CharField(max_length=10, choices=PROVINCE_CHOICES, unique=True)
    name = models.CharField(max_length=80)

    # ── Excel fee rates (from FEES sheet + individual CALCULATION sheets) ──
    # All rates in RANDS per km (R/km). Verified: 34.87 R/km × 101 km = R3521.87 (GTN PERMIT COST sheet).
    mass_cpk   = models.DecimalField(max_digits=8, decimal_places=4, default=0,
        help_text="Abnormal mass fee in R/km (e.g. 34.80 for GTN)")
    length_cpk = models.DecimalField(max_digits=8, decimal_places=4, default=0,
        help_text="Over-length road usage fee in R/km per metre over 22 m")
    width_cpk  = models.DecimalField(max_digits=8, decimal_places=4, default=0,
        help_text="Over-width road usage fee in R/km per metre over 2.5 m")
    basic_fee  = models.DecimalField(max_digits=10, decimal_places=2, default=0,
        help_text="Fixed basic permit fee in Rands (added regardless of distance)")
    fee_minimum = models.DecimalField(max_digits=10, decimal_places=2, default=0,
        help_text="Minimum permit fee regardless of distance/load")

    # Engineering / agent fees (from PPRO FEE sheet)
    engineering_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0,
        help_text="PPRO/agent engineering fee in Rands")

    def __str__(self):
        return f"{self.code} – {self.name}"


class PermitApplication(models.Model):
    STATUS = [
        ("draft",      "Draft"),
        ("submitted",  "Submitted"),
        ("approved",   "Approved / Paid"),
        ("printed",    "Permits Printed"),
        ("couriered",  "Couriered"),
        ("delivered",  "Delivered"),
        ("rejected",   "Rejected"),
    ]
    reference  = models.CharField(max_length=30, unique=True, blank=True)
    applicant  = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                   related_name="applications")
    vehicle    = models.ForeignKey(Vehicle, on_delete=models.PROTECT)
    origin      = models.CharField(max_length=120, help_text="e.g. Pretoria")
    destination = models.CharField(max_length=120, help_text="e.g. Cape Town")
    provinces  = models.ManyToManyField(Province, through="PermitLine")

    load_description = models.CharField(max_length=200)
    load_length_m    = models.DecimalField(max_digits=6, decimal_places=2)
    load_width_m     = models.DecimalField(max_digits=6, decimal_places=2)
    load_height_m    = models.DecimalField(max_digits=6, decimal_places=2)
    load_mass_kg     = models.PositiveIntegerField()

    travel_date = models.DateField()
    notes       = models.TextField(blank=True)

    status    = models.CharField(max_length=20, choices=STATUS, default="draft")
    total_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Fulfilment tracking
    printed_at     = models.DateTimeField(null=True, blank=True)
    printed_by     = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                       on_delete=models.SET_NULL, related_name="printed_apps")
    couriered_at   = models.DateTimeField(null=True, blank=True)
    courier_company  = models.CharField(max_length=60, blank=True)
    tracking_number  = models.CharField(max_length=60, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.reference:
            import secrets
            from datetime import datetime
            self.reference = "ALP-" + datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(3)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.reference} ({self.status})"


class PermitLine(models.Model):
    """One permit line per province on an application (includes distance)."""
    application  = models.ForeignKey(PermitApplication, on_delete=models.CASCADE,
                                     related_name="lines")
    province     = models.ForeignKey(Province, on_delete=models.PROTECT)
    distance_km  = models.PositiveIntegerField(default=0,
                   help_text="Kilometres in this province for this trip")
    fee          = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    agent_fee    = models.DecimalField(max_digits=10, decimal_places=2, default=0,
                   help_text="Agent/PPRO fee for this province (from PPRO FEE sheet)")
    breakdown    = models.TextField(blank=True)
    is_embargo   = models.BooleanField(default=False,
                   help_text="True if travel date falls on an embargo date for this province")

    class Meta:
        unique_together = [("application", "province")]

    def __str__(self):
        return f"{self.application.reference} – {self.province.code}: R{self.fee} ({self.distance_km} km)"
