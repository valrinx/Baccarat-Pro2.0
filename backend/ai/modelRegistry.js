import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODEL_DIR = path.join(__dirname, '..', '..', 'models');

export function createModelRegistry() {
  async function ensureDir() {
    await fs.mkdir(MODEL_DIR, { recursive: true });
  }

  async function saveMeta(name, meta) {
    await ensureDir();
    await fs.writeFile(path.join(MODEL_DIR, `${name}.json`), JSON.stringify(meta, null, 2), 'utf8');
  }

  async function loadMeta(name) {
    try {
      const raw = await fs.readFile(path.join(MODEL_DIR, `${name}.json`), 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  return { saveMeta, loadMeta };
}
