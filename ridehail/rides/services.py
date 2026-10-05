"""Ride operations shared by the website and the mobile API.

Every state change goes through here so both channels validate the same way
and trigger the same push notifications.
"""
from django.conf import settings

from . import dispatch, fares, notifications
from .geo import estimate_trip, valid_coord
from .models import InvalidTransition, Ride


class RideError(Exception):
    pass


def parse_point(data, prefix):
    try:
        lat, lng = float(data[f"{prefix}_lat"]), float(data[f"{prefix}_lng"])
    except (KeyError, TypeError, ValueError):
        return None
    return (lat, lng) if valid_coord(lat, lng) else None


def quote(pickup, dropoff):
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
    return {"distance_km": km, "duration_min": minutes,
            "currency": settings.CURRENCY_SYMBOL, "options": options}


def request_ride(rider, data):
    pickup, dropoff = parse_point(data, "pickup"), parse_point(data, "dropoff")
    vehicle_class = data.get("vehicle_class") or "economy"
    payment = data.get("payment_method") or Ride.CASH
    if not pickup or not dropoff:
        raise RideError("Choose a pickup and drop-off.")
    if vehicle_class not in fares.TARIFFS or payment not in dict(Ride.PAYMENT_METHODS):
        raise RideError("Invalid ride option.")
    if Ride.objects.filter(rider=rider, status__in=Ride.ACTIVE_STATUSES).exists():
        raise RideError("You already have an active ride.")
    km, minutes = estimate_trip(*pickup, *dropoff)
    if km < 0.3:
        raise RideError("Pickup and drop-off are too close together.")
    surge = dispatch.current_surge(*pickup, vehicle_class)
    ride = Ride.objects.create(
        rider=rider, vehicle_class=vehicle_class, payment_method=payment,
        pickup_address=(data.get("pickup_address") or "")[:255] or "Pinned location",
        pickup_lat=pickup[0], pickup_lng=pickup[1],
        dropoff_address=(data.get("dropoff_address") or "")[:255] or "Pinned location",
        dropoff_lat=dropoff[0], dropoff_lng=dropoff[1],
        est_distance_km=km, est_duration_min=minutes, surge=surge,
        fare_estimate=fares.calculate_fare(vehicle_class, km, minutes, surge),
    )
    drivers = [d.user for d, _ in dispatch.available_drivers(*pickup, vehicle_class)]
    notifications.notify(drivers, "New ride request",
                         f"R{ride.fare_estimate} · {ride.pickup_address}", ride, kind="ride_request")
    return ride


def accept(driver, ride_id):
    try:
        ride = dispatch.accept_ride(driver, ride_id)
    except dispatch.DispatchError as e:
        raise RideError(str(e)) from e
    notifications.notify([ride.rider], "Driver on the way",
                         f"{driver.user.first_name or driver.user.username} · {driver.vehicle_label}", ride)
    return ride


ADVANCE_MESSAGES = {
    "arrive": ("Your driver has arrived", "Meet your driver at the pickup point."),
    "start": ("Trip started", "Enjoy your ride."),
    "complete": ("Trip complete", None),
}


def advance(ride, action):
    step = {"arrive": ride.mark_arrived, "start": ride.start, "complete": ride.complete}.get(action)
    if step is None:
        raise RideError("Unknown action.")
    try:
        step()
    except InvalidTransition as e:
        raise RideError("That step isn't possible right now.") from e
    title, body = ADVANCE_MESSAGES[action]
    if action == "complete":
        body = f"Fare R{ride.final_fare} ({ride.get_payment_method_display()}). Rate your driver."
    notifications.notify([ride.rider], title, body, ride)
    return ride


def cancel(ride, user):
    by = "driver" if user == ride.driver else "rider"
    try:
        ride.cancel(by=by)
    except InvalidTransition as e:
        raise RideError("This ride can no longer be cancelled.") from e
    other = ride.rider if by == "driver" else ride.driver
    if other:
        notifications.notify([other], "Ride cancelled", f"The {by} cancelled the ride.", ride)
    return ride


def rate(ride, user, stars):
    try:
        stars = int(stars)
    except (TypeError, ValueError):
        stars = 0
    if ride.status != Ride.COMPLETED or not 1 <= stars <= 5:
        raise RideError("Rating not accepted.")
    if user == ride.rider and ride.rating_for_driver is None:
        ride.rating_for_driver = stars
        ride.save(update_fields=["rating_for_driver"])
    elif user == ride.driver and ride.rating_for_rider is None:
        ride.rating_for_rider = stars
        ride.save(update_fields=["rating_for_rider"])
    else:
        raise RideError("Already rated.")
    return ride


def ride_to_dict(ride, viewer):
    data = {
        "id": ride.pk,
        "status": ride.status,
        "status_label": ride.get_status_display(),
        "vehicle_class": ride.vehicle_class,
        "pickup": {"address": ride.pickup_address, "lat": ride.pickup_lat, "lng": ride.pickup_lng},
        "dropoff": {"address": ride.dropoff_address, "lat": ride.dropoff_lat, "lng": ride.dropoff_lng},
        "est_distance_km": ride.est_distance_km,
        "fare_estimate": str(ride.fare_estimate),
        "final_fare": str(ride.final_fare) if ride.final_fare is not None else None,
        "cancellation_fee": str(ride.cancellation_fee),
        "surge": str(ride.surge),
        "payment_method": ride.payment_method,
        "rating_for_driver": ride.rating_for_driver,
        "rating_for_rider": ride.rating_for_rider,
        "requested_at": ride.requested_at.isoformat(),
        "driver": None,
        "rider": None,
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
        data["platform_fee"] = str(ride.platform_fee)
    return data
