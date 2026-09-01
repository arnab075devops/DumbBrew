#route

# API Endpoint Map

Parent: [[Home]] · See also: [[Auth Identity Systems]], [[Rate Limits]], [[gateway]]

Every route in the system, gateway prefix → service → controller function. nginx matches the **longest URL prefix**, not declaration order — noted where that matters. Full nginx config: `backend/gateway/nginx.conf`.

Auth column legend: **none** = public · **admin** = admin JWT (`JWT_SECRET`) · **customer** = customer JWT (`SUPABASE_JWT_SECRET`) · **seller** = seller JWT (`SELLER_JWT_SECRET`) · **optional-admin** = works either way, admin gets extra data.

## auth-service (`/api/auth`, `/api/customers`) — port 4001

Source: `backend/services/auth-service/src/routes/`, `controllers/`

| Method | Path | Auth | Controller | Notes |
|---|---|---|---|---|
| POST | `/api/auth/login` | none | `login` | email+password, rate-limited 10/min at app layer + nginx `api_auth` zone (5r/s). Returns access+refresh token. |
| POST | `/api/auth/refresh` | none (bearer refresh token in body) | `refresh` | Rotates refresh token, single-use, row-locked. |
| POST | `/api/auth/logout` | none (bearer refresh token in body) | `logout` | Revokes one refresh token. |
| GET | `/api/auth/me` | admin | `me` | Decodes current access token, echoes claims. |
| POST | `/api/customers/register` | none | `registerCustomer` | Creates Authentik user + mirrors into Supabase `customers`. 10/min. Requires `termsVersion` to match `TERMS_VERSION` env exactly (409-equivalent `stale_terms_version` otherwise, not literally 409). |
| POST | `/api/customers/session` | none (bearer Authentik id_token in body) | `createCustomerSession` | Verifies Authentik `id_token`, mints Supabase-compatible JWT. 30/min. |

## content-service (`/api/events`, `/api/newsletter`) — port 4002

Source: `backend/services/content-service/src/routes/`, `controllers/`. **Legacy — not used by the live public site** (see [[Two Databases]]); talks to local Postgres `content` schema.

| Method | Path | Auth | Controller | Notes |
|---|---|---|---|---|
| GET | `/api/events` | optional-admin | `listEvents` | Public: only `is_published=true` + future dates. Admin: everything. |
| POST | `/api/events` | admin | `createEvent` | |
| PUT | `/api/events/:id` | admin | `updateEvent` | Partial update, dynamic SET clause. |
| DELETE | `/api/events/:id` | admin | `deleteEvent` | |
| POST | `/api/newsletter/subscribe` | none | `subscribe` | 5/min. Always 200 even on duplicate (`ON CONFLICT DO NOTHING`) — deliberately can't be used to enumerate subscribers. |
| GET | `/api/newsletter/subscribers` | admin | `listSubscribers` | Paginated. |
| DELETE | `/api/newsletter/subscribers/:id` | admin | `deleteSubscriber` | |

## order-service (`/api/cart`, `/api/addresses`, `/api/orders`, `/api/payments`, `/api/sellers`, `/api/admin/sellers`) — port 4003

Source: `backend/services/order-service/src/routes/`, `controllers/`. Talks to **Supabase only** (service-role key), no local Postgres dependency.

### Cart (`cart.controller.ts`) — all require **customer**

| Method | Path | Controller | Notes |
|---|---|---|---|
| GET | `/api/cart` | `getCart` | Auto-creates cart if missing. Joins product+variant+seller info. |
| POST | `/api/cart/items` | `addItem` | Checks product active + variant stock before adding. Merges quantity if line already exists (same product+variant). |
| PATCH | `/api/cart/items/:id` | `updateItem` | `quantity=0` deletes the line. |
| DELETE | `/api/cart/items/:id` | `removeItem` | |

### Addresses (`addresses.controller.ts`) — all require **customer**

| Method | Path | Controller | Notes |
|---|---|---|---|
| GET | `/api/addresses` | `listAddresses` | |
| POST | `/api/addresses` | `createAddress` | Indian pincode (6-digit) + Indian mobile number validation baked into the zod schema. `isDefault:true` clears any other default first. |
| PATCH | `/api/addresses/:id` | `updateAddress` | |
| DELETE | `/api/addresses/:id` | `deleteAddress` | |

### Orders (`orders.controller.ts`) — all require **customer**

| Method | Path | Controller | Notes |
|---|---|---|---|
| GET | `/api/orders` | `listOrders` | Includes nested `order_items` with product/variant names. |
| POST | `/api/orders/checkout` | `checkout` | 10/min. Snapshots cart → `orders`+`order_items` (`payment_status='created'`), re-validates stock, creates a Razorpay order, patches `razorpay_order_id` onto the row. **Cart is NOT cleared here** — only the webhook clears it on confirmed payment. |

### Payments (`payments.controller.ts`)

