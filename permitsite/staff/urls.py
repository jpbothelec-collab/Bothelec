from django.urls import path
from . import views

urlpatterns = [
    path("", views.dashboard, name="staff_dashboard"),
    path("app/<int:pk>/", views.app_detail, name="staff_app_detail"),
    path("app/<int:pk>/mark-printed/", views.mark_printed, name="staff_mark_printed"),
    path("app/<int:pk>/mark-couriered/", views.mark_couriered, name="staff_mark_couriered"),
    path("app/<int:pk>/mark-delivered/", views.mark_delivered, name="staff_mark_delivered"),
    path("app/<int:pk>/permit-pdf/<str:province_code>/", views.permit_pdf, name="staff_permit_pdf"),
]
