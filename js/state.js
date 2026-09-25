/**
 * Application state.
 *
 * `history` is the single source of truth: every scoreboard number, highlight
 * and matchmaking weight is derived from it by `deriveStats()`. Nothing
 * incrementally mutates a stored win/loss counter, which is what let the old
 * build drift out of sync after an edit or delete.
 */

import { loadRaw, saveRaw, clearAll, loadLegacy } from './storage.js';
import { uid } from './format.js';

export const SCHEMA_VERSION = 3;

export const STATUS = {
  AVAILABLE: 'available',
  RESTING: 'resting',
  UNAVAILABLE: 'unavailable'
};

export const STATUS_ORDER = [STATUS.AVAILABLE, STATUS.RESTING, STATUS.UNAVAILABLE];

const listeners = new Set();

/** @type {{schemaVersion:number, startedAt:number, players:Array, history:Array, activeMatch:Object|null}} */
export let state = blank();

function blank() {
  return {
    schemaVersion: SCHEMA_VERSION,
    startedAt: Date.now(),
    players: [],      // [{ id, name, status }]
    history: [],      // [{ id, teamA, teamB, scoreA, scoreB, winner, durationSeconds, endedAt }]
    activeMatch: null // { teamA, teamB, scoreA, scoreB, startedAt, accumulated, running, pointLog }
  };
}

/* ---------------------------------------------------------------- lifecycle */

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function commit() {
  saveRaw(state);
  listeners.forEach(fn => fn(state));
}

export function load() {
  const raw = loadRaw();
  if (raw && raw.players) {
    state = migrate(raw);
    return;
  }

  const legacy = loadLegacy();
  if (legacy) {
    state = fromLegacy(legacy);
    saveRaw(state);
    return;
  }

  state = blank();
}

export function resetSession() {
  clearAll();
  state = blank();
  commit();
}

function migrate(raw) {
  const next = Object.assign(blank(), raw);
  next.schemaVersion = SCHEMA_VERSION;
  next.players = (raw.players || []).map(normalisePlayer).filter(Boolean);
  next.history = (raw.history || []).map(normaliseMatch).filter(Boolean);
  next.activeMatch = normaliseActive(raw.activeMatch);
  return next;
}

function normalisePlayer(entry) {
  const name = typeof entry === 'string' ? entry : entry && entry.name;
  if (!name) return null;
  const status = (entry && entry.status) || STATUS.AVAILABLE;
  return {
    id: (entry && entry.id) || uid(),
    name: String(name).trim(),
    status: STATUS_ORDER.includes(status) ? status : STATUS.AVAILABLE
  };
}

function normaliseMatch(entry) {
  if (!entry || !Array.isArray(entry.teamA) || !Array.isArray(entry.teamB)) return null;
  const scoreA = Number(entry.scoreA) || 0;
  const scoreB = Number(entry.scoreB) || 0;

  // Pre-3.0 stored duration as an "mm:ss" string.
  let seconds = Number(entry.durationSeconds);
  if (!Number.isFinite(seconds)) {
    const parts = String(entry.duration || '0:00').split(':').map(Number);
    seconds = parts.length === 2 && parts.every(Number.isFinite) ? parts[0] * 60 + parts[1] : 0;
  }

  return {
    id: entry.id || uid(),
    teamA: entry.teamA.map(n => String(n).trim()),
    teamB: entry.teamB.map(n => String(n).trim()),
    scoreA,
    scoreB,
    winner: scoreA === scoreB ? (entry.winner || 'TeamA') : (scoreA > scoreB ? 'TeamA' : 'TeamB'),
    durationSeconds: Math.max(0, Math.round(seconds)),
    endedAt: Number(entry.endedAt) || null
  };
}

function normaliseActive(entry) {
  if (!entry || !Array.isArray(entry.teamA) || entry.teamA.length !== 2) return null;
  return {
    teamA: entry.teamA.slice(0, 2),
    teamB: (entry.teamB || []).slice(0, 2),
    scoreA: Number(entry.scoreA) || 0,
    scoreB: Number(entry.scoreB) || 0,
    startedAt: Number(entry.startedAt) || Date.now(),
    accumulated: Number(entry.accumulated) || 0,
    running: entry.running !== false,
    pointLog: Array.isArray(entry.pointLog) ? entry.pointLog : []
  };
}

