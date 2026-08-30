# DumbBrew backend

Two Node.js/TypeScript microservices behind an nginx gateway, backed by one
shared Postgres instance, with Prometheus/Grafana/Loki monitoring — all
designed to run together on a single OCI Always Free VM. See
`../docs/ARCHITECTURE.md` for the why behind these choices and
`../infra/terraform/README.md` for how it gets to OCI.

**`gateway` also serves the public site** (`gateway/public/`), but that
site's content and images now come from Supabase and Cloudflare R2 directly
from the browser — see the root `../README.md`. `auth-service` and
`content-service` are no longer in that request path; they're kept as an
admin backend (JWT-protected CRUD, useful for future admin tooling) and are
optional for the site to function.

| Service | Port (internal) | Responsibility |
|---|---|---|
| `gateway` | 80 (public) | nginx reverse proxy + serves the static site, rate limiting, security headers |
| `auth-service` | 4001 | Admin login/refresh/logout, issues JWTs — optional, not used by the public site |
| `content-service` | 4002 | Events CRUD, newsletter subscribe/list — admin routes verify the JWT locally using a shared secret; optional, not used by the public site (see Supabase setup in the root README) |
| `order-service` | 4003 | Cart, addresses, checkout, Razorpay payment verification/webhook, public seller applications + standalone seller login, seller product/variant/image/collection/order management, admin seller approval (which generates the seller's login credentials). No local DB — reads/writes Supabase directly with the service-role key (same pattern as auth-service's customer registration) |
| `postgres` | 5432 | Single DB, two schemas: `auth`, `content` — separate from Supabase's own Postgres. `order-service` does not use it. |
| `prometheus` / `grafana` / `loki` / `promtail` / `node-exporter` / `cadvisor` | — | Monitoring stack |

### `order-service` env vars

In addition to the shared `JWT_SECRET`/`JWT_ISSUER` (for verifying the admin
JWT on seller-approval routes) and `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/
`SUPABASE_JWT_SECRET` (already used by `auth-service`, see its config.ts):

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — from the Razorpay dashboard
  (test-mode keys are fine for local dev; checkout won't actually charge
  anything without real ones).
- `RAZORPAY_WEBHOOK_SECRET` — set when configuring the webhook URL
  (`https://<your-domain>/api/payments/webhook`) in the Razorpay dashboard;
  this is what `order-service` uses to verify the webhook is really from
  Razorpay, since that's the only thing that ever marks an order `paid`.
