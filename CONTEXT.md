# Project context (current state)

Status snapshot for whoever picks this up next (human or AI). For setup
instructions from scratch, see [README.md](README.md); for the "why" behind
the architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). This file
is just: what's actually live right now.

## Supabase — connected and live

- Project: `odblggwrwksmycpxaptp` (`https://odblggwrwksmycpxaptp.supabase.co`)
- `supabase/schema.sql` has been run against it — all tables exist, seeded,
  RLS applied.
- `backend/gateway/public/config.js` has the real `SUPABASE_URL` and
  `SUPABASE_ANON_KEY` filled in (no longer the `YOUR-PROJECT` placeholder).
  The anon key is meant to be public (enforced by RLS, not secrecy) so it's
  fine committed as-is.
- Verified via headless browser (`browse` skill) that `index.html`,
  `brews.html`, and `menu.html` all fire real requests to
  `.../rest/v1/{brews,menu_categories,events}` and get 200s with live rows —
  the site is reading from Supabase, not local fallback data or the old
  Postgres/Node backend.

## R2 — connected and live

`R2_BASE` in `config.js` points at the `dumbbrew` Cloudflare R2 bucket's
public dev URL (`https://pub-acdd02b3e347450b80d14a3676db872e.r2.dev`). All
16 site images (including `happenings-tasting.jpg`, the Events/Happenings
section photo) are uploaded there — verified live via headless browser, every
image request on the site resolves through R2 with `200`.

## Legacy Node backend (auth-service, content-service, local Postgres)

`content-service` is unused (everything content-related goes straight from
the browser to Supabase). `auth-service` is now used for one real thing:
customer registration (see below). Docker compose stack still lives under
`backend/`, only needed once customer accounts or the admin login are
actually being used.

## Customer accounts (Authentik SSO) — code written, not deployed yet

Registration, login, and per-customer data isolation are built but **not
live** — Authentik hasn't been deployed anywhere yet, so `login.html`
correctly refuses to redirect (shows "Sign-in isn't configured yet") and
`register.html`'s POST will 503 until `auth-service` has real
`AUTHENTIK_API_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY` values.

- **Identity**: Authentik (self-hosted), added to
  `backend/docker-compose.yml` as 4 new services (`authentik-server`,
  `authentik-worker`, its own `authentik-postgres`, `authentik-redis`) —
  exposed on host port `9000` directly (no domain/TLS exists yet to
  path-proxy it through the gateway). `infra/terraform/network.tf` opens
  that port.
- **Registration**: `register.html` (email/username/phone/password + a
  required Terms & Conditions + Data Storage Policy checkbox) posts to a new
  `POST /api/customers/register` on `auth-service`
  (`backend/services/auth-service/src/controllers/customers.controller.ts`),
  which creates the user in Authentik via its admin API and mirrors the
  profile into a new Supabase `customers` table.
- **Login**: `login.html` → Authentik OIDC authorize (PKCE, no library, Web
  Crypto only) → `auth-callback.html` exchanges the code for tokens →
  `account.html` reads the customer's own row using Authentik's `id_token`
  directly as the bearer token against Supabase's Third-Party Auth (no
  `supabase-js`, no separate "Supabase session" — this is the corrected,
  simpler version of the original plan's `signInWithIdToken` idea, since
  that API is for Supabase's built-in social providers, not generic
  Third-Party Auth).
- **Isolation**: `customers` table has RLS (`auth.uid() = id`) — the pattern
  any future per-customer table (orders, favorites, etc.) should follow,
  documented directly above the policy in `supabase/schema.sql`.
- **What's left**: the one-time manual Authentik/Supabase dashboard
  configuration in [docs/AUTHENTIK_SETUP.md](docs/AUTHENTIK_SETUP.md) — it
  needs Authentik actually running first (chicken-and-egg, can't be
  scripted from outside a live instance).
- **Known gap**: no session refresh — Authentik's `id_token` is short-lived
  and `account.html` just bounces back to `login.html` once it expires.
  Fine for now, flagged as a follow-up if session length becomes annoying.
- **Legal content caveat**: `terms.html`/`data-policy.html` are a solid
  DPDP Act 2023-aware draft, not lawyer-reviewed — say so again if the user
  asks about shipping this for real, especially the Grievance Officer /
  hosting-region placeholders still in `data-policy.html`.

## Viewing the site locally

No build step, no Docker needed:

```sh
cd backend/gateway/public
python -m http.server 8088
```

Then open `http://localhost:8088/index.html`.

## Known cosmetic issue

On first paint, image `src` attributes briefly contain literal
`{{ templateVar }}` text before the page's JS resolves them, causing harmless
404s in the browser console (e.g. `GET /%7B%7B%20logoUrl%20%7D%7D 404`). Not
user-visible, not a data issue. Fix would be an empty `src` + lazy-load
instead of a literal placeholder string in the HTML — not done, low priority.

## Deployment

Not yet deployed. `vercel.json` at repo root is already configured to point
at `backend/gateway/public` as a static site — see README's "Vercel (the
site)" section to ship it.
