# Bothelec Aircon Solutions — Operations, Service & Building Monitoring

One connected platform for **service requests, technicians and building plant**, built from the
product walkthrough video. It's a mobile-friendly web app (installable on phones) backed by a
server that runs 24/7 on a cloud VPS. The server:

- runs the service desk: call-outs, auto-assignment, the 6-step job flow, digital job cards with photos and signature, and signed reports
- sends **SMS (BulkSMS)** and **email (Gmail)** at every step and for every alarm, with a retrying outbox and a message log
- connects to each building's BMS: **Modbus TCP, BACnet/IP, MQTT, HTTP push (gateway or on-site edge agent), or a GSM alarm modem by SMS**
- raises alarms (equipment tripped, zone out of comfort band, sensor or link lost). For critical alarms it automatically raises a service call, dispatches a technician and notifies the managers.

```
 Buildings                                   Cloud VPS (Docker)                      People
 ─────────                                   ──────────────────                      ──────
 BMS controller ── Modbus TCP / BACnet ─┐    ┌──────────────────────────────┐
   (via VPN / router port-forward)      ├──▶ │  Bothelec server (Node.js)     │ ──▶ Web app / phones (HTTPS, live)
 4G router ─────── MQTT ────────────────┤    │  • jobs, alarms, rules       │ ──▶ SMS  (BulkSMS)
 Edge agent / gateway ─ HTTPS POST ─────┤    │  • SQLite database           │ ──▶ Email (Gmail)
 GSM alarm modem ── SMS → BulkSMS ──────┘    │  • outbox with retries       │
                    inbound webhook          └──────────────────────────────┘
```

## Folder layout

| Path | What |
|---|---|
| `public/` | The web app (HTML/CSS/JS, PWA) |
| `server/` | API server, business rules, notifications, BMS connectors, tests |
| `agent/` | Edge agent for buildings whose controller can't be reached from the cloud |
| `deploy/` | Docker Compose (app + HTTPS + optional MQTT broker), `.env.example`, systemd unit |

## 1. Run it locally (try it out)

Requires Node.js 22.13 or newer.

```bash
cd bothelec-app
npm install
cp .env.example .env      # leave SMS_PROVIDER=log and EMAIL_PROVIDER=log to just print messages
npm start                 # http://localhost:8080
```

On first visit an animated **product tour** (9 slides: Back/Next, dots, swipe or arrow keys, Skip) introduces the platform. It can be replayed from the sign-in page or from **Product tour** in the menu.
Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`. With `SEED_DEMO=true` you get a simulated
demonstration building. Go to **Info Hub → Simulate fault** to watch the full alarm → call → SMS → repair → close flow.

```bash
npm test                  # end-to-end tests (SMS, email, Modbus, BACnet, MQTT, HTTP, GSM, permissions)
```

## 2. Go live on a VPS

1. **Server:** a small Linux VPS (1 vCPU / 1 GB is plenty), with Docker installed.
2. **Domain:** point a DNS A record (e.g. `aircon.yourcompany.co.za`) at the VPS IP. Open ports 80 and 443.
3. **BulkSMS:** create an account at bulksms.com and buy credits. Go to *Settings → API Tokens → Create token*
   and copy the Token ID and Token Secret. Optional: register a sender ID such as `Bothelec`.
4. **Gmail / Google Workspace:** on the sending account, turn on 2-Step Verification, then create an
   **App Password** at <https://myaccount.google.com/apppasswords>.
5. **Configure and start:**
   ```bash
   git clone <this repo> && cd <repo>/bothelec-app/deploy
   cp .env.example .env && nano .env      # DOMAIN, PUBLIC_URL, ADMIN_*, BULKSMS_*, GMAIL_*, DESK_*, WEBHOOK_TOKEN
   docker compose up -d --build
   ```
   Caddy obtains the HTTPS certificate automatically. Then open `https://your-domain`.
6. **Check it works:** in the app, go to **Settings → SMS & email** and send a test SMS and a test email.
   Delivery status appears under **Settings → Message log**.
7. **Set up the business:** in **Settings → Buildings**, enter each building's managers (mobile + email) and its BMS link.
   In **Settings → Users**, add staff (service desk), technicians and client logins.
   Set `SEED_DEMO=false` for a clean start, or delete the demo buildings.

