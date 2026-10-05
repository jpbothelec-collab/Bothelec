"""Matching riders with drivers.

Model: an open request is visible to every approved, online driver of the same
vehicle class within DISPATCH_RADIUS_KM, nearest first. The first driver to
accept wins - acceptance is a single conditional UPDATE so two drivers can
never both get the same ride.
"""
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from accounts.models import DriverProfile

from . import fares
from .geo import bounding_box, haversine_km
from .models import Ride

REQUEST_TIMEOUT = timedelta(minutes=10)


def expire_stale_requests():
    cutoff = timezone.now() - REQUEST_TIMEOUT
    return Ride.objects.filter(status=Ride.REQUESTED, requested_at__lt=cutoff) \
        .update(status=Ride.EXPIRED)


def available_drivers(lat, lng, vehicle_class=None, radius_km=None):
    """Online, approved, idle drivers near a point, nearest first: [(driver, km)]."""
    radius_km = radius_km or settings.DISPATCH_RADIUS_KM
    fresh = timezone.now() - timedelta(seconds=settings.DRIVER_LOCATION_STALE_SECONDS)
    lat_min, lat_max, lng_min, lng_max = bounding_box(lat, lng, radius_km)
    qs = DriverProfile.objects.filter(
        is_approved=True, is_online=True, location_updated_at__gte=fresh,
        lat__range=(lat_min, lat_max), lng__range=(lng_min, lng_max),
    ).exclude(user__rides_as_driver__status__in=Ride.DRIVER_ACTIVE_STATUSES)
    if vehicle_class:
        qs = qs.filter(vehicle_class=vehicle_class)
    result = []
    for d in qs.select_related("user"):
        km = haversine_km(lat, lng, d.lat, d.lng)
        if km <= radius_km:
            result.append((d, km))
    return sorted(result, key=lambda pair: pair[1])


def current_surge(lat, lng, vehicle_class):
    radius = settings.DISPATCH_RADIUS_KM
    lat_min, lat_max, lng_min, lng_max = bounding_box(lat, lng, radius)
    open_requests = Ride.objects.filter(
        status=Ride.REQUESTED, vehicle_class=vehicle_class,
        pickup_lat__range=(lat_min, lat_max), pickup_lng__range=(lng_min, lng_max),
    ).count()
    drivers = len(available_drivers(lat, lng, vehicle_class))
    # +1: the request being quoted right now also counts as demand.
    return fares.surge_multiplier(open_requests + 1, drivers)


def open_requests_for(driver):
    """Requests this driver may accept, nearest pickup first: [(ride, km)]."""
    if not (driver.is_approved and driver.is_online and driver.lat is not None):
        return []
    radius = settings.DISPATCH_RADIUS_KM
    lat_min, lat_max, lng_min, lng_max = bounding_box(driver.lat, driver.lng, radius)
    qs = Ride.objects.filter(
        status=Ride.REQUESTED, vehicle_class=driver.vehicle_class,
        pickup_lat__range=(lat_min, lat_max), pickup_lng__range=(lng_min, lng_max),
        requested_at__gte=timezone.now() - REQUEST_TIMEOUT,
    ).exclude(rider=driver.user)
    result = []
    for ride in qs:
        km = haversine_km(driver.lat, driver.lng, ride.pickup_lat, ride.pickup_lng)
        if km <= radius:
            result.append((ride, km))
    return sorted(result, key=lambda pair: pair[1])


class DispatchError(Exception):
    pass


def accept_ride(driver, ride_id):
    """Atomically assign a requested ride to a driver. Returns the Ride."""
    if not driver.is_approved:
        raise DispatchError("Your account has not been approved yet.")
    if not driver.is_online:
        raise DispatchError("Go online to accept rides.")
    with transaction.atomic():
        if Ride.objects.filter(driver=driver.user, status__in=Ride.DRIVER_ACTIVE_STATUSES).exists():
            raise DispatchError("Finish your current ride first.")
        updated = Ride.objects.filter(
            pk=ride_id, status=Ride.REQUESTED, driver__isnull=True,
            vehicle_class=driver.vehicle_class,
        ).exclude(rider=driver.user).update(
            driver=driver.user, status=Ride.ACCEPTED, accepted_at=timezone.now(),
        )
        if not updated:
            raise DispatchError("This ride is no longer available.")
    return Ride.objects.get(pk=ride_id)


def record_driver_location(driver, lat, lng):
    """Store a GPS ping and add trip distance to any ride in progress."""
    prev = (driver.lat, driver.lng) if driver.lat is not None else None
    driver.set_location(lat, lng)
    if prev is None:
        return
    step = haversine_km(prev[0], prev[1], lat, lng)
    if 0.005 < step < 2.0:  # ignore jitter and impossible GPS jumps
        Ride.objects.filter(driver=driver.user, status=Ride.IN_PROGRESS) \
            .update(actual_distance_km=F("actual_distance_km") + step)
