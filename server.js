// Tiny zero-dependency static server for Binu's Awesome Corner.
// Used only so the preview can serve the static site; there is no build step.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5173;
const HOST = '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Cache-Control': 'no-cache' }, headers));
  res.end(body);
}

/* ------------------------------------------------------------------- relay
   A tiny in-memory room server so two kids on two devices can play the same
   board. One player creates a game ID (a 4-character room code), the other
   types that ID in; the server relays every message between the two seats
   over long-polling HTTP. No dependencies, no database: rooms live in memory
   and disappear when they go quiet. */
const RELAY_WAIT = 25000;          // how long a poll is held open
const RELAY_TTL = 30 * 60 * 1000;  // a quiet room is forgotten after this
const RELAY_MAX_ROOMS = 400;
const RELAY_MAX_BODY = 262144;     // 256 KB is plenty for a board snapshot
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
const rooms = Object.create(null);

function newRoomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) { code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; }
  return rooms[code] ? newRoomCode() : code;
}
function newToken() { return Math.random().toString(36).slice(2, 12) + Date.now().toString(36); }
function cleanText(value, max) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 24);
}
function roomCount() { return Object.keys(rooms).length; }
function pruneRooms() {
  const now = Date.now();
  Object.keys(rooms).forEach((code) => { if (now - rooms[code].touched > RELAY_TTL) { delete rooms[code]; } });
}
setInterval(pruneRooms, 60000).unref();

function roomFor(code) {
  const key = cleanText(code, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return key ? rooms[key] || null : null;
}
function seatOf(room, seat, token) {
  const held = room.seats[seat];
  if (!held || held.token !== token) { return null; }
  return held;
}

/* Everything a poller is owed right now: new snapshots, queued events, and a
   fresh note about whoever is on the other seat. */
function relayPayload(room, seat, since) {
  const other = seat === 1 ? 2 : 1;
  const peer = room.seats[other];
  return {
    rev: room.rev,
    snap: room.snap && room.rev > since ? room.snap : null,
    events: room.queues[seat].splice(0, room.queues[seat].length),
    peer: peer ? { name: peer.name, seat: other, online: Date.now() - peer.seen < 45000 } : null,
    closed: room.closed
  };
}
function flushRoom(room) {
  room.waiters = room.waiters.filter((waiter) => {
    const payload = relayPayload(room, waiter.seat, waiter.since);
    const hasNews = payload.rev > waiter.since || payload.events.length > 0 || payload.closed;
    if (!hasNews) { return true; }
    clearTimeout(waiter.timer);
    jsonOut(waiter.res, 200, payload);
    return false;
  });
}
function waitInRoom(room, seat, since, res) {
  const waiter = {
    seat: seat, since: since, res: res,
    timer: setTimeout(() => {
      room.waiters = room.waiters.filter((w) => w !== waiter);
      jsonOut(res, 200, relayPayload(room, seat, since));
    }, RELAY_WAIT)
  };
  room.waiters.push(waiter);
  flushRoom(room);
}

function jsonOut(res, status, obj) {
  const text = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type'
  });
  res.end(text);
}