Data lives in the `bothelec-data` Docker volume (SQLite database + photos/signatures). Back it up, e.g. nightly:
`docker run --rm -v deploy_bothelec-data:/d -v $PWD:/b alpine tar czf /b/bothelec-backup.tgz /d`.

## 3. Connecting buildings (every building can be different)

Configure in **Settings → Buildings → BMS connection**. Pick a template, then list the points.
Each point maps a BMS value to a *path* in the app:

| Path | Meaning |
|---|---|
| `zones.<id>.temp` | Zone temperature (zone ids like `L2-C` place it on level 2) |
| `ahus.<id>.status` / `supplyTemp` / `returnTemp` / `supplyHz` / `chwValve` / `damper` / `filterDp` | Air handling units |
| `chillers.<id>.status` / `load` / `chws` / `chwr` | Chillers |
| `pumps.<id>.status` / `hz`, `towers.<id>.status` / `fan` / `leaving`, `fans.<id>.status` | Other plant |
| `humidity`, `co2`, `outside` | Site values |

Use `scale`, `offset`, `decimals` and `map` (e.g. `{"0":"off","1":"running","2":"tripped"}`) to convert raw values.
A **status of `tripped`** raises a critical alarm and (if enabled) a service call.
A zone outside the building's **comfort band** raises a high alarm.
**No data for `staleMinutes`** raises a "BMS link lost" alarm.

| Building has… | Use | Notes |
|---|---|---|
| BMS controller with Modbus TCP (or RS485 behind a Modbus gateway / Teltonika router) | `modbus` | The server must reach it: VPN, or a port-forward on the site router (restrict to the VPS IP). |
| BACnet/IP controller | `bacnet` | Needs a VPN to the site. MS/TP devices behind a BACnet router: add `network` + `mac`. |
| 4G router / gateway that can publish MQTT (e.g. Teltonika Modbus→MQTT, Node-RED) | `mqtt` | Start the bundled broker: `docker compose --profile mqtt up -d`, then create the MQTT user (below). |
| Router/gateway that can POST HTTP, or **no inbound access at all** | `http` + edge agent | The building pushes out over HTTPS. Nothing needs to be opened at the site. |
| GSM alarm dialler / modem that texts alarms | GSM (inbound SMS) | See below. Works alongside any of the above. |

**MQTT broker user:**
```bash
cd deploy && docker compose run --rm mosquitto mosquitto_passwd -c -b /mosquitto/config/passwd bothelec 'strong-password'
docker compose --profile mqtt up -d
```
For MQTT over the internet, prefer the router's VPN or add TLS to `mosquitto.conf`.

**Edge agent (no VPN / port-forwarding needed):** on a Raspberry Pi or PC at the building:
```bash
cp agent/config.example.json agent/config.json   # server URL, building id, token from Settings → Buildings
node agent/agent.js agent/config.json            # polls Modbus/BACnet locally, pushes over HTTPS
```
Set the building's connector to `{ "type": "http" }`.

