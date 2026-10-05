from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from accounts.models import DriverProfile, Profile

from . import dispatch, fares
from .geo import estimate_trip, haversine_km
from .models import InvalidTransition, Ride

SANDTON = (-26.1076, 28.0567)
ROSEBANK = (-26.1452, 28.0436)


def make_rider(username="amara"):
    u = User.objects.create_user(username, password="pass12345")
    Profile.objects.create(user=u, role=Profile.RIDER, phone="0820000000")
    return u


def make_driver(username="thabo", at=SANDTON, cls="economy", approved=True, online=True):
    u = User.objects.create_user(username, password="pass12345")
    Profile.objects.create(user=u, role=Profile.DRIVER, phone="0830000000")
    return DriverProfile.objects.create(
        user=u, licence_number="DL1", vehicle_make="Toyota", vehicle_model="Corolla",
        vehicle_colour="White", vehicle_plate=f"{username.upper()}GP", vehicle_class=cls,
        is_approved=approved, is_online=online, lat=at[0], lng=at[1],
        location_updated_at=timezone.now())


def make_ride(rider, cls="economy"):
    km, mins = estimate_trip(*SANDTON, *ROSEBANK)
    return Ride.objects.create(
        rider=rider, vehicle_class=cls, pickup_address="Sandton", pickup_lat=SANDTON[0],
        pickup_lng=SANDTON[1], dropoff_address="Rosebank", dropoff_lat=ROSEBANK[0],
        dropoff_lng=ROSEBANK[1], est_distance_km=km, est_duration_min=mins,
        fare_estimate=fares.calculate_fare(cls, km, mins))


class GeoAndFareTests(TestCase):
    def test_haversine_known_distance(self):
        # Sandton to Rosebank is roughly 4.4 km as the crow flies.
        self.assertAlmostEqual(haversine_km(*SANDTON, *ROSEBANK), 4.4, delta=0.2)

    def test_fare_formula(self):
        # (10 + 7.5*10 + 0.9*20) * 1 + 3 = 106.00
        self.assertEqual(fares.calculate_fare("economy", 10, 20), Decimal("106.00"))

    def test_fare_minimum(self):
        self.assertEqual(fares.calculate_fare("economy", 0.5, 1), Decimal("30.00"))

    def test_surge_applies_to_variable_part_only(self):
        # (10 + 75 + 18) * 1.5 + 3 = 157.50
        self.assertEqual(fares.calculate_fare("economy", 10, 20, Decimal("1.5")), Decimal("157.50"))

    def test_surge_multiplier(self):
        self.assertEqual(fares.surge_multiplier(2, 5), Decimal("1.0"))
        self.assertEqual(fares.surge_multiplier(4, 2), Decimal("1.3"))  # ratio 2 -> 1.25 -> 1.3
        self.assertEqual(fares.surge_multiplier(100, 1), fares.MAX_SURGE)
        self.assertEqual(fares.surge_multiplier(3, 0), Decimal("1.5"))

    def test_commission_split(self):
        fee, earn = fares.split_fare(Decimal("100.00"))
        self.assertEqual((fee, earn), (Decimal("20.00"), Decimal("80.00")))


