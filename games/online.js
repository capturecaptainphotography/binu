/* Online play: two kids, two devices, one game ID.
   One player is the host — the game really runs on their device, and every
   board change is posted to the relay and shown on the other player's screen.
   The other player is the guest — they see the host's board and every tap they
   make is sent back to the host to be played. Turn-based games all work this
   way with no changes to the games themselves. */
(function () {
  'use strict';

  var K = window.GameKit;
  var P = window.GamePlayers;

  function $(id) { return document.getElementById(id); }
  function later(fn, ms) { return window.setTimeout(fn, ms || 0); }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) { node.className = cls; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }
  function button(cls, text, onclick) {
    var b = el('button', cls, text);
    b.type = 'button';
    if (onclick) { b.addEventListener('click', onclick); }
    return b;
  }
  /* Where am I inside the board? A list of child numbers — the guest sends
     that instead of HTML, and the host walks it back to the same button. */
  function pathOf(node, root) {
    var path = [], el = node;
    while (el && el !== root) {
      var parent = el.parentNode;
      if (!parent) { return null; }
      path.unshift(Array.prototype.indexOf.call(parent.children, el));
      el = parent;
    }
    return el === root ? path : null;
  }
  function nodeAt(root, path) {
    var node = root;
    for (var i = 0; i < (path || []).length && node; i++) { node = node.children[path[i]]; }
    return node || null;
  }
  function fields(root) {
    var out = [];
    Array.prototype.forEach.call(root.querySelectorAll('input, select, textarea'), function (field) {
      out.push({
        path: pathOf(field, root),
        value: String(field.value === undefined ? '' : field.value),
        checked: !!field.checked
      });
    });
    return out;
  }
  function cleanCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  }
  function cleanName(value) {
    var name = String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
    return name.slice(0, (P && P.maxName) || 14);
  }

  var ROLE_HOST = 'host', ROLE_GUEST = 'guest';

  var state = {
    role: null,        /* ROLE_HOST | ROLE_GUEST */
    code: '',
    gameId: '',
    gameName: '',
    level: 1,
    seat: 0,
    token: '',
    myName: '',
    otherName: '',
    session: null,
    observer: null,
    snap: null,
    html: null,
    result: '',
    notice: '',
    turn: '',
    sent: 0,
    error: '',
    closedBy: ''
  };
  var snapTimer = null, heartbeat = null, noticeTimer = null, lastArrived = 0;

  /* ------------------------------------------------------------- who am I? */
  function accountName() {
    var acc = window.AwesomeAccounts && window.AwesomeAccounts.current ? window.AwesomeAccounts.current() : null;
    return acc && acc.name ? acc.name : '';
  }
  function defaultName() {
    var fromAccount = accountName();
    if (fromAccount) { return fromAccount; }
    if (P) {
      var list = P.names('two');
      if (list && list[0] && list[0] !== 'Player 1') { return list[0]; }
    }
    return 'Player 1';
  }
  function hub() { return window.GameHub || null; }
  function gameRoot() { return $('gameRoot'); }
  function statusText() { return ($('statusLine') || {}).textContent || ''; }
  function bannerOn() { var b = $('resultBanner'); return !!(b && !b.hidden); }

  /* ---------------------------------------------------------- can we online? */
  function problemFor(game) {
    if (!game) {
      return '🚪 Open a game from the shelf first, then come back and make a game ID.';
    }
    if (game.online === false) {
      return '🙈 ' + (game.onlineWhy || 'This game keeps its secrets on one screen, so online play is switched off for it.');
    }
    var root = gameRoot();
    if (root && root.querySelector('canvas')) {
      return '🏓 This game needs a live picture rather than a board, so it is one-screen only. Try chess, ludo, checkers, snakes & ladders and all the other board games online.';
    }
    return null;
  }

  /* ------------------------------------------------------------ the messages */
  function paintLive() {
    var btn = $('onlineBtn');
    var live = $('onlineLive');
    var stage = $('stage');
    var on = !!state.role;
    if (stage) {
      stage.classList.toggle('gk-online', on);
      stage.classList.toggle('gk-online-host', state.role === ROLE_HOST);
      stage.classList.toggle('gk-online-mirror', state.role === ROLE_GUEST);
    }
    if (btn) { btn.textContent = on ? '🌐 Online game' : '🌐 Play online'; }
    if (!live) { return; }
    if (!on) { live.hidden = true; live.textContent = ''; live.removeAttribute('data-turn'); return; }
    live.hidden = false;
    var bits = ['🌐 Game ID ' + state.code];
    if (state.role === ROLE_HOST) {
      bits.push(state.otherName ? '🎉 ' + state.otherName + ' is in' : 'waiting for your friend to type the ID…');
    } else {
      bits.push('vs ' + (state.otherName || 'the host') + ' · ' + (state.gameName || 'game'));
    }
    if (state.notice) { bits.push(state.notice); }
    else if (state.turn) { bits.push(state.turn); }
    live.textContent = bits.join(' · ');
    live.setAttribute('data-turn', state.turn.indexOf('▶') > -1 ? 'you' : 'them');
  }

  function notice(text) {
    state.notice = text;
    paintLive();
    paintPanel();
    if (noticeTimer) { clearTimeout(noticeTimer); }
    noticeTimer = window.setTimeout(function () { state.notice = ''; paintLive(); paintPanel(); }, 5000);
  }
  function fail(err) {
    state.error = window.GameNet ? window.GameNet.errorText(err) : 'Something went wrong.';
    paintPanel();
    notice(state.error);
    if (window.AwesomeSFX) { window.AwesomeSFX.play('pop'); }
  }

  /* -------------------------------------------------------------- the panel */
  function panel() { return $('onlinePanel'); }

  function openPanel(code) {
    var box = panel();
    if (!box) { return; }
    state.error = '';
    if (code) { state.code = cleanCode(code); }
    box.hidden = false;
    document.documentElement.classList.add('gk-pp-open');
    paintPanel();
    var first = box.querySelector('input');
    if (first && first.focus) { try { first.focus(); } catch (err) { /* fine */ } }
  }
  function closePanel() {
    var box = panel();
    if (box) { box.hidden = true; }
    document.documentElement.classList.remove('gk-pp-open');
  }

  function nameRow() {
    var row = el('label', 'gk-online-row');
    row.appendChild(el('span', 'gk-pp-tag', 'Your name'));
    var input = el('input', 'gk-input gk-online-name');
    input.type = 'text';
    input.maxLength = (P && P.maxName) || 14;
    input.value = state.myName || defaultName();
    input.setAttribute('aria-label', 'Your name for the online game');
    input.addEventListener('input', function () { state.myName = cleanName(input.value); });
    row.appendChild(input);
    return row;
  }

  function messageBox() {
    var box = el('p', 'gk-online-msg' + (state.error ? ' gk-online-bad' : ''));
    box.setAttribute('data-role', 'onlineMsg');
    box.textContent = state.error || state.notice || '';
    return box;
  }

  function idleBody() {
    var box = el('div', 'gk-online-body');
    var current = hub() && hub().current ? hub().current() : null;
    var game = current ? K.byId(current.id) : null;
    var problem = problemFor(game);
    box.appendChild(el('p', 'gk-online-lead', game
      ? 'You are on ' + game.emoji + ' ' + game.name + ' at level ' + current.level +
        '. Make a game ID and read it out to your friend, or type in the ID they made.'
      : 'Open a game from the shelf and then come back — you can play any of the board games online with a game ID.'));
    if (problem) { box.appendChild(el('p', 'gk-online-warn', problem)); }
    box.appendChild(nameRow());

    var make = button('gk-btn gk-btn-main gk-online-create', '🔑 Make me a game ID', function () {
      if (problem) { notice(problem); return; }
      createRoom();
    });
    make.disabled = !!problem;
    var makeRow = el('div', 'gk-online-actions');
    makeRow.appendChild(make);
    makeRow.appendChild(button('gk-btn gk-btn-ghost', '🎯 Pick a game first', function () {
      closePanel();
      var hubSection = $('hub');
      if (hubSection && hubSection.scrollIntoView) { hubSection.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }));
    box.appendChild(makeRow);

    box.appendChild(el('p', 'gk-online-or', '— or —'));
    var joinRow = el('div', 'gk-online-join');
    var input = el('input', 'gk-input gk-online-codeinput');
    input.type = 'text';
    input.maxLength = 4;
    input.placeholder = 'GAME ID';
    input.value = cleanCode(state.code);
    input.setAttribute('aria-label', 'Game ID to join');
    input.setAttribute('inputmode', 'latin');
    input.addEventListener('input', function () { input.value = cleanCode(input.value); state.code = input.value; });
    joinRow.appendChild(input);
    joinRow.appendChild(button('gk-btn gk-btn-main', '➡️ Join with this ID', function () {
      var code = cleanCode(input.value);
      if (code.length < 4) { state.error = 'The game ID has 4 letters and numbers.'; paintPanel(); return; }
      joinRoom(code);
    }));
    box.appendChild(joinRow);
    box.appendChild(messageBox());
    return box;
  }

  function hostBody() {
    var box = el('div', 'gk-online-body');
    box.appendChild(el('p', 'gk-online-lead',
      'Read this game ID out to your friend (or send them the link). They type it in and you both play ' +
      (state.gameName || 'this game') + ' together — you on this screen, they on theirs.'));
    var codeBox = el('div', 'gk-online-codebox');
    codeBox.appendChild(el('span', 'gk-online-code', state.code));
    codeBox.appendChild(el('span', 'gk-online-hint', state.otherName ? '🎉 ' + state.otherName + ' joined!' : '⌛ waiting for your friend…'));
    box.appendChild(codeBox);

    var linkRow = el('div', 'gk-online-link');
    var link = el('input', 'gk-input gk-online-url');
    link.type = 'text';
    link.readOnly = true;
    link.value = inviteLink();
    link.setAttribute('aria-label', 'Invite link');
    link.addEventListener('focus', function () { link.select(); });
    linkRow.appendChild(link);
    linkRow.appendChild(button('gk-btn gk-btn-ghost gk-btn-small', '📋 Copy link', function () {
      copyText(inviteLink());
    }));
    box.appendChild(linkRow);
    box.appendChild(el('p', 'gk-online-note',
      'Turn-taking: the game tells you whose go it is, and taps only count on your own turn.'));
    box.appendChild(messageBox());
    var row = el('div', 'gk-online-actions');
    row.appendChild(button('gk-btn gk-btn-main', '✅ Back to the game', closePanel));
    row.appendChild(button('gk-btn gk-btn-ghost', '🚪 End the online game', function () { leave(true); }));
    box.appendChild(row);
    return box;
  }

  function guestBody() {
    var box = el('div', 'gk-online-body');
    box.appendChild(el('p', 'gk-online-lead',
      'You are playing ' + (state.gameName || 'a game') + ' at level ' + state.level +
      ' with ' + (state.otherName || 'the host') + ' on this game ID. Their board is the real one — everything you tap goes straight to it.'));
    var codeBox = el('div', 'gk-online-codebox');
    codeBox.appendChild(el('span', 'gk-online-code', state.code));
    codeBox.appendChild(el('span', 'gk-online-hint', state.turn || '⌛ getting the board…'));
    box.appendChild(codeBox);
    box.appendChild(messageBox());
    var row = el('div', 'gk-online-actions');
    row.appendChild(button('gk-btn gk-btn-main', '✅ Back to the game', closePanel));
    row.appendChild(button('gk-btn gk-btn-ghost', '🚪 Leave the game', function () { leave(true); }));
    box.appendChild(row);
    return box;
  }

  function paintPanel() {
    var box = panel();
    if (!box || box.hidden) { return; }
    var body = box.querySelector('.gk-online-body');
    if (body && body.parentNode) { body.parentNode.removeChild(body); }
    var next = state.role === ROLE_HOST ? hostBody() : (state.role === ROLE_GUEST ? guestBody() : idleBody());
    var tail = box.querySelector('.gk-online-tail');
    var holder = tail && tail.parentNode ? tail.parentNode : box;
    holder.insertBefore(next, tail || null);
  }

  function inviteLink() {
    try {
      var url = new URL(window.location.href);
      url.search = '?online=' + state.code;
      url.hash = '';
      return url.toString();
    } catch (err) {
      return 'games.html?online=' + state.code;
    }
  }
  function copyText(text) {
    var done = function (ok) {
      notice(ok ? '📋 Link copied — send it to your friend!' : '📋 Copy this link: ' + text);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
        return;
      }
    } catch (err) { /* fall through */ }
    done(false);
  }

  /* --------------------------------------------------------------- hosting */
  function createRoom() {
    var current = hub() && hub().current ? hub().current() : null;
    if (!current) { notice('Open a game from the shelf first!'); return; }
    var name = cleanName(state.myName) || defaultName();
    state.myName = name;
    var game = K.byId(current.id);
    var problem = problemFor(game);
    if (problem) { notice(problem); return; }
    /* The board should say the name the kid just typed, so this is what the
       games use for player 1 from now on (the sign-in name itself is left
       alone — that one belongs to the trophy shelf). */
    if (P && P.names('two')[0] !== name) { P.set('p1', { name: name }); }

    window.GameNet.create({ game: current.id, level: current.level, name: name }).then(function (res) {
      state.role = ROLE_HOST;
      state.code = res.code;
      state.seat = res.seat;
      state.token = res.token;
      state.gameId = current.id;
      state.gameName = game ? game.name : current.id;
      state.level = res.level || current.level;
      state.otherName = '';
      state.error = '';
      state.turn = '';
      if (P) { P.setOnlinePeer(null); }
      startSession();
      if (hub()) { hub().open(current.id, 'two', state.level, { host: true }); }
      paintLive();
      paintPanel();
      if (window.AwesomeSFX) { window.AwesomeSFX.play('win'); }
      notice('🔑 Game ID ' + state.code + ' — read it out to your friend!');
    }, fail);
  }

  function hostRestart() {
    if (!hub() || state.role !== ROLE_HOST) { return; }
    hub().open(state.gameId, 'two', state.level, { host: true });
  }

  function startSession() {
    stopSession();
    state.session = window.GameNet.session({
      code: state.code, seat: state.seat, token: state.token, role: state.role
    }, {
      onSnap: function (snap) {
        /* The host keeps the last board in hand; the guest draws it. */
        if (state.role === ROLE_GUEST) { onGuestSnapshot(snap); } else { state.snap = snap; }
      },
      onEvent: function (ev) { onEvent(ev); },
      onPeer: function (peer) { onPeer(peer); },
      onClosed: function () { hostGone(); },
      onState: function () { paintLive(); },
      onError: function (err) { fail(err); }
    });
    state.session.start();
    lastArrived = Date.now();
  }
  function stopSession() {
    if (state.session) { state.session.stop(); state.session = null; }
    if (state.observer) { state.observer.disconnect(); state.observer = null; }
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    if (snapTimer) { clearTimeout(snapTimer); snapTimer = null; }
  }

  /* --------------------------------------------------- the host's broadcast */
  function attachHost() {
    if (state.role !== ROLE_HOST) { return; }
    var root = gameRoot();
    if (!root) { return; }
    if (state.observer) { state.observer.disconnect(); }
    var changed = function () { queueSnapshot(90); };
    state.observer = new MutationObserver(changed);
    ['gameRoot', 'statusLine', 'resultBanner', 'resultText'].forEach(function (id) {
      var node = $(id);
      if (node) {
        state.observer.observe(node, {
          childList: true, subtree: true, characterData: true,
          attributes: true, attributeFilter: ['class', 'hidden', 'disabled', 'value']
        });
      }
    });
    if (heartbeat) { clearInterval(heartbeat); }
    heartbeat = setInterval(function () {
      if (state.role === ROLE_HOST && state.session) { queueSnapshot(0); }
    }, 4000);
    queueSnapshot(0);
  }

  function queueSnapshot(ms) {
    if (snapTimer) { return; }
    snapTimer = later(function () { snapTimer = null; sendSnapshot(); }, ms);
  }

  function readBoard() {
    var root = gameRoot();
    if (!root) { return null; }
    return {
      html: root.innerHTML,
      status: statusText(),
      result: bannerOn() ? (($('resultText') || {}).textContent || '') : '',
      inputs: fields(root),
      level: state.level
    };
  }

  function sendSnapshot() {
    if (state.role !== ROLE_HOST || !state.session) { return; }
    var snap = readBoard();
    if (!snap) { return; }
    state.snap = snap;
    state.session.pushSnapshot(snap);
  }

  /* Is it the guest's go? The games all name the player whose turn it is in
     the status line, so we can tell from that — if it only names the host,
     the guest may not tap. */
  function guestMayTap() {
    if (bannerOn()) { return false; }
    var status = statusText();
    var mine = state.myName, theirs = state.otherName;
    var hasMine = mine && status.indexOf(mine) > -1;
    var hasTheirs = theirs && status.indexOf(theirs) > -1;
    if (hasMine && !hasTheirs) { return false; }
    return true;
  }

  function onEvent(ev) {
    if (!ev || typeof ev !== 'object') { return; }
    if (state.role !== ROLE_HOST) { guestEvent(ev); return; }
    if (ev.type === 'join') {
      state.otherName = cleanName(ev.name) || 'Player 2';
      if (P) { P.setOnlinePeer(state.otherName); }
      notice('🎉 ' + state.otherName + ' joined — starting a fresh game!');
      hostRestart();
      return;
    }
    if (ev.type === 'bye') {
      var left = state.otherName;
      state.otherName = '';
      if (P) { P.setOnlinePeer(null); }
      notice('👋 ' + (left || 'Your friend') + ' left the game.');
      paintLive();
      return;
    }
    if (ev.type === 'click') {
      if (!guestMayTap()) {
        if (state.session) { state.session.send([{ type: 'notice', text: '⏳ It is ' + state.myName + '’s turn!' }]); }
        return;
      }
      var node = nodeAt(gameRoot(), ev.path);
      if (node && typeof node.click === 'function') {
        node.click();
        queueSnapshot(50);
      }
      return;
    }
    if (ev.type === 'input') {
      var field = nodeAt(gameRoot(), ev.path);
      if (field && field.tagName !== 'BUTTON') {
        var tag = field.tagName;
        if (tag === 'INPUT') { field.value = String(ev.value === undefined ? '' : ev.value); }
        if (ev.checked !== undefined && 'checked' in field) { field.checked = !!ev.checked; }
        field.dispatchEvent(new Event(tag === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        queueSnapshot(60);
      }
      return;
    }
    if (ev.type === 'key') {
      var target = gameRoot();
      if (target) {
        target.dispatchEvent(new KeyboardEvent('keydown', {
          key: ev.key, code: ev.code, bubbles: true, cancelable: true
        }));
        queueSnapshot(60);
      }
    }
  }

  /* Messages the host sends straight to the guest's screen. */
  function guestEvent(ev) {
    if (ev.type === 'notice') { notice(ev.text || '⌛ Hold on a moment…'); return; }
    if (ev.type === 'bye') { hostGone(); }
  }

  function onPeer(peer) {
    if (state.role !== ROLE_HOST) {
      if (peer && peer.name && peer.name !== state.otherName) {
        state.otherName = cleanName(peer.name) || state.otherName;
        paintLive();
        paintPanel();
      }
      return;
    }
    if (!peer || !peer.name) {
      if (state.otherName && !peer) {
        state.otherName = '';
        if (P) { P.setOnlinePeer(null); }
        paintLive();
      } else if (peer && !peer.online) {
        state.turn = '⌛ ' + (state.otherName || 'Your friend') + ' went quiet…';
        paintLive();
      }
      return;
    }
    if (peer.name !== state.otherName) {
      state.otherName = cleanName(peer.name);
      if (P) { P.setOnlinePeer(state.otherName); }
      paintLive();
      paintPanel();
    }
  }

  function hostGone() {
    state.closedBy = 'host';
    stopSession();
    state.role = null;
    state.notice = '';
    paintLive();
    paintPanel();
    notice('👋 The host closed the game. Pick a game and start your own!');
  }

  /* ------------------------------------------------- the guest's mirror */
  function onGuestSnapshot(snap) {
    if (state.role !== ROLE_GUEST || !snap) { return; }
    state.snap = snap;
    if (typeof snap.level === 'number' && snap.level && snap.level !== state.level) { state.level = snap.level; }
    var root = gameRoot();
    if (root && typeof snap.html === 'string' && snap.html !== state.html) {
      state.html = snap.html;
      root.innerHTML = snap.html;
    }
    (snap.inputs || []).forEach(function (rec) {
      var field = nodeAt(root, rec.path);
      if (!field || field === document.activeElement) { return; }
      if ('value' in field && String(field.value) !== rec.value) { field.value = rec.value; }
      if ('checked' in field && rec.checked !== undefined) { field.checked = rec.checked; }
    });
    var status = $('statusLine');
    if (status && status.textContent !== snap.status) { status.textContent = snap.status || ''; }
    paintTurn(snap.status || '');
    if (snap.result && snap.result !== state.result) {
      state.result = snap.result;
      var text = $('resultText');
      var banner = $('resultBanner');
      if (text) { text.textContent = snap.result; }
      if (banner) { banner.hidden = false; }
      if (window.AwesomeSFX) { window.AwesomeSFX.play('win'); }
      if (hub() && hub().remoteFinish) { hub().remoteFinish(snap.result); }
    }
  }

  function paintTurn(status) {
    var mine = state.myName, theirs = state.otherName;
    var hasMine = mine && status.indexOf(mine) > -1;
    var hasTheirs = theirs && status.indexOf(theirs) > -1;
    var was = state.turn;
    if (bannerOn() || state.result) { state.turn = '🏁 the game is finished'; }
    else if (hasMine && !hasTheirs) { state.turn = '▶ your turn!'; }
    else if (hasTheirs && !hasMine) { state.turn = '⌛ waiting for ' + theirs; }
    else { state.turn = '👀 watch the board'; }
    if (state.turn !== was) { paintLive(); }
  }

  function guestClick(event) {
    if (state.role !== ROLE_GUEST || !state.session) { return; }
    var root = gameRoot();
    var target = event.target;
    if (!root || !target || !root.contains(target)) { return; }
    var tag = target.tagName;
    /* Tapping a box to type in it is not a move — let the guest type. */
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { return; }
    event.preventDefault();
    event.stopPropagation();
    var path = pathOf(target, root);
    if (path) { state.session.send([{ type: 'click', path: path }]); }
  }
  function guestValue(event) {
    if (state.role !== ROLE_GUEST || !state.session) { return; }
    var root = gameRoot();
    var field = event.target;
    if (!root || !field || !root.contains(field)) { return; }
    state.session.send([{
      type: 'input',
      path: pathOf(field, root),
      value: String(field.value === undefined ? '' : field.value),
      checked: !!field.checked
    }]);
  }
  function guestKey(event) {
    if (state.role !== ROLE_GUEST || !state.session) { return; }
    var tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { return; }
    state.session.send([{ type: 'key', key: event.key, code: event.code }]);
  }

  /* The guest draws whatever the host last sent — and is not allowed to poke
     the page while a mirror is on. */
  function mountMirror() {
    state.html = null;
    if (state.snap) { onGuestSnapshot(state.snap); }
    paintLive();
    paintTurn(statusText());
  }

  /* --------------------------------------------------------------- joining */
  function joinRoom(code) {
    var name = cleanName(state.myName) || defaultName();
    state.myName = name;
    window.GameNet.join({ code: code, name: name }).then(function (res) {
      state.role = ROLE_GUEST;
      state.code = code;
      state.seat = res.seat;
      state.token = res.token;
      state.gameId = res.game;
      state.level = res.level || 1;
      var game = K.byId(res.game);
      state.gameName = game ? game.name : res.game;
      state.otherName = cleanName(res.host) || 'the host';
      state.error = '';
      state.html = null;
      if (P) { P.setOnlinePeer(state.otherName); }
      startSession();
      if (res.snap) { onGuestSnapshot(res.snap); }
      if (hub() && game) { hub().open(res.game, 'two', state.level, { mirror: true }); }
      else if (hub()) { notice('😵 The host is playing a game this page does not know.'); }
      paintLive();
      paintPanel();
      notice('🌐 You are in — you are playing ' + state.gameName + ' with ' + state.otherName + '.');
    }, fail);
  }

  /* ---------------------------------------------------------------- leaving */
  function leave(quiet) {
    if (state.session) { state.session.leave(); }
    stopSession();
    var was = state.role;
    state.role = null;
    state.code = '';
    state.gameId = '';
    state.gameName = '';
    state.otherName = '';
    state.html = null;
    state.snap = null;
    state.result = '';
    state.turn = '';
    if (P) { P.setOnlinePeer(null); }
    paintLive();
    if (!quiet) { paintPanel(); return; }
    closePanel();
    if (was === 'guest' && hub()) { hub().back(); }
    notice('👋 You left the online game.');
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    state.myName = defaultName();
    var onlineBtn = $('onlineBtn');
    if (onlineBtn) { onlineBtn.addEventListener('click', function () { openPanel(''); }); }
    var heroBtn = $('onlineHeroBtn');
    if (heroBtn) { heroBtn.addEventListener('click', function () { openPanel(''); }); }
    var closeBtn = $('onlineClose');
    if (closeBtn) { closeBtn.addEventListener('click', closePanel); }
    var box = panel();
    if (box) {
      box.addEventListener('click', function (e) { if (e.target === box) { closePanel(); } });
    }
    var root = gameRoot();
    if (root) {
      root.addEventListener('click', guestClick, true);
      root.addEventListener('input', guestValue, true);
      root.addEventListener('change', guestValue, true);
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closePanel(); return; }
      guestKey(e);
    });
    var backBtn = $('backBtn');
    if (backBtn) { backBtn.addEventListener('click', function () { if (state.role) { leave(true); } }); }
    window.addEventListener('beforeunload', function () { if (state.session) { state.session.beacon(); } });

    var params = null;
    try { params = new URL(window.location.href).searchParams; } catch (err) { params = null; }
    var wanted = params && params.get('online');
    if (wanted) { openPanel(wanted === '1' ? '' : wanted); }
  }

  window.GameOnline = {
    attachHost: attachHost,
    mountMirror: mountMirror,
    paint: paintLive,
    open: openPanel,
    close: closePanel,
    leave: leave,
    create: createRoom,
    join: joinRoom,
    state: function () {
      return {
        role: state.role, code: state.code, gameId: state.gameId, gameName: state.gameName,
        level: state.level, myName: state.myName, otherName: state.otherName,
        turn: state.turn, notice: state.notice, error: state.error, rev: state.session ? state.session.rev : 0
      };
    },
    problemFor: problemFor
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
