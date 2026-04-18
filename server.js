/* Minimal static server with security headers for Railway.

   Why: Static hosts like Cloudflare Pages/Netlify can read `_headers`, but Railway
   running `serve` won't apply that file. This server serves the same files and
   adds real HTTP security headers.
*/

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const BACKEND_BASE_URL = String(
  process.env.FLAMEBOT_BACKEND_BASE_URL
  || process.env.FLAMEBOT_BACKEND_URL
  || process.env.BACKEND_BASE_URL
  || process.env.BACKEND_URL
  || ''
).trim().replace(/\/+$/, '');
const WEBSITE_ANALYTICS_SECRET = String(process.env.FLAMEBOT_WEBSITE_ANALYTICS_SECRET || '').trim();
const COOKIE_PREFERENCES_NAME = 'flamebot_cookie_preferences';

const CANONICAL_HOST = 'www.flamebotapp.com';

const COMPRESSIBLE_CONTENT_TYPES = [
  'text/',
  'application/javascript',
  'application/json',
  'application/xml',
  'image/svg+xml',
];

const CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self' mailto:; upgrade-insecure-requests";

function writeJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  const header = String(req.headers.cookie || '');
  if (!header) {
    return {};
  }

  return header.split(';').reduce((cookies, part) => {
    const trimmed = String(part || '').trim();
    if (!trimmed) {
      return cookies;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      return cookies;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key) {
      cookies[key] = value;
    }
    return cookies;
  }, {});
}

function hasAnalyticsConsent(req) {
  const cookies = parseCookies(req);
  const rawValue = cookies[COOKIE_PREFERENCES_NAME];
  if (!rawValue) {
    return false;
  }

  try {
    const decodedValue = decodeURIComponent(rawValue);
    const params = new URLSearchParams(decodedValue);
    const analytics = String(params.get('analytics') || '').toLowerCase();
    return analytics === '1' || analytics === 'true' || analytics === 'yes';
  } catch (_error) {
    return false;
  }
}

function emitWebsiteAnalytics(req, pagePath) {
  if (!BACKEND_BASE_URL || !WEBSITE_ANALYTICS_SECRET) {
    return;
  }

  const normalizedPath = String(pagePath || '/').trim() || '/';
  if (normalizedPath.startsWith('/admin') || normalizedPath.startsWith('/ambassador') || normalizedPath.startsWith('/api/')) {
    return;
  }

  if (!hasAnalyticsConsent(req)) {
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL('/internal/website-analytics/event', `${BACKEND_BASE_URL}/`);
  } catch (_error) {
    return;
  }

  const client = targetUrl.protocol === 'https:' ? https : http;
  const payload = JSON.stringify({
    event_type: 'page_view',
    page_path: normalizedPath,
    referrer: req.headers.referer || '',
    user_agent: req.headers['user-agent'] || '',
  });

  const analyticsReq = client.request(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || undefined,
      method: 'POST',
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(payload),
        'x-flamebot-analytics-secret': WEBSITE_ANALYTICS_SECRET,
        'x-forwarded-for': req.socket.remoteAddress || '',
        'user-agent': req.headers['user-agent'] || 'flamebot-website-analytics',
      },
    },
    (analyticsRes) => {
      analyticsRes.resume();
    }
  );

  analyticsReq.on('error', () => {});
  analyticsReq.write(payload);
  analyticsReq.end();
}

