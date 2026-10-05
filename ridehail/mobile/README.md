# Bothelec mobile apps (rider + driver)

One React Native / Expo (SDK 57) codebase that builds **two store apps**, the same split Uber uses:

| App | Variant | Bundle ID | What it does |
|---|---|---|---|
| **Bothelec Rides** | `APP_VARIANT=rider` | `za.co.bothelec.rides` | Book a ride from your GPS location, live prices per class, track the driver, call them, rate, trip history |
| **Bothelec Driver** | `APP_VARIANT=driver` | `za.co.bothelec.driver` | Go online/offline, background GPS sharing, accept nearby requests, turn-by-turn hand-off to Google/Apple Maps, arrive → start → complete, earnings |

Both talk to the Django backend's token-authenticated API at `/api/v1/` and receive push
notifications (new ride request, driver on the way, driver arrived, trip complete, cancellations).

## Run it

```bash
# 1. Backend (from ridehail/)
python manage.py migrate && python manage.py seed
python manage.py runserver 0.0.0.0:8000

# 2. Apps (from ridehail/mobile/)
npm install
export EXPO_PUBLIC_API_URL=http://<your-computer's-LAN-IP>:8000   # phones can't reach "localhost"
npm run rider      # or: npm run driver
```

`react-native-maps`, background location and push need a **development build** (they aren't in Expo Go):

```bash
npx eas-cli@latest build --profile development-rider --platform android   # or ios / development-driver
```

Install the build on your phone, then `npm run rider` / `npm run driver` and open the project from the dev build.

**Quick try in a browser** (no phone needed; uses Leaflet instead of native maps, no background GPS/push):
`npm run rider:web` and, in another terminal, `npm run driver:web`.

Demo logins (after `seed`): rider `rider` / `demo12345`, driver `thabo` / `demo12345`.
A driver account can't sign in to the rider app and vice versa.

> Switching variants: the `npm run` scripts pass `--clear` because Metro caches the app config and
> would otherwise serve the previous variant's settings.

## Project layout

```
app.config.js        both variants: names, bundle IDs, permissions (background location only in the driver app)
eas.json             build profiles: development-/preview-/production- × rider/driver
src/app/             screens (Expo Router)
  index.tsx          rider → RiderHome, driver → DriverHome
  login.tsx signup.tsx account.tsx history.tsx earnings.tsx
  ride/[id].tsx      live trip screen for both apps
src/screens/         RiderHome (booking), DriverHome (online toggle + requests)
src/components/      Map.tsx (react-native-maps) / Map.web.tsx (Leaflet), ui.tsx
src/lib/
  api.ts             typed API client (token auth)
  auth.tsx           session context; token in SecureStore
  driverLocation.ts  background location task (TaskManager) + foreground fallback
  push.ts            Expo push registration + tap-to-open-ride routing
  geocode.ts         address search (OpenStreetMap Nominatim)
```

## Checks

```bash
npm run typecheck
npm run lint
```

## Before publishing to the stores

1. `npx eas-cli@latest init` for each variant and set `EAS_PROJECT_ID` (push tokens need it).
2. Google Maps keys: `GOOGLE_MAPS_ANDROID_KEY` (required on Android), optionally `GOOGLE_MAPS_IOS_KEY`.
3. Point `EXPO_PUBLIC_API_URL` in `eas.json` at your HTTPS server.
4. Replace the icons/splash in `assets/` with Bothelec branding (one set per app if you like).
5. Swap Nominatim for Google Places / Mapbox search: Nominatim's free tier is ~1 request/second.
6. Apple and Google both review background-location use: the driver app's permission texts in
   `app.config.js` explain why, and Google Play needs a short video of the feature.
7. Build & submit: `eas build --profile production-rider --platform all`, then `eas submit` (repeat for driver).
