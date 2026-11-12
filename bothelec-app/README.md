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
  To let a technician sign in, open their page (Service → Technicians → Edit) and use **App login** to create their
  login (admin only); the same box resets their password or removes the login.
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
  When you approve a row in the billing tracker, a **draft invoice** is created with the parts & labour lines and the
  client's PO number (or the job number) as order number. Logged services can be invoiced with one click. Your office reviews and sends invoices from Zoho Books.
  Sync runs in the background with retries; see Settings → Zoho Books & billing → Sync log.

**Billing tracker** (Service → Billing tracker, service desk only) replaces the PO / invoice spreadsheet:
- Every service call (and every logged service with parts & labour) gets a row automatically. *Add PO / quote* adds
  rows for POs or quotes that aren't linked to a job yet.
- Columns: status, client, PO number / received date / approval, job card number and date, invoice number and date,
  amount incl. and ex VAT, days overdue (after the payment terms in Settings), date loaded to the client's PO portal
  (e.g. Vantage, set per building) and date paid / void. Critical calls are flagged.
- Tick rows and press **Approve & send to Zoho**: draft invoices are created with the client's PO number as the order
  number. Before Zoho is connected the button is **Approve for invoicing**; type the invoice number on the row instead.
- *Loaded to portal today* and *Mark paid today* update many rows at once. **Export CSV** opens in Excel.

Invoices are no longer created automatically when a report is signed: they wait for approval in the tracker
(this can be switched back in Settings → Zoho Books & billing).

**Connecting Zoho Books** (about 5 minutes, done in the app):
1. In the app, open **Settings → Zoho Books & billing**. The *Connect Zoho Books* panel shows the exact Homepage URL and
   Redirect URI to use.
