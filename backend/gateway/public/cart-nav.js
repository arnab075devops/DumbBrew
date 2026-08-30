// Adds an item-count badge to the cart icon in the nav when signed in and
// the cart actually has items. Same polling technique as auth-nav.js, since
// the nav is rendered client-side by dc-runtime and may not exist yet when
// this script runs.
(function () {
  function tryInit(attemptsLeft) {
    const accessToken = sessionStorage.getItem('dumbbrew_access_token');
    if (!accessToken) return;
    const link = document.querySelector('a[href="./cart.html"]');
    if (!link) {
      if (attemptsLeft > 0) requestAnimationFrame(() => tryInit(attemptsLeft - 1));
      return;
    }
    window.orderApiRequest('/api/cart', { method: 'GET' }, accessToken)
      .then(function (data) {
        const items = (data && data.items) || [];
        const count = items.reduce(function (n, it) { return n + (it.quantity || 0); }, 0);
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
        // Cart fetch failing (expired session, order-service down) isn't
        // worth surfacing here — the cart page itself handles that.
      });
  }

  tryInit(90);
})();