function readJson(req, done) {
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > RELAY_MAX_BODY) { req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('error', () => done(new Error('bad request')));
  req.on('end', () => {
    if (!chunks.length) { return done(null, {}); }
    try { done(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch (err) { done(new Error('bad json')); }
  });
}

/* One endpoint, a handful of actions. Keeps the whole relay tiny. */
function handleRelay(req, res, body) {
  const action = String(body.action || '');

  if (action === 'create') {
    if (roomCount() >= RELAY_MAX_ROOMS) { return jsonOut(res, 200, { error: 'busy' }); }
    const code = newRoomCode();
    const token = newToken();
    rooms[code] = {
      code: code,
      game: cleanText(body.game, 32),
      level: Math.max(1, Math.round(Number(body.level) || 1)),
      touched: Date.now(),
      rev: 0,
      snap: null,
      closed: false,
      seats: { 1: { name: cleanText(body.name, 24) || 'Host', token: token, seen: Date.now() }, 2: null },
      queues: { 1: [], 2: [] },
      waiters: []
    };
    return jsonOut(res, 200, { code: code, seat: 1, token: token, game: rooms[code].game, level: rooms[code].level });
  }

  if (action !== 'join' && action !== 'push' && action !== 'poll' && action !== 'leave') {
    return jsonOut(res, 200, { error: 'action' });
  }

  const room = roomFor(body.code);
  if (!room) { return jsonOut(res, 200, { error: 'missing' }); }
  room.touched = Date.now();

  if (action === 'join') {
    if (room.closed) { return jsonOut(res, 200, { error: 'closed' }); }
    const held = room.seats[2];
    if (held && Date.now() - held.seen < 60000 && held.token !== body.token) {
      return jsonOut(res, 200, { error: 'full' });
    }
    const token = held && held.token === body.token ? held.token : newToken();
    const name = cleanText(body.name, 24) || 'Player 2';
    const fresh = !held || held.name !== name;
    room.seats[2] = { name: name, token: token, seen: Date.now() };
    if (fresh) { room.queues[1].push({ type: 'join', name: name, seat: 2 }); }
    flushRoom(room);
    return jsonOut(res, 200, {
      seat: 2, token: token, game: room.game, level: room.level,
      host: room.seats[1].name, rev: room.snap ? room.rev : 0, snap: room.snap
    });
  }

  if (action === 'push') {
    const held = seatOf(room, body.seat, body.token);
    if (!held) { return jsonOut(res, 200, { error: 'seat' }); }
    held.seen = Date.now();
    const other = body.seat === 1 ? 2 : 1;
    if (body.snap && typeof body.snap === 'object') {
      room.snap = {
        html: String(body.snap.html || ''),
        status: String(body.snap.status || ''),
        result: body.snap.result ? String(body.snap.result) : '',
        inputs: Array.isArray(body.snap.inputs) ? body.snap.inputs.slice(0, 40) : [],
        level: Math.round(Number(body.snap.level) || room.level)
      };
      room.rev++;
    }
    if (Array.isArray(body.events)) {
      body.events.slice(0, 30).forEach((ev) => {
        if (room.queues[other].length < 60) { room.queues[other].push(ev); }
      });
    }
    flushRoom(room);
    return jsonOut(res, 200, { ok: true, rev: room.rev });
  }

  if (action === 'poll') {
    const held = seatOf(room, body.seat, body.token);
    if (!held) { return jsonOut(res, 200, { error: 'seat' }); }
    held.seen = Date.now();
    const since = Math.max(0, Math.round(Number(body.since) || 0));
    return waitInRoom(room, body.seat, since, res);
  }

  if (action === 'leave') {
    const held = seatOf(room, body.seat, body.token);
    if (!held) { return jsonOut(res, 200, { error: 'seat' }); }
    held.seen = 0;
    if (body.seat === 1) {
      room.closed = true;
      room.queues[2].push({ type: 'bye', name: held.name });
      setTimeout(() => { if (rooms[room.code] === room) { delete rooms[room.code]; } }, 60000);
    } else {
      room.queues[1].push({ type: 'bye', name: held.name });
      room.seats[2] = null;
    }
    flushRoom(room);
    return jsonOut(res, 200, { ok: true });
  }

  return jsonOut(res, 200, { error: 'action' });
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (err) {
    return send(res, 400, 'Bad request');
  }

  /* The relay lives under /api/relay — everything else is a file. */
  if (pathname === '/api/relay') {
    if (req.method === 'OPTIONS') {
      return jsonOut(res, 204, { ok: true });
    }
    if (req.method !== 'POST') { return jsonOut(res, 405, { error: 'method' }); }
    return readJson(req, (err, body) => {
      if (err) { return jsonOut(res, 400, { error: 'bad request' }); }
      handleRelay(req, res, body);
    });
  }

  let filePath = path.join(ROOT, pathname);
  // Never serve anything outside this folder.
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    return send(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        const notFound = path.join(ROOT, 'index.html');
        fs.readFile(notFound, (nfErr, html) => {
          if (nfErr) { return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' }); }
          send(res, 404, html, { 'Content-Type': TYPES['.html'] });
        });
        return;
      }
      const type = TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      send(res, 200, data, { 'Content-Type': type });
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log('Binu\'s Awesome Corner served at http://' + HOST + ':' + PORT);
});
