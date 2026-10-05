from django.urls import path

from . import views

urlpatterns = [
    path("signup/", views.rider_signup, name="signup_rider"),
    path("signup/driver/", views.driver_signup, name="signup_driver"),
]