function proxyBackendRequest(req, res, upstreamPath) {
  if (!BACKEND_BASE_URL) {
    return writeJson(res, 503, {
      status: 'ERROR',
      message: 'Backend base URL is not configured on the website service',
    });
  }

  let targetUrl;
  try {
    targetUrl = new URL(upstreamPath, `${BACKEND_BASE_URL}/`);
  } catch (_error) {
    return writeJson(res, 500, {
      status: 'ERROR',
      message: 'Invalid backend URL configuration',
    });
  }

  const client = targetUrl.protocol === 'https:' ? https : http;
  const headers = {
    accept: req.headers.accept || 'application/json',
    authorization: req.headers.authorization || '',
    'content-type': req.headers['content-type'] || 'application/json; charset=utf-8',
    'user-agent': req.headers['user-agent'] || 'flamebot-website-admin-proxy',
    'x-forwarded-for': req.socket.remoteAddress || '',
  };
  if (req.headers['x-request-id']) {
    headers['x-request-id'] = req.headers['x-request-id'];
  }

  const proxyReq = client.request(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || undefined,
      method: req.method,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers,
    },
    (proxyRes) => {
      res.statusCode = proxyRes.statusCode || 502;
      res.setHeader('Cache-Control', 'no-store');

      for (const [headerName, headerValue] of Object.entries(proxyRes.headers)) {
        if (!headerValue) {
          continue;
        }
        const lower = headerName.toLowerCase();
        if (['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-encoding', 'host'].includes(lower)) {
          continue;
        }
        res.setHeader(headerName, headerValue);
      }

      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', () => {
    if (!res.headersSent) {
      writeJson(res, 502, {
        status: 'ERROR',
        message: 'Unable to reach backend service',
      });
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq);
}

function setSecurityHeaders(req, res) {
  // NOTE: We intentionally keep headers aligned with the meta CSP in the HTML.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);

  // Only send HSTS when we are effectively on HTTPS.
  // Cloudflare/Railway commonly set X-Forwarded-Proto.
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (forwardedProto === 'https') {
    // Safer default: do not includeSubDomains/preload unless you are 100% sure
    // every subdomain will always support HTTPS.
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
}

function safeJoin(root, requestPath) {
  // Prevent path traversal
  const decoded = decodeURIComponent(requestPath);
  const normalized = path.normalize(decoded).replace(/^([/\\])+/, '');
  return path.join(root, normalized);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.ico': return 'image/x-icon';
    case '.svg': return 'image/svg+xml; charset=utf-8';
    case '.txt': return 'text/plain; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function isCompressibleContentType(contentType) {
  const normalized = String(contentType || '').toLowerCase();
  if (!normalized) {
    return false;
  }
  return COMPRESSIBLE_CONTENT_TYPES.some((prefix) => normalized.startsWith(prefix));
}

function negotiateCompression(req, contentType, fileSize) {
  const method = String(req.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return null;
  }
  if (Number(fileSize || 0) < 1024) {
    return null;
  }
  if (!isCompressibleContentType(contentType)) {
    return null;
  }
  if (req.headers.range) {
    return null;
  }

  const acceptEncoding = String(req.headers['accept-encoding'] || '').toLowerCase();
  if (acceptEncoding.includes('br')) {
    return {
      encoding: 'br',
      stream: zlib.createBrotliCompress({
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
        },
      }),
    };
  }
  if (acceptEncoding.includes('gzip')) {
    return {
      encoding: 'gzip',
      stream: zlib.createGzip({ level: 6 }),
    };
  }
  return null;
}

function serveFile(req, res, filePath, requestPath = '') {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not found');
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypeFor(filePath));
    res.setHeader('Last-Modified', stat.mtime.toUTCString());

    const ifModifiedSinceRaw = String(req.headers['if-modified-since'] || '').trim();
    if (ifModifiedSinceRaw) {
      const ifModifiedSince = Date.parse(ifModifiedSinceRaw);
      if (Number.isFinite(ifModifiedSince) && stat.mtimeMs <= ifModifiedSince) {
        res.statusCode = 304;
        res.end();
        return;
      }
    }

    // Cache static assets lightly; keep HTML uncached to allow fast updates.
    if (filePath.includes(`${path.sep}admin${path.sep}`)) {
      res.setHeader('Cache-Control', 'no-store');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
      emitWebsiteAnalytics(req, requestPath || '/');
    } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      // JS/CSS should refresh quickly after deploy; keep long cache only for media.
      const ext = path.extname(filePath).toLowerCase();
      const baseName = path.basename(filePath).toLowerCase();
      if (ext === '.js' || ext === '.css') {
        if (baseName === 'admin.js' || baseName === 'admin.css') {
          res.setHeader('Cache-Control', 'no-store');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
        }
      } else {
        res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
      }
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    }

    if (String(req.method || '').toUpperCase() === 'HEAD') {
      res.end();
      return;
    }

    const compression = negotiateCompression(req, res.getHeader('Content-Type'), stat.size);
    if (compression) {
      res.setHeader('Content-Encoding', compression.encoding);
      res.setHeader('Vary', 'Accept-Encoding');
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Server error');
    });
    if (compression) {
      stream.pipe(compression.stream).pipe(res);
      return;
    }
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const hostHeader = String(req.headers.host || '').toLowerCase();
  const host = hostHeader.split(':')[0];
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';

  setSecurityHeaders(req, res);

  // Canonicalize to https://www.flamebotapp.com in production.
  // This avoids duplicate-content URLs across:
  // - flamebotapp.com
  // - flamebot-production.up.railway.app
  // and ensures consistent HTTPS.
  if (!isLocalHost) {
    const needsCanonicalHost = host && host !== CANONICAL_HOST;
    const needsHttps = forwardedProto && forwardedProto !== 'https';

    if (needsCanonicalHost || needsHttps) {
      const location = `https://${CANONICAL_HOST}${req.url || '/'}`;
      res.statusCode = 308;
      res.setHeader('Location', location);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`Redirecting to ${location}`);
      return;
    }
  }

  const parsed = url.parse(req.url || '/');
  const pathname = String(parsed.pathname || '/');

  if (pathname.startsWith('/api/backend/')) {
    const upstreamPath = pathname.replace('/api/backend', '') || '/';
    const queryText = parsed.search || '';
    proxyBackendRequest(req, res, `${upstreamPath}${queryText}`);
    return;
  }

  // Map request path -> filesystem path.
  // - /download/ -> /download/index.html
  // - / -> /index.html
  let fsPath;

  if (pathname.endsWith('/')) {
    fsPath = safeJoin(ROOT, pathname + 'index.html');
  } else {
    fsPath = safeJoin(ROOT, pathname);
  }

  // If requesting a directory without trailing slash, try to serve its index.
  fs.stat(fsPath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      return serveFile(req, res, path.join(fsPath, 'index.html'), pathname);
    }

    // Fallbacks:
    // - If /something has no extension and doesn't exist as a file, try /something.html
    //   (useful for /privacy -> /privacy.html if you ever add such links)
    if (err && !path.extname(fsPath)) {
      const htmlCandidate = fsPath + '.html';
      return serveFile(req, res, htmlCandidate, pathname);
    }

    return serveFile(req, res, fsPath, pathname);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`FlameBot website server listening on :${PORT}`);
});