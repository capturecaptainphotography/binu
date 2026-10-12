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
    DICE: DICE
  };
})();
