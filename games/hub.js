/* The Games Room controller: draws the cards, opens a game and
   hands it the shared api (status line, result banner, restart, cleanup).
   Player names, faces and colours come from games/players.js; levels, stars
   and trophies come from the account module, so every one of the 22 games
   talks to the real people sitting there — at the level they have earned. */
(function () {
  'use strict';

  var K = window.GameKit;
  var h = K.h;
  var P = window.GamePlayers;
  var PROG = window.AwesomeProgress;

  var hubSection = document.getElementById('hub');
  var stageSection = document.getElementById('stage');
  var cardsEl = document.getElementById('cards');
  var filtersEl = document.getElementById('filters');
  var stageTitle = document.getElementById('stageTitle');
  var stageEmoji = document.getElementById('stageEmoji');
  var stageWho = document.getElementById('stageWho');
  var statusLine = document.getElementById('statusLine');
  var gameRoot = document.getElementById('gameRoot');
  var resultBanner = document.getElementById('resultBanner');
  var resultText = document.getElementById('resultText');
  var rulesText = document.getElementById('rulesText');
  var restartBtn = document.getElementById('restartBtn');
  var backBtn = document.getElementById('backBtn');
  var modeSwitch = document.getElementById('modeSwitch');
  var countEl = document.getElementById('gameCount');
  var heroCountEl = document.getElementById('heroCount');
  var trophyGrid = document.getElementById('trophyGrid');
  var trophyLine = document.getElementById('trophyLine');
  var levelStrip = null;

  var current = null, currentMode = 'cpu', currentLevel = 1, cleanups = [], filter = 'all';

  /* A colour for every game, so the shelf looks like a box of sweets and each
     game's own screen picks up its colour. */
  var TONES = {
    chess: '#4f5bd5', ludo: '#e63946', checkers: '#96633a', reversi: '#2f9e63',
    snakesLadders: '#7ab800', mancala: '#f4801a', hex: '#12a5a5', morris: '#4b5563',
    battleship: '#2f7fd1', pong: '#4f5bd5', ticTacToe: '#e63946', connectFour: '#e8578f',
    dotsBoxes: '#8b5cf6', nim: '#7ab800', rps: '#d63aa8', memory: '#f4801a',
    simon: '#4f5bd5', hangman: '#2f9e63', guessNumber: '#12a5a5', reaction: '#e8a300',
    mastermind: '#8b5cf6', wordScramble: '#e8578f'
  };

  function hash(id) {
    var n = 0;
    for (var i = 0; i < id.length; i++) { n = (n * 31 + id.charCodeAt(i)) % 1000003; }
    return n;
  }
  function accentFor(game) {
    if (TONES[game.id]) { return TONES[game.id]; }
    var palette = (P && P.palette) || ['#e63946', '#2f7fd1', '#2f9e63', '#8b5cf6'];
    return palette[hash(game.id) % palette.length];
  }
  function paintAccent(el, game) {
    if (!el || !el.style || !P || !P.ramp) { return; }
    var r = P.ramp(accentFor(game));
    el.style.setProperty('--accent', r.base);
    el.style.setProperty('--accent-soft', r.soft);
    el.style.setProperty('--accent-mid', r.mid);
    el.style.setProperty('--accent-tint', r.tint);
    el.style.setProperty('--accent-deep', r.deep);
    el.style.setProperty('--accent-glow', r.glow);
  }

  function playerNames(mode) {
    if (P) { return P.names(mode); }
    return mode === 'cpu' ? ['You', 'Computer'] : ['Player 1', 'Player 2'];
  }
  function twoPlayerLabel() {
    var n = playerNames('two');
    return '👥 ' + n[0] + ' & ' + n[1];
  }
  function computerLabel() {
    var n = playerNames('cpu');
    return '🤖 vs ' + n[1];
  }

  /* ------------------------------------------------------------- progress */
  function totalLevels(game) { return K.levelCount(game); }
  function bestOf(id) { return PROG ? PROG.best(id) : 1; }
  function chosenOf(id) { return PROG ? PROG.level(id) : 1; }
  function clearedOf(game, lv) { return PROG ? PROG.cleared(game.id, lv) : false; }

  function renderCards() {
    while (cardsEl.children.length) { cardsEl.removeChild(cardsEl.children[0]); }
    var shown = 0;
    K.GAMES.forEach(function (game) {
      if (filter !== 'all' && game.tag !== filter) { return; }
      shown++;
      var total = totalLevels(game);
      var best = bestOf(game.id);
      var played = PROG && PROG.plays(game.id) > 0;
      var card = h('article', { class: 'game-card', 'data-id': game.id }, [
        h('div', { class: 'game-card-top' }, [
          h('span', { class: 'game-emoji', text: game.emoji }),
          h('div', {}, [
            h('h3', { text: game.name }),
            h('span', { class: 'game-tag', text: game.tag })
          ]),
          h('span', { class: 'gk-card-level', text: played ? 'Lv ' + best + '/' + total : total + ' levels' })
        ]),
        h('p', { class: 'game-blurb', text: game.blurb }),
        h('div', { class: 'gk-card-stars', 'aria-label': 'Stars earned' }, [
          h('span', { class: 'gk-star' + (played ? ' gk-star-on' : ''), text: '⭐' }),
          h('span', { class: 'gk-star' + (played && best > 2 ? ' gk-star-on' : ''), text: '⭐' }),
          h('span', { class: 'gk-star' + (played && best > total - 1 ? ' gk-star-on' : ''), text: '⭐' })
        ]),
        h('div', { class: 'game-actions' }, [
          h('button', {
            class: 'gk-btn gk-btn-main gk-btn-small', type: 'button', 'data-role': 'cpu',
            title: 'Play ' + game.name + ' level ' + best + ' against the computer',
            onclick: function () { open(game.id, 'cpu'); }
          }, computerLabel()),
          h('button', {
            class: 'gk-btn gk-btn-ghost gk-btn-small', type: 'button', 'data-role': 'two',
            title: 'Play ' + game.name + ' with two players on this screen',
            onclick: function () { open(game.id, 'two'); }
          }, twoPlayerLabel())
        ])
      ]);
      paintAccent(card, game);
      cardsEl.appendChild(card);
    });
    if (countEl) { countEl.textContent = String(shown); }
    if (heroCountEl) { heroCountEl.textContent = String(K.GAMES.length); }
    if (!shown) { cardsEl.appendChild(h('p', { class: 'gk-hint', text: 'No games in this group yet.' })); }
  }

  /* Names changed in the panel: relabel the buttons without rebuilding the shelf. */
  function refreshLabels() {
    Array.prototype.forEach.call(cardsEl.querySelectorAll('.game-card'), function (card) {
      var cpuBtn = card.querySelector('[data-role="cpu"]');
      var twoBtn = card.querySelector('[data-role="two"]');
      if (cpuBtn) { cpuBtn.textContent = computerLabel(); }
      if (twoBtn) { twoBtn.textContent = twoPlayerLabel(); }
    });
    paintStageWho();
  }

  function paintStageWho() {
    if (!stageWho || !P || !P.bar) { return; }
    stageWho.innerHTML = '';
    stageWho.appendChild(P.bar(currentMode));
  }

  /* --------------------------------------------------------- the level strip */
  function buildStrip() {
    if (levelStrip || !stageSection) { return; }
    levelStrip = h('div', { class: 'gk-levels', id: 'levelStrip' });
    var anchor = statusLine && statusLine.parentNode === stageSection ? statusLine : null;
    if (anchor) { stageSection.insertBefore(levelStrip, anchor); }
    else { stageSection.appendChild(levelStrip); }
  }

  function paintLevels() {
    if (!current) { return; }
    buildStrip();
    var total = totalLevels(current);
    var best = bestOf(current.id);
    levelStrip.innerHTML = '';
    levelStrip.appendChild(h('span', { class: 'gk-level-tag', text: 'Level' }));
    var row = h('div', { class: 'gk-level-row', role: 'group', 'aria-label': 'Choose a level' });
    for (var lv = 1; lv <= total; lv++) {
      (function (n) {
        var unlocked = n <= best;
        var done = clearedOf(current, n);
        var btn = h('button', {
          class: 'gk-level-btn' + (n === currentLevel ? ' gk-level-on' : '') +
            (done ? ' gk-level-done' : '') + (unlocked ? '' : ' gk-level-locked'),
          type: 'button', 'data-level': n,
          title: unlocked
            ? K.levelName(current, n) + (done ? ' — beaten ⭐' : '')
            : 'Win level ' + (n - 1) + ' to unlock this one',
          disabled: unlocked ? null : 'disabled',
          onclick: function () { pickLevel(n); }
        }, (unlocked ? (done ? '✅ ' : '') : '🔒 ') + n);
        row.appendChild(btn);
      })(lv);
    }
    levelStrip.appendChild(row);
    levelStrip.appendChild(h('span', {
      class: 'gk-level-name',
      text: K.levelName(current, currentLevel) + ' · ' + (best < total ? 'win to unlock level ' + (best + 1) : 'top level!')
    }));
    var hint = K.levelHint(current, currentLevel);
    if (hint) { levelStrip.appendChild(h('span', { class: 'gk-level-hint', text: hint })); }
  }

  function pickLevel(n) {
    if (!current) { return; }
    if (PROG) { PROG.setLevel(current.id, n); }
    open(current.id, currentMode, n);
  }

  /* -------------------------------------------------------------- trophies */
  function paintTrophies() {
    if (!trophyGrid) { return; }
    var s = PROG ? PROG.summary() : { played: 0, wins: 0, stars: 0, levels: 0, games: 0 };
    if (trophyLine) {
      trophyLine.textContent = PROG && !window.AwesomeAccounts.isGuest()
        ? 'Saved for ' + window.AwesomeAccounts.current().name
        : 'Sign in to keep your trophies';
    }
    trophyGrid.innerHTML = '';
    var played = K.GAMES.filter(function (g) { return PROG && PROG.plays(g.id) > 0; })
      .sort(function (a, b) { return (PROG.best(b.id) - PROG.best(a.id)) || (PROG.wins(b.id) - PROG.wins(a.id)); });
    var summary = h('div', { class: 'gk-trophy-sum' }, [
      h('span', { class: 'gk-trophy-stat' }, [h('strong', { text: String(s.wins) }), h('small', { text: 'wins' })]),
      h('span', { class: 'gk-trophy-stat' }, [h('strong', { text: String(s.levels) }), h('small', { text: 'levels unlocked' })]),
      h('span', { class: 'gk-trophy-stat' }, [h('strong', { text: String(s.stars) }), h('small', { text: 'stars' })]),
      h('span', { class: 'gk-trophy-stat' }, [h('strong', { text: String(s.played) }), h('small', { text: 'games played' })])
    ]);
    trophyGrid.appendChild(summary);
    if (!played.length) {
      trophyGrid.appendChild(h('p', { class: 'gk-hint', text: 'Play any game and your trophies will appear here. 🏆' }));
      return;
    }
    var list = h('div', { class: 'gk-trophy-list' });
    played.forEach(function (game) {
      var total = totalLevels(game);
      var best = bestOf(game.id);
      var stars = best >= total ? 3 : (best >= 3 ? 2 : 1);
      var row = h('button', {
        class: 'gk-trophy', type: 'button', 'data-id': game.id,
        onclick: function () { open(game.id, 'cpu'); }
      }, [
        h('span', { class: 'gk-trophy-emoji', text: game.emoji }),
        h('span', { class: 'gk-trophy-name', text: game.name }),
        h('span', { class: 'gk-trophy-level', text: 'Lv ' + best + '/' + total }),
        h('span', { class: 'gk-trophy-stars', text: '⭐'.repeat(stars) }),
        h('span', { class: 'gk-trophy-wins', text: PROG.wins(game.id) + '🏆' })
      ]);
      paintAccent(row, game);
      list.appendChild(row);
    });
    trophyGrid.appendChild(list);
  }

  function setModeButtons(mode) {
    Array.prototype.forEach.call(modeSwitch.children, function (btn) {
      var on = btn.getAttribute('data-mode') === mode;
      btn.className = 'gk-mode-btn' + (on ? ' gk-mode-on' : '');
      if (on) { btn.setAttribute('aria-pressed', 'true'); } else { btn.setAttribute('aria-pressed', 'false'); }
    });
  }

  function teardown() {
    cleanups.forEach(function (fn) { try { fn(); } catch (err) { /* keep going */ } });
    cleanups = [];
    while (gameRoot.children.length) { gameRoot.removeChild(gameRoot.children[0]); }
  }

  function makeApi(game, mode, level, p, total) {
    return {
      mode: mode,
      names: playerNames(mode),
      faces: P ? P.faces(mode) : ['🧒', '👦'],
      cpuIndex: mode === 'cpu' ? 1 : -1,
      accent: accentFor(game),
      level: level,
      levels: total,
      p: p,
      setStatus: function (text) { statusLine.textContent = text; },
      finish: function (text) { endGame(text); },
      confetti: function (n) { K.confetti(n); },
      restart: function () { open(game.id, mode, level); },
      onDestroy: function (fn) { cleanups.push(fn); }
    };
  }

  /* Did the person at the keyboard win? (Two-player tables count together.) */
  function didWin(text, mode, names) {
    if (text.indexOf('🤝') > -1 && text.indexOf('🏆') < 0) { return false; }
    if (mode !== 'cpu') { return true; }
    if (names[1] && text.indexOf(names[1]) > -1) { return false; }
    return true;
  }

  function endGame(text) {
    resultText.textContent = text;
    resultBanner.hidden = false;
    K.confetti(90);
    var nextBtn = document.getElementById('nextLevelBtn');
    if (nextBtn && nextBtn.parentNode) { nextBtn.parentNode.removeChild(nextBtn); }
    if (!current) { return; }
    var total = totalLevels(current);
    var won = didWin(text, currentMode, playerNames(currentMode));
    var out = PROG ? PROG.record(current.id, currentLevel, total, won) : null;
    if (out && out.unlocked) {
      var n = out.next;
      var again = document.getElementById('againBtn');
      var btn = h('button', {
        class: 'gk-btn gk-btn-main gk-next', type: 'button', id: 'nextLevelBtn',
        'data-level': n,
        onclick: function () { open(current.id, currentMode, n); }
      }, '🎉 Level ' + n + ' unlocked — play it ▶');
      if (again && again.parentNode) { again.parentNode.insertBefore(btn, again.nextSibling); }
      else if (resultBanner) { resultBanner.appendChild(btn); }
      if (window.AwesomeSFX) { window.AwesomeSFX.play('win'); }
    }
    paintLevels();
    paintTrophies();
    renderCards();
  }

  function open(id, mode, level) {
    var game = K.byId(id);
    if (!game) { return; }
    teardown();
    current = game;
    currentMode = mode;
    var total = totalLevels(game);
    var wanted = level || chosenOf(id) || 1;
    currentLevel = Math.max(1, Math.min(total, wanted));
    stageEmoji.textContent = game.emoji;
    stageTitle.textContent = game.name;
    rulesText.textContent = game.howTo || '';
    statusLine.textContent = '';
    resultBanner.hidden = true;
    resultText.textContent = '';
    setModeButtons(mode);
    if (P) { P.applyTo(stageSection, mode); }
    paintAccent(stageSection, game);
    paintStageWho();
    paintLevels();
    if (PROG) { PROG.visit(game.id, currentLevel); }
    if (hubSection) { hubSection.hidden = true; }
    if (stageSection) { stageSection.hidden = false; }
    var p = K.profile(currentLevel, total);
    try {
      var handle = game.mount(gameRoot, makeApi(game, mode, currentLevel, p, total));
      if (handle && typeof handle.destroy === 'function') { cleanups.push(handle.destroy); }
    } catch (err) {
      statusLine.textContent = '😵 That game would not start: ' + (err && err.message ? err.message : err);
    }
    if (window.scrollTo) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  function back() {
    teardown();
    current = null;
    if (stageSection) { stageSection.hidden = true; }
    if (hubSection) { hubSection.hidden = false; }
    renderCards();
    paintTrophies();
    if (window.scrollTo) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  function restartCurrent() { if (current) { open(current.id, currentMode, currentLevel); } }

  function randomGame() {
    var pool = K.GAMES.slice();
    K.shuffle(pool);
    var pick = pool[0];
    if (currentMode === 'two' && Math.random() < 0.5) { open(pick.id, 'two'); return; }
    open(pick.id, 'cpu');
  }

  if (filtersEl) {
    Array.prototype.forEach.call(filtersEl.children, function (btn) {
      if (!btn.getAttribute('data-filter')) { return; }
      btn.addEventListener('click', function () {
        filter = btn.getAttribute('data-filter');
        Array.prototype.forEach.call(filtersEl.children, function (other) {
          if (!other.getAttribute('data-filter')) { return; }
          other.className = 'gk-filter' + (other === btn ? ' gk-filter-on' : '');
        });
        renderCards();
      });
    });
  }
  if (restartBtn) { restartBtn.addEventListener('click', restartCurrent); }
  if (backBtn) { backBtn.addEventListener('click', back); }
  var randomBtn = document.getElementById('randomBtn');
  if (randomBtn) { randomBtn.addEventListener('click', randomGame); }
  var randomHero = document.getElementById('randomBtnHero');
  if (randomHero) { randomHero.addEventListener('click', randomGame); }
  var signInHero = document.getElementById('signInHero');
  function paintAccount() {
    if (!signInHero) { return; }
    var me = window.AwesomeAccounts ? window.AwesomeAccounts.current() : null;
    signInHero.textContent = me ? '👤 ' + me.name + '’s trophies (level up!)' : '👤 Sign in & keep my trophies';
  }
  if (signInHero && window.AwesomeAccounts) {
    signInHero.addEventListener('click', function () { window.AwesomeAccounts.open(); });
  }
  var trophyBtn = document.getElementById('trophyBtn');
  if (trophyBtn) {
    trophyBtn.addEventListener('click', function () {
      var panel = document.getElementById('trophies');
      if (panel && panel.scrollIntoView) { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  }
  if (resultBanner) {
    var againBtn = document.getElementById('againBtn');
    if (againBtn) { againBtn.addEventListener('click', restartCurrent); }
    var toListBtn = document.getElementById('toListBtn');
    if (toListBtn) { toListBtn.addEventListener('click', back); }
  }
  if (modeSwitch) {
    Array.prototype.forEach.call(modeSwitch.children, function (btn) {
      btn.addEventListener('click', function () {
        if (!current) { return; }
        open(current.id, btn.getAttribute('data-mode'), currentLevel);
      });
    });
  }

  if (P) {
    /* Live relabelling while the panel is open, and a fresh game (with the new
       names in every message) once the players are happy. */
    P.onChange(refreshLabels);
    document.addEventListener('awesome:players-done', restartCurrent);
  }
  if (PROG) {
    /* A player signed in or out: their own shelf and trophies come back. */
    window.AwesomeAccounts.onChange(function () {
      renderCards();
      paintTrophies();
      paintAccount();
      if (current) { open(current.id, currentMode, 1); }
    });
  }

  renderCards();
  paintTrophies();
  paintAccount();
})();
