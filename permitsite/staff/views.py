from django.contrib.auth.decorators import login_required, user_passes_test
from django.shortcuts import render, redirect, get_object_or_404
from django.http import HttpResponse
from django.contrib import messages
from django.utils import timezone
from permits.models import PermitApplication
from permits.pdf import render_permit_pdf

staff_required = user_passes_test(lambda u: u.is_authenticated and u.is_staff, login_url="/accounts/login/")


@login_required
@staff_required
def dashboard(request):
    q = PermitApplication.objects.select_related("applicant", "vehicle").prefetch_related("lines__province")
    return render(request, "staff/dashboard.html", {
        "awaiting_payment": q.filter(status="submitted"),
        "awaiting_print":   q.filter(status="approved"),
        "awaiting_courier": q.filter(status="printed"),
        "in_transit":       q.filter(status="couriered"),
        "delivered":        q.filter(status="delivered")[:10],
    })


@login_required
@staff_required
def app_detail(request, pk):
    app = get_object_or_404(PermitApplication, pk=pk)
    return render(request, "staff/app_detail.html", {"app": app})


@login_required
@staff_required
def mark_printed(request, pk):
    app = get_object_or_404(PermitApplication, pk=pk)
    if request.method == "POST" and app.status == "approved":
        app.status = "printed"
        app.printed_at = timezone.now()
        app.printed_by = request.user
        app.save()
        messages.success(request, f"{app.reference} marked as printed.")
    return redirect("staff_app_detail", pk=app.pk)


@login_required
@staff_required
def mark_couriered(request, pk):
    app = get_object_or_404(PermitApplication, pk=pk)
    if request.method == "POST" and app.status == "printed":
        courier = request.POST.get("courier_company", "").strip()
        tracking = request.POST.get("tracking_number", "").strip()
        if not courier or not tracking:
            messages.error(request, "Courier name and tracking number required.")
            return redirect("staff_app_detail", pk=app.pk)
        app.status = "couriered"
        app.couriered_at = timezone.now()
        app.courier_company = courier
        app.tracking_number = tracking
        app.save()
        messages.success(request, f"{app.reference} dispatched via {courier}, tracking {tracking}.")
    return redirect("staff_app_detail", pk=app.pk)


@login_required
@staff_required
def mark_delivered(request, pk):
    app = get_object_or_404(PermitApplication, pk=pk)
    if request.method == "POST" and app.status == "couriered":
        app.status = "delivered"
        app.save()
        messages.success(request, f"{app.reference} confirmed delivered.")
    return redirect("staff_app_detail", pk=app.pk)


@login_required
@staff_required
def permit_pdf(request, pk, province_code):
    app = get_object_or_404(PermitApplication, pk=pk)
    line = app.lines.filter(province__code=province_code).first()
    if not line:
        return HttpResponse(status=404)
    pdf_bytes = render_permit_pdf(app, line)
    resp = HttpResponse(pdf_bytes, content_type="application/pdf")
    resp["Content-Disposition"] = f'inline; filename="permit-{app.reference}-{province_code}.pdf"'
    return resp
