from django.contrib import admin
from .models import Vehicle, VehicleConfig

@admin.register(VehicleConfig)
class VehicleConfigAdmin(admin.ModelAdmin):
    list_display = ("code", "description", "tare_kg", "gcm_kg")

@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ("fleet_number", "registration", "owner", "config")
    list_filter = ("config",)
    search_fields = ("fleet_number", "registration")
