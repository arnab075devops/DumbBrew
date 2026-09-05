#table

# Supabase Schema

Parent: [[Home]] · See also: [[Two Databases]], [[API Endpoint Map]], [[Auth Identity Systems]]

Source of truth: `supabase/schema.sql` — idempotent, `CREATE TABLE IF NOT EXISTS` throughout, safe to re-run. Project: `odblggwrwksmycpxaptp`. Every table has RLS enabled; policies noted below.

## Public marketing content (RLS: public `select`, no writes from the browser)

| Table | Key columns | Notes |
|---|---|---|
| `brews` | `slug`, `name`, `price`, `image_key`, `method`, `featured`, `sort`, `product_id` (nullable FK → `products`) | `product_id` links a marketing-page brew to its commerce-catalog product, so "Add to Cart" can appear without duplicating data. |
| `menu_categories` → `menu_items` | `title`/`name`, `price`, `sort`, `product_id` on items | Same product-link pattern as `brews`. |
| `story`, `story_milestones` | headline/body/quote, year/title/description | Singleton-ish (`story` has one row, guarded by `where not exists`). |
| `brew_methods` | `slug`, `label`, `description`, `image_key` | Gallery page content. |
| `events` | `event_date`, `title`, `description` | **Distinct from `content.events` in local Postgres** — see [[Two Databases]]. This is the one the live site reads. |
| `testimonials` | `quote`, `name`, `sort` | |
| `visit_info` | address/hours/phone/email | Singleton. |
| `newsletter_subscribers` | `email` (unique) | RLS: public **insert-only** — no select/update/delete for anon, so signups can't be read back or tampered with from the browser. |

`image_key` columns store just the R2 object filename (e.g. `brew-regular.jpg`), never a full URL — `assetUrl()` in `config.js` builds the URL at render time so switching R2 buckets/domains needs no data migration.

## Admin-authored content

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `tutorials` | `slug` (unique), `title`, `excerpt`, `category`, `thumbnail_key`, `video_url`, `body_html`, `published`, `published_at` | `select`: `published=true` only. **No insert/update/delete policy** — writes only via `order-service`'s `/api/admin/tutorials` routes (service-role key, `requireAdmin`), same model as `visit_info`. | The site's "Tutorials" section (recipe/how-to articles). `body_html` is authored via Quill in `admin-tutorials.html` and rendered with raw `innerHTML` on `tutorial.html` — trusted content only (admin-authored), not sanitized against arbitrary HTML. `thumbnail_key` resolves through the **separate** `R2_TUTORIALS_BASE` bucket, not `assetUrl`'s `R2_BASE` — see [[config.js Reference]]. |

## Customer accounts

| Table/View | Key columns | RLS |
|---|---|---|
| `customers` | `id` (= Authentik user UUID, **not** `gen_random_uuid()`), `email`, `username`, `phone_number`, `full_name`, `status`, `terms_accepted_at`, `terms_version` | `select`/`update`: `auth.uid() = id`. **No insert/delete policy at all** — only `auth-service`'s service-role key can create rows (registration flow). `status` is a constrained set of presence badges: `busy`/`out_of_office`/`vacation`/`vibing`/`feeling_hot`/`focusing`/`working` (or null). |
| `customer_directory` (view) | `id`, `username`, `full_name`, `status`, `status_updated_at` | Runs with the **view owner's** privileges (not `security_invoker`) — deliberately exposes non-sensitive columns to everyone (including anon), bypassing the "own row only" policy on `customers` by design. Keep this view to non-sensitive columns only if you extend it. |

**Isolation pattern for any future per-customer table:** add `customer_id uuid references customers(id)` + a policy `using (auth.uid() = customer_id)`. This exact pair is used by `addresses`, `carts`, and (transitively via `carts`) `cart_items` below — it's the whole mechanism, documented directly in `schema.sql` above the `customers` policy.

## Marketplace

