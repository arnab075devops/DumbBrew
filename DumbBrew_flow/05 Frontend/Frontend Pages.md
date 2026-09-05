#page

# Frontend Pages

Parent: [[Home]] · See also: [[config.js Reference]], [[API Endpoint Map]], [[gateway]]

All pages live in `backend/gateway/public/`. **No build step, no framework, no shared includes** — every page is self-contained HTML using a tiny "design canvas" component runtime (`DCLogic`/React, loaded from `support.js`). Nav/footer/fonts/GSAP scroll effects are duplicated across files on purpose. **If you add a page, copy an existing one and edit the middle section** — don't try to extract a shared layout, that's a deliberate tradeoff for zero build tooling.

## Marketing (public, read-only, Supabase anon key)

| Page | Reads | Notes |
|---|---|---|
| `index.html` | `brews`, `events`, `testimonials`, ... | Home — teaser sections linking to every detail page. Largest file (35K). |
| `brews.html` | `brews` | All brews. |
| `menu.html` | `menu_categories`, `menu_items` | Full menu. |
| `story.html` | `story`, `story_milestones` | |
| `gallery.html` | `brew_methods` | One card per brew method. |
| `visit.html` | `visit_info` | Hours/address/parking/wifi/groups. |
| `tutorials.html` | `tutorials` (published only) | Grid/listing page, category filter client-side. |
| `tutorial.html` | `tutorials` (`?slug=`, published only) | Single article; renders `body_html` (Quill-authored) directly into the DOM via `innerHTML`. Thumbnails/inline images resolve through `window.tutorialAssetUrl`, a **separate** R2 bucket from `assetUrl`'s (see [[config.js Reference]]). |

## Customer auth & profile

| Page | Talks to | Notes |
|---|---|---|
| `register.html` | `POST {API_BASE}/api/customers/register` | Sends `termsVersion: APP_CONFIG.TERMS_VERSION` — must match `auth-service`'s `TERMS_VERSION` env exactly. |
| `login.html` | Authentik OIDC authorize endpoint | Builds the PKCE challenge with Web Crypto directly, no OIDC client library. Redirects to Authentik, not an in-page form. |
| `auth-callback.html` | Authentik token endpoint, then `POST {API_BASE}/api/customers/session` | Exchanges the OIDC code for tokens, then exchanges the `id_token` for a Supabase-compatible JWT, stores it in `sessionStorage`, redirects to `account.html`. |
| `account.html` | Supabase `customers` (via `supabaseSelectAs`, bearer = the session JWT) + `customer_directory` (public, anon key) | Shows the signed-in customer's own profile + a public presence directory of other users' status badges. Bounces to `login.html` if the session token is missing/expired (no refresh flow — see [[Known Gaps]]). |
| `terms.html`, `data-policy.html` | static | DPDP Act 2023-aware draft. **Not lawyer-reviewed** — flag this if asked about shipping for real, especially the Grievance Officer / hosting-region placeholders in `data-policy.html`. |
| `_preview-account.html` | — (fakes Supabase responses locally) | Explicitly a "PREVIEW-ONLY STUB — not part of the shipped app": fakes a signed-in session + canned `customers` row so `account.html`'s design can be screenshotted without a live backend. Not linked from nav, not part of any real flow. |

## Marketplace (shopping)

| Page | Talks to | Notes |
|---|---|---|
| `shop.html` | Supabase `products` (active only) + `seller_directory` (anon key, direct) | Public catalog browse, no auth needed to view. |
| `cart.html` | `order-service` `/api/cart`, `/api/addresses`, `/api/orders/checkout` (customer JWT from `sessionStorage`) | Cart management + checkout kickoff → hands off to Razorpay's own checkout UI. |

## Seller-facing

| Page | Talks to | Notes |
|---|---|---|
| `seller-apply.html` | `POST {API_BASE}/api/sellers/applications`, `/applications/upload-url` | Public application form, no DumbBrew account needed. Uploads a store photo via a presigned R2 URL before submitting. |
| `seller-register.html` | redirects to `seller-apply.html` | Pure redirect stub (meta-refresh + JS), kept only so old bookmarks/links to a formerly-customer-gated registration flow don't 404. Seller applications moved to the public `seller-apply.html`; sellers never self-register a password — they get one from admin approval (see [[Auth Identity Systems]] §3). |
| `seller-dashboard.html` | `order-service` `/api/sellers/*` (seller JWT) | Login form + full dashboard: products/variants/images, collections, sales, fulfillment. Largest marketplace page (25K). |

## Admin

| Page | Talks to | Notes |
|---|---|---|
| `admin-sellers.html` | `order-service` `POST /api/auth/login` (admin) then `/api/admin/sellers`, `/api/admin/reports`, `/api/admin/visit-info`, `/api/admin/tutorials` | Single admin dashboard, tabbed (Applications / Reports / Storefront / Tutorials — client-side tabs via `currentView`, one `#view-body` container, no page navigation). Tutorials tab: list/create/edit/delete, Quill rich-text editor for `body_html`, thumbnail upload via presigned R2 URL (separate `R2_TUTORIALS` bucket, see [[config.js Reference]]). The old standalone `admin-tutorials.html` was merged into this file and removed. Note: admin login itself goes through `auth-service` (port 4001 behind `/api/auth`), then all admin-decision calls go through `order-service` — two different services, same admin JWT. See [[API Endpoint Map]] for the route table. |

## Shared runtime

`config.js` (see [[config.js Reference]]) is loaded by every page and provides `window.APP_CONFIG` plus the `supabaseSelect`/`supabaseSelectAs`/`supabaseUpdateAs`/`assetUrl` helper functions every page's inline script calls.

### ⚠ Gotcha: don't detach/reparent nodes the `DCLogic`/React runtime owns

`auth-nav.js` (injects the login/avatar swap) and `search.js` (the nav search panel) both learned this the hard way (fixed 2026-09-06, see commit `4aa19f5`): every page's nav is owned by the `DCLogic`/React component runtime (`support.js`), which re-renders on `boot()`'s async `fetch(location.href) → updateHtml()` cycle on every navigation. A helper script that calls `node.replaceWith(...)` or reparents/wraps a node React still holds a reference to (e.g. wrapping a button in a new positioning `<span>`) leaves React holding a stale reference; the next re-render's reconciliation can then fail and abort mid-commit, leaving **unrelated sibling nav items** (the Tutorials link, in the bug that prompted this) in a half-updated/broken state — the failure isn't scoped to the node you touched.
**Fix pattern**: never move or replace a node the runtime rendered. Hide with `style.display='none'` instead of `replaceWith()`/removal (React never wrote that property, so it won't diff it back); for floating UI (dropdowns/panels), append to `document.body` and position with `getBoundingClientRect()` + `position:fixed`, recomputed on scroll/resize, instead of wrapping the anchor element. Apply this pattern to any future nav-injecting script.