class DispatchTests(TestCase):
    def setUp(self):
        self.rider = make_rider()
        self.driver = make_driver()

    def test_nearby_driver_sees_request(self):
        ride = make_ride(self.rider)
        self.assertEqual([r.pk for r, _ in dispatch.open_requests_for(self.driver)], [ride.pk])

    def test_far_driver_does_not_see_request(self):
        far = make_driver("far", at=(-33.9249, 18.4241))  # Cape Town
        make_ride(self.rider)
        self.assertEqual(dispatch.open_requests_for(far), [])

    def test_other_vehicle_class_not_offered(self):
        make_ride(self.rider, cls="xl")
        self.assertEqual(dispatch.open_requests_for(self.driver), [])

    def test_offline_or_unapproved_driver_sees_nothing(self):
        make_ride(self.rider)
        self.assertEqual(dispatch.open_requests_for(make_driver("off", online=False)), [])
        self.assertEqual(dispatch.open_requests_for(make_driver("new", approved=False)), [])

    def test_only_first_driver_wins(self):
        ride = make_ride(self.rider)
        second = make_driver("lerato")
        dispatch.accept_ride(self.driver, ride.pk)
        with self.assertRaises(dispatch.DispatchError):
            dispatch.accept_ride(second, ride.pk)
        ride.refresh_from_db()
        self.assertEqual((ride.driver, ride.status), (self.driver.user, Ride.ACCEPTED))

    def test_driver_cannot_take_two_rides(self):
        r1, r2 = make_ride(self.rider), make_ride(make_rider("bongi"))
        dispatch.accept_ride(self.driver, r1.pk)
        with self.assertRaises(dispatch.DispatchError):
            dispatch.accept_ride(self.driver, r2.pk)

    def test_busy_driver_not_available(self):
        dispatch.accept_ride(self.driver, make_ride(self.rider).pk)
        self.assertEqual(dispatch.available_drivers(*SANDTON), [])

    def test_stale_location_not_available(self):
        self.driver.location_updated_at = timezone.now() - timedelta(minutes=10)
        self.driver.save()
        self.assertEqual(dispatch.available_drivers(*SANDTON), [])

    def test_stale_requests_expire(self):
        ride = make_ride(self.rider)
        Ride.objects.filter(pk=ride.pk).update(requested_at=timezone.now() - timedelta(minutes=11))
        dispatch.expire_stale_requests()
        ride.refresh_from_db()
        self.assertEqual(ride.status, Ride.EXPIRED)

    def test_gps_pings_accumulate_trip_distance(self):
        ride = make_ride(self.rider)
        dispatch.accept_ride(self.driver, ride.pk)
        ride.refresh_from_db()
        ride.mark_arrived()
        ride.start()
        dispatch.record_driver_location(self.driver, -26.1176, 28.0567)  # ~1.1 km south
        dispatch.record_driver_location(self.driver, -26.1176, 28.0567)  # no movement
        dispatch.record_driver_location(self.driver, -27.0, 28.0)        # impossible jump, ignored
        ride.refresh_from_db()
        self.assertAlmostEqual(ride.actual_distance_km, 1.11, delta=0.05)


class LifecycleTests(TestCase):
    def setUp(self):
        self.rider = make_rider()
        self.driver = make_driver()
        self.ride = make_ride(self.rider)

    def test_full_trip(self):
        ride = dispatch.accept_ride(self.driver, self.ride.pk)
        ride.mark_arrived()
        ride.start()
        ride.actual_distance_km = 6.0
        ride.started_at = timezone.now() - timedelta(minutes=12)
        ride.complete()
        self.assertEqual(ride.status, Ride.COMPLETED)
        # (10 + 7.5*6 + 0.9*12) + 3 = 68.80
        self.assertAlmostEqual(ride.final_fare, Decimal("68.80"), delta=Decimal("0.05"))
        self.assertEqual(ride.platform_fee + ride.driver_earnings, ride.final_fare)

    def test_missing_gps_falls_back_to_estimate(self):
        ride = dispatch.accept_ride(self.driver, self.ride.pk)
        ride.mark_arrived()
        ride.start()
        ride.complete()
        expected = fares.calculate_fare("economy", ride.est_distance_km, 1)
        self.assertEqual(ride.final_fare, expected)

    def test_cannot_skip_steps(self):
        with self.assertRaises(InvalidTransition):
            self.ride.start()
        with self.assertRaises(InvalidTransition):
            self.ride.complete()

    def test_free_cancel_before_arrival(self):
        self.ride.cancel(by="rider")
        self.assertEqual((self.ride.status, self.ride.cancellation_fee), (Ride.CANCELLED, 0))

    def test_cancel_after_arrival_costs_rider(self):
        ride = dispatch.accept_ride(self.driver, self.ride.pk)
        ride.mark_arrived()
        ride.cancel(by="rider")
        self.assertEqual(ride.cancellation_fee, fares.CANCELLATION_FEE)
        self.assertEqual(ride.driver_earnings, Decimal("20.00"))

    def test_cannot_cancel_in_progress(self):
        ride = dispatch.accept_ride(self.driver, self.ride.pk)
        ride.mark_arrived()
        ride.start()
        with self.assertRaises(InvalidTransition):
            ride.cancel(by="rider")


