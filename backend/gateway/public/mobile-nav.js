// Adds a hamburger toggle + dropdown panel for the text nav links on narrow
// screens (see responsive.css's 860px breakpoint, which hides those links
// directly on [data-nav]). Same polling-for-the-nav technique as
// auth-nav.js/cart-nav.js, since on x-dc pages the nav is rendered
// client-side by dc-runtime and may not exist yet when this script runs.
//
// Only ever ADDS sibling nodes to [data-nav] — never reparents or removes
// its existing children. Those are owned by dc-runtime's React on the
// branded pages, and moving/removing them desyncs its next re-render (see
// auth-nav.js's swapToAvatar comment for the same constraint).
(function () {
  function tryInit(attemptsLeft) {
    const nav = document.querySelector('[data-nav]');
    if (!nav) {
      if (attemptsLeft > 0) requestAnimationFrame(() => tryInit(attemptsLeft - 1));
      return;
    }
    setup(nav);
  }

  function setup(nav) {
    if (nav.dataset.mnavBound) return;
    nav.dataset.mnavBound = '1';

    const links = Array.prototype.slice.call(nav.querySelectorAll('a:not([aria-label])'));
    if (!links.length) return;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mnav-toggle';
    toggle.setAttribute('aria-label', 'Menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span>';

    const panel = document.createElement('div');
    panel.className = 'mnav-panel';
    links.forEach(function (a) {
      const clone = a.cloneNode(true);
      clone.removeAttribute('style-hover');
      panel.appendChild(clone);
    });

    // Inserted as a new element right after the nav's first element child
    // (the logo link), not in place of anything — safe alongside
    // dc-runtime's React. children[1] (not firstChild.nextSibling) skips
    // any whitespace text nodes between the source tags.
    nav.insertBefore(toggle, nav.children[1] || null);
    document.body.appendChild(panel);

    function positionPanel() {
      const rect = nav.getBoundingClientRect();
      document.documentElement.style.setProperty('--mnav-top', rect.bottom + 'px');
    }

    function setOpen(open) {
      panel.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) positionPanel();
    }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!panel.classList.contains('open'));
    });
    panel.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') setOpen(false);
    });
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== toggle) setOpen(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 860) setOpen(false);
      else if (panel.classList.contains('open')) positionPanel();
    });
  }

  tryInit(90);
})();
