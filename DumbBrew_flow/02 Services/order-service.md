#service

# order-service

Parent: [[Home]] · See also: [[API Endpoint Map]], [[Supabase Schema]], [[Auth Identity Systems]]

**Path:** `backend/services/order-service/` · **Port:** 4003 · **Framework:** Fastify + TypeScript · **DB:** none locally — **Supabase only**, via service-role key over HTTPS (PostgREST). Also talks to Razorpay and Cloudflare R2.

## Responsibility

The entire marketplace: cart, addresses, checkout, Razorpay payments (order creation, fast-path verify, and the authoritative webhook), seller applications/approval/login, and the seller-facing product/collection/order-fulfillment dashboard API. The newest and largest service in the repo — see recent commits ("Razorpay integration for order service", "Public seller onboarding with generated credentials + Shopify-style catalog").

## File map

```
src/
  index.ts                     Fastify bootstrap. Notably: a custom application/json content-type parser
                                that stashes the RAW request body (req.rawBody) before JSON-parsing it —
                                required so the Razorpay webhook signature can be verified byte-for-byte
                                against what Razorpay actually sent (re-serializing parsed JSON wouldn't
                                match). depends_on: [] overrides service-common's Postgres health-dependency
                                since this service never touches local Postgres at all.
  config.ts                    Env vars: SUPABASE_URL/KEY, RAZORPAY_*, SELLER_JWT_*, R2_*, JWT_SECRET (admin)
  lib/
    supabase.ts                supabaseRequest/supabaseJson — thin fetch wrapper against PostgREST using the
                                service-role key. THE central comment to read: "never trust a request body's
                                own customer/seller id" — every query's ownership check is an explicit
                                ?customer_id=eq.<req.customerId> filter, not RLS (which this key bypasses).
    razorpay.ts                createRazorpayOrder, verifyPaymentSignature (fast-path, HMAC of
                                "orderId|paymentId"), verifyWebhookSignature (authoritative, HMAC of raw body)
    r2.ts                      createUploadUrl — presigned S3-compatible PUT URL (5 min expiry) for seller/
                                product images. The ONLY write path to R2 in the repo; everything else just
                                reads pre-uploaded objects via the public R2_BASE URL.
    sellerJwt.ts                signSellerToken / verifySellerToken — standalone seller JWT, own secret
    password.ts                 argon2 hash/verify + generateTempPassword (for admin-approval-generated
                                seller credentials)
  middleware/
    requireCustomer.ts           Verifies SUPABASE_JWT_SECRET-signed token → req.customerId
    requireSeller.ts             Verifies SELLER_JWT_SECRET-signed token, role==="seller" → req.sellerId
    requireAdmin.ts              Verifies JWT_SECRET-signed token, role==="admin" → req.admin (duplicated
                                  from content-service's implementation)
  routes/                        addresses / adminSellers / cart / orders / payments / sellerPublic /
                                  sellers — see [[API Endpoint Map]] for the full route table
  controllers/                   addresses / adminSellers / cart / orders / payments / sellerApplications /
                                  sellerAuth / sellers / uploads — see [[API Endpoint Map]]
  scripts/
    seed-house-seller.ts         Creates DumbBrew's own seller row (is_house=true) and its products — the
                                  "house catalog" has no special-cased code path, it's a seller like any other
```

## Things to know before editing

- **No local database.** Don't add a `pool.query` call here — everything goes through `lib/supabase.ts`. If you need a new table, add it to `supabase/schema.sql`, not `backend/db/init/`.
- **Payment status is only ever set by the webhook**, never by `checkout` or `verify`. If a task involves "orders aren't showing as paid," check the webhook path and Razorpay dashboard delivery logs first, not the checkout controller.
- **Product/variant/image/collection writes are full-replace, not diffed** (`replaceVariants`/`replaceImages`/`replaceCollections` in `sellers.controller.ts`) — every save deletes and reinserts. Fine at current scale; would need rework for large catalogs.
- **Seller approval is account creation.** There's no separate "create seller login" step — `decideSeller` in `adminSellers.controller.ts` generates and hashes the password in the same call that flips `status` to `approved`.
- Three different JWT secrets are verified across this one service's middleware (`requireCustomer`, `requireSeller`, `requireAdmin`) — see [[Auth Identity Systems]] for which is which before adding a new authenticated route.
