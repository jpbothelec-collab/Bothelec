from django.urls import path

from . import views

urlpatterns = [
    path("auth/login/", views.login),
    path("auth/logout/", views.logout),
    path("auth/signup/rider/", views.signup_rider),
    path("auth/signup/driver/", views.signup_driver),
    path("me/", views.me),
    path("devices/", views.register_device),

    path("fare-estimate/", views.fare_estimate),
    path("nearby-drivers/", views.nearby_drivers),
    path("rides/", views.rides),
    path("rides/active/", views.active_ride),
    path("rides/<int:pk>/", views.ride_detail),
    path("rides/<int:pk>/cancel/", views.ride_cancel),
    path("rides/<int:pk>/rate/", views.ride_rate),

    path("driver/status/", views.driver_status),
    path("driver/location/", views.driver_location),
    path("driver/requests/", views.driver_requests),
    path("driver/rides/<int:pk>/accept/", views.driver_accept),
    path("driver/rides/<int:pk>/advance/", views.driver_advance),
    path("driver/earnings/", views.driver_earnings),
]
