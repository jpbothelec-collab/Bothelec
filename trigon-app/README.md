# Trigon Air — Operations, Service & Building Monitoring (web + mobile)

A mobile-friendly, installable web app (PWA) built from the Trigon Air product walkthrough video.
It brings together **client service requests**, **technicians** and the **building plant (BMS)**
in one place, "so nothing gets lost between the call and the fix".

No build step or dependencies: plain HTML, CSS and JavaScript.

## Run it

```bash
cd trigon-app
python3 -m http.server 8080
```

Open http://localhost:8080. On a phone, open it on the same network (or host it, see below) and use
**Add to Home Screen** to install it as an app.

### Host it
Upload the `trigon-app/` folder to any static host: GitHub Pages, Netlify, Vercel, S3 or cPanel.
It must be served over HTTPS for install and offline support.

## What's in it (mapped to the video)

| Module | Screens |
|---|---|
| **Dashboard** | Connected-platform overview (service desk ↔ technicians ↔ plant), KPIs, recent activity, live jobs |
| **Service & Maintenance** | Live jobs · **Call-outs** (building, equipment, location, fault, urgency, photo) · **Job cards** with the 6-step progress (logged → assigned → on the way → on site → work completed → report ready) · findings, work done, camera photos, **customer signature** · auto-shared signed report (printable / save as PDF) · delivery log to Building Manager, Operations Manager, service desk and technician · Technicians · Notifications · Reports · Clients · Documents |
| **Info Hub (BMS)** | Site overview (temperature, humidity, CO₂, status) · Chiller plant (compressors, CHW temps, pumps, running/standby/tripped/offline summary) · AHU list and **AHU schematic** (supply/return fans, air temps, CHW valve, damper, filter ΔP, operating modes) · FCUs · Cooling towers · Pumps · Fans · **Zone heat map** with 20–24 °C comfort band · **Alarms** with automated response · Trends · Point register |
| **Vehicles** | Fleet status, fuel, service schedule |
| **Driver Dispatch** | Parts and refrigerant trips: schedule → in transit → delivered |
| **Assessments** | Plant condition assessments with 1–5 ratings and a score |

### Try the automated fault flow (as in the video)
1. Info Hub → **Simulate fault** (or Dashboard → *Simulate BMS fault*).
2. AHU-02's supply fan trips and Zone L2-C warms past 24 °C. Trigon receives the alarm, a **critical
   call is raised automatically**, a technician is dispatched, and the managers are notified at the same moment.
3. Open the call. Mark *on the way* and *check in on site*, fill in findings and work done, then *Mark work completed*.
4. The unit restarts, the zone falls back into the comfort band, and the **alarm closes with a full audit trail**.
   Sign the job card to complete and share the report.

## Data / connecting a real backend
- All data is simulated and saved in the browser (`localStorage`). Use **Reset demo data** on the Dashboard to start over.
- `data.js` is the data layer (`Store.load/save`). Replace it with API calls to the real service desk database.
- `tick()` in `app.js` simulates the BMS feed. Replace it with a poll or WebSocket from the BMS gateway (BACnet/Modbus → API).
- Notifications are recorded in the delivery log only. Wire `setStep()` / `notifyStep()` to email, SMS, WhatsApp or push.

## Files
- `index.html`: app shell
- `styles.css`: dark theme and responsive layout (desktop top nav + sidebar → phone bottom tab bar + scrolling chips)
- `data.js`: seed data and persistence
- `app.js`: router, views, SVG visuals, workflow and BMS simulation
- `manifest.webmanifest`, `sw.js`, `icon.svg`: PWA install and offline support
