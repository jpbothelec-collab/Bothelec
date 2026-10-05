"""Small geo helpers - no external services needed."""
import math

EARTH_RADIUS_KM = 6371.0088

# Straight-line distance understates road distance; 1.3 is a common urban factor.
ROAD_FACTOR = 1.3
AVG_CITY_SPEED_KMH = 30.0


def haversine_km(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def estimate_trip(lat1, lng1, lat2, lng2):
    """Return (road_km, minutes) estimate between two points.

    Production: replace with a routing engine (OSRM, Google Routes, Mapbox).
    """
    km = haversine_km(lat1, lng1, lat2, lng2) * ROAD_FACTOR
    minutes = km / AVG_CITY_SPEED_KMH * 60
    return round(km, 2), round(max(minutes, 1.0), 1)


def bounding_box(lat, lng, radius_km):
    """Cheap lat/lng box for pre-filtering DB queries before exact haversine."""
    dlat = radius_km / 111.0
    dlng = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
    return lat - dlat, lat + dlat, lng - dlng, lng + dlng


def valid_coord(lat, lng):
    return -90 <= lat <= 90 and -180 <= lng <= 180
