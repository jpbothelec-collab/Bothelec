from django.contrib import admin
from .models import Province, PermitApplication, PermitLine


class PermitLineInline(admin.TabularInline):
    model = PermitLine
    extra = 0


@admin.register(Province)
class ProvinceAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "base_fee", "fee_minimum",
                    "fee_per_tonne_over", "fee_per_metre_over_length", "fee_per_metre_over_width")


@admin.register(PermitApplication)
class PermitApplicationAdmin(admin.ModelAdmin):
    list_display = ("reference", "applicant", "vehicle", "origin", "destination", "travel_date", "status", "total_fee")
    list_filter = ("status",)
    inlines = [PermitLineInline]
    search_fields = ("reference", "origin", "destination")
