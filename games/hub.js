/* The Games Room controller: draws the cards, opens a game and
   hands it the shared api (status line, result banner, restart, cleanup). */
(function () {
  'use strict';

  var K = window.GameKit;
  var h = K.h;

  var hubSection = document.getElementById('hub');
  var stageSection = document.getElementById('stage');
  var cardsEl = document.getElementById('cards');
  var filtersEl = document.getElementById('filters');
  var stageTitle = document.getElementById('stageTitle');
  var stageEmoji = document.getElementById('stageEmoji');
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

  var current = null, currentMode = 'cpu', cleanups = [], filter = 'all';

  function badge(text, cls) { return h('span', { class: 'gk-chip ' + (cls || '') }, text); }

  function renderCards() {
    while (cardsEl.children.length) { cardsEl.removeChild(cardsEl.children[0]); }
    var shown = 0;
    K.GAMES.forEach(function (game) {
      if (filter !== 'all' && game.tag !== filter) { return; }
      shown++;
      var card = h('article', { class: 'game-card', 'data-id': game.id }, [
        h('div', { class: 'game-card-top' }, [
          h('span', { class: 'game-emoji', text: game.emoji }),
          h('div', {}, [
            h('h3', { text: game.name }),
            h('span', { class: 'game-tag', text: game.tag })
          ])
        ]),
        h('p', { class: 'game-blurb', text: game.blurb }),
        h('div', { class: 'game-actions' }, [
          h('button', {
            class: 'gk-btn gk-btn-main gk-btn-small', type: 'button',
            onclick: function () { open(game.id, 'cpu'); }
          }, '🤖 vs Computer'),
          h('button', {
            class: 'gk-btn gk-btn-ghost gk-btn-small', type: 'button',
            onclick: function () { open(game.id, 'two'); }
          }, '👥 2 Players')
        ])
      ]);
      cardsEl.appendChild(card);
    });
    if (countEl) { countEl.textContent = String(shown); }
    if (heroCountEl) { heroCountEl.textContent = String(K.GAMES.length); }
    if (!shown) { cardsEl.appendChild(h('p', { class: 'gk-hint', text: 'No games in this group yet.' })); }
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

  function makeApi(game, mode) {
    return {
      mode: mode,
      names: mode === 'cpu' ? ['You', '🤖 Computer'] : ['Player 1', 'Player 2'],
      cpuIndex: mode === 'cpu' ? 1 : -1,
      setStatus: function (text) { statusLine.textContent = text; },
      finish: function (text) {
        resultText.textContent = text;
        resultBanner.hidden = false;
        K.confetti(90);
      },
      confetti: function (n) { K.confetti(n); },
      restart: function () { open(game.id, mode); },
      onDestroy: function (fn) { cleanups.push(fn); }
    };
  }

  function open(id, mode) {
    var game = K.byId(id);
    if (!game) { return; }
    teardown();
    current = game;
    currentMode = mode;
    stageEmoji.textContent = game.emoji;
    stageTitle.textContent = game.name;
    rulesText.textContent = game.howTo || '';
    statusLine.textContent = '';
    resultBanner.hidden = true;
    resultText.textContent = '';
    setModeButtons(mode);
    if (hubSection) { hubSection.hidden = true; }
    if (stageSection) { stageSection.hidden = false; }
    try {
      var handle = game.mount(gameRoot, makeApi(game, mode));
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
    if (window.scrollTo) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  if (filtersEl) {
    Array.prototype.forEach.call(filtersEl.children, function (btn) {
      btn.addEventListener('click', function () {
        filter = btn.getAttribute('data-filter');
        Array.prototype.forEach.call(filtersEl.children, function (other) {
          other.className = 'gk-filter' + (other === btn ? ' gk-filter-on' : '');
        });
        renderCards();
      });
    });
  }
  if (restartBtn) { restartBtn.addEventListener('click', function () { if (current) { open(current.id, currentMode); } }); }
  if (backBtn) { backBtn.addEventListener('click', back); }
  if (resultBanner) {
    var againBtn = document.getElementById('againBtn');
    if (againBtn) { againBtn.addEventListener('click', function () { if (current) { open(current.id, currentMode); } }); }
    var toListBtn = document.getElementById('toListBtn');
    if (toListBtn) { toListBtn.addEventListener('click', back); }
  }
  if (modeSwitch) {
    Array.prototype.forEach.call(modeSwitch.children, function (btn) {
      btn.addEventListener('click', function () {
        if (!current) { return; }
        open(current.id, btn.getAttribute('data-mode'));
      });
    });
  }

  renderCards();
})();
