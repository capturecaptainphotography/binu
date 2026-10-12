/* Shared behaviour for the Awesome Brothers pages (Binu + Himu).
   Each page sets <body data-person="binu|himu"> and gets its own
   fun-fact list and its own wave counter. */
(function () {
  'use strict';

  var FACTS = {
    binu: [
      'I can name 20 animals in 20 seconds. 🐘',
      'My favourite story is about a jungle adventure. 🌴',
      'I once drew a dragon that filled a whole page. 🐉',
      'I like counting stairs when I climb them — 42 at my school. 🪜',
      'Max follows me to the gate every morning. 🐶',
      'My best friend and I share our drawing pens. ✏️',
      'I know 5 different ways to fold a paper boat. ⛵',
      'Rainy days are my favourite days for drawing. ☔',
      'I always keep one red pencil sharp. 🖍️',
      'I want to visit the mountains one day and draw them for real. 🏔️'
    ],
    himu: [
      'I can whistle with my fingers. 🎵',
      'I know every animal sound in my storybook. 🐘',
      'I always want the window seat in the bus. 🚌',
      'I can balance a football on my knee 8 times. ⚽',
      'Blue is the best crayon in the whole box. 🖍️',
      'I count the birds on the way to school. 🐦',
      'My paintings dry on the fridge door. 🎨',
      'I sing while I build my blocks. 🧱',
      'Rainy days are for jumping in puddles. ☔',
      'I want to learn to play the drums one day. 🥁'
    ]
  };

  var person = (document.body && document.body.getAttribute('data-person')) || 'binu';
  var facts = FACTS[person] || FACTS.binu;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));

  /* Highlight the section I am reading */
  if ('IntersectionObserver' in window) {
    var byId = {};
    navLinks.forEach(function (a) {
      var id = (a.getAttribute('href') || '').slice(1);
      if (id) { byId[id] = a; }
    });

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && byId[entry.target.id]) {
          navLinks.forEach(function (a) { a.classList.remove('active'); });
          byId[entry.target.id].classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { spy.observe(el); }
    });

    /* Gentle reveal on scroll */
    var revealer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
      revealer.observe(el);
    });
  } else {
    Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
      el.classList.add('in');
    });
  }

  /* Confetti */
  function confetti(count) {
    var layer = document.getElementById('confettiLayer');
    if (!layer || reduceMotion) { return; }
    var colors = ['#e63946', '#ffc93c', '#3aa6e8', '#3fa96e', '#ff8fab'];
    for (var i = 0; i < count; i++) {
      var bit = document.createElement('i');
      var size = 6 + Math.random() * 9;
      bit.className = 'confetti';
      bit.style.left = (Math.random() * 100) + 'vw';
      bit.style.width = size + 'px';
      bit.style.height = size + 'px';
      bit.style.background = colors[Math.floor(Math.random() * colors.length)];
      bit.style.borderRadius = Math.random() > 0.5 ? '50%' : '3px';
      bit.style.animationDelay = (Math.random() * 0.5) + 's';
      bit.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
      bit.style.transform = 'rotate(' + Math.floor(Math.random() * 360) + 'deg)';
      layer.appendChild(bit);
      (function (node) {
        window.setTimeout(function () {
          if (node.parentNode) { node.parentNode.removeChild(node); }
        }, 3400);
      })(bit);
    }
  }

  /* The games room reuses this same confetti shower. */
  window.awesomeConfetti = confetti;

  /* Treasure box of extra fun facts */
  var factOut = document.getElementById('factOut');
  var surpriseBtn = document.getElementById('surpriseBtn');
  if (factOut && surpriseBtn) {
    surpriseBtn.addEventListener('click', function () {
      var next = factOut.textContent;
      var guard = 0;
      while (next === factOut.textContent && guard < 20) {
        next = facts[Math.floor(Math.random() * facts.length)];
        guard++;
      }
      factOut.textContent = next;
      factOut.classList.remove('pop-anim');
      void factOut.offsetWidth;
      factOut.classList.add('pop-anim');
      confetti(24);
    });
  }

  /* Wave counter — one counter per brother */
  var waveBtn = document.getElementById('waveBtn');
  var waveOut = document.getElementById('waveOut');
  var waveKey = person + '-waves';
  var waves = 0;
  try { waves = parseInt(window.localStorage.getItem(waveKey) || '0', 10) || 0; } catch (err) { waves = 0; }
  if (waveOut) { waveOut.textContent = 'Waves so far: ' + waves; }
  if (waveBtn && waveOut) {
    waveBtn.addEventListener('click', function () {
      waves++;
      try { window.localStorage.setItem(waveKey, String(waves)); } catch (err) { /* keep counting in memory */ }
      waveOut.textContent = 'You waved ' + waves + ' time' + (waves === 1 ? '' : 's') + '! Thanks for saying hi. 🎉';
      confetti(90);
    });
  }

  /* Back to top */
  var toTop = document.getElementById('toTop');
  if (toTop) {
    var onScroll = function () {
      toTop.classList.toggle('show', window.scrollY > 620);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }
})();
