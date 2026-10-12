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

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (err) {
    return send(res, 400, 'Bad request');
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
