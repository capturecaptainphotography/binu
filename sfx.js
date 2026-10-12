/* The Awesome Brothers — sound engine.
   Every sound is synthesised on the spot with the Web Audio API, so there are
   no audio files to download and the whole thing weighs nothing.
   Browsers only allow audio after a tap/click, so we stay silent until then. */
(function () {
  'use strict';

  var KEY = 'awesome-muted';
  var ctx = null;
  var master = null;
  var muted = false;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lastPlay = {};

  try { muted = window.localStorage.getItem(KEY) === '1'; } catch (err) { muted = false; }

  function audio() {
    if (ctx) { return ctx; }
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) { return null; }
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (err) {
      ctx = null;
    }
    return ctx;
  }

  function unlock() {
    var c = audio();
    if (c && c.state === 'suspended' && c.resume) { c.resume(); }
  }

  /* One note, with an optional pitch slide and a soft attack/decay envelope. */
  function note(opt) {
    var c = audio();
    if (!c) { return; }
    unlock();
    var now = c.currentTime;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opt.type || 'sine';
    osc.frequency.setValueAtTime(opt.freq, now);
    if (opt.to) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, opt.to), now + (opt.dur || 0.15));
    }
    var peak = (opt.gain === undefined ? 0.28 : opt.gain);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + (opt.attack || 0.012));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (opt.dur || 0.15));
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + (opt.dur || 0.15) + 0.03);
  }

  function noise(dur, gainValue) {
    var c = audio();
    if (!c) { return; }
    var frames = Math.max(1, Math.floor(c.sampleRate * dur));
    var buffer = c.createBuffer(1, frames, c.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    var src = c.createBufferSource();
    src.buffer = buffer;
    var gain = c.createGain();
    gain.gain.value = gainValue || 0.18;
    var filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  var SOUNDS = {
    click: function () { note({ freq: 620, to: 880, dur: 0.07, type: 'triangle', gain: 0.16 }); },
    hover: function () { note({ freq: 1180, dur: 0.04, type: 'sine', gain: 0.05 }); },
    place: function () { note({ freq: 320, to: 540, dur: 0.14, type: 'triangle', gain: 0.22 }); },
    capture: function () { note({ freq: 420, to: 170, dur: 0.22, type: 'sawtooth', gain: 0.16 }); noise(0.18, 0.12); },
    flip: function () { note({ freq: 520, to: 900, dur: 0.09, type: 'square', gain: 0.12 }); },
    dice: function () { noise(0.3, 0.14); note({ freq: 190, to: 320, dur: 0.26, type: 'square', gain: 0.1 }); },
    step: function () { note({ freq: 700, dur: 0.05, type: 'triangle', gain: 0.1 }); },
    wrong: function () { note({ freq: 300, to: 130, dur: 0.3, type: 'sawtooth', gain: 0.15 }); },
    win: function () {
      [523, 659, 784, 1046].forEach(function (f, i) {
        window.setTimeout(function () { note({ freq: f, dur: 0.28, type: 'triangle', gain: 0.22 }); }, i * 105);
      });
    },
    lose: function () {
      [392, 330, 262].forEach(function (f, i) {
        window.setTimeout(function () { note({ freq: f, dur: 0.34, type: 'sine', gain: 0.2 }); }, i * 150);
      });
    },
    pop: function () { note({ freq: 900, to: 1500, dur: 0.08, type: 'sine', gain: 0.16 }); }
  };

  function play(name, throttleMs) {
    if (muted || reduced) { return; }
    var fn = SOUNDS[name];
    if (!fn) { return; }
    var now = Date.now();
    var gap = throttleMs === undefined ? 28 : throttleMs;
    if (lastPlay[name] && now - lastPlay[name] < gap) { return; }
    lastPlay[name] = now;
    fn();
  }

  function setMuted(value) {
    muted = !!value;
    try { window.localStorage.setItem(KEY, muted ? '1' : '0'); } catch (err) { /* fine */ }
    if (muted && master) { master.gain.value = 0; }
    else if (master) { master.gain.value = 0.5; }
    document.documentElement.classList.toggle('sfx-off', muted);
    document.dispatchEvent(new CustomEvent('awesome:sfx', { detail: { muted: muted } }));
  }

  window.AwesomeSFX = {
    play: play,
    toggle: function () { setMuted(!muted); return muted; },
    setMuted: setMuted,
    isMuted: function () { return muted; },
    unlock: unlock,
    sounds: Object.keys(SOUNDS)
  };

  /* The very first gesture of any kind unlocks audio for the whole visit. */
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (type) {
    window.addEventListener(type, unlock, { once: true, passive: true });
  });

  if (muted) { document.documentElement.classList.add('sfx-off'); }
})();
