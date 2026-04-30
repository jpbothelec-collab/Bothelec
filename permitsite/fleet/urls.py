from django.urls import path
from . import views

urlpatterns = [
    path("", views.vehicle_list, name="fleet_list"),
    path("new/", views.vehicle_create, name="fleet_create"),
    path("<int:pk>/edit/", views.vehicle_edit, name="fleet_edit"),
    path("<int:pk>/delete/", views.vehicle_delete, name="fleet_delete"),
]
