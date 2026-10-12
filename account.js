/* Players & progress for the Awesome Brothers website.
   A very simple, kid-friendly sign in: pick a name and a secret password.
   There is no email, no verification and nothing is sent anywhere — the whole
   player book lives in this browser (localStorage), so it is a family
   scoreboard rather than a security system. Two kids can keep their own
   names, colours, levels and trophies on the same laptop or tablet.

   window.AwesomeAccounts  → who is playing (sign up / sign in / sign out)
   window.AwesomeProgress  → what that player has unlocked and won */
(function () {
  'use strict';

  var BOOK = 'awesome-accounts';
  var SESSION = 'awesome-session';
  var GUEST = 'guest';
  var MIN_PASS = 3;
  var FACES = ['🧒', '👦', '👧', '🧑', '🐯', '🦊', '🐼', '🐵', '🦄', '🐙', '🐢', '🐶', '⚽', '🏏', '🚀', '🎨', '🌟', '🍭', '🧩', '🤖'];
  var COLORS = ['#e63946', '#f4801a', '#e8a300', '#7ab800', '#2f9e63', '#12a5a5', '#2f7fd1', '#4f5bd5', '#8b5cf6', '#d63aa8', '#e8578f', '#96633a'];

  /* ------------------------------------------------------------- storage */
  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) { return fallback; }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* private mode */ }
  }
  function wipe(key) {
    try { window.localStorage.removeItem(key); } catch (err) { /* ignore */ }
  }

  /* A scrambled fingerprint of the password. It is not real cryptography —
     just enough that the secret is not sitting in the browser in plain text
     for a curious little brother to read. */
  function scramble(text, salt) {
    var all = String(salt) + '|' + String(text), a = 0x811c9dc5, b = 0x1000193, i;
    for (i = 0; i < all.length; i++) { a ^= all.charCodeAt(i); a = (a * 0x01000193) >>> 0; }
    for (i = all.length - 1; i >= 0; i--) { b = ((b << 5) - b + all.charCodeAt(i)) >>> 0; }
    function hex(n) { return ('0000000' + n.toString(16)).slice(-8); }
    return hex(a) + hex(b);
  }
  function makeSalt() {
    var out = '', chars = 'abcdefghijklmnopqrstuvwxyz0123456789', i;
    for (i = 0; i < 6; i++) { out += chars.charAt(Math.floor(Math.random() * chars.length)); }
    return out;
  }

  function cleanId(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  }
  function keyOf(id) { return String(id || '').toLowerCase(); }

  /* ------------------------------------------------------------- the book */
  var book = read(BOOK, {});
  var session = null;
  try { session = window.localStorage.getItem(SESSION); } catch (err) { session = null; }
  var listeners = [];

  function users() {
    return Object.keys(book).map(function (k) { return book[k]; })
      .sort(function (a, b) { return (a.created || 0) - (b.created || 0); });
  }
  function current() {
    if (session && book[keyOf(session)]) { return book[keyOf(session)]; }
    return null;
  }
  function userKey() {
    var me = current();
    return me ? keyOf(me.name) : GUEST;
  }
  /* Every saved thing belongs to the player who is signed in: 'awesome-players'
     becomes 'awesome-players:binu'. Guests share one bucket. */
  function key(base) { return base + ':' + userKey(); }

  function emit() {
    listeners.forEach(function (fn) { try { fn(current()); } catch (err) { /* keep going */ } });
    try { document.dispatchEvent(new CustomEvent('awesome:account', { detail: current() })); } catch (err) { /* old browsers */ }
    paint();
  }

  function signUp(rawId, password, face, color) {
    var id = cleanId(rawId);
    if (id.length < 2) { return { ok: false, error: 'Please pick a name with at least 2 letters.' }; }
    if (book[keyOf(id)]) { return { ok: false, error: '“' + id + '” is already taken — try another name.' }; }
    if (String(password || '').length < MIN_PASS) {
      return { ok: false, error: 'The secret password needs at least ' + MIN_PASS + ' letters or numbers.' };
    }
    var salt = makeSalt();
    book[keyOf(id)] = {
      name: id,
      face: face || FACES[0],
      color: color || COLORS[Object.keys(book).length % COLORS.length],
      salt: salt,
      pass: scramble(id.toLowerCase() + '|' + password, salt),
      created: Date.now ? Date.now() : new Date().getTime()
    };
    session = id;
    write(BOOK, book);
    try { window.localStorage.setItem(SESSION, session); } catch (err) { /* ignore */ }
    /* the guest's games and progress come along to the new player */
    adoptGuest(id);
    emit();
    if (window.AwesomeSFX) { window.AwesomeSFX.play('win'); }
    return { ok: true, user: book[keyOf(id)] };
  }

  function signIn(rawId, password) {
    var id = cleanId(rawId);
    var user = book[keyOf(id)];
    if (!user) { return { ok: false, error: 'No player called “' + (id || '?') + '” yet — create one below.' }; }
    if (scramble(id.toLowerCase() + '|' + password, user.salt) !== user.pass) {
      return { ok: false, error: 'That is not the secret password for ' + user.name + '.' };
    }
    session = user.name;
    try { window.localStorage.setItem(SESSION, session); } catch (err) { /* ignore */ }
    emit();
    if (window.AwesomeSFX) { window.AwesomeSFX.play('pop'); }
    return { ok: true, user: user };
  }

  function signOut() {
    session = null;
    wipe(SESSION);
    emit();
  }

  function update(patch) {
    var me = current();
    if (!me) { return { ok: false, error: 'Nobody is signed in.' }; }
    if (patch.name !== undefined) {
      var id = cleanId(patch.name);
      if (id.length < 2) { return { ok: false, error: 'Please use at least 2 letters.' }; }
      if (book[keyOf(id)] && keyOf(id) !== keyOf(me.name)) { return { ok: false, error: 'That name is taken.' }; }
      var salt = makeSalt();
      book[keyOf(id)] = {
        name: id, face: me.face, color: me.color, salt: salt,
        /* keep the same password under the new name */
        pass: scramble(id.toLowerCase() + '|', salt), created: me.created
      };
      delete book[keyOf(me.name)];
      session = id;
    }
    var now = book[keyOf(session)];
    if (patch.face) { now.face = patch.face; }
    if (patch.color) { now.color = patch.color; }
    if (patch.password) {
      now.salt = makeSalt();
      now.pass = scramble(now.name.toLowerCase() + '|' + patch.password, now.salt);
    }
    write(BOOK, book);
    try { window.localStorage.setItem(SESSION, session); } catch (err) { /* ignore */ }
    emit();
    return { ok: true, user: now };
  }

  /* ------------------------------------------------------- per-player data */
  /* Bring anything the guest collected over to a brand new player. */
  var ADOPT = ['awesome-players', 'awesome-progress', 'awesome-waves', 'awesome-memory'];
  function adoptGuest(id) {
    ADOPT.forEach(function (base) {
      var from = read(base + ':' + GUEST, null);
      if (from === null) { return; }
      var to = base + ':' + id.toLowerCase();
      try {
        if (window.localStorage.getItem(to) === null) {
          window.localStorage.setItem(to, JSON.stringify(from));
        }
      } catch (err) { /* ignore */ }
    });
  }

  /* --------------------------------------------------------------- progress */
  /* Per player: the furthest level unlocked in each game (with its stars),
     wins, and when they last played it. */
  function progress() {
    var data = read(key('awesome-progress'), null);
    if (!data || typeof data !== 'object') { data = { games: {} }; }
    if (!data.games) { data.games = {}; }
    return data;
  }
  function saveProgress(data) {
    write(key('awesome-progress'), data);
    progressListeners.forEach(function (fn) { try { fn(data); } catch (err) { /* keep going */ } });
  }
  var progressListeners = [];
  function gameEntry(data, id) {
    if (!data.games[id]) { data.games[id] = { best: 1, wins: 0, plays: 0, stars: 0 }; }
    return data.games[id];
  }

  var Progress = {
    /* the level the player last chose to play at */
    level: function (id) { return gameEntry(progress(), id).chosen || 1; },
    /* the highest level they have unlocked */
    best: function (id) { return gameEntry(progress(), id).best || 1; },
    stars: function (id) { return gameEntry(progress(), id).stars || 0; },
    wins: function (id) { return gameEntry(progress(), id).wins || 0; },
    plays: function (id) { return gameEntry(progress(), id).plays || 0; },
    cleared: function (id, level) {
      var entry = gameEntry(progress(), id);
      return !!(entry.cleared && entry.cleared[level]);
    },
    visit: function (id, level) {
      var data = progress();
      var entry = gameEntry(data, id);
      entry.plays = (entry.plays || 0) + 1;
      entry.tries = entry.tries || {};
      entry.tries[level || 1] = (entry.tries[level || 1] || 0) + 1;
      entry.last = Date.now ? Date.now() : new Date().getTime();
      saveProgress(data);
      return entry;
    },
    /* A finished game. Winning level L unlocks L+1; a draw also counts, and so
       do three tries at the same level — nobody gets stuck forever. */
    record: function (id, level, total, won) {
      var data = progress();
      var entry = gameEntry(data, id);
      var lv = Math.max(1, Math.round(level || 1));
      var last = Math.max(1, total || 5);
      entry.finished = (entry.finished || 0) + 1;
      if (won) { entry.wins = (entry.wins || 0) + 1; }
      var tries = (entry.tries && entry.tries[lv]) || 1;
      var unlock = won || (tries >= 3 && lv >= (entry.best || 1));
      if (unlock && lv < last) {
        entry.best = Math.max(entry.best || 1, lv + 1);
        entry.chosen = lv + 1;
        entry.newly = lv + 1;
      }
      if (won) {
        entry.cleared = entry.cleared || {};
        entry.cleared[lv] = true;
        entry.stars = Math.max(entry.stars || 0, lv >= last ? 3 : (lv >= 3 ? 2 : 1));
      }
      saveProgress(data);
      return { entry: entry, unlocked: !!(unlock && lv < last), next: lv + 1 };
    },
    setLevel: function (id, level) {
      var data = progress();
      var entry = gameEntry(data, id);
      entry.chosen = Math.max(1, Math.min(entry.best || 1, Math.round(level || 1)));
      saveProgress(data);
      return entry;
    },
    all: function () { return progress().games; },
    clearedCount: function (id) {
      var entry = gameEntry(progress(), id);
      return entry.cleared ? Object.keys(entry.cleared).length : 0;
    },
    /* how many stars are on the shelf: one per game played, two from level 3,
       three for finishing a game at its top level */
    trophyLine: function (id) {
      var entry = gameEntry(progress(), id);
      var out = 'Level ' + (entry.best || 1) + '/' + 5;
      if (entry.wins) { out += ' · ' + entry.wins + '🏆'; }
      return out;
    },
    summary: function () {
      var games = progress().games, played = 0, wins = 0, stars = 0, levels = 0;
      Object.keys(games).forEach(function (k) {
        played += games[k].plays || 0;
        wins += games[k].wins || 0;
        stars += games[k].stars || 0;
        levels += (games[k].best || 1) - 1;
      });
      return { played: played, wins: wins, stars: stars, levels: levels, games: Object.keys(games).length };
    },
    reset: function () { write(key('awesome-progress'), { games: {} }); saveProgress({ games: {} }); },
    onChange: function (fn) { progressListeners.push(fn); },
    storageKey: function () { return key('awesome-progress'); }
  };

  /* ------------------------------------------------------------------- UI */
  var panel = null, tab = 'signin', message = '', facePick = null, form = null, switching = false;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) { node.className = cls; }
    /* text may also be a list of child nodes — e.g. a row of buttons */
    if (Array.isArray(text)) {
      text.forEach(function (kid) { if (kid) { node.appendChild(kid); } });
    } else if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }
  function field(labelText, input) {
    var wrap = el('label', 'ac-field');
    wrap.appendChild(el('span', 'ac-field-tag', labelText));
    wrap.appendChild(input);
    return wrap;
  }
  function nameInput(value) {
    var input = el('input', 'ac-input ac-name');
    input.type = 'text';
    input.maxLength = 14;
    input.placeholder = 'Binu';
    input.autocomplete = 'off';
    input.value = value || '';
    return input;
  }
  function passInput(value) {
    var input = el('input', 'ac-input ac-pass');
    input.type = 'password';
    input.maxLength = 24;
    input.placeholder = 'secret password';
    input.autocomplete = 'off';
    input.value = value || '';
    return input;
  }
  /* Keep whatever has been typed when the card is redrawn after a mistake. */
  function rememberForm(idBox, passBox) {
    function keep() { form = { id: idBox.value, pass: passBox.value }; }
    idBox.addEventListener('input', keep);
    passBox.addEventListener('input', keep);
  }

  function playerList() {
    var list = el('div', 'ac-players');
    var kids = users();
    if (!kids.length) {
      list.appendChild(el('p', 'ac-hint', 'No players on this device yet — make one in “New player”.'));
      return list;
    }
    list.appendChild(el('span', 'ac-field-tag', 'Players on this device'));
    kids.forEach(function (user) {
      var chip = el('button', 'ac-player' + (current() && keyOf(current().name) === keyOf(user.name) ? ' ac-player-on' : ''));
      chip.type = 'button';
      chip.setAttribute('data-name', user.name);
      var face = el('span', 'ac-player-face', user.face);
      face.style.setProperty('--pc', user.color || COLORS[0]);
      chip.appendChild(face);
      chip.appendChild(el('span', 'ac-player-name', user.name));
      chip.addEventListener('click', function () {
        form = { id: user.name, pass: '' };
        paint();
        var pass = panel.querySelector('.ac-pass');
        if (pass && pass.focus) { pass.focus(); }
      });
      list.appendChild(chip);
    });
    return list;
  }

  function facePicker() {
    var row = el('div', 'ac-faces');
    FACES.forEach(function (face) {
      var b = el('button', 'ac-face' + (face === facePick ? ' ac-face-on' : ''), face);
      b.type = 'button';
      b.setAttribute('data-face', face);
      b.addEventListener('click', function () { facePick = face; paint(); });
      row.appendChild(b);
    });
    return row;
  }

  function signInCard() {
    var card = el('div', 'ac-body');
    card.appendChild(playerList());
    var id = nameInput(form && form.id);
    var pass = passInput(form && form.pass);
    rememberForm(id, pass);
    card.appendChild(field('Your name', id));
    card.appendChild(field('Secret password', pass));
    if (message) { card.appendChild(el('p', 'ac-error', message)); }
    var go = el('button', 'ac-btn ac-go', '▶️ Let’s play!');
    go.type = 'button';
    go.addEventListener('click', function () {
      var out = signIn(id.value, pass.value);
      if (!out.ok) { message = out.error; paint(); return; }
      message = '';
      form = null;
      switching = false;
      close();
    });
    var swap = el('button', 'ac-btn ac-ghost', '✨ New player');
    swap.type = 'button';
    swap.addEventListener('click', function () { tab = 'signup'; message = ''; paint(); });
    var back = null;
    if (current()) {
      back = el('button', 'ac-btn ac-ghost', '← Back to ' + current().name);
      back.type = 'button';
      back.addEventListener('click', function () { switching = false; message = ''; form = null; paint(); });
    }
    card.appendChild(el('div', 'ac-actions', [go, swap, back]));
    card.appendChild(el('p', 'ac-note', 'Nobody but us can see this — names and passwords stay in this browser.'));
    return card;
  }

  function signUpCard() {
    var card = el('div', 'ac-body');
    var id = nameInput(form && form.id);
    var pass = passInput(form && form.pass);
    rememberForm(id, pass);
    card.appendChild(field('Pick a name', id));
    card.appendChild(field('Pick a secret password', pass));
    card.appendChild(el('span', 'ac-field-tag', 'Choose your face'));
    card.appendChild(facePicker());
    if (message) { card.appendChild(el('p', 'ac-error', message)); }
    var go = el('button', 'ac-btn ac-go', '🌟 Create my player');
    go.type = 'button';
    go.addEventListener('click', function () {
      var out = signUp(id.value, pass.value, facePick);
      if (!out.ok) { message = out.error; paint(); return; }
      message = '';
      form = null;
      switching = false;
      close();
    });
    var back = el('button', 'ac-btn ac-ghost', '← I already have one');
    back.type = 'button';
    back.addEventListener('click', function () { tab = 'signin'; message = ''; paint(); });
    card.appendChild(el('div', 'ac-actions', [go, back]));
    card.appendChild(el('p', 'ac-note', 'Two players can share this device — each one gets their own colours, levels and trophies.'));
    return card;
  }

  function signedInCard(user) {
    var card = el('div', 'ac-body');
    var head = el('div', 'ac-me');
    var face = el('span', 'ac-me-face', user.face);
    face.style.setProperty('--pc', user.color || COLORS[0]);
    head.appendChild(face);
    var who = el('div', 'ac-me-text');
    who.appendChild(el('strong', '', user.name));
    who.appendChild(el('small', '', 'Levels and trophies are kept for you'));
    head.appendChild(who);
    card.appendChild(head);
    var s = Progress.summary();
    var stats = el('div', 'ac-stats');
    [['🏆', s.wins, 'wins'], ['🎯', s.levels, 'levels unlocked'], ['⭐', s.stars, 'stars'], ['🎮', s.played, 'games played']]
      .forEach(function (row) {
        var box = el('div', 'ac-stat');
        box.appendChild(el('span', 'ac-stat-icon', row[0]));
        box.appendChild(el('strong', '', String(row[1])));
        box.appendChild(el('small', '', row[2]));
        stats.appendChild(box);
      });
    card.appendChild(stats);
    var faces = el('div', 'ac-faces');
    FACES.slice(0, 10).forEach(function (f) {
      var b = el('button', 'ac-face' + (f === user.face ? ' ac-face-on' : ''), f);
      b.type = 'button';
      b.addEventListener('click', function () { update({ face: f }); });
      faces.appendChild(b);
    });
    card.appendChild(el('span', 'ac-field-tag', 'Change your face'));
    card.appendChild(faces);
    var out = el('button', 'ac-btn ac-ghost', '👋 Sign out');
    out.type = 'button';
    out.addEventListener('click', function () {
      signOut();
      switching = false;
      tab = 'signin';
      form = null;
      paint();
    });
    /* Switching player really shows the sign-in list again (and a way back). */
    var swap = el('button', 'ac-btn ac-go', '🔄 Switch player');
    swap.type = 'button';
    swap.addEventListener('click', function () {
      switching = true;
      tab = 'signin';
      form = null;
      message = '';
      paint();
    });
    card.appendChild(el('div', 'ac-actions', [swap, out]));
    card.appendChild(el('p', 'ac-note', 'Signing out does not delete anything — your levels and trophies are waiting for you.'));
    return card;
  }

  function build() {
    panel = el('div', 'ac-panel');
    panel.id = 'accountPanel';
    panel.hidden = true;
    var card = el('div', 'ac-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Players and passwords');
    panel.appendChild(card);
    panel.addEventListener('click', function (e) { if (e.target === panel) { close(); } });
    document.body.appendChild(panel);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel && !panel.hidden) { close(); }
    });
    chip();
    paint();
  }

  function paint() {
    if (!panel) { return; }
    var card = panel.firstChild;
    while (card.children.length) { card.removeChild(card.children[0]); }
    var x = el('button', 'ac-x', '✖');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    card.appendChild(x);
    var me = current();
    var showForm = !me || switching;
    card.appendChild(el('h2', 'ac-title', showForm
      ? (tab === 'signin' ? '👤 Who is playing?' : '✨ New player')
      : '👋 Hello, ' + me.name + '!'));
    card.appendChild(el('p', 'ac-lead', showForm
      ? 'Just a name and a secret password. No email, no waiting — it is only for our own games room.'
      : 'Your own colours, levels and trophies — all saved on this device.'));
    var tabs = el('div', 'ac-tabs');
    if (showForm) {
      [['signin', '👤 Sign in'], ['signup', '✨ New player']].forEach(function (pair) {
        var b = el('button', 'ac-tab' + (tab === pair[0] ? ' ac-tab-on' : ''), pair[1]);
        b.type = 'button';
        b.setAttribute('data-tab', pair[0]);
        b.addEventListener('click', function () { tab = pair[0]; message = ''; paint(); });
        tabs.appendChild(b);
      });
      card.appendChild(tabs);
    }
    card.appendChild(showForm ? (tab === 'signin' ? signInCard() : signUpCard()) : signedInCard(me));
    var chipBtn = document.querySelector('.ac-chip');
    if (chipBtn) {
      while (chipBtn.children.length) { chipBtn.removeChild(chipBtn.children[0]); }
      chipBtn.appendChild(el('span', 'ac-chip-face', me ? me.face : '👤'));
      chipBtn.appendChild(el('span', 'ac-chip-name', me ? me.name : 'Sign in'));
      chipBtn.setAttribute('title', me ? 'You are signed in as ' + me.name : 'Sign in or make a player');
    }
  }

  function chip() {
    var host = document.querySelector('.header-inner') || document.body;
    var btn = document.querySelector('.ac-chip');
    if (!btn) {
      btn = el('button', 'ac-chip');
      btn.type = 'button';
      btn.id = 'accountBtn';
      btn.addEventListener('click', open);
      host.appendChild(btn);
    }
  }

  function open() {
    if (!panel) { build(); }
    chip();
    message = '';
    switching = false;
    panel.hidden = false;
    document.documentElement.classList.add('ac-open');
    paint();
  }
  function close() {
    if (!panel) { return; }
    panel.hidden = true;
    document.documentElement.classList.remove('ac-open');
  }

  window.AwesomeAccounts = {
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    update: update,
    current: current,
    users: users,
    key: key,
    open: open,
    close: close,
    isGuest: function () { return !current(); },
    faces: FACES,
    colors: COLORS,
    minPassword: MIN_PASS,
    onChange: function (fn) { listeners.push(fn); }
  };
  window.AwesomeProgress = Progress;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
