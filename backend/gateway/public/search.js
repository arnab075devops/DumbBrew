// Wires up the search icon in the nav (data-search-toggle button) into a
// live "search as you type" dropdown against GET /api/products/search.
// Same polling-for-the-nav technique as auth-nav.js/cart-nav.js, since the
// nav is rendered client-side by dc-runtime and may not exist yet when this
// script runs.
(function () {
  function tryInit(attemptsLeft) {
    const btn = document.querySelector('[data-search-toggle]');
    if (!btn) {
      if (attemptsLeft > 0) requestAnimationFrame(() => tryInit(attemptsLeft - 1));
      return;
    }
    setup(btn);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setup(btn) {
    let debounceTimer = null;
    let latestRequestId = 0;
    let open = false;

    const panel = document.createElement('div');
    panel.style.cssText =
      'position:absolute; top:calc(100% + 10px); right:0; width:320px; max-height:420px; overflow-y:auto; ' +
      'background:#faf5ea; border-radius:10px; box-shadow:0 8px 28px #17100a33; display:none; z-index:50; ' +
      'font-family:Poppins,sans-serif;';

    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'padding:12px;';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search products…';
    input.style.cssText =
      'width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #3b241422; border-radius:6px; ' +
      'font-size:14px; font-family:Poppins,sans-serif; color:#241a10; outline:none; background:#fff;';
    inputWrap.appendChild(input);

    const resultsEl = document.createElement('div');
    resultsEl.style.cssText = 'padding:0 6px 6px;';

    panel.appendChild(inputWrap);
    panel.appendChild(resultsEl);

    // Wrap the button in its own positioning context rather than reusing its
    // parent (the whole nav-links row) — anchoring to that would place the
    // panel relative to the entire row instead of under the icon itself.
    const wrapper = document.createElement('span');
    wrapper.style.cssText = 'position:relative; display:inline-flex;';
    btn.parentElement.insertBefore(wrapper, btn);
    wrapper.appendChild(btn);
    wrapper.appendChild(panel);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      open = !open;
      panel.style.display = open ? 'block' : 'none';
      if (open) input.focus();
    });

    document.addEventListener('click', function (e) {
      if (open && !panel.contains(e.target) && e.target !== btn) {
        open = false;
        panel.style.display = 'none';
      }
    });

    input.addEventListener('input', function () {
      const term = input.value.trim();
      clearTimeout(debounceTimer);
      if (term.length < 2) {
        resultsEl.innerHTML = '';
        return;
      }
      debounceTimer = setTimeout(function () { runSearch(term); }, 250);
    });

    function runSearch(term) {
      const requestId = ++latestRequestId;
      resultsEl.innerHTML = '<div style="padding:14px; font-size:13px; color:#5a412899;">Searching…</div>';
      window.orderApiRequest('/api/products/search?q=' + encodeURIComponent(term), { method: 'GET' })
        .then(function (data) {
          if (requestId !== latestRequestId) return;
          renderResults((data && data.items) || []);
        })
        .catch(function () {
          if (requestId !== latestRequestId) return;
          resultsEl.innerHTML = '<div style="padding:14px; font-size:13px; color:#a13a2e;">Could not search right now.</div>';
        });
    }

    function renderResults(items) {
      if (!items.length) {
        resultsEl.innerHTML = '<div style="padding:14px; font-size:13px; color:#5a412899;">No products found.</div>';
        return;
      }
      resultsEl.innerHTML = items.map(function (p) {
        const storeName = p.sellers && p.sellers.store_name;
        const img = p.image_key ? window.assetUrl(p.image_key) : '';
        return '<a href="./shop.html?highlight=' + p.id + '" data-result="true" style="display:flex; align-items:center; gap:10px; padding:8px 6px; border-radius:6px; text-decoration:none; color:#241a10;">' +
          '<img src="' + img + '" alt="" style="width:40px; height:40px; border-radius:6px; object-fit:cover; background:#3b2414; flex:none;"/>' +
          '<span style="flex:1; min-width:0;">' +
            '<span style="display:block; font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(p.name) + '</span>' +
            (storeName ? '<span style="display:block; font-size:11px; color:#8a5527;">' + escapeHtml(storeName) + '</span>' : '') +
          '</span>' +
          '<span style="font-size:12px; font-weight:600; flex:none;">' + window.formatINR(p.price) + '</span>' +
        '</a>';
      }).join('');
      resultsEl.querySelectorAll('[data-result]').forEach(function (el) {
        el.addEventListener('mouseenter', function () { el.style.background = '#e7dac2'; });
        el.addEventListener('mouseleave', function () { el.style.background = ''; });
      });
    }
  }

  tryInit(90);
})();