Ownership model: **RLS is defense-in-depth for direct PostgREST access; the actual authority for money-touching writes is `order-service`'s service-role key + app-level `req.customerId`/`req.sellerId` scoping** (see [[API Endpoint Map]]). Reads (public catalog, a customer's own cart) do go straight from the browser with the anon key.

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `sellers` | `id` (uuid, own PK — **no longer FK'd to `customers`**), `store_name`, `status` (`pending`/`approved`/`rejected`), `is_house`, `email`, `password_hash`, `must_reset_password`, address fields, `gst_number`, `store_image_key` | **No policies at all** — a seller JWT is signed with its own secret, `auth.uid()` never resolves for a seller, so a policy keyed on it would be dead code. Every access goes through `order-service`. | Standalone identity — see [[Auth Identity Systems]] §3. The `sellers_id_fkey` to `customers` was explicitly dropped in a migration comment in `schema.sql` — a seller no longer needs a customer account. |
| `seller_directory` (view) | `id`, `store_name` where `status='approved'` | Owner-privilege view, public select | |
| `products` | `seller_id` FK, `name`, `price`, `image_key`, `category`, `active`, `sort` | `select`: `active=true` (public). `all` (insert/update/delete): `auth.uid() = seller_id` — **note this policy is effectively dead too**, since sellers never get a Supabase-recognized `auth.uid()`; the real gate is `order-service`. | A product with **zero `product_variants` rows** is a "simple product" — price/inventory come from this table directly. Once variants exist, they become the source of truth. |
| `product_variants` | `product_id` FK, `sku`, `title`, `price`, `compare_at_price`, `inventory_quantity`, `position` | `select`: parent product must be `active` | Inventory is decremented here by the payment webhook on `payment.captured`, never at add-to-cart or checkout time. |
| `product_images` | `product_id` FK, `image_key`, `position`, `alt` | Same pattern as variants | |
| `collections` → `product_collections` | seller-owned title/slug/description; join table | `select`: public | |
| `addresses` | `customer_id` FK, address fields, `is_default` | `all`: `auth.uid() = customer_id` | One default cleared at a time (`clearDefault` in the controller) before setting a new one. |
| `carts` (1 per customer, `unique(customer_id)`) → `cart_items` | `cart_id`, `product_id`, `variant_id` (nullable), `quantity` | `all`: `auth.uid() = customer_id` (carts) / via join to owning cart (cart_items) | `unique(cart_id, product_id, variant_id)` — NULL `variant_id` is treated as distinct per Postgres unique-constraint semantics, but `order-service`'s find-or-create logic is what actually enforces "one line per product+variant combo" in practice; the constraint is defense-in-depth. |
| `orders` | `customer_id`, `address_id`, `razorpay_order_id` (unique), `razorpay_payment_id`, `amount`, `payment_status` (`created`/`paid`/`failed`) | `select`: `auth.uid() = customer_id` (own orders) **or** `exists(... order_items.seller_id = auth.uid())` (a seller's own sales, added once `order_items` exists further down in the file). No customer insert/update policy — order-service-only. | **`payment_status` is the entire "prepaid only" enforcement mechanism** — nothing anywhere treats a non-`paid` order as real. Only the Razorpay webhook handler moves it to `paid`/`failed`. |
| `order_items` | `order_id`, `product_id`, `variant_id`, `seller_id` (copied from `products.seller_id` at checkout, not joined — lets a seller's RLS policy avoid reaching through `orders`/`products`), `quantity`, `unit_price`, `fulfillment_status` (`unfulfilled`/`fulfilled`), `fulfilled_at` | `select`: as customer (via parent order) or as seller (`auth.uid() = seller_id`) | Per-**line** fulfillment, not per-order — one multi-seller order ships in independent pieces. |
| `seller_orders` (view) | order_item_id, order_id, seller_id, product_id, quantity, unit_price, created_at, customer_id, product_name — only `payment_status='paid'` orders | **`security_invoker = true`** — unlike the other views in this file, this one deliberately runs with the *querying role's* RLS, not the owner's, so each seller only ever sees their own sales via `order_items`' `auth.uid() = seller_id` policy. | This is the one view where `security_invoker` is load-bearing; getting it backwards would leak every seller's sales to every other seller. |

## Full dependency order (for re-running/migrating by hand)

`brews`/`menu_categories`/`menu_items`/`story`/`story_milestones`/`brew_methods`/`events`/`testimonials`/`visit_info`/`newsletter_subscribers` (independent) → `customers` → `sellers` → `products` (FK `sellers`) → `addresses`/`carts` (FK `customers`) → `cart_items` (FK `carts`,`products`) → `orders` (FK `customers`,`addresses`) → `order_items` (FK `orders`,`products`,`sellers`) → `seller_orders` view → `product_variants`/`product_images`/`collections` (FK `products`/`sellers`) → `product_collections` → `cart_items.variant_id`/`order_items.variant_id` (added as ALTER, after variants exist).
