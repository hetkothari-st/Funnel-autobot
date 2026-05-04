import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const BROKER_WS = process.env.BROKER_WS || 'ws://115.242.15.134:19101';
const MEGATRADER_API = process.env.MEGATRADER_API_URL || 'http://192.168.6.164:16006';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// Session management (in-memory) — keyed by username
const activeSessions = new Map();

async function validateCredentials(username, password) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[auth] SUPABASE_URL or SUPABASE_SERVICE_KEY not configured');
    return { ok: false, error: 'Server auth not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars.' };
  }
  try {
    const url = `${SUPABASE_URL}/rest/v1/app_users?username=eq.${encodeURIComponent(username)}&is_active=eq.true&select=username,password`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return { ok: false, error: 'Authentication service unavailable.' };
    const rows = await res.json();
    if (rows.length === 0) return { ok: false, error: 'Invalid username or password.' };
    if (rows[0].password !== password) return { ok: false, error: 'Invalid username or password.' };
    return { ok: true, user: { username: rows[0].username } };
  } catch (err) {
    console.error('[auth] Supabase error:', err.message);
    return { ok: false, error: 'Authentication service error. Try again.' };
  }
}

// --- Auth endpoints ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.json({ ok: false, error: 'Username and password are required.' });

  const result = await validateCredentials(username, password);
  if (!result.ok) return res.json(result);

  const sessionToken = crypto.randomBytes(32).toString('hex');
  activeSessions.set(username, { sessionToken, connectedAt: Date.now() });
  console.log(`[auth] Login SUCCESS for ${username}`);
  return res.json({ ok: true, user: result.user, sessionToken });
});

app.post('/api/logout', (req, res) => {
  const { sessionToken } = req.body || {};
  for (const [username, session] of activeSessions) {
    if (session.sessionToken === sessionToken) {
      activeSessions.delete(username);
      break;
    }
  }
  res.json({ ok: true });
});

app.post('/api/validate-session', (req, res) => {
  const { sessionToken } = req.body || {};
  if (!sessionToken) return res.json({ ok: false });
  for (const [username, session] of activeSessions) {
    if (session.sessionToken === sessionToken) {
      return res.json({ ok: true, user: { username } });
    }
  }
  return res.json({ ok: false });
});

// --- Megatrader API proxy ---
app.all('/megatrader-api/*', async (req, res) => {
  const targetPath = req.originalUrl.replace(/^\/megatrader-api/, '');
  const targetUrl = `${MEGATRADER_API}${targetPath}`;
  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;

    const fetchOpts = {
      method: req.method,
      headers,
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOpts.body = JSON.stringify(req.body);
      fetchOpts.headers['content-type'] = 'application/json';
    }

    const upstream = await fetch(targetUrl, fetchOpts);
    const contentType = upstream.headers.get('content-type') || '';
    res.status(upstream.status);
    if (contentType.includes('json')) {
      res.json(await upstream.json());
    } else {
      res.send(await upstream.text());
    }
  } catch (err) {
    console.error('[API Proxy] Error:', err.message);
    res.status(502).json({ error: 'API proxy error' });
  }
});

// --- Serve static files ---
// Main app
const mainDist = path.join(__dirname, '..', 'dist');
app.use(express.static(mainDist));

// Autobot app at /autobot/
const autobotDist = path.join(__dirname, '..', 'dist-autobot');
app.use('/autobot', express.static(autobotDist));

// SPA fallback for autobot
app.get('/autobot/*', (req, res) => {
  res.sendFile(path.join(autobotDist, 'index.html'));
});

// SPA fallback for main app (must be last)
app.get('*', (req, res) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/megatrader-api/')) return;
  res.sendFile(path.join(mainDist, 'index.html'));
});

// --- HTTP Server + WebSocket ---
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (clientWs) => {
  console.log('[WS] Client connected, opening upstream to broker...');
  const upstream = new WebSocket(BROKER_WS);

  upstream.on('open', () => {
    console.log('[WS] Upstream broker connected');
  });

  upstream.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      clientWs.send(text);
    }
  });

  upstream.on('close', () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  upstream.on('error', (err) => {
    console.error('[WS] Upstream error:', err.message);
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  clientWs.on('message', (data) => {
    if (upstream.readyState === WebSocket.OPEN) {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      upstream.send(text);
    }
  });

  clientWs.on('close', () => {
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  });

  clientWs.on('error', (err) => {
    console.error('[WS] Client error:', err.message);
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  });
});

// --- Log outbound IP for broker whitelisting ---
server.listen(PORT, async () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] Broker WS: ${BROKER_WS}`);
  console.log(`[Server] Megatrader API: ${MEGATRADER_API}`);
  try {
    const res = await fetch('https://api.ipify.org?format=text');
    const ip = await res.text();
    console.log(`[Server] Outbound IP: ${ip}`);
  } catch {
    console.log('[Server] Could not resolve outbound IP');
  }
});
