from django.conf import settings
from django.db import models
from django.utils import timezone

from . import fares


class InvalidTransition(Exception):
    pass


class Ride(models.Model):
    REQUESTED = "requested"
    ACCEPTED = "accepted"
    ARRIVED = "arrived"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    STATUS = [
        (REQUESTED, "Finding a driver"),
        (ACCEPTED, "Driver on the way"),
        (ARRIVED, "Driver has arrived"),
        (IN_PROGRESS, "On trip"),
        (COMPLETED, "Completed"),
        (CANCELLED, "Cancelled"),
        (EXPIRED, "No drivers available"),
    ]
    ACTIVE_STATUSES = (REQUESTED, ACCEPTED, ARRIVED, IN_PROGRESS)
    DRIVER_ACTIVE_STATUSES = (ACCEPTED, ARRIVED, IN_PROGRESS)

    # status -> statuses it may move to
    TRANSITIONS = {
        REQUESTED: {ACCEPTED, CANCELLED, EXPIRED},
        ACCEPTED: {ARRIVED, CANCELLED},
        ARRIVED: {IN_PROGRESS, CANCELLED},
        IN_PROGRESS: {COMPLETED},
        COMPLETED: set(),
        CANCELLED: set(),
        EXPIRED: set(),
    }

    CASH = "cash"
    CARD = "card"
    PAYMENT_METHODS = [(CASH, "Cash"), (CARD, "Card")]

    rider = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                              related_name="rides_as_rider")
    driver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                               null=True, blank=True, related_name="rides_as_driver")
    vehicle_class = models.CharField(max_length=10, choices=[(k, t.label) for k, t in fares.TARIFFS.items()],
                                     default="economy")
    status = models.CharField(max_length=20, choices=STATUS, default=REQUESTED, db_index=True)

    pickup_address = models.CharField(max_length=255)
    pickup_lat = models.FloatField()
    pickup_lng = models.FloatField()
    dropoff_address = models.CharField(max_length=255)
    dropoff_lat = models.FloatField()
    dropoff_lng = models.FloatField()

    # Quote shown to the rider at request time
    est_distance_km = models.FloatField()
    est_duration_min = models.FloatField()
    surge = models.DecimalField(max_digits=3, decimal_places=1, default=1)
    fare_estimate = models.DecimalField(max_digits=10, decimal_places=2)

    # Measured during the trip from driver GPS pings
    actual_distance_km = models.FloatField(default=0)

    final_fare = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    platform_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    driver_earnings = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=10, choices=PAYMENT_METHODS, default=CASH)
    paid = models.BooleanField(default=False)

    requested_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.CharField(max_length=10, blank=True)
    cancellation_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    rating_for_driver = models.PositiveSmallIntegerField(null=True, blank=True)
    rating_for_rider = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-requested_at"]
        indexes = [models.Index(fields=["status", "vehicle_class"])]

    def __str__(self):
        return f"Ride #{self.pk} {self.pickup_address} → {self.dropoff_address} ({self.status})"

    @property
    def is_active(self):
        return self.status in self.ACTIVE_STATUSES

    @property
    def amount_due(self):
        return self.final_fare if self.final_fare is not None else self.cancellation_fee

    def _move(self, new_status):
        if new_status not in self.TRANSITIONS[self.status]:
            raise InvalidTransition(f"Cannot go from {self.status} to {new_status}")
        self.status = new_status

    def mark_arrived(self):
        self._move(self.ARRIVED)
        self.arrived_at = timezone.now()
        self.save()

    def start(self):
        self._move(self.IN_PROGRESS)
        self.started_at = timezone.now()
        self.save()

    def complete(self):
        self._move(self.COMPLETED)
        self.completed_at = timezone.now()
        minutes = max((self.completed_at - self.started_at).total_seconds() / 60, 1)
        # GPS can drop out; fall back to the quoted distance if we tracked very little.
        km = self.actual_distance_km
        if km < self.est_distance_km * 0.2:
            km = self.est_distance_km
        self.final_fare = fares.calculate_fare(self.vehicle_class, km, minutes, self.surge)
        self.platform_fee, self.driver_earnings = fares.split_fare(self.final_fare)
        self.save()

    def cancel(self, by):
        self._move(self.CANCELLED)
        self.cancelled_at = timezone.now()
        self.cancelled_by = by
        # Rider cancels after the driver already came out -> cancellation fee to driver.
        if by == "rider" and self.arrived_at:
            self.cancellation_fee = fares.CANCELLATION_FEE
            self.platform_fee, self.driver_earnings = fares.split_fare(self.cancellation_fee)
        self.save()

    def expire(self):
        self._move(self.EXPIRED)
        self.save()
