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
  /* The board grows with the level: 3×3 with three in a row first, then a 4×4
     board where you need four in a row. The computer looks a few moves ahead
     and makes fewer silly mistakes as the levels go up. */
  var TTT_SIZES = [3, 3, 3, 4, 4];
  var TTT_RUNS = [3, 3, 3, 4, 4];

  function tttLines(n, win) {
    var out = [], dirs = [[0, 1], [1, 0], [1, 1], [1, -1]], r, c, d, k;
    for (r = 0; r < n; r++) {
      for (c = 0; c < n; c++) {
        for (d = 0; d < dirs.length; d++) {
          var line = [], rr = r, cc = c, ok = true;
          for (k = 0; k < win; k++) {
            if (rr < 0 || rr >= n || cc < 0 || cc >= n) { ok = false; break; }
            line.push(rr * n + cc);
            rr += dirs[d][0]; cc += dirs[d][1];
          }
          if (ok) { out.push(line); }
        }
      }
    }
    return out;
  }

  var LINES = tttLines(3, 3);

  function tttLine(b, lines) {
    var all = lines || LINES;
    for (var i = 0; i < all.length; i++) {
      var L = all[i], mark = b[L[0]], same = true;
      if (!mark) { continue; }
      for (var k = 1; k < L.length; k++) { if (b[L[k]] !== mark) { same = false; break; } }
      if (same) { return L; }
    }
    return null;
  }
  function tttFull(b, n) {
    var size = n || Math.round(Math.sqrt(b.length));
    for (var i = 0; i < size * size; i++) { if (!b[i]) { return false; } }
    return true;
  }
  function tttSize(b) { return Math.round(Math.sqrt(b.length)); }

  /* How good a board looks without searching deeper: open lines count. */
  function tttHeuristic(b, lines, me, other) {
    var score = 0;
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i], mine = 0, theirs = 0;
      for (var k = 0; k < L.length; k++) {
        if (b[L[k]] === me) { mine++; }
        else if (b[L[k]] === other) { theirs++; }
      }
      if (mine && theirs) { continue; }
      if (mine) { score += mine * mine; }
      if (theirs) { score -= theirs * theirs + 1; }
    }
    return score;
  }
  function tttSearch(b, lines, me, other, side, depth, alpha, beta) {
    var won = tttLine(b, lines);
    if (won) { return b[won[0]] === me ? 100 + depth : -100 - depth; }
    if (tttFull(b, tttSize(b))) { return 0; }
    if (depth <= 0) { return tttHeuristic(b, lines, me, other); }
    var best = side === me ? -9999 : 9999;
    for (var i = 0; i < b.length; i++) {
      if (b[i]) { continue; }
      b[i] = side;
      var sc = tttSearch(b, lines, me, other, side === me ? other : me, depth - 1, alpha, beta);
      b[i] = null;
      if (side === me) { if (sc > best) { best = sc; } if (best > alpha) { alpha = best; } }
      else { if (sc < best) { best = sc; } if (best < beta) { beta = best; } }
      if (alpha >= beta) { break; }
    }
    return best;
  }
  function tttBest(b, me, other, lines, depth) {
    var useLines = lines || LINES;
    var bestScore = -9999, bestMove = -1, alpha = -9999;
    for (var i = 0; i < b.length; i++) {
      if (b[i]) { continue; }
      b[i] = me;
      var sc = tttSearch(b, useLines, me, other, other, (depth || 4) - 1, alpha, 9999);
      b[i] = null;
      if (sc > bestScore) { bestScore = sc; bestMove = i; }
      if (sc > alpha) { alpha = sc; }
    }
    return bestMove;
  }
  function tttAny(b) {
    var open = [];
    for (var i = 0; i < b.length; i++) { if (!b[i]) { open.push(i); } }
    return open.length ? K.pick(open) : -1;
  }

  K.register({
    id: 'ticTacToe',
    name: 'Tic-Tac-Toe',
    emoji: '⭕',
    tag: 'Quick',
    blurb: 'Three in a row wins — or four in a row on the big 4×4 boards.',
    howTo: 'Tap any square on your turn. Line up three of your marks in a row, column or diagonal to win. From level 4 the board grows to 4×4 and you need four in a row.',
    levels: 5,
    levelNames: ['Level 1 · 3×3', 'Level 2 · 3×3, cleverer computer', 'Level 3 · 3×3, full strength', 'Level 4 · 4×4, four in a row', 'Level 5 · 4×4, expert'],
    levelHints: ['The classic little board.', 'The computer thinks a bit harder.',
      'The computer plays perfectly — a draw is a good result!', 'Bigger board: four in a row!', 'Four in a row against a sharp rival.'],
    logic: { winner: tttLine, full: tttFull, best: tttBest, lines: LINES, linesFor: tttLines, sizes: TTT_SIZES },
    mount: function (root, api) {
      var marks = ['X', 'O'];
      var n = api.p.ints(TTT_SIZES);
      var run = api.p.ints(TTT_RUNS);
      var lines = tttLines(n, run);
      var depth = api.p.ints([1, 2, 9, 3, 5]);
      var blunder = api.p.blunder(0.65);
      var b = [], i;
      for (i = 0; i < n * n; i++) { b.push(null); }
      var turn = 0, over = false, dead = false, winLine = null;
      api.onDestroy(function () { dead = true; });

      var board = K.grid(n, n, { className: 'gk-ttt gk-ttt-n' + n, onCell: function (r, c) { tap(r * n + c); } });
      root.appendChild(board.root);

      function tap(i) {
        if (over || b[i] || (api.mode === 'cpu' && turn === api.cpuIndex)) { return; }
        b[i] = marks[turn];
        winLine = tttLine(b, lines);
        if (winLine) {
          over = true; render(); api.confetti(90);
          api.finish('🎉 ' + api.names[turn] + ' wins with ' + run + ' in a row on the ' + n + '×' + n + ' board!');
          return;
        }
        if (tttFull(b, n)) { over = true; render(); api.finish('🤝 It is a draw — nobody wins this one.'); return; }
        turn = 1 - turn;
        render();
        maybeCpu();
      }

      function maybeCpu() {
        if (dead || over || turn !== api.cpuIndex) { return; }
        api.setStatus('🤖 ' + api.names[1] + ' is thinking…');
        K.delay(api.p.ms(500, 260), function () {
          if (dead || over) { return; }
          var move;
          if (Math.random() < blunder) { move = tttAny(b); }
          else { move = tttBest(b, marks[api.cpuIndex], marks[1 - api.cpuIndex], lines, depth); }
          tap(move < 0 ? b.indexOf(null) : move);
        });
      }

      function render() {
        for (var i = 0; i < n * n; i++) {
          var cell = board.at(Math.floor(i / n), i % n);
          cell.textContent = b[i] || '';
          cell.className = 'gk-cell gk-ttt-cell' + (b[i] ? ' gk-' + b[i] : '') +
            (winLine && winLine.indexOf(i) >= 0 ? ' gk-win' : '');
        }
        if (!over) { api.setStatus('👤 ' + api.names[turn] + ' — your turn (' + marks[turn] + ') · level ' + api.level + ', ' + n + '×' + n + ' board'); }
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
    blurb: 'Drop your discs and sneak four in a row — the computer plans deeper every level.',
    howTo: 'Tap a column to drop your disc into the lowest empty space. Get four of your colour in a row — sideways, up, down or diagonal. Each level the computer looks further ahead.',
    levels: 5,
    levelNames: ['Level 1 · beginner computer', 'Level 2 · it sees one move', 'Level 3 · it plans three ahead', 'Level 4 · it plans four ahead', 'Level 5 · expert, no mercy'],
    levelHints: ['A friendly first game.', 'The computer blocks the easy ones.',
      'It is starting to trap you.', 'Four moves of planning.', 'The full four-ply search — think twice!'],
    logic: { newBoard: c4New, drop: c4Drop, won: c4Won, full: c4Full },
    mount: function (root, api) {
      var g = c4New();
      var depth = api.p.ints([1, 2, 3, 4, 5]);
      var blunder = api.p.blunder(0.55);
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
          api.finish('🎉 ' + api.names[turn] + ' connects four and wins level ' + api.level + '!');
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
        K.delay(api.p.ms(560, 280), function () {
          if (dead || over) { return; }
          var me = names[api.cpuIndex], other = names[1 - api.cpuIndex];
          if (Math.random() < blunder) {
            var easy = [];
            for (var e = 0; e < 7; e++) { if (!g[0][e]) { easy.push(e); } }
            if (easy.length) { play(K.pick(easy)); return; }
          }
          var bestScore = -Infinity, bestCol = 3, order = [3, 2, 4, 1, 5, 0, 6];
          for (var i = 0; i < order.length; i++) {
            var col = order[i], copy = g.map(function (row) { return row.slice(); });
            var r = c4Drop(copy, col, me);
            if (r < 0) { continue; }
            var sc = c4Won(copy, r, col, me) ? 100000 : c4Search(copy, depth, other, me, -Infinity, Infinity);
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
  var DB_N = 4; /* the classic size: 4 x 4 boxes, 5 x 5 dots. Levels resize it. */
  function dbNew(n) {
    var N = n || DB_N;
    var st = { n: N, h: [], v: [], box: [] }, i, j;
    for (i = 0; i <= N; i++) { st.h.push([]); for (j = 0; j < N; j++) { st.h[i].push(null); } }
    for (i = 0; i < N; i++) { st.v.push([]); for (j = 0; j <= N; j++) { st.v[i].push(null); } }
    for (i = 0; i < N; i++) { st.box.push([]); for (j = 0; j < N; j++) { st.box[i].push(null); } }
    return st;
  }
  function dbSize(st) { return (st && st.n) || DB_N; }
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
      if (br < 0 || br >= dbSize(st) || bc < 0 || bc >= dbSize(st)) { continue; }
      if (!st.box[br][bc] && dbBoxDone(st, br, bc)) { st.box[br][bc] = owner; done++; }
    }
    return done;
  }
  function dbMoves(st) {
    var N = dbSize(st), list = [];
    for (var r = 0; r <= N; r++) { for (var c = 0; c < N; c++) { if (!st.h[r][c]) { list.push({ t: 'h', r: r, c: c }); } } }
    for (r = 0; r < N; r++) { for (c = 0; c <= N; c++) { if (!st.v[r][c]) { list.push({ t: 'v', r: r, c: c }); } } }
    return list;
  }
  function dbCount(st) {
    var N = dbSize(st), n = 0;
    for (var r = 0; r < N; r++) { for (var c = 0; c < N; c++) { if (st.box[r][c]) { n++; } } }
    return n;
  }
  function dbClone(st) {
    var N = dbSize(st), copy = dbNew(N), r, c;
    for (r = 0; r <= N; r++) { for (c = 0; c < N; c++) { copy.h[r][c] = st.h[r][c]; } }
    for (r = 0; r < N; r++) { for (c = 0; c <= N; c++) { copy.v[r][c] = st.v[r][c]; } }
    for (r = 0; r < N; r++) { for (c = 0; c < N; c++) { copy.box[r][c] = st.box[r][c]; } }
    return copy;
  }
  /* boxes left with exactly three sides drawn = a free present for the opponent */
  function dbRisky(st) {
    var N = dbSize(st), risky = 0;
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
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
    blurb: 'Join the dots, close the boxes, collect the most squares — the grid grows each level.',
    howTo: 'Tap a line between two dots to draw it. Close a box to score it and get another turn straight away. Most boxes at the end wins. Each level brings a bigger grid and a smarter computer.',
    levels: 5,
    levelNames: ['Level 1 · 2×2 boxes', 'Level 2 · 3×3 boxes', 'Level 3 · 4×4 boxes', 'Level 4 · 5×5 boxes', 'Level 5 · 6×6 boxes'],
    levelHints: ['Just four boxes to start.', 'Nine boxes.', 'The classic sixteen.',
      'Twenty-five boxes — long game!', 'Thirty-six boxes and a clever rival.'],
    logic: { newState: dbNew, claim: dbClaim, moves: dbMoves, count: dbCount, boxDone: dbBoxDone, size: dbSize },
    mount: function (root, api) {
      var N = api.p.ints([2, 3, 4, 5, 6]);
      var blunder = api.p.blunder(0.45);
      var st = dbNew(N);
      var turn = 0, over = false, dead = false, scores = [0, 0];
      api.onDestroy(function () { dead = true; });

      var board = K.grid(N * 2 + 1, N * 2 + 1, { className: 'gk-db', onCell: onCell });
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
        if (dbCount(st) === N * N) { gameOver(); return; }
        if (made > 0) { api.setStatus('🎁 ' + api.names[turn] + ' closed a box — go again!'); maybeCpu(); return; }
        maybeCpu();
      }

      function gameOver() {
        over = true;
        render();
        api.confetti(120);
        if (scores[0] === scores[1]) { api.finish('🤝 All ' + (N * N) + ' boxes closed on level ' + api.level + ' — it is a ' + scores[0] + '–' + scores[1] + ' draw.'); }
        else {
          var w = scores[0] > scores[1] ? 0 : 1;
          api.finish('🎉 ' + api.names[w] + ' wins ' + scores[0] + '–' + scores[1] + ' on level ' + api.level + '!');
        }
      }

      function aiMove() {
        var moves = dbMoves(st), owner = 'P' + (turn + 1), i;
        var take = [], safe = [], risky = [];
        if (Math.random() < blunder) { return K.pick(moves); }
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
          if (dbCount(st) === N * N) { gameOver(); return; }
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
          api.setStatus('👤 ' + api.names[turn] + ' — draw a line.  Score ' + scores[0] + '–' + scores[1] +
            '   (' + dbCount(st) + '/' + (N * N) + ' boxes · level ' + api.level + ')');
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
    howTo: 'On your turn, take any number of stones from one pile only. Whoever takes the last stone of all wins. Higher levels add more piles — and the computer stops going easy on you.',
    levels: 5,
    levelNames: ['Level 1 · one pile of 5', 'Level 2 · two piles', 'Level 3 · the classic three', 'Level 4 · four piles', 'Level 5 · five piles, expert'],
    levelHints: ['One pile: whoever is second can always win!', 'Two piles to juggle.',
      'Seven, five and three — the classic puzzle.', 'Four piles, clever rival.', 'Five piles and a perfect player.'],
    logic: { nimSum: function (p) { return p.reduce(function (a, b) { return a ^ b; }, 0); } },
    mount: function (root, api) {
      var piles = api.p.ints([[5], [7, 5], [7, 5, 3], [9, 6, 4, 2], [13, 9, 5, 3, 1]]).slice();
      var blunder = api.p.blunder(0.55);
      var turn = 0, over = false, dead = false;
      api.onDestroy(function () { dead = true; });
      var rack = h('div', { class: 'gk-rack' });
      root.appendChild(rack);

      function take(pi, n) {
        if (over || n > piles[pi] || (api.mode === 'cpu' && turn === api.cpuIndex)) { return; }
        piles[pi] -= n;
        var left = piles.reduce(function (a, b) { return a + b; }, 0);
        if (left === 0) {
          over = true; render(); api.confetti(90);
          api.finish('🎉 ' + api.names[turn] + ' took the last stone and wins level ' + api.level + '!');
          return;
        }
        turn = 1 - turn;
        render();
        maybeCpu();
      }

      function aiTake() {
        if (Math.random() < blunder) {
          take(K.randInt(piles.length), 1 + K.randInt(piles[K.randInt(piles.length)] || 1));
          return;
        }
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
    blurb: 'Roll the dice, climb the ladders, dodge the snakes — one die or two.',
    howTo: 'Roll the dice and move that many squares. Ladders take you up, snakes slide you down. You need the exact number to land on 100. From level 3 you roll two dice, so the race is much wilder.',
    levels: 5,
    levelNames: ['Level 1 · one die, easy board', 'Level 2 · one die', 'Level 3 · two dice', 'Level 4 · two dice, speedy', 'Level 5 · two dice, lightning computer'],
    levelHints: ['A gentle one-die race.', 'The classic game.',
      'Two dice — you will fly up the board.', 'Two dice and quick turns.', 'Two dice and a computer that never dawdles.'],
    logic: { square: snSquare, snakes: SN, ladders: LD },
    mount: function (root, api) {
      var diceCount = api.p.ints([1, 1, 2, 2, 2]);
      var pos = [0, 0], turn = 0, over = false, dead = false;
      api.onDestroy(function () { dead = true; });

      var board = K.grid(10, 10, { className: 'gk-snakes' });
      var diceBtn = h('button', { class: 'gk-btn gk-btn-main', type: 'button', onclick: function () { roll(); } },
        diceCount > 1 ? '🎲 Roll two dice' : '🎲 Roll the dice');
      var diceFace = h('div', { class: 'gk-dice', text: '' });
      root.appendChild(board.root);
      root.appendChild(h('div', { class: 'gk-controls' }, [diceBtn, diceFace]));

      function roll() {
        if (over || (api.mode === 'cpu' && turn === api.cpuIndex)) { return; }
        var d = 0, faces = '';
        for (var di = 0; di < diceCount; di++) { var v = K.randInt(6) + 1; d += v; faces += K.DICE[v - 1]; }
        diceFace.textContent = faces;
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
          api.finish('🎉 ' + api.names[turn] + ' rolled ' + d + ' and reached 100 on level ' + api.level + ' — winner!');
          return;
        }
        api.setStatus('🎲 ' + api.names[turn] + ' rolled ' + d + ' and moved to ' + to + '.' + note);
        turn = 1 - turn;
        render();
        maybeCpu();
      }

      function maybeCpu() {
        if (dead || over || turn !== api.cpuIndex) { return; }
        K.delay(api.p.ms(700, 240), function () { if (!dead && !over) { roll(); } });
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
    blurb: 'Classic hand game — the match gets longer and the computer reads you better each level.',
    howTo: 'Rock beats scissors, scissors beats paper, paper beats rock. Win the number of rounds your level asks for. Higher levels need more round wins and the computer learns your habits.',
    levels: 5,
    levelNames: ['Level 1 · first to 1', 'Level 2 · first to 2', 'Level 3 · first to 3', 'Level 4 · first to 4', 'Level 5 · first to 5, mind reader'],
    levelHints: ['One round, quick fun.', 'Two-round match.',
      'The classic best of five.', 'A four-round match.', 'Long match against a mind-reading rival.'],
    logic: { beats: rpsBeats },
    mount: function (root, api) {
      var need = api.p.ints([1, 2, 3, 4, 5]);
      var read = api.p.lerp(0.2, 0.9);
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
        if (history.length && Math.random() < read) { return (history[history.length - 1] + 1) % 3; }
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
        if (scores[0] >= need || scores[1] >= need) {
          over = true;
          api.confetti(120);
          api.finish('🏆 ' + api.names[scores[0] >= need ? 0 : 1] + ' wins the level ' + api.level + ' match ' + scores[0] + '–' + scores[1] + '!');
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
        scoreline.textContent = '⭐ Level ' + api.level + ' match — ' + api.names[0] + ': ' + scores[0] + '  ·  ' +
          api.names[1] + ': ' + scores[1] + '   (first to ' + need + ')';
        if (msg) { api.setStatus(msg); }
      }

      phase = 'pick';
      render('👤 ' + api.names[0] + ' — make your pick.');
      return { destroy: function () { dead = true; } };
    }
  });
})();
