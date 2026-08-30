-- DumbBrew content schema for Supabase.
-- Run once in the Supabase SQL Editor (or `supabase db push` if you use the
-- CLI). Safe to re-run: everything is CREATE TABLE IF NOT EXISTS.
--
-- Images: store the R2 object key only (e.g. 'brew-regular.jpg'), not a full
-- URL — the frontend builds the URL via assetUrl() in config.js so switching
-- R2 buckets/domains never requires a data migration.
--
-- RLS: every table is readable by anon (this is a public marketing site,
-- there's no per-user data). newsletter_subscribers is insert-only for
-- anon — no anon select/update/delete, so signups can't be read back or
-- tampered with from the browser.

create table if not exists brews (
  id bigint generated always as identity primary key,
  slug text unique not null,
  num text not null,
  name text not null,
  description text not null,
  price numeric(6,2) not null,
  image_key text not null,
  method text,
  featured boolean not null default false,
  sort int not null default 0
);

create table if not exists menu_categories (
  id bigint generated always as identity primary key,
  title text not null,
  sort int not null default 0
);

create table if not exists menu_items (
  id bigint generated always as identity primary key,
  category_id bigint not null references menu_categories(id) on delete cascade,
  name text not null,
  description text not null,
  price numeric(6,2) not null,
  sort int not null default 0
);

create table if not exists story (
  id bigint generated always as identity primary key,
  headline text not null,
  body text not null,
  quote text not null,
  image_key text not null
);

create table if not exists story_milestones (
  id bigint generated always as identity primary key,
  year text not null,
  title text not null,
  description text not null,
  sort int not null default 0
);

create table if not exists brew_methods (
  id bigint generated always as identity primary key,
  slug text unique not null,
  label text not null,
  description text not null,
  image_key text not null,
  sort int not null default 0
);

create table if not exists events (
  id bigint generated always as identity primary key,
  event_date date not null,
  title text not null,
  description text
);

create table if not exists testimonials (
  id bigint generated always as identity primary key,
  quote text not null,
  name text not null,
  sort int not null default 0
);

create table if not exists visit_info (
  id bigint generated always as identity primary key,
  address text not null,
  address_note text,
  hours_weekday text not null,
  hours_weekend text not null,
  phone text,
  email text
);

create table if not exists newsletter_subscribers (
  id bigint generated always as identity primary key,
  email text unique not null,
  created_at timestamptz not null default now()
);

alter table brews enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table story enable row level security;
alter table story_milestones enable row level security;
alter table brew_methods enable row level security;
alter table events enable row level security;
alter table testimonials enable row level security;
alter table visit_info enable row level security;
alter table newsletter_subscribers enable row level security;

drop policy if exists "public read" on brews;
create policy "public read" on brews for select using (true);
drop policy if exists "public read" on menu_categories;
create policy "public read" on menu_categories for select using (true);
drop policy if exists "public read" on menu_items;
create policy "public read" on menu_items for select using (true);
drop policy if exists "public read" on story;
create policy "public read" on story for select using (true);
drop policy if exists "public read" on story_milestones;
create policy "public read" on story_milestones for select using (true);
drop policy if exists "public read" on brew_methods;
create policy "public read" on brew_methods for select using (true);
drop policy if exists "public read" on events;
create policy "public read" on events for select using (true);
drop policy if exists "public read" on testimonials;
create policy "public read" on testimonials for select using (true);
drop policy if exists "public read" on visit_info;
create policy "public read" on visit_info for select using (true);

drop policy if exists "public insert" on newsletter_subscribers;
create policy "public insert" on newsletter_subscribers for insert with check (true);

-- Seed data — mirrors what's currently hardcoded on the site, so the pages
-- render real content immediately instead of empty states.

insert into brews (slug, num, name, description, price, image_key, method, featured, sort) values
  ('the-regular', '01', 'The Regular', 'Our house blend, drip-brewed and honest. No tasting notes, no ceremony — just coffee that gets the day open.', 3.50, 'brew-regular.jpg', 'Drip', true, 1),
  ('slow-cortado', '02', 'Slow Cortado', 'Equal parts espresso and steamed milk, pulled to order and served in warm glass. Four sips of quiet.', 4.50, 'brew-cortado.jpg', 'Espresso', true, 2),
  ('overnight-cold-brew', '03', 'Overnight Cold Brew', 'Eighteen hours of patience in a steel tank. Round, low-acid, smooth enough to drink black.', 4.75, 'brew-coldbrew.jpg', 'Cold Brew', true, 3)
on conflict (slug) do nothing;

with cat as (
  insert into menu_categories (title, sort) values ('Coffee', 1) returning id
)
insert into menu_items (category_id, name, description, price, sort)
select id, name, description, price, sort from cat, (values
  ('Drip Coffee', 'House blend, roasted weekly', 3.50, 1),
  ('Cortado', 'Equal parts espresso & steamed milk', 4.50, 2),
  ('Oat Milk Latte', 'We won''t judge, promise', 5.25, 3),
  ('Cold Brew', '18-hour steep', 4.75, 4)
) as v(name, description, price, sort);

with cat as (
  insert into menu_categories (title, sort) values ('Bakery', 2) returning id
)
insert into menu_items (category_id, name, description, price, sort)
select id, name, description, price, sort from cat, (values
  ('Butter Croissant', 'Baked before sunrise', 4.50, 1),
  ('Sourdough Toast', 'Whipped ricotta & honey', 7.00, 2),
  ('Morning Bun', 'Cinnamon, orange zest', 5.00, 3),
  ('Everything Bagel', 'House cream cheese', 5.50, 4)
) as v(name, description, price, sort);

insert into story (headline, body, quote, image_key)
select 'We started with a bad pun and a good roaster.',
  'DumbBrew opened in 2019 because the neighborhood needed a place that took its coffee seriously and everything else a little less so. Every bean is roasted in small batches just down the street, and every loaf comes out of our oven before sunrise.',
  'No corporate syrups. No ten-word drink names. Just good coffee and terrible dad jokes on the chalkboard.',
  'our-story.jpg'
where not exists (select 1 from story);

insert into story_milestones (year, title, description, sort) values
  ('2019', 'Doors open', 'A single espresso machine, a secondhand roaster, and a chalkboard full of bad puns.', 1),
  ('2021', 'The oven arrives', 'Bread and pastry moved in-house — croissants before sunrise, every day since.', 2),
  ('2023', 'Roastery down the street', 'Small-batch roasting moved two doors down so the beans never travel far.', 3),
  ('2026', 'Still terrible at naming things', 'Menu''s bigger, jokes are worse, coffee''s better.', 4)
on conflict do nothing;

insert into brew_methods (slug, label, description, image_key, sort) values
  ('pour-over', 'Pour Over', 'A slow, hand-poured drip through a paper filter for a clean, bright cup that shows off a bean''s character.', 'method-pour-over.jpg', 1),
  ('espresso', 'Espresso', 'Nine bars of pressure through finely-ground coffee in under 30 seconds. The base for everything else on the board.', 'method-espresso.jpg', 2),
  ('chemex', 'Chemex', 'A thick filter and an hourglass carafe for a lighter, tea-like body — great for beans we want to taste unfiltered by milk.', 'method-chemex.jpg', 3),
  ('french-press', 'French Press', 'Full immersion, no filter paper, more body and oils in the cup. Four minutes, then press.', 'method-french-press.jpg', 4),
  ('aeropress', 'Aeropress', 'Immersion plus pressure in one small plunger — fast, portable, and forgiving of a rough grind.', 'method-aeropress.jpg', 5),
  ('moka-pot', 'Moka Pot', 'Stovetop pressure brewing, dense and syrupy — the closest thing to espresso without the machine.', 'method-moka-pot.jpg', 6),
  ('turkish', 'Turkish Coffee', 'Finely ground coffee simmered directly in water, unfiltered, served with the grounds settled at the bottom.', 'method-turkish.jpg', 7),
  ('siphon', 'Siphon', 'Vapor pressure pulls water up through the grounds and back down through a filter — theatrical, and genuinely cleaner-tasting.', 'method-simphon.jpg', 8)
on conflict (slug) do nothing;

insert into events (event_date, title, description) values
  ('2026-09-06', 'Natural Process Cupping w/ guest roaster', 'A guided cupping through three natural-process lots, hosted with a visiting roaster.'),
  ('2026-09-20', 'Wine & Espresso Pairing Night', 'Four small pours, four shots, one very biased tasting note sheet.'),
  ('2026-10-04', 'Sourdough Starter Swap & Bake-Off', 'Bring a jar, leave with a different jar, judge everyone''s bread.')
on conflict do nothing;

insert into testimonials (quote, name, sort) values
  ('The oat milk latte is the only thing keeping me alive right now.', 'Priya M.', 1),
  ('Terrible name, incredible croissants. Ten out of ten.', 'Jordan K.', 2),
  ('Ordered ahead for the whole team and it was ready before we walked in.', 'Sam R.', 3)
on conflict do nothing;

insert into visit_info (address, address_note, hours_weekday, hours_weekend, phone, email)
select '412 Maple Street, Portland, OR', 'Just past the hardware store, look for the crooked awning', '7:00am – 4:00pm', '8:00am – 3:00pm', '(503) 555-0142', 'hello@dumbbrew.example'
where not exists (select 1 from visit_info);

-- --- Customer accounts (Authentik SSO, see docs/AUTHENTIK_SETUP.md) ---
-- Identity/passwords live in Authentik, not here. This table only mirrors
-- the profile fields the app needs and is what RLS scopes customer data to.
-- `id` is the Authentik user's UUID — Supabase Third-Party Auth extracts
-- that same value as `auth.uid()` from the OIDC id_token, so `auth.uid() =
-- id` is what makes a row "belong" to the logged-in customer.
--
-- Isolation pattern for any FUTURE per-customer table (orders, favorites,
-- etc.): add a `customer_id uuid references customers(id)` column and a
-- `using (auth.uid() = customer_id)` policy, same as below. That FK+policy
-- pair is the whole mechanism — no such tables exist yet, so none are added
-- speculatively here.
create table if not exists customers (
  id uuid primary key,
  email text unique not null,
  username text unique not null,
  phone_number text unique not null,
  full_name text,
  status text,
  status_updated_at timestamptz,
  terms_accepted_at timestamptz not null,
  terms_version text not null,
  created_at timestamptz not null default now()
);
alter table customers add column if not exists full_name text;
alter table customers add column if not exists status text;
alter table customers add column if not exists status_updated_at timestamptz;

-- Status is a small fixed set of "presence" badges (see account.html) —
-- constrained here so a bad client write can't put junk on the public
-- directory view below.
alter table customers drop constraint if exists customers_status_check;
alter table customers add constraint customers_status_check check (
  status is null or status in ('busy', 'out_of_office', 'vacation', 'vibing', 'feeling_hot', 'focusing', 'working')
);

alter table customers enable row level security;

drop policy if exists "customers read own" on customers;
create policy "customers read own" on customers for select using (auth.uid() = id);
drop policy if exists "customers update own" on customers;
create policy "customers update own" on customers for update using (auth.uid() = id);
-- No insert/delete policy for anon/authenticated: only auth-service (using
-- the service-role key, which bypasses RLS) creates rows, during
-- registration — see backend/services/auth-service/src/routes/customers.routes.ts.

-- Public presence directory: username + status only, readable by everyone
-- (including anon), so a customer's status badge is visible to other users
-- without exposing their email/phone through the same channel. Views run
-- with the privileges of their owner (not the querying role), so this
-- bypasses the "own row only" RLS policies above by design — keep it to
-- non-sensitive columns only.
drop view if exists customer_directory;
create view customer_directory as
select id, username, full_name, status, status_updated_at
from customers;

grant select on customer_directory to anon, authenticated;

-- --- Marketplace: sellers, products, cart, addresses, orders ---
-- Reads here go straight from the browser (anon key + RLS, same as every
-- other table above). Writes that matter for money (checkout, payment
-- status) are done by order-service using the service-role key with its own
-- app-level scoping to req.customerId — see
-- backend/services/order-service/src/controllers/*.ts — RLS below is
-- defense-in-depth for direct PostgREST access, not the only guard.

-- A seller IS a customer account (no separate identity system — reuses the
-- Authentik SSO already built). The DumbBrew "admin"/house catalog is owned
-- by a seller row with is_house = true, seeded by registering a normal
-- customer account for the house brand and approving it — see
-- backend/services/order-service/src/scripts/seed-house-seller.ts.
create table if not exists sellers (
  id uuid primary key references customers(id),
  store_name text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_house boolean not null default false,
  applied_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);
alter table sellers enable row level security;

drop policy if exists "sellers read own" on sellers;
create policy "sellers read own" on sellers for select using (auth.uid() = id);
-- No public select policy: a pending/rejected application is nobody else's
-- business. Approved sellers' storefront info is exposed instead via the
-- seller_directory view below (name only, not status/decision metadata).
-- No insert/update policy for anon/authenticated: applications are created
-- and approved/rejected by order-service by using its service-role key
-- after verifying the customer's own JWT (apply) or the shared admin JWT
-- (approve/reject) — see sellers.routes.ts / admin-sellers.routes.ts.

drop view if exists seller_directory;
create view seller_directory as
select id, store_name from sellers where status = 'approved';

grant select on seller_directory to anon, authenticated;

-- The commerce catalog. Every purchasable item — DumbBrew's own and every
-- onboarded seller's — is a row here, owned by the seller who listed it.
create table if not exists products (
  id bigint generated always as identity primary key,
  seller_id uuid not null references sellers(id),
  name text not null,
  description text not null default '',
  price numeric(8,2) not null check (price >= 0),
  image_key text,
  category text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table products enable row level security;

drop policy if exists "products public read" on products;
create policy "products public read" on products for select using (active);
drop policy if exists "sellers manage own products" on products;
create policy "sellers manage own products" on products for all
  using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

-- Links DumbBrew's existing marketing-page rows to their commerce-catalog
-- counterpart, so brews.html/menu.html can grow an "Add to Cart" button
-- without duplicating name/price/description into two tables. Populated by
-- the same seed script that creates the house seller and its products.
alter table brews add column if not exists product_id bigint references products(id);
alter table menu_items add column if not exists product_id bigint references products(id);

create table if not exists addresses (
  id bigint generated always as identity primary key,
  customer_id uuid not null references customers(id),
  label text not null default 'Home',
  line1 text not null,
  line2 text,
  city text not null,
  state text not null,
  pincode text not null,
  phone text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
alter table addresses enable row level security;

drop policy if exists "addresses own" on addresses;
create policy "addresses own" on addresses for all
  using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

-- One open cart per customer. order-service upserts cart_items directly
-- (create-cart-if-missing then add/update/remove a line) rather than this
-- being customer-writable straight from the browser, so the same
-- service-role-scoped pattern noted at the top of this section applies.
create table if not exists carts (
  id bigint generated always as identity primary key,
  customer_id uuid not null unique references customers(id),
  created_at timestamptz not null default now()
);
alter table carts enable row level security;
drop policy if exists "carts own" on carts;
create policy "carts own" on carts for all
  using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

create table if not exists cart_items (
  id bigint generated always as identity primary key,
  cart_id bigint not null references carts(id) on delete cascade,
  product_id bigint not null references products(id),
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (cart_id, product_id)
);
alter table cart_items enable row level security;
drop policy if exists "cart_items via own cart" on cart_items;
create policy "cart_items via own cart" on cart_items for all
  using (exists (select 1 from carts c where c.id = cart_id and c.customer_id = auth.uid()))
  with check (exists (select 1 from carts c where c.id = cart_id and c.customer_id = auth.uid()));

-- payment_status is the ENTIRE "prepaid only" enforcement mechanism: there
-- is no code path anywhere that treats a non-'paid' order as real. It starts
-- 'created' when checkout begins (a Razorpay order has been requested but
-- not yet paid), and only order-service's Razorpay webhook handler — never
-- the browser — is allowed to move it to 'paid' or 'failed'.
create table if not exists orders (
  id bigint generated always as identity primary key,
  customer_id uuid not null references customers(id),
  address_id bigint not null references addresses(id),
  razorpay_order_id text unique,
  razorpay_payment_id text,
  amount numeric(10,2) not null check (amount >= 0),
  payment_status text not null default 'created' check (payment_status in ('created', 'paid', 'failed')),
  created_at timestamptz not null default now()
);
alter table orders enable row level security;
drop policy if exists "orders read own" on orders;
create policy "orders read own" on orders for select using (auth.uid() = customer_id);
-- No customer insert/update policy: orders are only ever written by
-- order-service (service-role key) during checkout and webhook handling.
-- (A seller-read policy on this table is added further down, once
-- order_items exists — see the comment there.)

-- seller_id is copied from products.seller_id at checkout time (not derived
-- via a join) so a seller's RLS policy here doesn't need to reach through
-- orders/products just to see their own sales.
create table if not exists order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id) on delete cascade,
  product_id bigint not null references products(id),
  seller_id uuid not null references sellers(id),
  quantity int not null check (quantity > 0),
  unit_price numeric(8,2) not null check (unit_price >= 0)
);
alter table order_items enable row level security;
drop policy if exists "order_items read as customer" on order_items;
create policy "order_items read as customer" on order_items for select using (
  exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid())
);
drop policy if exists "order_items read as seller" on order_items;
create policy "order_items read as seller" on order_items for select using (auth.uid() = seller_id);

-- Lets a seller's own order_items rows actually join back to their parent
-- order under seller_orders' security_invoker view below — without this, a
-- seller has no read grant on orders they didn't place, and the join would
-- silently drop every row of their own sales. Added here (not next to
-- orders' other policies above) because it references order_items, which
-- must exist first.
drop policy if exists "orders read as seller" on orders;
create policy "orders read as seller" on orders for select using (
  exists (select 1 from order_items oi where oi.order_id = orders.id and oi.seller_id = auth.uid())
);

-- Ready-made "my sales" query for a seller's dashboard: only paid orders,
-- so an unpaid/failed checkout attempt never shows up as a sale.
--
-- security_invoker = true is load-bearing here, unlike customer_directory/
-- seller_directory above: this view must run with the QUERYING role's RLS
-- (order_items' "auth.uid() = seller_id" policy), not the view owner's,
-- otherwise every seller would see every other seller's sales.
drop view if exists seller_orders;
create view seller_orders
with (security_invoker = true) as
select oi.id as order_item_id, oi.order_id, oi.seller_id, oi.product_id, oi.quantity, oi.unit_price,
       o.created_at, o.customer_id, p.name as product_name
from order_items oi
join orders o on o.id = oi.order_id
join products p on p.id = oi.product_id
where o.payment_status = 'paid';

grant select on seller_orders to authenticated;
