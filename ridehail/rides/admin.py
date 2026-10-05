from django.contrib import admin

from .models import Ride


@admin.register(Ride)
class RideAdmin(admin.ModelAdmin):
    list_display = ("id", "rider", "driver", "vehicle_class", "status", "fare_estimate",
                    "final_fare", "platform_fee", "requested_at")
    list_filter = ("status", "vehicle_class", "payment_method")
    search_fields = ("rider__username", "driver__username", "pickup_address", "dropoff_address")
    date_hierarchy = "requested_at"
