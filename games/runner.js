/* Super Runner — the running game for the Awesome Games Room.
   A side-scrolling sprint: the world rushes past in parallax layers (sky, sun,
   clouds, two rows of hills, trees, grass), the runner's arms and legs really
   swing, and rocks, crates, bushes, pits and birds get in the way. Coins float
   over the jumps. Level 1 is a gentle morning jog; level 5 is a dark night
   sprint with pits everywhere and a second jump in mid-air to help.

   Two players share one device: player 1 runs the level, then hand the device
   over and player 2 runs it — the higher score takes the level. */
(function () {
  'use strict';

  var K = window.GameKit;
  var h = K.h;

  var W = 640, H = 400;
  var GROUND = 320;          /* where the runner's feet land */
  var RUNX = 108;            /* the runner stays put; the whole world moves */
  var PPM = 24;              /* scoreboard metres */
  /* A big, forgiving hop: high enough to clear a crate with room to spare, so
     the jump window a player has to hit is a comfortable quarter of a second. */
  var GRAV = 2000;
  var JUMP = 780;

  var SPEEDS = [236, 272, 308, 348, 392];
  var GOALS = [180, 230, 280, 340, 400];
  var GAPS = [440, 405, 375, 345, 315];
  var HEARTS = [4, 4, 3, 3, 2];

  /* One sky, one ground and one set of hills per level, so level 5 really does
     look like a different time of day. */
  var PALETTES = [
    { top: '#8ec9ff', low: '#e8f6ff', sun: '#fff4c9', far: '#9dc49a', near: '#6fae66',
      grass: '#7cc95c', soil: '#5d9a42', night: false },
    { top: '#48a6f0', low: '#cdeeff', sun: '#fffbe0', far: '#93c6a4', near: '#57a566',
      grass: '#74c557', soil: '#548f3f', night: false },
    { top: '#ef9147', low: '#ffdfae', sun: '#fff1b2', far: '#b98a6b', near: '#8c6a52',
      grass: '#cda471', soil: '#9c7a4e', night: false },
    { top: '#443a72', low: '#cf8fb4', sun: '#ffe6f2', far: '#6a5a86', near: '#4d4266',
      grass: '#6f6280', soil: '#4a4159', night: false },
    { top: '#0a1030', low: '#242e5c', sun: '#dbe5ff', far: '#2b3560', near: '#1e2444',
      grass: '#3a4170', soil: '#262b4e', night: true }
  ];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  /* A steady pseudo-random number for anything the scenery needs to remember
     between frames (tree heights, cloud shapes, stars). */
  function hash(i) { var n = Math.sin(i * 127.1) * 43758.5453; return n - Math.floor(n); }
  function withAlpha(hex, a) {
    var s = String(hex || '#ffffff');
    if (s.charAt(0) !== '#' || s.length < 7) { return s; }
    var v = Math.round(clamp(a, 0, 1) * 255).toString(16);
    return s.slice(0, 7) + (v.length < 2 ? '0' + v : v);
  }
  function mix(hexA, hexB, t) {
    function rgb(s) { return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; }
    var A = rgb(hexA), B = rgb(hexB), out = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(lerp(A[i], B[i], t)).toString(16);
      out += v.length < 2 ? '0' + v : v;
    }
    return out;
  }
  function sfx(name) { if (window.AwesomeSFX) { window.AwesomeSFX.play(name); } }
  function nowMs() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }
  function stat(label, value) {
    var b = h('b', { text: value });
    var s = h('small', { text: label });
    var item = h('span', { class: 'gk-hud-item' }, [b, s]);
    return {
      item: item,
      set: function (v) { if (b.textContent !== v) { b.textContent = v; } }
    };
  }

  K.register({
    id: 'runner',
    name: 'Super Runner',
    emoji: '🏃',
    tag: 'Action',
    blurb: 'Sprint through hills and towns: leap rocks, crates and pits, duck the birds and grab the coins.',
    howTo: 'Your runner never stops running. Tap JUMP (or Space / ↑) to leap — from level 3 you also get a second jump in mid-air. Tap SLIDE (or ↓ / S) to duck under the birds. Rocks, crates, bushes and pits cost a heart; birds must be ducked, not jumped. Every coin is worth 10 points. Reach the flag to win the level. In 2 Players mode you take it in turns and the better score wins.',
    online: false,
    onlineWhy: 'Running needs a live picture on one screen, so online play is off for it — but in 2 Players mode you can take turns and beat each other.',
    levels: 5,
    levelNames: [
      'Level 1 · a morning jog',
      'Level 2 · pits in the park',
      'Level 3 · sunset dash (double jump!)',
      'Level 4 · the windy evening',
      'Level 5 · night sprint'
    ],
    levelHints: [
      'Nice and steady — rocks, crates and bushes only.',
      'Watch out: pits and birds appear!',
      'You can jump a second time in mid-air now.',
      'Faster, busier, with more birds to duck.',
      'Dark and quick, with pits everywhere. Hold your nerve!'
    ],
    mount: function (root, api) {
      var lv = api.level - 1;
      var speed = api.p.ints(SPEEDS);
      var goal = api.p.ints(GOALS);
      var gap = api.p.ints(GAPS);
      var hearts = api.p.ints(HEARTS);
      var pal = PALETTES[lv] || PALETTES[0];
      var canDouble = api.level >= 3;
      var two = api.mode === 'two';
      var prof = window.GamePlayers ? window.GamePlayers.get() : null;
      var colour = [
        prof ? prof.p1.color : '#e63946',
        prof ? (two ? prof.p2.color : prof.cpu.color) : '#2f7fd1'
      ];

      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      canvas.className = 'gk-canvas gk-runner';
      var ctx = canvas.getContext('2d');

      /* --------------------------------------------------------------- HUD */
      var whoStat = stat(two ? 'running now' : 'runner', api.faces[0] + ' ' + api.names[0]);
      var distStat = stat('of ' + goal + ' m to go', '0 m');
      var coinStat = stat('coins', '🪙 0');
      var lifeStat = stat('hearts left', '');
      var fill = h('i', { class: 'gk-hud-fill' });
      var meter = h('span', { class: 'gk-hud-meter' }, fill);
      var hud = h('div', { class: 'gk-hud' }, [whoStat.item, distStat.item, coinStat.item, lifeStat.item, meter]);

      /* ---------------------------------------------------------- controls */
      var held = { slide: false };
      var wantJump = false;
      var jumpBtn = h('button', { class: 'gk-actbtn gk-actbtn-go gk-actbtn-jump', type: 'button', 'aria-label': 'Jump' }, '⤒ Jump');
      var slideBtn = h('button', { class: 'gk-actbtn gk-actbtn-slide', type: 'button', 'aria-label': 'Slide' }, '⤓ Slide');
      var row = h('div', { class: 'gk-actrow' }, [slideBtn, jumpBtn]);
      var controls = h('div', { class: 'gk-controls gk-actcontrols' }, row);

      function tapDown(node, onDown, onUp) {
        node.addEventListener('pointerdown', function (e) { e.preventDefault(); onDown(); });
        node.addEventListener('pointerup', function () { onUp(); });
        node.addEventListener('pointerleave', function () { onUp(); });
        node.addEventListener('pointercancel', function () { onUp(); });
      }
      tapDown(jumpBtn, function () { wantJump = true; }, function () { /* one-shot */ });
      tapDown(slideBtn, function () { held.slide = true; }, function () { held.slide = false; });

      function onKeyDown(e) {
        var k = e.key;
        if (k === ' ' || k === 'Spacebar' || k === 'ArrowUp' || k === 'w' || k === 'W') {
          if (!e.repeat) { wantJump = true; }
          if (e.preventDefault) { e.preventDefault(); }
        }
        if (k === 'ArrowDown' || k === 's' || k === 'S') { held.slide = true; if (e.preventDefault) { e.preventDefault(); } }
      }
      function onKeyUp(e) {
        var k = e.key;
        if (k === 'ArrowDown' || k === 's' || k === 'S') { held.slide = false; }
      }
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('keyup', onKeyUp);

      /* -------------------------------------------------------- the world */
      var state = null;
      var scores = [0, 0];
      var lastPct = -1;
      var dead = false;

      function startRun(who) {
        state = {
          who: who, travelled: 0, speed: speed, coins: 0, lives: hearts,
          y: 0, vy: 0, onGround: true, jumps: 0, buffer: 0, slide: false,
          hurt: 0, phase: 0, over: false, paused: false,
          obstacles: [], coinsOn: [], dust: [], sparks: [], texts: [],
          spawnAt: 560, shake: 0, flash: 0, flagX: goal * PPM
        };
        whoStat.set(api.faces[who] + ' ' + api.names[who]);
        paintHud(true);
        api.setStatus('👤 ' + api.names[who] + ' — JUMP the rocks and crates, SLIDE under the birds. ' +
          goal + ' m to the flag.');
        sfx('click');
      }

      /* --------------------------------------------------------------- HUD */
      function paintHud(force) {
        var metres = Math.floor(state.travelled / PPM);
        distStat.set(Math.min(metres, goal) + ' m');
        coinStat.set('🪙 ' + state.coins);
        var heartsText = '';
        for (var i = 0; i < hearts; i++) { heartsText += i < state.lives ? '❤' : '🤍'; }
        lifeStat.set(heartsText);
        var pct = clamp(state.travelled / (goal * PPM), 0, 1);
        if (force || pct - lastPct > 0.004) {
          fill.style.width = (pct * 100).toFixed(1) + '%';
          lastPct = pct;
        }
      }
      function score() { return Math.floor(state.travelled / PPM) + state.coins * 10; }

      /* -------------------------------------------------------- particles */
      function dust(x, y, n, colour) {
        for (var i = 0; i < n; i++) {
          state.dust.push({
            x: x + (Math.random() * 16 - 8), y: y + (Math.random() * 6 - 3),
            vx: -30 - Math.random() * 70, vy: -20 - Math.random() * 60,
            r: 2 + Math.random() * 3.4, life: 0.5 + Math.random() * 0.5, max: 1,
            c: colour || 'rgba(255,255,255,.75)'
          });
        }
      }
      function sparkle(x, y, colour, n) {
        for (var i = 0; i < (n || 10); i++) {
          var a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 130;
          state.sparks.push({
            x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
            life: 0.4 + Math.random() * 0.5, c: colour || '#ffd54a'
          });
        }
      }
      function floatText(x, y, text, colour) {
        state.texts.push({ x: x, y: y, text: text, life: 0.9, c: colour || '#fff' });
      }

      function updateParticles(dt) {
        var i;
        for (i = state.dust.length - 1; i >= 0; i--) {
          var d = state.dust[i];
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.vy += 120 * dt;
          d.life -= dt;
          if (d.life <= 0) { state.dust.splice(i, 1); }
        }
        for (i = state.sparks.length - 1; i >= 0; i--) {
          var s = state.sparks[i];
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vy += 420 * dt;
          s.life -= dt;
          if (s.life <= 0) { state.sparks.splice(i, 1); }
        }
        for (i = state.texts.length - 1; i >= 0; i--) {
          var t = state.texts[i];
          t.y -= 34 * dt;
          t.life -= dt;
          if (t.life <= 0) { state.texts.splice(i, 1); }
        }
      }

      /* ------------------------------------------------------- the running */
      function spec(kind, lv) {
        if (kind === 'rock') { return { w: 34, h: 34, bottom: 0 }; }
        if (kind === 'crate') { return { w: 46, h: 62, bottom: 0 }; }
        if (kind === 'bush') { return { w: 64, h: 26, bottom: 0 }; }
        if (kind === 'pit') { return { w: 92 + lv * 6, h: 0, bottom: 0 }; }
        return { w: 44, h: 26, bottom: 58 };            /* bird */
      }
      function kindsFor(lv) {
        var list = ['rock', 'crate', 'bush', 'rock', 'crate'];
        if (lv >= 1) { list.push('pit', 'bird', 'bird'); }
        if (lv >= 2) { list.push('pit'); }
        if (lv >= 3) { list.push('bird', 'bird', 'pit'); }
        return list;
      }
      function spawnAt(x) {
        var list = kindsFor(lv);
        var kind = list[Math.floor(Math.random() * list.length)];
        var s = spec(kind, lv);
        state.obstacles.push({ kind: kind, x: x, w: s.w, h: s.h, bottom: s.bottom, flap: hash(x) * 6 });
      }
      function spawnCoins(x, y) {
        var arc = 3 + Math.floor(Math.random() * 3);
        for (var i = 0; i < arc; i++) {
          state.coinsOn.push({ x: x + i * 34, hgt: y, spin: hash(x + i) * 6 });
        }
      }

      function step(dt) {
        updateParticles(dt);
        state.shake *= 0.86;
        state.flash = Math.max(0, state.flash - dt * 2.4);
        state.hurt = Math.max(0, state.hurt - dt);
        if (state.over) { return; }

        state.travelled += state.speed * dt;
        state.phase += dt * (state.onGround ? state.speed * 0.055 : 5.5);
        state.slide = state.onGround && held.slide;

        /* jumping, with a short buffer so a tap just before landing still works */
        if (wantJump) { wantJump = false; state.buffer = 0.15; }
        else { state.buffer = Math.max(0, state.buffer - dt); }
        if (state.buffer > 0) {
          if (state.onGround) {
            state.vy = JUMP;
            state.onGround = false;
            state.jumps = 1;
            state.buffer = 0;
            dust(RUNX, GROUND, 7, withAlpha(pal.soil, 0.7));
            sfx('step');
          } else if (canDouble && state.jumps < 2) {
            state.vy = JUMP * 0.88;
            state.jumps = 2;
            state.buffer = 0;
            for (var a = 0; a < 12; a++) {
              state.sparks.push({
                x: RUNX, y: GROUND - state.y + 6, vx: Math.cos(a / 12 * Math.PI * 2) * 90,
                vy: Math.sin(a / 12 * Math.PI * 2) * 60, life: 0.35, c: '#bfe8ff'
              });
            }
            sfx('pop');
          }
        }

        /* gravity */
        var wasAir = !state.onGround;
        state.vy -= GRAV * dt;
        state.y += state.vy * dt;
        if (state.y <= 0) {
          state.y = 0;
          state.vy = 0;
          state.onGround = true;
          state.jumps = 0;
          if (wasAir && !state.over) { dust(RUNX, GROUND, 6, withAlpha(pal.soil, 0.6)); }
        } else {
          state.onGround = false;
        }

        /* dust puffs under the feet while running */
        if (state.onGround && !state.slide && Math.sin(state.phase) > 0.97) {
          dust(RUNX - 10, GROUND, 2, withAlpha('#ffffff', 0.55));
        }

        /* new obstacles arrive from the right */
        while (state.spawnAt < state.travelled + W + 260) {
          spawnAt(state.spawnAt);
          var next = state.spawnAt + gap * (0.86 + hash(state.spawnAt) * 0.5);
          if (Math.random() < 0.55) { spawnCoins(state.spawnAt + gap * 0.45, 40 + Math.random() * 56); }
          state.spawnAt = next;
        }

        /* move/drop the old ones */
        var i, ob;
        for (i = state.obstacles.length - 1; i >= 0; i--) {
          ob = state.obstacles[i];
          if (ob.x - state.travelled + RUNX < -160) { state.obstacles.splice(i, 1); }
        }
        for (i = state.coinsOn.length - 1; i >= 0; i--) {
          if (state.coinsOn[i].x - state.travelled + RUNX < -60) { state.coinsOn.splice(i, 1); }
        }

        /* bumps and coins */
        var ph = state.slide ? 26 : 54;
        var pw = state.slide ? 34 : 28;
        for (i = 0; i < state.obstacles.length; i++) {
          ob = state.obstacles[i];
          var sx = ob.x - state.travelled;
          if (sx > pw / 2 + 2 || sx + ob.w < -pw / 2 - 2 || state.hurt > 0) { continue; }
          if (ob.kind === 'pit') {
            if (state.y <= 1) { fall(ob); }
            break;
          }
          if (state.y < ob.bottom + ob.h && state.y + ph > ob.bottom) { bump(ob); break; }
        }
        if (state.hurt <= 0) {
          var body = state.y + ph;
          for (i = state.coinsOn.length - 1; i >= 0; i--) {
            var c = state.coinsOn[i];
            var dx = c.x - state.travelled;
            if (Math.abs(dx) < 30 && state.y < c.hgt + 17 && body > c.hgt - 17) {
              state.coins++;
              sparkle(RUNX + dx * 0.3, GROUND - c.hgt, '#ffd54a', 12);
              floatText(RUNX + 26, GROUND - c.hgt - 12, '+10', '#ffd54a');
              state.coinsOn.splice(i, 1);
              sfx('pop');
            }
          }
        }

        if (state.travelled / PPM >= goal) { finish(true); }
        paintHud(false);
      }

      function bump(ob) {
        state.lives--;
        state.hurt = 1.5;
        state.shake = 14;
        state.flash = 0.45;
        state.vy = 180;
        state.y = Math.max(state.y, 6);
        sparkle(RUNX + (ob.x - state.travelled), GROUND - state.y - 40, '#ff6b6b', 14);
        floatText(RUNX, GROUND - state.y - 70, '-1 ❤', '#ff6b6b');
        sfx('wrong');
        if (state.lives <= 0) { finish(false); }
      }
      function fall(ob) {
        state.lives--;
        state.hurt = 1.6;
        state.shake = 16;
        state.flash = 0.5;
        state.travelled = ob.x + ob.w + 30;
        state.y = 120;
        state.vy = -40;
        state.onGround = false;
        sfx('capture');
        if (state.lives <= 0) { finish(false); }
        else { api.setStatus('😬 ' + api.names[state.who] + ' fell in a pit! ' + state.lives + ' hearts left.'); }
      }

      /* ----------------------------------------------------------- ending */
      function finish(cleared) {
        if (state.over) { return; }
        state.over = true;
        scores[state.who] = score();
        if (two && state.who === 0) {
          state.paused = true;
          api.setStatus('🔄 ' + api.names[0] + ' scored ' + scores[0] + ' points — now it is ' +
            api.names[1] + '’s turn.');
          K.cover(root, '🔄 Pass the device',
            api.names[0] + ' scored ' + scores[0] + ' points. Hand the device to ' + api.names[1] + ' — no peeking!',
            api.names[1] + ' is ready',
            function () { startRun(1); });
          return;
        }
        var text;
        if (two) {
          if (scores[0] === scores[1]) {
            text = '🤝 Level ' + api.level + ' was a draw — ' + scores[0] + ' points each!';
          } else {
            var w = scores[0] > scores[1] ? 0 : 1;
            text = '🏆 ' + api.names[w] + ' wins level ' + api.level + ' with ' + scores[w] + ' points (' +
              scores[1 - w] + ' for ' + api.names[1 - w] + ')!';
          }
        } else if (cleared) {
          text = '🏆 ' + api.names[0] + ' reached the flag on level ' + api.level + ' — ' +
            Math.floor(state.travelled / PPM) + ' m, 🪙 ' + state.coins + ' and ' + score() + ' points!';
        } else {
          text = '💔 ' + api.names[0] + ' ran out of hearts after ' + Math.floor(state.travelled / PPM) +
            ' m on level ' + api.level + ' — ' + api.names[1] + ' takes this one. Try again!';
        }
        api.confetti(cleared ? 160 : 40);
        api.finish(text);
      }

      /* ---------------------------------------------------------- drawing */
      function skyGradient() {
        var g = ctx.createLinearGradient(0, 0, 0, GROUND);
        g.addColorStop(0, pal.top);
        g.addColorStop(1, pal.low);
        return g;
      }

      function drawSky() {
        ctx.fillStyle = skyGradient();
        ctx.fillRect(0, 0, W, GROUND + 2);
        var i;
        if (pal.night) {
          for (i = 0; i < 70; i++) {
            var sx = (hash(i * 3.3) * W + state.travelled * 0.02) % W;
            var sy = hash(i * 7.7) * (GROUND - 90);
            var tw = 0.45 + 0.55 * Math.abs(Math.sin(state.travelled * 0.002 + i));
            ctx.fillStyle = withAlpha('#ffffff', tw * 0.85);
            ctx.fillRect(sx, sy, 2, 2);
          }
        }
        /* sun or moon with a soft halo */
        var sunY = pal.night ? 72 : 84;
        ctx.save();
        var halo = ctx.createRadialGradient(W - 120, sunY, 6, W - 120, sunY, 96);
        halo.addColorStop(0, withAlpha(pal.sun, 0.55));
        halo.addColorStop(1, withAlpha(pal.sun, 0));
        ctx.fillStyle = halo;
        ctx.fillRect(W - 240, sunY - 100, 240, 200);
        ctx.fillStyle = pal.sun;
        ctx.beginPath();
        ctx.arc(W - 120, sunY, pal.night ? 22 : 27, 0, Math.PI * 2);
        ctx.fill();
        if (pal.night) {
          ctx.fillStyle = withAlpha(pal.top, 0.85);
          ctx.beginPath();
          ctx.arc(W - 112, sunY - 8, 19, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      function hillRow(offset, baseY, amp, step, colour, phase) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (var x = 0; x <= W; x += step) {
          var wx = x + offset;
          var y = baseY - Math.sin(wx * 0.0042 + phase) * amp - Math.sin(wx * 0.0117 + phase * 2) * amp * 0.42;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();
      }

      function drawParallax() {
        var i, x, scale;
        /* clouds drift slowly, two depths */
        for (i = 0; i < 7; i++) {
          x = ((i * 260 + 40 - state.travelled * 0.16) % (W + 300)) - 150;
          var cy = 34 + hash(i) * 58;
          scale = 0.7 + hash(i + 9) * 0.7;
          ctx.fillStyle = withAlpha(pal.night ? '#3a4677' : '#ffffff', pal.night ? 0.5 : 0.78);
          puff(x, cy, 26 * scale);
          puff(x + 24 * scale, cy + 8 * scale, 19 * scale);
          puff(x - 22 * scale, cy + 9 * scale, 16 * scale);
        }
        hillRow(state.travelled * 0.12, GROUND - 46, 26, 16, pal.far, 0.4);
        hillRow(state.travelled * 0.24, GROUND - 22, 18, 14, mix(pal.far, pal.near, 0.5), 2.1);
        /* trees on the near hill */
        var nearOffset = state.travelled * 0.5;
        var first = Math.floor((nearOffset - 80) / 150);
        var last = Math.ceil((nearOffset + W + 80) / 150);
        for (i = first; i <= last; i++) {
          x = i * 150 - nearOffset + 30;
          var tall = 30 + hash(i * 2.7) * 26;
          drawTree(x, GROUND - 12, tall, mix(pal.near, '#0c2a12', 0.25), i);
        }
        hillRow(state.travelled * 0.5, GROUND - 6, 9, 12, pal.near, 4.2);
      }

      function puff(x, y, r) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      function drawTree(x, base, tall, colour, seed) {
        var trunk = '#6b4a2f';
        ctx.fillStyle = trunk;
        ctx.fillRect(x - 3, base - tall * 0.45, 6, tall * 0.45);
        ctx.fillStyle = colour;
        if (hash(seed * 5.1) > 0.5) {
          ctx.beginPath();
          ctx.arc(x, base - tall, tall * 0.62, 0, Math.PI * 2);
          ctx.arc(x - tall * 0.5, base - tall * 0.7, tall * 0.42, 0, Math.PI * 2);
          ctx.arc(x + tall * 0.5, base - tall * 0.72, tall * 0.44, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(x, base - tall * 1.7);
          ctx.lineTo(x - tall * 0.7, base - tall * 0.35);
          ctx.lineTo(x + tall * 0.7, base - tall * 0.35);
          ctx.closePath();
          ctx.fill();
        }
      }

      function drawGround() {
        var g = ctx.createLinearGradient(0, GROUND, 0, H);
        g.addColorStop(0, pal.grass);
        g.addColorStop(1, pal.soil);
        ctx.fillStyle = g;
        ctx.fillRect(0, GROUND, W, H - GROUND);
        ctx.fillStyle = withAlpha('#ffffff', 0.22);
        ctx.fillRect(0, GROUND, W, 4);
        /* moving stripes and pebbles give the ground its speed */
        var off = state.travelled % 64;
        ctx.fillStyle = withAlpha(pal.soil, 0.5);
        for (var x = -off; x < W; x += 64) { ctx.fillRect(x, GROUND + 12, 30, 4); }
        for (var i = 0; i < 26; i++) {
          var px = ((i * 97 + 20 - state.travelled * 0.9) % (W + 40)) - 20;
          var py = GROUND + 24 + hash(i * 4.4) * 44;
          ctx.fillStyle = withAlpha(pal.soil, 0.55);
          ctx.fillRect(px, py, 7, 5);
        }
        /* pits cut into the ground */
        for (var k = 0; k < state.obstacles.length; k++) {
          var ob = state.obstacles[k];
          if (ob.kind !== 'pit') { continue; }
          var sx = ob.x - state.travelled + RUNX;
          if (sx > W || sx + ob.w < 0) { continue; }
          var pg = ctx.createLinearGradient(0, GROUND, 0, GROUND + 70);
          pg.addColorStop(0, '#1a1508');
          pg.addColorStop(1, withAlpha('#000000', 0.15));
          ctx.fillStyle = pg;
          ctx.fillRect(sx, GROUND, ob.w, H - GROUND);
          ctx.fillStyle = withAlpha('#ffffff', 0.18);
          ctx.fillRect(sx, GROUND, 4, 14);
          ctx.fillRect(sx + ob.w - 4, GROUND, 4, 14);
        }
        /* grass tufts in front of everything */
        var toff = (state.travelled * 1.35) % 46;
        ctx.strokeStyle = withAlpha(pal.grass, 0.85);
        ctx.lineWidth = 2;
        for (var t = -toff; t < W; t += 46) {
          ctx.beginPath();
          ctx.moveTo(t, GROUND + 16);
          ctx.quadraticCurveTo(t + 4, GROUND + 6, t + 9, GROUND + 1);
          ctx.stroke();
        }
      }

      function drawFlag() {
        var sx = state.flagX - state.travelled + RUNX;
        if (sx < -60 || sx > W + 60) { return; }
        ctx.fillStyle = '#f5f0e6';
        ctx.fillRect(sx - 2, GROUND - 96, 5, 96);
        var wave = Math.sin(state.travelled * 0.02) * 4;
        ctx.fillStyle = colour[0];
        ctx.beginPath();
        ctx.moveTo(sx + 3, GROUND - 96);
        ctx.lineTo(sx + 46 + wave, GROUND - 84);
        ctx.lineTo(sx + 3, GROUND - 66);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = withAlpha('#000000', 0.18);
        ctx.fillRect(sx - 6, GROUND - 4, 13, 4);
      }

      function drawCoins() {
        for (var i = 0; i < state.coinsOn.length; i++) {
          var c = state.coinsOn[i];
          var sx = c.x - state.travelled + RUNX;
          if (sx < -40 || sx > W + 40) { continue; }
          var sy = GROUND - c.hgt + Math.sin(state.travelled * 0.01 + c.spin) * 3;
          var wobble = Math.abs(Math.cos(state.travelled * 0.006 + c.spin));
          ctx.save();
          ctx.shadowColor = 'rgba(255,197,60,.9)';
          ctx.shadowBlur = 12;
          ctx.fillStyle = '#ffd54a';
          ctx.beginPath();
          ctx.ellipse(sx, sy, 9 * (0.35 + 0.65 * wobble), 9, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = withAlpha('#fff6c9', 0.9);
          ctx.beginPath();
          ctx.ellipse(sx, sy, 4 * (0.35 + 0.65 * wobble), 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      function drawObstacles() {
        for (var i = 0; i < state.obstacles.length; i++) {
          var ob = state.obstacles[i];
          var sx = ob.x - state.travelled + RUNX;
          var sw = ob.w;
          if (sx > W + 20 || sx + sw < -20 || ob.kind === 'pit') { continue; }
          if (ob.kind === 'rock') {
            var rg = ctx.createLinearGradient(sx, GROUND - ob.h, sx + ob.w, GROUND);
            rg.addColorStop(0, '#b9b3ab');
            rg.addColorStop(1, '#6d675f');
            ctx.fillStyle = rg;
            ctx.beginPath();
            ctx.moveTo(sx, GROUND);
            ctx.lineTo(sx + 6, GROUND - ob.h + 6);
            ctx.lineTo(sx + ob.w * 0.55, GROUND - ob.h);
            ctx.lineTo(sx + ob.w, GROUND - 8);
            ctx.lineTo(sx + ob.w - 3, GROUND);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = withAlpha('#ffffff', 0.28);
            ctx.fillRect(sx + 8, GROUND - ob.h + 12, 7, 5);
          } else if (ob.kind === 'crate') {
            ctx.fillStyle = '#c98b46';
            ctx.fillRect(sx, GROUND - ob.h, ob.w, ob.h);
            ctx.strokeStyle = '#8d5f2b';
            ctx.lineWidth = 4;
            ctx.strokeRect(sx + 2, GROUND - ob.h + 2, ob.w - 4, ob.h - 4);
            ctx.beginPath();
            ctx.moveTo(sx + 3, GROUND - ob.h + 3);
            ctx.lineTo(sx + ob.w - 3, GROUND - 3);
            ctx.moveTo(sx + ob.w - 3, GROUND - ob.h + 3);
            ctx.lineTo(sx + 3, GROUND - 3);
            ctx.stroke();
          } else if (ob.kind === 'bush') {
            ctx.fillStyle = withAlpha(pal.near, 0.95);
            puff(sx + 14, GROUND - 14, 14);
            puff(sx + 32, GROUND - 18, 17);
            puff(sx + 50, GROUND - 13, 13);
            ctx.fillStyle = withAlpha('#ffffff', 0.18);
            puff(sx + 30, GROUND - 26, 7);
          } else {
            /* bird: flaps with a fixed wing-beat, duck under it */
            var flap = Math.sin(state.travelled * 0.03 + ob.flap) * 8;
            var by = GROUND - ob.bottom - ob.h / 2 + Math.sin(state.travelled * 0.02 + ob.flap) * 4;
            ctx.strokeStyle = '#3c3c4a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(sx + 8, by - 4);
            ctx.quadraticCurveTo(sx + 18, by - 16 - flap, sx + 26, by - 3);
            ctx.moveTo(sx + 26, by - 3);
            ctx.quadraticCurveTo(sx + 34, by - 16 + flap, sx + 44, by - 4);
            ctx.stroke();
            ctx.fillStyle = '#22222c';
            ctx.beginPath();
            ctx.ellipse(sx + 26, by, 12, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ff9f1a';
            ctx.beginPath();
            ctx.moveTo(sx + 15, by - 1);
            ctx.lineTo(sx + 6, by + 3);
            ctx.lineTo(sx + 15, by + 5);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(sx + 30, by - 2, 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(sx + 30.6, by - 2, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      /* ------------------------------------------------- the runner itself */
      function limb(x, y, a1, l1, a2, l2, colour, wide) {
        var kx = x + Math.sin(a1) * l1;
        var ky = y + Math.cos(a1) * l1;
        var fx = kx + Math.sin(a1 + a2) * l2;
        var fy = ky + Math.cos(a1 + a2) * l2;
        ctx.strokeStyle = colour;
        ctx.lineWidth = wide;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(kx, ky);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        return { x: fx, y: fy };
      }

      function drawRunner() {
        var body = colour[state.who] || '#e63946';
        var dark = mix(body, '#000000', 0.3);
        var light = mix(body, '#ffffff', 0.35);
        var skin = '#f7c9a3';
        var hair = '#3c2a1e';
        var air = !state.onGround;
        var sliding = state.slide && state.onGround;
        var hurt = state.hurt > 0 && Math.floor(state.hurt * 14) % 2 === 0;
        var p = state.phase;
        var swing = Math.sin(p), swing2 = Math.sin(p + Math.PI);

        ctx.save();
        ctx.translate(RUNX, GROUND - state.y);
        if (hurt) { ctx.globalAlpha = 0.65; }
        if (sliding) {
          ctx.rotate(-1.05);
          ctx.translate(4, -6);
        } else if (air) {
          ctx.rotate(0.12);
        }

        var legA, legB, kneeA, kneeB, armA, armB;
        if (air) {
          legA = 0.75; kneeA = -1.6;
          legB = -0.5; kneeB = -0.7;
          armA = -2.5; armB = -1.9;
        } else if (sliding) {
          legA = 1.1; kneeA = -1.3;
          legB = -0.25; kneeB = -0.5;
          armA = -0.4; armB = -0.9;
        } else {
          legA = swing * 0.85; kneeA = -0.15 - Math.max(0, swing) * 1.15;
          legB = swing2 * 0.85; kneeB = -0.15 - Math.max(0, swing2) * 1.15;
          armA = -0.2 - swing * 1.0;
          armB = -0.2 - swing2 * 1.0;
        }

        /* shadow under the runner */
        ctx.save();
        ctx.fillStyle = withAlpha('#000000', air ? 0.14 : 0.24);
        ctx.beginPath();
        ctx.ellipse(4, 2, sliding ? 26 : 18, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        /* back leg */
        var foot = limb(-3, -26, legB, 15, kneeB, 15, dark, 9);
        ctx.fillStyle = '#f4f4f4';
        ctx.beginPath();
        ctx.ellipse(foot.x + 3, foot.y + 1, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        /* back arm */
        limb(-4, -44, armB, 12, -0.9, 11, mix(skin, '#000000', 0.12), 7);

        /* torso */
        var tg = ctx.createLinearGradient(0, -50, 0, -22);
        tg.addColorStop(0, light);
        tg.addColorStop(1, body);
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.moveTo(-9, -23);
        ctx.lineTo(-8, -44);
        ctx.quadraticCurveTo(0, -50, 8, -44);
        ctx.lineTo(9, -23);
        ctx.quadraticCurveTo(0, -19, -9, -23);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = withAlpha('#ffffff', 0.35);
        ctx.fillRect(-3, -44, 3, 20);
        ctx.fillStyle = dark;
        ctx.fillRect(-9, -25, 18, 4);

        /* front leg + front arm */
        var foot2 = limb(3, -26, legA, 15, kneeA, 15, body, 9);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(foot2.x + 4, foot2.y + 1, 8, 4.4, 0, 0, Math.PI * 2);
        ctx.fill();
        /* scarf trails behind */
        ctx.strokeStyle = dark;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-4, -46);
        for (var i = 0; i < 4; i++) {
          ctx.lineTo(-12 - i * 9, -46 + Math.sin(p * 1.6 + i * 0.9) * (5 + i));
        }
        ctx.stroke();

        limb(4, -44, armA, 12, -0.9, 11, skin, 7);

        /* head */
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.arc(2, -57, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hair;
        ctx.beginPath();
        ctx.arc(2, -59, 11.4, Math.PI * 1.05, Math.PI * 2.05);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(11, -62);
        ctx.quadraticCurveTo(19, -60 + Math.sin(p * 1.6) * 3, 16, -52);
        ctx.quadraticCurveTo(14, -58, 10, -58);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#22303f';
        ctx.beginPath();
        ctx.arc(8, -57, 1.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c0765a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(7, -52, 3.4, 0.15, Math.PI - 0.2);
        ctx.stroke();
        ctx.restore();
      }

      function drawParticles() {
        var i;
        for (i = 0; i < state.dust.length; i++) {
          var d = state.dust[i];
          ctx.fillStyle = d.c;
          ctx.globalAlpha = clamp(d.life * 1.6, 0, 1);
          ctx.beginPath();
          ctx.arc(d.x, GROUND - 4 + d.y * 0.2, d.r * d.life, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        for (i = 0; i < state.sparks.length; i++) {
          var s = state.sparks[i];
          ctx.fillStyle = s.c;
          ctx.globalAlpha = clamp(s.life * 2, 0, 1);
          ctx.beginPath();
          ctx.arc(s.x, s.y, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.font = 'bold 17px system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (i = 0; i < state.texts.length; i++) {
          var t = state.texts[i];
          ctx.globalAlpha = clamp(t.life, 0, 1);
          ctx.fillStyle = t.c;
          ctx.fillText(t.text, t.x, t.y);
        }
        ctx.globalAlpha = 1;
      }

      function drawSpeedLines() {
        var strength = clamp((state.speed - 280) / 120, 0, 1);
        if (strength <= 0.02) { return; }
        ctx.strokeStyle = withAlpha('#ffffff', 0.14 * strength);
        ctx.lineWidth = 2;
        for (var i = 0; i < 7; i++) {
          var y = 40 + hash(i * 9.1 + Math.floor(state.travelled / 90)) * (GROUND - 90);
          var x = W - ((state.travelled * 1.6 + i * 130) % (W + 240));
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 60 + strength * 40, y);
          ctx.stroke();
        }
      }

      function draw() {
        ctx.save();
        if (state.shake > 0.4) {
          ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
        }
        drawSky();
        drawParallax();
        drawGround();
        drawFlag();
        drawCoins();
        drawObstacles();
        drawRunner();
        drawParticles();
        drawSpeedLines();
        ctx.restore();
        if (state.flash > 0.01) {
          ctx.fillStyle = withAlpha('#ff3b3b', state.flash * 0.45);
          ctx.fillRect(0, 0, W, H);
        }
      }

      /* ------------------------------------------------------------- loop */
      var schedule = window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : function (fn) { return window.setTimeout(function () { fn(nowMs()); }, 16); };
      var unschedule = window.cancelAnimationFrame
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout.bind(window);
      var last = 0, handle = 0;
      function frame(ts) {
        if (dead) { return; }
        var t = typeof ts === 'number' ? ts : nowMs();
        var dt = last ? clamp((t - last) / 1000, 0, 0.05) : 1 / 60;
        last = t;
        if (!state.paused) { step(dt); }
        draw();
        handle = schedule(frame);
      }

      root.appendChild(hud);
      root.appendChild(canvas);
      root.appendChild(controls);
      startRun(0);
      handle = schedule(frame);

      return {
        destroy: function () {
          dead = true;
          unschedule(handle);
          document.removeEventListener('keydown', onKeyDown);
          document.removeEventListener('keyup', onKeyUp);
        }
      };
    }
  });
})();
