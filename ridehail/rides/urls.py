from django.urls import path

from . import views

urlpatterns = [
    path("ride/", views.rider_home, name="rider_home"),
    path("ride/request/", views.request_ride, name="request_ride"),
    path("ride/<int:pk>/", views.ride_detail, name="ride_detail"),
    path("ride/<int:pk>/cancel/", views.ride_cancel, name="ride_cancel"),
    path("ride/<int:pk>/rate/", views.ride_rate, name="ride_rate"),
    path("history/", views.ride_history, name="ride_history"),

    path("drive/", views.driver_dashboard, name="driver_dashboard"),
    path("drive/toggle/", views.driver_toggle_online, name="driver_toggle_online"),
    path("drive/accept/<int:pk>/", views.driver_accept, name="driver_accept"),
    path("drive/ride/<int:pk>/", views.driver_advance, name="driver_advance"),
    path("drive/earnings/", views.driver_earnings, name="driver_earnings"),

    path("ops/", views.ops_dashboard, name="ops_dashboard"),

    path("api/fare-estimate/", views.api_fare_estimate, name="api_fare_estimate"),
    path("api/nearby-drivers/", views.api_nearby_drivers, name="api_nearby_drivers"),
    path("api/ride/<int:pk>/", views.api_ride_status, name="api_ride_status"),
    path("api/driver/location/", views.api_driver_location, name="api_driver_location"),
    path("api/driver/requests/", views.api_driver_requests, name="api_driver_requests"),
]
