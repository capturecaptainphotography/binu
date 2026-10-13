/* Star Shooter — the shooting game for the Awesome Games Room.
   You fly the little ship at the bottom of a deep-space battlefield: a nebula,
   three layers of drifting stars, a ringed planet, saucers, tumbling asteroids,
   plasma bolts, drifting engine smoke and sparks everywhere. Clear a wave of
   enemies and a big flagship arrives — beat that to win the level.

   Two players share one device: player 1 plays the level, then hand the device
   over; the higher score wins. */
(function () {
  'use strict';

  var K = window.GameKit;
  var h = K.h;

  var W = 640, H = 400;
  var SHIPY = 344;
  var SHIPR = 17;

  var SPEEDS = [280, 300, 322, 344, 368];
  var SHIELDS = [4, 4, 3, 3, 2];
  var TARGETS = [10, 12, 14, 16, 18];
  var SPAWNS = [1.45, 1.2, 1.0, 0.86, 0.72];
  var BOSSHPS = [6, 8, 10, 13, 16];
  var VOLLEYS = [1, 1, 2, 2, 3];
  var FIRES = [0.24, 0.21, 0.18, 0.16, 0.14];

  var SQUADS = [
    ['saucer', 'saucer', 'asteroid'],
    ['saucer', 'saucer', 'asteroid', 'dart'],
    ['saucer', 'asteroid', 'dart', 'dart'],
    ['saucer', 'dart', 'asteroid', 'dart'],
    ['dart', 'dart', 'saucer', 'asteroid', 'dart']
  ];

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
    id: 'shooter',
    name: 'Star Shooter',
    emoji: '🚀',
    tag: 'Action',
    blurb: 'Fly your ship, dodge plasma bolts and blast the saucers — then beat the flagship.',
    howTo: 'Slide the ship left and right with ◀ ▶ (or A / D, or the arrow keys) and hold FIRE (or the space bar) to shoot. Saucers fire back, asteroids just tumble into you, and darts dive fast. Catch the drifting power-ups for a triple shot or an extra shield. Every level ends with a big flagship: shoot it as many times as its shields say. Lose all your shields and the other player wins the level. In 2 Players mode you take it in turns and the higher score wins.',
    online: false,
    onlineWhy: 'Shooting needs a live picture on one screen, so online play is off — but in 2 Players mode you can take turns and beat each other.',
    levels: 5,
    levelNames: [
      'Level 1 · first patrol',
      'Level 2 · the asteroid belt',
      'Level 3 · darts incoming (twin guns)',
      'Level 4 · heavy asteroid field',
      'Level 5 · a swarm and a battle cruiser'
    ],
    levelHints: [
      'Slow saucers, and a small flagship.',
      'Asteroids join in and everything speeds up.',
      'Your ship gets twin lasers.',
      'More darts, more rocks, a tough flagship.',
      'The whole swarm, and the biggest cruiser of all.'
    ],
    mount: function (root, api) {
      var lv = api.level - 1;
      var shipSpeed = api.p.ints(SPEEDS);
      var shields = api.p.ints(SHIELDS);
      var target = api.p.ints(TARGETS);
      var spawnEvery = api.p.ints(SPAWNS);
      var bossHp = api.p.ints(BOSSHPS);
      var volley = api.p.ints(VOLLEYS);
      var fireGap = api.p.ints(FIRES);
      var squad = SQUADS[lv] || SQUADS[0];
      var two = api.mode === 'two';
      var prof = window.GamePlayers ? window.GamePlayers.get() : null;
      var colour = [
        prof ? prof.p1.color : '#e63946',
        prof ? (two ? prof.p2.color : prof.cpu.color) : '#2f7fd1'
      ];

      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      canvas.className = 'gk-canvas gk-shooter';
      var ctx = canvas.getContext('2d');

      /* --------------------------------------------------------------- HUD */
      var whoStat = stat(two ? 'flying now' : 'pilot', api.faces[0] + ' ' + api.names[0]);
      var scoreStat = stat('points', '0');
      var waveStat = stat('of ' + target + ' to clear', '👾 0');
      var shieldStat = stat('shields', '');
      var boostStat = stat('power', '—');
      var hud = h('div', { class: 'gk-hud' }, [whoStat.item, scoreStat.item, waveStat.item, shieldStat.item, boostStat.item]);

      /* ---------------------------------------------------------- controls */
      var held = { left: false, right: false, fire: false };
      var moveL = h('button', { class: 'gk-actbtn gk-actbtn-move', type: 'button', 'aria-label': 'Move left' }, '◀');
      var moveR = h('button', { class: 'gk-actbtn gk-actbtn-move', type: 'button', 'aria-label': 'Move right' }, '▶');
      var fireBtn = h('button', { class: 'gk-actbtn gk-actbtn-go gk-actbtn-fire', type: 'button', 'aria-label': 'Fire' }, '⦿ Fire');
      var row = h('div', { class: 'gk-actrow' }, [moveL, fireBtn, moveR]);
      var controls = h('div', { class: 'gk-controls gk-actcontrols' }, row);

      function hold(node, key) {
        node.addEventListener('pointerdown', function (e) { e.preventDefault(); held[key] = true; });
        node.addEventListener('pointerup', function () { held[key] = false; });
        node.addEventListener('pointerleave', function () { held[key] = false; });
        node.addEventListener('pointercancel', function () { held[key] = false; });
      }
      hold(moveL, 'left');
      hold(moveR, 'right');
      hold(fireBtn, 'fire');

      function onKeyDown(e) {
        var k = e.key;
        if (k === 'a' || k === 'A' || k === 'ArrowLeft') { held.left = true; if (e.preventDefault) { e.preventDefault(); } }
        if (k === 'd' || k === 'D' || k === 'ArrowRight') { held.right = true; if (e.preventDefault) { e.preventDefault(); } }
        if (k === ' ' || k === 'Spacebar') { held.fire = true; if (e.preventDefault) { e.preventDefault(); } }
      }
      function onKeyUp(e) {
        var k = e.key;
        if (k === 'a' || k === 'A' || k === 'ArrowLeft') { held.left = false; }
        if (k === 'd' || k === 'D' || k === 'ArrowRight') { held.right = false; }
        if (k === ' ' || k === 'Spacebar') { held.fire = false; }
      }
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('keyup', onKeyUp);

      /* -------------------------------------------------------- the world */
      var state = null;
      var scores = [0, 0];
      var dead = false;

      function startRun(who) {
        state = {
          who: who, x: W / 2, vx: 0, tilt: 0, shields: shields, score: 0, kills: 0,
          boost: 0, boostKind: '', fireTimer: 0, spawnTimer: 0.6, over: false, paused: false,
          time: 0, shake: 0, flash: 0, invuln: 1.2,
          enemies: [], shots: [], bolts: [], bits: [], drops: [], texts: [],
          boss: null, bossWarn: 0
        };
        whoStat.set(api.faces[who] + ' ' + api.names[who]);
        paintHud(true);
        api.setStatus('👤 ' + api.names[who] + ' — ◀ ▶ to fly, FIRE to shoot. Clear ' + target +
          ' enemies and the flagship comes out.');
        sfx('click');
      }

      function paintHud(force) {
        scoreStat.set(String(state.score));
        waveStat.set('👾 ' + Math.min(state.kills, target));
        var bars = '';
        for (var i = 0; i < shields; i++) { bars += i < state.shields ? '🛡' : '·'; }
        shieldStat.set(bars);
        boostStat.set(state.boost > 0 ? state.boostKind + ' ' + Math.ceil(state.boost) + 's' : '—');
      }

      /* -------------------------------------------------------- particles */
      function bits(x, y, n, colour, speed) {
        for (var i = 0; i < n; i++) {
          var a = Math.random() * Math.PI * 2, v = (speed || 120) * (0.4 + Math.random());
          state.bits.push({
            x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
            life: 0.35 + Math.random() * 0.5, max: 1, c: colour || '#ffd54a',
            r: 1.6 + Math.random() * 2.4, kind: 'spark'
          });
        }
      }
      function boom(x, y, size, colour) {
        bits(x, y, Math.round(size * 0.8), colour || '#ffb347', 60 + size * 5);
        for (var i = 0; i < Math.round(size / 4); i++) {
          state.bits.push({
            x: x, y: y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40,
            life: 0.5 + Math.random() * 0.6, max: 1, c: withAlpha('#ffe0a3', 0.6),
            r: 5 + Math.random() * size * 0.35, kind: 'smoke'
          });
        }
        state.bits.push({ x: x, y: y, vx: 0, vy: 0, life: 0.3, max: 1, r: size * 0.5, c: withAlpha(colour || '#ffb347', 0.7), kind: 'ring' });
        state.shake = Math.max(state.shake, size * 0.35);
      }
      function floatText(x, y, text, colour) {
        state.texts.push({ x: x, y: y, text: text, life: 1, c: colour || '#fff' });
      }

      function updateBits(dt) {
        for (var i = state.bits.length - 1; i >= 0; i--) {
          var b = state.bits[i];
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.vx *= 0.98;
          b.vy = b.vy * 0.98 + (b.kind === 'smoke' ? -8 : 40) * dt;
          b.life -= dt;
          if (b.life <= 0) { state.bits.splice(i, 1); }
        }
        for (var t = state.texts.length - 1; t >= 0; t--) {
          state.texts[t].y -= 30 * dt;
          state.texts[t].life -= dt;
          if (state.texts[t].life <= 0) { state.texts.splice(t, 1); }
        }
      }

      /* -------------------------------------------------------- spawning */
      function spawnEnemy() {
        var kind = squad[Math.floor(Math.random() * squad.length)];
        var x = 50 + Math.random() * (W - 100);
        var base = { x: x, y: -30, kind: kind, sway: hash(x + state.time) * 6, hp: 1, r: 16, vy: 0, cool: 1 + Math.random() };
        if (kind === 'saucer') { base.vy = 52; base.r = 16; base.hp = 1; }
        else if (kind === 'asteroid') { base.vy = 66; base.r = 19; base.hp = 2; base.spin = Math.random() * 6; }
        else { base.vy = 118; base.r = 13; base.hp = 1; }
        base.vy *= 1 + lv * 0.11;
        state.enemies.push(base);
      }
      function spawnBoss() {
        state.boss = {
          x: W / 2, y: 74, hp: bossHp, max: bossHp, dir: 1, cool: 2.2, hover: 0,
          w: 150, h: 62, hurt: 0
        };
        state.bossWarn = 1.6;
        api.setStatus('👾 The flagship is here! Shoot it ' + bossHp + ' times — ' + api.names[state.who] + '.');
        sfx('wrong');
      }

      /* ------------------------------------------------------------ step */
      function step(dt) {
        updateBits(dt);
        state.shake *= 0.87;
        state.flash = Math.max(0, state.flash - dt * 2.6);
        state.invuln = Math.max(0, state.invuln - dt);
        state.bossWarn = Math.max(0, state.bossWarn - dt);
        if (state.over) { return; }
        state.time += dt;

        /* the ship flies */
        var dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
        state.vx += (dir * shipSpeed - state.vx) * Math.min(1, dt * 9);
        state.x = clamp(state.x + state.vx * dt, 34, W - 34);
        state.tilt += (dir * 0.34 - state.tilt) * Math.min(1, dt * 8);

        /* engine smoke */
        if (Math.random() < 0.7) {
          state.bits.push({
            x: state.x - 2 + (Math.random() * 6 - 3), y: SHIPY + 16,
            vx: (Math.random() - 0.5) * 16, vy: 90 + Math.random() * 60,
            life: 0.35, max: 1, r: 3 + Math.random() * 3,
            c: withAlpha(colour[state.who], 0.55), kind: 'smoke'
          });
        }

        /* firing */
        state.fireTimer -= dt;
        if (state.boost > 0) { state.boost -= dt; }
        if (held.fire && state.fireTimer <= 0) {
          state.fireTimer = fireGap;
          var n = state.boost > 0 ? volley + 2 : volley;
          for (var s = 0; s < n; s++) {
            var spread = (s - (n - 1) / 2) * 0.16;
            state.shots.push({ x: state.x, y: SHIPY - 16, vx: Math.sin(spread) * 240, vy: -520, life: 1.6 });
          }
          sfx('flip');
        }

        /* spawn the wave, then the flagship */
        if (!state.boss) {
          state.spawnTimer -= dt;
          if (state.spawnTimer <= 0) {
            state.spawnTimer = spawnEvery * (0.7 + Math.random() * 0.7);
            spawnEnemy();
          }
          if (state.kills >= target) { spawnBoss(); }
        }

        /* move enemies and let saucers fire */
        var i, e;
        for (i = state.enemies.length - 1; i >= 0; i--) {
          e = state.enemies[i];
          e.y += e.vy * dt;
          e.x += Math.sin(state.time * 1.6 + e.sway) * 40 * dt;
          if (e.kind === 'asteroid') { e.spin = (e.spin || 0) + dt * 2.2; }
          if (e.kind === 'saucer') {
            e.cool -= dt;
            if (e.cool <= 0 && e.y > 20 && e.y < 300) {
              e.cool = (1.9 - lv * 0.18) * (0.7 + Math.random() * 0.7);
              aimBolt(e.x, e.y + 10);
            }
          }
          if (e.y > H + 40) {
            state.enemies.splice(i, 1);
            state.flash = Math.max(state.flash, 0.12);
            floatText(e.x, H - 30, 'missed!', '#ffb347');
          }
        }

        /* the flagship sweeps and fires spreads */
        if (state.boss) {
          var b = state.boss;
          b.hurt = Math.max(0, b.hurt - dt);
          b.x += b.dir * (52 + lv * 9) * dt;
          if (b.x < 110) { b.x = 110; b.dir = 1; }
          if (b.x > W - 110) { b.x = W - 110; b.dir = -1; }
          b.y = 74 + Math.sin(state.time * 1.4) * 10;
          b.cool -= dt;
          if (b.cool <= 0 && state.bossWarn <= 0) {
            b.cool = 2.3 - lv * 0.22;
            var shots = 3 + lv;
            for (var k = 0; k < shots; k++) {
              var ang = Math.PI / 2 + (k - (shots - 1) / 2) * 0.3;
              state.bolts.push({
                x: b.x, y: b.y + 24, vx: Math.cos(ang) * 170, vy: Math.sin(ang) * 170,
                life: 3.2, r: 6
              });
            }
            sfx('capture');
          }
        }

        /* the bullets fly */
        for (i = state.shots.length - 1; i >= 0; i--) {
          var sh = state.shots[i];
          sh.x += sh.vx * dt;
          sh.y += sh.vy * dt;
          sh.life -= dt;
          if (sh.life <= 0 || sh.y < -20 || sh.x < -20 || sh.x > W + 20) { state.shots.splice(i, 1); continue; }
          var hitSomething = false;
          for (var j = state.enemies.length - 1; j >= 0; j--) {
            var en = state.enemies[j];
            if (Math.abs(en.x - sh.x) < en.r + 5 && Math.abs(en.y - sh.y) < en.r + 6) {
              en.hp--;
              hitSomething = true;
              if (en.hp <= 0) {
                killEnemy(en, j);
              } else {
                bits(sh.x, sh.y, 6, '#ffe08a', 90);
              }
              break;
            }
          }
          if (!hitSomething && state.boss && Math.abs(state.boss.x - sh.x) < state.boss.w / 2 &&
            Math.abs(state.boss.y - sh.y) < state.boss.h / 2 + 6) {
            state.boss.hp--;
            state.boss.hurt = 0.18;
            hitSomething = true;
            bits(sh.x, sh.y, 7, '#9ad8ff', 110);
            state.score += 20;
            sfx('step');
            if (state.boss.hp <= 0) { killBoss(); }
            else if (state.boss.hp % 4 === 0) {
              api.setStatus('👾 Flagship: ' + state.boss.hp + ' of ' + bossHp + ' shields left — keep firing!');
            }
          }
          if (hitSomething) { state.shots.splice(i, 1); }
        }

        /* enemy bolts */
        for (i = state.bolts.length - 1; i >= 0; i--) {
          var bo = state.bolts[i];
          bo.x += bo.vx * dt;
          bo.y += bo.vy * dt;
          bo.life -= dt;
          if (bo.life <= 0 || bo.y > H + 20 || bo.x < -20 || bo.x > W + 20 || bo.y < -40) {
            state.bolts.splice(i, 1);
            continue;
          }
          if (state.invuln <= 0 && Math.abs(bo.x - state.x) < SHIPR + 6 && Math.abs(bo.y - SHIPY) < SHIPR + 8) {
            state.bolts.splice(i, 1);
            takeHit();
          }
        }

        /* ramming */
        if (state.invuln <= 0) {
          for (i = state.enemies.length - 1; i >= 0; i--) {
            var ram = state.enemies[i];
            if (Math.abs(ram.x - state.x) < ram.r + SHIPR - 3 && Math.abs(ram.y - SHIPY) < ram.r + SHIPR - 3) {
              killEnemy(ram, i);
              takeHit();
              break;
            }
          }
          if (state.boss && Math.abs(state.boss.x - state.x) < state.boss.w / 2 + SHIPR &&
            Math.abs(state.boss.y - SHIPY) < state.boss.h / 2 + SHIPR) {
            takeHit();
          }
        }

        /* power-ups fall and are caught */
        for (i = state.drops.length - 1; i >= 0; i--) {
          var d = state.drops[i];
          d.y += 76 * dt;
          d.spin += dt * 3;
          if (d.y > H + 20) { state.drops.splice(i, 1); continue; }
          if (Math.abs(d.x - state.x) < 34 && Math.abs(d.y - SHIPY) < 30) {
            state.drops.splice(i, 1);
            if (d.kind === 'spread') {
              state.boost = 9;
              state.boostKind = '💠 triple shot';
              floatText(state.x, SHIPY - 40, '💠 TRIPLE SHOT!', '#8ee6ff');
            } else {
              if (state.shields < shields) { state.shields++; }
              state.boost = 0;
              state.boostKind = '';
              floatText(state.x, SHIPY - 40, '🛡 +1 shield', '#8ee6ff');
            }
            sfx('win');
          }
        }
        paintHud(false);
      }

      function aimBolt(x, y) {
        var dx = state.x - x, dy = SHIPY - y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var speed = 178 + lv * 16;
        state.bolts.push({ x: x, y: y, vx: dx / len * speed * 0.35, vy: Math.abs(dy / len) * speed, life: 3.2, r: 6 });
      }

      function killEnemy(en, index) {
        state.enemies.splice(index, 1);
        state.kills++;
        var worth = en.kind === 'asteroid' ? 60 : (en.kind === 'dart' ? 50 : 25);
        state.score += worth;
        boom(en.x, en.y, en.kind === 'asteroid' ? 30 : 24, en.kind === 'asteroid' ? '#c9b291' : '#8ee6ff');
        floatText(en.x, en.y - 6, '+' + worth, '#ffe08a');
        sfx('capture');
        if (Math.random() < 0.22 && state.drops.length < 2) {
          state.drops.push({ x: en.x, y: en.y, spin: 0, kind: Math.random() < 0.6 ? 'spread' : 'shield' });
        }
      }

      function killBoss() {
        boom(state.boss.x, state.boss.y, 70, '#ffd166');
        state.score += 200;
        state.boss = null;
        finish(true);
      }

      function takeHit() {
        state.shields--;
        state.invuln = 1.8;
        state.shake = 18;
        state.flash = 0.55;
        boom(state.x, SHIPY, 22, '#ff7b7b');
        sfx('wrong');
        if (state.shields <= 0) { finish(false); return; }
        api.setStatus('💥 ' + api.names[state.who] + ' was hit! ' + state.shields + ' shields left.');
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
          text = '🏆 ' + api.names[0] + ' destroyed the flagship on level ' + api.level + ' with ' +
            state.score + ' points and ' + state.kills + ' kills!';
        } else {
          text = '💔 ' + api.names[0] + ' ran out of shields on level ' + api.level + ' after ' +
            state.kills + ' kills and ' + state.score + ' points — ' + api.names[1] + ' takes this one!';
        }
        api.confetti(cleared ? 160 : 40);
        api.finish(text);
      }

      /* ---------------------------------------------------------- drawing */
      function drawSpace() {
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#080b22');
        g.addColorStop(0.55, '#141a44');
        g.addColorStop(1, '#251a45');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        /* two glowing nebulae so the sky is never flat */
        var n1 = ctx.createRadialGradient(140, 90, 10, 140, 90, 220);
        n1.addColorStop(0, 'rgba(126,87,255,.35)');
        n1.addColorStop(1, 'rgba(126,87,255,0)');
        ctx.fillStyle = n1;
        ctx.fillRect(0, 0, W, H);
        var n2 = ctx.createRadialGradient(520, 250, 10, 520, 250, 240);
        n2.addColorStop(0, 'rgba(0,196,255,.22)');
        n2.addColorStop(1, 'rgba(0,196,255,0)');
        ctx.fillStyle = n2;
        ctx.fillRect(0, 0, W, H);
      }

      function drawStars() {
        for (var layer = 0; layer < 3; layer++) {
          var speed = 18 + layer * 34;
          var size = 1 + layer * 0.7;
          var count = 40 + layer * 18;
          for (var i = 0; i < count; i++) {
            var x = (hash(i * 3.7 + layer * 11) * W + state.time * speed * 0.12) % W;
            var y = ((hash(i * 7.3 + layer * 5) * H) + state.time * speed) % H;
            ctx.fillStyle = withAlpha('#ffffff', 0.28 + layer * 0.22);
            ctx.fillRect(x, y, size, size);
          }
        }
      }

      function drawPlanet() {
        var px = 520, py = 70, r = 44;
        var pg = ctx.createRadialGradient(px - 14, py - 14, 6, px, py, r);
        pg.addColorStop(0, '#ffd9a0');
        pg.addColorStop(0.6, '#e0864f');
        pg.addColorStop(1, '#6d3520');
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,225,180,.6)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(px, py, r * 1.7, r * 0.4, -0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      function drawShip() {
        var blink = state.invuln > 0 && Math.floor(state.invuln * 12) % 2 === 0;
        ctx.save();
        ctx.translate(state.x, SHIPY);
        ctx.rotate(state.tilt);
        if (blink) { ctx.globalAlpha = 0.5; }

        /* engine flame */
        var flick = 10 + Math.random() * 9;
        var fg = ctx.createLinearGradient(0, 12, 0, 12 + flick);
        fg.addColorStop(0, 'rgba(255,255,255,.95)');
        fg.addColorStop(0.4, withAlpha(colour[state.who], 0.9));
        fg.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(-7, 12);
        ctx.lineTo(0, 12 + flick);
        ctx.lineTo(7, 12);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-14, 11);
        ctx.lineTo(-11, 11 + flick * 0.6);
        ctx.lineTo(-8, 11);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(8, 11);
        ctx.lineTo(11, 11 + flick * 0.6);
        ctx.lineTo(14, 11);
        ctx.closePath();
        ctx.fill();

        /* hull */
        var hg = ctx.createLinearGradient(0, -20, 0, 16);
        hg.addColorStop(0, mix(colour[state.who], '#ffffff', 0.55));
        hg.addColorStop(0.5, colour[state.who]);
        hg.addColorStop(1, mix(colour[state.who], '#000000', 0.45));
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(9, 2);
        ctx.lineTo(20, 12);
        ctx.lineTo(7, 10);
        ctx.lineTo(0, 15);
        ctx.lineTo(-7, 10);
        ctx.lineTo(-20, 12);
        ctx.lineTo(-9, 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = withAlpha('#ffffff', 0.4);
        ctx.lineWidth = 1.6;
        ctx.stroke();

        /* cockpit */
        var cg = ctx.createLinearGradient(0, -14, 0, 2);
        cg.addColorStop(0, '#d9fbff');
        cg.addColorStop(1, '#2b7fa8');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(0, -6, 5.4, 8.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = withAlpha('#ffffff', 0.55);
        ctx.beginPath();
        ctx.ellipse(-1.7, -9, 1.8, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        /* wing lights */
        ctx.fillStyle = '#ff5b5b';
        ctx.beginPath();
        ctx.arc(-19, 12, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5bff9c';
        ctx.beginPath();
        ctx.arc(19, 12, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        /* shield bubble while invulnerable */
        if (state.invuln > 0) {
          ctx.strokeStyle = withAlpha('#8ee6ff', 0.35 + 0.25 * Math.sin(state.time * 14));
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(state.x, SHIPY, 27, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      function drawEnemies() {
        for (var i = 0; i < state.enemies.length; i++) {
          var e = state.enemies[i];
          if (e.kind === 'saucer') {
            ctx.save();
            ctx.translate(e.x, e.y);
            var sg = ctx.createLinearGradient(0, -14, 0, 12);
            sg.addColorStop(0, '#cfd8ff');
            sg.addColorStop(1, '#5c6bb5');
            ctx.fillStyle = sg;
            ctx.beginPath();
            ctx.ellipse(0, 2, 18, 7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(180,255,240,.85)';
            ctx.beginPath();
            ctx.ellipse(0, -5, 9, 8, 0, Math.PI, Math.PI * 2);
            ctx.fill();
            for (var k = -2; k <= 2; k++) {
              var on = (Math.floor(state.time * 6) + k + 5) % 5 === 0;
              ctx.fillStyle = on ? '#ffe066' : '#3c4468';
              ctx.beginPath();
              ctx.arc(k * 6, 5, 1.8, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          } else if (e.kind === 'asteroid') {
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(e.spin || 0);
            var ag = ctx.createLinearGradient(-e.r, -e.r, e.r, e.r);
            ag.addColorStop(0, '#b7a58c');
            ag.addColorStop(1, '#5d5346');
            ctx.fillStyle = ag;
            ctx.beginPath();
            for (var a = 0; a < 9; a++) {
              var rad = e.r * (0.78 + hash(a + e.x) * 0.34);
              var ang = a / 9 * Math.PI * 2;
              var px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
              if (a === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
            }
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,.22)';
            ctx.beginPath();
            ctx.arc(e.r * 0.25, e.r * 0.1, e.r * 0.26, 0, Math.PI * 2);
            ctx.arc(-e.r * 0.35, -e.r * 0.2, e.r * 0.18, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else {
            ctx.save();
            ctx.translate(e.x, e.y);
            var dg = ctx.createLinearGradient(0, -12, 0, 12);
            dg.addColorStop(0, '#ffd0f0');
            dg.addColorStop(1, '#b0288a');
            ctx.fillStyle = dg;
            ctx.beginPath();
            ctx.moveTo(0, 12);
            ctx.lineTo(9, -8);
            ctx.lineTo(0, -3);
            ctx.lineTo(-9, -8);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = withAlpha('#ffffff', 0.8);
            ctx.beginPath();
            ctx.arc(0, 1, 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      function drawBoss() {
        var b = state.boss;
        if (!b) { return; }
        ctx.save();
        ctx.translate(b.x, b.y);
        var bgd = ctx.createLinearGradient(0, -b.h / 2, 0, b.h / 2);
        bgd.addColorStop(0, b.hurt > 0 ? '#ffffff' : '#a9b6ff');
        bgd.addColorStop(0.5, b.hurt > 0 ? '#ffd0d0' : '#4d5a9e');
        bgd.addColorStop(1, '#232a52');
        ctx.fillStyle = bgd;
        ctx.beginPath();
        ctx.ellipse(0, 6, b.w / 2, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a4480';
        ctx.beginPath();
        ctx.ellipse(0, -14, b.w / 2.9, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(140,255,240,.9)';
        ctx.beginPath();
        ctx.ellipse(0, -20, b.w / 5, 12, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        for (var k = -3; k <= 3; k++) {
          var on = (Math.floor(state.time * 8) + k + 4) % 4 === 0;
          ctx.fillStyle = on ? '#ffe066' : '#26305c';
          ctx.beginPath();
          ctx.arc(k * 17, 12, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#ff6b8a';
        ctx.beginPath();
        ctx.arc(-b.w / 2.6, -6, 4, 0, Math.PI * 2);
        ctx.arc(b.w / 2.6, -6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        /* its shield bar */
        var barW = 190, pct = clamp(b.hp / b.max, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(W / 2 - barW / 2 - 2, 16, barW + 4, 12);
        ctx.fillStyle = '#ff5b7f';
        ctx.fillRect(W / 2 - barW / 2, 18, barW * pct, 8);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('flagship ' + b.hp + '/' + b.max, W / 2, 40);
      }

      /* Rounded box that also works on older browsers (and never throws). */
      function roundRect(x, y, w, hh, r) {
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(x, y, w, hh, r); return; }
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + hh - r);
        ctx.quadraticCurveTo(x + w, y + hh, x + w - r, y + hh);
        ctx.lineTo(x + r, y + hh);
        ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
      }

      function drawShots() {
        var i;
        ctx.save();
        ctx.shadowColor = '#7ff0ff';
        ctx.shadowBlur = 12;
        for (i = 0; i < state.shots.length; i++) {
          var s = state.shots[i];
          ctx.fillStyle = '#d6fbff';
          roundRect(s.x - 2.6, s.y - 13, 5.2, 20, 3);
          ctx.fill();
        }
        ctx.shadowColor = '#ff9a3c';
        for (i = 0; i < state.bolts.length; i++) {
          var b = state.bolts[i];
          var pulse = 1 + 0.15 * Math.sin(state.time * 20 + i);
          ctx.fillStyle = '#ffb347';
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff3c9';
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      function drawDrops() {
        for (var i = 0; i < state.drops.length; i++) {
          var d = state.drops[i];
          ctx.save();
          ctx.translate(d.x, d.y);
          ctx.rotate(Math.sin(d.spin) * 0.35);
          ctx.shadowColor = d.kind === 'spread' ? '#7ff0ff' : '#8effa8';
          ctx.shadowBlur = 14;
          ctx.fillStyle = withAlpha('#102040', 0.85);
          roundRect(-13, -13, 26, 26, 8);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = d.kind === 'spread' ? '#7ff0ff' : '#8effa8';
          ctx.font = 'bold 15px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(d.kind === 'spread' ? '💠' : '🛡', d.x, d.y + 5);
        }
      }

      function drawBits() {
        for (var i = 0; i < state.bits.length; i++) {
          var b = state.bits[i];
          var a = clamp(b.life * 1.6, 0, 1);
          if (b.kind === 'smoke') {
            ctx.globalAlpha = a * 0.5;
            ctx.fillStyle = b.c;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r * (1.4 - b.life * 0.5), 0, Math.PI * 2);
            ctx.fill();
          } else if (b.kind === 'ring') {
            ctx.globalAlpha = a * 0.8;
            ctx.strokeStyle = b.c;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r * (1.8 - b.life * 1.4), 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.globalAlpha = a;
            ctx.fillStyle = b.c;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (var t = 0; t < state.texts.length; t++) {
          var x = state.texts[t];
          ctx.globalAlpha = clamp(x.life, 0, 1);
          ctx.fillStyle = x.c;
          ctx.fillText(x.text, x.x, x.y);
        }
        ctx.globalAlpha = 1;
      }

      function draw() {
        ctx.save();
        if (state.shake > 0.4) {
          ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
        }
        drawSpace();
        drawStars();
        drawPlanet();
        drawDrops();
        drawEnemies();
        drawBoss();
        drawShots();
        drawShip();
        drawBits();
        if (state.bossWarn > 0) {
          ctx.fillStyle = withAlpha('#ff3b5c', 0.18 * state.bossWarn);
          ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
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
