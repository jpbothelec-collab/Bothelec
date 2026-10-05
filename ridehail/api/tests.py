import json
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase, override_settings

from accounts.models import DriverProfile
from rides.models import Ride
from rides.tests import ROSEBANK, SANDTON, make_driver, make_rider

from .models import ApiToken, Device


class ApiClientMixin:
    def call(self, method, url, data=None, token=None):
        kwargs = {"HTTP_AUTHORIZATION": f"Token {token}"} if token else {}
        if method == "get":
            return self.client.get("/api/v1/" + url, data or {}, **kwargs)
        return self.client.post("/api/v1/" + url, json.dumps(data or {}),
                                content_type="application/json", **kwargs)

    def login(self, username, app=None):
        r = self.call("post", "auth/login/", {"username": username, "password": "pass12345", "app": app})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()["token"]


class AuthTests(ApiClientMixin, TestCase):
    def setUp(self):
        make_rider()
        make_driver()

    def test_login_returns_token_and_profile(self):
        r = self.call("post", "auth/login/", {"username": "amara", "password": "pass12345", "app": "rider"})
        self.assertEqual(r.json()["user"]["role"], "rider")
        token = r.json()["token"]
        self.assertEqual(self.call("get", "me/", token=token).json()["username"], "amara")

    def test_token_stored_hashed(self):
        token = self.login("amara")
        self.assertFalse(ApiToken.objects.filter(key_hash=token).exists())
        self.assertIsNotNone(ApiToken.lookup(token))

    def test_wrong_password_and_wrong_app(self):
        r = self.call("post", "auth/login/", {"username": "amara", "password": "nope"})
        self.assertEqual(r.status_code, 401)
        r = self.call("post", "auth/login/", {"username": "amara", "password": "pass12345", "app": "driver"})
        self.assertEqual(r.status_code, 403)

    def test_requires_token(self):
        self.assertEqual(self.call("get", "me/").status_code, 401)
        self.assertEqual(self.call("get", "me/", token="garbage").status_code, 401)

    def test_logout_revokes_token(self):
        token = self.login("amara")
        self.call("post", "auth/logout/", token=token)
        self.assertEqual(self.call("get", "me/", token=token).status_code, 401)

    def test_signup_rider_and_driver(self):
        r = self.call("post", "auth/signup/rider/", {
            "username": "zola", "first_name": "Z", "last_name": "M", "email": "z@example.com",
            "phone": "0821111111", "password1": "s3cretpass!", "password2": "s3cretpass!"})
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["user"]["role"], "rider")
        r = self.call("post", "auth/signup/driver/", {
            "username": "kgosi", "first_name": "K", "last_name": "M", "email": "k@example.com",
            "phone": "0821111112", "password1": "s3cretpass!", "password2": "s3cretpass!",
            "licence_number": "DL7", "vehicle_make": "Kia", "vehicle_model": "Picanto",
            "vehicle_colour": "Blue", "vehicle_plate": "KG 01 GP", "vehicle_class": "economy"})
        self.assertEqual(r.status_code, 201, r.content)
        self.assertFalse(r.json()["user"]["driver"]["is_approved"])

    def test_signup_validation_errors(self):
        r = self.call("post", "auth/signup/rider/", {"username": "x"})
        self.assertEqual(r.status_code, 400)
        self.assertIn("password1", r.json()["fields"])

    def test_role_guard(self):
        token = self.login("amara")
        self.assertEqual(self.call("get", "driver/requests/", token=token).status_code, 403)

    def test_staff_without_profile_does_not_crash(self):
        User.objects.create_superuser("boss", "b@example.com", "pass12345")
        token = self.login("boss")
        self.assertEqual(self.call("get", "rides/active/", token=token).status_code, 200)
        self.assertEqual(self.call("post", "rides/", {}, token=token).status_code, 403)

    def test_cors_preflight(self):
        r = self.client.options("/api/v1/me/")
        self.assertEqual(r["Access-Control-Allow-Origin"], "*")
        self.assertIn("Authorization", r["Access-Control-Allow-Headers"])


