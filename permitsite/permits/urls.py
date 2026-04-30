from django.urls import path
from . import views

urlpatterns = [
    path("", views.application_list, name="permits_list"),
    path("new/", views.application_create, name="permits_create"),
    path("<int:pk>/", views.application_detail, name="permits_detail"),
    path("<int:pk>/submit/", views.application_submit, name="permits_submit"),
    path("<int:pk>/permit-pdf/<str:province_code>/", views.permit_pdf, name="permits_pdf"),
    path("detect-route/", views.detect_route, name="permits_detect_route"),
    path("fee-preview/", views.fee_preview, name="permits_fee_preview"),
    path("<int:pk>/permit-pdf/<str:province_code>/", views.permit_pdf, name="permit_pdf"),
]
