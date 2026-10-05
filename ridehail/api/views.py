"""JSON API for the rider and driver mobile apps (token auth, no cookies/CSRF)."""
import json
from decimal import Decimal
from functools import wraps

from django.contrib.auth import authenticate
from django.db.models import Count, Sum
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from accounts.forms import DriverSignupForm, RiderSignupForm
from rides import dispatch, services
from rides.models import Ride

from .models import ApiToken, Device


def error(message, status=400, **extra):
    return JsonResponse({"error": message, **extra}, status=status)


def body(request):
    if request.content_type == "application/json":
        try:
            data = json.loads(request.body or b"{}")
        except ValueError:
            return {}
        return data if isinstance(data, dict) else {}
    return request.POST


def api_view(role=None):
    """Authenticate the bearer token and optionally require a role."""
    def decorator(view):
        @csrf_exempt
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            header = request.headers.get("Authorization", "")
            token = ApiToken.lookup(header[6:].strip()) if header.startswith("Token ") else None
            if token is None or not token.user.is_active:
                return error("Not authenticated.", 401)
            request.user, request.api_token = token.user, token
            if token.last_used_at is None or (timezone.now() - token.last_used_at).total_seconds() > 300:
                ApiToken.objects.filter(pk=token.pk).update(last_used_at=timezone.now())
            if role and _role(request.user) != role:
                return error(f"This endpoint is for {role}s.", 403)
            if role == "driver":
                if not hasattr(request.user, "driver"):
                    return error("No driver profile.", 403)
                request.driver = request.user.driver
            return view(request, *args, **kwargs)
        return wrapper
    return decorator


def me_dict(user):
    profile = getattr(user, "profile", None)
    data = {"id": user.pk, "username": user.username, "first_name": user.first_name,
            "last_name": user.last_name, "email": user.email,
            "role": profile.role if profile else None, "phone": profile.phone if profile else "",
            "driver": None}
    if hasattr(user, "driver"):
        d = user.driver
        data["driver"] = {"vehicle": d.vehicle_label, "vehicle_class": d.vehicle_class,
                          "is_approved": d.is_approved, "is_online": d.is_online, "rating": d.rating,
                          "lat": d.lat, "lng": d.lng}
    return data


def _role(user):
    profile = getattr(user, "profile", None)
    return profile.role if profile else None


def _ride_for(request, pk):
    ride = get_object_or_404(Ride.objects.select_related("rider", "driver"), pk=pk)
    return ride if request.user in (ride.rider, ride.driver) else None


# ---------------------------------------------------------------- auth

@csrf_exempt
@require_POST
def login(request):
    data = body(request)
    user = authenticate(request, username=data.get("username", ""), password=data.get("password", ""))
    if user is None:
        return error("Wrong username or password.", 401)
    expected = data.get("app")  # "rider" / "driver": stop people logging into the wrong app
    profile = getattr(user, "profile", None)
    if expected and (profile is None or profile.role != expected):
        return error(f"This account can't sign in to the {expected} app.", 403)
    return JsonResponse({"token": ApiToken.issue(user), "user": me_dict(user)})


def _signup(request, form_class):
    form = form_class(body(request))
    if not form.is_valid():
        return error("Please fix the highlighted fields.", 400,
                     fields={k: [str(m) for m in v] for k, v in form.errors.items()})
    user = form.save()
    return JsonResponse({"token": ApiToken.issue(user), "user": me_dict(user)}, status=201)


@csrf_exempt
@require_POST
def signup_rider(request):
    return _signup(request, RiderSignupForm)


@csrf_exempt
@require_POST
def signup_driver(request):
    return _signup(request, DriverSignupForm)


@api_view()
@require_POST
def logout(request):
    Device.objects.filter(user=request.user, token=body(request).get("push_token", "")).delete()
    request.api_token.delete()
    return JsonResponse({"ok": True})


@api_view()
@require_GET
def me(request):
    return JsonResponse(me_dict(request.user))


@api_view()
@require_POST
def register_device(request):
    data = body(request)
    token = (data.get("token") or "").strip()
    if not token.startswith(("ExponentPushToken[", "ExpoPushToken[")):
        return error("Invalid push token.")
    Device.objects.update_or_create(token=token, defaults={
        "user": request.user, "platform": (data.get("platform") or "")[:10]})
    return JsonResponse({"ok": True})


# ---------------------------------------------------------------- shared

@api_view()
@require_GET
def fare_estimate(request):
    pickup = services.parse_point(request.GET, "pickup")
    dropoff = services.parse_point(request.GET, "dropoff")
    if not pickup or not dropoff:
        return error("pickup and dropoff required")
    return JsonResponse(services.quote(pickup, dropoff))


@api_view()
@require_GET
def nearby_drivers(request):
    point = services.parse_point(request.GET, "at")
    if not point:
        return error("at_lat and at_lng required")
    return JsonResponse({"drivers": [
        {"lat": round(d.lat, 3), "lng": round(d.lng, 3), "vehicle_class": d.vehicle_class}
        for d, _ in dispatch.available_drivers(*point)[:20]
    ]})


