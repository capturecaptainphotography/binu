/* Board games, part 2: Ludo, Mancala, Hex, Nine Men's Morris, Battleship. */
(function () {
  'use strict';

  var K = window.GameKit;
  var h = K.h;
  function inner(r, c, n) { return r >= 0 && r < n && c >= 0 && c < n; }

  /* =====================================================
     Ludo — red (top-left corner) against yellow (bottom-right)
     ===================================================== */
  var TRACK = [];
  (function () {
    var r, c;
    for (c = 1; c <= 5; c++) { TRACK.push([6, c]); }
    for (r = 5; r >= 0; r--) { TRACK.push([r, 6]); }
    TRACK.push([0, 7]);
    for (r = 0; r <= 5; r++) { TRACK.push([r, 8]); }
    for (c = 9; c <= 14; c++) { TRACK.push([6, c]); }
    TRACK.push([7, 14]);
    for (c = 14; c >= 9; c--) { TRACK.push([8, c]); }
    for (r = 9; r <= 14; r++) { TRACK.push([r, 8]); }
    TRACK.push([14, 7]);
    for (r = 14; r >= 9; r--) { TRACK.push([r, 6]); }
    for (c = 5; c >= 0; c--) { TRACK.push([8, c]); }
    TRACK.push([7, 0]);
    TRACK.push([6, 0]);
  })();
  var SAFE = { 0: true, 8: true, 13: true, 21: true, 26: true, 34: true, 39: true, 47: true };
  var LUDO = [
    { key: 'red', name: 'Red', start: 0, yard: [1, 1], home: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]] },
    { key: 'yellow', name: 'Yellow', start: 26, yard: [10, 10], home: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]] }
  ];
  var YARD_SPOTS = [[0, 0], [0, 3], [3, 0], [3, 3]];

  function ludoCell(p, pos) {
    if (pos <= 50) { return TRACK[(LUDO[p].start + Math.max(0, pos)) % 52]; }
    if (pos <= 55) { return LUDO[p].home[pos - 51]; }
    return [7, 7];
  }
  function ludoGlobal(p, pos) { return (LUDO[p].start + pos) % 52; }
  function ludoYard(p, i) {
    return [LUDO[p].yard[0] + YARD_SPOTS[i][0], LUDO[p].yard[1] + YARD_SPOTS[i][1]];
  }
  function ludoLegal(tokens, p, d) {
    var out = [];
    for (var i = 0; i < 4; i++) {
      var pos = tokens[p][i];
      if (pos === 56) { continue; }
      if (pos < 0) { if (d === 6) { out.push(i); } continue; }
      if (pos + d <= 56) { out.push(i); }
    }
    return out;
  }

  K.register({
    id: 'ludo',
    name: 'Ludo',
    emoji: '🎲',
    tag: 'Board',
    blurb: 'Roll a six, race four tokens home and knock the others back.',
    howTo: 'Roll a 6 to bring a token out of your yard. Tap a glowing token to move it. Landing on an opponent sends it home, but star squares are safe. Roll an exact number to reach the centre. Red is you.',
    logic: { track: TRACK, cell: ludoCell, safe: SAFE, global: ludoGlobal, legal: ludoLegal, yard: ludoYard },
    mount: function (root, api) {
      var tokens = [[-1, -1, -1, -1], [-1, -1, -1, -1]];
      var turn = 0, dice = 0, rolled = false, sixes = 0, over = false, dead = false, movable = [], busy = false;
      api.onDestroy(function () { dead = true; });

      var board = K.grid(15, 15, { className: 'gk-ludo', onCell: function (r, c) { tapCell(r, c); } });
      var diceFace = h('div', { class: 'gk-dice', text: '🎲' });
      var rollBtn = h('button', { class: 'gk-btn gk-btn-main', type: 'button', onclick: humanRoll }, 'Roll the dice');
      root.appendChild(board.root);
      root.appendChild(h('div', { class: 'gk-controls' }, [rollBtn, diceFace]));

      function humanRoll() {
        if (over || rolled || busy) { return; }
        if (api.mode === 'cpu' && turn !== 0) { return; }
        roll();
      }

      function roll() {
        if (over || rolled || busy) { return; }
        dice = K.randInt(6) + 1;
        diceFace.textContent = K.DICE[dice - 1];
        rolled = true;
        sixes = dice === 6 ? sixes + 1 : 0;
        if (sixes === 3) {
          sixes = 0;
          api.setStatus('😅 Three sixes in a row — the turn passes!');
          K.delay(700, function () { if (!dead && !over) { endTurn(); } });
          return;
        }
        movable = ludoLegal(tokens, turn, dice);
        if (!movable.length) {
          api.setStatus('🙃 ' + api.names[turn] + ' rolled ' + dice + ' and has no move.');
          K.delay(700, function () { if (!dead && !over) { endTurn(); } });
          return;
        }
        render();
        if (movable.length === 1) {
          api.setStatus('🎲 ' + api.names[turn] + ' rolled ' + dice + ' — moving.');
          K.delay(480, function () { if (!dead && !over && rolled) { move(movable[0]); } });
          return;
        }
        api.setStatus('👤 ' + api.names[turn] + ' rolled ' + dice + ' — tap a glowing token.');
      }

      function allHome(p) {
        for (var i = 0; i < 4; i++) { if (tokens[p][i] !== 56) { return false; } }
        return true;
      }

      function move(i) {
        if (!rolled || over) { return; }
        var p = turn, pos = tokens[p][i], extra = dice === 6, msg = '';
        if (pos < 0) {
          tokens[p][i] = 0;
          msg = '🎉 A six! Token ' + (i + 1) + ' comes out of the yard.';
        } else {
          var to = pos + dice, captured = 0;
          if (to <= 50) {
            var gi = ludoGlobal(p, to);
            if (!SAFE[gi]) {
              for (var oi = 0; oi < 4; oi++) {
                var opos = tokens[1 - p][oi];
                if (opos >= 0 && opos <= 50 && ludoGlobal(1 - p, opos) === gi) { tokens[1 - p][oi] = -1; captured++; }
              }
            }
          } else if (to < 56) { msg = '🏠 Into the home column.'; }
          else { msg = '⭐ Token ' + (i + 1) + ' reached the centre!'; extra = true; }
          tokens[p][i] = to;
          if (captured) { extra = true; msg = '💥 Knocked ' + captured + ' opponent token' + (captured === 1 ? '' : 's') + ' back home!'; }
        }
        rolled = false;
        movable = [];
        render();
        if (allHome(p)) {
          over = true;
          api.confetti(150);
          api.finish('🏆 ' + api.names[p] + ' got all four tokens home — winner!');
          return;
        }
        if (extra) {
          api.setStatus((msg ? msg + ' ' : '') + '🎁 ' + api.names[p] + ' rolls again!');
          K.delay(750, function () { if (!dead && !over) { maybeCpu(); } });
          return;
        }
        K.delay(600, function () { if (!dead && !over) { endTurn(); } });
      }

      function endTurn() {
        turn = 1 - turn;
        rolled = false;
        movable = [];
        sixes = 0;
        diceFace.textContent = '🎲';
        render();
        maybeCpu();
      }

      function aiScore(p, i) {
        var pos = tokens[p][i], to = pos < 0 ? 0 : pos + dice, score;
        if (pos < 0) { return 150; }
        if (to === 56) { return 1000; }
        if (to > 50) { return 260 + (to - 50) * 4; }
        score = to * 0.6;
        var gi = ludoGlobal(p, to);
        if (SAFE[gi]) { score += 45; }
        for (var oi = 0; oi < 4; oi++) {
          var opos = tokens[1 - p][oi];
          if (opos < 0 || opos > 50) { continue; }
          var ogi = ludoGlobal(1 - p, opos);
          if (ogi === gi && !SAFE[gi]) { score += 600; }
          var ahead = (gi - ogi + 52) % 52;
          if (!SAFE[gi] && ahead >= 1 && ahead <= 6) { score -= 70; }
        }
        return score;
      }

      function maybeCpu() {
        if (dead || over || api.mode !== 'cpu' || turn === 0 || rolled) { return; }
        K.delay(650, function () {
          if (dead || over || rolled) { return; }
          roll();
          if (rolled && movable.length > 1) {
            K.delay(600, function () {
              if (dead || over || !rolled) { return; }
              var best = movable[0], bestScore = -Infinity;
              for (var i = 0; i < movable.length; i++) {
                var sc = aiScore(1, movable[i]);
                if (sc > bestScore) { bestScore = sc; best = movable[i]; }
              }
              move(best);
            });
          }
        });
      }

      function tapCell(r, c) {
        if (!rolled || over || (api.mode === 'cpu' && turn !== 0)) { return; }
        for (var i = 0; i < movable.length; i++) {
          var cell = tokens[turn][movable[i]] < 0 ? ludoYard(turn, movable[i]) : ludoCell(turn, tokens[turn][movable[i]]);
          if (cell[0] === r && cell[1] === c) { move(movable[i]); return; }
        }
      }

      function render() {
        K.each(board, function (cell) {
          cell.className = 'gk-cell gk-ludo-cell';
          cell.textContent = '';
        });
        for (var t = 0; t < TRACK.length; t++) {
          board.at(TRACK[t][0], TRACK[t][1]).className = 'gk-cell gk-ludo-cell ' + (SAFE[t] ? 'gk-ludo-safe' : 'gk-ludo-track');
        }
        for (var r = 6; r <= 8; r++) {
          for (var c = 6; c <= 8; c++) { board.at(r, c).className = 'gk-cell gk-ludo-cell gk-ludo-centre'; }
        }
        LUDO.forEach(function (L, p) {
          L.home.forEach(function (spot) {
            board.at(spot[0], spot[1]).className = 'gk-cell gk-ludo-cell gk-home-' + L.key;
          });
        });
        var quad = [
          { r: 0, c: 0, cls: 'gk-yard-red' },
          { r: 0, c: 9, cls: 'gk-yard-green' },
          { r: 9, c: 0, cls: 'gk-yard-blue' },
          { r: 9, c: 9, cls: 'gk-yard-yellow' }
        ];
        quad.forEach(function (q) {
          for (var qr = q.r; qr < q.r + 6; qr++) {
            for (var qc = q.c; qc < q.c + 6; qc++) { board.at(qr, qc).className += ' gk-ludo-yard ' + q.cls; }
          }
        });
        tokens.forEach(function (list, p) {
          list.forEach(function (pos, i) {
            var cell = pos < 0 ? ludoYard(p, i) : ludoCell(p, pos);
            var node = board.at(cell[0], cell[1]);
            var glow = rolled && p === turn && movable.indexOf(i) >= 0;
            node.appendChild(h('span', {
              class: 'gk-token gk-token-' + LUDO[p].key + (glow ? ' gk-token-move' : '')
            }, String(i + 1)));
          });
        });
        if (!over) {
          if (rolled && movable.length > 1 && !(api.mode === 'cpu' && turn !== 0)) {
            api.setStatus('👤 ' + api.names[turn] + ' rolled ' + dice + ' — tap a glowing token.');
          } else if (api.mode === 'cpu' && turn !== 0) {
            api.setStatus('🤖 ' + api.names[1] + ' is playing…');
          } else if (!rolled) {
            api.setStatus('👤 ' + api.names[turn] + ' — tap “Roll the dice”.');
          }
        }
      }

      render();
      maybeCpu();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Mancala
     ===================================================== */
  function macStart() { return [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]; }
  function macSow(state, pit, player) {
    var s = state.slice(), skip = player === 0 ? 13 : 6, stones = s[pit], i = pit;
    s[pit] = 0;
    while (stones > 0) {
      i = (i + 1) % 14;
      if (i === skip) { continue; }
      s[i]++;
      stones--;
    }
    return { s: s, last: i, extra: i === (player === 0 ? 6 : 13) };
  }
  function macCapture(s, pit, player) {
    var store = player === 0 ? 6 : 13, opposite = 12 - pit;
    var mine = player === 0 ? pit <= 5 : (pit >= 7 && pit <= 12);
    if (mine && s[pit] === 1 && s[opposite] > 0) {
      s[store] += s[opposite] + 1;
      s[opposite] = 0;
      s[pit] = 0;
    }
    return s;
  }
  function macPits(state, player) {
    var out = [], i;
    if (player === 0) { for (i = 0; i <= 5; i++) { if (state[i]) { out.push(i); } } }
    else { for (i = 7; i <= 12; i++) { if (state[i]) { out.push(i); } } }
    return out;
  }
  function macOver(state) { return !macPits(state, 0).length || !macPits(state, 1).length; }
  function macFinish(state) {
    var s = state.slice(), i;
    if (!macPits(s, 0).length) { for (i = 7; i <= 12; i++) { s[13] += s[i]; s[i] = 0; } }
    if (!macPits(s, 1).length) { for (i = 0; i <= 5; i++) { s[6] += s[i]; s[i] = 0; } }
    return s;
  }

  K.register({
    id: 'mancala',
    name: 'Mancala',
    emoji: '🌰',
    tag: 'Board',
    blurb: 'Scoop up stones and drop them one by one around the board.',
    howTo: 'Tap one of your pits to pick up its stones — they drop one per pit going round. Land the last stone in your store for a free turn. Land it in an empty pit and you capture the stones opposite. Most stones at the end wins.',
    logic: { start: macStart, sow: macSow, capture: macCapture, over: macOver, finish: macFinish, pits: macPits },
    mount: function (root, api) {
      var s = macStart(), turn = 0, over = false, dead = false;
      var stores = h('div', { class: 'gk-stores' });
      var rowTop = h('div', { class: 'gk-pit-row' });
      var rowBottom = h('div', { class: 'gk-pit-row' });
      root.appendChild(stores);
      root.appendChild(rowTop);
      root.appendChild(rowBottom);

      (function build() {
        var i;
        for (i = 12; i >= 7; i--) { rowTop.appendChild(h('button', { class: 'gk-pit', type: 'button', 'data-pit': i, onclick: function () { } })); }
        for (i = 0; i <= 5; i++) { rowBottom.appendChild(h('button', { class: 'gk-pit', type: 'button', 'data-pit': i, onclick: function () { } })); }
      })();

      function canPlay() { return !over && !(api.mode === 'cpu' && turn === 1); }

      function play(pit) {
        if (!canPlay()) { return; }
        var mine = (turn === 0) ? pit <= 5 : (pit >= 7 && pit <= 12);
        if (!mine || !s[pit]) { return; }
        var res = macSow(s, pit, turn);
        var captured = 0;
        s = res.s;
        if (!res.extra) {
          var before = s[6] + s[13];
          s = macCapture(s, res.last, turn);
          captured = (s[6] + s[13]) - before;
        }
        if (macOver(s)) {
          s = macFinish(s);
          over = true;
          render();
          api.confetti(120);
          if (s[6] === s[13]) { api.finish('🤝 A draw — ' + s[6] + ' stones each.'); }
          else { api.finish('🏆 ' + api.names[s[6] > s[13] ? 0 : 1] + ' wins ' + Math.max(s[6], s[13]) + '–' + Math.min(s[6], s[13]) + '!'); }
          return;
        }
        if (!res.extra) { turn = 1 - turn; }
        render();
        if (captured) { api.setStatus('🎁 Captured ' + captured + ' stones!'); }
        else if (res.extra) { api.setStatus('🎁 Last stone landed in your store — ' + api.names[turn] + ' goes again!'); }
        maybeCpu();
      }

      function aiPick() {
        var pits = macPits(s, 1), best = pits[0], bestScore = -Infinity;
        for (var i = 0; i < pits.length; i++) {
          var res = macSow(s, pits[i], 1);
          var score = res.s[13] - res.s[6];
          if (res.extra) { score += 8; }
          score -= res.s[6] * 0.4;
          if (score > bestScore) { bestScore = score; best = pits[i]; }
        }
        return best;
      }

      function maybeCpu() {
        if (dead || over || api.mode !== 'cpu' || turn !== 1) { return; }
        api.setStatus('🤖 ' + api.names[1] + ' is thinking…');
        K.delay(700, function () { if (!dead && !over) { play(aiPick()); } });
      }

      function render() {
        stores.textContent = '';
        stores.appendChild(h('span', { class: 'gk-store gk-store-p2' }, '🏆 Player 2 store: ' + s[13]));
        stores.appendChild(h('span', { class: 'gk-store gk-store-p1' }, 'Player 1 store: ' + s[6]));
        for (var i = 0; i < 14; i++) {
          var node = i <= 5 ? rowBottom.children[i] : (i >= 7 ? rowTop.children[12 - i] : null);
          if (!node) { continue; }
          var mine = (turn === 0) ? i <= 5 : (i >= 7 && i <= 12);
          node.className = 'gk-pit' + (mine && canPlay() && s[i] ? ' gk-pit-live' : '');
          node.textContent = s[i] + (i <= 5 ? ' 🧒' : ' 👦');
        }
        if (!over) { api.setStatus('👤 ' + api.names[turn] + ' — tap one of your pits.'); }
      }

      rowTop.children && Array.prototype.forEach.call(rowTop.children, function (node) {
        node.addEventListener('click', function () { play(parseInt(node.getAttribute('data-pit'), 10)); });
      });
      Array.prototype.forEach.call(rowBottom.children, function (node) {
        node.addEventListener('click', function () { play(parseInt(node.getAttribute('data-pit'), 10)); });
      });

      render();
      maybeCpu();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Hex
     ===================================================== */
  var HEX_N = 7;
  function hexNeighbours(r, c) {
    var d = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, 1], [1, -1]], out = [];
    for (var i = 0; i < 6; i++) {
      var rr = r + d[i][0], cc = c + d[i][1];
      if (inner(rr, cc, HEX_N)) { out.push([rr, cc]); }
    }
    return out;
  }
  function hexWon(b, color) {
    var seen = {}, stack = [], i, r, c;
    if (color === 1) { for (c = 0; c < HEX_N; c++) { if (b[0][c] === 1) { stack.push([0, c]); } } }
    else { for (r = 0; r < HEX_N; r++) { if (b[r][0] === 2) { stack.push([r, 0]); } } }
    while (stack.length) {
      var cur = stack.pop(), key = cur[0] + ',' + cur[1];
      if (seen[key]) { continue; }
      seen[key] = true;
      if (color === 1 && cur[0] === HEX_N - 1) { return true; }
      if (color === 2 && cur[1] === HEX_N - 1) { return true; }
      var nb = hexNeighbours(cur[0], cur[1]);
      for (i = 0; i < nb.length; i++) {
        if (b[nb[i][0]][nb[i][1]] === color && !seen[nb[i][0] + ',' + nb[i][1]]) { stack.push(nb[i]); }
      }
    }
    return false;
  }
  function hexPlayout(b, toMove) {
    var board = b.map(function (row) { return row.slice(); }), r, c, empty = [], me = toMove;
    for (r = 0; r < HEX_N; r++) { for (c = 0; c < HEX_N; c++) { if (!board[r][c]) { empty.push([r, c]); } } }
    K.shuffle(empty);
    for (var i = 0; i < empty.length; i++) {
      board[empty[i][0]][empty[i][1]] = me;
      if (hexWon(board, me)) { return me; }
      me = 3 - me;
    }
    return 0;
  }

  K.register({
    id: 'hex',
    name: 'Hex',
    emoji: '⬡',
    tag: 'Board',
    blurb: 'Join your two sides of the honeycomb before your rival joins theirs.',
    howTo: 'You are ⬤ and must build an unbroken chain from the top edge to the bottom edge. Your rival is ⭕ and joins left to right. Tap any empty hexagon.',
    logic: { won: hexWon, neighbours: hexNeighbours, playout: hexPlayout, size: HEX_N },
    mount: function (root, api) {
      var b = [], r, c;
      for (r = 0; r < HEX_N; r++) { b.push([]); for (c = 0; c < HEX_N; c++) { b[r].push(0); } }
      var turn = 1, over = false, dead = false;
      api.onDestroy(function () { dead = true; });
      var board = K.grid(HEX_N, HEX_N, { className: 'gk-hex', onCell: function (rr, cc) { play(rr, cc); } });
      root.appendChild(board.root);

      function play(rr, cc) {
        if (over || b[rr][cc] || (api.mode === 'cpu' && turn === 2)) { return; }
        b[rr][cc] = turn;
        if (hexWon(b, turn)) {
          over = true; render(); api.confetti(140);
          api.finish('🏆 ' + api.names[turn - 1] + ' joined the two sides and wins!');
          return;
        }
        turn = 3 - turn;
        render();
        maybeCpu();
      }

      function aiMove() {
        var empty = [], rr, cc, i;
        for (rr = 0; rr < HEX_N; rr++) { for (cc = 0; cc < HEX_N; cc++) { if (!b[rr][cc]) { empty.push([rr, cc]); } } }
        for (i = 0; i < empty.length; i++) {
          b[empty[i][0]][empty[i][1]] = 2;
          var wins = hexWon(b, 2);
          b[empty[i][0]][empty[i][1]] = 0;
          if (wins) { return empty[i]; }
        }
        for (i = 0; i < empty.length; i++) {
          b[empty[i][0]][empty[i][1]] = 1;
          var stops = hexWon(b, 1);
          b[empty[i][0]][empty[i][1]] = 0;
          if (stops) { return empty[i]; }
        }
        var best = empty[0], bestScore = -1;
        for (i = 0; i < empty.length; i++) {
          var score = 0;
          for (var t = 0; t < 12; t++) {
            b[empty[i][0]][empty[i][1]] = 2;
            var res = hexPlayout(b, 1);
            b[empty[i][0]][empty[i][1]] = 0;
            if (res !== 1) { score++; }
          }
          if (score > bestScore) { bestScore = score; best = empty[i]; }
        }
        return best;
      }

      function maybeCpu() {
        if (dead || over || api.mode !== 'cpu' || turn !== 2) { return; }
        api.setStatus('🤖 ' + api.names[1] + ' is thinking…');
        K.delay(320, function () {
          if (dead || over) { return; }
          var mv = aiMove();
          if (!mv) { return; }
          b[mv[0]][mv[1]] = 2;
          if (hexWon(b, 2)) {
            over = true; render(); api.confetti(140);
            api.finish('🏆 ' + api.names[1] + ' wins!');
            return;
          }
          turn = 1;
          render();
        });
      }

      function render() {
        K.each(board, function (cell, rr, cc) {
          cell.className = 'gk-cell gk-hex-cell' + (b[rr][cc] === 1 ? ' gk-hex-p1' : (b[rr][cc] === 2 ? ' gk-hex-p2' : ''));
          cell.style.marginLeft = (rr * 7) + 'px';
          cell.textContent = b[rr][cc] === 1 ? '⬤' : (b[rr][cc] === 2 ? '⭕' : '');
        });
        if (!over) {
          api.setStatus('👤 ' + api.names[turn - 1] + ' — place your hex' +
            (turn === 1 ? ' (join ⬆️ to ⬇️)' : ' (join ⬅️ to ➡️)'));
        }
      }

      render();
      maybeCpu();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Nine Men's Morris
     ===================================================== */
  var MM_RINGS = [
    [[0, 0], [0, 3], [0, 6], [3, 6], [6, 6], [6, 3], [6, 0], [3, 0]],
    [[1, 1], [1, 3], [1, 5], [3, 5], [5, 5], [5, 3], [5, 1], [3, 1]],
    [[2, 2], [2, 3], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [3, 2]]
  ];
  var MM_POINTS = [], MM_INDEX = {}, MM_ADJ = [], MM_MILLS = [];
  MM_RINGS.forEach(function (ring, ri) {
    ring.forEach(function (pt, pi) {
      MM_INDEX[pt[0] + ',' + pt[1]] = MM_POINTS.length;
      MM_POINTS.push({ r: pt[0], c: pt[1], ring: ri, pos: pi });
      MM_ADJ.push([]);
    });
  });
  MM_POINTS.forEach(function (pt, i) {
    var a = MM_INDEX[pt.r + ',' + pt.c], ring = MM_RINGS[pt.ring];
    MM_ADJ[a].push(MM_INDEX[ring[(pt.pos + 7) % 8].join(',')]);
    MM_ADJ[a].push(MM_INDEX[ring[(pt.pos + 1) % 8].join(',')]);
    if (pt.pos % 2 === 1) {
      if (pt.ring > 0) { MM_ADJ[a].push(MM_INDEX[MM_RINGS[pt.ring - 1][pt.pos].join(',')]); }
      if (pt.ring < 2) { MM_ADJ[a].push(MM_INDEX[MM_RINGS[pt.ring + 1][pt.pos].join(',')]); }
    }
  });
  MM_RINGS.forEach(function (ring) {
    [0, 2, 4, 6].forEach(function (start) {
      MM_MILLS.push([start, (start + 1) % 8, (start + 2) % 8].map(function (p) { return MM_INDEX[ring[p].join(',')]; }));
    });
  });
  [1, 3, 5, 7].forEach(function (p) {
    MM_MILLS.push([0, 1, 2].map(function (ring) { return MM_INDEX[MM_RINGS[ring][p].join(',')]; }));
  });

  function mmStart() { return { board: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], toPlace: [9, 9], side: 1 }; }
  function mmCount(b, p) { var n = 0; for (var i = 0; i < 24; i++) { if (b[i] === p) { n++; } } return n; }
  function mmInMill(b, idx, p) {
    for (var i = 0; i < MM_MILLS.length; i++) {
      var m = MM_MILLS[i];
      if (m.indexOf(idx) >= 0 && b[m[0]] === p && b[m[1]] === p && b[m[2]] === p) { return true; }
    }
    return false;
  }
  function mmRemovable(b, p) {
    var out = [], i;
    for (i = 0; i < 24; i++) { if (b[i] === 3 - p) { out.push(i); } }
    var free = out.filter(function (idx) { return !mmInMill(b, idx, 3 - p); });
    return free.length ? free : out;
  }
  function mmMoves(st) {
    var b = st.board, p = st.side, out = [], i, j, adj;
    if (st.toPlace[p - 1] > 0) {
      for (i = 0; i < 24; i++) { if (!b[i]) { out.push({ type: 'place', to: i }); } }
      return out;
    }
    var flying = mmCount(b, p) === 3;
    for (i = 0; i < 24; i++) {
      if (b[i] !== p) { continue; }
      adj = flying ? null : MM_ADJ[i];
      if (flying) {
        for (j = 0; j < 24; j++) { if (!b[j]) { out.push({ type: 'move', from: i, to: j }); } }
      } else {
        for (j = 0; j < adj.length; j++) { if (!b[adj[j]]) { out.push({ type: 'move', from: i, to: adj[j] }); } }
      }
    }
    return out;
  }
  function mmApply(st, move) {
    var n = { board: st.board.slice(), toPlace: st.toPlace.slice(), side: st.side };
    if (move.type === 'place') { n.board[move.to] = n.side; n.toPlace[n.side - 1]--; }
    else if (move.type === 'move') { n.board[move.to] = n.side; n.board[move.from] = 0; }
    n.side = 3 - n.side;
    return n;
  }
  /* removal happens after the move and must NOT pass the turn again */
  function mmRemove(st, idx) {
    var n = { board: st.board.slice(), toPlace: st.toPlace.slice(), side: st.side };
    n.board[idx] = 0;
    return n;
  }
  function mmLost(st, p) {
    if (st.toPlace[p - 1] === 0 && mmCount(st.board, p) < 3) { return true; }
    return mmMoves({ board: st.board, toPlace: st.toPlace, side: p }).length === 0;
  }

  K.register({
    id: 'morris',
    name: "Nine Men's Morris",
    emoji: '🔷',
    tag: 'Board',
    blurb: 'Build lines of three and steal your rival’s pieces.',
    howTo: 'Place all nine pieces first, then slide them along the lines to a free spot. Make a line of three — a mill — to remove an opponent piece. Leave your rival with fewer than three pieces or no moves to win.',
    logic: { start: mmStart, moves: mmMoves, apply: mmApply, remove: mmRemove, removable: mmRemovable, lost: mmLost, points: MM_POINTS, adj: MM_ADJ, mills: MM_MILLS },
    mount: function (root, api) {
      var st = mmStart(), selected = null, over = false, dead = false, pending = false;
      api.onDestroy(function () { dead = true; });

      var board = h('div', { class: 'gk-morris' });
      for (var ring = 0; ring < 3; ring++) {
        var inset = 6 + ring * 14.6;
        board.appendChild(h('div', {
          class: 'gk-mring',
          style: {
            left: inset + '%', top: inset + '%',
            width: (100 - inset * 2) + '%', height: (100 - inset * 2) + '%'
          }
        }));
      }
      var points = MM_POINTS.map(function (pt, i) {
        var node = h('button', {
          class: 'gk-mpoint', type: 'button', 'data-i': i,
          style: { left: (6 + pt.c * 14.6) + '%', top: (6 + pt.r * 14.6) + '%' },
          onclick: function () { tap(i); }
        });
        board.appendChild(node);
        return node;
      });
      root.appendChild(board);

      function canAct() { return !over && !(api.mode === 'cpu' && st.side === 2); }

      function winnerIndex(loserSide) { return (3 - loserSide) - 1; }

      function finishIfLost() {
        if (!mmLost(st, st.side)) { return false; }
        over = true;
        render();
        api.confetti(140);
        api.finish('🏆 ' + api.names[winnerIndex(st.side)] + ' wins!');
        return true;
      }

      function tap(i) {
        if (!canAct()) { return; }
        if (pending) {
          if (mmRemovable(st.board, st.side).indexOf(i) >= 0) {
            st = mmRemove(st, i);
            pending = false;
            render();
            if (!finishIfLost()) { maybeCpu(); }
            return;
          }
          api.setStatus('🚫 That piece is safe inside a mill — tap a glowing piece.');
          return;
        }
        if (st.toPlace[st.side - 1] > 0) {
          if (st.board[i]) { return; }
          commit({ type: 'place', to: i });
          return;
        }
        if (st.board[i] === st.side) { selected = i; render(); return; }
        for (var m = 0; m < MM_ADJ[selected || 0].length; m++) {
          if (selected !== null && MM_ADJ[selected][m] === i && !st.board[i]) { commit({ type: 'move', from: selected, to: i }); return; }
        }
        if (selected !== null && mmCount(st.board, st.side) === 3 && !st.board[i]) { commit({ type: 'move', from: selected, to: i }); return; }
        selected = null;
        render();
      }

      function commit(move) {
        var mover = st.side;
        st = mmApply(st, move);
        selected = null;
        if (mmInMill(st.board, move.to, mover)) {
          var targets = mmRemovable(st.board, mover);
          if (targets.length) {
            pending = true;
            render();
            api.setStatus('🎯 A mill! Tap a glowing opponent piece to remove it.');
            return;
          }
        }
        render();
        if (!finishIfLost()) { maybeCpu(); }
      }

      function aiChoose() {
        var moves = mmMoves(st);
        if (!moves.length) { return null; }
        var best = moves[0], bestScore = -Infinity;
        for (var i = 0; i < moves.length; i++) {
          var n = mmApply(st, moves[i]);
          var score = 0;
          if (mmInMill(n.board, moves[i].to, 2)) { score += 45; }
          if (st.toPlace[1] > 0) { score += MM_ADJ[moves[i].to].length * 1.5; }
          else { score += MM_ADJ[moves[i].to].length * 0.6; }
          if (n.toPlace[1] === 0 && mmCount(n.board, 2) < 3) { score -= 500; }
          score += Math.random() * 2;
          if (score > bestScore) { bestScore = score; best = moves[i]; }
        }
        return best;
      }

      function maybeCpu() {
        if (dead || over || api.mode !== 'cpu' || st.side === 1) { return; }
        api.setStatus('🤖 ' + api.names[1] + ' is thinking…');
        K.delay(520, function () {
          if (dead || over) { return; }
          var move = aiChoose();
          if (!move) { finishIfLost(); return; }
          var mill = mmInMill(mmApply(st, move).board, move.to, 2);
          st = mmApply(st, move);
          selected = null;
          if (mill) {
            var targets = mmRemovable(st.board, 2);
            if (targets.length) { st = mmRemove(st, K.pick(targets)); }
          }
          render();
          if (!finishIfLost()) { maybeCpu(); }
        });
      }

      function render() {
        var targets = pending ? mmRemovable(st.board, st.side) : [];
        points.forEach(function (node, i) {
          var v = st.board[i], cls = 'gk-mpoint';
          if (v === 1) { cls += ' gk-mp1'; }
          if (v === 2) { cls += ' gk-mp2'; }
          if (selected === i) { cls += ' gk-selected'; }
          if (targets.indexOf(i) >= 0) { cls += ' gk-mp-take'; }
          if (!v && canAct() && st.toPlace[st.side - 1] > 0) { cls += ' gk-mp-open'; }
          node.className = cls;
        });
        if (!over && !pending) {
          var stage = st.toPlace[st.side - 1] > 0 ? (st.toPlace[st.side - 1] + ' pieces still to place') : 'slide a piece along a line';
          api.setStatus('👤 ' + api.names[st.side - 1] + ' — ' + stage + '.');
        }
      }

      render();
      maybeCpu();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Battleship — 6x6 sea, ships of 3, 2, 2 and 1
     ===================================================== */
  var BS_N = 6;
  var BS_SHIPS = [3, 2, 2, 1];
  var BS_CELLS = 8; /* 3 + 2 + 2 + 1 */

  function bsRandom() {
    var grid = [], r, c;
    for (r = 0; r < BS_N; r++) { grid.push([]); for (c = 0; c < BS_N; c++) { grid[r].push(0); } }
    BS_SHIPS.forEach(function (size) {
      for (var guard = 0; guard < 300; guard++) {
        var horiz = Math.random() < 0.5, rr = K.randInt(BS_N), cc = K.randInt(BS_N), fits = true, i;
        for (i = 0; i < size; i++) {
          var r2 = horiz ? rr : rr + i, c2 = horiz ? cc + i : cc;
          if (!inner(r2, c2, BS_N) || grid[r2][c2]) { fits = false; break; }
        }
        if (!fits) { continue; }
        for (i = 0; i < size; i++) {
          var r3 = horiz ? rr : rr + i, c3 = horiz ? cc + i : cc;
          grid[r3][c3] = 1;
        }
        break;
      }
    });
    return grid;
  }
  function bsCellCount(grid) {
    var n = 0;
    for (var r = 0; r < BS_N; r++) { for (var c = 0; c < BS_N; c++) { if (grid[r][c]) { n++; } } }
    return n;
  }
  function bsSunk(grid, shots) {
    var seen = {}, done = 0, total = 0, r, c;
    for (r = 0; r < BS_N; r++) {
      for (c = 0; c < BS_N; c++) {
        if (grid[r][c] !== 1 || seen[r + ',' + c]) { continue; }
        var stack = [[r, c]], allHit = true;
        while (stack.length) {
          var cur = stack.pop(), key = cur[0] + ',' + cur[1];
          if (seen[key]) { continue; }
          seen[key] = true;
          if (grid[cur[0]][cur[1]] !== 1) { continue; }
          if (!shots[cur[0] * BS_N + cur[1]]) { allHit = false; }
          [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (d) {
            var rr = cur[0] + d[0], cc = cur[1] + d[1];
            if (inner(rr, cc, BS_N)) { stack.push([rr, cc]); }
          });
        }
        total++;
        if (allHit) { done++; }
      }
    }
    return { sunk: done, ships: total };
  }

  K.register({
    id: 'battleship',
    name: 'Battleship',
    emoji: '🚢',
    tag: 'Board',
    blurb: 'Hide your fleet on the sea, then hunt down your rival’s ships.',
    howTo: 'Each player hides ships of 3, 2, 2 and 1 squares on a 6×6 sea. Tap a square to fire: 💥 is a hit, 💦 is a splash. Sink all 8 ship squares of the enemy fleet before yours goes down. Two-player mode passes the device between turns.',
    logic: { random: bsRandom, ships: BS_SHIPS, size: BS_N, cells: BS_CELLS, sunk: bsSunk, count: bsCellCount },
    mount: function (root, api) {
      var fleets = [bsRandom(), bsRandom()];
      var shots = [new Array(36).fill(false), new Array(36).fill(false)];
      var turn = 0, over = false, dead = false, hunt = [], revealed = false;
      api.onDestroy(function () { dead = true; });

      var title = h('div', { class: 'gk-scoreline' });
      var sub = h('div', { class: 'gk-hint' });
      var board = K.grid(BS_N, BS_N, { className: 'gk-bs', onCell: function (r, c) { fire(r, c); } });
      root.appendChild(title);
      root.appendChild(board.root);
      root.appendChild(sub);

      function targetFleet() { return 1 - turn; }
      function enemyShots() { return shots[turn]; }

      function left(p) {
        var n = 0, i;
        for (i = 0; i < 36; i++) {
          if (fleets[p][Math.floor(i / BS_N)][i % BS_N] === 1 && !shots[1 - p][i]) { n++; }
        }
        return n;
      }

      function fire(r, c) {
        if (over || (api.mode === 'cpu' && turn !== 0)) { return; }
        var t = targetFleet(), i = r * BS_N + c;
        if (shots[turn][i]) { api.setStatus('💦 You already fired there.'); return; }
        shots[turn][i] = true;
        var hit = fleets[t][r][c] === 1;
        render();
        if (left(t) === 0) { win(turn); return; }
        api.setStatus(hit ? '💥 Direct hit!' : '💦 Splash — a miss.');
        if (api.mode === 'cpu') {
          K.delay(700, function () { if (!dead && !over) { cpuFire(); } });
        } else {
          K.delay(500, function () { if (!dead && !over) { swapPlayers(); } });
        }
      }

      function win(p) {
        over = true;
        revealed = true;
        render();
        api.confetti(150);
        api.finish('🏆 ' + api.names[p] + ' sank the whole fleet — winner!');
      }

      function cpuFire() {
        if (dead || over) { return; }
        var i, choice = -1;
        while (hunt.length) {
          var cand = hunt.pop();
          if (!shots[1][cand]) { choice = cand; break; }
        }
        if (choice < 0) {
          var open = [];
          for (i = 0; i < 36; i++) { if (!shots[1][i]) { open.push(i); } }
          choice = K.pick(open);
        }
        var r = Math.floor(choice / BS_N), c = choice % BS_N;
        shots[1][choice] = true;
        var hit = fleets[0][r][c] === 1;
        if (hit) {
          [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (d) {
            var rr = r + d[0], cc = c + d[1];
            if (inner(rr, cc, BS_N) && !shots[1][rr * BS_N + cc]) { hunt.push(rr * BS_N + cc); }
          });
        }
        render();
        if (left(0) === 0) { win(1); return; }
        api.setStatus(hit ? '💥 The computer hit your ship at ' + cellName(r, c) + '!' : '💦 The computer missed at ' + cellName(r, c) + '.');
        turn = 0;
        render();
      }

      function swapPlayers() {
        turn = 1 - turn;
        render();
        K.cover(root, '🔄 Pass the device', api.names[turn] + ' up next — no peeking at the other fleet!', api.names[turn] + ' is ready', function () {
          render();
        });
      }

      function cellName(r, c) { return String.fromCharCode(65 + c) + (r + 1); }

      function render() {
        var myShots = enemyShots(), t = targetFleet();
        K.each(board, function (cell, r, c) {
          var i = r * BS_N + c, fired = myShots[i];
          var hit = fired && fleets[t][r][c] === 1;
          var mineHit = api.mode === 'cpu' && fleets[0][r][c] === 1 && shots[1][i];
          var cls = 'gk-cell gk-bs-cell';
          if (fired) { cls += hit ? ' gk-boom' : ' gk-splash'; }
          if (mineHit) { cls += ' gk-mine-hit'; }
          if (revealed && fleets[t][r][c] === 1) { cls += ' gk-ship'; }
          cell.className = cls;
          cell.textContent = fired ? (hit ? '💥' : '💦') : (revealed && fleets[t][r][c] === 1 ? '🚢' : '');
        });
        var sunkInfo = bsSunk(fleets[t], myShots);
        title.textContent = '🚢 Enemy fleet: ' + left(t) + ' of ' + BS_CELLS + ' squares left · ' +
          sunkInfo.sunk + ' of ' + sunkInfo.ships + ' ships sunk';
        sub.textContent = api.mode === 'cpu'
          ? '🛡️ Your fleet: ' + left(0) + ' of ' + BS_CELLS + ' squares left'
          : '🎯 ' + api.names[turn] + ', it is your turn to fire.';
        if (!over && api.mode === 'cpu' && turn === 0) {
          api.setStatus('👤 ' + api.names[0] + ' — tap a square to fire.');
        }
      }

      render();
      return { destroy: function () { dead = true; } };
    }
  });
})();