class TripFlowTests(ApiClientMixin, TestCase):
    def setUp(self):
        make_rider()
        self.driver = make_driver()
        self.rider_token = self.login("amara", "rider")
        self.driver_token = self.login("thabo", "driver")

    def request_ride(self):
        return self.call("post", "rides/", {
            "pickup_lat": SANDTON[0], "pickup_lng": SANDTON[1], "pickup_address": "Sandton City",
            "dropoff_lat": ROSEBANK[0], "dropoff_lng": ROSEBANK[1], "dropoff_address": "Rosebank",
            "vehicle_class": "economy", "payment_method": "card"}, token=self.rider_token)

    def test_full_trip(self):
        q = self.call("get", "fare-estimate/", {
            "pickup_lat": SANDTON[0], "pickup_lng": SANDTON[1],
            "dropoff_lat": ROSEBANK[0], "dropoff_lng": ROSEBANK[1]}, token=self.rider_token).json()
        self.assertEqual(q["options"][0]["drivers_nearby"], 1)

        r = self.request_ride()
        self.assertEqual(r.status_code, 201, r.content)
        ride_id = r.json()["id"]
        self.assertEqual(self.call("get", "rides/active/", token=self.rider_token).json()["ride"]["id"], ride_id)

        reqs = self.call("get", "driver/requests/", token=self.driver_token).json()["requests"]
        self.assertEqual([x["id"] for x in reqs], [ride_id])
        r = self.call("post", f"driver/rides/{ride_id}/accept/", token=self.driver_token)
        self.assertEqual(r.json()["status"], "accepted")
        self.assertEqual(r.json()["rider"]["name"], "amara")

        rider_view = self.call("get", f"rides/{ride_id}/", token=self.rider_token).json()
        self.assertEqual(rider_view["driver"]["vehicle"], self.driver.vehicle_label)
        self.assertIsNone(rider_view["rider"])  # rider sees no driver-only fields
        self.assertNotIn("driver_earnings", rider_view)

        self.call("post", "driver/location/", {"at_lat": -26.108, "at_lng": 28.057}, token=self.driver_token)
        for action in ("arrive", "start", "complete"):
            r = self.call("post", f"driver/rides/{ride_id}/advance/", {"action": action}, token=self.driver_token)
            self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["status"], "completed")
        self.assertIsNotNone(r.json()["final_fare"])

        self.call("post", f"rides/{ride_id}/rate/", {"stars": 5}, token=self.rider_token)
        r = self.call("post", f"rides/{ride_id}/rate/", {"stars": 5}, token=self.rider_token)
        self.assertEqual(r.status_code, 400)  # can't rate twice

        e = self.call("get", "driver/earnings/", token=self.driver_token).json()
        self.assertEqual(e["today"]["trips"], 1)
        self.assertEqual(len(self.call("get", "rides/", token=self.rider_token).json()["rides"]), 1)

    def test_stranger_cannot_read_ride(self):
        ride_id = self.request_ride().json()["id"]
        make_rider("snoop")
        token = self.login("snoop")
        self.assertEqual(self.call("get", f"rides/{ride_id}/", token=token).status_code, 403)
        self.assertEqual(self.call("post", f"rides/{ride_id}/cancel/", token=token).status_code, 403)

    def test_second_driver_gets_conflict(self):
        ride_id = self.request_ride().json()["id"]
        make_driver("lerato")
        other = self.login("lerato")
        self.call("post", f"driver/rides/{ride_id}/accept/", token=self.driver_token)
        r = self.call("post", f"driver/rides/{ride_id}/accept/", token=other)
        self.assertEqual(r.status_code, 409)

    def test_go_offline_and_unapproved_cannot_go_online(self):
        r = self.call("post", "driver/status/", {"online": False}, token=self.driver_token)
        self.assertFalse(r.json()["driver"]["is_online"])
        DriverProfile.objects.filter(pk=self.driver.pk).update(is_approved=False)
        r = self.call("post", "driver/status/", {"online": True}, token=self.driver_token)
        self.assertEqual(r.status_code, 403)

    def test_rider_cancel(self):
        ride_id = self.request_ride().json()["id"]
        r = self.call("post", f"rides/{ride_id}/cancel/", token=self.rider_token)
        self.assertEqual(r.json()["status"], "cancelled")
        self.assertEqual(Ride.objects.get().cancelled_by, "rider")


@override_settings(PUSH_NOTIFICATIONS_ENABLED=True)
class PushTests(ApiClientMixin, TestCase):
    def setUp(self):
        make_rider()
        make_driver()
        self.rider_token = self.login("amara")
        self.driver_token = self.login("thabo")

    def test_register_device_validates_token(self):
        r = self.call("post", "devices/", {"token": "nonsense"}, token=self.rider_token)
        self.assertEqual(r.status_code, 400)
        r = self.call("post", "devices/", {"token": "ExponentPushToken[abc]", "platform": "ios"},
                      token=self.rider_token)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Device.objects.get().user.username, "amara")

    @mock.patch("rides.notifications.threading.Thread")
    def test_driver_notified_of_request_and_rider_of_accept(self, thread):
        self.call("post", "devices/", {"token": "ExponentPushToken[rider]"}, token=self.rider_token)
        self.call("post", "devices/", {"token": "ExponentPushToken[driver]"}, token=self.driver_token)
        ride_id = self.call("post", "rides/", {
            "pickup_lat": SANDTON[0], "pickup_lng": SANDTON[1],
            "dropoff_lat": ROSEBANK[0], "dropoff_lng": ROSEBANK[1]}, token=self.rider_token).json()["id"]
        sent = thread.call_args.kwargs["args"][0]
        self.assertEqual([m["to"] for m in sent], ["ExponentPushToken[driver]"])
        self.assertEqual(sent[0]["data"], {"kind": "ride_request", "ride_id": ride_id})

        self.call("post", f"driver/rides/{ride_id}/accept/", token=self.driver_token)
        sent = thread.call_args.kwargs["args"][0]
        self.assertEqual([m["to"] for m in sent], ["ExponentPushToken[rider]"])
        self.assertEqual(sent[0]["title"], "Driver on the way")

    @mock.patch("rides.notifications.threading.Thread")
    def test_no_devices_no_push(self, thread):
        self.call("post", "rides/", {
            "pickup_lat": SANDTON[0], "pickup_lng": SANDTON[1],
            "dropoff_lat": ROSEBANK[0], "dropoff_lng": ROSEBANK[1]}, token=self.rider_token)
        thread.assert_not_called()