@api_view()
def rides(request):
    """GET: trip history. POST (riders): request a ride."""
    if request.method == "POST":
        if _role(request.user) != "rider":
            return error("Only riders can request rides.", 403)
        try:
            ride = services.request_ride(request.user, body(request))
        except services.RideError as e:
            return error(str(e))
        return JsonResponse(services.ride_to_dict(ride, request.user), status=201)
    field = "driver" if _role(request.user) == "driver" else "rider"
    qs = Ride.objects.filter(**{field: request.user}).select_related("rider", "driver")[:50]
    return JsonResponse({"rides": [services.ride_to_dict(r, request.user) for r in qs]})


@api_view()
@require_GET
def active_ride(request):
    dispatch.expire_stale_requests()
    if _role(request.user) == "driver":
        ride = Ride.objects.filter(driver=request.user, status__in=Ride.DRIVER_ACTIVE_STATUSES).first()
    else:
        ride = Ride.objects.filter(rider=request.user, status__in=Ride.ACTIVE_STATUSES).first()
    return JsonResponse({"ride": services.ride_to_dict(ride, request.user) if ride else None})


@api_view()
@require_GET
def ride_detail(request, pk):
    ride = _ride_for(request, pk)
    if ride is None:
        return error("Not your ride.", 403)
    if ride.status == Ride.REQUESTED:
        dispatch.expire_stale_requests()
        ride.refresh_from_db()
    return JsonResponse(services.ride_to_dict(ride, request.user))


@api_view()
@require_POST
def ride_cancel(request, pk):
    ride = _ride_for(request, pk)
    if ride is None:
        return error("Not your ride.", 403)
    try:
        services.cancel(ride, request.user)
    except services.RideError as e:
        return error(str(e))
    return JsonResponse(services.ride_to_dict(ride, request.user))


@api_view()
@require_POST
def ride_rate(request, pk):
    ride = _ride_for(request, pk)
    if ride is None:
        return error("Not your ride.", 403)
    try:
        services.rate(ride, request.user, body(request).get("stars"))
    except services.RideError as e:
        return error(str(e))
    return JsonResponse(services.ride_to_dict(ride, request.user))


# ---------------------------------------------------------------- driver

@api_view("driver")
@require_POST
def driver_status(request):
    d = request.driver
    online = body(request).get("online")
    if online and not d.is_approved:
        return error("Your documents are still being reviewed.", 403)
    d.is_online = bool(online)
    d.save(update_fields=["is_online"])
    return JsonResponse(me_dict(request.user))


@api_view("driver")
@require_POST
def driver_location(request):
    point = services.parse_point(body(request), "at")
    if not point:
        return error("at_lat and at_lng required")
    dispatch.record_driver_location(request.driver, *point)
    return JsonResponse({"ok": True})


@api_view("driver")
@require_GET
def driver_requests(request):
    dispatch.expire_stale_requests()
    request.driver.refresh_from_db()
    return JsonResponse({"online": request.driver.is_online, "requests": [
        {"id": r.pk, "pickup": r.pickup_address, "dropoff": r.dropoff_address,
         "pickup_lat": r.pickup_lat, "pickup_lng": r.pickup_lng,
         "km_away": round(km, 1), "trip_km": r.est_distance_km,
         "fare": str(r.fare_estimate), "surge": str(r.surge), "payment": r.payment_method}
        for r, km in dispatch.open_requests_for(request.driver)
    ]})


@api_view("driver")
@require_POST
def driver_accept(request, pk):
    try:
        ride = services.accept(request.driver, pk)
    except services.RideError as e:
        return error(str(e), 409)
    return JsonResponse(services.ride_to_dict(ride, request.user))


@api_view("driver")
@require_POST
def driver_advance(request, pk):
    ride = Ride.objects.filter(pk=pk, driver=request.user).first()
    if ride is None:
        return error("Not your ride.", 403)
    try:
        services.advance(ride, body(request).get("action"))
    except services.RideError as e:
        return error(str(e))
    return JsonResponse(services.ride_to_dict(ride, request.user))


@api_view("driver")
@require_GET
def driver_earnings(request):
    done = Ride.objects.filter(driver=request.user, status__in=[Ride.COMPLETED, Ride.CANCELLED]) \
        .exclude(driver_earnings=0)
    today = done.filter(completed_at__date=timezone.localdate())
    agg = dict(fares=Sum("final_fare"), fees=Sum("platform_fee"), earnings=Sum("driver_earnings"),
               trips=Count("id"))

    def money(totals):
        return {k: (v if k == "trips" else str(v or Decimal("0.00"))) for k, v in totals.items()}

    return JsonResponse({
        "today": money(today.aggregate(**agg)), "all_time": money(done.aggregate(**agg)),
        "rides": [services.ride_to_dict(r, request.user) for r in done.select_related("rider", "driver")[:50]],
    })
