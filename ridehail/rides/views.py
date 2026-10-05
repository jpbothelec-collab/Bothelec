from decimal import Decimal
from functools import wraps

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Sum
from django.http import HttpResponseForbidden, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from . import dispatch, fares, services
from .models import Ride


# ---------------------------------------------------------------- helpers

def _role(user):
    profile = getattr(user, "profile", None)
    return profile.role if profile else None


def rider_required(view):
    @wraps(view)
    @login_required
    def wrapper(request, *args, **kwargs):
        if _role(request.user) != "rider":
            return HttpResponseForbidden("Riders only.")
        return view(request, *args, **kwargs)
    return wrapper


def driver_required(view):
    @wraps(view)
    @login_required
    def wrapper(request, *args, **kwargs):
        if _role(request.user) != "driver" or not hasattr(request.user, "driver"):
            return HttpResponseForbidden("Drivers only.")
        request.driver = request.user.driver
        return view(request, *args, **kwargs)
    return wrapper


def _ride_for_user(request, pk):
    ride = get_object_or_404(Ride, pk=pk)
    if request.user not in (ride.rider, ride.driver) and not request.user.is_staff:
        return None
    return ride


# ---------------------------------------------------------------- pages

def home(request):
    if not request.user.is_authenticated:
        return render(request, "landing.html")
    role = _role(request.user)
    if role == "driver":
        return redirect("driver_dashboard")
    if role == "rider":
        return redirect("rider_home")
    if request.user.is_staff:
        return redirect("ops_dashboard")
    return render(request, "landing.html")


@rider_required
def rider_home(request):
    active = Ride.objects.filter(rider=request.user, status__in=Ride.ACTIVE_STATUSES).first()
    if active:
        return redirect("ride_detail", pk=active.pk)
    recent = Ride.objects.filter(rider=request.user)[:5]
    return render(request, "rider/home.html", {
        "recent": recent,
        "classes": [(k, t.label, t.seats) for k, t in fares.TARIFFS.items()],
    })


@rider_required
@require_POST
def request_ride(request):
    try:
        ride = services.request_ride(request.user, request.POST)
    except services.RideError as e:
        messages.error(request, str(e))
        return redirect("rider_home")
    return redirect("ride_detail", pk=ride.pk)


@login_required
def ride_detail(request, pk):
    ride = _ride_for_user(request, pk)
    if ride is None:
        return HttpResponseForbidden()
    return render(request, "ride_detail.html", {
        "ride": ride, "is_driver": request.user == ride.driver,
    })


@login_required
@require_POST
def ride_cancel(request, pk):
    ride = _ride_for_user(request, pk)
    if ride is None:
        return HttpResponseForbidden()
    try:
        services.cancel(ride, request.user)
        messages.info(request, "Ride cancelled.")
    except services.RideError as e:
        messages.error(request, str(e))
    if request.user == ride.driver:
        return redirect("driver_dashboard")
    return redirect("ride_detail", pk=pk)


@login_required
@require_POST
def ride_rate(request, pk):
    ride = _ride_for_user(request, pk)
    if ride is None:
        return HttpResponseForbidden()
    try:
        services.rate(ride, request.user, request.POST.get("stars"))
        messages.success(request, "Thanks for your rating.")
    except services.RideError as e:
        messages.error(request, str(e))
    return redirect("ride_detail", pk=pk)


@login_required
def ride_history(request):
    field = "driver" if _role(request.user) == "driver" else "rider"
    rides = Ride.objects.filter(**{field: request.user}).select_related("rider", "driver")[:100]
    return render(request, "history.html", {"rides": rides, "as_driver": field == "driver"})


# ---------------------------------------------------------------- driver

@driver_required
def driver_dashboard(request):
    current = Ride.objects.filter(driver=request.user, status__in=Ride.DRIVER_ACTIVE_STATUSES).first()
    today = timezone.localdate()
    earned = Ride.objects.filter(driver=request.user, completed_at__date=today) \
        .aggregate(total=Sum("driver_earnings"), trips=Count("id"))
    return render(request, "driver/dashboard.html", {
        "driver": request.driver, "current": current,
        "earned_today": earned["total"] or Decimal("0"), "trips_today": earned["trips"],
    })


