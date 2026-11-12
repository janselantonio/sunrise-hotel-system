import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSessionUser } from './src/auth.js';
import { seedIfEmpty } from './src/seed.js';
import { routes } from './src/api.js';
import { HttpError } from './src/errors.js';
import { DB, initDatabase } from './src/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new HttpError(413, 'Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'The request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }
  const clean = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  const relative =
    pathname === '/' ? 'index.html' : clean === 'book' ? 'book.html' : clean || 'index.html';
  const filePath = path.normalize(path.join(publicDir, relative));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Page not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Content-Length': stats.size,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  let pathname;
  try {
    url = new URL(req.url, `http://localhost:${PORT}`);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendJson(res, 400, { error: 'Invalid request path.' });
  }

  try {
    if (!pathname.startsWith('/api/')) {
      return serveStatic(req, res, pathname);
    }

    const route = routes.find(
      (candidate) => candidate.method === req.method && candidate.pattern.test(pathname)
    );
    if (!route) {
      const methodMismatch = routes.some((candidate) => candidate.pattern.test(pathname));
      throw new HttpError(methodMismatch ? 405 : 404, methodMismatch ? 'Method not allowed.' : 'Endpoint not found.');
    }

    const match = pathname.match(route.pattern);
    const body = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies.sunrise_session || '';
    const user = await getSessionUser(token);
    if (!route.public && !user) {
      throw new HttpError(401, 'Your session has expired. Please sign in again.');
    }

    const ctx = {
      req,
      res,
      url,
      params: match?.groups || {},
      body,
      user,
      token,
      setCookie(value) {
        res.setHeader('Set-Cookie', value);
      },
    };
    const result = await route.handler(ctx);
    if (res.headersSent) return;
    sendJson(res, 200, result ?? { ok: true });
  } catch (error) {
    if (res.headersSent) return;
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error('[Sunrise HMS]', error);
    sendJson(res, status, {
      error: status >= 500 ? 'An unexpected server error occurred.' : error.message,
    });
  }
});

let seeded = false;
try {
  await initDatabase();
  seeded = await seedIfEmpty();
} catch (error) {
  console.error('\n[Sunrise HMS] Could not connect to the MySQL database.');
  console.error(`  Target: ${DB.user}@${DB.host}:${DB.port}/${DB.database}`);
  console.error('  1. Open Laragon and click "Start All" so MySQL is running.');
  console.error('  2. Check the credentials in src/db.js or your MYSQL_* environment variables.');
  console.error(`  Details: ${error.message}\n`);
  process.exit(1);
}

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use. Close the other server or run with another port:`);
    console.error(`  PORT=3001 npm start\n`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  \x1b[33mSUNRISE HOTEL\x1b[0m  Management System');
  console.log(`  Server:  \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
  console.log(
    `  Data:    MySQL database "${DB.database}" on ${DB.host}:${DB.port}${seeded ? ' (demo data seeded)' : ''}`
  );
  console.log('');
  console.log('  Demo accounts');
  console.log('    Administrator   admin / admin123');
  console.log('    Receptionist    reception / reception123');
  console.log('    Manager         manager / manager123');
  console.log('    Housekeeping    housekeeping / housekeeping123');
  console.log('');
  console.log('  Press Ctrl+C to stop the server.');
  console.log('');
});
