#service #infra

# System Overview

Parent: [[Home]]

## The two "layers" of this app

**Layer 1 — the public site (always works, no backend needed).** Static HTML/CSS/JS in `backend/gateway/public/`, one file per page, no build step, no framework. Each page reads content straight from **Supabase** via PostgREST (`window.supabaseSelect` in `config.js`) and images from **Cloudflare R2** (`window.assetUrl`). If Supabase/R2 aren't configured, every page falls back to hardcoded defaults — the site never shows broken/empty state. See [[Frontend Pages]].

**Layer 2 — three optional Fastify microservices**, behind one nginx gateway, needed only for things that require a trusted server (writing data, verifying passwords, holding secrets):

| Service | Port | Talks to | Purpose |
|---|---|---|---|
| `auth-service` | 4001 | local Postgres (`auth` schema) + Authentik + Supabase | Admin login/JWT issuance; customer registration & session-exchange via Authentik SSO |
| `content-service` | 4002 | local Postgres (`content` schema) | Legacy admin-only CRUD for events & newsletter subscribers — **not used by the public site anymore** |
| `order-service` | 4003 | Supabase only (service-role key), Razorpay, Cloudflare R2 | The marketplace: sellers, products, cart, checkout, payments, fulfillment |

All three sit behind `backend/gateway/` (nginx), which also serves the static files. See [[Repo Map]] for exact paths and [[API Endpoint Map]] for every route.

## Why two Postgres instances exist

This is the single most confusing thing in the repo if you don't know it going in — see [[Two Databases]] for the full explanation. Short version: a **local Postgres container** (schemas `auth`, `content`) backs the original v1 admin-tool scope (`auth-service`, `content-service`). Later, the real site's content and the entire marketplace were built directly against **Supabase** instead (a separate, cloud-hosted Postgres+PostgREST+RLS stack) — `order-service` and the customer-registration half of `auth-service` talk to Supabase, not the local Postgres. Both databases are live in the current docker-compose stack; they don't share data.

## Why three identity systems exist

Admins, customers, and sellers are three genuinely separate principals with separate credential stores and separate JWTs — not one auth system with roles. See [[Auth Identity Systems]] before touching any login/auth code.

## Request flow examples

**Browsing the site (no auth):**
`browser → GET brews.html → JS fetches Supabase REST (anon key) → renders`
No gateway/service involved at all if you open the HTML file directly; through Docker, nginx just serves the static file.

**Customer registration:**
`register.html → POST /api/customers/register → nginx → auth-service → creates user in Authentik (admin API) → mirrors profile into Supabase customers table (service-role key)`

**Customer login:**
`login.html → Authentik OIDC authorize (PKCE) → auth-callback.html gets id_token → POST /api/customers/session → auth-service verifies id_token, mints Supabase-compatible JWT → stored in sessionStorage → account.html calls Supabase PostgREST directly with that JWT (auth.uid() now resolves)`

**Marketplace checkout:**
`cart.html → POST /api/orders/checkout (customer JWT) → order-service snapshots cart into orders+order_items, asks Razorpay for an order → browser completes Razorpay payment → Razorpay calls POST /api/payments/webhook (server-to-server, signature-verified) → order-service flips payment_status='paid', decrements variant inventory, empties the cart`

**Seller onboarding:**
`seller-apply.html → POST /api/sellers/applications (public, no auth) → row in sellers with status='pending' → admin reviews via admin-sellers.html (admin JWT) → PATCH /api/admin/sellers/:id {status:'approved'} → order-service generates a temp password, hashes it, returns it ONCE in the response → admin relays it to the seller out-of-band → seller logs in at seller-register.html/login → forced password reset (must_reset_password) → seller-dashboard.html manages products/collections/orders`

## Deployment topology (see [[Docker Compose]] / [[Terraform OCI]] / [[Vercel Deploy]])

- **Now:** frontend on Vercel (static, points at `backend/gateway/public`), Supabase + R2 + Razorpay as external managed services. Backend services not required for the public site's core browsing/reading; needed for registration, login, marketplace, admin.
- **Local dev / staging:** full `docker-compose.yml` stack (gateway + 3 services + local Postgres + Authentik + monitoring) via `docker compose up --build -d` from `backend/`.
- **Later:** move everything (including static frontend) onto one OCI Always Free VM via `infra/terraform/` + `infra/devops-pipelines/`, unchanged code — see [[Terraform OCI]].

## Monitoring

Prometheus (`/metrics` on each service) + Grafana + Loki/Promtail (container logs) + node-exporter/cadvisor (host/container resource usage), all in `backend/monitoring/`, all running as containers in the same compose stack — no paid SaaS. See [[Monitoring]].
