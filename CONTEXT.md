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

## Local Docker stack — running right now

The full `backend/docker-compose.yml` stack is up locally (`docker compose
up --build -d` from `backend/`), including Authentik. `backend/.env` exists
(gitignored, not committed) with real secrets, notably a working
`AUTHENTIK_API_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY`.

- **http://localhost** — the full site through the real nginx gateway
  (index/register/login/terms/data-policy/account, all serving `200`).
- **http://localhost:9000** — Authentik admin (bootstrap admin login is in
  `backend/.env` as `AUTHENTIK_BOOTSTRAP_EMAIL`/`AUTHENTIK_BOOTSTRAP_PASSWORD`).
- **http://localhost:3001** — Grafana (pre-existing, from an earlier session).

Caution logged here on purpose: the very first attempt at this generated a
fresh random `.env`, which would have silently orphaned the already-running
Postgres volume's real credentials on next restart. Caught before anything
broke — recovered the true original secrets (`localtestpw`-based dev
values) straight from the live containers' env via `docker inspect`, and
only layered the new Authentik/Supabase vars on top. If `backend/.env` ever
needs rebuilding from scratch again, check `docker ps` for already-running
containers first and recover their real env rather than generating fresh
secrets blind.

`content-service` is still unused (content goes straight from the browser
to Supabase). `auth-service` now does real work: customer registration,
proven end-to-end (see below).

## Customer accounts (Authentik SSO) — fully live, registration and login both verified end-to-end

- **Registration works end-to-end, verified for real**: `register.html` →
  `POST /api/customers/register` → creates the user in Authentik → mirrors
  the profile into Supabase `customers`. Tested via `curl` and in a real
  browser: got a real `201`, confirmed the row landed in Supabase
  (service-role key), confirmed a duplicate email/phone correctly 409s, and
  confirmed RLS isolation live — the anon key sees zero rows in `customers`
  (no `auth.uid()` without a signed-in identity) while the service-role key
  sees everything, exactly as designed.
- **Login now works end-to-end too, verified in a real browser**:
  `login.html` → Authentik OIDC authorize (PKCE, Web Crypto only, no
  library) → `auth-callback.html` exchanges the code for tokens → POSTs
  Authentik's `id_token` to `POST /api/customers/session` (new) → lands on
  `account.html` showing the signed-in customer's own username/email/phone.
  Verified by registering a fresh test account (`loginflow_test`) and
  logging in as them — the page correctly showed their own row via RLS.
- **Why there's a `/api/customers/session` endpoint at all**: the original
  plan was Supabase's Third-Party Auth verifying Authentik's `id_token`
  directly. That turned out not to exist for self-hosted IdPs — Supabase's
  dashboard only offers a fixed list of named providers (Firebase, Clerk,
  WorkOS, Auth0, Cognito), no generic "any OIDC issuer" option. Since
  Authentik's OAuth2 provider signs `id_token`s with HS256 using its own
  client secret, `auth-service` verifies that signature itself
  (`jsonwebtoken`, already a dependency — no new package) and mints a
  Supabase-compatible JWT signed with Supabase's **legacy JWT secret**
  (Project Settings → API → JWT Settings), giving the exact same
  `auth.uid()` result Third-Party Auth would have.
- **The OIDC Provider + Application were created via Authentik's admin API**,
  not the dashboard — `docs/AUTHENTIK_SETUP.md` step 3-4 originally described
  manual clicks, but since `AUTHENTIK_API_TOKEN` was already available, the
  provider (`sub_mode: user_uuid`, HS256, redirect URIs for both
  `localhost:8088` and `localhost`), a `phone` scope mapping, and the
  `dumbbrew` Application were all created with `curl` against
  `/api/v3/providers/oauth2/` etc. Client ID/secret came back in that
  response and are now live in `config.js` and `backend/.env`.
- **Getting this fully live took several real fixes**, worth knowing if this
  ever needs to be redone on another environment:
  1. `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` had to be set in
     `backend/.env` (the service-role key is different from the anon key
     already in `config.js` — Project Settings → API → **service_role**,
     labeled "secret").
  2. The first Authentik API token 403'd on user creation — it wasn't tied
     to the bootstrap admin/superuser account. Fixed with a fresh token
     generated directly under the admin user.
  3. `AUTHENTIK_CLIENT_ID`/`AUTHENTIK_CLIENT_SECRET`/`AUTHENTIK_ISSUER`/
     `SUPABASE_JWT_SECRET` had to be added to **both** `backend/.env` and
     `docker-compose.yml`'s `auth-service.environment` block — `.env` alone
     isn't enough, compose only passes through vars it explicitly lists.
  4. The **gateway container bakes `public/` in at build time** (no volume
     mount) — every frontend edit (`config.js`, `auth-callback.html`,
     `account.html`) needed `docker compose up -d --build gateway`, not
     just a file save, to actually be served.
  5. The **browser's own HTTP disk cache** kept serving old versions of
     `config.js`/`account.html` even after rebuilding the gateway and even
     after restarting the test browser — heuristic caching with no
     `Cache-Control` header on these files. Cache-busting query params
     (`?_=<timestamp>`) were needed during verification; real users won't
     hit this since they're not reloading a page whose server-side content
     just changed mid-session.
- **Identity infra**: Authentik (self-hosted), 4 compose services
  (`authentik-server`, `authentik-worker`, its own `authentik-postgres`,
  `authentik-redis`), exposed on host port `9000` directly (no domain/TLS
  yet to path-proxy it through the gateway). `infra/terraform/network.tf`
  opens that port for the real deployment.
- **Isolation**: `customers` table RLS (`auth.uid() = id`) is the pattern
  any future per-customer table (orders, favorites, etc.) should follow,
  documented directly above the policy in `supabase/schema.sql`.
- **Known gap**: no session refresh — the minted session token is 1 hour
  and `account.html` just bounces back to `login.html` once it expires.
  Fine for now, flagged as a follow-up if session length becomes annoying.
- **Legal content caveat**: `terms.html`/`data-policy.html` are a solid
  DPDP Act 2023-aware draft, not lawyer-reviewed — say so again if the user
  asks about shipping this for real, especially the Grievance Officer /
  hosting-region placeholders still in `data-policy.html`.

## Git

Pushed to `main` on GitHub (commit `349810a`, "Add customer accounts with
Authentik SSO"). The remote (`https://github.com/ArnabAdhikar/DumbBrew.git`)
reports it moved to `https://github.com/arnab075devops/DumbBrew.git` — push
still works via GitHub's redirect, but the local `origin` URL hasn't been
updated to the new canonical one yet.

## Viewing the site locally

Two ways, depending on whether you need the backend (registration) to work:

- **Full stack (registration works)**: the Docker stack described above,
  already running — just open `http://localhost`.
- **Static only, no backend**: `cd backend/gateway/public && python -m
  http.server 8088`, open `http://localhost:8088/index.html`. Fine for
  everything except `register.html`'s actual submit (no `auth-service`
  behind it on this path).

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
