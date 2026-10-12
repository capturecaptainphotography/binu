/* Arcade: Pong. Two paddles, one ball, first to five points.
   The paddles wear the colours you picked for each player in the games room. */
(function () {
  'use strict';

  var K = window.GameKit;
  var h = K.h;

  K.register({
    id: 'pong',
    name: 'Pong',
    emoji: '🏓',
    tag: 'Arcade',
    blurb: 'The original video game — two paddles, one very fast ball, faster every level.',
    howTo: 'Move your paddle with the ▲ ▼ buttons, or with W / S and ↑ / ↓ on a keyboard. Miss the ball and your rival scores. Higher levels are quicker, your paddle is smaller and the finish line moves further away. Your paddles use the colours you chose in the players panel.',
    levels: 5,
    levelNames: ['Level 1 · first to 3, slow ball', 'Level 2 · first to 4', 'Level 3 · first to 5, classic', 'Level 4 · first to 7, quick', 'Level 5 · first to 9, lightning'],
    levelHints: ['A gentle ball and a big paddle.', 'A little quicker.',
      'The classic game: first to five.', 'Smaller paddle, faster ball.', 'Tiny paddle, blazing ball, nine points.'],
    mount: function (root, api) {
      var ballSpeed = api.p.ints([3.4, 4.2, 5, 5.8, 6.8]);
      var PH = api.p.ints([110, 96, 74, 62, 50]);
      var MAXSCORE = api.p.ints([3, 4, 5, 7, 9]);
      var cpuMax = api.p.lerp(3.6, 6.2);
      var W = 640, H = 400, PW = 12, BR = 9, PS = 7;
      var prof = window.GamePlayers ? window.GamePlayers.get() : null;
      var leftColor = prof ? prof.p1.color : '#ffc93c';
      var rightColor = prof ? (api.mode === 'two' ? prof.p2.color : prof.cpu.color) : '#ff8fab';
      var leftFace = prof ? prof.p1.face : '🧒';
      var rightFace = prof ? (api.mode === 'two' ? prof.p2.face : prof.cpu.face) : '🤖';

      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      canvas.className = 'gk-canvas gk-pong';
      canvas.style.setProperty('--paddle-l', leftColor);
      canvas.style.setProperty('--paddle-r', rightColor);
      var ctx = canvas.getContext('2d');
      var padL = { y: H / 2 - PH / 2, up: false, down: false };
      var padR = { y: H / 2 - PH / 2, up: false, down: false };
      var ball = { x: W / 2, y: H / 2, vx: ballSpeed, vy: 2.6 };
      var trail = [];
      var score = [0, 0], over = false, dead = false, timer = null, keys = {};

      function pad(keyId, obj, face) {
        var up = h('button', { class: 'gk-padbtn', type: 'button' }, '▲');
        var down = h('button', { class: 'gk-padbtn', type: 'button' }, '▼');
        up.addEventListener('pointerdown', function () { obj.up = true; });
        up.addEventListener('pointerup', function () { obj.up = false; });
        up.addEventListener('pointerleave', function () { obj.up = false; });
        down.addEventListener('pointerdown', function () { obj.down = true; });
        down.addEventListener('pointerup', function () { obj.down = false; });
        down.addEventListener('pointerleave', function () { obj.down = false; });
        var stack = h('div', { class: 'gk-padstack gk-padstack-' + (keyId === 0 ? 'p1' : 'p2') }, [
          h('span', { class: 'gk-padlabel' }, face + ' ' + api.names[keyId]),
          up,
          down
        ]);
        stack.style.setProperty('--pc', keyId === 0 ? leftColor : rightColor);
        return stack;
      }

      root.appendChild(canvas);
      root.appendChild(h('div', { class: 'gk-pong-controls' }, [pad(0, padL, leftFace), pad(1, padR, rightFace)]));

      function onKey(e, down) {
        var k = e && e.key;
        if (k === 'w' || k === 'W') { padL.up = down; }
        if (k === 's' || k === 'S') { padL.down = down; }
        if (k === 'ArrowUp') { padR.up = down; e.preventDefault(); }
        if (k === 'ArrowDown') { padR.down = down; e.preventDefault(); }
        keys[k] = down;
      }
      if (document.addEventListener) {
        document.addEventListener('keydown', function (e) { onKey(e, true); });
        document.addEventListener('keyup', function (e) { onKey(e, false); });
      }

      function reset(dir) {
        ball.x = W / 2;
        ball.y = H / 2;
        ball.vx = ballSpeed * dir;
        ball.vy = (Math.random() * 4 - 2) || 2;
        trail = [];
      }

      function step() {
        if (dead || over) { return; }
        if (padL.up) { padL.y -= PS; }
        if (padL.down) { padL.y += PS; }
        padL.y = Math.max(0, Math.min(H - PH, padL.y));

        if (api.mode === 'cpu') {
          var target = ball.y - PH / 2;
          var speed = keys['ArrowUp'] || keys['ArrowDown'] || padR.up || padR.down ? PS : cpuMax;
          if (padR.up) { padR.y -= PS; }
          if (padR.down) { padR.y += PS; }
          if (!padR.up && !padR.down) { padR.y += Math.max(-speed, Math.min(speed, target - padR.y)); }
        } else {
          if (padR.up) { padR.y -= PS; }
          if (padR.down) { padR.y += PS; }
        }
        padR.y = Math.max(0, Math.min(H - PH, padR.y));

        ball.x += ball.vx;
        ball.y += ball.vy;
        if (ball.y < BR || ball.y > H - BR) { ball.vy = -ball.vy; ball.y = Math.max(BR, Math.min(H - BR, ball.y)); }
        if (ball.x - BR < PW + 8 && ball.y > padL.y && ball.y < padL.y + PH && ball.vx < 0) {
          ball.vx = Math.abs(ball.vx) * 1.03;
          ball.vy += (ball.y - (padL.y + PH / 2)) * 0.05;
        }
        if (ball.x + BR > W - PW - 8 && ball.y > padR.y && ball.y < padR.y + PH && ball.vx > 0) {
          ball.vx = -Math.abs(ball.vx) * 1.03;
          ball.vy += (ball.y - (padR.y + PH / 2)) * 0.05;
        }
        ball.vy = Math.max(-6, Math.min(6, ball.vy));
        if (Math.abs(ball.vx) > 12) { ball.vx = 12 * Math.sign(ball.vx); }

        trail.push({ x: ball.x, y: ball.y });
        if (trail.length > 9) { trail.shift(); }

        if (ball.x < -20) { point(1); return; }
        if (ball.x > W + 20) { point(0); return; }
        draw();
      }

      function point(who) {
        score[who]++;
        draw();
        if (score[who] >= MAXSCORE) {
          over = true;
          api.confetti(120);
          api.finish('🏆 ' + api.names[who] + ' wins level ' + api.level + ' ' + score[0] + '–' + score[1] + '!');
          return;
        }
        api.setStatus('🥅 Point for ' + api.names[who] + ' — score ' + score[0] + '–' + score[1]);
        reset(who === 0 ? 1 : -1);
      }

      function glow(color, blur) {
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
      }

      function draw() {
        var bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#0b1424');
        bg.addColorStop(0.5, '#121d33');
        bg.addColorStop(1, '#0a1322');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        /* a soft halo of each player's colour behind their own goal */
        var haloL = ctx.createRadialGradient(0, H / 2, 10, 0, H / 2, 240);
        haloL.addColorStop(0, leftColor + '55');
        haloL.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = haloL;
        ctx.fillRect(0, 0, W / 2, H);
        var haloR = ctx.createRadialGradient(W, H / 2, 10, W, H / 2, 240);
        haloR.addColorStop(0, rightColor + '55');
        haloR.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = haloR;
        ctx.fillRect(W / 2, 0, W / 2, H);

        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,.22)';
        ctx.lineWidth = 3;
        if (ctx.setLineDash) { ctx.setLineDash([10, 12]); }
        ctx.beginPath();
        ctx.moveTo(W / 2, 0);
        ctx.lineTo(W / 2, H);
        ctx.stroke();
        if (ctx.setLineDash) { ctx.setLineDash([]); }
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 58, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        /* ball trail */
        for (var i = 0; i < trail.length; i++) {
          var t = trail[i];
          var p = (i + 1) / trail.length;
          ctx.globalAlpha = p * 0.4;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(t.x, t.y, BR * p * 0.85, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        glow(leftColor, 22);
        ctx.fillStyle = leftColor;
        roundRect(8, padL.y, PW, PH);
        glow(rightColor, 22);
        ctx.fillStyle = rightColor;
        roundRect(W - PW - 8, padR.y, PW, PH);

        glow('#ffffff', 18);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BR, 0, Math.PI * 2);
        ctx.fill();
        glow('#000000', 0);
        if (ctx.shadowBlur !== undefined) { ctx.shadowBlur = 0; }

        ctx.font = 'bold 46px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = leftColor;
        ctx.globalAlpha = 0.75;
        ctx.fillText(String(score[0]), W / 2 - 74, 62);
        ctx.fillStyle = rightColor;
        ctx.fillText(String(score[1]), W / 2 + 74, 62);
        ctx.globalAlpha = 1;
      }

      function roundRect(x, y, w, hh) {
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(x, y, w, hh, 6);
          ctx.fill();
          return;
        }
        ctx.fillRect(x, y, w, hh);
      }

      draw();
      api.setStatus('👤 ' + api.names[0] + ' — ▲ ▼ to move. First to ' + MAXSCORE + ' wins.');
      timer = window.setInterval(step, 16);

      return {
        destroy: function () {
          dead = true;
          if (timer) { window.clearInterval(timer); }
        }
      };
    }
  });
})();
