/* Boxing Ring — the boxing game for the Awesome Games Room.
   Two boxers, one ring: spotlights, a swaying crowd, three sagging ropes and a
   proper bout — jab, hook, block and duck-back dodge, with a stamina bar that
   runs out if you swing wildly. Against the computer the other corner is the
   system; in 2 Players mode two people box each other on one screen.

   Level 1 is a slow opponent who hardly blocks; level 5 is a fast, mean one
   with a lot more staying power. */
(function () {
  'use strict';

  var K = window.GameKit;
  var h = K.h;

  var W = 640, H = 400;
  var FEET = 306;              /* where both boxers stand */
  var X1 = 236, X2 = 404;      /* their home corners */

  /* jab / hook / dodge timings and reach */
  var MOVES = {
    jab: { dur: 0.34, windup: 0.09, active: 0.11, reach: 40, cost: 9, dmg: 7 },
    hook: { dur: 0.56, windup: 0.22, active: 0.13, reach: 34, cost: 21, dmg: 14 },
    dodge: { dur: 0.44, windup: 0.02, active: 0.26, reach: 0, cost: 12, dmg: 0 }
  };

  var CPUHP = [70, 80, 92, 108, 128];
  var CPUDMG = [5, 6, 8, 10, 12];
  var CPUREACT = [0.44, 0.35, 0.27, 0.2, 0.14];
  var CPUBLOCK = [0.2, 0.3, 0.42, 0.55, 0.68];

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

  K.register({
    id: 'boxing',
    name: 'Boxing Ring',
    emoji: '🥊',
    tag: 'Action',
    blurb: 'Step into the ring: jab, hook, block and duck — knockout your opponent to take the level.',
    howTo: 'Your boxer has a health bar and a stamina bar. JAB is quick and cheap, HOOK is slow but hurts a lot, BLOCK soaks up most of the damage and DODGE leans you out of the way completely (it costs stamina though, and so does everything else). When your stamina runs low your boxer gets tired and his punches are weak. Player 1 uses A / S / D / W or the buttons; in 2 Players mode player 2 uses the arrow keys (or their own buttons). Knock the other boxer out to win the level.',
    online: false,
    onlineWhy: 'A boxing match needs a live picture on one screen, so online play is off — but two people can box each other right here in 2 Players mode.',
    levels: 5,
    levelNames: [
      'Level 1 · the friendly spar',
      'Level 2 · a quicker rival',
      'Level 3 · proper boxer',
      'Level 4 · the champion',
      'Level 5 · title fight'
    ],
    levelHints: [
      'A slow opponent who rarely blocks.',
      'He reacts faster and hits a bit harder.',
      'A real boxer: he blocks and ducks.',
      'Hard punches — watch your stamina.',
      'Big, fast and very hard to knock out.'
    ],
    mount: function (root, api) {
      var lv = api.level - 1;
      var cpuHp = api.p.ints(CPUHP);
      var cpuDmg = api.p.ints(CPUDMG);
      var cpuReact = api.p.ints(CPUREACT);
      var cpuBlock = api.p.ints(CPUBLOCK);
      var two = api.mode === 'two';
      var prof = window.GamePlayers ? window.GamePlayers.get() : null;
      var colour = [
        prof ? prof.p1.color : '#e63946',
        prof ? (two ? prof.p2.color : prof.cpu.color) : '#2f7fd1'
      ];
      var face = [api.faces[0], api.faces[1]];

      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      canvas.className = 'gk-canvas gk-boxing';
      var ctx = canvas.getContext('2d');

      /* ------------------------------------------------------- health bars */
      function side(who) {
        var fill = h('i', { class: 'gk-fight-fill' });
        var stam = h('i', { class: 'gk-fight-fill gk-fight-stam' });
        fill.style.background = colour[who];
        stam.style.background = mix(colour[who], '#ffffff', 0.45);
        var name = h('b', { text: api.names[who] });
        var hits = h('small', { text: '0 hits' });
        var row = h('div', { class: 'gk-fight-side' + (who === 1 ? ' gk-fight-side-p2' : '') }, [
          h('span', { class: 'gk-fight-who' }, [name, hits]),
          h('span', { class: 'gk-fight-bar' }, fill),
          h('span', { class: 'gk-fight-bar gk-fight-bar-stam' }, stam)
        ]);
        return { row: row, fill: fill, stam: stam, hits: hits };
      }
      var left = side(0);
      var right = side(1);
      var clock = h('b', { text: '0:00' });
      var mid = h('div', { class: 'gk-fight-mid' }, [clock, h('small', { text: 'vs' })]);
      var fight = h('div', { class: 'gk-fight' }, [left.row, mid, right.row]);

      /* ---------------------------------------------------------- controls */
      function cluster(who) {
        var block = h('button', { class: 'gk-actbtn gk-actbtn-block', type: 'button', 'aria-label': 'Block' }, '🛡 Block');
        var jab = h('button', { class: 'gk-actbtn gk-actbtn-go gk-actbtn-jab', type: 'button', 'aria-label': 'Jab' }, '👊 Jab');
        var hook = h('button', { class: 'gk-actbtn gk-actbtn-hook', type: 'button', 'aria-label': 'Hook' }, '💥 Hook');
        var dodge = h('button', { class: 'gk-actbtn gk-actbtn-dodge', type: 'button', 'aria-label': 'Dodge' }, '↩ Dodge');
        /* Blurred after each tap, so a keyboard Space or Enter cannot throw an
           extra punch through the button that happens to be focused. */
        function tapped(node, name) {
          node.addEventListener('click', function () {
            if (node.blur) { node.blur(); }
            move(who, name);
          });
        }
        tapped(jab, 'jab');
        tapped(hook, 'hook');
        tapped(dodge, 'dodge');
        block.addEventListener('pointerdown', function (e) { e.preventDefault(); guard[who] = true; });
        block.addEventListener('pointerup', function () { guard[who] = false; });
        block.addEventListener('pointerleave', function () { guard[who] = false; });
        block.addEventListener('pointercancel', function () { guard[who] = false; });
        var label = h('span', { class: 'gk-actlabel', text: face[who] + ' ' + api.names[who] });
        var rowEl = h('div', { class: 'gk-actrow' }, [block, jab, hook, dodge]);
        return h('div', { class: 'gk-actcluster' + (who === 1 ? ' gk-actcluster-p2' : '') }, [label, rowEl]);
      }
      var controls = h('div', { class: 'gk-controls gk-actcontrols' }, cluster(0));
      if (two) { controls.appendChild(cluster(1)); }

      var guard = [false, false];
      var queued = [null, null];
      function move(who, name) {
        if (!state || state.over || state.who(who) === 'cpu') { return; }
        var b = state.boxers[who];
        if (b.ko || b.anim) { return; }
        if (b.stam < MOVES[name].cost * 0.35) { return; }
        queued[who] = name;
      }

      function onKeyDown(e) {
        var k = e.key;
        if (k === 'a' || k === 'A') { guard[0] = true; }
        if (k === 's' || k === 'S') { move(0, 'jab'); }
        if (k === 'd' || k === 'D') { move(0, 'hook'); }
        if (k === 'w' || k === 'W') { move(0, 'dodge'); }
        if (two) {
          if (k === 'ArrowLeft') { guard[1] = true; e.preventDefault(); }
          if (k === 'ArrowDown') { move(1, 'jab'); e.preventDefault(); }
          if (k === 'ArrowRight') { move(1, 'hook'); e.preventDefault(); }
          if (k === 'ArrowUp') { move(1, 'dodge'); e.preventDefault(); }
        }
      }
      function onKeyUp(e) {
        var k = e.key;
        if (k === 'a' || k === 'A') { guard[0] = false; }
        if (k === 'ArrowLeft') { guard[1] = false; }
      }
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('keyup', onKeyUp);

      /* --------------------------------------------------------- the bout */
      var state = null;
      var dead = false;

      function makeBoxer(who) {
        return {
          who: who,
          hp: who === 0 ? 100 : (two ? 100 : cpuHp),
          max: who === 0 ? 100 : (two ? 100 : cpuHp),
          stam: 100,
          baseX: who === 0 ? X1 : X2,
          x: who === 0 ? X1 : X2,
          bob: who === 0 ? 0 : 1.6,
          anim: null,
          animT: 0,
          hurtT: 0,
          guard: false,
          hits: 0,
          ko: false,
          koT: 0,
          shake: 0,
          lunge: 0
        };
      }

      function startBout() {
        state = {
          boxers: [makeBoxer(0), makeBoxer(1)],
          over: false,
          time: 0,
          shake: 0,
          flash: 0,
          effects: [],
          texts: [],
          crowd: 0,
          aiTimer: 0.6,
          aiBlock: 0,
          who: function (w) { return (!two && w === 1) ? 'cpu' : 'human'; }
        };
        guard = [false, false];
        queued = [null, null];
        paintHud(true);
        api.setStatus('🥊 ' + api.names[0] + ' vs ' + api.names[1] + ' — jab, hook, block and dodge. Knock them out!');
        sfx('click');
      }

      function paintHud(force) {
        var b0 = state.boxers[0], b1 = state.boxers[1];
        left.fill.style.width = (clamp(b0.hp / b0.max, 0, 1) * 100).toFixed(1) + '%';
        right.fill.style.width = (clamp(b1.hp / b1.max, 0, 1) * 100).toFixed(1) + '%';
        left.stam.style.width = clamp(b0.stam, 0, 100).toFixed(1) + '%';
        right.stam.style.width = clamp(b1.stam, 0, 100).toFixed(1) + '%';
        left.hits.textContent = b0.hits + ' hits';
        right.hits.textContent = b1.hits + ' hits';
        var secs = Math.floor(state.time);
        clock.textContent = Math.floor(secs / 60) + ':' + (secs % 60 < 10 ? '0' : '') + (secs % 60);
      }

      /* --------------------------------------------------------- effects */
      function burst(x, y, colourHex, n, speed) {
        for (var i = 0; i < n; i++) {
          var a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random());
          state.effects.push({
            x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30,
            life: 0.3 + Math.random() * 0.45, r: 1.6 + Math.random() * 2.6, c: colourHex
          });
        }
      }
      function floatText(x, y, text, colourHex) {
        state.texts.push({ x: x, y: y, text: text, life: 0.9, c: colourHex });
      }
      function updateEffects(dt) {
        var i;
        for (i = state.effects.length - 1; i >= 0; i--) {
          var e = state.effects[i];
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          e.vy += 460 * dt;
          e.life -= dt;
          if (e.life <= 0) { state.effects.splice(i, 1); }
        }
        for (i = state.texts.length - 1; i >= 0; i--) {
          state.texts[i].y -= 30 * dt;
          state.texts[i].life -= dt;
          if (state.texts[i].life <= 0) { state.texts.splice(i, 1); }
        }
      }

      /* ------------------------------------------------------------ brain */
      function cpuThink(dt) {
        var cpu = state.boxers[1], me = state.boxers[0];
        if (cpu.ko || state.over) { return; }
        state.aiBlock = Math.max(0, state.aiBlock - dt);
        if (state.aiBlock > 0) { return; }
        state.aiTimer -= dt;
        if (state.aiTimer > 0) { return; }
        state.aiTimer = cpuReact * (0.7 + Math.random() * 0.7);
        var incoming = !!me.anim && me.anim !== 'dodge' && me.animT < MOVES[me.anim].windup + 0.06;
        var tired = cpu.stam < 22;
        var roll = Math.random();
        if (incoming && roll < cpuBlock) {
          state.aiBlock = 0.28 + cpuReact * 0.8;
          return;
        }
        if (roll < 0.12 + lv * 0.03) { queued[1] = 'dodge'; return; }
        if (tired) { state.aiBlock = 0.4; return; }
        if (roll < 0.62) { queued[1] = 'jab'; }
        else { queued[1] = 'hook'; }
      }

      /* ------------------------------------------------------------- step */
      function step(dt) {
        updateEffects(dt);
        state.shake *= 0.86;
        state.flash = Math.max(0, state.flash - dt * 2.6);
        if (state.over) { return; }
        state.time += dt;
        state.crowd += dt;

        if (!two) { cpuThink(dt); }

        var i;
        for (i = 0; i < 2; i++) {
          var b = state.boxers[i];
          b.bob += dt * 2.4;
          if (b.ko) { b.koT += dt; }
          b.hurtT = Math.max(0, b.hurtT - dt);
          b.shake *= 0.85;
          b.x += (b.baseX - b.x) * Math.min(1, dt * 4);

          var blocking = guard[i] || (i === 1 && !two && state.aiBlock > 0);
          b.guard = blocking && b.stam > 0 && !b.anim;
          if (b.guard) {
            b.stam = Math.max(0, b.stam - 13 * dt);
          } else if (!b.anim) {
            b.stam = Math.min(100, b.stam + (b.stam < 20 ? 7 : 12) * dt);
          }

          /* start whatever the player (or the computer) asked for */
          if (!b.anim && queued[i] && !b.ko) {
            var name = queued[i];
            queued[i] = null;
            var mv = MOVES[name];
            if (b.stam >= mv.cost * 0.35) {
              b.anim = name;
              b.animT = 0;
              b.landed = false;
              b.stam = Math.max(0, b.stam - mv.cost);
              if (name === 'dodge') { sfx('step'); }
            }
          }

          /* run the animation, and see whether the punch lands */
          if (b.anim) {
            var m = MOVES[b.anim];
            var was = b.animT;
            b.animT += dt;
            if (b.anim !== 'dodge' && was < m.windup + m.active && b.animT >= m.windup && !b.landed) {
              /* the active window is open: check the other boxer */
              var foe = state.boxers[1 - i];
              if (b.animT <= m.windup + m.active) {
                if (foe.ko) { /* nothing to hit */ }
                else if (foe.anim === 'dodge' && foe.animT > MOVES.dodge.windup && foe.animT < MOVES.dodge.active) {
                  floatText(foe.baseX + (i === 0 ? 20 : -20), FEET - 120, 'miss!', '#9fd8ff');
                  sfx('step');
                } else {
                  landHit(b, foe, i);
                }
              }
              b.landed = true;
            }
            if (b.animT >= m.dur) { b.anim = null; b.animT = 0; b.landed = false; }
          }

          if (b.hp <= 0 && !b.ko) {
            b.ko = true;
            b.koT = 0;
            b.anim = null;
            state.shake = 20;
            sfx('capture');
            var winner = state.boxers[1 - i];
            floatText(b.baseX, FEET - 130, 'KO!', '#ffd166');
            burst(b.baseX, FEET - 90, '#ffd166', 26, 200);
          }
        }

        paintHud(false);
        if (!state.over && state.boxers[0].ko && state.boxers[0].koT > 1.1) { finish(1); }
        if (!state.over && state.boxers[1].ko && state.boxers[1].koT > 1.1) { finish(0); }
      }

      function landHit(attacker, foe, index) {
        var m = MOVES[attacker.anim];
        var power = m.dmg * (attacker.stam < 20 ? 0.6 : 1) * (index === 1 && !two ? cpuDmg / 7 : 1);
        var blocked = foe.guard;
        if (blocked) {
          power *= 0.22;
          foe.stam = Math.max(0, foe.stam - 12);
          floatText(foe.baseX + (index === 0 ? 26 : -26), FEET - 118, 'blocked', '#cfe4ff');
          sfx('wrong');
        } else {
          foe.hurtT = 0.34;
          foe.shake = 9;
          foe.x += (index === 0 ? 7 : -7);
          sfx(attacker.anim === 'hook' ? 'capture' : 'pop');
        }
        foe.hp = Math.max(0, foe.hp - power);
        attacker.hits++;
        var hx = (attacker.baseX + foe.baseX) / 2;
        burst(hx, FEET - 96, blocked ? '#bcd6f0' : '#fff2b8', blocked ? 5 : 12, blocked ? 90 : 220);
        floatText(hx + (index === 0 ? 8 : -8), FEET - 126, '-' + Math.round(power), blocked ? '#cfe4ff' : '#ffd166');
        state.shake = Math.max(state.shake, blocked ? 3 : 9);
      }

      /* ----------------------------------------------------------- ending */
      function finish(winner) {
        if (state.over) { return; }
        state.over = true;
        var loser = 1 - winner;
        var text;
        var w = state.boxers[winner], l = state.boxers[loser];
        if (!two && winner === 1) {
          text = '💥 ' + api.names[0] + ' was knocked out by ' + api.names[1] + ' on level ' + api.level +
            ' (' + Math.round(l.hp) + ' health left, ' + w.hits + ' punches landed). Try again!';
        } else {
          text = '🏆 ' + api.names[winner] + ' knocked out ' + api.names[loser] + ' on level ' + api.level +
            ' with ' + w.hits + ' punches and ' + Math.round(w.hp) + ' health left!';
        }
        api.confetti(winner === 0 || two ? 160 : 30);
        api.finish(text);
      }

      /* ---------------------------------------------------------- drawing */
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

      function drawArena() {
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#1b1730');
        g.addColorStop(0.55, '#2c2340');
        g.addColorStop(1, '#150f24');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        /* spotlights overhead */
        for (var s = 0; s < 3; s++) {
          var lx = 150 + s * 170;
          var cone = ctx.createLinearGradient(lx, 0, lx, FEET + 40);
          cone.addColorStop(0, 'rgba(255,250,220,.22)');
          cone.addColorStop(1, 'rgba(255,250,220,0)');
          ctx.fillStyle = cone;
          ctx.beginPath();
          ctx.moveTo(lx - 14, 0);
          ctx.lineTo(lx + 14, 0);
          ctx.lineTo(lx + 96, FEET + 40);
          ctx.lineTo(lx - 96, FEET + 40);
          ctx.closePath();
          ctx.fill();
        }

        /* the crowd, in four swaying rows */
        for (var row = 0; row < 4; row++) {
          var ry = 108 + row * 22;
          var count = 22;
          for (var i = 0; i < count; i++) {
            var cx = (i * (W / count)) + (row % 2 ? 8 : 0);
            var bobY = Math.sin(state.crowd * 2.2 + i * 0.7 + row) * (2 + row * 0.4);
            var tone = hash(i * 3.1 + row * 7.7);
            ctx.fillStyle = withAlpha(tone > 0.5 ? '#4a3f6b' : '#3a3157', 0.85 - row * 0.12);
            ctx.beginPath();
            ctx.arc(cx, ry + bobY, 7 - row * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = withAlpha('#2b2440', 0.8);
            ctx.fillRect(cx - 7, ry + bobY + 4, 14, 12);
          }
        }

        /* the mat, in perspective */
        var mat = ctx.createLinearGradient(0, 250, 0, H);
        mat.addColorStop(0, '#9db3c9');
        mat.addColorStop(1, '#4d6076');
        ctx.fillStyle = mat;
        ctx.beginPath();
        ctx.moveTo(96, 246);
        ctx.lineTo(W - 96, 246);
        ctx.lineTo(W - 24, H);
        ctx.lineTo(24, H);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.lineWidth = 3;
        ctx.stroke();

        /* centre circle with a badge */
        ctx.strokeStyle = 'rgba(255,255,255,.28)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(W / 2, 362, 120, 32, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🥊', W / 2, 370);

        /* corner posts */
        [40, W - 40].forEach(function (px) {
          ctx.fillStyle = '#d7dee8';
          ctx.fillRect(px - 5, 150, 10, 130);
          ctx.fillStyle = '#ff5b5b';
          ctx.beginPath();
          ctx.arc(px, 148, 8, 0, Math.PI * 2);
          ctx.fill();
        });

        /* three ropes that sag a little */
        for (var r = 0; r < 3; r++) {
          var y = 168 + r * 34;
          ctx.strokeStyle = r === 0 ? '#ffd166' : (r === 1 ? '#8ee6ff' : '#ff8fab');
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(40, y);
          ctx.quadraticCurveTo(W / 2, y + 10, W - 40, y);
          ctx.stroke();
        }

        /* soft shadow under the boxers */
        [0, 1].forEach(function (i) {
          var b = state.boxers[i];
          ctx.fillStyle = 'rgba(15,20,35,.35)';
          ctx.beginPath();
          ctx.ellipse(b.x, FEET + 4, 34, 8, 0, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      function drawBoxer(b) {
        var dir = b.who === 0 ? 1 : -1;
        var body = colour[b.who];
        var skin = '#c88b5e';
        var skinDark = mix(skin, '#000000', 0.2);
        var m = b.anim ? MOVES[b.anim] : null;
        var progress = m ? clamp(b.animT / m.dur, 0, 1) : 0;
        var punch = 0;
        if (m && b.anim !== 'dodge') {
          if (b.animT < m.windup) { punch = -0.12 * (b.animT / m.windup); }
          else if (b.animT < m.windup + m.active) { punch = 1; }
          else { punch = 1 - (b.animT - m.windup - m.active) / (m.dur - m.windup - m.active) * 0.7; }
        }
        var duck = m && b.anim === 'dodge' ? Math.sin(progress * Math.PI) : 0;
        var bob = Math.sin(b.bob) * 2.4;
        var lean = b.hurtT > 0 ? -0.16 : 0;

        ctx.save();
        ctx.translate(b.x + b.shake * (Math.random() - 0.5) * 0.4, FEET);
        ctx.rotate(lean);
        ctx.scale(dir, 1);

        if (b.ko) {
          var fall = clamp(b.koT / 0.7, 0, 1);
          ctx.rotate(-fall * 1.35);
          ctx.translate(-fall * 16, fall * 6);
        } else {
          ctx.translate(-duck * 12, duck * 4);
        }

        /* legs with a slight shuffle */
        var stepA = Math.sin(b.bob * 1.4) * 3;
        ctx.strokeStyle = skin;
        ctx.lineWidth = 11;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-6, -46);
        ctx.lineTo(-9 + stepA, -24);
        ctx.lineTo(-11 + stepA, -4);
        ctx.moveTo(6, -46);
        ctx.lineTo(8 - stepA, -24);
        ctx.lineTo(10 - stepA, -4);
        ctx.stroke();
        /* boots */
        ctx.fillStyle = '#f4f4f4';
        ctx.beginPath();
        ctx.ellipse(-9 + stepA, 0, 11, 5, 0, 0, Math.PI * 2);
        ctx.ellipse(11 - stepA, 0, 11, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        /* trunks */
        var tg = ctx.createLinearGradient(0, -56, 0, -34);
        tg.addColorStop(0, mix(body, '#ffffff', 0.3));
        tg.addColorStop(1, mix(body, '#000000', 0.25));
        ctx.fillStyle = tg;
        roundRect(-13, -56 + bob, 26, 22, 7);
        ctx.fill();
        ctx.fillStyle = withAlpha('#ffffff', 0.75);
        ctx.fillRect(-13, -46 + bob, 26, 3);

        /* torso */
        var sg = ctx.createLinearGradient(-12, -84, 12, -50);
        sg.addColorStop(0, mix(skin, '#ffffff', 0.18));
        sg.addColorStop(1, skinDark);
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(-12, -50 + bob);
        ctx.quadraticCurveTo(-15, -74, -9, -84 + bob);
        ctx.lineTo(10, -84 + bob);
        ctx.quadraticCurveTo(15, -72, 12, -50 + bob);
        ctx.closePath();
        ctx.fill();

        /* head */
        var headY = -96 + bob;
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.arc(2, headY, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2b2118';
        ctx.beginPath();
        ctx.arc(2, headY - 2, 12.4, Math.PI * 1.02, Math.PI * 2.02);
        ctx.fill();
        ctx.fillStyle = '#2b2118';
        ctx.beginPath();
        ctx.arc(6, headY + 3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = skinDark;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(2, headY + 4);
        ctx.lineTo(7, headY + 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(5, headY + 6, 3, 0.1, Math.PI - 0.3);
        ctx.stroke();
        if (b.ko) {
          ctx.strokeStyle = '#2b2118';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-1, headY + 2);
          ctx.lineTo(4, headY + 7);
          ctx.moveTo(4, headY + 2);
          ctx.lineTo(-1, headY + 7);
          ctx.stroke();
        }
        /* headgear colour band */
        ctx.strokeStyle = body;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(2, headY, 12.2, Math.PI * 0.9, Math.PI * 1.15);
        ctx.stroke();

        /* the rear glove (guard, near the chin) */
        function glove(gx, gy) {
          var gg = ctx.createRadialGradient(gx - 3, gy - 3, 2, gx, gy, 10);
          gg.addColorStop(0, mix(body, '#ffffff', 0.45));
          gg.addColorStop(1, mix(body, '#000000', 0.25));
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.arc(gx, gy, 9.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = withAlpha('#ffffff', 0.5);
          ctx.beginPath();
          ctx.arc(gx - 3, gy - 3.4, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = skin;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(-6, -80 + bob);
        ctx.lineTo(-2, -68 + bob);
        ctx.stroke();
        glove(-2, -66 + bob);

        /* the front arm: guard, block, or a punch going out */
        var frontX = 18, frontY = -78 + bob;
        if (b.guard) { frontX = 13; frontY = -94 + bob; }
        if (punch > 0) {
          frontX = 18 + punch * m.reach;
          frontY = -80 + bob - punch * 4;
        }
        ctx.strokeStyle = skinDark;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(8, -80 + bob);
        ctx.lineTo(frontX * 0.6, frontY + 10);
        ctx.lineTo(frontX, frontY);
        ctx.stroke();
        glove(frontX + 2, frontY);

        /* dodge motion trail */
        if (duck > 0.15) {
          ctx.globalAlpha = duck * 0.35;
          ctx.fillStyle = withAlpha('#ffffff', 0.5);
          ctx.beginPath();
          ctx.ellipse(20, -80 + bob, 22, 30, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.restore();

        /* dizzy stars after being hit */
        if (b.hurtT > 0 || b.ko) {
          for (var s = 0; s < 3; s++) {
            var ang = state.crowd * 4 + s * 2.1;
            ctx.fillStyle = '#ffe066';
            ctx.font = 'bold 13px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('✦', b.x + Math.cos(ang) * 18, FEET - 118 + Math.sin(ang) * 6);
          }
        }
      }

      function drawEffects() {
        var i;
        for (i = 0; i < state.effects.length; i++) {
          var e = state.effects[i];
          ctx.globalAlpha = clamp(e.life * 2, 0, 1);
          ctx.fillStyle = e.c;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (i = 0; i < state.texts.length; i++) {
          var t = state.texts[i];
          ctx.globalAlpha = clamp(t.life, 0, 1);
          ctx.fillStyle = t.c;
          ctx.fillText(t.text, t.x, t.y);
        }
        ctx.globalAlpha = 1;
      }

      function draw() {
        ctx.save();
        if (state.shake > 0.4) {
          ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
        }
        drawArena();
        drawBoxer(state.boxers[1]);
        drawBoxer(state.boxers[0]);
        drawEffects();
        ctx.restore();
        if (state.flash > 0.01) {
          ctx.fillStyle = withAlpha('#ffffff', state.flash * 0.35);
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
        step(dt);
        draw();
        handle = schedule(frame);
      }

      root.appendChild(fight);
      root.appendChild(canvas);
      root.appendChild(controls);
      startBout();
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
