// Shared runtime config for every page in this site. Edit these before
// deploying — there's no build step, so these are read directly by the
// browser (the Supabase anon key is meant to be public; access is enforced
// by Postgres RLS policies in supabase/schema.sql, not by hiding the key).
window.APP_CONFIG = {
  // Supabase project — see README.md "Supabase setup".
  SUPABASE_URL: 'https://odblggwrwksmycpxaptp.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_VVvr-EufI4HAJ7UwgKw-bA_cx94mOFD',

  // Cloudflare R2 public bucket base URL, no trailing slash (e.g. a bucket
  // public dev URL or a custom domain mapped to the bucket). Leave empty to
  // fall back to the images already checked into ./assets/.
  R2_BASE: 'https://pub-acdd02b3e347450b80d14a3676db872e.r2.dev',

  // The gateway (nginx + auth-service/content-service, see
  // backend/README.md). Only customer registration (register.html, via
  // /api/customers/register) depends on this now — everything else the
  // legacy backend does (admin login, events/newsletter) is optional, see
  // backend/README.md.
  API_BASE: 'http://localhost',

  // Customer SSO (Authentik) — see docs/AUTHENTIK_SETUP.md. Registration
  // (register.html) doesn't need these, it just posts to API_BASE +
  // '/api/customers/register'. Login/callback (login.html,
  // auth-callback.html) need all three filled in once Authentik is deployed
  // and its OIDC application is created.
  AUTHENTIK_URL: 'http://localhost:9000',
  AUTHENTIK_CLIENT_ID: 'ctzDAlfF6GcWNRCRsUzYqMU1ZY94htMdiB4UIGoU',
  AUTHENTIK_REDIRECT_URI: window.location.origin + '/auth-callback.html',

  // Terms & Data Storage Policy version the customer is agreeing to on
  // register.html — must match TERMS_VERSION on auth-service exactly, or
  // registration is rejected (stale-consent guard). Bump both together
  // whenever terms.html/data-policy.html materially change.
  TERMS_VERSION: '2026-08-30',
};

// R2_BASE + '/name.jpg' when set, else the checked-in local copy.
window.assetUrl = function assetUrl(name) {
  const base = window.APP_CONFIG.R2_BASE;
  return base ? base.replace(/\/$/, '') + '/' + name : './assets/' + name;
};

// Thin wrapper over Supabase's PostgREST API (no @supabase/supabase-js
// needed for plain reads). table: e.g. 'brews'. query: e.g. 'select=*&order=num'.
window.supabaseSelect = function supabaseSelect(table, query) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
  return fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + (query || 'select=*'), {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
  }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('supabase ' + table + ' http ' + r.status))));
};

// Signed-in reads/writes (customer data). Supabase's Third-Party Auth only
// supports a fixed list of named providers (Firebase, Clerk, WorkOS, Auth0,
// Cognito) — no generic OIDC issuer — so a self-hosted Authentik can't be
// registered there directly. Instead, auth-callback.html exchanges
// Authentik's id_token for a Supabase-compatible JWT via our own backend
// (POST /api/customers/session, see auth-service), and that's the token
// passed in here. apikey still has to be the anon key (Supabase requires it
// on every REST call); Authorization is what actually identifies the
// customer and makes auth.uid() resolve in RLS.
window.supabaseSelectAs = function supabaseSelectAs(table, query, accessToken) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
  return fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + (query || 'select=*'), {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken }
  }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('supabase ' + table + ' http ' + r.status))));
};

// Signed-in update (customer editing their own profile). `matchQuery` should
// pin the row (e.g. 'id=eq.<uuid>') — RLS only allows a customer to touch
// their own row anyway, but scoping the request explicitly avoids relying on
// PostgREST's "no filter = all visible rows" behavior.
window.supabaseUpdateAs = function supabaseUpdateAs(table, matchQuery, patch, accessToken) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
  return fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + matchQuery, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(patch)
  }).then((r) => {
    if (r.ok) return r.json();
    return r.json().catch(() => null).then((body) => {
      const err = new Error('supabase ' + table + ' update http ' + r.status);
      err.status = r.status;
      err.body = body;
      return Promise.reject(err);
    });
  });
};

// Insert helper for public writes (newsletter signups). RLS policy on the
// table must explicitly allow anon inserts — see supabase/schema.sql.
window.supabaseInsert = function supabaseInsert(table, row) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
  return fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(row)
  }).then((r) => (r.ok ? true : Promise.reject(new Error('supabase ' + table + ' insert http ' + r.status))));
};

// Calls order-service (cart/addresses/orders/payments/sellers — see
// backend/services/order-service) through the gateway, not Supabase
// directly — that service does its own customer-id scoping server-side
// rather than relying on RLS passthrough. `path` starts with '/api/...'.
window.orderApiRequest = function orderApiRequest(path, init, accessToken) {
  const { API_BASE } = window.APP_CONFIG;
  init = init || {};
  return fetch(API_BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
      ...(init.headers || {})
    }
  }).then((r) => {
    if (r.ok) return r.status === 204 ? null : r.json();
    return r.json().catch(() => null).then((body) => {
      const err = new Error('order-service ' + path + ' http ' + r.status);
      err.status = r.status;
      err.body = body;
      return Promise.reject(err);
    });
  });
};
