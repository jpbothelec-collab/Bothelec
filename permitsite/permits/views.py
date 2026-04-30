from decimal import Decimal
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.http import HttpResponse, Http404, JsonResponse
from .models import PermitApplication, Province, PermitLine
from .forms import PermitApplicationForm
from . import calc
from .pdf import render_permit_pdf


@login_required
def application_list(request):
    apps = PermitApplication.objects.filter(applicant=request.user).prefetch_related("lines__province")
    return render(request, "permits/list.html", {"applications": apps})


@login_required
def application_create(request):
    if request.method == "POST":
        form = PermitApplicationForm(request.POST, user=request.user)
        if form.is_valid():
            app = form.save(commit=False)
            app.applicant = request.user
            app.save()

            load = {
                "length_m": float(app.load_length_m),
                "width_m":  float(app.load_width_m),
                "height_m": float(app.load_height_m),
                "mass_kg":  app.load_mass_kg,
            }

            total = Decimal("0")
            # Distance per province comes from POST fields: dist_GTN, dist_LIMP, etc.
            for province in form.cleaned_data["provinces"]:
                raw_dist = request.POST.get(f"dist_{province.code}", "0")
                try:
                    dist_km = max(0, int(raw_dist))
                except ValueError:
                    dist_km = 0

                fee, breakdown = calc.calculate_line(app.vehicle, load, province, dist_km)
                afee    = calc.agent_fee(province.code)
                embargo = calc.is_embargo_date(app.travel_date, province.code)
                PermitLine.objects.create(
                    application=app,
                    province=province,
                    distance_km=dist_km,
                    fee=fee,
                    agent_fee=afee,
                    breakdown=breakdown,
                    is_embargo=embargo,
                )
                total += fee

            app.total_fee = total
            app.save()
            messages.success(request, f"Draft {app.reference} created.")
            return redirect("permits_detail", pk=app.pk)
    else:
        form = PermitApplicationForm(user=request.user)
    provinces = Province.objects.all()
    return render(request, "permits/form.html", {
        "form": form,
        "provinces": provinces,
        "title": "New permit application",
    })


@login_required
def application_detail(request, pk):
    app = get_object_or_404(PermitApplication, pk=pk, applicant=request.user)
    load = {
        "length_m": float(app.load_length_m),
        "width_m":  float(app.load_width_m),
        "height_m": float(app.load_height_m),
        "mass_kg":  app.load_mass_kg,
    }
    warnings = calc.check_config_limits(app.vehicle, load)

    # Escort summary for the widest/longest dimension used
    escort_info = calc.escort_requirement(
        int(app.load_width_m * 1000),
        int(app.load_length_m * 1000),
        int(app.load_height_m * 1000),
    )
    return render(request, "permits/detail.html", {
        "app": app,
        "warnings": warnings,
        "escort_info": escort_info,
    })


@login_required
def application_submit(request, pk):
    app = get_object_or_404(PermitApplication, pk=pk, applicant=request.user)
    if request.method == "POST" and app.status == "draft":
        app.status = "submitted"
        app.save()
        from billing.models import Invoice
        inv = Invoice.objects.create(
            application=app,
            client=request.user,
            subtotal=app.total_fee,
            vat_amount=(app.total_fee * Decimal("0.15")).quantize(Decimal("0.01")),
            total=(app.total_fee * Decimal("1.15")).quantize(Decimal("0.01")),
        )
        messages.success(request, f"Application submitted. Invoice {inv.number} issued.")
        return redirect("billing_detail", pk=inv.pk)
    return redirect("permits_detail", pk=app.pk)


@login_required
def permit_pdf(request, pk, province_code):
    app = get_object_or_404(PermitApplication, pk=pk, applicant=request.user)
    line = app.lines.filter(province__code=province_code).first()
    if not line:
        raise Http404
    pdf_bytes = render_permit_pdf(app, line)
    resp = HttpResponse(pdf_bytes, content_type="application/pdf")
    resp["Content-Disposition"] = f'inline; filename="permit-{app.reference}-{province_code}.pdf"'
    return resp


@login_required
def detect_route(request):
    """AJAX: given origin & destination, suggest province codes."""
    origin      = request.GET.get("origin", "")
    destination = request.GET.get("destination", "")
    from .geo import detect_provinces
    result = detect_provinces(origin, destination)
    return JsonResponse(result)


@login_required
def fee_preview(request):
    """AJAX: return per-province fee estimate before form submission."""
    try:
        vehicle_id = int(request.GET.get("vehicle_id", 0))
        mass_kg    = int(request.GET.get("mass_kg", 0))
        length_m   = float(request.GET.get("length_m", 0))
        width_m    = float(request.GET.get("width_m", 0))
        height_m   = float(request.GET.get("height_m", 0))
        province_codes = request.GET.getlist("provinces")
    except (ValueError, TypeError):
        return JsonResponse({"error": "Invalid parameters"}, status=400)

    from fleet.models import Vehicle
    try:
        vehicle = Vehicle.objects.get(pk=vehicle_id, owner=request.user)
    except Vehicle.DoesNotExist:
        return JsonResponse({"error": "Vehicle not found"}, status=404)

    load = {"length_m": length_m, "width_m": width_m, "height_m": height_m, "mass_kg": mass_kg}
    rows = []
    for code in province_codes:
        raw_dist = request.GET.get(f"dist_{code}", "0")
        try:
            dist_km = max(0, int(raw_dist))
        except ValueError:
            dist_km = 0
        try:
            province = Province.objects.get(code=code)
            fee, _ = calc.calculate_line(vehicle, load, province, dist_km)
            afee    = calc.agent_fee(code)
            rows.append({
                "province":   code,
                "distance_km": dist_km,
                "fee":        str(fee),
                "agent_fee":  str(afee),
                "total_inc_agent": str(fee + afee),
            })
        except Province.DoesNotExist:
            pass

    escort_info = calc.escort_requirement(
        int(width_m * 1000), int(length_m * 1000), int(height_m * 1000)
    )
    return JsonResponse({
        "lines": rows,
        "total": str(sum(Decimal(r["fee"]) for r in rows)),
        "ruf": str(escort_info["ruf"]),
        "escort": escort_info["escort"],
        "height_warning": escort_info["height_warning"],
    })
