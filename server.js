import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// ── Supabase helpers ───────────────────────────────────────
function sbHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer': 'return=minimal'
  };
}

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...sbHeaders(), ...(options.headers || {}) }
  });
  return res;
}

async function getAllSessions() {
  try {
    const res = await sbFetch('sessions?select=data&order=updated_at.asc');
    if (!res.ok) { console.error('getAllSessions error:', res.status, await res.text()); return []; }
    const rows = await res.json();
    return rows.map(r => r.data);
  } catch (e) { console.error('getAllSessions exception:', e); return []; }
}

async function upsertSession(session) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        name: session.name,
        data: session,
        updated_at: new Date().toISOString()
      })
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('upsertSession error:', res.status, txt);
    }
  } catch (e) { console.error('upsertSession exception:', e); }
}

async function clearAllSessions() {
  try {
    const res = await sbFetch('sessions?name=neq.null', { method: 'DELETE' });
    if (!res.ok) console.error('clearAllSessions error:', res.status, await res.text());
  } catch (e) { console.error('clearAllSessions exception:', e); }
}

// ── HTTP server ────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // GET /api/sessions
  if (req.method === 'GET' && req.url === '/api/sessions') {
    const sessions = await getAllSessions();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(sessions));
    return;
  }

  // POST /api/sessions
  if (req.method === 'POST' && req.url === '/api/sessions') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const session = JSON.parse(body);
        if (!session || !session.name) { res.writeHead(400); res.end('Missing name'); return; }
        await upsertSession(session);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(400); res.end('Invalid JSON'); }
    });
    return;
  }

  // DELETE /api/sessions
  if (req.method === 'DELETE' && req.url === '/api/sessions') {
    await clearAllSessions();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Serve index.html
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) { res.writeHead(500); res.end('index.html not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔒 RemoteShield running on port ${PORT}`);
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('⚠️  SUPABASE_URL or SUPABASE_KEY not set — sessions will not persist!');
  } else {
    console.log(`✅  Supabase connected: ${SUPABASE_URL}`);
  }
});