function fromLegacy(legacy) {
  const next = blank();
  next.history = legacy.history.map(normaliseMatch).filter(Boolean);
  const names = new Set(legacy.players.map(p => String(p).trim()).filter(Boolean));
  next.history.forEach(m => [...m.teamA, ...m.teamB].forEach(n => names.add(n)));
  next.players = [...names].map(name => ({ id: uid(), name, status: STATUS.AVAILABLE }));
  return next;
}

/* ------------------------------------------------------------------ roster */

const key = name => String(name).trim().toLowerCase();

export function findPlayer(name) {
  const k = key(name);
  return state.players.find(p => key(p.name) === k) || null;
}

/** Adds one or many comma/newline separated names. Returns {added, skipped}. */
export function addPlayers(text) {
  const names = String(text)
    .split(/[,\n;]+/)
    .map(n => n.trim())
    .filter(Boolean);

  const added = [];
  const skipped = [];

  names.forEach(name => {
    if (findPlayer(name)) {
      skipped.push(name);
      return;
    }
    // Guard against duplicates inside the same paste.
    if (added.some(a => key(a) === key(name))) {
      skipped.push(name);
      return;
    }
    state.players.push({ id: uid(), name, status: STATUS.AVAILABLE });
    added.push(name);
  });

  if (added.length) commit();
  return { added, skipped };
}

export function setPlayerStatus(id, status) {
  const player = state.players.find(p => p.id === id);
  if (!player || !STATUS_ORDER.includes(status)) return;
  player.status = status;
  commit();
}

export function removePlayer(id) {
  const index = state.players.findIndex(p => p.id === id);
  if (index === -1) return;
  state.players.splice(index, 1);
  commit();
}

/** Names that are on court right now (they cannot be picked for a new match). */
export function playingNames() {
  if (!state.activeMatch) return new Set();
  return new Set([...state.activeMatch.teamA, ...state.activeMatch.teamB].map(key));
}

/** Effective status, accounting for the live match. */
export function effectiveStatus(player) {
  return playingNames().has(key(player.name)) ? 'playing' : player.status;
}

/** Players eligible to be picked: available, and not already on court. */
export function selectablePlayers() {
  const busy = playingNames();
  return state.players.filter(p => p.status === STATUS.AVAILABLE && !busy.has(key(p.name)));
}

/* ------------------------------------------------------------------- stats */

/**
 * Rebuilds every derived number from `history`. Call after any mutation.
 * Returns a Map keyed by player name.
 */
export function deriveStats() {
  const stats = new Map();

  const ensure = name => {
    if (!stats.has(name)) {
      stats.set(name, {
        name,
        win: 0,
        loss: 0,
        played: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        seconds: 0,
        lastMatchIndex: -1,
        streak: 0
      });
    }
    return stats.get(name);
  };

  // Roster players start at zero so they appear in the standings immediately.
  state.players.forEach(p => ensure(p.name));

  state.history.forEach((match, index) => {
    const sides = [
      { names: match.teamA, mine: match.scoreA, theirs: match.scoreB, won: match.winner === 'TeamA' },
      { names: match.teamB, mine: match.scoreB, theirs: match.scoreA, won: match.winner === 'TeamB' }
    ];

    sides.forEach(side => {
      side.names.forEach(name => {
        const s = ensure(name);
        s.played += 1;
        s[side.won ? 'win' : 'loss'] += 1;
        s.pointsFor += side.mine;
        s.pointsAgainst += side.theirs;
        s.seconds += match.durationSeconds;
        s.lastMatchIndex = index;
        s.streak = side.won ? Math.max(1, s.streak + 1) : Math.min(-1, s.streak - 1);
      });
    });
  });

  stats.forEach(s => {
    s.winRate = s.played ? s.win / s.played : 0;
    s.diff = s.pointsFor - s.pointsAgainst;
    // Laplace-smoothed rating, so one lucky win does not read as 100%.
    s.rating = (s.win + 1) / (s.played + 2);
  });

  return stats;
}

