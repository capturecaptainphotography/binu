/* Arcade: Pong. Two paddles, one ball, first to five points. */
(function () {
  'use strict';

  var K = window.GameKit;
  var h = K.h;

  K.register({
    id: 'pong',
    name: 'Pong',
    emoji: '🏓',
    tag: 'Arcade',
    blurb: 'The original video game — two paddles, one very fast ball.',
    howTo: 'Move your paddle with the ▲ ▼ buttons, or with W / S and ↑ / ↓ on a keyboard. Miss the ball and your rival scores. First to 5 points wins.',
    mount: function (root, api) {
      var W = 640, H = 400, PH = 74, PW = 11, BR = 9, PS = 7, MAXSCORE = 5;
      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      canvas.className = 'gk-canvas';
      var ctx = canvas.getContext('2d');
      var padL = { y: H / 2 - PH / 2, up: false, down: false };
      var padR = { y: H / 2 - PH / 2, up: false, down: false };
      var ball = { x: W / 2, y: H / 2, vx: 5, vy: 2.6 };
      var score = [0, 0], over = false, dead = false, timer = null, keys = {};

      function pad(keyId, obj) {
        var up = h('button', { class: 'gk-padbtn', type: 'button' }, '▲');
        var down = h('button', { class: 'gk-padbtn', type: 'button' }, '▼');
        up.addEventListener('pointerdown', function () { obj.up = true; });
        up.addEventListener('pointerup', function () { obj.up = false; });
        up.addEventListener('pointerleave', function () { obj.up = false; });
        down.addEventListener('pointerdown', function () { obj.down = true; });
        down.addEventListener('pointerup', function () { obj.down = false; });
        down.addEventListener('pointerleave', function () { obj.down = false; });
        return h('div', { class: 'gk-padstack' }, [h('span', { class: 'gk-padlabel' }, api.names[keyId]), up, down]);
      }

      root.appendChild(canvas);
      root.appendChild(h('div', { class: 'gk-pong-controls' }, [pad(0, padL), pad(1, padR)]));

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
        ball.vx = 5 * dir;
        ball.vy = (Math.random() * 4 - 2) || 2;
      }

      function step() {
        if (dead || over) { return; }
        if (padL.up) { padL.y -= PS; }
        if (padL.down) { padL.y += PS; }
        padL.y = Math.max(0, Math.min(H - PH, padL.y));

        if (api.mode === 'cpu') {
          var target = ball.y - PH / 2;
          var speed = keys['ArrowUp'] || keys['ArrowDown'] || padR.up || padR.down ? PS : 4.6;
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
          api.finish('🏆 ' + api.names[who] + ' wins ' + score[0] + '–' + score[1] + '!');
          return;
        }
        api.setStatus('🥅 Point for ' + api.names[who] + ' — score ' + score[0] + '–' + score[1]);
        reset(who === 0 ? 1 : -1);
      }

      function draw() {
        ctx.fillStyle = '#101a2b';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,255,255,.25)';
        ctx.lineWidth = 3;
        ctx.setLineDash && ctx.setLineDash([10, 12]);
        ctx.beginPath();
        ctx.moveTo(W / 2, 0);
        ctx.lineTo(W / 2, H);
        ctx.stroke();
        ctx.setLineDash && ctx.setLineDash([]);
        ctx.fillStyle = '#ffc93c';
        ctx.fillRect(8, padL.y, PW, PH);
        ctx.fillStyle = api.mode === 'cpu' ? '#ff8fab' : '#3aa6e8';
        ctx.fillRect(W - PW - 8, padR.y, PW, PH);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BR, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = 'bold 44px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.fillText(String(score[0]), W / 2 - 70, 60);
        ctx.fillText(String(score[1]), W / 2 + 46, 60);
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