**GSM alarm modems (inbound SMS):** rent a BulkSMS inbound number (or use a Teltonika router's SMS forwarding).
Point its webhook at `https://<domain>/api/hooks/sms-inbound?token=<WEBHOOK_TOKEN>`. Then add the modem's
number and text rules to the building, e.g.
`{"numbers":["+27821234567"],"rules":[{"match":"CHILLER.*FAIL","priority":"Critical","equip":"CH-01","desc":"Chiller failure"},{"match":"RESTORE|NORMAL","clear":true}]}`.

## 4. Who gets what

Edit under **Settings → SMS & email → Notification policy**. Defaults:

| Event | Email | SMS |
|---|---|---|
| Call logged | building manager, ops manager, service desk, caller | service desk (High/Critical only) |
| Technician assigned | managers | **technician** (with a link to the job) |
| On the way / on site | building manager | building manager (on the way) |
| Work completed / report signed | managers, desk, caller (report includes findings, photos and signature) | building manager (report link) |
| Critical alarm | managers, desk | managers, desk |
| High alarm | managers, desk | desk |
| Alarm cleared | managers, desk | — |

Failed messages are retried after 1, 5 and 15 minutes, then shown as failed in the message log, where they can be retried.

## 5. Buildings, contacts, technicians and equipment

- **Contacts** (Service → Clients → *Manage contacts*): each building can have any number of **building managers** and
  **operations managers** (plus other contacts). Everyone with *Notify* ticked receives the SMS/email updates for their role.
- **Technicians** (Service → Technicians): service desk staff add, edit and remove technicians (mobile for job SMS, email, vehicle).
  A technician with open jobs can't be removed until those jobs are reassigned (job page → *Reassign*). Past jobs keep their name.
  To let a technician sign in, add a user with the Technician role and link it to their record.
- **Equipment & service history** (Service → Equipment & history): the register of aircon units per building
  (make, model, serial, install date, refrigerant, service interval). Each unit's page shows its full **service history**:
  planned services logged by technicians, every service call with findings, work done and signed report, and every alarm.
  Next service due is worked out from the interval, and overdue units are flagged. *Decommission* hides a unit from call-outs
  but keeps its history.

## 6. Parts & labour and Zoho Books

The platform is the master for clients, contacts and jobs. Zoho Books is used for invoicing only.

- **Parts & labour:** on every job (from "on site", or any time for the service desk) and on logged services.
  Pick items from the **price list** (Settings → Zoho Books & billing) or type your own. VAT and totals are worked out
  automatically and shown on the signed report and in the report email.
- **Zoho Books:** when connected, each building's client (and its managers as contact persons) is created in Zoho Books.
  When a job report is signed, a **draft invoice** is created with the parts & labour lines and the job number as
  reference. Logged services can be invoiced with one click. Your office reviews and sends invoices from Zoho Books.
  Sync runs in the background with retries; see Settings → Zoho Books & billing → Sync log.

**Connecting Zoho Books** (about 10 minutes):
1. In Zoho Books, open Settings → Organisation profile and copy the **Organisation ID**. Note your Zoho domain: `zoho.com`, `zoho.eu`, `zoho.in` and so on. That is your data centre.
2. Open the API console for that data centre (e.g. <https://api-console.zoho.com> or `api-console.zoho.eu`). Choose **Self Client**, then Create, and copy the Client ID and Client Secret.
3. In the Self Client, open **Generate Code** and enter scope `ZohoBooks.fullaccess.all` with a 10-minute duration. Copy the code, then run (replace `com` with your data centre):
   ```bash
   curl -X POST "https://accounts.zoho.com/oauth/v2/token?grant_type=authorization_code&client_id=CLIENT_ID&client_secret=CLIENT_SECRET&code=CODE"
   ```
   Copy the `refresh_token` from the reply.
4. In `.env` set `ZOHO_DC`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` and `ZOHO_ORG_ID`, then restart.
5. In Settings → Zoho Books & billing, click **Test connection**, then **Sync all clients now**.
6. Optional: in Zoho Books → Settings → Taxes, copy the ID of your 15% VAT tax into *Zoho tax ID*. You can also add Zoho item IDs to the price list so invoice lines link to your Zoho items.

The connector was built and tested against a stand-in for the Zoho Books API (v3). Before relying on it, test it once against
a Zoho Books trial organisation: create a test job with parts & labour, sign it off, and check the draft invoice in Zoho.

## 7. Logins and roles

| Role | Can |
|---|---|
| Admin | Everything, including Settings (SMS/email, buildings, BMS links, users) |
| Service desk | All jobs, alarms, technicians, fleet; clear alarms; simulate faults on demo buildings |
| Technician | Their own jobs (progress, job card, photos, signature), monitoring, fleet, dispatch |
| Client | Only their own buildings: log calls, follow jobs, see their monitoring and alarms |

Passwords are stored hashed (scrypt). Sessions use HttpOnly cookies, and logins are rate-limited.

## Limits

- **BMS monitoring is read-only.** Set-points and modes are changed on the BMS itself; set-point buttons only work on simulated buildings.
- BACnet: ReadProperty polling only (no COV subscriptions or segmented responses). Modbus: TCP; RS485 needs a gateway or router.
- Reports are sent as a formatted email with the signature and photos attached (no PDF file). The app's report page can be printed or saved as PDF.
- **Not yet tested against real accounts or hardware.** The tests use stand-ins built to the published protocols and APIs: BulkSMS, SMTP, Modbus, BACnet, MQTT, Teltonika and AT commands. Test each building's link and the BulkSMS and Gmail accounts once on site before relying on them.
