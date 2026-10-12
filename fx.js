/* The Awesome Brothers — motion engine.
   One small file that gives every page its life: scroll reveals, tilt cards,
   magnetic buttons, count-up numbers, an aurora cursor, ripples, marquees and
   soft page-to-page transitions. Nothing here is required for the site to
   work — it only ever adds polish. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  root.classList.add('fx');

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function $(sel, scope) { return (scope || doc).querySelector(sel); }
  function $$(sel, scope) { return Array.prototype.slice.call((scope || doc).querySelectorAll(sel)); }
  function sfx(name) {
    if (window.AwesomeSFX) { window.AwesomeSFX.play(name); }
  }

  /* ------------------------------------------------------------------ *
   * 0. Hero / page entrance choreography
   * ------------------------------------------------------------------ */
  function dressHero() {
    var hero = $('.hero, .games-hero');
    if (hero) { hero.classList.add('fx-hero'); }
    $$('.reveal, .stat, .card, .art, .game-card, .sib').forEach(function (el, i) {
      if (!el.style.getPropertyValue('--i')) { el.style.setProperty('--i', String(i % 8)); }
    });
    window.requestAnimationFrame(function () {
      root.classList.add('fx-ready');
    });
  }

  /* ------------------------------------------------------------------ *
   * 1. Reveal on scroll, with stagger for the children of a section
   * ------------------------------------------------------------------ */
  function reveals() {
    var items = $$('.reveal, .stagger > *');
    $$('.stagger').forEach(function (group) {
      each(group.children, function (child, i) { child.style.setProperty('--i', String(i)); });
    });
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        entry.target.classList.add('in');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------ *
   * 2. Numbers that count up when you reach them
   * ------------------------------------------------------------------ */
  function counters() {
    var els = $$('[data-count]');
    if (!els.length) { return; }
    function run(el) {
      var target = parseFloat(el.getAttribute('data-count')) || 0;
      var suffix = el.getAttribute('data-suffix') || '';
      if (reduced) { el.textContent = target + suffix; return; }
      var start = null;
      var dur = 1100;
      function frame(ts) {
        if (start === null) { start = ts; }
        var p = Math.min(1, (ts - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) { window.requestAnimationFrame(frame); }
      }
      window.requestAnimationFrame(frame);
    }
    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        run(entry.target);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------ *
   * 3. Tilt: cards lean towards the pointer
   * ------------------------------------------------------------------ */
  function tilt(el) {
    if (reduced || !finePointer || !el || el.__fxTilt) { return; }
    el.__fxTilt = true;
    (function () {
      var rect = null;
      var target = { x: 0, y: 0 };
      var now = { x: 0, y: 0 };
      var raf = 0;
      el.classList.add('fx-tilt');
      function tick() {
        now.x += (target.x - now.x) * 0.14;
        now.y += (target.y - now.y) * 0.14;
        el.style.transform = 'perspective(900px) rotateY(' + now.x.toFixed(2) + 'deg) rotateX(' + now.y.toFixed(2) + 'deg) translateY(-4px)';
        if (Math.abs(now.x - target.x) > 0.02 || Math.abs(now.y - target.y) > 0.02) {
          raf = window.requestAnimationFrame(tick);
        } else {
          raf = 0;
        }
      }
      el.addEventListener('pointerenter', function () { rect = el.getBoundingClientRect(); });
      el.addEventListener('pointermove', function (e) {
        if (!rect) { rect = el.getBoundingClientRect(); }
        var px = (e.clientX - rect.left) / rect.width - 0.5;
        var py = (e.clientY - rect.top) / rect.height - 0.5;
        target.x = px * 11;
        target.y = -py * 11;
        el.style.setProperty('--mx', ((px + 0.5) * 100).toFixed(1) + '%');
        el.style.setProperty('--my', ((py + 0.5) * 100).toFixed(1) + '%');
        if (!raf) { raf = window.requestAnimationFrame(tick); }
      });
      el.addEventListener('pointerleave', function () {
        target.x = 0;
        target.y = 0;
        if (!raf) { raf = window.requestAnimationFrame(tick); }
      });
    })();
  }

  function tilts() {
    $$('[data-tilt], .card, .sib, .dream, .factbox').forEach(tilt);
  }

  /* ------------------------------------------------------------------ *
   * 4. Magnetic buttons — they lean towards your finger
   * ------------------------------------------------------------------ */
  function magnets() {
    if (reduced || !finePointer) { return; }
    $$('[data-magnet]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var rect = el.getBoundingClientRect();
        var dx = (e.clientX - (rect.left + rect.width / 2)) / rect.width;
        var dy = (e.clientY - (rect.top + rect.height / 2)) / rect.height;
        el.style.transform = 'translate(' + (dx * 9).toFixed(1) + 'px,' + (dy * 7 - 3).toFixed(1) + 'px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* ------------------------------------------------------------------ *
   * 5. Parallax + scroll progress
   * ------------------------------------------------------------------ */
  function scrolling() {
    var bar = doc.createElement('div');
    bar.className = 'fx-progress';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<i></i>';
    doc.body.appendChild(bar);
    var fill = bar.firstChild;

    var header = $('.site-header');
    var flippers = $$('[data-parallax]');
    var ticking = false;

    function update() {
      ticking = false;
      var y = window.pageYOffset || doc.documentElement.scrollTop || 0;
      var max = Math.max(1, (doc.documentElement.scrollHeight || 1) - window.innerHeight);
      var p = Math.min(1, Math.max(0, y / max));
      fill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      root.style.setProperty('--scroll', p.toFixed(3));
      if (header) { header.classList.toggle('fx-compact', y > 90); }
      if (!reduced) {
        flippers.forEach(function (el) {
          var speed = parseFloat(el.getAttribute('data-parallax')) || 0.2;
          el.style.setProperty('--py', (y * speed).toFixed(1) + 'px');
        });
      }
    }
    function onScroll() {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------ *
   * 6. The cursor's warm glow (desktop only)
   * ------------------------------------------------------------------ */
  function cursorAura() {
    if (reduced || !finePointer) { return; }
    var aura = doc.createElement('div');
    aura.className = 'fx-aura';
    aura.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(aura);
    var target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    var here = { x: target.x, y: target.y };
    var raf = 0;
    function tick() {
      here.x += (target.x - here.x) * 0.16;
      here.y += (target.y - here.y) * 0.16;
      aura.style.transform = 'translate3d(' + (here.x - 160).toFixed(1) + 'px,' + (here.y - 160).toFixed(1) + 'px,0)';
      raf = window.requestAnimationFrame(tick);
    }
    window.addEventListener('pointermove', function (e) {
      target.x = e.clientX;
      target.y = e.clientY;
      aura.classList.add('fx-aura-on');
    }, { passive: true });
    window.addEventListener('pointerdown', function () { aura.classList.add('fx-aura-pop'); });
    window.addEventListener('pointerup', function () { aura.classList.remove('fx-aura-pop'); });
    doc.addEventListener('mouseleave', function () { aura.classList.remove('fx-aura-on'); });
    raf = window.requestAnimationFrame(tick);
    void raf;
  }

  /* ------------------------------------------------------------------ *
   * 7. Ripples + game sounds on anything clickable
   * ------------------------------------------------------------------ */
  function ripples() {
    var selector = '.btn, .gk-btn, .gk-filter, .gk-mode-btn, .nav a, .gk-cell, .gk-sq, .gk-token, .gk-padbtn, .game-card';
    doc.addEventListener('pointerdown', function (e) {
      var el = e.target && e.target.closest ? e.target.closest(selector) : null;
      if (!el || reduced) { return; }
      if (el.classList.contains('gk-cell') || el.classList.contains('gk-sq')) { sfx('place'); }
      else if (el.classList.contains('gk-token') || el.classList.contains('gk-padbtn')) { sfx('step'); }
      else { sfx('click'); }
      var rect = el.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 1.6;
      var dot = doc.createElement('span');
      dot.className = 'fx-ripple';
      dot.style.width = dot.style.height = size + 'px';
      dot.style.left = (e.clientX - rect.left - size / 2) + 'px';
      dot.style.top = (e.clientY - rect.top - size / 2) + 'px';
      if (getComputedStyle(el).position === 'static') { el.style.position = 'relative'; }
      el.appendChild(dot);
      window.setTimeout(function () { if (dot.parentNode) { dot.parentNode.removeChild(dot); } }, 620);
    }, { passive: true });

    doc.addEventListener('pointerover', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('.nav a, .gk-btn, .btn') : null;
      if (el) { sfx('hover'); }
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ *
   * 8. A soft fade between pages (only for real navigations)
   * ------------------------------------------------------------------ */
  function transitions() {
    if (reduced) { return; }
    doc.body.classList.add('fx-enter');
    window.setTimeout(function () { doc.body.classList.remove('fx-enter'); }, 700);

    doc.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) { return; }
      var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!link) { return; }
      var href = link.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || link.target === '_blank' || link.hasAttribute('download')) { return; }
      if (/^(mailto:|tel:|https?:)/i.test(href)) { return; }
      var url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) { return; }
      if (url.pathname === window.location.pathname && url.search === window.location.search) { return; }
      e.preventDefault();
      sfx('pop');
      root.classList.add('fx-leaving');
      window.setTimeout(function () { window.location.href = link.href; }, 220);
    });
  }

  /* ------------------------------------------------------------------ *
   * 9. Marquees: clone the track so the loop is seamless
   * ------------------------------------------------------------------ */
  function marquees() {
    $$('[data-marquee]').forEach(function (track) {
      var clone = track.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      each(clone.children, function (child) { child.setAttribute('tabindex', '-1'); });
      track.parentNode.appendChild(clone);
    });
  }

  /* ------------------------------------------------------------------ *
   * 10. A floating sound switch, shared by every page
   * ------------------------------------------------------------------ */
  function soundSwitch() {
    if (!window.AwesomeSFX) { return; }
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'fx-sound';
    btn.id = 'sfxToggle';
    doc.body.appendChild(btn);

    function paint() {
      var off = window.AwesomeSFX.isMuted();
      btn.textContent = off ? '🔇' : '🔊';
      btn.setAttribute('aria-pressed', off ? 'false' : 'true');
      btn.setAttribute('aria-label', off ? 'Turn game sounds on' : 'Turn game sounds off');
      btn.title = off ? 'Sound is off — tap to turn it on' : 'Sound is on — tap to mute';
      btn.classList.toggle('is-off', off);
    }
    btn.addEventListener('click', function () {
      window.AwesomeSFX.toggle();
      paint();
      if (!window.AwesomeSFX.isMuted()) { sfx('pop'); }
    });
    doc.addEventListener('awesome:sfx', paint);
    paint();
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  /* No single effect is allowed to take the rest of the page down with it. */
  function safe(fn) {
    try { fn(); } catch (err) { /* keep the page alive */ }
  }

  function boot() {
    /* Registered first and on purpose: once the hero has finished animating,
       the entrance rules stop holding opacity/transform. If this never ran the
       hero would stay invisible, so it must not depend on anything below it. */
    window.setTimeout(function () { root.classList.add('fx-settled'); }, 1250);

    safe(dressHero);
    safe(reveals);
    safe(counters);
    safe(tilts);
    safe(magnets);
    safe(scrolling);
    safe(cursorAura);
    safe(ripples);
    safe(transitions);
    safe(marquees);
    safe(soundSwitch);
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Small helper other scripts can borrow. */
  window.AwesomeFX = {
    reduced: reduced,
    tilt: tilt,
    replay: function (el, cls) {
      if (!el) { return; }
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    },
    pop: function (el) {
      if (!el || reduced) { return; }
      el.classList.remove('fx-pop');
      void el.offsetWidth;
      el.classList.add('fx-pop');
    },
    shake: function (el) {
      if (!el || reduced) { return; }
      el.classList.remove('fx-shake');
      void el.offsetWidth;
      el.classList.add('fx-shake');
    }
  };
})();
