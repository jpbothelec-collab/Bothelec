from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/", include("django.contrib.auth.urls")),
    path("accounts/signup/", include("accounts.urls")),
    path("dashboard/", include("accounts.dashboard_urls")),
    path("fleet/", include("fleet.urls")),
    path("permits/", include("permits.urls")),
    path("billing/", include("billing.urls")),
    path("staff/", include("staff.urls")),
    path("", RedirectView.as_view(url="/dashboard/", permanent=False)),
]
