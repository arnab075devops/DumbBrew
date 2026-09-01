#auth-system

# Auth Identity Systems

Parent: [[Home]] · See also: [[System Overview]], [[API Endpoint Map]], [[Two Databases]]

Three principals, three credential stores, three JWT secrets. None of them share a login. Don't assume "logged in" means the same thing across admin/customer/seller code paths.

## 1. Admin

- **Identity store:** `auth.admins` in local Postgres (see [[Two Databases]]). Single cafe-owner account, no public registration endpoint — created/rotated via `npm run seed:admin` (`backend/services/auth-service/src/scripts/seed-admin.ts`), run once by hand.
- **Login:** `POST /api/auth/login` (email+argon2 password) → `auth-service` issues:
  - **Access token**: JWT, 15 min TTL, signed with shared `JWT_SECRET`, claims `{ sub, email, role: "admin" }`.
  - **Refresh token**: random UUID pair, 7 day TTL, stored **hashed** (SHA-256) in `auth.refresh_tokens`, single-use — every `POST /api/auth/refresh` call revokes the old one and issues a new one (row-locked transaction, `FOR UPDATE`).
- **Verification:** `content-service` and `order-service` verify the access token **locally** with the same `JWT_SECRET` (env var, shared via `docker-compose.yml` / OCI Vault in prod) — no network call back to `auth-service`. See `requireAdmin` middleware in both services (`content-service/src/middleware/auth.middleware.ts`, `order-service/src/middleware/requireAdmin.ts`) — near-identical implementations, not shared code.
- **Used for:** `content-service`'s events/newsletter admin CRUD, `order-service`'s `/api/admin/sellers` (approve/reject seller applications).
- **Logout / force-logout:** `POST /api/auth/logout` revokes one refresh token. To invalidate everywhere: `DELETE FROM auth.refresh_tokens WHERE admin_id = '<id>'` (existing access tokens still work until they expire, ≤15 min) — see `docs/RUNBOOK.md`.

## 2. Customer

The most complex of the three — two hops, two different JWTs.

- **Identity store:** **Authentik** (self-hosted OIDC/SSO, its own Postgres+Redis in the compose stack) holds the actual username/password. Supabase `customers` table (see [[Supabase Schema]]) mirrors just the profile fields the app needs — `id` is literally the Authentik user's UUID.
- **Registration:** `register.html` → `POST /api/customers/register` → `auth-service`:
  1. Checks Supabase for an existing row with that email/username/phone (pre-check, not the only guard — see step 4).
  2. Creates the user in Authentik via its admin API (`AUTHENTIK_API_TOKEN`), sets password via `set_password`.
  3. Writes the mirror row into Supabase `customers` using the **service-role key** (bypasses RLS — this is the *only* code path allowed to insert into `customers`, enforced by there being no anon/authenticated insert policy on that table at all).
  4. If the Supabase insert fails (race lost to the unique constraint), the Authentik user is deleted again — no orphan accounts either direction.
- **Login (two-hop token exchange):**
  1. `login.html` redirects to Authentik's OIDC authorize endpoint (Authorization Code + PKCE, Web Crypto only — no OIDC library in the browser).
  2. Authentik redirects back to `auth-callback.html` with a code; it's exchanged for tokens including an `id_token` (HS256, signed with the OAuth2 provider's client secret).
  3. `auth-callback.html` POSTs that `id_token` to `POST /api/customers/session`.
  4. `auth-service` verifies the `id_token`'s signature itself (`jsonwebtoken`, HS256, against `AUTHENTIK_CLIENT_SECRET`) — **not** Supabase Third-Party Auth, because Supabase only supports a fixed list of named providers (Firebase/Clerk/WorkOS/Auth0/Cognito), no generic "any OIDC issuer" option for self-hosted IdPs like Authentik.
  5. On success, mints a **Supabase-compatible JWT**: `{ sub: <authentik uuid>, role: "authenticated" }`, signed with Supabase's own **legacy JWT secret** (`SUPABASE_JWT_SECRET`), 1 hour TTL.
  6. That token is stored in `sessionStorage` and sent as `Authorization: Bearer <token>` on every subsequent Supabase PostgREST call (`window.supabaseSelectAs`/`supabaseUpdateAs` in `config.js`) — this is what makes `auth.uid()` resolve correctly in Supabase RLS policies, and what `order-service`'s `requireCustomer` middleware verifies too (same `SUPABASE_JWT_SECRET`, so `order-service` and Supabase RLS agree on identity for free).
- **Known gap:** no refresh flow — once the 1-hour token expires, `account.html` just bounces to `login.html`. See [[Known Gaps]].
- **Setup dependency:** the whole flow requires one-time manual Authentik dashboard/API setup — see `docs/AUTHENTIK_SETUP.md` (OIDC provider with `sub_mode: user_uuid`, phone scope mapping, Application). Already done for the current environment per [[Current Status]].

## 3. Seller

- **Identity store:** the `sellers` table in Supabase itself — `email` + `password_hash` (argon2, via `order-service/src/lib/password.ts`). **Standalone** — deliberately *not* tied to a customer account or Authentik; anyone can apply without ever having a DumbBrew login.
- **Application:** `POST /api/sellers/applications` (public, no auth) creates a `sellers` row with `status='pending'` and no credentials at all yet.
- **Approval = account creation:** an admin (admin JWT) calls `PATCH /api/admin/sellers/:id { status: 'approved' }`. `order-service` generates a random temp password, hashes it, sets `must_reset_password=true`, and returns **the plaintext password exactly once** in that response — it is never retrievable again. The admin must relay it to the seller out-of-band (no email infra in this repo).
- **Login:** `POST /api/sellers/auth/login` (email+password against `sellers.password_hash`) → issues a **seller JWT**, its own secret (`SELLER_JWT_SECRET`/`SELLER_JWT_ISSUER`, distinct from both `JWT_SECRET` and `SUPABASE_JWT_SECRET`), claims `{ sub: sellerId, role: "seller" }`, 7 day TTL. See `order-service/src/lib/sellerJwt.ts`.
- **First-login flow:** `must_reset_password` forces a `POST /api/sellers/auth/reset-password` before the dashboard is usable (frontend-enforced via that flag on `GET /api/sellers/me`).
- **The house seller:** DumbBrew's own catalog is just a `sellers` row with `is_house=true`, created by `order-service/src/scripts/seed-house-seller.ts` — there's no special-cased "house catalog" code path, it's a seller like any other.
- **Verification:** `order-service`'s `requireSeller` middleware only — no other service ever checks a seller token, since only `order-service` owns marketplace routes.

## Secrets summary (all env vars, see [[Docker Compose]])

| Secret | Used by | Signs/verifies |
|---|---|---|
| `JWT_SECRET` | `auth-service`, `content-service`, `order-service` | Admin access tokens |
| `SUPABASE_JWT_SECRET` | `auth-service`, `order-service` | Customer session tokens (Supabase-compatible) |
| `SELLER_JWT_SECRET` | `order-service` only | Seller tokens |
| `AUTHENTIK_CLIENT_SECRET` | `auth-service` only | Verifying Authentik's `id_token` at session-exchange time |
| `SUPABASE_SERVICE_ROLE_KEY` | `auth-service`, `order-service` | Bypasses RLS for server-side writes — never sent to the browser |
| `SUPABASE_ANON_KEY` | Frontend (`config.js`) | Public by design; RLS is the actual gate, not secrecy |

Rotating `JWT_SECRET` invalidates every outstanding admin token immediately and requires redeploying `auth-service` + `content-service` + `order-service` together (they must agree). Same logic applies per-secret to whichever services share it.
