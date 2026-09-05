#gap

# Known Gaps

Parent: [[Home]] · See also: [[Current Status]], [[Credentials]]

Technical-debt-shaped items, distinct from [[Current Status]]'s point-in-time snapshot — these are structural things to know about regardless of when you're reading this, until they're actually fixed.

## No customer session refresh

`auth-callback.html` stores Authentik's `id_token`/the exchanged Supabase JWT in `sessionStorage` with no refresh flow. Once the 1-hour token expires, `account.html` (and any other authenticated page) just bounces the customer back to `login.html`. Documented as an accepted tradeoff in `docs/AUTHENTIK_SETUP.md` and `CONTEXT.md` — "fine for now," flagged as a reasonable follow-up if session length becomes annoying. See [[Auth Identity Systems]] §2.

## `order-service` missing from OCI CI/CD pipeline

`infra/devops-pipelines/build_spec.yaml` builds/pushes `auth-service`, `content-service`, `gateway` — no `order-service` stage exists. Since `order-service` is the newest and largest service (the whole marketplace), the OCI/Terraform deployment path (see [[Terraform OCI]]) cannot currently ship it. Whoever picks up the OCI deployment work needs to add an `order-service` build stage (and corresponding deploy-stage image var / lint step) before that path is usable end-to-end.

## `creds.txt` is not gitignored

`.gitignore` excludes `.env`, `.env.*` (with `.env.example` allowed back in), `rzp-key.csv`, Terraform state/secrets, and `*.pem`/`*.key` — but **not** `creds.txt` at the repo root. If that file has ever held real credentials, they're committed to git history regardless of the file's current contents (removing/editing it now doesn't scrub history). Worth checking its contents and git history before treating it as harmless, and adding it to `.gitignore` (plus rotating anything it contained) if it does hold live secrets.

## `content-service` / local Postgres `content` schema is orphaned from the live site

Not a bug, but easy to waste time on: any request to "fix the events on the homepage" or "the newsletter signup isn't working" almost certainly means the **Supabase** `events`/`newsletter_subscribers` tables and the frontend's direct `supabaseSelect`/`supabaseInsert` calls, not `content-service`'s admin CRUD against local Postgres. See [[Two Databases]] before spending time in the wrong service.

## Legal content not lawyer-reviewed

`terms.html`/`data-policy.html` — DPDP Act 2023-aware draft only. Grievance Officer / hosting-region placeholders in `data-policy.html` are literal placeholders, not filled in. Flag this explicitly if a task involves actually shipping the site for real users in India.

## `_preview-account.html` and `seller-register.html` are not live pages

Both confirmed harmless: `seller-register.html` is a pure redirect stub to `seller-apply.html` (old bookmarks), and `_preview-account.html` fakes a signed-in session with canned data so `account.html`'s design can be screenshotted without a live backend — explicitly commented "PREVIEW-ONLY STUB — not part of the shipped app." Neither is linked from site nav. Safe to ignore when tracing real user flows; don't confuse `_preview-account.html`'s canned data with a real bug in `account.html` itself.
