import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Load .env.local into process.env
const envFile = path.join(ROOT_DIR, '.env.local');
if (fs.existsSync(envFile)) {
  const envText = fs.readFileSync(envFile, 'utf8');
  envText.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const index = trimmed.indexOf('=');
    if (index > 0) {
      const key = trimmed.slice(0, index).trim();
      const val = trimmed.slice(index + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // Polyfill status() for Vercel/Express-style handlers
  res.status = function(code) {
    this.statusCode = code;
    return this;
  };

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:8080'}`);
  const pathname = parsedUrl.pathname;

  // Handle /api/* requests
  if (pathname.startsWith('/api/')) {
    const apiName = pathname.slice('/api/'.length).replace(/\/$/, '');
    const apiFile = path.join(ROOT_DIR, 'api', `${apiName}.js`);
    if (fs.existsSync(apiFile)) {
      try {
        const mod = await import(`${apiFile}?t=${Date.now()}`);
        if (typeof mod.default === 'function') {
          return await mod.default(req, res);
        }
      } catch (err) {
        console.error(`[API ERROR] ${req.method} ${pathname}:`, err);
        res.status(500).setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ error: 'internal_error', message: err.message }));
      }
    }
    res.status(404).setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: 'not_found', path: pathname }));
  }

  // Handle static files
  let filePath = pathname === '/' ? path.join(ROOT_DIR, 'index.html') : path.join(ROOT_DIR, decodeURIComponent(pathname));
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(ROOT_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.statusCode = 200;
    res.setHeader('content-type', contentType);
    res.end(content);
  } catch (err) {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

const PORT = Number(process.env.PORT) || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Zheng Lab Tracker server running at http://localhost:${PORT}`);
});