- `SELLER_JWT_SECRET` — any random string, distinct from `JWT_SECRET` and
  `SUPABASE_JWT_SECRET`. Signs the standalone seller login token (sellers are
  not customers or admins — see `supabase/schema.sql`'s `sellers` comment).
  `SELLER_JWT_ISSUER` defaults to `dumbbrew-seller`.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` —
  Cloudflare R2 **write** credentials (Account → R2 → Manage API Tokens →
  create one scoped to Object Read & Write on the bucket). Used only to mint
  presigned upload URLs for seller-application and product images; distinct
  from the public-read `R2_BASE` URL already in `gateway/public/config.js`.

### Seeding the house seller

DumbBrew's own catalog (existing `brews`/`menu_items`) is migrated into the
marketplace `products` table by a one-time script. Sellers are a standalone
identity now (not a customer account), so this just creates the row
directly:

```sh
docker compose exec order-service sh -c \
  "HOUSE_STORE_NAME=DumbBrew npm run seed:house-seller"
```

This creates (or updates) an `approved`, `is_house = true` row in `sellers`
and copies every un-migrated `brews`/`menu_items` row into `products`,
backfilling their new `product_id` column.

### Seller onboarding flow

1. Anyone applies at `seller-apply.html` (linked from the site footer) — no
   login required. `POST /api/sellers/applications` creates a `pending`
   `sellers` row with no credentials yet.
2. An admin reviews it at `admin-sellers.html` (same login as the existing
   admin JWT). Approving (`PATCH /api/admin/sellers/:id`) generates a
   temporary password, hashes it, and returns the plaintext **once** in that
   response — copy it immediately, it's never shown again. The admin relays
   it to the seller manually (no email-sending is wired up in this repo).
3. The seller logs in at `seller-dashboard.html` (`POST
   /api/sellers/auth/login`) and is forced through `POST
   /api/sellers/auth/reset-password` before doing anything else, since
   `must_reset_password` starts `true`.
4. From there they manage products (with variants/images/inventory) and
   collections, and mark their own order lines fulfilled — see the route
   list in `services/order-service/src/routes/sellers.routes.ts`.

## Run it locally

1. **Prerequisites**: Docker + Docker Compose v2.
2. Copy the env file and fill in real values (any random strings are fine
   for local dev — just keep `JWT_SECRET` non-trivial):

   ```sh
   cp .env.example .env
   ```

3. Start everything:

   ```sh
   docker compose up --build
   ```

   This builds `auth-service`, `content-service`, and `gateway` from source
   (docker-compose.override.yml is auto-loaded and adds local-dev port
   mappings), starts Postgres and runs `db/init/001_init.sql` automatically
   on first boot, and brings up the monitoring stack.

4. **Seed the admin account** (one-time; there's no public signup endpoint
   by design):

   ```sh
   docker compose exec auth-service sh -c \
     "ADMIN_EMAIL=owner@dumbbrew.example ADMIN_PASSWORD=changeme123 npm run seed:admin"
   ```

5. **Smoke test**:

   ```sh
   # Public: list upcoming events (empty at first)
   curl http://localhost/api/events

   # Public: subscribe to the newsletter
   curl -X POST http://localhost/api/newsletter/subscribe \
     -H "Content-Type: application/json" -d '{"email":"test@example.com"}'

   # Admin login
   curl -X POST http://localhost/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"owner@dumbbrew.example","password":"changeme123"}'
   # -> { "accessToken": "...", "refreshToken": "...", "expiresIn": "15m" }

   TOKEN=<accessToken from above>

   # Admin: create an event
   curl -X POST http://localhost/api/events \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"title":"Cupping Night","eventDate":"2026-09-06"}'

   # Admin: list newsletter subscribers
   curl http://localhost/api/newsletter/subscribers -H "Authorization: Bearer $TOKEN"
   ```

6. **Health/metrics**: `curl http://localhost/healthz`,
   `curl http://localhost:4001/metrics`, `curl http://localhost:4002/metrics`.

7. **Grafana**: http://localhost:3001 (mapped from container port 3000 to
   avoid clashing with other local services — see docker-compose.override.yml)
   (`admin` / value of `GRAFANA_ADMIN_PASSWORD`
   in `.env`). The "DumbBrew Backend Overview" dashboard is auto-provisioned.
   Request-rate/latency panels populate immediately; container/host panels
   need `docker compose --profile monitoring-host up -d node-exporter cadvisor`
   (disabled by default locally — see docker-compose.override.yml).

8. **Logs in Grafana**: Explore → Loki datasource → `{service="gateway"}` (or
   `auth-service` / `content-service`).

## Running tests / type checks

```sh
docker compose exec auth-service npm run lint
docker compose exec content-service npm run lint
```

(There's no separate test suite yet beyond TypeScript's strict-mode checks
and the manual smoke test above — add one under `src/__tests__` per service
before this goes further than a v1.)

## Tearing down

```sh
docker compose down          # keep data
docker compose down -v       # also wipe Postgres/Prometheus/Grafana/Loki volumes
```

## Deploying to OCI

Local testing above should pass first. Then:

1. Provision infra: `../infra/terraform/README.md`.
2. Wire up the OCI DevOps project (build pipeline pushes images to OCIR,
   deploy pipeline rolls them out to the VM): see
   `../infra/devops-pipelines/`.
3. First deploy can also be done by hand over SSH if you want to verify
   before trusting the pipeline:

   ```sh
   ssh ubuntu@<vm-ip>
   cd /opt/dumbbrew
   cp .env.example .env   # fill in real prod secrets
   docker compose up --build -d
   docker compose exec auth-service sh -c "ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed:admin"
   ```
