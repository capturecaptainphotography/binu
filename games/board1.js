/* Board games, part 1: Chess, Checkers, Reversi.
   Chess and checkers enforce the real rules (castling, en passant, promotion,
   forced captures, kings). All three have a computer opponent. */
(function () {
  'use strict';

  var K = window.GameKit;
  var h = K.h;

  /* =====================================================
     Chess
     ===================================================== */
  var VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  var GLYPH = {
    wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
    bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟'
  };
  var KNIGHT_D = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  var KING_D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  var ROOK_D = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var BISHOP_D = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  function inner(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function foe(color) { return color === 'w' ? 'b' : 'w'; }

  function chessStart() {
    var back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'], b = [], r, c;
    for (r = 0; r < 8; r++) { b.push([null, null, null, null, null, null, null, null]); }
    for (c = 0; c < 8; c++) { b[0][c] = 'b' + back[c]; b[1][c] = 'bp'; b[6][c] = 'wp'; b[7][c] = 'w' + back[c]; }
    return { b: b, side: 'w', wk: true, wq: true, bk: true, bq: true, ep: null, half: 0 };
  }
  function chessClone(st) {
    var b = [], r;
    for (r = 0; r < 8; r++) { b.push(st.b[r].slice()); }
    return { b: b, side: st.side, wk: st.wk, wq: st.wq, bk: st.bk, bq: st.bq, ep: st.ep ? { r: st.ep.r, c: st.ep.c } : null, half: st.half };
  }
  function chessAttacked(b, r, c, by) {
    var i, d, rr, cc, pr = by === 'w' ? r + 1 : r - 1;
    if (pr >= 0 && pr < 8) {
      for (i = -1; i <= 1; i += 2) { cc = c + i; if (inner(pr, cc) && b[pr][cc] === by + 'p') { return true; } }
    }
    for (i = 0; i < 8; i++) {
      rr = r + KNIGHT_D[i][0]; cc = c + KNIGHT_D[i][1];
      if (inner(rr, cc) && b[rr][cc] === by + 'n') { return true; }
      rr = r + KING_D[i][0]; cc = c + KING_D[i][1];
      if (inner(rr, cc) && b[rr][cc] === by + 'k') { return true; }
    }
    for (d = 0; d < 4; d++) {
      rr = r + ROOK_D[d][0]; cc = c + ROOK_D[d][1];
      while (inner(rr, cc)) {
        var pc = b[rr][cc];
        if (pc) { if (pc[0] === by && (pc[1] === 'r' || pc[1] === 'q')) { return true; } break; }
        rr += ROOK_D[d][0]; cc += ROOK_D[d][1];
      }
      rr = r + BISHOP_D[d][0]; cc = c + BISHOP_D[d][1];
      while (inner(rr, cc)) {
        var pb = b[rr][cc];
        if (pb) { if (pb[0] === by && (pb[1] === 'b' || pb[1] === 'q')) { return true; } break; }
        rr += BISHOP_D[d][0]; cc += BISHOP_D[d][1];
      }
    }
    return false;
  }
  function chessKing(b, color) {
    for (var r = 0; r < 8; r++) { for (var c = 0; c < 8; c++) { if (b[r][c] === color + 'k') { return { r: r, c: c }; } } }
    return null;
  }
  function chessInCheck(st, color) {
    var k = chessKing(st.b, color);
    return k ? chessAttacked(st.b, k.r, k.c, foe(color)) : false;
  }
  function chessPseudo(st, r, c) {
    var pc = st.b[r][c];
    if (!pc) { return []; }
    var color = pc[0], type = pc[1], out = [], i, d, rr, cc, t;
    if (type === 'p') {
      var dir = color === 'w' ? -1 : 1, start = color === 'w' ? 6 : 1, one = r + dir;
      if (inner(one, c) && !st.b[one][c]) {
        out.push({ r: one, c: c });
        if (r === start && !st.b[r + dir * 2][c]) { out.push({ r: r + dir * 2, c: c }); }
      }
      for (i = -1; i <= 1; i += 2) {
        cc = c + i;
        if (!inner(one, cc)) { continue; }
        t = st.b[one][cc];
        if (t && t[0] !== color) { out.push({ r: one, c: cc }); }
        else if (!t && st.ep && st.ep.r === one && st.ep.c === cc) { out.push({ r: one, c: cc, ep: true }); }
      }
      return out;
    }
    if (type === 'n') {
      for (i = 0; i < 8; i++) {
        rr = r + KNIGHT_D[i][0]; cc = c + KNIGHT_D[i][1];
        if (inner(rr, cc) && (!st.b[rr][cc] || st.b[rr][cc][0] !== color)) { out.push({ r: rr, c: cc }); }
      }
      return out;
    }
    if (type === 'k') {
      for (i = 0; i < 8; i++) {
        rr = r + KING_D[i][0]; cc = c + KING_D[i][1];
        if (inner(rr, cc) && (!st.b[rr][cc] || st.b[rr][cc][0] !== color)) { out.push({ r: rr, c: cc }); }
      }
      var home = color === 'w' ? 7 : 0;
      if (r === home && c === 4) {
        var ka = color === 'w' ? st.wk : st.bk, qa = color === 'w' ? st.wq : st.bq;
        if (ka && !st.b[home][5] && !st.b[home][6] && st.b[home][7] === color + 'r') { out.push({ r: home, c: 6, castle: 'k' }); }
        if (qa && !st.b[home][1] && !st.b[home][2] && !st.b[home][3] && st.b[home][0] === color + 'r') { out.push({ r: home, c: 2, castle: 'q' }); }
      }
      return out;
    }
    var dirs = [];
    if (type === 'r' || type === 'q') { dirs = dirs.concat(ROOK_D); }
    if (type === 'b' || type === 'q') { dirs = dirs.concat(BISHOP_D); }
    for (d = 0; d < dirs.length; d++) {
      rr = r + dirs[d][0]; cc = c + dirs[d][1];
      while (inner(rr, cc)) {
        t = st.b[rr][cc];
        if (!t) { out.push({ r: rr, c: cc }); }
        else { if (t[0] !== color) { out.push({ r: rr, c: cc }); } break; }
        rr += dirs[d][0]; cc += dirs[d][1];
      }
    }
    return out;
  }
  function chessApply(st, from, to) {
    var n = chessClone(st), pc = n.b[from.r][from.c];
    if (!pc) { return n; }
    var color = pc[0], type = pc[1];
    n.ep = null;
    if (type === 'p' && to.ep) { n.b[from.r][to.c] = null; }
    if (type === 'p' && Math.abs(to.r - from.r) === 2) { n.ep = { r: (from.r + to.r) / 2, c: from.c }; }
    n.b[to.r][to.c] = pc;
    n.b[from.r][from.c] = null;
    if (type === 'p' && (to.r === 0 || to.r === 7)) { n.b[to.r][to.c] = color + 'q'; }
    if (type === 'k' && Math.abs(to.c - from.c) === 2) {
      if (to.c === 6) { n.b[from.r][5] = n.b[from.r][7]; n.b[from.r][7] = null; }
      else { n.b[from.r][3] = n.b[from.r][0]; n.b[from.r][0] = null; }
    }
    if (type === 'k') { if (color === 'w') { n.wk = n.wq = false; } else { n.bk = n.bq = false; } }
    if (type === 'r') {
      if (from.c === 0) { if (color === 'w') { n.wq = false; } else { n.bq = false; } }
      if (from.c === 7) { if (color === 'w') { n.wk = false; } else { n.bk = false; } }
    }
    if (to.r === 7 && to.c === 0) { n.wq = false; }
    if (to.r === 7 && to.c === 7) { n.wk = false; }
    if (to.r === 0 && to.c === 0) { n.bq = false; }
    if (to.r === 0 && to.c === 7) { n.bk = false; }
    n.half = (pc[1] === 'p' || st.b[to.r][to.c]) ? 0 : st.half + 1;
    n.side = foe(color);
    return n;
  }
  function chessMovesFrom(st, r, c) {
    var color = st.b[r][c] ? st.b[r][c][0] : null;
    if (!color) { return []; }
    var raw = chessPseudo(st, r, c), out = [];
    for (var i = 0; i < raw.length; i++) {
      var m = raw[i];
      if (m.castle) {
        var path = m.castle === 'k' ? [4, 5, 6] : [4, 3, 2];
        var blocked = false;
        for (var p = 0; p < path.length; p++) {
          if (chessAttacked(st.b, r, path[p], foe(color))) { blocked = true; break; }
        }
        if (blocked) { continue; }
      }
      var next = chessApply(st, { r: r, c: c }, m);
      if (chessInCheck(next, color)) { continue; }
      out.push(m);
    }
    return out;
  }
  function chessLegal(st) {
    var out = [], color = st.side;
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        if (st.b[r][c] && st.b[r][c][0] === color) {
          var ms = chessMovesFrom(st, r, c);
          for (var i = 0; i < ms.length; i++) { out.push({ from: { r: r, c: c }, to: ms[i] }); }
        }
      }
    }
    return out;
  }
  function chessEval(st) {
    var me = st.side, other = foe(me), score = 0, r, c, pc;
    for (r = 0; r < 8; r++) {
      for (c = 0; c < 8; c++) {
        pc = st.b[r][c];
        if (!pc) { continue; }
        var v = VALUE[pc[1]];
        var centre = (3.5 - Math.abs(3.5 - r)) + (3.5 - Math.abs(3.5 - c));
        v += centre * (pc[1] === 'p' || pc[1] === 'n' ? 4 : 2);
        if (pc[1] === 'p') { v += (pc[0] === 'w' ? (6 - r) : (r - 1)) * 6; }
        score += (pc[0] === me ? v : -v);
      }
    }
    return score;
  }
  function chessSearch(st, depth, ply, alpha, beta) {
    if (depth === 0) { return chessEval(st) + (chessInCheck(st, st.side) ? -25 : 0); }
    var moves = chessLegal(st);
    if (!moves.length) { return chessInCheck(st, st.side) ? -(90000 - ply) : 0; }
    moves.sort(function (a, b) {
      return chessMoveScore(st, b) - chessMoveScore(st, a);
    });
    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var next = chessApply(st, moves[i].from, moves[i].to);
      var sc = -chessSearch(next, depth - 1, ply + 1, -beta, -alpha);
      if (sc > best) { best = sc; }
      if (best > alpha) { alpha = best; }
      if (alpha >= beta) { break; }
    }
    return best;
  }
  function chessMoveScore(st, m) {
    var victim = st.b[m.to.r][m.to.c], pc = st.b[m.from.r][m.from.c];
    var s = 0;
    if (victim) { s += 10 * VALUE[victim[1]] - VALUE[pc[1]]; }
    if (m.to.ep) { s += 900; }
    if (pc[1] === 'p' && (m.to.r === 0 || m.to.r === 7)) { s += 8000; }
    return s;
  }
  function chessBest(st, depth) {
    var moves = chessLegal(st);
    if (!moves.length) { return null; }
    moves.sort(function (a, b) { return chessMoveScore(st, b) - chessMoveScore(st, a); });
    var best = -Infinity, pick = moves[0];
    for (var i = 0; i < moves.length; i++) {
      var next = chessApply(st, moves[i].from, moves[i].to);
      var sc = -chessSearch(next, depth - 1, 1, -Infinity, Infinity) + Math.random() * 4;
      if (sc > best) { best = sc; pick = moves[i]; }
    }
    return pick;
  }

  K.register({
    id: 'chess',
    name: 'Chess',
    emoji: '♟️',
    tag: 'Board',
    blurb: 'The big one — full rules, real moves, a thinking opponent.',
    howTo: 'Tap a piece to see where it can go, then tap a square to move. Castling, en passant and promotion all work (pawns become queens). Trap the other king so it cannot escape to win.',
    logic: {
      start: chessStart, legal: chessLegal, movesFrom: chessMovesFrom, apply: chessApply,
      inCheck: chessInCheck, best: chessBest, eval: chessEval
    },
    mount: function (root, api) {
      var st = chessStart();
      var selected = null, targets = [], over = false, dead = false, thinking = false;
      var humanColor = 'w';
      api.onDestroy(function () { dead = true; });

      var board = K.grid(8, 8, { className: 'gk-chess', onCell: function (r, c) { tap(r, c); } });
      var capLine = h('div', { class: 'gk-scoreline' });
      root.appendChild(capLine);
      root.appendChild(board.root);

      function tap(r, c) {
        if (over || thinking) { return; }
        if (api.mode === 'cpu' && st.side !== humanColor) { return; }
        var target = null;
        for (var i = 0; i < targets.length; i++) {
          if (targets[i].r === r && targets[i].c === c) { target = targets[i]; }
        }
        if (selected && target) {
          var from = selected;
          st = chessApply(st, from, target);
          selected = null; targets = [];
          render();
          checkEnd();
          return;
        }
        var pc = st.b[r][c];
        if (pc && pc[0] === st.side) {
          selected = { r: r, c: c };
          targets = chessMovesFrom(st, r, c);
        } else {
          selected = null; targets = [];
        }
        render();
      }

      function checkEnd() {
        var moves = chessLegal(st);
        if (!moves.length) {
          over = true;
          render();
          api.confetti(140);
          if (chessInCheck(st, st.side)) {
            api.finish('🏆 Checkmate! ' + api.names[st.side === 'w' ? 1 : 0] + ' wins.');
          } else {
            api.finish('🤝 Stalemate — no legal moves, so it is a draw.');
          }
          return;
        }
        if (st.half >= 100) { over = true; render(); api.finish('🤝 Fifty moves without a capture — drawn.'); return; }
        maybeCpu();
      }

      function maybeCpu() {
        if (dead || over || api.mode !== 'cpu' || st.side === humanColor) { return; }
        thinking = true;
        api.setStatus('🤖 ' + api.names[1] + ' is thinking…');
        K.delay(320, function () {
          if (dead || over) { return; }
          var move = chessBest(st, 3);
          thinking = false;
          if (!move) { checkEnd(); return; }
          st = chessApply(st, move.from, move.to);
          selected = null; targets = [];
          render();
          checkEnd();
        });
      }

      function render() {
        var k = chessKing(st.b, st.side);
        var checked = k && chessAttacked(st.b, k.r, k.c, foe(st.side));
        K.each(board, function (cell, r, c) {
          var pc = st.b[r][c];
          var cls = 'gk-cell gk-sq ' + ((r + c) % 2 === 0 ? 'gk-light' : 'gk-dark');
          if (selected && selected.r === r && selected.c === c) { cls += ' gk-selected'; }
          for (var i = 0; i < targets.length; i++) {
            if (targets[i].r === r && targets[i].c === c) {
              cls += (st.b[r][c] || targets[i].ep) ? ' gk-can-take' : ' gk-can-go';
            }
          }
          cell.className = cls;
          cell.textContent = pc ? GLYPH[pc] : '';
        });
        var counts = { w: 0, b: 0 };
        for (var rr = 0; rr < 8; rr++) {
          for (var cc = 0; cc < 8; cc++) { if (st.b[rr][cc]) { counts[st.b[rr][cc][0]]++; } }
        }
        capLine.textContent = '♔ White pieces: ' + counts.w + '   ·   ♚ Black pieces: ' + counts.b;
        if (!over) {
          api.setStatus('👤 ' + api.names[st.side === 'w' ? 0 : 1] + ' to move' + (checked ? ' — ⚠️ check!' : ''));
        }
      }

      render();
      maybeCpu();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Checkers (draughts)
     ===================================================== */
  var CDIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  function chkStart() {
    var b = [], r, c;
    for (r = 0; r < 8; r++) { b.push([null, null, null, null, null, null, null, null]); }
    for (r = 0; r < 3; r++) { for (c = 0; c < 8; c++) { if ((r + c) % 2 === 1) { b[r][c] = 'b'; } } }
    for (r = 5; r < 8; r++) { for (c = 0; c < 8; c++) { if ((r + c) % 2 === 1) { b[r][c] = 'w'; } } }
    return { b: b, side: 'w' };
  }
  function chkClone(st) {
    var b = [], r;
    for (r = 0; r < 8; r++) { b.push(st.b[r].slice()); }
    return { b: b, side: st.side };
  }
  function chkDirs(pc) { return pc === pc.toUpperCase() ? CDIRS : (pc === 'w' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]); }

  function chkChains(b, r, c, color, captured) {
    var pc = b[r][c], king = pc === pc.toUpperCase(), dirs = chkDirs(pc), out = [], d;
    for (d = 0; d < dirs.length; d++) {
      var mr = r + dirs[d][0], mc = c + dirs[d][1], tr = r + dirs[d][0] * 2, tc = c + dirs[d][1] * 2;
      if (!inner(tr, tc)) { continue; }
      var mid = b[mr][mc];
      if (!mid || mid[0] === color || captured[mr + ',' + mc] || b[tr][tc]) { continue; }
      var nb = [], i;
      for (i = 0; i < 8; i++) { nb.push(b[i].slice()); }
      nb[r][c] = null; nb[mr][mc] = null;
      var crowned = king || (color === 'w' && tr === 0) || (color === 'b' && tr === 7);
      nb[tr][tc] = crowned ? color.toUpperCase() : pc;
      var nextCap = {};
      for (var key in captured) { if (Object.prototype.hasOwnProperty.call(captured, key)) { nextCap[key] = true; } }
      nextCap[mr + ',' + mc] = true;
      var onward = crowned ? [] : chkChains(nb, tr, tc, color, nextCap);
      if (onward.length) {
        for (i = 0; i < onward.length; i++) {
          out.push([{ from: { r: r, c: c }, to: { r: tr, c: tc }, capture: { r: mr, c: mc } }].concat(onward[i]));
        }
      } else {
        out.push([{ from: { r: r, c: c }, to: { r: tr, c: tc }, capture: { r: mr, c: mc } }]);
      }
    }
    return out;
  }

  function chkMoves(st, color) {
    color = color || st.side;
    var caps = [], quiet = [], r, c, d;
    for (r = 0; r < 8; r++) {
      for (c = 0; c < 8; c++) {
        var pc = st.b[r][c];
        if (!pc || pc[0] !== color) { continue; }
        caps = caps.concat(chkChains(st.b, r, c, color, {}));
        var dirs = chkDirs(pc);
        for (d = 0; d < dirs.length; d++) {
          var tr = r + dirs[d][0], tc = c + dirs[d][1];
          if (inner(tr, tc) && !st.b[tr][tc]) { quiet.push([{ from: { r: r, c: c }, to: { r: tr, c: tc } }]); }
        }
      }
    }
    return caps.length ? caps : quiet;
  }
  function chkApply(st, seq) {
    var n = chkClone(st), i;
    for (i = 0; i < seq.length; i++) {
      var step = seq[i], pc = n.b[step.from.r][step.from.c];
      if (step.capture) { n.b[step.capture.r][step.capture.c] = null; }
      n.b[step.to.r][step.to.c] = pc;
      n.b[step.from.r][step.from.c] = null;
      if (pc === 'w' && step.to.r === 0) { n.b[step.to.r][step.to.c] = 'W'; }
      if (pc === 'b' && step.to.r === 7) { n.b[step.to.r][step.to.c] = 'B'; }
    }
    n.side = foe(st.side);
    return n;
  }
  function chkEval(st) {
    var me = st.side, other = foe(me), score = 0, r, c, pc;
    for (r = 0; r < 8; r++) {
      for (c = 0; c < 8; c++) {
        pc = st.b[r][c];
        if (!pc) { continue; }
        var v = pc === pc.toUpperCase() ? 260 : 100;
        if (pc[0] === 'w') { v += (7 - r) * 4; } else { v += r * 4; }
        score += (pc[0] === me ? v : -v);
      }
    }
    return score;
  }
  function chkSearch(st, depth, alpha, beta) {
    var moves = chkMoves(st, st.side);
    if (!moves.length) { return -50000; }
    if (depth === 0) { return chkEval(st); }
    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var sc = -chkSearch(chkApply(st, moves[i]), depth - 1, -beta, -alpha);
      if (sc > best) { best = sc; }
      if (best > alpha) { alpha = best; }
      if (alpha >= beta) { break; }
    }
    return best;
  }
  function chkBest(st, depth) {
    var moves = chkMoves(st, st.side);
    if (!moves.length) { return null; }
    var best = -Infinity, pick = moves[0];
    for (var i = 0; i < moves.length; i++) {
      var sc = -chkSearch(chkApply(st, moves[i]), depth - 1, -Infinity, Infinity) + Math.random() * 3;
      if (sc > best) { best = sc; pick = moves[i]; }
    }
    return pick;
  }

  K.register({
    id: 'checkers',
    name: 'Checkers',
    emoji: '⚫',
    tag: 'Board',
    blurb: 'Jump your way across the board and crown your kings.',
    howTo: 'Move one square diagonally forward. Jump over an opponent to capture — if you can capture you must. Reach the far side to become a king. Take all the pieces or block every move to win.',
    logic: { start: chkStart, moves: chkMoves, apply: chkApply, best: chkBest },
    mount: function (root, api) {
      var st = chkStart(), selected = null, choices = [], over = false, dead = false;
      var human = 'w';
      api.onDestroy(function () { dead = true; });

      var board = K.grid(8, 8, { className: 'gk-checkers', onCell: function (r, c) { tap(r, c); } });
      root.appendChild(board.root);

      function myMoves() { return chkMoves(st, st.side); }

      function tap(r, c) {
        if (over || (api.mode === 'cpu' && st.side !== human)) { return; }
        for (var j = 0; j < choices.length; j++) {
          if (choices[j][0].to.r === r && choices[j][0].to.c === c) { play(choices[j]); return; }
        }
        var opts = myMoves().filter(function (m) { return m[0].from.r === r && m[0].from.c === c; });
        if (!opts.length) { selected = null; choices = []; render(); return; }
        if (opts.length === 1 && opts[0].length === 1) { play(opts[0]); return; }
        selected = { r: r, c: c };
        choices = opts;
        render();
      }

      function play(move) {
        var seq = chkApply(st, move);
        /* a chain that must continue? the move generator already returns full chains */
        st = seq;
        selected = null; choices = [];
        render();
        var moves = myMoves();
        if (!moves.length) {
          over = true;
          api.confetti(130);
          api.finish('🏆 ' + api.names[st.side === 'w' ? 1 : 0] + ' wins — the other side has no moves left!');
          return;
        }
        maybeCpu();
      }

      function maybeCpu() {
        if (dead || over || api.mode !== 'cpu' || st.side === human) { return; }
        api.setStatus('🤖 ' + api.names[1] + ' is thinking…');
        K.delay(400, function () {
          if (dead || over) { return; }
          var move = chkBest(st, 5);
          if (!move) { return; }
          st = chkApply(st, move);
          render();
          if (!myMoves().length) {
            over = true;
            api.confetti(130);
            api.finish('🏆 ' + api.names[st.side === 'w' ? 1 : 0] + ' wins!');
            return;
          }
          maybeCpu();
        });
      }

      function render() {
        K.each(board, function (cell, r, c) {
          var pc = st.b[r][c];
          var cls = 'gk-cell gk-sq gk-chk ' + ((r + c) % 2 === 0 ? 'gk-light' : 'gk-dark');
          if (selected && selected.r === r && selected.c === c) { cls += ' gk-selected'; }
          for (var i = 0; i < choices.length; i++) {
            if (choices[i][0].to.r === r && choices[i][0].to.c === c) { cls += ' gk-can-go'; }
          }
          if (pc && pc === pc.toUpperCase()) { cls += ' gk-crowned'; }
          var face = '';
          if (pc === 'w') { face = '⚪'; } else if (pc === 'b') { face = '⚫'; } else if (pc) { face = '👑'; }
          cell.className = cls;
          cell.textContent = face;
        });
        if (!over) { api.setStatus('👤 ' + api.names[st.side === 'w' ? 0 : 1] + ' — pick a piece. (you play ⚪ White)'); }
      }

      render();
      maybeCpu();
      return { destroy: function () { dead = true; } };
    }
  });

  /* =====================================================
     Reversi / Othello
     ===================================================== */
  var RDIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  var RWEIGHT = [
    [120, -25, 22, 8, 8, 22, -25, 120],
    [-25, -45, -6, -4, -4, -6, -45, -25],
    [22, -6, 12, 3, 3, 12, -6, 22],
    [8, -4, 3, 2, 2, 3, -4, 8],
    [8, -4, 3, 2, 2, 3, -4, 8],
    [22, -6, 12, 3, 3, 12, -6, 22],
    [-25, -45, -6, -4, -4, -6, -45, -25],
    [120, -25, 22, 8, 8, 22, -25, 120]
  ];

  function revStart() {
    var b = [], r, c;
    for (r = 0; r < 8; r++) { b.push([null, null, null, null, null, null, null, null]); }
    b[3][3] = 'W'; b[3][4] = 'B'; b[4][3] = 'B'; b[4][4] = 'W';
    return { b: b, side: 'B' };
  }
  function revClone(st) {
    var b = [], r;
    for (r = 0; r < 8; r++) { b.push(st.b[r].slice()); }
    return { b: b, side: st.side };
  }
  function revFlips(b, r, c, color) {
    if (b[r][c]) { return []; }
    var other = color === 'B' ? 'W' : 'B', flips = [], d, i;
    for (d = 0; d < RDIRS.length; d++) {
      var line = [], rr = r + RDIRS[d][0], cc = c + RDIRS[d][1];
      while (inner(rr, cc) && b[rr][cc] === other) { line.push({ r: rr, c: cc }); rr += RDIRS[d][0]; cc += RDIRS[d][1]; }
      if (line.length && inner(rr, cc) && b[rr][cc] === color) { flips = flips.concat(line); }
    }
    return flips;
  }
  function revLegal(st, color) {
    color = color || st.side;
    var out = [];
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var f = revFlips(st.b, r, c, color);
        if (f.length) { out.push({ r: r, c: c, flips: f }); }
      }
    }
    return out;
  }
  function revApply(st, move) {
    var n = revClone(st), color = n.side, i;
    n.b[move.r][move.c] = color;
    for (i = 0; i < move.flips.length; i++) { n.b[move.flips[i].r][move.flips[i].c] = color; }
    n.side = color === 'B' ? 'W' : 'B';
    return n;
  }
  function revScore(st) {
    var s = { B: 0, W: 0 };
    for (var r = 0; r < 8; r++) { for (var c = 0; c < 8; c++) { if (st.b[r][c]) { s[st.b[r][c]]++; } } }
    return s;
  }
  function revEval(st) {
    var me = st.side, other = me === 'B' ? 'W' : 'B', score = 0, mine = 0, theirs = 0, r, c;
    for (r = 0; r < 8; r++) {
      for (c = 0; c < 8; c++) {
        if (st.b[r][c] === me) { score += RWEIGHT[r][c]; mine++; }
        else if (st.b[r][c] === other) { score -= RWEIGHT[r][c]; theirs++; }
      }
    }
    score += (mine - theirs) * 2;
    return score;
  }
  function revSearch(st, depth, alpha, beta, passed) {
    var moves = revLegal(st, st.side);
    if (!moves.length) {
      if (passed) { return revEval(st); }
      var skip = revClone(st);
      skip.side = st.side === 'B' ? 'W' : 'B';
      return -revSearch(skip, depth, -beta, -alpha, true);
    }
    if (depth === 0) { return revEval(st); }
    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var sc = -revSearch(revApply(st, moves[i]), depth - 1, -beta, -alpha, false);
      if (sc > best) { best = sc; }
      if (best > alpha) { alpha = best; }
      if (alpha >= beta) { break; }
    }
    return best;
  }
  function revBest(st, depth) {
    var moves = revLegal(st, st.side);
    if (!moves.length) { return null; }
    var best = -Infinity, pick = moves[0];
    for (var i = 0; i < moves.length; i++) {
      var sc = -revSearch(revApply(st, moves[i]), depth - 1, -Infinity, Infinity, false) + Math.random() * 5;
      if (sc > best) { best = sc; pick = moves[i]; }
    }
    return pick;
  }

  K.register({
    id: 'reversi',
    name: 'Reversi',
    emoji: '⚪',
    tag: 'Board',
    blurb: 'Trap your opponent and flip their discs to your colour.',
    howTo: 'Place a disc so it traps a straight line of your opponent’s discs — everything trapped flips to your colour. If you have no legal move you miss a turn. Most discs at the end wins.',
    logic: { start: revStart, legal: revLegal, apply: revApply, score: revScore, best: revBest },
    mount: function (root, api) {
      var st = revStart(), over = false, dead = false, passes = 0;
      api.onDestroy(function () { dead = true; });

      var scoreline = h('div', { class: 'gk-scoreline' });
      var board = K.grid(8, 8, { className: 'gk-reversi', onCell: function (r, c) { tap(r, c); } });
      root.appendChild(scoreline);
      root.appendChild(board.root);

      function legalHere() { return revLegal(st, st.side); }

      function tap(r, c) {
        if (over || (api.mode === 'cpu' && st.side === 'W')) { return; }
        var moves = legalHere();
        for (var i = 0; i < moves.length; i++) {
          if (moves[i].r === r && moves[i].c === c) { play(moves[i]); return; }
        }
        api.setStatus('🙅 That square does not flip anything — try a dotted square.');
      }

      function play(move) {
        st = revApply(st, move);
        passes = 0;
        render();
        if (!legalHere().length) {
          /* the opponent must pass or the game is over */
          if (api.mode === 'cpu' && st.side === 'W') {
            K.delay(600, function () {
              if (dead || over) { return; }
              if (!legalHere().length) { endGame(); return; }
              render();
              maybeCpu();
            });
            return;
          }
          passes = 1;
          K.delay(500, function () {
            if (dead || over) { return; }
            if (!legalHere().length) {
              var skip = revClone(st);
              skip.side = st.side === 'B' ? 'W' : 'B';
              if (!revLegal(skip, skip.side).length) { endGame(); return; }
              st = skip;
              render();
              api.setStatus('⏭️ ' + api.names[st.side === 'B' ? 0 : 1] + ' had no move, so the turn passes.');
              maybeCpu();
              return;
            }
            maybeCpu();
          });
          return;
        }
        maybeCpu();
      }

      function endGame() {
        over = true;
        render();
        var s = revScore(st);
        api.confetti(130);
        if (s.B === s.W) { api.finish('🤝 A perfect draw — ' + s.B + '–' + s.W + '.'); }
        else {
          var winner = s.B > s.W ? 'B' : 'W';
          api.finish('🏆 ' + api.names[winner === 'B' ? 0 : 1] + ' wins ' + Math.max(s.B, s.W) + '–' + Math.min(s.B, s.W) + '!');
        }
      }

      function maybeCpu() {
        if (dead || over || api.mode !== 'cpu' || st.side !== 'W') { return; }
        api.setStatus('🤖 ' + api.names[1] + ' is thinking…');
        K.delay(420, function () {
          if (dead || over) { return; }
          var move = revBest(st, 3);
          if (!move) {
            var skip = revClone(st);
            skip.side = 'B';
            if (!revLegal(skip, 'B').length) { endGame(); return; }
            st = skip;
            render();
            maybeCpu();
            return;
          }
          play(move);
        });
      }

      function render() {
        var moves = legalHere();
        K.each(board, function (cell, r, c) {
          var pc = st.b[r][c];
          var cls = 'gk-cell gk-sq gk-rev ' + ((r + c) % 2 === 0 ? 'gk-light' : 'gk-dark');
          if (!pc) {
            for (var i = 0; i < moves.length; i++) { if (moves[i].r === r && moves[i].c === c) { cls += ' gk-can-go'; } }
          }
          cell.className = cls;
          cell.textContent = '';
          if (pc) { cell.appendChild(h('span', { class: 'gk-disc gk-disc-' + pc })); }
        });
        var s = revScore(st);
        scoreline.textContent = '⚫ Black (you): ' + s.B + '   ⚪ White: ' + s.W;
        if (!over) { api.setStatus('👤 ' + api.names[st.side === 'B' ? 0 : 1] + ' — place a disc on a dotted square.'); }
      }

      render();
      maybeCpu();
      return { destroy: function () { dead = true; } };
    }
  });
})();
