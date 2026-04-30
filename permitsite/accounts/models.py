from django.db import models
from django.contrib.auth.models import User


class ClientProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="client_profile")
    company_name = models.CharField(max_length=200)
    contact_phone = models.CharField(max_length=30, blank=True)
    vat_number = models.CharField(max_length=30, blank=True)
    billing_address = models.TextField(blank=True)
    courier_address = models.TextField(blank=True, help_text="Address to courier printed permits to")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.company_name} ({self.user.username})"
