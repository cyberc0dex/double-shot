/** Small formatting helpers shared by the UI and the share-image renderer. */

/** 754 -> "12:34" */
export function clock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** 754 -> "12m 34s", 10035 -> "2h 47m" */
export function duration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(r).padStart(2, '0')}s`;
  return `${r}s`;
}

/** "12:34" -> 754. Returns NaN for anything that is not mm:ss. */
export function parseClock(text) {
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(String(text).trim());
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function percent(value, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function sessionDate(ts = Date.now()) {
  return new Date(ts).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  });
}

export function timeOfDay(ts = Date.now()) {
  return new Date(ts).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

/** A stable-ish unique id. crypto.randomUUID is not available over plain HTTP. */
export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