/** Standings, strongest first. */
export function standings(stats = deriveStats()) {
  return [...stats.values()].sort((a, b) =>
    b.win - a.win ||
    a.loss - b.loss ||
    b.winRate - a.winRate ||
    b.diff - a.diff ||
    a.name.localeCompare(b.name)
  );
}

/** How often each unordered pair has partnered / faced each other. */
export function buildPairCounts() {
  const partners = new Map();
  const opponents = new Map();

  const bump = (map, a, b) => {
    const k = [a, b].sort().join('\u0000');
    map.set(k, (map.get(k) || 0) + 1);
  };

  state.history.forEach(match => {
    bump(partners, match.teamA[0], match.teamA[1]);
    bump(partners, match.teamB[0], match.teamB[1]);
    match.teamA.forEach(a => match.teamB.forEach(b => bump(opponents, a, b)));
  });

  const read = (map, a, b) => map.get([a, b].sort().join('\u0000')) || 0;
  return {
    partnered: (a, b) => read(partners, a, b),
    faced: (a, b) => read(opponents, a, b)
  };
}

/* ----------------------------------------------------------------- matches */

export function addMatch(match) {
  state.history.push(Object.assign({ id: uid(), endedAt: Date.now() }, match));
  commit();
}

export function updateMatch(id, patch) {
  const match = state.history.find(m => m.id === id);
  if (!match) return false;
  Object.assign(match, patch);
  commit();
  return true;
}

/** Removes a match and returns it, so the caller can offer an undo. */
export function removeMatch(id) {
  const index = state.history.findIndex(m => m.id === id);
  if (index === -1) return null;
  const [removed] = state.history.splice(index, 1);
  commit();
  return { match: removed, index };
}

export function restoreMatch(match, index) {
  state.history.splice(Math.min(index, state.history.length), 0, match);
  commit();
}

/* ------------------------------------------------------------ active match */

export function startMatch(teamA, teamB) {
  state.activeMatch = {
    teamA, teamB,
    scoreA: 0, scoreB: 0,
    startedAt: Date.now(),
    accumulated: 0,
    running: true,
    pointLog: []
  };
  commit();
}

export function clearActiveMatch() {
  state.activeMatch = null;
  commit();
}

/** Elapsed seconds, correct across reloads and pauses. */
export function elapsedSeconds(match = state.activeMatch) {
  if (!match) return 0;
  const live = match.running ? Date.now() - match.startedAt : 0;
  return Math.max(0, Math.floor((match.accumulated + live) / 1000));
}

export function addPoint(side) {
  const m = state.activeMatch;
  if (!m) return;
  if (side === 'A') m.scoreA += 1; else m.scoreB += 1;
  m.pointLog.push(side);
  commit();
}

export function undoPoint() {
  const m = state.activeMatch;
  if (!m || !m.pointLog.length) return false;
  const side = m.pointLog.pop();
  if (side === 'A') m.scoreA = Math.max(0, m.scoreA - 1);
  else m.scoreB = Math.max(0, m.scoreB - 1);
  commit();
  return true;
}

export function adjustScore(side, delta) {
  const m = state.activeMatch;
  if (!m) return;
  if (side === 'A') m.scoreA = Math.max(0, m.scoreA + delta);
  else m.scoreB = Math.max(0, m.scoreB + delta);
  // A manual nudge desyncs the point log, so drop it rather than lie about undo.
  if (delta < 0) m.pointLog.length = 0;
  commit();
}

export function togglePause() {
  const m = state.activeMatch;
  if (!m) return;
  if (m.running) {
    m.accumulated += Date.now() - m.startedAt;
    m.running = false;
  } else {
    m.startedAt = Date.now();
    m.running = true;
  }
  commit();
}

/** Whose serve it is, inferred from the rally-point log. */
export function servingSide() {
  const m = state.activeMatch;
  if (!m) return null;
  if (!m.pointLog.length) return 'A';
  return m.pointLog[m.pointLog.length - 1];
}
