// Nav treatment for a visitor who already has a session: a log-out control
// always, plus the "Log In" link swapped for an initials avatar once the
// profile row loads. Included on every public page after support.js. The
// nav itself is rendered client-side by dc-runtime, so this polls a few
// animation frames for it to exist rather than assuming it's already in the
// DOM at script-run time.
(function () {
  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return parts.slice(0, 2).map((s) => s[0].toUpperCase()).join('');
  }

  function logOut() {
    sessionStorage.removeItem('dumbbrew_access_token');
    window.location.href = './index.html';
  }

  // Power icon drawn from spans like the account/cart/search icons beside
  // it, rather than a ⏻ glyph — the nav's font stack has no power symbol,
  // so a glyph renders as tofu.
  function addLogoutButton(anchorEl) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Log Out');
    btn.title = 'Log Out';
    btn.style.cssText =
      'display:flex; align-items:center; justify-content:center; width:34px; height:34px; ' +
      'border-radius:50%; border:1px solid #3b241433; color:#3b2414cc; background:none; ' +
      'cursor:pointer; flex:none; padding:0;';

    const glyph = document.createElement('span');
    glyph.style.cssText = 'position:relative; width:15px; height:15px; display:block;';
    const ring = document.createElement('span');
    ring.style.cssText =
      'position:absolute; top:2px; left:1px; width:13px; height:13px; border:1.5px solid currentColor; ' +
      'border-top-color:transparent; border-radius:50%; box-sizing:border-box;';
    const bar = document.createElement('span');
    bar.style.cssText =
      'position:absolute; top:0; left:6px; width:1.5px; height:8px; background:currentColor;';
    glyph.appendChild(ring);
    glyph.appendChild(bar);
    btn.appendChild(glyph);

    btn.addEventListener('click', logOut);
    anchorEl.insertAdjacentElement('afterend', btn);
    return btn;
  }

  function swapToAvatar(link, me) {
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
    const link = nav && nav.querySelector('a[href="./login.html"]');
    if (!link) {
      if (attemptsLeft > 0) requestAnimationFrame(() => tryInit(attemptsLeft - 1));
      return;
    }

    // Offered on "a token exists" alone, deliberately not gated on the
    // profile read below. A session whose customers row is missing or
    // unreadable still holds a token, and gating log-out on that read
    // strands the visitor signed in with no way out of it from the UI.
    addLogoutButton(link);

    window.supabaseSelectAs('customers', 'select=username,full_name&limit=1', accessToken)
      .then((rows) => {
        const me = rows && rows[0];
        if (me) swapToAvatar(link, me);
      })
      .catch(function () {
        // Expired/invalid session — leave the "Log In" link as-is rather
        // than forcing a redirect from every page; account.html is where
        // the expired-session recovery flow already lives. The log-out
        // button added above is what gets the visitor unstuck.
      });
  }

  tryInit(90);
})();
