/* Quick games, part 2: memory match, simon says, hangman,
   guess the number, reaction duel, mastermind, word scramble. */
(function () {
  'use strict';

  var K = window.GameKit;
  var h = K.h;

  /* =====================================================
     Memory Match
     ===================================================== */
  var MEM_FACES = ['🐶', '🐱', '🦁', '🐸', '🦄', '🐢', '🐙', '🦋'];
  function memDeck() { return K.shuffle(MEM_FACES.concat(MEM_FACES)); }

  K.register({
    id: 'memory',
    name: 'Memory Match',
    emoji: '🃏',
    tag: 'Quick',
    blurb: 'Flip cards two at a time and remember where the pairs hide.',
    howTo: 'Flip two cards. If they match you keep them and get another go. The player with the most pairs wins.',
    logic: { deck: memDeck, faces: MEM_FACES },
    mount: function (root, api) {
      var deck = memDeck();
      var matched = [], open = [], scores = [0, 0], turn = 0, busy = false, over = false, dead = false;
      var seen = {}; /* what the computer remembers */
      api.onDestroy(function () { dead = true; });

      var scoreline = h('div', { class: 'gk-scoreline' });
      var board = K.grid(4, 4, { className: 'gk-memory', onCell: function (r, c) { flip(r * 4 + c); } });
      root.appendChild(scoreline);
      root.appendChild(board.root);

      function flip(i) {
        if (over || busy || matched[i] || open.indexOf(i) >= 0) { return; }
        if (api.mode === 'cpu' && turn === api.cpuIndex) { return; }
        open.push(i);
        remember(i);
        render();
        if (open.length === 2) { check(); }
      }

      function remember(i) {
        if (api.mode === 'cpu' && Math.random() < 0.85) { seen[i] = deck[i]; }
      }

      function check() {
        busy = true;
        var a = open[0], b = open[1];
        if (deck[a] === deck[b]) {
          matched[a] = matched[b] = true;
          scores[turn]++;
          open = [];
          busy = false;
          render();
          if (Object.keys(matched).length === 16) { gameOver(); return; }
          api.setStatus('🎁 A pair for ' + api.names[turn] + ' — go again!');
          maybeCpu();
          return;
        }
        K.delay(900, function () {
          if (dead) { return; }
          open = [];
          busy = false;
          turn = 1 - turn;
          render();
          maybeCpu();
        });
      }

      function gameOver() {
        over = true;
        render();
        api.confetti(120);
        if (scores[0] === scores[1]) { api.finish('🤝 All pairs found — ' + scores[0] + ' pairs each, it is a draw!'); }
        else {
          var w = scores[0] > scores[1] ? 0 : 1;
          api.finish('🎉 ' + api.names[w] + ' wins ' + scores[0] + '–' + scores[1] + '!');
        }
      }

      /* which two cards the computer will flip */
      function aiPicks() {
        var i, byFace = {};
        for (i = 0; i < 16; i++) {
          if (matched[i] || open.indexOf(i) >= 0 || !seen[i]) { continue; }
          if (byFace[seen[i]] === undefined) { byFace[seen[i]] = i; } else { return [byFace[seen[i]], i]; }
        }
        var unknown = [];
        for (i = 0; i < 16; i++) { if (!matched[i] && open.indexOf(i) < 0 && !seen[i]) { unknown.push(i); } }
        if (!unknown.length) {
          var any = [];
          for (i = 0; i < 16; i++) { if (!matched[i] && open.indexOf(i) < 0) { any.push(i); } }
          return [any[0], any[any.length - 1]];
        }
        var first = K.pick(unknown), second = null, face = deck[first];
        for (i = 0; i < 16; i++) {
          if (i !== first && seen[i] === face && !matched[i] && open.indexOf(i) < 0) { second = i; break; }
        }
        if (second === null) {
          var rest = unknown.filter(function (x) { return x !== first; });
          second = rest.length ? K.pick(rest) : first;
        }
        return [first, second];
      }

      function maybeCpu() {
        if (dead || over || busy || turn !== api.cpuIndex) { return; }
        api.setStatus('🤖 ' + api.names[1] + ' is remembering…');
        K.delay(700, function () {
          if (dead || over || busy) { return; }
          var picks2 = aiPicks();
          flip(picks2[0]);
          K.delay(520, function () { if (!dead && !over && !busy) { flip(picks2[1]); } });
        });
      }

      function render() {
        K.each(board, function (cell, r, c) {
          var i = r * 4 + c;
          var showing = matched[i] || open.indexOf(i) >= 0;
          cell.className = 'gk-cell gk-mem-card' + (showing ? ' gk-revealed' : '') + (matched[i] ? ' gk-matched' : '');
          cell.textContent = showing ? deck[i] : '❓';
        });
        scoreline.textContent = '🃏 Pairs — ' + api.names[0] + ': ' + scores[0] + '  ·  ' + api.names[1] + ': ' + scores[1];
        if (!over) { api.setStatus('👤 ' + api.names[turn] + ' — flip two cards.'); }
      }

      render();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Simon Says (follow the flashing pattern)
     ===================================================== */
  var PADS = ['🔴', '🟡', '🟢', '🔵'];

  K.register({
    id: 'simon',
    name: 'Simon Says',
    emoji: '🎵',
    tag: 'Quick',
    blurb: 'Watch the pattern flash, then tap it back in the same order.',
    howTo: 'The pattern starts with one colour and gets one longer every round. Repeat it exactly. Two-player mode: take turns — the first person to slip up loses.',
    logic: { pads: PADS },
    mount: function (root, api) {
      var seq = [], mark = 0, round = 0, over = false, dead = false, showing = false, owner = 0;
      api.onDestroy(function () { dead = true; });

      var scoreline = h('div', { class: 'gk-scoreline' });
      var pads = h('div', { class: 'gk-pads' });
      PADS.forEach(function (face, i) {
        pads.appendChild(h('button', {
          class: 'gk-pad', type: 'button', 'data-pad': i,
          onclick: function () { tapPad(i); }
        }, face));
      });
      root.appendChild(scoreline);
      root.appendChild(pads);

      function newRound() {
        round++;
        owner = api.mode === 'cpu' ? 0 : (round - 1) % 2;
        seq.push(K.randInt(4));
        mark = 0;
        render();
        play();
      }

      function play() {
        showing = true;
        api.setStatus('👀 Watch the pattern…');
        var padNodes = pads.children;
        var t = 0;
        seq.forEach(function (pad) {
          K.delay(500 + t * 620, function () {
            if (dead) { return; }
            padNodes[pad].className = 'gk-pad gk-lit';
            K.delay(330, function () { if (!dead) { padNodes[pad].className = 'gk-pad'; } });
          });
          t++;
        });
        K.delay(500 + seq.length * 620, function () {
          if (dead) { return; }
          showing = false;
          api.setStatus('👤 ' + api.names[owner] + ' — repeat the pattern (' + seq.length + ' step' + (seq.length === 1 ? '' : 's') + ').');
        });
      }

      function tapPad(pad) {
        if (over || showing) { return; }
        if (api.mode === 'cpu' && owner !== 0) { return; }
        if (seq[mark] !== pad) {
          over = true;
          api.setStatus('💥 Wrong colour!');
          api.confetti(60);
          if (api.mode === 'cpu') { api.finish('💥 Oops! You reached pattern ' + seq.length + '. Score: ' + Math.max(0, round - 1)); }
          else { api.finish('💥 ' + api.names[owner] + ' slipped up — ' + api.names[1 - owner] + ' wins!'); }
          return;
        }
        mark++;
        if (mark === seq.length) { K.delay(600, function () { if (!dead && !over) { newRound(); } }); }
      }

      function render() {
        if (api.mode === 'cpu') { scoreline.textContent = '🎵 Pattern ' + Math.max(1, round); }
        else { scoreline.textContent = '🎵 Pattern ' + Math.max(1, round) + ' · ' + api.names[owner] + ' is playing this one'; }
      }

      newRound();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Hangman
     ===================================================== */
  var HANG_WORDS = [
    ['elephant', 'a huge animal with a long trunk'],
    ['cricket', 'a game played with a bat and a ball'],
    ['rainbow', 'seven colours in the sky after rain'],
    ['rocket', 'it flies up into space'],
    ['penguin', 'a bird that swims but cannot fly'],
    ['diamond', 'the hardest and sparkliest stone'],
    ['bicycle', 'it has two wheels and pedals'],
    ['chocolate', 'a sweet brown treat'],
    ['tiger', 'a big striped cat'],
    ['monsoon', 'the rainy season'],
    ['painting', 'what you make with colours and a brush'],
    ['school', 'where you go to learn every day'],
    ['astronaut', 'a person who travels to space'],
    ['festival', 'a happy day of lights and sweets'],
    ['pyramid', 'a giant triangle building in Egypt']
  ];
  function hangMask(word, used) {
    var out = '';
    for (var i = 0; i < word.length; i++) { out += (used[word[i]] ? word[i] : '_') + ' '; }
    return out.trim();
  }

  K.register({
    id: 'hangman',
    name: 'Hangman',
    emoji: '🔤',
    tag: 'Quick',
    blurb: 'Guess the hidden word one letter at a time.',
    howTo: 'Guess letters. Six wrong letters and the round is lost. Two-player mode: one player secretly types a word, the other guesses it.',
    logic: { mask: hangMask, words: HANG_WORDS },
    mount: function (root, api) {
      var word = '', hint = '', used = {}, wrong = 0, over = false, dead = false, setting = api.mode === 'two';
      var lives = 6;
      var guesser = api.mode === 'two' ? api.names[1] : api.names[0];
      api.onDestroy(function () { dead = true; });

      var wordLine = h('div', { class: 'gk-word' });
      var hintLine = h('div', { class: 'gk-hint' });
      var livesLine = h('div', { class: 'gk-scoreline' });
      var keys = h('div', { class: 'gk-keys' });
      var setupWrap = h('div', { class: 'gk-setup' });
      root.appendChild(wordLine);
      root.appendChild(hintLine);
      root.appendChild(livesLine);
      root.appendChild(setupWrap);
      root.appendChild(keys);

      if (setting) {
        var input = h('input', { class: 'gk-input', type: 'text', placeholder: 'type a secret word', maxlength: '18' });
        setupWrap.appendChild(h('div', { class: 'gk-setup-row' }, [
          input,
          h('button', {
            class: 'gk-btn gk-btn-main', type: 'button',
            onclick: function () {
              var w = String(input.value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
              if (w.length < 3) { api.setStatus('🙂 Please type a word with at least 3 letters.'); return; }
              start(w, 'word set by Player 1');
            }
          }, 'Use this word')
        ]));
        wordLine.textContent = '🤫 Player 1 — type a secret word';
        hintLine.textContent = 'Player 2 should look away!';
      } else {
        var pick = K.pick(HANG_WORDS);
        start(pick[0], pick[1]);
      }

      function start(w, hi) {
        word = w; hint = hi;
        setting = false;
        while (setupWrap.children.length) { setupWrap.removeChild(setupWrap.children[0]); }
        buildKeys();
        render('👤 ' + guesser + ' — guess a letter.');
      }

      function buildKeys() {
        while (keys.children.length) { keys.removeChild(keys.children[0]); }
        'abcdefghijklmnopqrstuvwxyz'.split('').forEach(function (ch) {
          keys.appendChild(h('button', {
            class: 'gk-key', type: 'button',
            onclick: function () { guess(ch); }
          }, ch));
        });
      }

      function guess(ch) {
        if (over || setting || used[ch]) { return; }
        used[ch] = true;
        if (word.indexOf(ch) < 0) { wrong++; }
        var found = true;
        for (var i = 0; i < word.length; i++) { if (!used[word[i]]) { found = false; } }
        render(found ? '🎉 You found every letter!' : (word.indexOf(ch) < 0 ? '❌ No “' + ch + '” in the word.' : '✅ Yes! There is a “' + ch + '”.'));
        if (found) {
          over = true;
          api.confetti(110);
          api.finish('🎉 ' + guesser + ' guessed the word: ' + word.toUpperCase() + '!');
        } else if (wrong >= lives) {
          over = true;
          api.finish('💀 Out of lives — the word was ' + word.toUpperCase() + '.');
        }
      }

      function render(msg) {
        wordLine.textContent = hangMask(word, used);
        hintLine.textContent = 'Hint: ' + hint;
        livesLine.textContent = '❤️ Lives left: ' + (lives - wrong) + '   ❌ Wrong letters: ' + wrong;
        var nodes = keys.children;
        for (var i = 0; i < nodes.length; i++) {
          var ch = nodes[i].textContent;
          if (used[ch]) { nodes[i].className = 'gk-key gk-used'; nodes[i].setAttribute('disabled', ''); }
        }
        if (msg) { api.setStatus(msg); }
      }

      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Guess the Number
     ===================================================== */
  K.register({
    id: 'guessNumber',
    name: 'Guess the Number',
    emoji: '🔢',
    tag: 'Quick',
    blurb: 'I am thinking of a number between 1 and 100…',
    howTo: 'Guess a number and you will be told whether to go higher or lower. Fewest guesses wins. Two-player mode: take turns guessing the same number — first to hit it wins.',
    mount: function (root, api) {
      var secret = K.randInt(100) + 1;
      var turn = 0, over = false, tries = [0, 0], low = 1, high = 100, dead = false;
      api.onDestroy(function () { dead = true; });

      var scoreline = h('div', { class: 'gk-scoreline' });
      var rangeLine = h('div', { class: 'gk-range', text: 'Possible range: 1 – 100' });
      var input = h('input', { class: 'gk-input gk-num', type: 'number', min: '1', max: '100', placeholder: '1 – 100', value: '' });
      var btn = h('button', { class: 'gk-btn gk-btn-main', type: 'button', onclick: function () { submit(); } }, 'Guess! 🔍');
      root.appendChild(scoreline);
      root.appendChild(rangeLine);
      root.appendChild(h('div', { class: 'gk-setup-row' }, [input, btn]));

      function submit() {
        if (over) { return; }
        var n = parseInt(input.value, 10);
        if (!n || n < 1 || n > 100) { api.setStatus('🤔 Type a whole number between 1 and 100.'); return; }
        tries[turn]++;
        if (n === secret) {
          over = true;
          api.confetti(120);
          api.finish('🎉 ' + api.names[turn] + ' found it! The number was ' + secret + ' (found in ' + tries[turn] + ' guess' + (tries[turn] === 1 ? '' : 'es') + ').');
          return;
        }
        if (n < secret) { if (n + 1 > low) { low = n + 1; } api.setStatus('⬆️ Higher than ' + n + ', ' + api.names[turn] + '!'); }
        else { if (n - 1 < high) { high = n - 1; } api.setStatus('⬇️ Lower than ' + n + ', ' + api.names[turn] + '!'); }
        input.value = '';
        turn = 1 - turn;
        render();
      }

      function render() {
        scoreline.textContent = '🔢 Guesses — ' + api.names[0] + ': ' + tries[0] + '  ·  ' + api.names[1] + ': ' + tries[1];
        rangeLine.textContent = 'Possible range: ' + low + ' – ' + high;
      }

      render();
      api.setStatus('👤 ' + api.names[0] + ' — take a guess between 1 and 100.');
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Reaction Duel
     ===================================================== */
  K.register({
    id: 'reaction',
    name: 'Reaction Duel',
    emoji: '⚡',
    tag: 'Quick',
    blurb: 'Wait for green… then tap as fast as you possibly can!',
    howTo: 'Five rounds. When the pad turns green, tap it as fast as you can. Tap too early and you lose the round. Two-player mode: first to tap the green pad wins the round.',
    mount: function (root, api) {
      var scores = [0, 0], round = 0, state = 'idle', ready1 = 0, ready2 = 0, startAt = 0, over = false, dead = false;
      var total = 5;
      api.onDestroy(function () { dead = true; });

      var scoreline = h('div', { class: 'gk-scoreline' });
      var pad1 = h('button', { class: 'gk-rpad', type: 'button', onclick: function () { hit(0); } }, api.names[0]);
      var pad2 = h('button', { class: 'gk-rpad', type: 'button', onclick: function () { hit(1); } }, api.names[1]);
      var stage = h('div', { class: 'gk-arena' }, [pad1, pad2]);
      var goBtn = h('button', { class: 'gk-btn gk-btn-main', type: 'button', onclick: function () { startRound(); } }, 'Start round ▶️');
      root.appendChild(scoreline);
      root.appendChild(stage);
      root.appendChild(h('div', { class: 'gk-controls' }, goBtn));

      function paint(color, msg) {
        stage.className = 'gk-arena gk-' + color;
        pad1.className = 'gk-rpad gk-p1' + (state === 'ready' || state === 'go' ? ' gk-live' : '');
        pad2.className = 'gk-rpad gk-p2' + (state === 'ready' || state === 'go' ? ' gk-live' : '');
        if (msg) { api.setStatus(msg); }
      }

      function startRound() {
        if (over || state !== 'idle') { return; }
        round++;
        state = 'ready';
        ready1 = ready2 = 0;
        paint('wait', '⏳ Round ' + round + ' — wait for green…');
        goBtn.setAttribute('disabled', '');
        K.delay(700 + K.randInt(2200), function () {
          if (dead || over) { return; }
          if (state !== 'ready') { return; }
          state = 'go';
          startAt = Date.now ? Date.now() : new Date().getTime();
          ready1 = ready2 = 0;
          if (api.mode === 'cpu') { ready1 = 150 + K.randInt(220); }
          paint('go', '🟢 GO!');
        });
      }

      function hit(who) {
        if (over) { return; }
        if (state === 'ready') { /* too early */ }
        if (state === 'ready') {
          var loser = who;
          var other = 1 - loser;
          scores[other]++;
          finishRound(api.names[other] + ' wins the round — ' + api.names[loser] + ' tapped too early! 🐢');
          return;
        }
        if (state !== 'go') { return; }
        var now = Date.now ? Date.now() : new Date().getTime();
        var t = now - startAt;
        if (api.mode === 'cpu') {
          if (who === 1) { return; }
          var cpuTime = ready1 || 300;
          if (t < cpuTime) { scores[0]++; finishRound('⚡ You were ' + t + ' ms — faster than the computer (' + cpuTime + ' ms)!'); }
          else { scores[1]++; finishRound('🤖 The computer was faster: ' + cpuTime + ' ms vs your ' + t + ' ms.'); }
          return;
        }
        if (who === 0 && !ready1) { ready1 = t; } else if (who === 1 && !ready2) { ready2 = t; }
        if (ready1 && ready2) {
          if (ready1 < ready2) { scores[0]++; finishRound('⚡ Player 1 was fastest — ' + ready1 + ' ms vs ' + ready2 + ' ms!'); }
          else if (ready2 < ready1) { scores[1]++; finishRound('⚡ Player 2 was fastest — ' + ready2 + ' ms vs ' + ready1 + ' ms!'); }
          else { finishRound('🤝 Dead heat — ' + ready1 + ' ms each!'); }
        } else {
          api.setStatus('⏱️ ' + api.names[who] + ' tapped in ' + t + ' ms — waiting for the other player…');
        }
      }

      function finishRound(msg) {
        state = 'idle';
        paint('done', msg);
        goBtn.removeAttribute('disabled');
        render();
        if (round >= total) {
          over = true;
          api.confetti(120);
          if (scores[0] === scores[1]) { api.finish('🤝 Five rounds done — ' + scores[0] + '–' + scores[1] + ', it is a draw!'); }
          else {
            var w = scores[0] > scores[1] ? 0 : 1;
            api.finish('🏆 ' + api.names[w] + ' wins the duel ' + scores[0] + '–' + scores[1] + '!');
          }
        }
      }

      function render() {
        scoreline.textContent = '⚡ Score — ' + api.names[0] + ': ' + scores[0] + '  ·  ' + api.names[1] + ': ' + scores[1] + '   (round ' + Math.min(round, total) + ' of ' + total + ')';
      }

      paint('idle', '👤 Press “Start round”, then wait for the green light.');
      render();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Mastermind
     ===================================================== */
  var MM_COLORS = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'];
  function mmFeedback(secret, guess) {
    var black = 0, white = 0, usedS = [], usedG = [], i;
    for (i = 0; i < secret.length; i++) { usedS.push(false); usedG.push(false); }
    for (i = 0; i < secret.length; i++) { if (secret[i] === guess[i]) { black++; usedS[i] = usedG[i] = true; } }
    for (i = 0; i < secret.length; i++) {
      if (usedG[i]) { continue; }
      for (var j = 0; j < secret.length; j++) {
        if (!usedS[j] && secret[j] === guess[i]) { white++; usedS[j] = true; break; }
      }
    }
    return { black: black, white: white };
  }

  K.register({
    id: 'mastermind',
    name: 'Mastermind',
    emoji: '🧠',
    tag: 'Quick',
    blurb: 'Crack the secret four-colour code in ten tries.',
    howTo: 'A code of four colours is hidden. Build a guess, then read the clues: ⚫ exact spot, ⚪ right colour wrong spot. You get ten guesses.',
    logic: { feedback: mmFeedback, colors: MM_COLORS },
    mount: function (root, api) {
      var slots = 4, secret = [], picks = [], tries = 0, maxTries = 10, over = false, setting = api.mode === 'two', dead = false;
      api.onDestroy(function () { dead = true; });

      var pickerLocked = false;
      var clue = h('div', { class: 'gk-scoreline' });
      var guessRow = h('div', { class: 'gk-mm-row' });
      var history = h('div', { class: 'gk-mm-history' });
      var palette = h('div', { class: 'gk-mm-palette' });
      var controls = h('div', { class: 'gk-controls' });
      root.appendChild(clue);
      root.appendChild(guessRow);
      root.appendChild(controls);
      root.appendChild(palette);
      root.appendChild(history);

      function drawGuess() {
        while (guessRow.children.length) { guessRow.removeChild(guessRow.children[0]); }
        for (var i = 0; i < slots; i++) {
          guessRow.appendChild(h('span', { class: 'gk-mm-slot' + (picks[i] ? ' gk-filled' : ''), text: picks[i] || '·' }));
        }
      }

      function buildPalette(onPick) {
        while (palette.children.length) { palette.removeChild(palette.children[0]); }
        MM_COLORS.forEach(function (c) {
          palette.appendChild(h('button', { class: 'gk-mm-color', type: 'button', onclick: function () { onPick(c); } }, c));
        });
      }

      function setupScreen() {
        api.setStatus('🤫 Player 1 — build the secret code, then pass the device.');
        buildPalette(function (c) {
          if (picks.length < slots) { picks.push(c); drawGuess(); }
          if (picks.length === slots) {
            controls.appendChild(h('button', {
              class: 'gk-btn gk-btn-main', type: 'button',
              onclick: function () {
                secret = picks.slice();
                picks = [];
                setting = false;
                while (controls.children.length) { controls.removeChild(controls.children[0]); }
                playScreen();
              }
            }, 'Lock the code 🔒'));
          }
        });
        drawGuess();
      }

      function playScreen() {
        buildPalette(function (c) {
          if (over || picks.length >= slots || pickerLocked) { return; }
          picks.push(c);
          drawGuess();
          if (picks.length === slots) { submitGuess(); }
        });
        drawGuess();
        api.setStatus('👤 ' + api.names[1] + ' — build a code of four colours.');
      }

      function submitGuess() {
        pickerLocked = true;
        tries++;
        var fb = mmFeedback(secret, picks);
        var row = h('div', { class: 'gk-mm-history-row' }, [
          h('span', { class: 'gk-mm-guess', text: picks.join(' ') }),
          h('span', { class: 'gk-mm-fb', text: '⚫'.repeat(fb.black) + '⚪'.repeat(fb.white) + ' ·'.repeat(Math.max(0, slots - fb.black - fb.white)) })
        ]);
        history.appendChild(row);
        picks = [];
        drawGuess();
        clue.textContent = '🧠 Guess ' + tries + ' of ' + maxTries + ' — this try: ' + fb.black + ' exact, ' + fb.white + ' close';
        if (fb.black === slots) {
          over = true;
          api.confetti(120);
          api.finish('🎉 Code cracked in ' + tries + ' guess' + (tries === 1 ? '' : 'es') + ' — ' + secret.join(' ') + '!');
          return;
        }
        if (tries >= maxTries) {
          over = true;
          api.setStatus('💥 Out of guesses!');
          api.finish('💥 Out of guesses — the secret code was ' + secret.join(' ') + '.');
          return;
        }
        pickerLocked = false;
      }

      if (setting) { setupScreen(); }
      else {
        secret = [];
        for (var i = 0; i < slots; i++) { secret.push(K.pick(MM_COLORS)); }
        playScreen();
      }

      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Word Scramble
     ===================================================== */
  function scramble(word) {
    var letters = word.split(''), out = word;
    for (var guard = 0; guard < 40 && out === word; guard++) { out = K.shuffle(letters).join(''); }
    return out === word ? letters.reverse().join('') : out;
  }

  K.register({
    id: 'wordScramble',
    name: 'Word Scramble',
    emoji: '🔀',
    tag: 'Quick',
    blurb: 'Mixed-up letters, one word to find. Beat the clock!',
    howTo: 'Unscramble the letters and type the word. In two-player mode you take turns — a correct answer scores a point and passes the letters on.',
    logic: { scramble: scramble, words: HANG_WORDS },
    mount: function (root, api) {
      var pool = K.shuffle(HANG_WORDS.slice()), idx = 0, word = '', hint = '', scrambled = '';
      var scores = [0, 0], turn = 0, wrong = 0, over = false, left = 60, timer = null, dead = false;
      api.onDestroy(function () { dead = true; });

      var scoreline = h('div', { class: 'gk-scoreline' });
      var big = h('div', { class: 'gk-scramble' });
      var hintLine = h('div', { class: 'gk-hint' });
      var input = h('input', { class: 'gk-input', type: 'text', placeholder: 'your answer', value: '' });
      var check = h('button', { class: 'gk-btn gk-btn-main', type: 'button', onclick: function () { submit(); } }, 'Check ✅');
      root.appendChild(scoreline);
      root.appendChild(big);
      root.appendChild(hintLine);
      root.appendChild(h('div', { class: 'gk-setup-row' }, [input, check]));

      if (api.mode === 'cpu') {
        timer = window.setInterval(function () {
          if (dead || over) { return; }
          left--;
          render('⏳ ' + left + ' seconds left');
          if (left <= 0) {
            over = true;
            api.finish('⏰ Time up! You solved ' + scores[0] + ' word' + (scores[0] === 1 ? '' : 's') + '.');
          }
        }, 1000);
      }

      function nextWord() {
        if (idx >= pool.length) { pool = K.shuffle(pool); idx = 0; }
        word = pool[idx][0]; hint = pool[idx][1]; idx++;
        scrambled = scramble(word);
        wrong = 0;
        render('👤 ' + api.names[turn] + ' — unscramble it!');
      }

      function submit() {
        if (over) { return; }
        var answer = String(input.value || '').trim().toLowerCase();
        if (!answer) { return; }
        if (answer === word) {
          scores[turn]++;
          api.confetti(70);
          input.value = '';
          if (api.mode === 'two') {
            api.setStatus('✅ Correct! ' + api.names[turn] + ' scores. Pass the device.');
            turn = 1 - turn;
          } else {
            api.setStatus('✅ Correct! ' + word.toUpperCase() + ' — here is another.');
          }
          nextWord();
          return;
        }
        wrong++;
        input.value = '';
        if (wrong >= 2) {
          api.setStatus('❌ Not quite — the word was ' + word.toUpperCase() + '.');
          if (api.mode === 'two') { turn = 1 - turn; }
          nextWord();
          return;
        }
        api.setStatus('❌ Not that one — one more try!');
      }

      function render(msg) {
        big.textContent = scrambled.toUpperCase().split('').join(' ');
        hintLine.textContent = 'Hint: ' + hint + (api.mode === 'cpu' ? '   ·   ⏳ ' + left + 's' : '');
        scoreline.textContent = '🔀 Words solved — ' + api.names[0] + ': ' + scores[0] + '  ·  ' + api.names[1] + ': ' + scores[1];
        if (msg) { api.setStatus(msg); }
      }

      nextWord();
      return {
        destroy: function () {
          dead = true;
          if (timer) { window.clearInterval(timer); }
        }
      };
    }
  });
})();
