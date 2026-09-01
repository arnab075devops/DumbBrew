#table

# Local Postgres Schema

Parent: [[Home]] · See also: [[Two Databases]], [[content-service]], [[auth-service]]

Source of truth: `backend/db/init/001_init.sql`, mounted into the `postgres` container as an init script (runs once, on first volume creation — editing this file does **not** re-run against an existing volume; you'd need a migration or a fresh volume).

Two schemas, one per owning service, in one shared Postgres instance (kept cheap — see `docs/ARCHITECTURE.md`).

## Schema `auth` (owned by [[auth-service]])

```sql
auth.admins
  id uuid PK, email unique, password_hash, created_at, updated_at

auth.refresh_tokens
  id uuid PK, admin_id → auth.admins, token_hash unique, expires_at, revoked_at, created_at
  index on admin_id
```

- `admins` has exactly one intended row in practice (the cafe owner) — created via `npm run seed:admin`, no public registration endpoint exists.
- `refresh_tokens.token_hash` stores SHA-256 of the actual token, never the raw token — see [[Auth Identity Systems]] §1 for the rotation mechanics.

## Schema `content` (owned by [[content-service]])

```sql
content.events
  id uuid PK, title, event_date, description, is_published, created_at, updated_at
  index on event_date

content.newsletter_subscribers
  id uuid PK, email unique, subscribed_at
```

- **These are legacy / admin-tool-only tables — not what the live public site reads.** The live site's events and newsletter signups go straight to **Supabase**'s `events`/`newsletter_subscribers` tables instead. See [[Two Databases]] for why both exist and which one to touch for which task.
- `is_published` has no Supabase-side equivalent — the public/Supabase `events` table has no draft state at all, every row is live.

## Extension

`pgcrypto` is enabled (for `gen_random_uuid()` as the default on every PK here).
