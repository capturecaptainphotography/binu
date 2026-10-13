/* Turbo Race — the car racing game for the Awesome Games Room.
   A fast pseudo-3D sprint: the road sweeps and bends towards the horizon, the
   rumble strips and lane dashes rush at you, trees, signs, street lamps and
   chevron boards fly past, and slower vans, cars and trucks have to be dodged
   (or overtaken for points). Levels 4 and 5 are night races with headlights.
   Hold GO to speed up, BRAKE to slow down and tap NITRO for a burst — but hit a
   car and you lose a heart.

   Two players share one device: player 1 drives the level, then hand the device
   over; the better score takes the level. */
(function () {
  'use strict';

  var K = window.GameKit;
  var h = K.h;

  var W = 640, H = 400;
  var HORIZON = 122;
  var VIEWD = 440;             /* how far ahead of the car the camera can see */
  var ROADW = 470;             /* road width at the very bottom of the screen */
  var PLAYER_DIST = 62;        /* where the player's car sits in that view */
  var PPM = 8;                 /* world pixels per scoreboard metre */

  var SPEEDS = [212, 238, 262, 288, 316];
  var GOALS = [600, 800, 1000, 1200, 1400];
  var GAPS = [430, 390, 355, 320, 285];
  var STEER = [1.5, 1.6, 1.72, 1.84, 1.96];
  var HEARTS = [4, 4, 3, 3, 2];

  var TRAFFIC = ['car', 'van', 'car', 'truck', 'car', 'van'];
  var VANCOLOURS = ['#e63946', '#2f7fd1', '#f4801a', '#2f9e63', '#8b5cf6', '#e8a300', '#12a5a5', '#e8578f'];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
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
      var v = Math.round(A[i] + (B[i] - A[i]) * t).toString(16);
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
    return { item: item, set: function (v) { if (b.textContent !== v) { b.textContent = v; } } };
  }

  K.register({
    id: 'racer',
    name: 'Turbo Race',
    emoji: '🏎️',
    tag: 'Action',
    blurb: 'Race a twisting road: dodge the traffic, overtake for points and hit the flag before your hearts run out.',
    howTo: 'Hold GO (or the space bar) to speed up, BRAKE (or ↓) to slow down and tap NITRO (or N) for a burst of speed. Steer with ◀ ▶ (or A / D, or the left and right arrow keys). Going off the road makes you slow and bumpy, and crashing into a van, car or truck costs a heart — but every car you overtake is worth 25 points. Reach the finish arch to win the level. In 2 Players mode you take it in turns and the better score wins.',
    online: false,
    onlineWhy: 'Racing needs a live picture on one screen, so online play is off — but in 2 Players mode you can take turns and beat each other.',
    levels: 5,
    levelNames: [
      'Level 1 · a morning drive',
      'Level 2 · busy country road',
      'Level 3 · twisty hills and trucks',
      'Level 4 · night race (headlights on)',
      'Level 5 · the grand prix'
    ],
    levelHints: [
      'Gentle bends and a little traffic.',
      'More traffic and quicker bends.',
      'Trucks everywhere — pick your lane.',
      'Dark, with headlights and street lamps.',
      'Fast, crowded and very twitchy. Use your nitro!'
    ],
    mount: function (root, api) {
      var lv = api.level - 1;
      var topSpeed = api.p.ints(SPEEDS);
      var goal = api.p.ints(GOALS);
      var gap = api.p.ints(GAPS);
      var steerSpeed = api.p.ints(STEER);
      var hearts = api.p.ints(HEARTS);
      var night = api.level >= 4;
      var two = api.mode === 'two';
      var prof = window.GamePlayers ? window.GamePlayers.get() : null;
      var colour = [
        prof ? prof.p1.color : '#e63946',
        prof ? (two ? prof.p2.color : prof.cpu.color) : '#2f7fd1'
      ];

      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      canvas.className = 'gk-canvas gk-racer';
      var ctx = canvas.getContext('2d');

      /* --------------------------------------------------------------- HUD */
      var whoStat = stat(two ? 'driving now' : 'driver', api.faces[0] + ' ' + api.names[0]);
      var distStat = stat('of ' + goal + ' m', '0 m');
      var speedStat = stat('km/h', '0');
      var passStat = stat('cars overtaken', '0');
      var lifeStat = stat('hearts left', '');
      var nitroStat = stat('nitro', 'ready 🔥');
      var fill = h('i', { class: 'gk-hud-fill' });
      var meter = h('span', { class: 'gk-hud-meter' }, fill);
      var hud = h('div', { class: 'gk-hud' }, [
        whoStat.item, distStat.item, speedStat.item, passStat.item, lifeStat.item, nitroStat.item, meter
      ]);

      /* ---------------------------------------------------------- controls */
      var held = { left: false, right: false, gas: false, brake: false };
      var moveL = h('button', { class: 'gk-actbtn gk-actbtn-move', type: 'button', 'aria-label': 'Steer left' }, '◀');
      var moveR = h('button', { class: 'gk-actbtn gk-actbtn-move', type: 'button', 'aria-label': 'Steer right' }, '▶');
      var nitroBtn = h('button', { class: 'gk-actbtn gk-actbtn-nitro', type: 'button', 'aria-label': 'Nitro boost' }, '🔥 Nitro');
      var gasBtn = h('button', { class: 'gk-actbtn gk-actbtn-go gk-actbtn-gas', type: 'button', 'aria-label': 'Accelerate' }, '⛽ Go');
      var brakeBtn = h('button', { class: 'gk-actbtn gk-actbtn-brake', type: 'button', 'aria-label': 'Brake' }, '🛑 Brake');
      var rowA = h('div', { class: 'gk-actrow' }, [moveL, nitroBtn, moveR]);
      var rowB = h('div', { class: 'gk-actrow' }, [gasBtn, brakeBtn]);
      var controls = h('div', { class: 'gk-controls gk-actcontrols' }, h('div', { class: 'gk-actcluster' }, [rowA, rowB]));

      function hold(node, key) {
        node.addEventListener('pointerdown', function (e) { e.preventDefault(); held[key] = true; });
        node.addEventListener('pointerup', function () { held[key] = false; });
        node.addEventListener('pointerleave', function () { held[key] = false; });
        node.addEventListener('pointercancel', function () { held[key] = false; });
      }
      hold(moveL, 'left');
      hold(moveR, 'right');
      hold(gasBtn, 'gas');
      hold(brakeBtn, 'brake');
      /* Blur after the tap so the space bar (gas) cannot re-fire the button. */
      nitroBtn.addEventListener('click', function () {
        if (nitroBtn.blur) { nitroBtn.blur(); }
        useNitro();
      });

      function onKeyDown(e) {
        var k = e.key;
        if (k === 'a' || k === 'A' || k === 'ArrowLeft') { held.left = true; if (e.preventDefault) { e.preventDefault(); } }
        if (k === 'd' || k === 'D' || k === 'ArrowRight') { held.right = true; if (e.preventDefault) { e.preventDefault(); } }
        if (k === ' ' || k === 'Spacebar') { held.gas = true; if (e.preventDefault) { e.preventDefault(); } }
        if (k === 'ArrowDown' || k === 's' || k === 'S') { held.brake = true; if (e.preventDefault) { e.preventDefault(); } }
        if ((k === 'n' || k === 'N') && !e.repeat) { useNitro(); }
      }
      function onKeyUp(e) {
        var k = e.key;
        if (k === 'a' || k === 'A' || k === 'ArrowLeft') { held.left = false; }
        if (k === 'd' || k === 'D' || k === 'ArrowRight') { held.right = false; }
        if (k === ' ' || k === 'Spacebar') { held.gas = false; }
        if (k === 'ArrowDown' || k === 's' || k === 'S') { held.brake = false; }
      }
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('keyup', onKeyUp);

      /* -------------------------------------------------------- the world */
      var state = null;
      var scores = [0, 0];
      var lastPct = -1;
      var dead = false;

      function curveAt(d) {
        return Math.sin(d * 0.00135) * 96 + Math.sin(d * 0.00043 + 1.7) * 46;
      }

      function startRun(who) {
        state = {
          who: who, travelled: 0, speed: 0, lateral: 0, steer: 0, spin: 0,
          lives: hearts, passes: 0, overtaken: 0, score: 0,
          boost: 0, cool: 0, invuln: 0, over: false, paused: false, offroad: 0,
          crash: 0, shake: 0, flash: 0, time: 0, spawnAt: 300,
          cars: [], bits: [], texts: []
        };
        whoStat.set(api.faces[who] + ' ' + api.names[who]);
        paintHud(true);
        api.setStatus('🏁 ' + api.names[who] + ' — GO to speed up, ◀ ▶ to steer, NITRO for a burst. ' +
          goal + ' m to the finish arch.');
        sfx('click');
      }

      function paintHud(force) {
        var metres = Math.floor(state.travelled / PPM);
        distStat.set(Math.min(metres, goal) + ' m');
        speedStat.set(String(Math.round(state.speed * 0.42)));
        passStat.set(String(state.overtaken));
        var heartsText = '';
        for (var i = 0; i < hearts; i++) { heartsText += i < state.lives ? '❤' : '🤍'; }
        lifeStat.set(heartsText);
        nitroStat.set(state.boost > 0 ? 'burning 🔥' + state.boost.toFixed(1) + 's' : (state.cool > 0 ? 'refilling ' + state.cool.toFixed(1) + 's' : 'ready 🔥'));
        var pct = clamp(state.travelled / (goal * PPM), 0, 1);
        if (force || pct - lastPct > 0.004) {
          fill.style.width = (pct * 100).toFixed(1) + '%';
          lastPct = pct;
        }
      }

      function useNitro() {
        if (!state || state.over || state.cool > 0 || state.boost > 0) { return; }
        state.boost = 2.2;
        state.cool = 6.5;
        sfx('win');
        for (var i = 0; i < 16; i++) {
          state.bits.push({
            x: 0, y: 0, off: (Math.random() - 0.5) * 40, vx: (Math.random() - 0.5) * 60, vy: -160 - Math.random() * 120,
            life: 0.5, r: 3 + Math.random() * 4, c: Math.random() < 0.5 ? '#ffd166' : '#ff7b3c', kind: 'flame'
          });
        }
      }

      /* -------------------------------------------------------- particles */
      function updateBits(dt) {
        for (var i = state.bits.length - 1; i >= 0; i--) {
          var b = state.bits[i];
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.vy += (b.kind === 'smoke' ? -20 : 260) * dt;
          b.life -= dt;
          if (b.life <= 0) { state.bits.splice(i, 1); }
        }
        for (var t = state.texts.length - 1; t >= 0; t--) {
          state.texts[t].y -= 30 * dt;
          state.texts[t].life -= dt;
          if (state.texts[t].life <= 0) { state.texts.splice(t, 1); }
        }
      }

      /* ------------------------------------------------------------- step */
      function step(dt) {
        updateBits(dt);
        state.shake *= 0.86;
        state.flash = Math.max(0, state.flash - dt * 2.4);
        if (state.over) { return; }
        state.time += dt;
        state.invuln = Math.max(0, state.invuln - dt);
        state.crash = Math.max(0, state.crash - dt);
        state.boost = Math.max(0, state.boost - dt);
        state.cool = Math.max(0, state.cool - dt);

        /* steering and speed */
        var dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
        var grip = state.crash > 0 ? 0.25 : 1;
        state.lateral = clamp(state.lateral + dir * steerSpeed * grip * dt, -1.45, 1.45);
        state.steer += (dir - state.steer) * Math.min(1, dt * 7);

        var off = Math.abs(state.lateral) > 1;
        state.offroad = off ? 1 : 0;
        var want = topSpeed * (off ? 0.56 : 1) * (state.boost > 0 ? 1.45 : 1);
        if (state.crash > 0) { want = 0; }
        if (held.brake) { state.speed = Math.max(40, state.speed - 560 * dt); }
        else if (held.gas || state.boost > 0) { state.speed += (want - state.speed) * Math.min(1, dt * 1.3); }
        else { state.speed += (topSpeed * 0.45 - state.speed) * Math.min(1, dt * 0.5); }
        state.speed = clamp(state.speed, 0, topSpeed * 1.5);

        state.travelled += state.speed * dt;
        state.spin = Math.max(0, state.spin - dt * 2.2);
        if (off && state.speed > 30) {
          state.shake = Math.max(state.shake, 4);
          if (Math.random() < 0.5) {
            state.bits.push({
              x: (Math.random() - 0.5) * 90, y: 0, off: 0, vx: (Math.random() - 0.5) * 90,
              vy: -60 - Math.random() * 60, life: 0.5, r: 4 + Math.random() * 5,
              c: 'rgba(214,190,140,.8)', kind: 'smoke'
            });
          }
        }

        /* exhaust smoke and tyre smoke */
        if (state.speed > 40 && Math.random() < 0.5) {
          state.bits.push({
            x: (state.steer * 26) + (Math.random() - 0.5) * 10, y: 6, off: 0,
            vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 40,
            life: 0.4, r: 2.5 + Math.random() * 3, c: 'rgba(220,220,230,.5)', kind: 'smoke'
          });
        }
        if (Math.abs(state.steer) > 0.6 && state.speed > topSpeed * 0.7 && Math.random() < 0.6) {
          state.bits.push({
            x: -state.steer * 30, y: 10, off: 0, vx: -state.steer * 60, vy: -30,
            life: 0.4, r: 4 + Math.random() * 4, c: 'rgba(240,240,240,.55)', kind: 'smoke'
          });
        }

        /* traffic */
        while (state.spawnAt < state.travelled + VIEWD + 200) {
          var kind = TRAFFIC[Math.floor(Math.random() * TRAFFIC.length)];
          var lane = -0.72 + Math.random() * 1.44;
          state.cars.push({
            kind: kind, lane: lane, dist: state.spawnAt - state.travelled + VIEWD * 0,
            speed: topSpeed * (0.42 + Math.random() * 0.22),
            colour: VANCOLOURS[Math.floor(Math.random() * VANCOLOURS.length)],
            wobble: hash(state.spawnAt) * 6
          });
          state.spawnAt += gap * (0.8 + hash(state.spawnAt * 1.7) * 0.6);
        }
        var i, c;
        for (i = state.cars.length - 1; i >= 0; i--) {
          c = state.cars[i];
          var before = c.dist;
          c.dist -= (state.speed - c.speed) * dt;
          c.lane += Math.sin(state.time * 1.1 + c.wobble) * 0.02 * dt;
          if (before > 0 && c.dist <= 0) {
            state.overtaken++;
            state.score += 25;
            state.texts.push({ x: W / 2 + 120, y: 200, text: 'overtake +25', life: 0.9, c: '#8ee6ff' });
            sfx('step');
          }
          if (c.dist < -70) { state.cars.splice(i, 1); continue; }
          if (state.invuln <= 0 && state.crash <= 0 && Math.abs(c.dist) < 30 && Math.abs(c.lane - state.lateral) < 0.32) {
            crashInto(c);
          }
        }

        state.score = Math.floor(state.travelled / PPM) + state.overtaken * 25;
        if (state.travelled / PPM >= goal) { finish(true); }
        paintHud(false);
      }

      function crashInto(c) {
        state.lives--;
        state.invuln = 1.8;
        state.crash = 0.9;
        state.spin = 1;
        state.speed = 0;
        state.shake = 20;
        state.flash = 0.5;
        for (var i = 0; i < 22; i++) {
          state.bits.push({
            x: (Math.random() - 0.5) * 60, y: -6, off: 0, vx: (Math.random() - 0.5) * 260,
            vy: -80 - Math.random() * 160, life: 0.5 + Math.random() * 0.4,
            r: 2 + Math.random() * 3, c: i % 2 ? '#ffd166' : '#fff1c9', kind: 'spark'
          });
        }
        state.texts.push({ x: W / 2, y: 210, text: 'CRASH!', life: 1, c: '#ff8fab' });
        sfx('capture');
        if (state.lives <= 0) { finish(false); return; }
        api.setStatus('💥 ' + api.names[state.who] + ' crashed into a ' + c.kind + '! ' + state.lives +
          ' hearts left — ' + (state.overtaken) + ' overtakes so far.');
      }

      /* ----------------------------------------------------------- ending */
      function finish(cleared) {
        if (state.over) { return; }
        state.over = true;
        scores[state.who] = state.score;
        if (two && state.who === 0) {
          state.paused = true;
          api.setStatus('🔄 ' + api.names[0] + ' scored ' + scores[0] + ' — now it is ' + api.names[1] + '’s turn.');
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
          text = '🏆 ' + api.names[0] + ' crossed the finish arch on level ' + api.level + ' — ' +
            Math.floor(state.travelled / PPM) + ' m, ' + state.overtaken + ' overtakes and ' + state.score + ' points!';
        } else {
          text = '💔 ' + api.names[0] + ' ran out of hearts on level ' + api.level + ' after ' +
            Math.floor(state.travelled / PPM) + ' m — ' + api.names[1] + ' takes this one. Try again!';
        }
        api.confetti(cleared ? 160 : 40);
        api.finish(text);
      }

      /* ---------------------------------------------------------- drawing */
      function rowFor(dist) {
        var t = 1 - dist / VIEWD;
        var p = clamp(t, 0, 1);
        return {
          y: HORIZON + t * (H - HORIZON),
          p: p,
          t: t,
          w: ROADW * (0.1 + 0.9 * p),
          cx: W / 2 + (curveAt(state.travelled + dist) - curveAt(state.travelled)) * (1 - p) * 1.7
        };
      }

      function drawSky() {
        var g = ctx.createLinearGradient(0, 0, 0, HORIZON + 30);
        if (night) {
          g.addColorStop(0, '#080a1c');
          g.addColorStop(0.6, '#141a3c');
          g.addColorStop(1, '#2a2450');
        } else {
          g.addColorStop(0, '#3f9ff0');
          g.addColorStop(0.6, '#a8d8ff');
          g.addColorStop(1, '#ffe9c9');
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, HORIZON + 30);

        if (night) {
          for (var s = 0; s < 60; s++) {
            var sx = (hash(s * 3.7) * W + state.travelled * 0.01) % W;
            var sy = hash(s * 8.1) * (HORIZON - 20);
            ctx.fillStyle = withAlpha('#ffffff', 0.4 + 0.5 * Math.abs(Math.sin(state.time + s)));
            ctx.fillRect(sx, sy, 2, 2);
          }
          ctx.fillStyle = '#eef3ff';
          ctx.beginPath();
          ctx.arc(104, 56, 17, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = withAlpha('#141a3c', 0.9);
          ctx.beginPath();
          ctx.arc(110, 50, 15, 0, Math.PI * 2);
          ctx.fill();
        } else {
          var halo = ctx.createRadialGradient(520, 60, 6, 520, 60, 90);
          halo.addColorStop(0, 'rgba(255,247,200,.7)');
          halo.addColorStop(1, 'rgba(255,247,200,0)');
          ctx.fillStyle = halo;
          ctx.fillRect(430, -30, 180, 180);
          ctx.fillStyle = '#fff6c4';
          ctx.beginPath();
          ctx.arc(520, 60, 22, 0, Math.PI * 2);
          ctx.fill();
          for (var i = 0; i < 6; i++) {
            var cx = ((i * 240 + 30 - state.travelled * 0.05) % (W + 300)) - 150;
            ctx.fillStyle = 'rgba(255,255,255,.8)';
            ctx.beginPath();
            ctx.arc(cx, 40 + hash(i) * 40, 15 + hash(i + 3) * 10, 0, Math.PI * 2);
            ctx.arc(cx + 20, 46 + hash(i) * 40, 12, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        /* distant hills behind the horizon */
        var hillColour = night ? '#161a34' : '#7fa86c';
        ctx.fillStyle = hillColour;
        ctx.beginPath();
        ctx.moveTo(0, HORIZON + 30);
        for (var x = 0; x <= W; x += 20) {
          var wx = (x + state.travelled * 0.06) * 0.01;
          ctx.lineTo(x, HORIZON - 6 - Math.sin(wx) * 14 - Math.sin(wx * 2.4) * 7);
        }
        ctx.lineTo(W, HORIZON + 30);
        ctx.closePath();
        ctx.fill();
      }

      function roadQuad(dFar, dNear, lateral, halfW, colourHex) {
        var far = rowFor(dFar), near = rowFor(dNear);
        if (far.t < 0 || near.t < 0 || far.t > 1.4 || near.t > 1.4) { return; }
        ctx.fillStyle = colourHex;
        ctx.beginPath();
        ctx.moveTo(far.cx + lateral * far.w / 2 - halfW * far.w / 2, far.y);
        ctx.lineTo(far.cx + lateral * far.w / 2 + halfW * far.w / 2, far.y);
        ctx.lineTo(near.cx + lateral * near.w / 2 + halfW * near.w / 2, near.y);
        ctx.lineTo(near.cx + lateral * near.w / 2 - halfW * near.w / 2, near.y);
        ctx.closePath();
        ctx.fill();
      }

      function drawRoad() {
        /* the ground either side of the road */
        var gg = ctx.createLinearGradient(0, HORIZON, 0, H);
        gg.addColorStop(0, night ? '#101530' : '#5d8f4d');
        gg.addColorStop(1, night ? '#0a0e22' : '#3f6b33');
        ctx.fillStyle = gg;
        ctx.fillRect(0, HORIZON, W, H - HORIZON);

        /* the road itself, in one long polygon */
        ctx.beginPath();
        var steps = 22, i, row;
        for (i = 0; i <= steps; i++) {
          row = rowFor(VIEWD * (1 - i / steps));
          if (i === 0) { ctx.moveTo(row.cx - row.w / 2, row.y); }
          else { ctx.lineTo(row.cx - row.w / 2, row.y); }
        }
        for (i = steps; i >= 0; i--) {
          row = rowFor(VIEWD * (1 - i / steps));
          ctx.lineTo(row.cx + row.w / 2, row.y);
        }
        ctx.closePath();
        ctx.save();
        ctx.clip();
        var rg = ctx.createLinearGradient(0, HORIZON, 0, H);
        rg.addColorStop(0, night ? '#2b3038' : '#41474f');
        rg.addColorStop(1, night ? '#1b1f26' : '#2f343b');
        ctx.fillStyle = rg;
        ctx.fillRect(0, HORIZON, W, H - HORIZON);

        /* moving tarmac bands give the road its speed */
        var band = 60;
        var first = Math.floor(state.travelled / band) - 1;
        for (i = first; i < first + Math.ceil(VIEWD / band) + 2; i++) {
          var dA = i * band - state.travelled, dB = dA + band * 0.5;
          if (i % 2 === 0) { continue; }
          roadQuad(Math.max(dA, -20), dB, 0, 1, withAlpha('#ffffff', 0.035));
        }
        ctx.restore();

        /* red and white rumble strips on both edges */
        var strip = 36;
        var s0 = Math.floor(state.travelled / strip) - 1;
        for (i = s0; i < s0 + Math.ceil(VIEWD / strip) + 2; i++) {
          var d1 = i * strip - state.travelled, d2 = d1 + strip;
          var on = i % 2 === 0;
          roadQuad(d1, d2, -0.965, 0.07, on ? '#e63946' : '#f7f7f7');
          roadQuad(d1, d2, 0.965, 0.07, on ? '#f7f7f7' : '#e63946');
        }

        /* white lane dashes */
        var dash = 74;
        var d0 = Math.floor(state.travelled / dash) - 1;
        for (i = d0; i < d0 + Math.ceil(VIEWD / dash) + 2; i++) {
          var dd = i * dash - state.travelled;
          roadQuad(dd, dd + 36, -0.33, 0.016, withAlpha('#ffffff', 0.85));
          roadQuad(dd, dd + 36, 0.33, 0.016, withAlpha('#ffffff', 0.85));
        }

        /* haze at the horizon so the road fades into the sky */
        var fog = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 60);
        fog.addColorStop(0, night ? 'rgba(20,26,60,.95)' : 'rgba(200,226,245,.95)');
        fog.addColorStop(1, 'rgba(200,226,245,0)');
        ctx.fillStyle = fog;
        ctx.fillRect(0, HORIZON, W, 60);
      }

      function drawScenery() {
        var i, side, dist, row, seed;
        var spacing = 96;
        var first = Math.floor(state.travelled / spacing) - 1;
        for (i = first; i < first + Math.ceil(VIEWD / spacing) + 2; i++) {
          for (side = -1; side <= 1; side += 2) {
            seed = i * 2 + (side > 0 ? 1 : 0);
            dist = i * spacing - state.travelled;
            if (dist < -40 || dist > VIEWD * 0.97) { continue; }
            row = rowFor(dist);
            var off = row.w / 2 + (0.35 + hash(seed) * 0.5) * row.w * 0.5 * side;
            var x = row.cx + off;
            var kind = hash(seed * 1.7);
            var s = row.p;
            if (kind < 0.34) {
              /* conifer */
              ctx.fillStyle = night ? '#132a1c' : '#2f7a3f';
              ctx.beginPath();
              ctx.moveTo(x, row.y - 70 * s);
              ctx.lineTo(x - 20 * s, row.y);
              ctx.lineTo(x + 20 * s, row.y);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = '#5a3f26';
              ctx.fillRect(x - 3 * s, row.y - 6 * s, 6 * s, 8 * s);
            } else if (kind < 0.6) {
              /* round tree */
              ctx.fillStyle = '#5a3f26';
              ctx.fillRect(x - 3 * s, row.y - 26 * s, 6 * s, 28 * s);
              ctx.fillStyle = night ? '#183a24' : '#3f9448';
              ctx.beginPath();
              ctx.arc(x, row.y - 36 * s, 22 * s, 0, Math.PI * 2);
              ctx.fill();
            } else if (kind < 0.78) {
              /* rock */
              ctx.fillStyle = night ? '#2a2f42' : '#9b9689';
              ctx.beginPath();
              ctx.moveTo(x - 14 * s, row.y);
              ctx.lineTo(x - 5 * s, row.y - 16 * s);
              ctx.lineTo(x + 9 * s, row.y - 12 * s);
              ctx.lineTo(x + 15 * s, row.y);
              ctx.closePath();
              ctx.fill();
            } else {
              /* a little house */
              var wall = night ? '#2c3150' : '#f6f1e6';
              ctx.fillStyle = wall;
              ctx.fillRect(x - 18 * s, row.y - 30 * s, 36 * s, 30 * s);
              ctx.fillStyle = night ? '#4a2a4a' : '#c15b4a';
              ctx.beginPath();
              ctx.moveTo(x - 22 * s, row.y - 30 * s);
              ctx.lineTo(x, row.y - 48 * s);
              ctx.lineTo(x + 22 * s, row.y - 30 * s);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = night ? '#ffd166' : '#8fb8d8';
              ctx.fillRect(x - 9 * s, row.y - 22 * s, 12 * s, 10 * s);
            }
            if (night && kind >= 0.6) {
              /* street lamps glow at night */
              ctx.fillStyle = 'rgba(255,214,120,.22)';
              ctx.beginPath();
              ctx.arc(x, row.y - 40 * s, 22 * s, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        /* chevron boards on the tightest bends */
        var chev = Math.floor(state.travelled / 130);
        for (i = chev; i < chev + Math.ceil(VIEWD / 130) + 1; i++) {
          dist = i * 130 - state.travelled;
          if (dist < 0 || dist > VIEWD * 0.95) { continue; }
          var bend = curveAt(state.travelled + dist + 120) - curveAt(state.travelled + dist + 20);
          if (Math.abs(bend) < 22) { continue; }
          row = rowFor(dist);
          var bx = row.cx + (bend > 0 ? 1 : -1) * (row.w / 2 + 24 * row.p);
          ctx.fillStyle = '#ffe066';
          ctx.beginPath();
          ctx.moveTo(bx - 12 * row.p, row.y - 26 * row.p);
          ctx.lineTo(bx + 12 * row.p, row.y - 26 * row.p);
          ctx.lineTo(bx, row.y - 4 * row.p);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#1b1b24';
          ctx.beginPath();
          ctx.moveTo(bx - 4 * row.p, row.y - 22 * row.p);
          ctx.lineTo(bx + 4 * row.p, row.y - 22 * row.p);
          ctx.lineTo(bx, row.y - 12 * row.p);
          ctx.closePath();
          ctx.fill();
        }

        /* the finish arch */
        var toGo = goal * PPM - state.travelled;
        if (toGo < VIEWD) {
          var arch = rowFor(Math.max(toGo, 0));
          var barH = 96 * Math.max(0.25, arch.p);
          ctx.fillStyle = '#f2f2f2';
          ctx.fillRect(arch.cx - arch.w / 2 - 10 * arch.p, arch.y - barH, 20 * arch.p, barH);
          ctx.fillRect(arch.cx + arch.w / 2 - 10 * arch.p, arch.y - barH, 20 * arch.p, barH);
          var stripes = 12;
          for (i = 0; i < stripes; i++) {
            ctx.fillStyle = i % 2 ? '#ffffff' : '#e63946';
            ctx.fillRect(arch.cx - arch.w / 2 + i * (arch.w / stripes), arch.y - barH - 16 * arch.p,
              arch.w / stripes, 16 * arch.p);
          }
        }
      }

      /* a car seen from behind — the whole field is built from this */
      function drawCar(kind, colourHex, s, braking, boosting, hit) {
        var dark = mix(colourHex, '#000000', 0.4);
        var light = mix(colourHex, '#ffffff', 0.4);
        var wide = kind === 'truck' ? 1.35 : (kind === 'van' ? 1.12 : 1);
        var tall = kind === 'truck' ? 1.3 : (kind === 'van' ? 1.2 : 1);
        ctx.save();
        ctx.scale(s * wide, s * tall);

        /* wheels */
        ctx.fillStyle = '#1b1b22';
        ctx.fillRect(-42, -16, 14, 24);
        ctx.fillRect(28, -16, 14, 24);
        /* body */
        var bg = ctx.createLinearGradient(0, -56, 0, 0);
        bg.addColorStop(0, hit ? '#ffffff' : light);
        bg.addColorStop(0.45, colourHex);
        bg.addColorStop(1, dark);
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(-38, -2);
        ctx.lineTo(-40, -30);
        ctx.quadraticCurveTo(-40, -56, -18, -58);
        ctx.lineTo(18, -58);
        ctx.quadraticCurveTo(40, -56, 40, -30);
        ctx.lineTo(38, -2);
        ctx.closePath();
        ctx.fill();
        /* roof */
        ctx.fillStyle = mix(colourHex, '#000000', 0.18);
        ctx.beginPath();
        ctx.moveTo(-26, -58);
        ctx.lineTo(26, -58);
        ctx.lineTo(22, -78);
        ctx.lineTo(-22, -78);
        ctx.closePath();
        ctx.fill();
        /* rear window */
        var wg = ctx.createLinearGradient(0, -78, 0, -58);
        wg.addColorStop(0, night ? '#0c1226' : '#8ec4e8');
        wg.addColorStop(1, night ? '#26304d' : '#dff0ff');
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.moveTo(-20, -60);
        ctx.lineTo(20, -60);
        ctx.lineTo(17, -75);
        ctx.lineTo(-17, -75);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = withAlpha('#ffffff', 0.35);
        ctx.beginPath();
        ctx.moveTo(-16, -62);
        ctx.lineTo(-2, -62);
        ctx.lineTo(-8, -73);
        ctx.lineTo(-15, -73);
        ctx.closePath();
        ctx.fill();
        /* tail lights and bumper */
        ctx.fillStyle = (braking || hit) ? '#ff2f3c' : mix('#8c1f24', '#ffffff', 0.15);
        ctx.fillRect(-38, -30, 12, 9);
        ctx.fillRect(26, -30, 12, 9);
        if (braking) {
          ctx.fillStyle = withAlpha('#ff3b3b', 0.5);
          ctx.fillRect(-44, -34, 24, 17);
          ctx.fillRect(20, -34, 24, 17);
        }
        ctx.fillStyle = dark;
        ctx.fillRect(-38, -18, 76, 12);
        ctx.fillStyle = '#cfd6de';
        ctx.fillRect(-14, -16, 28, 8);
        /* exhausts */
        ctx.fillStyle = '#8d949c';
        ctx.fillRect(-24, -6, 9, 6);
        ctx.fillRect(15, -6, 9, 6);
        if (boosting) {
          ctx.fillStyle = 'rgba(255,190,60,.9)';
          ctx.beginPath();
          ctx.moveTo(-24, -2);
          ctx.lineTo(-19, 20 + Math.random() * 12);
          ctx.lineTo(-15, -2);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(15, -2);
          ctx.lineTo(19, 20 + Math.random() * 12);
          ctx.lineTo(24, -2);
          ctx.closePath();
          ctx.fill();
        }
        /* headlight beams in the dark */
        if (night && kind === 'player') {
          /* the headlights throw a pool of light up the road ahead of us */
          var beam = ctx.createLinearGradient(0, -80, 0, -260);
          beam.addColorStop(0, 'rgba(255,246,200,.30)');
          beam.addColorStop(1, 'rgba(255,246,200,0)');
          ctx.fillStyle = beam;
          ctx.beginPath();
          ctx.moveTo(-18, -78);
          ctx.lineTo(18, -78);
          ctx.lineTo(96, -250);
          ctx.lineTo(-96, -250);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      function drawTraffic() {
        var list = state.cars.slice().sort(function (a, b) { return b.dist - a.dist; });
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (c.dist < -10 || c.dist > VIEWD * 0.98) { continue; }
          var row = rowFor(c.dist);
          var x = row.cx + c.lane * row.w / 2 * 0.8;
          ctx.save();
          ctx.fillStyle = 'rgba(10,12,20,.4)';
          ctx.beginPath();
          ctx.ellipse(x, row.y + 2, 44 * row.p, 9 * row.p, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.translate(x, row.y);
          drawCar(c.kind, c.colour, 0.42 + 0.62 * row.p, false, false, false);
          ctx.restore();
        }
      }

      function drawPlayer() {
        var row = rowFor(PLAYER_DIST);
        var x = row.cx + state.lateral * row.w / 2 * 0.8;
        var scale = 0.86 + 0.28 * row.p;
        var blink = state.invuln > 0 && Math.floor(state.invuln * 12) % 2 === 0;
        ctx.save();
        ctx.fillStyle = 'rgba(10,12,20,.45)';
        ctx.beginPath();
        ctx.ellipse(x, row.y + 4, 52 * scale, 11 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.translate(x, row.y);
        if (state.spin > 0) { ctx.rotate(Math.sin(state.time * 26) * 0.22 * state.spin); }
        else { ctx.rotate(state.steer * 0.05); }
        if (blink) { ctx.globalAlpha = 0.55; }
        drawCar('player', colour[state.who], scale, held.brake, state.boost > 0, state.crash > 0);
        ctx.restore();
      }

      function drawBits() {
        var row = rowFor(PLAYER_DIST);
        var x = row.cx + state.lateral * row.w / 2 * 0.8;
        var y = row.y;
        for (var i = 0; i < state.bits.length; i++) {
          var b = state.bits[i];
          ctx.globalAlpha = clamp(b.life * 1.8, 0, 1);
          ctx.fillStyle = b.c;
          ctx.beginPath();
          ctx.arc(x + b.x + (b.off || 0), y + b.y - 20, b.r * (0.6 + b.life), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (var t = 0; t < state.texts.length; t++) {
          var tx = state.texts[t];
          ctx.globalAlpha = clamp(tx.life, 0, 1);
          ctx.fillStyle = tx.c;
          ctx.fillText(tx.text, tx.x, tx.y);
        }
        ctx.globalAlpha = 1;
      }

      function drawSpeedLines() {
        var strength = clamp((state.speed - topSpeed * 0.85) / (topSpeed * 0.6), 0, 1);
        if (strength <= 0.02) { return; }
        ctx.strokeStyle = withAlpha('#ffffff', 0.2 * strength);
        ctx.lineWidth = 2;
        for (var i = 0; i < 10; i++) {
          var ang = hash(i * 3.3) * Math.PI * 2;
          var r0 = 130 + hash(i * 5.1) * 120;
          var len = 50 + strength * 90;
          ctx.beginPath();
          ctx.moveTo(W / 2 + Math.cos(ang) * r0, H * 0.62 + Math.sin(ang) * r0 * 0.5);
          ctx.lineTo(W / 2 + Math.cos(ang) * (r0 + len), H * 0.62 + Math.sin(ang) * (r0 + len) * 0.5);
          ctx.stroke();
        }
      }

      function draw() {
        ctx.save();
        if (state.shake > 0.4) {
          ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
        }
        drawSky();
        drawRoad();
        drawScenery();
        drawTraffic();
        drawPlayer();
        drawBits();
        drawSpeedLines();
        ctx.restore();
        if (state.boost > 0) {
          ctx.fillStyle = withAlpha('#ffd166', 0.06);
          ctx.fillRect(0, 0, W, H);
        }
        if (state.flash > 0.01) {
          ctx.fillStyle = withAlpha('#ff3b3b', state.flash * 0.4);
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
