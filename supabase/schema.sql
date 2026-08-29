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
  terms_accepted_at timestamptz not null,
  terms_version text not null,
  created_at timestamptz not null default now()
);
alter table customers enable row level security;

drop policy if exists "customers read own" on customers;
create policy "customers read own" on customers for select using (auth.uid() = id);
drop policy if exists "customers update own" on customers;
create policy "customers update own" on customers for update using (auth.uid() = id);
-- No insert/delete policy for anon/authenticated: only auth-service (using
-- the service-role key, which bypasses RLS) creates rows, during
-- registration — see backend/services/auth-service/src/routes/customers.routes.ts.
