// Local stand-in for Vercel's /api functions: `npm run dev:api` serves them on
// port 8003, which vite.config.js already proxies to.
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'api');
const port = Number(process.env.PORT || 8003);

const routes = [
  ['/api/destinations', 'destinations.js'],
  [/^\/api\/destinations\/(\d+)$/, 'destinations/[id].js', 'id'],
  ['/api/itineraries', 'itineraries.js'],
  ['/api/support', 'support.js'],
  ['/api/status', 'status.js'],
  ['/api/qr/scan', 'qr/scan.js'],
  ['/api/chat', 'chat.js'],
  ['/api/chat/stream', 'chat/stream.js'],
];

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  req.query = Object.fromEntries(url.searchParams);
  // Allow a frontend served from another port (VITE_API_URL) to call us directly.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  for (const [pattern, file, param] of routes) {
    const match = typeof pattern === 'string' ? (url.pathname === pattern ? [] : null) : url.pathname.match(pattern);
    if (!match) continue;
    if (param) req.query[param] = match[1];
    try {
      await require(path.join(root, file))(req, res);
    } catch (err) {
      console.error(err);
      res.statusCode = 500; res.end(JSON.stringify({ detail: String(err.message || err) }));
    }
    return;
  }
  if (url.pathname === '/healthz') { res.end('{"status":"ok"}'); return; }
  res.statusCode = 404; res.end(JSON.stringify({ detail: 'not found' }));
}).listen(port, '127.0.0.1', () => console.log(`dev-api on http://127.0.0.1:${port}`));
