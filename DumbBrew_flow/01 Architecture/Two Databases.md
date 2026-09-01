#infra #table

# Two Databases

Parent: [[Home]] · See also: [[System Overview]], [[Supabase Schema]], [[Local Postgres Schema]]

There are **two completely separate Postgres instances** in this system, with no data overlap. This is the easiest thing to get wrong when navigating the code — always check which one a given controller/table is talking about.

## 1. Local Postgres (`postgres` container, schemas `auth` + `content`)

- Defined in `backend/db/init/001_init.sql`, run by `backend/docker-compose.yml`'s `postgres` service.
- Owned by `auth-service` (schema `auth`: `admins`, `refresh_tokens`) and `content-service` (schema `content`: `events`, `newsletter_subscribers`).
- Reached via `DATABASE_URL` + the `pg` pool in each service's `src/db.ts`.
- **Scope: admin tooling only.** This is the original v1 build (see `docs/ARCHITECTURE.md`) — admin login and an admin-only events/newsletter CRUD backend, intended for an eventual admin panel. It predates the public site's real content pipeline.
- **The public site does not read from here at all anymore.**

## 2. Supabase (cloud-hosted Postgres + PostgREST + RLS)

- Schema defined in `supabase/schema.sql`, run once against project `odblggwrwksmycpxaptp` via the Supabase SQL Editor. Idempotent — safe to re-run.
- Holds: public marketing content (`brews`, `menu_categories`, `menu_items`, `story`, `story_milestones`, `brew_methods`, `events`, `testimonials`, `visit_info`, `newsletter_subscribers`), customer accounts (`customers`), and the **entire marketplace** (`sellers`, `products`, `product_variants`, `product_images`, `collections`, `product_collections`, `carts`, `cart_items`, `addresses`, `orders`, `order_items`).
- Reached two ways:
  - **Directly from the browser** via PostgREST + the public anon key (`window.supabaseSelect`/`supabaseSelectAs` in `config.js`), gated by Row Level Security policies defined right in `schema.sql`.
  - **From `order-service`** (and the customer-registration half of `auth-service`) using the **service-role key**, which bypasses RLS — those services do their own app-level ownership checks (e.g. `?customer_id=eq.<req.customerId>` on every query) instead. See `backend/services/order-service/src/lib/supabase.ts`'s comment.
- **This is where the live site's actual content and every marketplace write ends up.**

## Why events/newsletter tables exist in BOTH places

Confusing but true: `content.events` / `content.newsletter_subscribers` (local Postgres, admin CRUD via `content-service`) and `events` / `newsletter_subscribers` (Supabase, public read + public insert) are **two different tables with the same purpose**, not one shared table. The public site's `index.html` events section and `newsletter.subscribe` form talk to **Supabase** directly. `content-service`'s admin CRUD talks to **local Postgres** and is effectively unused by anything customer-facing today — see `README.md`: "The public site no longer calls `auth-service` or `content-service` for anything [besides customer registration]."

If you're asked to change what events show on the site → edit **Supabase** `events`. If you're building the admin panel that was originally scoped → that's `content-service` + local Postgres `content.events`.

## Quick disambiguation table

| Table name | Lives in | Written by | Read by |
|---|---|---|---|
| `auth.admins`, `auth.refresh_tokens` | Local Postgres | `auth-service` (`npm run seed:admin`, login/refresh) | `auth-service` only |
| `content.events`, `content.newsletter_subscribers` | Local Postgres | `content-service` admin CRUD | `content-service` only (legacy, not on live site) |
| `customers` | Supabase | `auth-service` (registration, service-role key) | Browser via anon+customer JWT (RLS `auth.uid()=id`); `order-service` |
| `sellers`, `products`, `carts`, `orders`, ... | Supabase | `order-service` (service-role key) | Browser (public/RLS-scoped reads); `order-service` |
| `brews`, `menu_items`, `story`, `events` (public), ... | Supabase | Manual (Supabase Table Editor) / seed script | Browser directly (anon key) |
