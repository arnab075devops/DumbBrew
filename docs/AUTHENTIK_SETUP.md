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

## 6. Supabase Third-Party Auth

1. Supabase dashboard → **Authentication → Sign In / Providers → Third
   Party Auth → Add provider.**
2. Issuer URL: `http://<host>:9000/application/o/<application-slug>/`
   (the slug is whatever you named the Application in step 4) — Supabase
   fetches `.well-known/openid-configuration` from that automatically.
3. Save. This is what makes `auth.uid()` resolve correctly in the
   `customers` table's RLS policies for a request carrying Authentik's
   `id_token` as its bearer token (see `window.supabaseSelectAs` in
   `config.js` — that's how `account.html` reads a customer's own row).

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
