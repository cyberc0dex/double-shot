/**
 * Fair matchmaking.
 *
 * Two independent stages, both weighted-random rather than deterministic, so
 * the same roster does not produce the same match every time:
 *
 *   1. WHO PLAYS.  Four players are drawn from the available pool with a
 *      weight that rises sharply as games-played falls, and is cut for anyone
 *      who was on court in the last one or two matches. Nobody is ever
 *      excluded outright, so a full roster still rotates naturally.
 *
 *   2. WHO PARTNERS WHOM.  Four players split into three possible pairings.
 *      Each is costed on how often those two have already partnered, how
 *      often the two sides have already faced each other, and how lopsided
 *      the resulting teams look. Costs become weights through a softmax, so
 *      a repeat pairing stays possible, just unlikely.
 */

import { MATCHMAKING } from '../config.js';

/**
 * Draws `count` distinct items, each round proportional to its weight.
 */
function sampleWithoutReplacement(items, count, weightOf) {
  const pool = items.slice();
  const picked = [];

  while (picked.length < count && pool.length) {
    const weights = pool.map(weightOf);
    const total = weights.reduce((sum, w) => sum + w, 0);

    let index = pool.length - 1;
    if (total > 0) {
      let roll = Math.random() * total;
      for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll <= 0) { index = i; break; }
      }
    } else {
      index = Math.floor(Math.random() * pool.length);
    }

    picked.push(pool.splice(index, 1)[0]);
  }

  return picked;
}

/**
 * How strongly a player should be favoured for the next match.
 * Fewer games played and less recent court time both raise the weight.
 */
function selectionWeight(name, stats, historyLength, maxPlayed) {
  const s = stats.get(name);
  const played = s ? s.played : 0;
  const last = s ? s.lastMatchIndex : -1;

  // Someone with no games at all should clearly jump the queue.
  let weight = Math.pow(maxPlayed - played + 1, MATCHMAKING.restPower);

  const matchesAgo = last === -1 ? Infinity : historyLength - 1 - last;
  if (matchesAgo === 0) weight *= MATCHMAKING.lastMatchPenalty;
  else if (matchesAgo === 1) weight *= MATCHMAKING.prevMatchPenalty;

  return weight + MATCHMAKING.minWeight;
}

/** Laplace-smoothed strength in the 0 to 1 range. */
function ratingOf(name, stats) {
  const s = stats.get(name);
  if (!s) return 0.5;
  return s.rating;
}

/**
 * Picks the four players for the next match.
 * @returns {string[]} four names, or [] when the pool is too small.
 */
export function pickPlayers(pool, stats, historyLength) {
  if (pool.length < 4) return [];

  const maxPlayed = pool.reduce((max, name) => {
    const s = stats.get(name);
    return Math.max(max, s ? s.played : 0);
  }, 0);

  return sampleWithoutReplacement(
    pool,
    4,
    name => selectionWeight(name, stats, historyLength, maxPlayed)
  );
}

/**
 * Splits four players into two teams.
 * @returns {{teamA: string[], teamB: string[]}}
 */
export function pickTeams(four, stats, pairs) {
  const [p0, p1, p2, p3] = four;

  const splits = [
    { a: [p0, p1], b: [p2, p3] },
    { a: [p0, p2], b: [p1, p3] },
    { a: [p0, p3], b: [p1, p2] }
  ];

  const costs = splits.map(split => {
    // Penalise partnerships that have already happened. Logarithmic, so the
    // first repeat hurts most and the tenth does not dwarf every other term.
    const repeat = Math.log2(1 + pairs.partnered(split.a[0], split.a[1])) +
                   Math.log2(1 + pairs.partnered(split.b[0], split.b[1]));

    // Mildly penalise the same four facing off the same way again.
    let faced = 0;
    split.a.forEach(a => split.b.forEach(b => { faced += pairs.faced(a, b); }));
    faced = Math.log2(1 + faced / 4);

    // Prefer evenly matched sides.
    const ratingA = (ratingOf(split.a[0], stats) + ratingOf(split.a[1], stats)) / 2;
    const ratingB = (ratingOf(split.b[0], stats) + ratingOf(split.b[1], stats)) / 2;
    const imbalance = Math.abs(ratingA - ratingB);

    return repeat * MATCHMAKING.partnerRepeatCost +
           faced * MATCHMAKING.opponentRepeatCost +
           imbalance * MATCHMAKING.balanceCost;
  });

  // Softmax over negative cost, then blended with a flat distribution so no
  // split can ever reach zero probability.
  const best = Math.min(...costs);
  const raw = costs.map(c => Math.exp(-(c - best)));
  const rawTotal = raw.reduce((sum, w) => sum + w, 0);

  const flat = MATCHMAKING.explorationRate / splits.length;
  const weights = raw.map(w => (1 - MATCHMAKING.explorationRate) * (w / rawTotal) + flat);
  const total = weights.reduce((sum, w) => sum + w, 0);

  let roll = Math.random() * total;
  let chosen = splits.length - 1;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) { chosen = i; break; }
  }

  // Randomise which side is A so team colours do not track skill.
  const split = splits[chosen];
  return Math.random() < 0.5
    ? { teamA: split.a, teamB: split.b }
    : { teamA: split.b, teamB: split.a };
}

/**
 * Full draw: who plays, then who partners whom.
 * @returns {{teamA: string[], teamB: string[]} | null}
 */
export function generateMatch(pool, stats, pairs, historyLength) {
  const four = pickPlayers(pool, stats, historyLength);
  if (four.length < 4) return null;
  return pickTeams(four, stats, pairs);
}
