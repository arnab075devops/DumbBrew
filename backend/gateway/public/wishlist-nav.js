// Adds an item-count badge to the wishlist icon in the nav when signed in
// and the wishlist actually has items. Same polling technique as
// cart-nav.js, since the nav is rendered client-side by dc-runtime and may
// not exist yet when this script runs.
(function () {
  function tryInit(attemptsLeft) {
    const accessToken = sessionStorage.getItem('dumbbrew_access_token');
    if (!accessToken) return;
    const link = document.querySelector('a[href="./wishlist.html"]');
    if (!link) {
      if (attemptsLeft > 0) requestAnimationFrame(() => tryInit(attemptsLeft - 1));
      return;
    }
    window.orderApiRequest('/api/wishlist', { method: 'GET' }, accessToken)
      .then(function (data) {
        const count = ((data && data.items) || []).length;
        if (!count) return;
        const badge = document.createElement('span');
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.cssText =
          'position:absolute; top:-4px; right:-4px; min-width:16px; height:16px; padding:0 3px; ' +
          'border-radius:8px; background:#a13a2e; color:#fff; font-size:10px; font-weight:700; ' +
          'line-height:16px; text-align:center; font-family:Poppins,sans-serif;';
        link.appendChild(badge);
      })
      .catch(function () {
        // Wishlist fetch failing isn't worth surfacing here — the wishlist
        // page itself handles that.
      });
  }

  tryInit(90);
})();
