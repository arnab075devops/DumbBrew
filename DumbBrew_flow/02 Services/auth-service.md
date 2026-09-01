#service

# auth-service

Parent: [[Home]] · See also: [[Auth Identity Systems]], [[API Endpoint Map]], [[Local Postgres Schema]]

**Path:** `backend/services/auth-service/` · **Port:** 4001 · **Framework:** Fastify + TypeScript · **DB:** local Postgres `auth` schema (`pg` pool) + Supabase (service-role key, HTTP) + Authentik (admin API, HTTP)

## Responsibility

Two unrelated-feeling jobs bundled into one service because they're both "identity":
1. **Admin auth** — login/refresh/logout/me against `auth.admins` in local Postgres. See [[Auth Identity Systems]] §1.
2. **Customer identity** — registration (creates an Authentik user + mirrors into Supabase `customers`) and session exchange (verifies an Authentik `id_token`, mints a Supabase-compatible JWT). See [[Auth Identity Systems]] §2.

## File map

```
src/
  index.ts                        Fastify bootstrap, CORS, rate-limit, /healthz, /metrics, route registration
  config.ts                       Env var loading (DATABASE_URL, JWT_SECRET, ACCESS_TOKEN_TTL, AUTHENTIK_*, SUPABASE_*, TERMS_VERSION, ...)
  db.ts                           pg Pool for local Postgres
  utils/jwt.ts                    signAccessToken / verifyAccessToken (admin JWTs, JWT_SECRET)
  routes/
    auth.routes.ts                → /api/auth/{login,refresh,logout,me}
    customers.routes.ts           → /api/customers/{register,session}
  controllers/
    auth.controller.ts            Admin login/refresh/logout/me. Argon2 password verify (timing-safe dummy-hash
                                   path on missing user, to avoid enumeration). Refresh rotation is a row-locked
                                   (FOR UPDATE) transaction — old token revoked, new one issued atomically.
    customers.controller.ts       registerCustomer (Authentik user create + Supabase mirror, with rollback of
                                   the Authentik user if the Supabase insert fails) and createCustomerSession
                                   (verifies Authentik id_token HS256 against AUTHENTIK_CLIENT_SECRET, mints
                                   a { sub, role: "authenticated" } JWT signed with SUPABASE_JWT_SECRET).
  scripts/
    seed-admin.ts                 npm run seed:admin — the ONLY way an admin account is created/rotated.
                                   Reads ADMIN_EMAIL/ADMIN_PASSWORD from the environment at invocation time.
```

## Key env vars (see `.env.example`, [[Docker Compose]])

`DATABASE_URL`, `JWT_SECRET`, `JWT_ISSUER`, `ACCESS_TOKEN_TTL` (15m), `REFRESH_TOKEN_TTL_DAYS` (7), `AUTHENTIK_URL`, `AUTHENTIK_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TERMS_VERSION`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET`, `AUTHENTIK_ISSUER`, `SUPABASE_JWT_SECRET`.

`registerCustomer` and `createCustomerSession` both **503** with a descriptive log line if their respective required env vars aren't set — check those first if either flow returns 503 in any environment.

## Things to know before editing

- Admin JWT verification is **duplicated** (not shared as a library) in `content-service` and `order-service`'s own `requireAdmin` middleware — if you change the claims shape here, update both.
- `TERMS_VERSION` must match what `config.js`'s `TERMS_VERSION` sends from `register.html`, or every registration 400s with `stale_terms_version`. Bump both together.
- Deleting the compensating Authentik-user-delete-on-Supabase-insert-failure logic (`customers.controller.ts`) would leave orphan Authentik accounts on any race — don't remove it as "unnecessary" cleanup.
