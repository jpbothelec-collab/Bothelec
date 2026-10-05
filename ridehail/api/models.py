import hashlib
import secrets

from django.conf import settings
from django.db import models


def _hash(key):
    return hashlib.sha256(key.encode()).hexdigest()


class ApiToken(models.Model):
    """Bearer token for the mobile apps. Only a hash is stored."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="api_tokens")
    key_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    @classmethod
    def issue(cls, user):
        key = secrets.token_urlsafe(32)
        cls.objects.create(user=user, key_hash=_hash(key))
        return key

    @classmethod
    def lookup(cls, key):
        return cls.objects.select_related("user").filter(key_hash=_hash(key)).first()

    def __str__(self):
        return f"Token for {self.user}"


class Device(models.Model):
    """An Expo push token registered by a logged-in app install."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="devices")
    token = models.CharField(max_length=200, unique=True)
    platform = models.CharField(max_length=10, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user} {self.platform}"
