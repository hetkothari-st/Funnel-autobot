import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const BROKER_WS = process.env.BROKER_WS || 'ws://115.242.15.134:19101';
const MEGATRADER_API = process.env.MEGATRADER_API_URL || 'http://192.168.6.164:16006';

// Supabase config
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ltcmymgikqjdtspkzzip.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Y215bWdpa3FqZHRzcGt6emlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4MTgxNjMsImV4cCI6MjA2NTM5NDE2M30.803s7RDe7WlSzFkSvMaqdbIsKMcjh3mGYaBqBnHEZJM';

// Session management (in-memory)
const activeSessions = new Map();

// --- Auth endpoints ---
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/allowed_users?select=*&email=eq.${encodeURIComponent(email)}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    const users = await response.json();
    if (!users || users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = users[0];
    if (user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });

    const sessionToken = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    // Replace existing session for this user (allows re-login after refresh)
    for (const [token, session] of activeSessions.entries()) {
      if (session.email === email) {
        activeSessions.delete(token);
      }
    }
    activeSessions.set(sessionToken, { email, name: user.name || email, loginAt: Date.now() });

    res.json({
      user: { email, name: user.name || email },
      sessionToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  const token = req.headers['x-session-token'];
  if (token) activeSessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/validate-session', (req, res) => {
  const token = req.headers['x-session-token'];
  if (!token) return res.status(401).json({ error: 'No token' });
  const session = activeSessions.get(token);
  if (!session) return res.status(401).json({ error: 'Invalid session' });
  res.json({ user: { email: session.email, name: session.name } });
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