class ViewTests(TestCase):
    def setUp(self):
        self.rider = make_rider()
        self.driver = make_driver()

    def test_rider_requests_ride_and_driver_completes_it(self):
        self.client.login(username="amara", password="pass12345")
        r = self.client.post(reverse("request_ride"), {
            "pickup_lat": SANDTON[0], "pickup_lng": SANDTON[1], "pickup_address": "Sandton City",
            "dropoff_lat": ROSEBANK[0], "dropoff_lng": ROSEBANK[1], "dropoff_address": "Rosebank Mall",
            "vehicle_class": "economy", "payment_method": "cash"})
        ride = Ride.objects.get()
        self.assertRedirects(r, reverse("ride_detail", args=[ride.pk]))
        self.assertEqual(self.client.get(reverse("ride_detail", args=[ride.pk])).status_code, 200)

        self.client.login(username="thabo", password="pass12345")
        reqs = self.client.get(reverse("api_driver_requests")).json()["requests"]
        self.assertEqual(reqs[0]["id"], ride.pk)
        self.client.post(reverse("driver_accept", args=[ride.pk]))
        for action in ("arrive", "start", "complete"):
            self.client.post(reverse("driver_advance", args=[ride.pk]), {"action": action})
        ride.refresh_from_db()
        self.assertEqual(ride.status, Ride.COMPLETED)

        self.client.post(reverse("ride_rate", args=[ride.pk]), {"stars": 5})
        self.client.login(username="amara", password="pass12345")
        self.client.post(reverse("ride_rate", args=[ride.pk]), {"stars": 4})
        ride.refresh_from_db()
        self.assertEqual((ride.rating_for_rider, ride.rating_for_driver), (5, 4))
        self.assertEqual(self.driver.rating, 4)

    def test_rider_cannot_double_book(self):
        make_ride(self.rider)
        self.client.login(username="amara", password="pass12345")
        self.client.post(reverse("request_ride"), {
            "pickup_lat": SANDTON[0], "pickup_lng": SANDTON[1],
            "dropoff_lat": ROSEBANK[0], "dropoff_lng": ROSEBANK[1], "vehicle_class": "economy"})
        self.assertEqual(Ride.objects.count(), 1)

    def test_strangers_cannot_see_ride(self):
        ride = make_ride(self.rider)
        make_rider("snoop")
        self.client.login(username="snoop", password="pass12345")
        self.assertEqual(self.client.get(reverse("ride_detail", args=[ride.pk])).status_code, 403)
        self.assertEqual(self.client.get(reverse("api_ride_status", args=[ride.pk])).status_code, 403)

    def test_role_guards(self):
        self.client.login(username="amara", password="pass12345")
        self.assertEqual(self.client.get(reverse("driver_dashboard")).status_code, 403)
        self.client.login(username="thabo", password="pass12345")
        self.assertEqual(self.client.get(reverse("rider_home")).status_code, 403)

    def test_fare_estimate_api(self):
        self.client.login(username="amara", password="pass12345")
        r = self.client.get(reverse("api_fare_estimate"), {
            "pickup_lat": SANDTON[0], "pickup_lng": SANDTON[1],
            "dropoff_lat": ROSEBANK[0], "dropoff_lng": ROSEBANK[1]}).json()
        self.assertEqual([o["vehicle_class"] for o in r["options"]], ["economy", "comfort", "xl"])
        self.assertEqual(r["options"][0]["drivers_nearby"], 1)

    def test_signup_pages(self):
        r = self.client.post(reverse("signup_driver"), {
            "username": "newdriver", "first_name": "N", "last_name": "D", "email": "n@example.com",
            "phone": "0821234567", "password1": "s3cretpass!", "password2": "s3cretpass!",
            "licence_number": "DL9", "vehicle_make": "Kia", "vehicle_model": "Rio",
            "vehicle_colour": "Blue", "vehicle_plate": "ab 12 cd gp", "vehicle_class": "economy"})
        self.assertRedirects(r, reverse("home"), target_status_code=302)
        d = DriverProfile.objects.get(user__username="newdriver")
        self.assertEqual((d.vehicle_plate, d.is_approved), ("AB12CDGP", False))

    def test_pages_render(self):
        self.assertEqual(self.client.get(reverse("home")).status_code, 200)
        self.client.login(username="amara", password="pass12345")
        for name in ("rider_home", "ride_history"):
            self.assertEqual(self.client.get(reverse(name)).status_code, 200)
        self.client.login(username="thabo", password="pass12345")
        for name in ("driver_dashboard", "driver_earnings", "ride_history"):
            self.assertEqual(self.client.get(reverse(name)).status_code, 200)
        User.objects.create_superuser("boss", "b@example.com", "pass12345")
        self.client.login(username="boss", password="pass12345")
        self.assertEqual(self.client.get(reverse("ops_dashboard")).status_code, 200)
