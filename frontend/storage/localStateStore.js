const STORAGE_KEY = 'baccarat-pro-2-state';

export function createLocalStateStore(key = STORAGE_KEY) {
  function save(payload) {
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      payload
    }));
  }

  function load() {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function clear() {
    localStorage.removeItem(key);
  }

  return { save, load, clear };
}
