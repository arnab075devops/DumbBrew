# Authentik setup (one-time, manual)

This is the part of customer SSO that can't be scripted from outside a
running system: Authentik doesn't exist until you deploy the updated
`backend/docker-compose.yml`, and Supabase's Third-Party Auth needs
Authentik's live issuer URL to point at. Do these steps once, in order,
after `docker compose up` brings `authentik-server`/`authentik-worker` up
healthy.

Everything referenced here (`auth-service`, `config.js`, `supabase/schema.sql`)
is already wired up in code — this doc only covers the dashboard clicks.

## 1. Bootstrap admin + API token

1. Open `http://<host>:9000` (local dev: `http://localhost:9000`).
2. Log in with `AUTHENTIK_BOOTSTRAP_EMAIL` / `AUTHENTIK_BOOTSTRAP_PASSWORD`
   from your `.env`.
3. Go to **Admin interface → Directory → Tokens**, create a new token for
   the bootstrap user (or a dedicated service account), with no expiry (or a
   long one you'll rotate).
4. Put that token in your deployed `.env` as `AUTHENTIK_API_TOKEN`, then
   restart `auth-service` (`docker compose restart auth-service`) so it
   picks it up. This is what lets `/api/customers/register` create users.

## 2. Phone number claim

1. **Customization → Property Mappings → Create → Scope Mapping.**
   - Name: `DumbBrew: phone number`
   - Scope name: `phone`
   - Expression:
     ```python
     return {"phone_number": request.user.attributes.get("phone_number")}
     ```
2. `auth-service` already writes `phone_number` onto the user as a plain
   attribute when it creates the Authentik user via the admin API — nothing
   else to configure for that part.

## 3. OAuth2/OIDC Provider

**Applications → Providers → Create → OAuth2/OpenID Provider.**

- Name: `DumbBrew site`
- Authorization flow: the default authorization flow is fine.
- Client type: **Public** (no client secret — the site is a browser SPA
  using Authorization Code + PKCE).
- Redirect URIs: add both
  - `http://localhost:8088/auth-callback.html` (local dev)
  - `https://<your-production-domain>/auth-callback.html`
- Scopes: `openid`, `email`, `profile`, plus the `phone` scope from step 2.
- **Subject mode: "Based on the User's UUID".** This matters — it's what
  makes the `sub` claim in the id_token a stable UUID that matches the `id`
  column `auth-service` writes into Supabase's `customers` table at
  registration time. Any other subject mode breaks the link between an
  Authentik login and the right `customers` row.

## 4. Application

**Applications → Applications → Create.** Bind it to the provider from
step 3. Copy the provider's **Client ID** into
`backend/gateway/public/config.js` → `AUTHENTIK_CLIENT_ID`, and set
`AUTHENTIK_URL` there to the same host you configured in `.env`.

## 5. Account hygiene

- **Directory → Users → (the default) → disable "Allow duplicate emails"**
  if present in your Authentik version — belt-and-suspenders alongside the
  `customers.email` unique constraint in `supabase/schema.sql`.
- Confirm the default password policy is attached to the flow used when
  `auth-service` calls `set_password` — Authentik enforces it server-side
  regardless of what the registration form's client-side `minlength="8"`
  allows through.
- Self-service enrollment isn't needed — `register.html` → `auth-service` is
  the only intended way to create an account — so you can leave Authentik's
  own enrollment flow disabled/unlinked from any application if you'd rather
  not expose it.

## 6. Session exchange (replaces Supabase Third-Party Auth)

Supabase's Third-Party Auth only supports a fixed list of named providers
(Firebase, Clerk, WorkOS, Auth0, Amazon Cognito) — there's no generic
"add any OIDC issuer" option, so a self-hosted Authentik can't be added
there directly. Instead, `auth-service` verifies Authentik's id_token
itself and mints a Supabase-compatible JWT, so `auth.uid()` in RLS still
resolves the same way.

1. Get the OAuth2 **provider's client secret** — visible in the response
   when you create the provider via the API, or Applications → Providers →
   (your provider) → the client secret field in the dashboard. Authentik
   signs id_tokens with this as an HS256 HMAC key even for a "public"
   client, so it doubles as the verification key.
2. Get Supabase's **legacy JWT secret**: Supabase dashboard → Project
   Settings → API → JWT Settings → "JWT Secret" (not the anon or
   service_role key — a separate long base64 string).
3. Set in `.env` (and in `docker-compose.yml`'s `auth-service.environment`
   block, so it's actually passed into the container):
   ```
   AUTHENTIK_CLIENT_ID=<same value as config.js AUTHENTIK_CLIENT_ID>
   AUTHENTIK_CLIENT_SECRET=<the provider's client secret>
   AUTHENTIK_ISSUER=http://<host>:9000/application/o/<application-slug>/
   SUPABASE_JWT_SECRET=<Supabase's legacy JWT secret>
   ```
4. Rebuild `auth-service` (`docker compose up -d --build auth-service`).
   `auth-callback.html` now POSTs Authentik's id_token to
   `/api/customers/session`, which verifies it and returns a Supabase JWT;
   that's what gets stored in `sessionStorage` and sent as the bearer token
   in `window.supabaseSelectAs` calls (see `account.html`).

## Verifying it all works

1. `register.html` — create a test account, confirm `201` and the row lands
   in Supabase `customers`.
2. `login.html` → redirects to Authentik → log in → lands on
   `auth-callback.html` → redirects to `account.html` showing the right
   username/email/phone.
3. Register a second test account, confirm it can't see the first account's
   row (proves RLS isolation via `auth.uid()`).
4. Known gap: `auth-callback.html` stores Authentik's `id_token` in
   `sessionStorage` with no refresh flow — once it expires (Authentik's
   default is short, minutes not hours), `account.html` sends the customer
   back to `login.html`. Fine for now; a refresh-token flow is a reasonable
   follow-up if session length becomes an issue.
