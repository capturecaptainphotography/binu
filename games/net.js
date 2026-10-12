/* GameNet — the little client that talks to the relay in server.js.
   One player makes a game ID (a room code), the other types it in, and from
   then on every click and every board picture is pushed to the server and
   polled back for the other seat. Plain HTTP long-polling, so the games room
   needs nothing installed and no account anywhere. */
(function () {
  'use strict';

  var RELAY_PATH = '/api/relay';
  var POLL_WAIT = 25000;
  var CALL_TIMEOUT = 12000;
  var RETRY_MIN = 1200, RETRY_MAX = 8000;

  function relayUrl() {
    var base = String(window.AWESOME_RELAY || '').replace(/\/+$/, '');
    return base + RELAY_PATH;
  }

  function NetError(code, message) {
    this.name = 'NetError';
    this.code = code;
    this.message = message || code;
  }
  NetError.prototype = Object.create(Error.prototype);
  NetError.prototype.constructor = NetError;

  /* Grown-up problem or kid problem? Either way say it in words a kid knows. */
  var TEXTS = {
    missing: '🤔 We could not find that game ID. Check the letters and try again.',
    full: '🙈 Somebody is already playing on that game ID. Ask for a new one!',
    closed: '👋 That game finished — the host has gone home.',
    seat: '🔌 We lost our seat in that game. Make a new game ID and try again.',
    busy: '😅 The games room is very busy right now. Try again in a minute.',
    offline: '🔌 The game server is not answering. Online play needs the games room server running.',
    noserver: '🔌 This page is not being served by the games room server, so online play is switched off here.',
    timeout: '🐌 The connection is very slow. Check the internet and try again.',
    action: '❔ That is not something the game server understands.'
  };
  function errorText(err) {
    var code = err && err.code ? err.code : '';
    return TEXTS[code] || '😵 Online play had a problem: ' + ((err && err.message) || code || 'unknown');
  }

  function call(body, timeout) {
    if (typeof window.fetch !== 'function') {
      return Promise.reject(new NetError('noserver', 'no fetch'));
    }
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null;
    if (ctrl) { timer = setTimeout(function () { ctrl.abort(); }, timeout || CALL_TIMEOUT); }
    function done() { if (timer) { clearTimeout(timer); timer = null; } }

    return window.fetch(relayUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (!res.ok) { throw new NetError('offline', 'status ' + res.status); }
      return res.text();
    }).then(function (text) {
      var data;
      try { data = JSON.parse(text); }
      catch (err) { throw new NetError('noserver', 'not json'); }
      if (data && data.error) { throw new NetError(data.error, data.error); }
      return data;
    })['catch'](function (err) {
      if (err instanceof NetError) { throw err; }
      throw new NetError('offline', (err && err.message) || 'network');
    }).then(function (data) { done(); return data; }, function (err) { done(); throw err; });
  }

  /* ------------------------------------------------------------------ session
     cfg: { code, seat, token, role }
     handlers: onSnap, onEvent, onPeer, onClosed, onState, onError          */
  function Session(cfg, handlers) {
    this.code = cfg.code;
    this.seat = cfg.seat;
    this.token = cfg.token;
    this.role = cfg.role;
    this.handlers = handlers || {};
    this.rev = 0;
    this.stopped = false;
    this.fails = 0;
    this.busy = false;
    this.waiting = false;
  }

  Session.prototype.emit = function (name, arg) {
    var fn = this.handlers[name];
    if (typeof fn === 'function') { try { fn(arg); } catch (err) { /* keep polling */ } }
  };

  Session.prototype.start = function () {
    this.stopped = false;
    this.poll();
  };

  Session.prototype.poll = function () {
    if (this.stopped || this.busy) { return; }
    var self = this;
    this.busy = true;
    call({ action: 'poll', code: this.code, seat: this.seat, token: this.token, since: this.rev },
      POLL_WAIT + 20000)
      .then(function (data) {
        self.busy = false;
        self.fails = 0;
        if (self.waiting) { self.waiting = false; self.emit('onState', 'online'); }
        if (typeof data.rev === 'number') { self.rev = data.rev; }
        if (data.peer) { self.emit('onPeer', data.peer); }
        if (data.snap) { self.emit('onSnap', data.snap); }
        if (data.events && data.events.length) {
          data.events.forEach(function (ev) { self.emit('onEvent', ev); });
        }
        if (data.closed) {
          self.stop();
          self.emit('onClosed', {});
          return;
        }
        self.poll();
      }, function (err) {
        self.busy = false;
        self.fails++;
        if (self.fails === 1) { self.emit('onState', 'reconnecting'); }
        if (self.fails === 4) { self.emit('onError', err); }
        if (self.fails > 12) {
          self.emit('onState', 'lost');
          self.stop();
          return;
        }
        var wait = Math.min(RETRY_MAX, RETRY_MIN * Math.pow(1.6, self.fails - 1));
        setTimeout(function () { if (!self.stopped) { self.waiting = true; self.poll(); } }, wait);
      });
  };

  Session.prototype.send = function (events) {
    if (this.stopped || !events || !events.length) { return Promise.resolve(null); }
    var self = this;
    return call({ action: 'push', code: this.code, seat: this.seat, token: this.token, events: events })
      .then(function (data) { return data; }, function (err) {
        self.emit('onError', err);
        return null;
      });
  };

  Session.prototype.pushSnapshot = function (snap) {
    if (this.stopped) { return Promise.resolve(null); }
    var self = this;
    return call({
      action: 'push', code: this.code, seat: this.seat, token: this.token, snap: snap
    }, 20000).then(function (data) {
      if (!self.stopped) { self.emit('onState', 'online'); }
      return data;
    }, function (err) {
      self.emit('onError', err);
      return null;
    });
  };

  Session.prototype.leave = function () {
    var payload = { action: 'leave', code: this.code, seat: this.seat, token: this.token };
    this.stop();
    return call(payload, 6000)['catch'](function () { return null; });
  };

  /* Told when the tab is closing: a beacon cannot wait for an answer. */
  Session.prototype.beacon = function () {
    var payload = { action: 'leave', code: this.code, seat: this.seat, token: this.token };
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(relayUrl(), new Blob([JSON.stringify(payload)], { type: 'application/json' }));
        return true;
      }
    } catch (err) { /* fall through */ }
    return false;
  };

  Session.prototype.stop = function () { this.stopped = true; };

  /* -------------------------------------------------------------------- api */
  function create(cfg) {
    return call({ action: 'create', game: cfg.game, level: cfg.level, name: cfg.name });
  }
  function join(cfg) {
    return call({ action: 'join', code: cfg.code, name: cfg.name, token: cfg.token });
  }
  function makeSession(cfg, handlers) { return new Session(cfg, handlers); }

  window.GameNet = {
    create: create,
    join: join,
    session: makeSession,
    errorText: errorText,
    relayUrl: relayUrl,
    NetError: NetError
  };
})();
