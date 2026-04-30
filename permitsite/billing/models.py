from django.db import models
from django.conf import settings
from permits.models import PermitApplication


class Invoice(models.Model):
    STATUS = [
        ("unpaid", "Unpaid"),
        ("paid", "Paid"),
        ("cancelled", "Cancelled"),
    ]
    number = models.CharField(max_length=30, unique=True, blank=True)
    application = models.OneToOneField(PermitApplication, on_delete=models.CASCADE, related_name="invoice")
    client = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    vat_rate = models.DecimalField(max_digits=5, decimal_places=4, default=0.15)  # 15% SA VAT
    vat_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS, default="unpaid")
    issued_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.number:
            import secrets
            from datetime import datetime
            self.number = "INV-" + datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(3)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.number} - R{self.total} ({self.status})"
