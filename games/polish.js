/* Game-feel layer for the Awesome Games Room.
   Instead of rewriting all 22 games, this watches the game board with a
   MutationObserver and reacts to what the games draw: pieces pop in, captures
   shake, dice tumble, matched cards flip, scores pulse and the winner gets a
   banner, a fanfare and a confetti shower. */
(function () {
  'use strict';

  var K = window.GameKit;
  if (!K) { return; }

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.getElementById('gameRoot');
  var stage = document.getElementById('stage');
  var statusLine = document.getElementById('statusLine');
  var resultBanner = document.getElementById('resultBanner');
  var resultText = document.getElementById('resultText');
  var modeSwitch = document.getElementById('modeSwitch');

  function sfx(name) { if (window.AwesomeSFX) { window.AwesomeSFX.play(name); } }
  function safe(fn) { try { fn(); } catch (err) { /* keep the games playable */ } }
  function pop(el, cls) {
    if (!el || reduced) { return; }
    cls = cls || 'fx-pop';
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    window.setTimeout(function () { el.classList.remove(cls); }, 900);
  }

  /* What each interesting class the games use should look like in motion. */
  var REACTIONS = {
    'gk-selected': { cls: 'fx-glow', sound: 'click' },
    'gk-can-go': { cls: 'fx-hint' },
    'gk-can-take': { cls: 'fx-hint' },
    'gk-legal': { cls: 'fx-hint' },
    'gk-lit': { cls: 'fx-glow', sound: 'step' },
    'gk-filled': { cls: 'fx-pop', sound: 'place' },
    'gk-crowned': { cls: 'fx-crown', sound: 'win' },
    'gk-matched': { cls: 'fx-flip-up', sound: 'flip' },
    'gk-revealed': { cls: 'fx-flip-up', sound: 'flip' },
    'gk-check': { cls: 'fx-shake', sound: 'wrong' },
    'gk-mine-hit': { cls: 'fx-shake', sound: 'capture' },
    'gk-boom': { cls: 'fx-shake', sound: 'capture' },
    'gk-win': { cls: 'fx-win', sound: 'win' },
    'gk-token-move': { cls: 'fx-pop' },
    'gk-takes': { cls: 'fx-glint' },
    'gk-token': { cls: 'fx-pop' },
    'gk-mpoint': { cls: 'fx-pop' },
    'gk-stone': { cls: 'fx-pop', sound: 'place' },
    'gk-disc': { cls: 'fx-drop', sound: 'place' }
  };

  /* ---- pieces that appear inside a cell ---- */
  var prevText = new WeakMap();
  var CELLS = '.gk-cell, .gk-sq, .gk-ludo-cell, .gk-pit, .gk-snakecell, .gk-bs-cell, .gk-c4-cell, .gk-ttt-cell, .gk-mm-color, .gk-token, .gk-mpoint, .gk-ludo-track span, .gk-stone';

  function reactToText(el) {
    var now = el.textContent;
    var before = prevText.has(el) ? prevText.get(el) : null;
    prevText.set(el, now);
    if (before === null || before === now) { return; }
    if (reduced) { return; }
    var piece = el.querySelector ? el.querySelector('.gk-disc, .gk-stone, .gk-token, .gk-ship, .gk-snakes, .gk-ladder') : null;
    if (before === '' && now !== '') { pop(el, 'fx-place'); sfx('place'); }
    else if (now === '' && before !== '') { pop(el, 'fx-gone'); sfx('capture'); }
    else { pop(el, 'fx-capture'); sfx('capture'); }
    if (piece) { pop(piece, 'fx-piece-in'); }
  }

  function reactToClass(el, added) {
    for (var i = 0; i < added.length; i++) {
      var rule = REACTIONS[added[i]];
      if (!rule) { continue; }
      pop(el, rule.cls);
      if (rule.sound) { sfx(rule.sound); }
      return;
    }
  }

  /* Only ever react to the classes this mutation actually ADDED. Reacting to the
     whole class list would let our own animation classes feed the observer again
     and again — an endless loop that would lock up the page. */
  function classesAdded(el, oldValue) {
    var now = (el.className || '').split(/\s+/);
    var before = (oldValue || '').split(/\s+/);
    var added = [];
    for (var i = 0; i < now.length; i++) {
      var c = now[i];
      if (!c || c.indexOf('fx-') === 0) { continue; }
      if (before.indexOf(c) === -1) { added.push(c); }
    }
    return added;
  }

  function handleNode(node) {
    if (!node || node.nodeType !== 1) {
      if (node && node.parentNode && node.parentNode.matches && node.parentNode.matches(CELLS)) {
        reactToText(node.parentNode);
      }
      return;
    }
    if (node.matches && node.matches(CELLS)) { reactToText(node); }
    if (node.querySelector && node.querySelector('.gk-dice')) { sfx('dice'); pop(node.querySelector('.gk-dice'), 'fx-roll'); }
    /* freshly drawn pieces get their own little entrance */
    if (node.matches && node.matches('.gk-disc, .gk-stone, .gk-token, .gk-ship')) {
      pop(node, 'fx-piece-in');
      sfx('place');
    }
  }

  function watchBoard() {
    if (!root || !window.MutationObserver) { return; }
    var obs = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var mut = mutations[m];
        if (mut.type === 'attributes') {
          reactToClass(mut.target, classesAdded(mut.target, mut.oldValue));
          continue;
        }
        if (mut.type === 'characterData') {
          handleNode(mut.target);
          continue;
        }
        /* childList */
        var target = mut.target;
        if (target && target.matches && target.matches('.gk-dice')) {
          sfx('dice');
          pop(target, 'fx-roll');
          continue;
        }
        for (var n = 0; n < mut.addedNodes.length; n++) { handleNode(mut.addedNodes[n]); }
        for (var r = 0; r < mut.removedNodes.length; r++) {
          var gone = mut.removedNodes[r];
          if (gone && gone.nodeType === 1 && target && target.matches && target.matches(CELLS)) {
            pop(target, 'fx-gone');
            sfx('capture');
          }
        }
      }
    });
    obs.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['class']
    });
  }

  /* ---- dice tumble ---- */
  function watchDice() {
    if (!root || !window.MutationObserver) { return; }
    new MutationObserver(function (muts) {
      muts.forEach(function (mut) {
        var node = mut.target.nodeType === 1 ? mut.target : mut.target.parentNode;
        var dice = node && node.closest ? node.closest('.gk-dice') : null;
        if (dice) { sfx('dice'); pop(dice, 'fx-roll'); }
      });
    }).observe(root, { childList: true, subtree: true, characterData: true });
  }

  /* ---- scores, status and the winner banner ---- */
  function watchChrome() {
    if (window.MutationObserver) {
      ['.gk-scoreline', '.gk-live', '.gk-hand', '.gk-store', '#statusLine'].forEach(function (sel) {
        var el = document.querySelector(sel);
        if (!el) { return; }
        new MutationObserver(function () { pop(el, 'fx-flash'); }).observe(el, { childList: true, characterData: true, subtree: true });
      });
    }
    if (resultBanner && window.MutationObserver) {
      new MutationObserver(function () {
        if (resultBanner.hidden) { return; }
        var text = (resultText && resultText.textContent) || '';
        resultBanner.classList.remove('fx-banner-in');
        void resultBanner.offsetWidth;
        resultBanner.classList.add('fx-banner-in');
        K.confetti(150);
        if (/draw|nobody|tie/i.test(text)) { sfx('click'); }
        else if (/computer|🤖/i.test(text)) { sfx('lose'); }
        else { sfx('win'); }
      }).observe(resultBanner, { attributes: true, attributeFilter: ['hidden'] });
    }
  }

  /* ---- the stage itself slides in when you open a game ---- */
  function watchStage() {
    if (!stage || !window.MutationObserver) { return; }
    new MutationObserver(function () {
      if (stage.hidden) { return; }
      stage.classList.remove('fx-stage-in');
      void stage.offsetWidth;
      stage.classList.add('fx-stage-in');
    }).observe(stage, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* ---- the mode switch gets a satisfying slide between its two halves ---- */
  function watchMode() {
    if (!modeSwitch) { return; }
    modeSwitch.classList.add('fx-sport-switch');
    modeSwitch.insertAdjacentHTML('afterbegin', '<span class="fx-sport-thumb" aria-hidden="true"></span>');
    var thumb = modeSwitch.querySelector('.fx-sport-thumb');

    function place() {
      var on = modeSwitch.querySelector('.gk-mode-on');
      if (!on || !thumb) { return; }
      modeSwitch.setAttribute('data-on', on.getAttribute('data-mode') || 'cpu');
      /* Measure the real button so the thumb lines up exactly, whatever the
         two labels happen to say. */
      if (!on.offsetWidth || typeof on.offsetLeft !== 'number') { return; }
      thumb.style.width = on.offsetWidth + 'px';
      thumb.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    }

    place();
    new MutationObserver(place).observe(modeSwitch, { attributes: true, subtree: true, attributeFilter: ['class'] });
    window.addEventListener('resize', place, { passive: true });
  }

  /* ---- the cards in the games list tilt and pop ---- */
  function dressCards() {
    var cards = document.querySelectorAll('.game-card');
    Array.prototype.forEach.call(cards, function (card, i) {
      card.style.setProperty('--i', String(i % 12));
      card.setAttribute('data-tilt', '');
      if (window.AwesomeFX && window.AwesomeFX.tilt) { window.AwesomeFX.tilt(card); }
    });
  }

  function boot() {
    watchMode();
    safe(watchBoard);
    safe(watchDice);
    safe(watchChrome);
    safe(watchStage);
    safe(dressCards);
    var cards = document.getElementById('cards');
    if (cards) {
      new MutationObserver(dressCards).observe(cards, { childList: true });
    }
    if (window.AwesomeFX && window.AwesomeFX.tilt) {
      Array.prototype.forEach.call(document.querySelectorAll('.game-card'), window.AwesomeFX.tilt);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
