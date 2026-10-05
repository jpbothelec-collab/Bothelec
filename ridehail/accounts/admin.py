from django.contrib import admin

from .models import DriverProfile, Profile


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "phone", "created_at")
    list_filter = ("role",)
    search_fields = ("user__username", "phone")


@admin.register(DriverProfile)
class DriverProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "vehicle_plate", "vehicle_class", "is_approved", "is_online",
                    "location_updated_at")
    list_filter = ("is_approved", "is_online", "vehicle_class")
    search_fields = ("user__username", "vehicle_plate", "licence_number")
    actions = ["approve"]

    @admin.action(description="Approve selected drivers")
    def approve(self, request, queryset):
        queryset.update(is_approved=True)
