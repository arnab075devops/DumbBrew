// Shared runtime config for every page in this site. Edit these before
// deploying — there's no build step, so these are read directly by the
// browser (the Supabase anon key is meant to be public; access is enforced
// by Postgres RLS policies in supabase/schema.sql, not by hiding the key).
window.APP_CONFIG = {
  // Supabase project — see README.md "Supabase setup".
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-KEY',

  // Cloudflare R2 public bucket base URL, no trailing slash (e.g. a bucket
  // public dev URL or a custom domain mapped to the bucket). Leave empty to
  // fall back to the images already checked into ./assets/.
  R2_BASE: '',

  // Legacy Node admin backend (auth-service/content-service, see
  // backend/README.md). Not required for the public site — kept only if you
  // still run it for admin tooling. Leave as-is if you're not using it.
  API_BASE: 'http://localhost',
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
