from django.urls import path
from . import views

urlpatterns = [
    path("", views.invoice_list, name="billing_list"),
    path("<int:pk>/", views.invoice_detail, name="billing_detail"),
    path("<int:pk>/pdf/", views.invoice_pdf, name="billing_pdf"),
    path("<int:pk>/pay/", views.pay_start, name="billing_pay"),
    path("<int:pk>/payfast/return/", views.pay_return, name="billing_pay_return"),
    path("<int:pk>/payfast/cancel/", views.pay_cancel, name="billing_pay_cancel"),
    path("payfast/notify/", views.payfast_notify, name="billing_payfast_notify"),
    path("<int:pk>/simulate-paid/", views.pay_simulate_success, name="billing_simulate_paid"),
]