| Method | Path | Auth | Controller | Notes |
|---|---|---|---|---|
| POST | `/api/payments/verify` | customer | `verifyPayment` | Fast-path UX only — checks Razorpay's per-payment HMAC signature and returns current status. **Does not itself mark an order paid.** |
| POST | `/api/payments/webhook` | none (Razorpay signature) | `webhook` (registered directly in `index.ts`, not via `paymentsRoutes` — never gets `requireCustomer`) | **The only code path that sets `payment_status='paid'`.** Verifies `x-razorpay-signature` against the **raw** request body (see `index.ts`'s custom content-type parser that stashes `req.rawBody`). On `payment.captured`: flips status, decrements `product_variants.inventory_quantity` for variant-tracked lines, empties the customer's cart. On `payment.failed`: flips status to `failed` (only if still `created`). Unhandled events return 200 anyway so Razorpay stops retrying. nginx: matched by `location /api/payments/webhook` which is a **more specific prefix** than `/api/payments`, so it always wins regardless of block order; deliberately generous rate limit (server-to-server traffic, not a single browser). |

### Seller — public (`sellerPublic.routes.ts`, registered as sibling plugin under `/api/sellers` prefix so it does NOT inherit `sellersRoutes`' `requireSeller` hook)

| Method | Path | Auth | Controller | Notes |
|---|---|---|---|---|
| POST | `/api/sellers/applications` | none | `applyAsSeller` | One pending/approved application per email (409 `already_applied` otherwise). No credentials created yet. nginx: `api_seller_public` zone, 5r/m — tight, since it's an unauthenticated write with no signed-in principal to rate-limit by identity. |
| POST | `/api/sellers/applications/upload-url` | none | `presignApplicationUpload` | Presigned R2 PUT URL for the application's store photo, before the seller has any account. jpeg/png/webp only. |
| POST | `/api/sellers/auth/login` | none | `sellerLogin` | Timing-safe (always runs argon2.verify, even on no-match, via a dummy hash) to avoid email enumeration. Rejects if `status != 'approved'`. |

### Seller — authenticated (`sellers.routes.ts`) — all require **seller**, and all further require `sellers.status='approved'` (checked per-request via `requireApprovedSeller`, not just at JWT-issue time — a later rejection/suspension takes effect immediately)

| Method | Path | Controller | Notes |
|---|---|---|---|
| GET | `/api/sellers/me` | `getMySeller` | |
| POST | `/api/sellers/auth/reset-password` | `resetSellerPassword` | Clears `must_reset_password`. Not itself gated on `must_reset_password` being true — any logged-in seller can change their password anytime. |
| POST | `/api/sellers/uploads/presign` | `presignSellerUpload` | Presigned R2 PUT for product images, scoped under `products/<sellerId>/`. |
| GET | `/api/sellers/products` | `listMyProducts` | Nested variants/images/collection-ids. |
| POST | `/api/sellers/products` | `createMyProduct` | Also writes nested `variants`/`images`/`collectionIds` if present (see "replace" pattern below). |
| PATCH | `/api/sellers/products/:id` | `updateMyProduct` | Ownership enforced via `&seller_id=eq.<caller>` filter on the Supabase query itself (service-role key bypasses RLS, so this filter *is* the ownership check). |
| DELETE | `/api/sellers/products/:id` | `deleteMyProduct` | |
| GET | `/api/sellers/collections` | `listMyCollections` | |
| POST | `/api/sellers/collections` | `createMyCollection` | Auto-slugifies title. |
| PATCH | `/api/sellers/collections/:id` | `updateMyCollection` | Re-slugifies if title changes. |
| DELETE | `/api/sellers/collections/:id` | `deleteMyCollection` | |
| GET | `/api/sellers/orders` | `listMySales` | Reads the `seller_orders` Supabase view (paid orders only, per-seller via `security_invoker`). |
| PATCH | `/api/sellers/orders/:id/fulfill` | `fulfillOrderItem` | Sets one `order_items` row to `fulfillment_status='fulfilled'`. Per-line, not per-order (multi-seller orders ship independently). |

**Product write pattern (`createMyProduct`/`updateMyProduct`):** variants/images/collection-links are always **fully replaced**, not diffed — delete-all-then-reinsert on every save. Simple and correct at dashboard scale (a handful of variants per product), not efficient for huge catalogs. See `replaceVariants`/`replaceImages`/`replaceCollections` in `sellers.controller.ts`.

### Admin sellers (`adminSellers.routes.ts`) — all require **admin**

| Method | Path | Controller | Notes |
|---|---|---|---|
| GET | `/api/admin/sellers?status=pending` | `listSellers` | Defaults to `pending`; also accepts `approved`/`rejected`. |
| PATCH | `/api/admin/sellers/:id` | `decideSeller` | `{status:'approved'}` generates+hashes a temp password and returns it **once**, plaintext, in this response only — never retrievable again. `{status:'rejected'}` just sets status. |

## Non-`/api` routes

Every service also exposes `GET /healthz` (DB connectivity check where relevant — `order-service`'s is trivial, no local DB) and `GET /metrics` (Prometheus). nginx exposes its own `GET /healthz` returning a static `200 "ok"`. See [[Monitoring]].

## Cross-cutting behaviors worth knowing before you touch a controller

- **Ownership checks are always explicit query filters, never trust from the request body.** Every `order-service` write scopes by `req.customerId`/`req.sellerId`/`req.admin` pulled from the verified JWT, appended to the Supabase REST query string (e.g. `?id=eq.<param>&customer_id=eq.<req.customerId>`) — because the service-role key bypasses RLS, this filter *is* the entire access-control mechanism for that request. If you add a new mutating endpoint, follow this pattern exactly.
- **Zod (`z.object(...).safeParse`)** validates every request body across all three services; a failed parse returns `400 { error: "invalid_request", details: ... }`. No endpoint trusts unvalidated input.
- **Every service's error handler** (`app.setErrorHandler` in each `index.ts`) maps uncaught errors to `500 { error: "internal_error" }`, never leaking stack traces.
