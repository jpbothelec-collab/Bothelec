# ridehail — Uber-style ride-hailing platform (prototype)

A working Django prototype of an e-hailing service: riders request a car, nearby drivers
get the request, the first to accept is matched, the rider tracks the car live, and the
fare is calculated from the actual trip with a platform commission.

## Quick start

```bash
cd ridehail
pip install -r requirements.txt
python manage.py migrate
python manage.py seed               # admin + demo rider + 5 drivers around Sandton
python manage.py runserver
python manage.py simulate_drivers   # optional, in a 2nd terminal: keeps demo cars online & moving
```

Open two browsers (or one normal + one private window):

| Who | Login | Where |
|---|---|---|
| Rider | `rider` / `demo12345` | `/ride/` – tap map for drop-off, pick a class, request |
| Driver | `thabo` / `demo12345` | `/drive/` – go online, accept, arrive → start → complete |
| Ops / admin | `admin` / `admin12345` | `/ops/` live dashboard, `/admin/` approve drivers, refunds etc. |

Run the tests: `python manage.py test` (29 tests: fares, dispatch, race on accept, lifecycle, permissions, views).

## What's in it

| Feature | Where |
|---|---|
| Rider & driver sign-up, driver document capture (licence, PrDP, operating licence, vehicle) | `accounts/` |
| Staff approval before a driver can go online | admin action + `/ops/` |
| Map booking (Leaflet + OpenStreetMap), address search, "use my location" | `templates/rider/home.html` |
| Upfront quotes for Economy / Comfort / XL with ETA & nearby cars | `api/fare-estimate/`, `api/nearby-drivers/` |
| Surge pricing from local demand vs. supply (max 2.5×) | `rides/fares.py` |
| Dispatch: nearest online drivers of the right class within 8 km; atomic first-accept-wins | `rides/dispatch.py` |
| Trip state machine: requested → accepted → arrived → in progress → completed (+ cancelled / expired) | `rides/models.py` |
| Live driver location (GPS pings, 4 s polling), trip distance measured from GPS | `api/driver/location/` |
| Final fare from measured km + minutes, 20 % platform commission, driver earnings | `Ride.complete()` |
| Cancellation fee (R25) if rider cancels after driver arrives | `Ride.cancel()` |
| Two-way ratings, trip history, driver earnings page, ops dashboard | views/templates |

### Fare formula

```
fare = (base + per_km × km + per_min × minutes) × surge + booking_fee,  at least the minimum
```

| Class | Base | /km | /min | Booking | Minimum |
|---|---|---|---|---|---|
| Economy | R10 | R7.50 | R0.90 | R3 | R30 |
| Comfort | R15 | R10.00 | R1.20 | R3 | R45 |
| XL | R20 | R13.00 | R1.50 | R3 | R60 |

Edit `TARIFFS` in `rides/fares.py`; commission and dispatch radius are in `settings.py`.

## Road to production

The prototype deliberately avoids paid services. To launch for real:

1. **Mobile apps** – rider & driver apps (React Native / Flutter) on top of the JSON API; drivers need
   background GPS which browsers can't do reliably.
2. **Real-time** – replace polling with WebSockets (Django Channels + Redis) and push notifications (FCM/APNs).
3. **Routing & geocoding** – OSRM / Google Routes / Mapbox for real road distance, ETAs and turn-by-turn;
   PostGIS for spatial queries at scale.
4. **Payments** – card tokenisation & in-app charging (PayFast / Peach Payments / Stripe), driver weekly
   payouts, cash-commission reconciliation.
5. **Safety** – SOS button, share-my-trip link, PIN verification at pickup, driver selfie checks,
   background checks, insurance.
6. **Compliance (South Africa)** – the National Land Transport Amendment Act requires e-hailing **operating
   licences** for vehicles and registration of the platform; also POPIA (location data), PrDP for drivers,
   vehicle roadworthy certificates, and VAT on commission.
7. **Ops** – fraud detection, support ticketing, promo codes, driver incentives, analytics.
