from django.contrib import admin

from .models import ApiToken, Device


@admin.register(ApiToken)
class ApiTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "last_used_at")
    readonly_fields = ("key_hash",)


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("user", "platform", "updated_at")
