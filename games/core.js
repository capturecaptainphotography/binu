/* GameKit — the shared toolbox for the Awesome Games Room.
   Every game registers itself here; games/hub.js mounts the one you pick.
   The same game code runs in two modes:
     mode 'two' → two humans sharing one screen
     mode 'cpu' → you against the computer (the "system") */
(function () {
  'use strict';

  var GAMES = [];

  /* --- tiny DOM helper: h('div', {class:'x', onclick:fn}, 'text') --- */
  function h(tag, attrs, kids) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    for (var key in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, key)) { continue; }
      var v = attrs[key];
      if (v === null || v === undefined || v === false) { continue; }
      if (key === 'class') { node.className = v; }
      else if (key === 'text') { node.textContent = v; }
      else if (key === 'html') { node.innerHTML = v; }
      else if (key.slice(0, 2) === 'on' && typeof v === 'function') { node.addEventListener(key.slice(2).toLowerCase(), v); }
      else if (key === 'style' && typeof v === 'object') {
        for (var s in v) { if (Object.prototype.hasOwnProperty.call(v, s)) { node.style[s] = v[s]; } }
      } else { node.setAttribute(key, v === true ? '' : v); }
    }
    if (kids !== null && kids !== undefined) {
      (Array.isArray(kids) ? kids : [kids]).forEach(function (kid) {
        if (kid === null || kid === undefined || kid === false) { return; }
        node.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
      });
    }
    return node;
  }

  /* --- clickable grid of buttons --- */
  function grid(cols, rows, opts) {
    opts = opts || {};
    var root = document.createElement('div');
    root.className = 'gk-grid' + (opts.className ? ' ' + opts.className : '');
    root.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    var cells = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) {
        (function (rr, cc) {
          var cell = h('button', { class: 'gk-cell', type: 'button', 'data-r': rr, 'data-c': cc });
          if (opts.onCell) { cell.addEventListener('click', function () { opts.onCell(rr, cc, cell); }); }
          root.appendChild(cell);
          row.push(cell);
        })(r, c);
      }
      cells.push(row);
    }
    return { root: root, cells: cells, at: function (r, c) { return cells[r][c]; } };
  }

  function each(g, fn) {
    for (var r = 0; r < g.cells.length; r++) {
      for (var c = 0; c < g.cells[r].length; c++) { fn(g.cells[r][c], r, c); }
    }
  }

  function randInt(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[randInt(a.length)]; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = randInt(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function delay(ms, fn) { return window.setTimeout(fn, ms); }
  function confetti(n) { if (typeof window.awesomeConfetti === 'function') { window.awesomeConfetti(n || 70); } }

  /* --- a "pass the device, don't peek" screen for hidden-info games --- */
  function cover(root, title, note, btnText, onReady) {
    var overlay = h('div', { class: 'gk-cover' }, h('div', { class: 'gk-cover-card' }, [
      h('strong', { text: title }),
      note ? h('p', { text: note }) : null,
      h('button', {
        class: 'gk-btn gk-btn-main', type: 'button',
        onclick: function () { root.removeChild(overlay); onReady(); }
      }, btnText || 'Ready, go!')
    ]));
    root.appendChild(overlay);
    return overlay;
  }

  /* --- dice faces --- */
  var DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  /* ---------------------------------------------------------------- levels
     Every game is played at Level 1..N. The profile turns a level number
     into numbers a game can use: bigger boards, deeper thinking, faster
     balls, fewer lives. Level 1 always has the most blunders built in, the
     top level is the game at its full strength. */
  var LEVEL_COUNT = 5;
  var LEVEL_NAMES = ['Level 1 · Easy', 'Level 2 · Warm-up', 'Level 3 · Tricky', 'Level 4 · Tough', 'Level 5 · Expert'];

  function profile(level, total) {
    var count = Math.max(1, total || LEVEL_COUNT);
    var lv = Math.max(1, Math.min(count, Math.round(level || 1)));
    var t = count > 1 ? (lv - 1) / (count - 1) : 0;
    return {
      level: lv,
      total: count,
      t: t,
      /* one value per level, e.g. ints([2, 3, 4, 5, 6]) */
      ints: function (list) { return list[Math.min(list.length - 1, lv - 1)]; },
      pick: function (list) { return list[Math.min(list.length - 1, lv - 1)]; },
      lerp: function (a, b) { return a + (b - a) * t; },
      round: function (a, b) { return Math.round(a + (b - a) * t); },
      /* thinking depth: 1 at level 1, up to max at the top level */
      depth: function (max) { return Math.max(1, Math.round(1 + t * (max - 1))); },
      /* chance the computer plays a silly move — disappears as levels rise */
      blunder: function (easy) {
        var top = easy === undefined ? 0.6 : easy;
        return Math.max(0, top * (1 - t));
      },
      /* timings: slow at level 1, fast at the top */
      ms: function (slow, quick) { return Math.round(slow + (quick - slow) * t); }
    };
  }

  function levelCount(game) { return (game && game.levels) || LEVEL_COUNT; }
  function levelName(game, level) {
    var names = (game && game.levelNames) || LEVEL_NAMES;
    var lv = Math.max(1, Math.min(names.length, Math.round(level || 1)));
    return names[lv - 1];
  }
  function levelHint(game, level) {
    var hints = (game && game.levelHints) || [];
    var lv = Math.max(1, Math.min(hints.length, Math.round(level || 1)));
    return hints[lv - 1] || '';
  }

  function register(game) { GAMES.push(game); }
  function byId(id) {
    for (var i = 0; i < GAMES.length; i++) { if (GAMES[i].id === id) { return GAMES[i]; } }
    return null;
  }

  window.GameKit = {
    GAMES: GAMES,
    register: register,
    byId: byId,
    h: h,
    grid: grid,
    each: each,
    randInt: randInt,
    pick: pick,
    shuffle: shuffle,
    delay: delay,
    confetti: confetti,
    cover: cover,
    profile: profile,
    levelCount: levelCount,
    levelName: levelName,
    levelHint: levelHint,
    LEVEL_NAMES: LEVEL_NAMES,
    LEVEL_COUNT: LEVEL_COUNT,
    DICE: DICE
  };
})();
