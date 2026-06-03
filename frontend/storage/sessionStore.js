const SESSION_KEY = 'baccarat-pro-2-sessions';

export function createSessionStore(key = SESSION_KEY) {
  function list() {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      return JSON.parse(raw) || [];
    } catch {
      return [];
    }
  }

  function save(session) {
    const sessions = list();
    sessions.unshift(session);
    localStorage.setItem(key, JSON.stringify(sessions.slice(0, 50)));
  }

  function remove(index) {
    const sessions = list();
    sessions.splice(index, 1);
    localStorage.setItem(key, JSON.stringify(sessions));
  }

  return { list, save, remove };
}
