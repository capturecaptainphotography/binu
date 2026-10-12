/* Quick games, part 1: tic-tac-toe, connect four, dots & boxes,
   nim, snakes & ladders, rock-paper-scissors.
   Every game supports mode 'two' (two players, one screen) and
   mode 'cpu' (you against the computer). */
(function () {
  'use strict';

  var K = window.GameKit;
  var h = K.h;

  /* =====================================================
     Tic-Tac-Toe
     ===================================================== */
  var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

  function tttLine(b) {
    for (var i = 0; i < LINES.length; i++) {
      var L = LINES[i];
      if (b[L[0]] && b[L[0]] === b[L[1]] && b[L[1]] === b[L[2]]) { return L; }
    }
    return null;
  }
  function tttFull(b) { for (var i = 0; i < 9; i++) { if (!b[i]) { return false; } } return true; }

  function tttScore(b, me, depth) {
    var line = tttLine(b);
    if (line) { return b[line[0]] === me ? 10 - depth : depth - 10; }
    if (tttFull(b)) { return 0; }
    return null;
  }

  function tttBest(b, me, other) {
    var bestScore = -99, bestMove = -1;
    for (var i = 0; i < 9; i++) {
      if (b[i]) { continue; }
      b[i] = me;
      var s = tttMin(b, me, other, 1);
      b[i] = null;
      if (s > bestScore) { bestScore = s; bestMove = i; }
    }
    return bestMove;
  }
  function tttMax(b, me, other, depth) {
    var done = tttScore(b, me, depth);
    if (done !== null) { return done; }
    var best = -99;
    for (var i = 0; i < 9; i++) {
      if (b[i]) { continue; }
      b[i] = me;
      best = Math.max(best, tttMin(b, me, other, depth + 1));
      b[i] = null;
    }
    return best;
  }
  function tttMin(b, me, other, depth) {
    var done = tttScore(b, me, depth);
    if (done !== null) { return done; }
    var best = 99;
    for (var i = 0; i < 9; i++) {
      if (b[i]) { continue; }
      b[i] = other;
      best = Math.min(best, tttMax(b, me, other, depth + 1));
      b[i] = null;
    }
    return best;
  }

  K.register({
    id: 'ticTacToe',
    name: 'Tic-Tac-Toe',
    emoji: '⭕',
    tag: 'Quick',
    blurb: 'Three in a row wins. Tiny board, sneaky thinking.',
    howTo: 'Tap any square on your turn. Line up three of your marks in a row, column or diagonal to win.',
    logic: { winner: tttLine, full: tttFull, best: tttBest, lines: LINES },
    mount: function (root, api) {
      var marks = ['X', 'O'];
      var b = [null, null, null, null, null, null, null, null, null];
      var turn = 0, over = false, dead = false, winLine = null;
      api.onDestroy(function () { dead = true; });

      var board = K.grid(3, 3, { className: 'gk-ttt', onCell: function (r, c) { tap(r * 3 + c); } });
      root.appendChild(board.root);

      function tap(i) {
        if (over || b[i] || (api.mode === 'cpu' && turn === api.cpuIndex)) { return; }
        b[i] = marks[turn];
        winLine = tttLine(b);
        if (winLine) { over = true; render(); api.confetti(90); api.finish('🎉 ' + api.names[turn] + ' wins with three in a row!'); return; }
        if (tttFull(b)) { over = true; render(); api.finish('🤝 It is a draw — nobody wins this one.'); return; }
        turn = 1 - turn;
        render();
        maybeCpu();
      }

      function maybeCpu() {
        if (dead || over || turn !== api.cpuIndex) { return; }
        api.setStatus('🤖 ' + api.names[1] + ' is thinking…');
        K.delay(420, function () {
          if (dead || over) { return; }
          var move = tttBest(b, marks[api.cpuIndex], marks[1 - api.cpuIndex]);
          tap(move < 0 ? b.indexOf(null) : move);
        });
      }

      function render() {
        for (var i = 0; i < 9; i++) {
          var cell = board.at(Math.floor(i / 3), i % 3);
          cell.textContent = b[i] || '';
          cell.className = 'gk-cell gk-ttt-cell' + (b[i] ? ' gk-' + b[i] : '') +
            (winLine && winLine.indexOf(i) >= 0 ? ' gk-win' : '');
        }
        if (!over) { api.setStatus('👤 ' + api.names[turn] + ' — your turn (' + marks[turn] + ')'); }
      }

      render();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Connect Four
     ===================================================== */
  function c4New() {
    var g = [];
    for (var r = 0; r < 6; r++) { g.push([null, null, null, null, null, null, null]); }
    return g;
  }
  function c4Drop(g, col, p) {
    for (var r = 5; r >= 0; r--) { if (!g[r][col]) { g[r][col] = p; return r; } }
    return -1;
  }
  function c4Won(g, r, c, p) {
    var dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (var d = 0; d < 4; d++) {
      var count = 1;
      for (var s = -1; s <= 1; s += 2) {
        var rr = r + dirs[d][0] * s, cc = c + dirs[d][1] * s;
        while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && g[rr][cc] === p) { count++; rr += dirs[d][0] * s; cc += dirs[d][1] * s; }
      }
      if (count >= 4) { return true; }
    }
    return false;
  }
  function c4Full(g) { for (var c = 0; c < 7; c++) { if (!g[0][c]) { return false; } } return true; }
  function c4Eval(g, me, other) {
    var score = 0, windows = [];
    for (var r = 0; r < 6; r++) { for (var c = 0; c < 7; c++) {
      if (c <= 3) { windows.push([[r, c], [r, c + 1], [r, c + 2], [r, c + 3]]); }
      if (r <= 2) { windows.push([[r, c], [r + 1, c], [r + 2, c], [r + 3, c]]); }
      if (r <= 2 && c <= 3) { windows.push([[r, c], [r + 1, c + 1], [r + 2, c + 2], [r + 3, c + 3]]); }
      if (r <= 2 && c >= 3) { windows.push([[r, c], [r + 1, c - 1], [r + 2, c - 2], [r + 3, c - 3]]); }
    } }
    windows.forEach(function (w) {
      var mine = 0, theirs = 0;
      w.forEach(function (cell) {
        if (g[cell[0]][cell[1]] === me) { mine++; }
        else if (g[cell[0]][cell[1]] === other) { theirs++; }
      });
      if (mine && theirs) { return; }
      if (mine === 3) { score += 50; } else if (mine === 2) { score += 8; }
      if (theirs === 3) { score -= 60; } else if (theirs === 2) { score -= 10; }
    });
    return score;
  }
  function c4Search(g, depth, player, me, alpha, beta) {
    if (depth === 0) { return c4Eval(g, me, me === 'A' ? 'B' : 'A'); }
    var other = player === 'A' ? 'B' : 'A';
    var order = [3, 2, 4, 1, 5, 0, 6];
    var best = player === me ? -Infinity : Infinity;
    for (var i = 0; i < order.length; i++) {
      var col = order[i], copy = g.map(function (row) { return row.slice(); });
      var r = c4Drop(copy, col, player);
      if (r < 0) { continue; }
      var sc;
      if (c4Won(copy, r, col, player)) { sc = player === me ? 10000 + depth : -(10000 + depth); }
      else { sc = c4Search(copy, depth - 1, other, me, alpha, beta); }
      if (player === me) { if (sc > best) { best = sc; } if (best > alpha) { alpha = best; } }
      else { if (sc < best) { best = sc; } if (best < beta) { beta = best; } }
      if (alpha >= beta) { break; }
    }
    return best === Infinity || best === -Infinity ? 0 : best;
  }

  K.register({
    id: 'connectFour',
    name: 'Connect Four',
    emoji: '🔴',
    tag: 'Quick',
    blurb: 'Drop your discs and sneak four in a row.',
    howTo: 'Tap a column to drop your disc into the lowest empty space. Get four of your colour in a row — sideways, up, down or diagonal.',
    logic: { newBoard: c4New, drop: c4Drop, won: c4Won, full: c4Full },
    mount: function (root, api) {
      var g = c4New();
      var turn = 0, over = false, dead = false;
      var names = ['A', 'B'];
      api.onDestroy(function () { dead = true; });

      var board = K.grid(7, 6, { className: 'gk-c4', onCell: function (r, c) { play(c); } });
      root.appendChild(board.root);

      function play(col) {
        if (over || (api.mode === 'cpu' && turn === api.cpuIndex)) { return; }
        var r = c4Drop(g, col, names[turn]);
        if (r < 0) { return; }
        if (c4Won(g, r, col, names[turn])) {
          over = true; render();
          api.confetti(90);
          api.finish('🎉 ' + api.names[turn] + ' connects four and wins!');
          return;
        }
        if (c4Full(g)) { over = true; render(); api.finish('🤝 The board is full — it is a draw.'); return; }
        turn = 1 - turn;
        render();
        maybeCpu();
      }

      function maybeCpu() {
        if (dead || over || turn !== api.cpuIndex) { return; }
        api.setStatus('🤖 ' + api.names[1] + ' is thinking…');
        K.delay(450, function () {
          if (dead || over) { return; }
          var me = names[api.cpuIndex], other = names[1 - api.cpuIndex];
          var bestScore = -Infinity, bestCol = 3, order = [3, 2, 4, 1, 5, 0, 6];
          for (var i = 0; i < order.length; i++) {
            var col = order[i], copy = g.map(function (row) { return row.slice(); });
            var r = c4Drop(copy, col, me);
            if (r < 0) { continue; }
            var sc = c4Won(copy, r, col, me) ? 100000 : c4Search(copy, 4, other, me, -Infinity, Infinity);
            if (sc > bestScore) { bestScore = sc; bestCol = col; }
          }
          play(bestCol);
        });
      }

      function render() {
        K.each(board, function (cell, r, c) {
          cell.textContent = g[r][c] === 'A' ? '🔴' : (g[r][c] === 'B' ? '🟡' : '');
          cell.className = 'gk-cell gk-c4-cell' + (g[r][c] === 'A' ? ' gk-p1' : (g[r][c] === 'B' ? ' gk-p2' : ''));
        });
        if (!over) { api.setStatus('👤 ' + api.names[turn] + ' — tap a column to drop your disc.'); }
      }

      render();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Dots & Boxes
     ===================================================== */
  var DB_N = 4; /* 4 x 4 boxes, 5 x 5 dots */
  function dbNew() {
    var st = { h: [], v: [], box: [] }, i, j;
    for (i = 0; i <= DB_N; i++) { st.h.push([]); for (j = 0; j < DB_N; j++) { st.h[i].push(null); } }
    for (i = 0; i < DB_N; i++) { st.v.push([]); for (j = 0; j <= DB_N; j++) { st.v[i].push(null); } }
    for (i = 0; i < DB_N; i++) { st.box.push([]); for (j = 0; j < DB_N; j++) { st.box[i].push(null); } }
    return st;
  }
  function dbBoxDone(st, r, c) {
    return st.h[r][c] && st.h[r + 1][c] && st.v[r][c] && st.v[r][c + 1];
  }
  function dbClaim(st, move, owner) {
    if (move.t === 'h') { st.h[move.r][move.c] = owner; } else { st.v[move.r][move.c] = owner; }
    var done = 0, i;
    var boxes = move.t === 'h'
      ? [[move.r - 1, move.c], [move.r, move.c]]
      : [[move.r, move.c - 1], [move.r, move.c]];
    for (i = 0; i < boxes.length; i++) {
      var br = boxes[i][0], bc = boxes[i][1];
      if (br < 0 || br >= DB_N || bc < 0 || bc >= DB_N) { continue; }
      if (!st.box[br][bc] && dbBoxDone(st, br, bc)) { st.box[br][bc] = owner; done++; }
    }
    return done;
  }
  function dbMoves(st) {
    var list = [];
    for (var r = 0; r <= DB_N; r++) { for (var c = 0; c < DB_N; c++) { if (!st.h[r][c]) { list.push({ t: 'h', r: r, c: c }); } } }
    for (r = 0; r < DB_N; r++) { for (c = 0; c <= DB_N; c++) { if (!st.v[r][c]) { list.push({ t: 'v', r: r, c: c }); } } }
    return list;
  }
  function dbCount(st) {
    var n = 0;
    for (var r = 0; r < DB_N; r++) { for (var c = 0; c < DB_N; c++) { if (st.box[r][c]) { n++; } } }
    return n;
  }
  function dbClone(st) {
    var copy = dbNew(), r, c;
    for (r = 0; r <= DB_N; r++) { for (c = 0; c < DB_N; c++) { copy.h[r][c] = st.h[r][c]; } }
    for (r = 0; r < DB_N; r++) { for (c = 0; c <= DB_N; c++) { copy.v[r][c] = st.v[r][c]; } }
    for (r = 0; r < DB_N; r++) { for (c = 0; c < DB_N; c++) { copy.box[r][c] = st.box[r][c]; } }
    return copy;
  }
  /* boxes left with exactly three sides drawn = a free present for the opponent */
  function dbRisky(st) {
    var risky = 0;
    for (var r = 0; r < DB_N; r++) {
      for (var c = 0; c < DB_N; c++) {
        if (st.box[r][c]) { continue; }
        var sides = (st.h[r][c] ? 1 : 0) + (st.h[r + 1][c] ? 1 : 0) + (st.v[r][c] ? 1 : 0) + (st.v[r][c + 1] ? 1 : 0);
        if (sides === 3) { risky++; }
      }
    }
    return risky;
  }

  K.register({
    id: 'dotsBoxes',
    name: 'Dots & Boxes',
    emoji: '🟦',
    tag: 'Quick',
    blurb: 'Join the dots, close the boxes, collect the most squares.',
    howTo: 'Tap a line between two dots to draw it. Close a box to score it and get another turn straight away. Most boxes at the end wins.',
    logic: { newState: dbNew, claim: dbClaim, moves: dbMoves, count: dbCount, boxDone: dbBoxDone },
    mount: function (root, api) {
      var st = dbNew();
      var turn = 0, over = false, dead = false, scores = [0, 0];
      api.onDestroy(function () { dead = true; });

      var board = K.grid(DB_N * 2 + 1, DB_N * 2 + 1, { className: 'gk-db', onCell: onCell });
      root.appendChild(board.root);

      function onCell(gr, gc) {
        if (over || (api.mode === 'cpu' && turn === api.cpuIndex)) { return; }
        if (gr % 2 === 0 && gc % 2 === 0) { return; }
        if (gr % 2 === 1 && gc % 2 === 1) { return; }
        var move = (gr % 2 === 0) ? { t: 'h', r: gr / 2, c: (gc - 1) / 2 } : { t: 'v', r: (gr - 1) / 2, c: gc / 2 };
        var owner = 'P' + (turn + 1);
        if (move.t === 'h' ? st.h[move.r][move.c] : st.v[move.r][move.c]) { return; }
        var made = dbClaim(st, move, owner);
        scores[turn] += made;
        if (made === 0) { turn = 1 - turn; }
        render();
        if (dbCount(st) === DB_N * DB_N) { gameOver(); return; }
        if (made > 0) { api.setStatus('🎁 ' + api.names[turn] + ' closed a box — go again!'); maybeCpu(); return; }
        maybeCpu();
      }

      function gameOver() {
        over = true;
        render();
        api.confetti(120);
        if (scores[0] === scores[1]) { api.finish('🤝 All 16 boxes closed — it is a ' + scores[0] + '–' + scores[1] + ' draw.'); }
        else {
          var w = scores[0] > scores[1] ? 0 : 1;
          api.finish('🎉 ' + api.names[w] + ' wins ' + scores[0] + '–' + scores[1] + '!');
        }
      }

      function aiMove() {
        var moves = dbMoves(st), owner = 'P' + (turn + 1), i;
        var take = [], safe = [], risky = [];
        for (i = 0; i < moves.length; i++) {
          var test = dbClone(st);
          var made = dbClaim(test, moves[i], owner);
          if (made > 0) { take.push({ m: moves[i], n: made }); }
          else if (dbRisky(test) === 0) { safe.push(moves[i]); }
          else { risky.push({ m: moves[i], g: dbRisky(test) }); }
        }
        if (take.length) {
          take.sort(function (a, b) { return b.n - a.n; });
          return take[0].m;
        }
        if (safe.length) { return K.pick(safe); }
        risky.sort(function (a, b) { return a.g - b.g; });
        return risky.length ? risky[0].m : K.pick(moves);
      }

      function maybeCpu() {
        if (dead || over || turn !== api.cpuIndex) { return; }
        api.setStatus('🤖 ' + api.names[1] + ' is thinking…');
        K.delay(500, function () {
          if (dead || over) { return; }
          var move = aiMove();
          var owner = 'P' + (turn + 1);
          var made = dbClaim(st, move, owner);
          scores[turn] += made;
          if (made === 0) { turn = 1 - turn; }
          render();
          if (dbCount(st) === DB_N * DB_N) { gameOver(); return; }
          maybeCpu();
        });
      }

      function render() {
        K.each(board, function (cell, gr, gc) {
          var cls = 'gk-cell gk-db-cell', text = '', own = null;
          if (gr % 2 === 0 && gc % 2 === 0) { cls += ' gk-dot'; }
          else if (gr % 2 === 0) { own = st.h[gr / 2][(gc - 1) / 2]; cls += ' gk-hline' + (own ? ' gk-own-' + own : ''); }
          else if (gc % 2 === 0) { own = st.v[(gr - 1) / 2][gc / 2]; cls += ' gk-vline' + (own ? ' gk-own-' + own : ''); }
          else {
            var o = st.box[(gr - 1) / 2][(gc - 1) / 2];
            cls += ' gk-box' + (o ? ' gk-own-' + o : '');
            text = o ? (o === 'P1' ? '1' : '2') : '';
          }
          cell.className = cls;
          cell.textContent = text;
        });
        if (!over) {
          api.setStatus('👤 ' + api.names[turn] + ' — draw a line.  Score ' + scores[0] + '–' + scores[1]);
        }
      }

      render();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Nim
     ===================================================== */
  K.register({
    id: 'nim',
    name: 'Nim',
    emoji: '🪵',
    tag: 'Quick',
    blurb: 'Take stones from a pile. Take the very last stone to win.',
    howTo: 'On your turn, take any number of stones from one pile only. Whoever takes the last stone of all wins.',
    logic: { nimSum: function (p) { return p.reduce(function (a, b) { return a ^ b; }, 0); } },
    mount: function (root, api) {
      var piles = [7, 5, 3];
      var turn = 0, over = false, dead = false;
      api.onDestroy(function () { dead = true; });
      var rack = h('div', { class: 'gk-rack' });
      root.appendChild(rack);

      function take(pi, n) {
        if (over || n > piles[pi] || (api.mode === 'cpu' && turn === api.cpuIndex)) { return; }
        piles[pi] -= n;
        var left = piles[0] + piles[1] + piles[2];
        if (left === 0) {
          over = true; render(); api.confetti(90);
          api.finish('🎉 ' + api.names[turn] + ' took the last stone and wins!');
          return;
        }
        turn = 1 - turn;
        render();
        maybeCpu();
      }

      function aiTake() {
        var x = piles.reduce(function (a, b) { return a ^ b; }, 0), pi = -1, n = 0;
        for (var i = 0; i < piles.length; i++) {
          var want = piles[i] ^ x;
          if (want < piles[i]) { pi = i; n = piles[i] - want; break; }
        }
        if (pi < 0) { /* losing position: take one from the biggest pile */ 
          pi = piles.indexOf(Math.max.apply(null, piles));
          n = 1;
        }
        take(pi, n);
      }

      function maybeCpu() {
        if (dead || over || turn !== api.cpuIndex) { return; }
        api.setStatus('🤖 ' + api.names[1] + ' is thinking…');
        K.delay(520, function () { if (!dead && !over) { aiTake(); } });
      }

      function render() {
        while (rack.children.length) { rack.removeChild(rack.children[0]); }
        piles.forEach(function (size, pi) {
          var stones = h('div', { class: 'gk-stones' });
          for (var i = 0; i < size; i++) { stones.appendChild(h('span', { class: 'gk-stone' })); }
          var buttons = h('div', { class: 'gk-takes' });
          for (var k = 1; k <= size; k++) {
            (function (kk) {
              buttons.appendChild(h('button', {
                class: 'gk-btn gk-btn-small', type: 'button',
                disabled: (over || (api.mode === 'cpu' && turn === api.cpuIndex)) || null,
                onclick: function () { take(pi, kk); }
              }, 'take ' + kk));
            })(k);
          }
          rack.appendChild(h('div', { class: 'gk-pile' }, [
            h('div', { class: 'gk-pile-label', text: 'Pile ' + (pi + 1) + ' · ' + size + ' left' }),
            stones, buttons
          ]));
        });
        if (!over) { api.setStatus('👤 ' + api.names[turn] + ' — take some stones from one pile.'); }
      }

      render();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Snakes & Ladders
     ===================================================== */
  var SN = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
  var LD = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };

  function snSquare(r, c) {
    var up = 9 - r, base = up * 10;
    return (up % 2 === 0) ? base + c + 1 : base + (10 - c);
  }

  K.register({
    id: 'snakesLadders',
    name: 'Snakes & Ladders',
    emoji: '🐍',
    tag: 'Board',
    blurb: 'Roll the dice, climb the ladders, dodge the snakes.',
    howTo: 'Roll the dice and move that many squares. Ladders take you up, snakes slide you down. You need the exact number to land on 100.',
    logic: { square: snSquare, snakes: SN, ladders: LD },
    mount: function (root, api) {
      var pos = [0, 0], turn = 0, over = false, dead = false;
      api.onDestroy(function () { dead = true; });

      var board = K.grid(10, 10, { className: 'gk-snakes' });
      var diceBtn = h('button', { class: 'gk-btn gk-btn-main', type: 'button', onclick: function () { roll(); } }, '🎲 Roll the dice');
      var diceFace = h('div', { class: 'gk-dice', text: '' });
      root.appendChild(board.root);
      root.appendChild(h('div', { class: 'gk-controls' }, [diceBtn, diceFace]));

      function roll() {
        if (over || (api.mode === 'cpu' && turn === api.cpuIndex)) { return; }
        var d = K.randInt(6) + 1;
        diceFace.textContent = K.DICE[d - 1];
        var from = pos[turn];
        if (from + d > 100) {
          api.setStatus('🙈 ' + api.names[turn] + ' rolled ' + d + ' — too big, needs exactly ' + (100 - from) + ' to finish.');
          turn = 1 - turn; render(); maybeCpu(); return;
        }
        var to = from + d, note = '';
        if (LD[to]) { note = ' 🪜 A ladder! ' + to + ' → ' + LD[to]; to = LD[to]; }
        else if (SN[to]) { note = ' 🐍 A snake! ' + to + ' → ' + SN[to]; to = SN[to]; }
        pos[turn] = to;
        if (to === 100) {
          over = true; render(); api.confetti(120);
          api.finish('🎉 ' + api.names[turn] + ' rolled ' + d + ' and reached 100 — winner!');
          return;
        }
        api.setStatus('🎲 ' + api.names[turn] + ' rolled ' + d + ' and moved to ' + to + '.' + note);
        turn = 1 - turn;
        render();
        maybeCpu();
      }

      function maybeCpu() {
        if (dead || over || turn !== api.cpuIndex) { return; }
        K.delay(650, function () { if (!dead && !over) { roll(); } });
      }

      function render() {
        K.each(board, function (cell, r, c) {
          var n = snSquare(r, c);
          var marks = '';
          if (pos[0] === n) { marks += ' 🧒'; }
          if (pos[1] === n) { marks += ' 👦'; }
          var special = LD[n] ? ' 🪜' : (SN[n] ? ' 🐍' : '');
          cell.className = 'gk-cell gk-square' + (LD[n] ? ' gk-ladder' : '') + (SN[n] ? ' gk-snakecell' : '') +
            (pos[0] === n || pos[1] === n ? ' gk-here' : '');
          cell.textContent = n + special + marks;
        });
        if (!over && turn !== api.cpuIndex) { api.setStatus('👤 ' + api.names[turn] + ' — roll the dice! (you are on ' + pos[turn] + ')'); }
      }

      render();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Rock · Paper · Scissors  (best of five)
     ===================================================== */
  var RPS = ['🪨', '📄', '✂️'];
  var RPS_NAME = ['Rock', 'Paper', 'Scissors'];
  function rpsBeats(a, b) { return (a - b + 3) % 3 === 1; } /* b beats a? no: a beats b when a-b === 1 mod 3 */

  K.register({
    id: 'rps',
    name: 'Rock · Paper · Scissors',
    emoji: '✂️',
    tag: 'Quick',
    blurb: 'Classic hand game — best of five rounds.',
    howTo: 'Rock beats scissors, scissors beats paper, paper beats rock. First to three round wins takes the match.',
    logic: { beats: rpsBeats },
    mount: function (root, api) {
      var scores = [0, 0], picks = [null, null], phase = 0, turn = 0, over = false, dead = false;
      var history = [];
      api.onDestroy(function () { dead = true; });

      var scoreline = h('div', { class: 'gk-scoreline' });
      var hands = h('div', { class: 'gk-hands' }, [h('span', { class: 'gk-hand', text: '❔' }), h('span', { class: 'gk-hand', text: '❔' })]);
      var buttons = h('div', { class: 'gk-controls' });
      RPS.forEach(function (face, i) {
        buttons.appendChild(h('button', {
          class: 'gk-btn gk-rps-btn', type: 'button',
          onclick: function () { choose(i); }
        }, face + ' ' + RPS_NAME[i]));
      });
      root.appendChild(scoreline);
      root.appendChild(hands);
      root.appendChild(buttons);

      function choose(i) {
        if (over || phase !== 'pick') { return; }
        picks[turn] = i;
        if (api.mode === 'cpu') {
          picks[api.cpuIndex] = cpuPick();
          reveal();
          return;
        }
        if (turn === 0) {
          turn = 1;
          K.cover(root, '🔄 Pass the device', 'Player 1 has chosen. Hand it to Player 2 — no peeking!', 'Player 2 is ready', function () {
            api.setStatus('👤 Player 2 — make your pick.');
          });
          api.setStatus('👤 Player 2 — make your pick.');
        } else {
          reveal();
        }
      }

      function cpuPick() {
        if (history.length && Math.random() < 0.45) { return (history[history.length - 1] + 1) % 3; }
        return K.randInt(3);
      }

      function reveal() {
        var a = picks[0], b = picks[1], msg;
        history.push(a);
        hands.children[0].textContent = RPS[a];
        hands.children[1].textContent = RPS[b];
        if (a === b) { msg = '🤝 Round drawn — ' + RPS_NAME[a] + ' against ' + RPS_NAME[a] + '.'; }
        else if (rpsBeats(a, b)) { scores[0]++; msg = '🎉 ' + api.names[0] + ' wins the round with ' + RPS_NAME[a] + '!'; }
        else { scores[1]++; msg = '🎉 ' + api.names[1] + ' wins the round with ' + RPS_NAME[b] + '!'; }
        render(msg);
        if (scores[0] === 3 || scores[1] === 3) {
          over = true;
          api.confetti(120);
          api.finish('🏆 ' + api.names[scores[0] === 3 ? 0 : 1] + ' wins the match ' + scores[0] + '–' + scores[1] + '!');
          return;
        }
        phase = 'wait';
        K.delay(1500, function () {
          if (dead || over) { return; }
          picks = [null, null];
          hands.children[0].textContent = '❔';
          hands.children[1].textContent = '❔';
          turn = 0;
          phase = 'pick';
          render('👤 ' + api.names[0] + ' — make your pick.');
        });
      }

      function render(msg) {
        scoreline.textContent = '⭐ Match score — ' + api.names[0] + ': ' + scores[0] + '  ·  ' + api.names[1] + ': ' + scores[1] + '   (first to 3)';
        if (msg) { api.setStatus(msg); }
      }

      phase = 'pick';
      render('👤 ' + api.names[0] + ' — make your pick.');
      return { destroy: function () { dead = true; } };
    }
  });
})();
