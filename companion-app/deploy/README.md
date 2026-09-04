# Deploying Amicora on an xneelo Cloud/VPS

This deploys the whole stack — API, web, PostgreSQL, and S3-compatible object
storage — as Docker containers behind a Caddy reverse proxy on a single Linux
host. You start on the server's IP address and add a domain later with no
rebuild.

```
Browser ──▶ Caddy (:80/:443)
              ├── /api/*  ──▶ backend  (FastAPI + PostgreSQL)
              └── /*      ──▶ frontend (Next.js)
Browser ──▶ MinIO (:9000)  ── signed image URLs (portfolio photos, ID docs)
```

## 0. Prerequisites

- An xneelo Cloud/VPS (or dedicated) Linux server with **root SSH**.
  Ubuntu 22.04/24.04 LTS is a fine choice.
- **2 GB RAM minimum** (the Next.js build is memory-hungry; if the build gets
  killed, add swap — see Troubleshooting).
- Ports **80** and **443** open to the world, and **9000** open for image
  serving (see the domain section for locking 9000 down later).

## 1. Install Docker on the server

```bash
ssh root@YOUR_SERVER_IP
curl -fsSL https://get.docker.com | sh
docker compose version   # confirm the Compose plugin is present
```

## 2. Get the code onto the server

```bash
git clone https://github.com/jpbothelec-collab/Bothelec.git
cd Bothelec/companion-app/deploy
```

(Or `git pull` in an existing clone to update.)

## 3. Configure

```bash
cp .env.example .env
nano .env
```

Fill in every `CHANGE_ME`. Generate strong secrets with:

```bash
openssl rand -hex 32     # use for SECRET_KEY, and as passwords
```

For a first IP-only launch, set the IP-based values and leave `SITE_ADDRESS`
as `:80`:

```
SITE_ADDRESS=:80
CORS_ORIGINS=http://YOUR_SERVER_IP
S3_PUBLIC_ENDPOINT_URL=http://YOUR_SERVER_IP:9000
BILLING_CALLBACK_URL=http://YOUR_SERVER_IP/account
```

## 4. Launch

```bash
docker compose up -d --build
```

First run builds the images and pulls Postgres/MinIO/Caddy. The backend
applies database migrations automatically on start (`alembic upgrade head`).

Check everything is healthy:

```bash
docker compose ps
curl -s http://localhost/api/health      # -> {"status":"ok"}
```

Then open **http://YOUR_SERVER_IP** in a browser.

## 5. Create the first admin

Sign up a normal account through the web UI, then promote it in the database:

```bash
docker compose exec postgres \
  psql -U amicora -d amicora \
  -c "UPDATE users SET role='admin', admin_level='superadmin' WHERE email='you@example.com';"
```

Log out and back in; the **Admin** area is now available.

## 6. Add a domain (later, whenever you're ready)

1. **DNS** — at your registrar/xneelo DNS, create an `A` record for the
   domain (and `www`) pointing at `YOUR_SERVER_IP`. If you'll serve images
   over the domain too, also add an `A` record for `s3.your-domain`.

2. **Point the app at the domain** — edit `.env`:

   ```
   SITE_ADDRESS=amicora.co.za
   CORS_ORIGINS=https://amicora.co.za
   S3_PUBLIC_ENDPOINT_URL=https://s3.amicora.co.za
   BILLING_CALLBACK_URL=https://amicora.co.za/account
   ```

3. **Serve images over TLS on the s3 subdomain** — add this block to
   `Caddyfile` so Caddy terminates HTTPS for MinIO too:

   ```
   s3.amicora.co.za {
       reverse_proxy minio:9000
   }
   ```

   With images now flowing through Caddy on 443, you can close port 9000 in
   the firewall.

4. **Apply**:

   ```bash
   docker compose up -d
   ```

   Caddy fetches Let's Encrypt certificates automatically on first request —
   no manual certbot step. The web app calls the API at
   `https://amicora.co.za/api` with no rebuild, because the client resolves
   the API base from the current origin at runtime.

## Operations

```bash
docker compose logs -f backend        # tail a service
docker compose ps                     # status
docker compose up -d --build          # deploy an update after `git pull`
docker compose down                   # stop (data is kept in named volumes)
```

**Back up the database and objects:**

```bash
docker compose exec postgres pg_dump -U amicora amicora > amicora-$(date +%F).sql
docker run --rm -v amicora_minio_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/minio-$(date +%F).tgz -C /data .
```

## Troubleshooting

- **Next.js build gets "Killed" (out of memory):** add swap, then rebuild.
  ```bash
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ```
- **Images don't load in the browser (403/connection refused):** the browser
  fetches them straight from MinIO, so `S3_PUBLIC_ENDPOINT_URL` must be a host
  the browser can reach (public IP or `s3.` domain), and port 9000 must be
  open (until you move images behind Caddy on the domain). After changing it,
  `docker compose up -d` to recreate the backend.
- **API 5xx right after first boot:** the backend waits for Postgres to be
  healthy before migrating; give it a few seconds, then
  `docker compose logs backend`.

## Security notes carried over from the app

- ID documents and portfolio images are stored **private** and only ever
  reached via short-lived signed URLs — never public links.
- Keep the MinIO console (9001) firewalled off unless you need it.
- The legal texts (ToS, Privacy, cancellation, ID-consent) are drafts pending
  South African attorney review — see the app README's compliance checklist
  before a public launch.
