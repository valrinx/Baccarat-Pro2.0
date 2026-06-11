import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FILE = path.join(__dirname, '..', '..', 'models', 'sessions.json');

async function readSessions() {
  try {
    const raw = await fs.readFile(SESSION_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeSessions(sessions) {
  await fs.mkdir(path.dirname(SESSION_FILE), { recursive: true });
  await fs.writeFile(SESSION_FILE, JSON.stringify(sessions.slice(0, 100), null, 2), 'utf8');
}

export function registerSessionRoute(app) {
  app.get('/api/session', async (req, res) => {
    const sessions = await readSessions();
    res.json({ ok: true, sessions });
  });

  app.post('/api/session', async (req, res) => {
    const payload = req.body ?? {};
    const sessions = await readSessions();
    const session = {
      rounds: Number(payload.rounds ?? 0),
      p: Number(payload.p ?? 0),
      b: Number(payload.b ?? 0),
      t: Number(payload.t ?? 0),
      pnl: Number(payload.pnl ?? 0),
      createdAt: payload.createdAt ?? new Date().toISOString()
    };
    sessions.unshift(session);
    await writeSessions(sessions);
    res.json({ ok: true, session });
  });
}
