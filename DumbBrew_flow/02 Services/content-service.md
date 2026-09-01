#service

# content-service

Parent: [[Home]] · See also: [[Two Databases]], [[API Endpoint Map]], [[Local Postgres Schema]]

**Path:** `backend/services/content-service/` · **Port:** 4002 · **Framework:** Fastify + TypeScript · **DB:** local Postgres `content` schema (`pg` pool)

## Responsibility

Admin-only CRUD for events and newsletter subscribers, against **local Postgres — not Supabase**. This was v1's original scope (see `docs/ARCHITECTURE.md`) intended to back an eventual admin panel.

> [!important] Not used by the live public site
> `index.html`'s events section and the newsletter signup form read/write **Supabase** directly from the browser (see [[Two Databases]]). This service and its tables are currently dead weight from the live site's perspective — only relevant if/when an admin panel gets built against it, or if you're asked to manage `content.events`/`content.newsletter_subscribers` specifically (distinct from the Supabase tables of nearly the same name).

## File map

```
src/
  index.ts                              Fastify bootstrap, /healthz, /metrics, route registration
  config.ts                             Env vars
  db.ts                                 pg Pool
  middleware/
    auth.middleware.ts                  requireAdmin — verifies JWT_SECRET-signed admin token (duplicated
                                         from auth-service's verification logic, not imported)
    optionalAdmin.middleware.ts         optionalAdmin — attaches req.admin if a valid token is present,
                                         else proceeds anonymously (used on GET /api/events so admins see
                                         unpublished/past events too)
  routes/
    events.routes.ts                    → /api/events (GET public/optional-admin, POST/PUT/DELETE admin)
    newsletter.routes.ts                → /api/newsletter/subscribe (public), /subscribers (admin)
  controllers/
    events.controller.ts                Public GET filters to is_published=true AND event_date >= today;
                                         admin GET returns everything. PUT does a dynamic SET clause built
                                         from whichever fields were sent.
    newsletter.controller.ts            subscribe always returns 200 regardless of duplicate (no enumeration
                                         via response code). listSubscribers is paginated (page/pageSize,
                                         capped at 100/page).
```

## Key env vars

`DATABASE_URL`, `JWT_SECRET`, `JWT_ISSUER`, `CORS_ORIGIN`, `PORT` (4002).

## Things to know before editing

- If you're asked to "fix the events section on the site," this is very likely the **wrong file** — check `backend/gateway/public/index.html`'s fetch calls and `supabase/schema.sql`'s `events` table first.
- `requireAdmin` here is a near-duplicate of `order-service`'s — same JWT_SECRET, same claims shape, independently implemented. Keep both in sync if the admin claims shape changes.
