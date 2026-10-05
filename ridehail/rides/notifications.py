"""Push notifications to the mobile apps via the Expo push service.

Sending happens on a background thread so a slow push service never delays
an HTTP response. Disabled when settings.PUSH_NOTIFICATIONS_ENABLED is False.
"""
import json
import logging
import threading
import urllib.request

from django.conf import settings

log = logging.getLogger(__name__)
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _send(messages):
    for i in range(0, len(messages), 100):  # Expo accepts up to 100 per request
        req = urllib.request.Request(
            EXPO_PUSH_URL, data=json.dumps(messages[i:i + 100]).encode(),
            headers={"Content-Type": "application/json", "Accept": "application/json"})
        try:
            urllib.request.urlopen(req, timeout=10).read()
        except Exception:
            log.exception("Expo push failed")


def notify(users, title, body, ride=None, kind="ride_update"):
    from api.models import Device

    if not getattr(settings, "PUSH_NOTIFICATIONS_ENABLED", False):
        return
    tokens = list(Device.objects.filter(user__in=[u for u in users if u]).values_list("token", flat=True))
    if not tokens:
        return
    data = {"kind": kind, "ride_id": ride.pk if ride else None}
    messages = [{"to": t, "title": title, "body": body or "", "data": data, "sound": "default"}
                for t in tokens]
    threading.Thread(target=_send, args=(messages,), daemon=True).start()
