/**
 * Session highlights, all derived from history.
 *
 * Each highlight reports its own `unlocked` flag rather than relying on a
 * single global threshold, so deleting matches correctly re-locks them.
 */

import { duration } from './format.js';

const MIN_MATCHES = 4;

/** Top player: most wins, then win rate, then whoever got there first. */
function topPlayer(history, stats) {
  const contenders = [...stats.values()].filter(s => s.played > 0);
  if (!contenders.length) return null;

  const maxWins = Math.max(...contenders.map(s => s.win));
  if (maxWins === 0) return null;

  let pool = contenders.filter(s => s.win === maxWins);

  if (pool.length > 1) {
    const bestRate = Math.max(...pool.map(s => s.winRate));
    pool = pool.filter(s => s.winRate === bestRate);
  }

  if (pool.length > 1) {
    // Tie break on who reached that win count earliest in the session.
    const reachedAt = name => {
      let wins = 0;
      for (let i = 0; i < history.length; i++) {
        const m = history[i];
        const won = (m.winner === 'TeamA' && m.teamA.includes(name)) ||
                    (m.winner === 'TeamB' && m.teamB.includes(name));
        if (won && ++wins === maxWins) return i;
      }
      return Infinity;
    };
    pool = [pool.reduce((best, s) =>
      reachedAt(s.name) < reachedAt(best.name) ? s : best
    )];
  }

  return pool[0];
}

/** Widest winning margin. Ties broken by the faster match. */
function biggestMargin(history) {
  let best = null;
  history.forEach((match, index) => {
    const margin = Math.abs(match.scoreA - match.scoreB);
    if (!best ||
        margin > best.margin ||
        (margin === best.margin && match.durationSeconds < best.match.durationSeconds)) {
      best = { match, margin, index };
    }
  });
  return best;
}

function byDuration(history, pick) {
  let best = null;
  history.forEach(match => {
    if (match.durationSeconds <= 0) return;
    if (!best || pick(match.durationSeconds, best.durationSeconds)) best = match;
  });
  return best;
}

const sides = match => ({
  a: match.teamA.join(' & '),
  b: match.teamB.join(' & ')
});

/**
 * @returns {Array<{key, label, icon, unlocked, value, sub}>}
 *   `sub` is `{text, em?, meta?}`; `meta` is a second line under the names.
 */
export function computeHighlights(history, stats) {
  const unlocked = history.length >= MIN_MATCHES;
  const remaining = MIN_MATCHES - history.length;
  const locked = remaining === 1
    ? 'One more match to unlock'
    : `${remaining} more matches to unlock`;

  const mvp = unlocked ? topPlayer(history, stats) : null;
  const margin = unlocked ? biggestMargin(history) : null;
  const quickest = unlocked ? byDuration(history, (a, b) => a < b) : null;
  const longest = unlocked ? byDuration(history, (a, b) => a > b) : null;

  return [
    {
      key: 'mvp',
      label: 'Top player',
      icon: 'trophy',
      unlocked: Boolean(mvp),
      value: mvp ? mvp.name : locked,
      sub: mvp
        ? { text: `${mvp.win} of ${mvp.played} won,`, em: `${Math.round(mvp.winRate * 100)}% win rate` }
        : null
    },
    {
      key: 'duo',
      label: 'Deadly duo',
      icon: 'fire',
      unlocked: Boolean(margin),
      value: margin
        ? (margin.match.winner === 'TeamA' ? margin.match.teamA : margin.match.teamB).join(' & ')
        : locked,
      sub: margin
        ? { text: `Match ${margin.index + 1}, won by`, em: `${margin.margin} points` }
        : null
    },
    {
      key: 'quickest',
      label: 'Quickest match',
      icon: 'lightning',
      unlocked: Boolean(quickest),
      value: quickest ? duration(quickest.durationSeconds) : locked,
      sub: quickest ? {
        text: `${sides(quickest).a} vs ${sides(quickest).b}`,
        meta: `Match #${history.indexOf(quickest) + 1}`
      } : null
    },
    {
      key: 'longest',
      label: 'Longest match',
      icon: 'hourglass',
      unlocked: Boolean(longest),
      value: longest ? duration(longest.durationSeconds) : locked,
      sub: longest ? {
        text: `${sides(longest).a} vs ${sides(longest).b}`,
        meta: `Match #${history.indexOf(longest) + 1}`
      } : null
    }
  ];
}

export { MIN_MATCHES };
