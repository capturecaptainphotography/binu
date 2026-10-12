/* Player options for the Awesome Games Room.
   Names, faces and colours for the two players and the computer, saved in the
   browser. Every game in the room reads its names from here through the shared
   api, and every board reads its colours from the CSS variables this sets, so
   choosing "Binu" and "Himu" really personalises all 22 games. */
(function () {
  'use strict';

  var BASE_KEY = 'awesome-players';
  var MAX_NAME = 14;
  /* One set of names and colours per signed-in player, so two kids on the same
     tablet do not overwrite each other. Anyone not signed in shares a bucket. */
  function storageKey() {
    if (window.AwesomeAccounts && window.AwesomeAccounts.key) { return window.AwesomeAccounts.key(BASE_KEY); }
    return BASE_KEY;
  }

  /* A bright, friendly palette — every one of these reads well on white. */
  var COLORS = [
    '#e63946', '#f4801a', '#e8a300', '#7ab800', '#2f9e63', '#12a5a5',
    '#2f7fd1', '#4f5bd5', '#8b5cf6', '#d63aa8', '#e8578f', '#96633a',
    '#4b5563', '#0f766e'
  ];
  var FACES = [
    '🧒', '👦', '👧', '🧑', '🐯', '🦊', '🐼', '🐵',
    '🦄', '🐙', '🐢', '🐶', '⚽', '🏏', '🚀', '🎨',
    '🌟', '⭐', '🍭', '🧩', '🤖', '🐝', '🙋', '🦖'
  ];

  var DEFAULTS = {
    p1: { name: 'Player 1', face: '🧒', color: '#e63946' },
    p2: { name: 'Player 2', face: '👦', color: '#2f7fd1' },
    cpu: { name: 'Computer', face: '🤖', color: '#8b5cf6' }
  };
  var ROLES = { p1: 'Player 1', p2: 'Player 2', cpu: 'Computer' };

  var listeners = [];
  var profile = load();

  /* ---------------------------------------------------------------- colour */
  function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))); }
  function toRgb(hex) {
    var m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex));
    if (!m) { return { r: 230, g: 57, b: 70 }; }
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  function toHex(rgb) {
    return '#' + [rgb.r, rgb.g, rgb.b].map(function (v) {
      var s = clamp(v).toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }
  function mixWith(hex, target, amount) {
    var a = toRgb(hex);
    var b = toRgb(target);
    return toHex({
      r: a.r + (b.r - a.r) * amount,
      g: a.g + (b.g - a.g) * amount,
      b: a.b + (b.b - a.b) * amount
    });
  }
  /* One colour becomes a whole ramp, so boards can use pale fills, tints for
     shadows and a dark ink for text without needing colour-mix() support. */
  function ramp(hex) {
    var rgb = toRgb(hex);
    return {
      base: toHex(rgb),
      soft: mixWith(hex, '#ffffff', 0.88),
      tint: mixWith(hex, '#ffffff', 0.68),
      mid: mixWith(hex, '#ffffff', 0.34),
      deep: mixWith(hex, '#000000', 0.28),
      glow: 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.42)'
    };
  }
  function varsFor(prefix, hex) {
    var r = ramp(hex);
    var out = {};
    out['--' + prefix] = r.base;
    out['--' + prefix + '-soft'] = r.soft;
    out['--' + prefix + '-tint'] = r.tint;
    out['--' + prefix + '-mid'] = r.mid;
    out['--' + prefix + '-deep'] = r.deep;
    out['--' + prefix + '-glow'] = r.glow;
    return out;
  }

  /* --------------------------------------------------------------- storage */
  function cleanName(value, fallback) {
    var name = String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!name) { return fallback; }
    return name.slice(0, MAX_NAME);
  }
  function cleanColor(value, fallback) {
    return /^#[\da-f]{6}$/i.test(String(value)) ? String(value).toLowerCase() : fallback;
  }
  function cleanFace(value, fallback) {
    var face = String(value === undefined ? '' : value);
    return face && face.length <= 4 ? face : fallback;
  }
  function load() {
    var raw = null;
    try { raw = JSON.parse(window.localStorage.getItem(storageKey()) || 'null'); } catch (err) { raw = null; }
    var out = {};
    ['p1', 'p2', 'cpu'].forEach(function (who) {
      var src = (raw && raw[who]) || {};
      out[who] = {
        name: cleanName(src.name, DEFAULTS[who].name),
        face: cleanFace(src.face, DEFAULTS[who].face),
        color: cleanColor(src.color, DEFAULTS[who].color)
      };
    });
    out.skin = raw && raw.skin === 'rainbow' ? 'rainbow' : 'classic';
    return out;
  }
  function save() {
    try { window.localStorage.setItem(storageKey(), JSON.stringify(profile)); } catch (err) { /* in-memory only */ }
  }

  /* A player signed in or out: their own names and colours come back. */
  function reload() {
    profile = load();
    emit();
  }

  /* ------------------------------------------------------------------- api */
  function get() { return profile; }

  /* An online game: the second player is a real person on another device, so
     their name comes from the relay. Faces and colours still come from the
     Player 2 card here. */
  var peerName = null;

  function names(mode) {
    return mode === 'cpu'
      ? [profile.p1.name, profile.cpu.name]
      : [profile.p1.name, peerName || profile.p2.name];
  }
  function players(mode) {
    if (mode === 'cpu') { return [profile.p1, profile.cpu]; }
    if (!peerName) { return [profile.p1, profile.p2]; }
    return [profile.p1, { name: peerName, face: profile.p2.face, color: profile.p2.color }];
  }
  function faces(mode) {
    var list = players(mode);
    return [list[0].face, list[1].face];
  }

  function vars(mode) {
    var list = players(mode);
    var out = varsFor('p1', list[0].color);
    var second = varsFor('p2', list[1].color);
    Object.keys(second).forEach(function (k) { out[k] = second[k]; });
    return out;
  }

  /* Paint the colours onto an element. Cards and the page use the 2-player
     colours; the game stage uses whichever pair is actually playing. */
  function applyTo(el, mode) {
    if (!el || !el.style || !el.style.setProperty) { return; }
    var v = vars(mode || 'two');
    Object.keys(v).forEach(function (k) { el.style.setProperty(k, v[k]); });
    el.setAttribute('data-skin', profile.skin);
  }

  function emit() {
    save();
    applyTo(document.documentElement, 'two');
    listeners.forEach(function (fn) { try { fn(profile); } catch (err) { /* keep going */ } });
    paintUI();
  }

  function set(who, patch) {
    var target = profile[who] || profile.p1;
    if (patch.name !== undefined) { target.name = cleanName(patch.name, DEFAULTS[who].name); }
    if (patch.face !== undefined) { target.face = cleanFace(patch.face, DEFAULTS[who].face); }
    if (patch.color !== undefined) { target.color = cleanColor(patch.color, DEFAULTS[who].color); }
    emit();
  }
  function setSkin(skin) {
    profile.skin = skin === 'rainbow' ? 'rainbow' : 'classic';
    emit();
  }
  /* Called by the online layer when a friend joins or leaves. */
  function setOnlinePeer(name) {
    var next = name ? cleanName(name, DEFAULTS.p2.name) : null;
    if (next === peerName) { return; }
    peerName = next;
    emit();
  }
  function reset() {
    ['p1', 'p2', 'cpu'].forEach(function (who) {
      profile[who] = { name: DEFAULTS[who].name, face: DEFAULTS[who].face, color: DEFAULTS[who].color };
    });
    profile.skin = 'classic';
    emit();
  }

  /* ---------------------------------------------------------------- the UI */
  var panel = null, grid = null, strip = null;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) { node.className = cls; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function card(who) {
    var data = profile[who];
    var wrap = el('div', 'gk-pp');
    wrap.setAttribute('data-who', who);
    wrap.style.setProperty('--pc', data.color);
    wrap.style.setProperty('--pc-soft', ramp(data.color).soft);
    wrap.style.setProperty('--pc-deep', ramp(data.color).deep);

    var head = el('div', 'gk-pp-head');
    head.appendChild(el('span', 'gk-pp-face', data.face));
    var headText = el('span', 'gk-pp-role');
    headText.appendChild(el('strong', '', data.name));
    headText.appendChild(el('small', '', ROLES[who]));
    head.appendChild(headText);
    wrap.appendChild(head);

    var nameLabel = el('label', 'gk-pp-name-row');
    nameLabel.appendChild(el('span', 'gk-pp-tag', 'Name'));
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'gk-input gk-pp-name';
    input.value = data.name;
    input.maxLength = MAX_NAME;
    input.setAttribute('aria-label', ROLES[who] + ' name');
    input.addEventListener('input', function () { set(who, { name: input.value }); });
    nameLabel.appendChild(input);
    wrap.appendChild(nameLabel);

    wrap.appendChild(el('span', 'gk-pp-tag', 'Face'));
    var faces = el('div', 'gk-pp-faces');
    FACES.forEach(function (face) {
      var b = el('button', 'gk-pp-face-btn' + (face === data.face ? ' gk-pp-on' : ''), face);
      b.type = 'button';
      b.setAttribute('data-face', face);
      b.setAttribute('aria-label', 'Face ' + face);
      b.addEventListener('click', function () { set(who, { face: face }); });
      faces.appendChild(b);
    });
    wrap.appendChild(faces);

    wrap.appendChild(el('span', 'gk-pp-tag', 'Colour'));
    var colors = el('div', 'gk-pp-colors');
    COLORS.forEach(function (color) {
      var b = el('button', 'gk-pp-color' + (color === data.color ? ' gk-pp-on' : ''));
      b.type = 'button';
      b.setAttribute('data-color', color);
      b.style.setProperty('--sw', color);
      b.setAttribute('aria-label', 'Colour ' + color);
      b.addEventListener('click', function () { set(who, { color: color }); });
      colors.appendChild(b);
    });
    wrap.appendChild(colors);

    return wrap;
  }

  function pip(data, label) {
    var chip = el('span', 'gk-who-pip');
    chip.style.setProperty('--pc', data.color);
    chip.style.setProperty('--pc-soft', ramp(data.color).soft);
    chip.style.setProperty('--pc-deep', ramp(data.color).deep);
    chip.appendChild(el('span', 'gk-who-face', data.face));
    chip.appendChild(el('span', 'gk-who-name', data.name));
    chip.appendChild(el('span', 'gk-who-label', label));
    return chip;
  }

  /* The little "Binu vs Himu" bar: used under the games list and again on the
     game screen so you always know whose colour is whose. */
  function bar(mode) {
    var list = players(mode);
    var row = el('div', 'gk-who-row');
    row.appendChild(pip(list[0], mode === 'cpu' ? 'you' : 'player 1'));
    row.appendChild(el('span', 'gk-who-vs', 'vs'));
    row.appendChild(pip(list[1], mode === 'cpu' ? 'computer' : 'player 2'));
    return row;
  }

  function paintUI() {
    if (grid) {
      while (grid.children.length) { grid.removeChild(grid.children[0]); }
      ['p1', 'p2', 'cpu'].forEach(function (who) { grid.appendChild(card(who)); });
    }
    var skinBox = document.getElementById('ppSkins');
    if (skinBox) {
      Array.prototype.forEach.call(skinBox.children, function (btn) {
        var on = btn.getAttribute('data-skin') === profile.skin;
        btn.className = 'gk-filter' + (on ? ' gk-filter-on' : '');
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    if (strip) {
      while (strip.children.length) { strip.removeChild(strip.children[0]); }
      var row = el('div', 'gk-who-row');
      row.appendChild(pip(profile.p1, 'player 1'));
      row.appendChild(el('span', 'gk-who-vs', 'vs'));
      row.appendChild(pip(profile.p2, 'player 2'));
      row.appendChild(el('span', 'gk-who-vs', '·'));
      row.appendChild(pip(profile.cpu, 'computer'));
      strip.appendChild(row);

      var open = el('button', 'gk-btn gk-btn-main gk-btn-small gk-who-edit', '🎨 Change names & colours');
      open.type = 'button';
      open.id = 'playersBtn';
      open.addEventListener('click', show);
      strip.appendChild(open);
    }
  }

  function show() {
    if (!panel) { return; }
    panel.hidden = false;
    document.documentElement.classList.add('gk-pp-open');
    var first = panel.querySelector('.gk-pp-name');
    if (first && first.focus) { first.focus(); }
  }
  function hide() {
    if (!panel) { return; }
    panel.hidden = true;
    document.documentElement.classList.remove('gk-pp-open');
    /* Tell the games room the players are settled, so an open game can start
       again with the new names in its messages. */
    document.dispatchEvent(new CustomEvent('awesome:players-done'));
  }

  function build() {
    panel = document.getElementById('playersPanel');
    grid = document.getElementById('ppGrid');
    strip = document.getElementById('whoStrip');

    if (panel && grid) {
      panel.addEventListener('click', function (e) {
        if (e.target === panel) { hide(); }
      });
      var closeBtn = document.getElementById('ppClose');
      if (closeBtn) { closeBtn.addEventListener('click', hide); }
      var resetBtn = document.getElementById('ppReset');
      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          reset();
          if (window.AwesomeSFX) { window.AwesomeSFX.play('pop'); }
        });
      }
      var doneBtn = document.getElementById('ppDone');
      if (doneBtn) {
        doneBtn.addEventListener('click', function () {
          hide();
          if (window.AwesomeSFX) { window.AwesomeSFX.play('click'); }
        });
      }
      var skinBox = document.getElementById('ppSkins');
      if (skinBox) {
        Array.prototype.forEach.call(skinBox.children, function (btn) {
          btn.addEventListener('click', function () { setSkin(btn.getAttribute('data-skin')); });
        });
      }
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { hide(); }
      });
    }
    paintUI();
  }

  window.GamePlayers = {
    get: get,
    set: set,
    reset: reset,
    names: names,
    players: players,
    faces: faces,
    bar: bar,
    vars: vars,
    applyTo: applyTo,
    ramp: ramp,
    open: show,
    close: hide,
    setOnlinePeer: setOnlinePeer,
    onlinePeer: function () { return peerName; },
    palette: COLORS,
    facesList: FACES,
    maxName: MAX_NAME,
    onChange: function (fn) { listeners.push(fn); }
  };

  /* Defaults on the page straight away so cards are colourful before a game. */
  applyTo(document.documentElement, 'two');

  if (window.AwesomeAccounts) { window.AwesomeAccounts.onChange(reload); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