@driver_required
@require_POST
def driver_toggle_online(request):
    d = request.driver
    if not d.is_approved:
        messages.error(request, "Your documents are still being reviewed.")
    else:
        d.is_online = not d.is_online
        d.save(update_fields=["is_online"])
    return redirect("driver_dashboard")


@driver_required
@require_POST
def driver_accept(request, pk):
    try:
        services.accept(request.driver, pk)
    except services.RideError as e:
        messages.error(request, str(e))
        return redirect("driver_dashboard")
    return redirect("ride_detail", pk=pk)


@driver_required
@require_POST
def driver_advance(request, pk):
    ride = get_object_or_404(Ride, pk=pk, driver=request.user)
    try:
        services.advance(ride, request.POST.get("action"))
    except services.RideError as e:
        messages.error(request, str(e))
    return redirect("ride_detail", pk=pk)


@driver_required
def driver_earnings(request):
    rides = Ride.objects.filter(driver=request.user, status__in=[Ride.COMPLETED, Ride.CANCELLED]) \
        .exclude(driver_earnings=0)
    totals = rides.aggregate(fares=Sum("final_fare"), fees=Sum("platform_fee"),
                             earnings=Sum("driver_earnings"), trips=Count("id"))
    return render(request, "driver/earnings.html", {"rides": rides[:100], "totals": totals})


# ---------------------------------------------------------------- staff ops

@login_required
def ops_dashboard(request):
    if not request.user.is_staff:
        return HttpResponseForbidden()
    from accounts.models import DriverProfile
    dispatch.expire_stale_requests()
    today = timezone.localdate()
    return render(request, "ops.html", {
        "active": Ride.objects.filter(status__in=Ride.ACTIVE_STATUSES).select_related("rider", "driver"),
        "online": DriverProfile.objects.filter(is_online=True).count(),
        "pending_drivers": DriverProfile.objects.filter(is_approved=False).select_related("user"),
        "today": Ride.objects.filter(completed_at__date=today).aggregate(
            trips=Count("id"), gross=Sum("final_fare"), revenue=Sum("platform_fee")),
    })


# ---------------------------------------------------------------- JSON API

@login_required
def api_fare_estimate(request):
    pickup, dropoff = services.parse_point(request.GET, "pickup"), services.parse_point(request.GET, "dropoff")
    if not pickup or not dropoff:
        return JsonResponse({"error": "pickup and dropoff required"}, status=400)
    return JsonResponse(services.quote(pickup, dropoff))


@login_required
def api_nearby_drivers(request):
    point = services.parse_point(request.GET, "at")
    if not point:
        return JsonResponse({"error": "at_lat and at_lng required"}, status=400)
    drivers = dispatch.available_drivers(*point)
    # Rounded positions only - riders shouldn't be able to track idle drivers precisely.
    return JsonResponse({"drivers": [
        {"lat": round(d.lat, 3), "lng": round(d.lng, 3), "vehicle_class": d.vehicle_class}
        for d, _ in drivers[:20]
    ]})


@login_required
def api_ride_status(request, pk):
    ride = _ride_for_user(request, pk)
    if ride is None:
        return JsonResponse({"error": "forbidden"}, status=403)
    if ride.status == Ride.REQUESTED:
        dispatch.expire_stale_requests()
        ride.refresh_from_db()
    return JsonResponse(services.ride_to_dict(ride, request.user))


@driver_required
@require_POST
def api_driver_location(request):
    point = services.parse_point(request.POST, "at")
    if not point:
        return JsonResponse({"error": "at_lat and at_lng required"}, status=400)
    dispatch.record_driver_location(request.driver, *point)
    return JsonResponse({"ok": True})


@driver_required
def api_driver_requests(request):
    dispatch.expire_stale_requests()
    request.driver.refresh_from_db()
    return JsonResponse({"online": request.driver.is_online, "requests": [
        {
            "id": r.pk, "pickup": r.pickup_address, "dropoff": r.dropoff_address,
            "pickup_lat": r.pickup_lat, "pickup_lng": r.pickup_lng,
            "km_away": round(km, 1), "trip_km": r.est_distance_km,
            "fare": str(r.fare_estimate), "surge": str(r.surge), "payment": r.payment_method,
        }
        for r, km in dispatch.open_requests_for(request.driver)
    ]})
