from django.contrib import admin
from django.urls import include, path

from rides import views as ride_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("api.urls")),
    path("accounts/", include("django.contrib.auth.urls")),
    path("accounts/", include("accounts.urls")),
    path("", ride_views.home, name="home"),
    path("", include("rides.urls")),
]