2. Sign in to the Zoho API Console for your Zoho region (e.g. <https://api-console.zoho.com>) with the account that owns
   your Zoho Books. Choose **Add Client → Server-based Applications** and paste the Homepage URL and Authorized Redirect URI
   from step 1.
3. Copy the **Client ID** and **Client Secret** into the panel, choose your region and click **Connect Zoho Books**.
   Zoho asks you to approve access and sends you back. If the account has several organisations, pick one.
4. Click **Test connection**, then **Sync all clients now**.

The connection is stored on the server (the secret is never sent to browsers). *Disconnect* revokes it. Use the same
address you'll keep using (e.g. `https://aircon.yourcompany.co.za`); if the address changes, update the redirect URI in
Zoho and connect again. A connection can also be configured in `.env` (`ZOHO_*` values) with a Zoho "Self Client";
a connection made in the app takes priority.

Optional: in Zoho Books → Settings → Taxes, copy the ID of your 15% VAT tax into *Zoho tax ID*; add Zoho item IDs to the
price list so invoice lines link to your Zoho items.

**Importing your existing spreadsheet:** Billing tracker → *Import CSV*. In Excel use *Save As → CSV*, choose the client
building, pick the file, check the column matching (it recognises headings such as "PO # Vantage", "Trigon INV",
"Loaded to Vantage", "DATE PAID"), check the preview and import. Empty rows, totals rows and invoices already in the
tracker are skipped. Dates like 1900-01-00 count as empty, and VOID in the paid column marks the row void.

The connector was built and tested against a stand-in for the Zoho Books API (v3). Before relying on it, test it once against
a Zoho Books trial organisation: create a test job with parts & labour, sign it off, and check the draft invoice in Zoho.

## 7. Two companies: Aircon Solutions and Utility Management

The dropdown under **BOTHELEC** in the header switches between **Bothelec Aircon Solutions** and **Bothelec Utility
Management**. The layout is the same; the menus and data change. Users, technicians, vehicles, dispatch, the billing
tracker, Zoho and settings are shared. Each building is set to one or both companies (Settings → Buildings →
*Services for this building*), and every service call belongs to the company it was logged under.

**Utility Management: setting up a building** (Meters → *Building setup*, or *Set up a building* on the dashboard):
1. **Building**: name, owner and area, or add utility management to an existing building.
2. **Shops & meters**: one row per shop or common area: shop number, tenant, statement email, and the **serial numbers**
   of the electricity and water meters. Add a **council meter** row (the municipal supply) and any **check meters**
   (bulk / distribution-board meters). A serial links the existing meter or adds it. Duplicate serials, and meters already
   installed at another building, are refused before anything is saved. Changing a serial retires the old meter (its
   readings are kept and its place in the meter tree passes to the new meter); a new tenant name on an existing shop marks
   the previous tenant as moved out.
3. **Meter tree**: say which meter feeds which: council → check meters → shop and common-area meters. New meters start
   under the council meter of the same utility; solar feeds into an electricity meter as extra supply. A live preview shows
   the tree, meters left outside it, and refuses loops. Set the allowed loss per utility (default 5 % electricity, 10 % water).
4. **Bulk check**: every meter at once: serial recorded, readings present and recent, no reading going backwards,
   in the meter tree, tariff available. **Check meter**: open any meter to see its last readings and take a reading on the spot.
5. **Tariffs**: link a tariff per meter or apply one to all, or *Skip for now* and link them later.

**Building balance** (Meters → *Building balance*, or *Balance* on a site): for a month or a date range, each council and
check meter's consumption is compared with the total of the meters under it (plus solar). The report shows the difference
in units and %, per level of the tree: **Balanced** within the tolerance, **Losses above tolerance** (possible leak, bypass,
faulty or missing meter), **Sub-meters exceed supply** (wrong multiplier or a meter in the wrong place), or **Readings missing**
when readings are missing for the period (those meters are listed).

**Utility Management**
- **Meters** (electricity, water, solar): a register per building with serial, make, location, multiplier / CT ratio,
  the tenant it is billed to and the tariff. Each meter shows its readings history, a chart and use since the previous reading.
- **Readings** arrive by: a technician on the meter page or a **reading round** (every meter in a building on one screen,
  with photos); a meter job's job card; **CSV import** (meter ID or serial, date, time, reading); or a **building link**
  (Modbus / MQTT / HTTP / edge agent) mapped to the path `meters.<meterId>.reading` (stored at most every 15 minutes).
  Readings lower than the previous one are flagged.
- **Tenant billing (recoveries)**: tenants per building; **tariffs** with a fixed charge and rate blocks (water can add sewer
  as a % of water). The included tariffs are **samples**: replace them with your municipality or landlord rates. A **billing
  run** for a month takes each tenant's meters, the readings nearest the start and end of the month, and works out
  consumption × multiplier and the charges, with warnings for missing or suspicious readings. Recalculate after fixing
  readings; **Approve** emails each tenant a statement and adds a row per tenant to the billing tracker, from where it is
  invoiced in Zoho Books (the tenant becomes a Zoho customer).
- **Meter service jobs**: installs, faults and reading jobs use the same call-out, technician and job-card workflow. On a
  meter job the technician records readings (with photos) on the job card.

**M2M Solutions**: the meter option "M2M Solutions (API)" is reserved for the link to the M2M Solutions API, which will be
added once their API documentation is available. Until then, these meters can be read manually, by CSV, or through a building link.

## Reports

**Reports** in the top menu follows the company selected in the header. Every report has the same period filter (this
month, last month, last 3 / 6 / 12 months, year to date, or chosen months), a building filter, **Export CSV** and
**Print / PDF**. Figures are compared with the previous period of the same length.

The structure has three levels:
1. **Scorecard**: a few headline figures with the change against the previous period, 6-month trends, and a
   *Needs attention* list linking to the detail.
2. **Focused reports**, one question each.
3. **Detail tables** under each report (exportable).

**Aircon Solutions**
- **Scorecard**: calls logged and completed; arrived within SLA; fixed within SLA; first-time fix; average time to
  arrive and to fix; revenue (clients see "Billed").
- **Service levels**: per urgency against the targets; open calls by age; how calls came in; every completed job with
  arrive / fix times and repeat calls. An admin edits the **service-level targets** here (hours to arrive and to fix
  per urgency; defaults Critical 2 / 8 h, High 4 / 24 h, Medium 24 / 72 h, Low 72 / 168 h).
- **Technicians** (staff): jobs done, speed, time on site, SLA, first-time fix, repeat calls, revenue.
- **Clients & buildings**: service per building, maintenance overdue, the unit with the most calls, common faults.
- **Equipment & maintenance**: planned maintenance on time (from each unit's service interval), overdue units, call-outs
  and repeat calls per unit.
- **Billing & revenue** (staff): invoiced, paid, outstanding, overdue, work not invoiced yet, debtors by age,
  revenue by type (call-out / labour / parts), per client. Based on the billing tracker.

*First-time fix* counts a job as fixed first time when the same unit had no further call within 30 days.

**Utility Management**
- **Scorecard**: electricity and water from council; billed to tenants (recovery % of supply); losses; solar;
  amount recovered from tenants.
- **Consumption**: where the supply went (tenants, common areas, losses) and use per tenant with the change.
- **Losses & balance**: loss % per building and month, coloured against the building's tolerance; click a month to
  open the full meter-tree balance.
- **Tenant recoveries**: billing runs and months not billed yet.
- **Meter data quality**: meters with no readings, stale readings, readings going backwards, no serial, or not in the tree.
- **Meter jobs** and **Technicians**: the same service-level reports for meter work.

Clients see the reports for their own buildings only (not billing or technicians). Technicians do not see reports.
Signed service reports for each job remain under Service → *Signed job reports*.

## 8. Logins and roles

| Role | Can |
|---|---|
| Admin | Everything, including Settings (SMS/email, buildings, BMS links, users) |
| Service desk | All jobs, alarms, technicians, fleet; clear alarms; simulate faults on demo buildings |
| Technician | Only their own workflow: a **My work** home screen with their open jobs and the next step for each, job cards (photos, parts & labour, signature), logging a call, equipment history and logging services, their own trips and assessments. No monitoring, billing, clients, other technicians or settings. |
| Client | Only their own buildings: log calls, follow jobs, see their monitoring and alarms |

Passwords are stored hashed (scrypt). Sessions use HttpOnly cookies, and logins are rate-limited.

## Limits

- **BMS monitoring is read-only.** Set-points and modes are changed on the BMS itself; set-point buttons only work on simulated buildings.
- BACnet: ReadProperty polling only (no COV subscriptions or segmented responses). Modbus: TCP; RS485 needs a gateway or router.
- Reports are sent as a formatted email with the signature and photos attached (no PDF file). The app's report page can be printed or saved as PDF.
- **Not yet tested against real accounts or hardware.** The tests use stand-ins built to the published protocols and APIs: BulkSMS, SMTP, Modbus, BACnet, MQTT, Teltonika and AT commands. Test each building's link and the BulkSMS and Gmail accounts once on site before relying on them.
