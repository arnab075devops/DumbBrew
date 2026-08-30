// Swaps the "Log In" nav link for a small initials avatar (linking to
// account.html) when the visitor already has a session. Included on every
// public page after support.js. The nav itself is rendered client-side by
// dc-runtime, so this polls a few animation frames for it to exist rather
// than assuming it's already in the DOM at script-run time.
(function () {
  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return parts.slice(0, 2).map((s) => s[0].toUpperCase()).join('');
  }

  function swap(nav, me) {
    const link = nav.querySelector('a[href="./login.html"]');
    if (!link) return;
    const badge = document.createElement('a');
    badge.href = './account.html';
    badge.title = me.username;
    badge.style.cssText =
      'display:flex; align-items:center; justify-content:center; width:34px; height:34px; ' +
      'border-radius:50%; background:#8a5527; color:#f0e5d1; font-family:Poppins,sans-serif; ' +
      'font-size:12px; font-weight:600; letter-spacing:0.5px; text-decoration:none; flex:none;';
    badge.textContent = initials(me.full_name || me.username);
    link.replaceWith(badge);
  }

  function tryInit(attemptsLeft) {
    const accessToken = sessionStorage.getItem('dumbbrew_access_token');
    if (!accessToken) return;
    const nav = document.querySelector('[data-nav]');
    if (!nav || !nav.querySelector('a[href="./login.html"]')) {
      if (attemptsLeft > 0) requestAnimationFrame(() => tryInit(attemptsLeft - 1));
      return;
    }
    window.supabaseSelectAs('customers', 'select=username,full_name&limit=1', accessToken)
      .then((rows) => {
        const me = rows && rows[0];
        if (me) swap(nav, me);
      })
      .catch(function () {
        // Expired/invalid session — leave the "Log In" link as-is rather
        // than forcing a redirect from every page; account.html is where
        // the expired-session recovery flow already lives.
      });
  }

  tryInit(90);
})();
