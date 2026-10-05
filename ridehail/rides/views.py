from decimal import Decimal
from functools import wraps

from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Sum
from django.http import HttpResponseForbidden, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from . import dispatch, fares
from .geo import estimate_trip, valid_coord
from .models import InvalidTransition, Ride


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


def _coords(data, prefix):
    try:
        lat, lng = float(data[f"{prefix}_lat"]), float(data[f"{prefix}_lng"])
    except (KeyError, TypeError, ValueError):
        return None
    return (lat, lng) if valid_coord(lat, lng) else None


def _ride_for_user(request, pk):
    ride = get_object_or_404(Ride, pk=pk)
    if request.user not in (ride.rider, ride.driver) and not request.user.is_staff:
        return None
    return ride


def _ride_json(ride, viewer):
    data = {
        "id": ride.pk,
        "status": ride.status,
        "status_label": ride.get_status_display(),
        "vehicle_class": ride.vehicle_class,
        "pickup": {"address": ride.pickup_address, "lat": ride.pickup_lat, "lng": ride.pickup_lng},
        "dropoff": {"address": ride.dropoff_address, "lat": ride.dropoff_lat, "lng": ride.dropoff_lng},
        "fare_estimate": str(ride.fare_estimate),
        "final_fare": str(ride.final_fare) if ride.final_fare is not None else None,
        "cancellation_fee": str(ride.cancellation_fee),
        "surge": str(ride.surge),
        "payment_method": ride.payment_method,
        "rating_for_driver": ride.rating_for_driver,
        "rating_for_rider": ride.rating_for_rider,
    }
    if ride.driver_id and hasattr(ride.driver, "driver"):
        d = ride.driver.driver
        data["driver"] = {
            "name": ride.driver.first_name or ride.driver.username,
            "phone": ride.driver.profile.phone if ride.is_active else "",
            "vehicle": d.vehicle_label,
            "rating": d.rating,
            # Only share live location while the driver is heading to / with the rider.
            "lat": d.lat if ride.is_active else None,
            "lng": d.lng if ride.is_active else None,
        }
    if viewer == ride.driver:
        data["rider"] = {
            "name": ride.rider.first_name or ride.rider.username,
            "phone": ride.rider.profile.phone if ride.is_active else "",
        }
        data["driver_earnings"] = str(ride.driver_earnings)
    return data


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
    pickup, dropoff = _coords(request.POST, "pickup"), _coords(request.POST, "dropoff")
    vehicle_class = request.POST.get("vehicle_class", "economy")
    payment = request.POST.get("payment_method", Ride.CASH)
    if not pickup or not dropoff:
        messages.error(request, "Choose a pickup and drop-off on the map.")
        return redirect("rider_home")
    if vehicle_class not in fares.TARIFFS or payment not in dict(Ride.PAYMENT_METHODS):
        messages.error(request, "Invalid ride option.")
        return redirect("rider_home")
    if Ride.objects.filter(rider=request.user, status__in=Ride.ACTIVE_STATUSES).exists():
        messages.error(request, "You already have an active ride.")
        return redirect("rider_home")

    km, minutes = estimate_trip(*pickup, *dropoff)
    if km < 0.3:
        messages.error(request, "Pickup and drop-off are too close together.")
        return redirect("rider_home")
    surge = dispatch.current_surge(*pickup, vehicle_class)
    ride = Ride.objects.create(
        rider=request.user, vehicle_class=vehicle_class, payment_method=payment,
        pickup_address=request.POST.get("pickup_address", "")[:255] or "Pinned location",
        pickup_lat=pickup[0], pickup_lng=pickup[1],
        dropoff_address=request.POST.get("dropoff_address", "")[:255] or "Pinned location",
        dropoff_lat=dropoff[0], dropoff_lng=dropoff[1],
        est_distance_km=km, est_duration_min=minutes, surge=surge,
        fare_estimate=fares.calculate_fare(vehicle_class, km, minutes, surge),
    )
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
    by = "driver" if request.user == ride.driver else "rider"
    try:
        ride.cancel(by=by)
        messages.info(request, "Ride cancelled.")
    except InvalidTransition:
        messages.error(request, "This ride can no longer be cancelled.")
    if by == "driver":
        return redirect("driver_dashboard")
    return redirect("ride_detail", pk=pk)


@login_required
@require_POST
def ride_rate(request, pk):
    ride = _ride_for_user(request, pk)
    if ride is None:
        return HttpResponseForbidden()
    try:
        stars = int(request.POST["stars"])
    except (KeyError, ValueError):
        stars = 0
    if ride.status != Ride.COMPLETED or not 1 <= stars <= 5:
        messages.error(request, "Rating not accepted.")
    elif request.user == ride.rider and ride.rating_for_driver is None:
        ride.rating_for_driver = stars
        ride.save(update_fields=["rating_for_driver"])
        messages.success(request, "Thanks for rating your driver.")
    elif request.user == ride.driver and ride.rating_for_rider is None:
        ride.rating_for_rider = stars
        ride.save(update_fields=["rating_for_rider"])
        messages.success(request, "Thanks for rating your rider.")
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
        dispatch.accept_ride(request.driver, pk)
    except dispatch.DispatchError as e:
        messages.error(request, str(e))
        return redirect("driver_dashboard")
    return redirect("ride_detail", pk=pk)


@driver_required
@require_POST
def driver_advance(request, pk):
    ride = get_object_or_404(Ride, pk=pk, driver=request.user)
    action = request.POST.get("action")
    try:
        {"arrive": ride.mark_arrived, "start": ride.start, "complete": ride.complete}[action]()
    except (KeyError, InvalidTransition):
        messages.error(request, "That step isn't possible right now.")
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
    pickup, dropoff = _coords(request.GET, "pickup"), _coords(request.GET, "dropoff")
    if not pickup or not dropoff:
        return JsonResponse({"error": "pickup and dropoff required"}, status=400)
    km, minutes = estimate_trip(*pickup, *dropoff)
    options = []
    for key, t in fares.TARIFFS.items():
        surge = dispatch.current_surge(*pickup, key)
        nearby = dispatch.available_drivers(*pickup, key)
        eta = round(nearby[0][1] / 30 * 60 + 1) if nearby else None
        options.append({
            "vehicle_class": key, "label": t.label, "seats": t.seats,
            "fare": str(fares.calculate_fare(key, km, minutes, surge)),
            "surge": str(surge), "eta_min": eta, "drivers_nearby": len(nearby),
        })
    return JsonResponse({"distance_km": km, "duration_min": minutes,
                         "currency": settings.CURRENCY_SYMBOL, "options": options})


@login_required
def api_nearby_drivers(request):
    point = _coords(request.GET, "at")
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
    return JsonResponse(_ride_json(ride, request.user))


@driver_required
@require_POST
def api_driver_location(request):
    point = _coords(request.POST, "at")
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
