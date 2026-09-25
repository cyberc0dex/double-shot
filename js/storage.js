/**
 * Guarded localStorage access.
 *
 * Safari private mode throws on setItem and iOS can evict the store entirely,
 * so every read and write is wrapped. A failure degrades the app to
 * in-memory-only rather than taking it down.
 */

const KEY = 'doubleshot.state';

let warned = false;

function warnOnce(err) {
  if (!warned) {
    warned = true;
    console.warn('[double-shot] storage unavailable, running in memory only', err);
  }
}

export function loadRaw() {
  try {
    const text = localStorage.getItem(KEY);
    return text ? JSON.parse(text) : null;
  } catch (err) {
    warnOnce(err);
    return null;
  }
}

export function saveRaw(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch (err) {
    warnOnce(err);
    return false;
  }
}

export function clearAll() {
  try {
    localStorage.removeItem(KEY);
    // Clean up the pre-3.0 keys as well.
    ['players', 'stats', 'history', 'playerInput'].forEach(k => localStorage.removeItem(k));
    return true;
  } catch (err) {
    warnOnce(err);
    return false;
  }
}

/**
 * Reads the pre-3.0 layout (separate `players` / `history` keys) so existing
 * sessions are not lost on upgrade.
 */
export function loadLegacy() {
  try {
    const players = JSON.parse(localStorage.getItem('players') || 'null');
    const history = JSON.parse(localStorage.getItem('history') || 'null');
    if (!Array.isArray(players) && !Array.isArray(history)) return null;
    return { players: players || [], history: history || [] };
  } catch (err) {
    warnOnce(err);
    return null;
  }
}
