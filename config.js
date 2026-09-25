/**
 * Double Shot environment configuration.
 *
 * ── THE ONLY SWITCH YOU NEED ──────────────────────────────────────────────
 * Change APP_ENV to turn the whole PWA layer on or off.
 *
 *   'development'  Service worker is NOT registered. Any worker that is
 *                  already installed gets unregistered and every cache it
 *                  created is deleted, so a plain refresh always serves the
 *                  files straight off disk. A "DEV" badge shows in the header.
 *
 *   'production'   Service worker is registered, offline caching is on, and
 *                  the app prompts when a new version has been downloaded.
 * ──────────────────────────────────────────────────────────────────────────
 */
export const APP_ENV = 'production';

/**
 * Bumped on every release. It is passed to the service worker as a query
 * param so the worker derives its cache name from this one value. There is
 * no second version constant to keep in sync.
 */
export const APP_VERSION = '3.0.0';

export const IS_DEV = APP_ENV === 'development';
export const IS_PROD = APP_ENV === 'production';

/** Badminton scoring rules used for live match-completion detection. */
export const RULES = {
  target: 21,   // first to this many points
  winBy: 2,     // must lead by this margin
  cap: 30       // hard ceiling, at 30 the next point wins outright
};

/** Matchmaking tuning. Higher = stronger influence. */
export const MATCHMAKING = {
  restPower: 2.0,        // how hard we favour players with fewer games
  lastMatchPenalty: 0.35, // weight multiplier for anyone in the previous match
  prevMatchPenalty: 0.7,  // ...and the match before that
  minWeight: 0.05,       // floor, so nobody is ever truly impossible to pick
  partnerRepeatCost: 1.6, // cost weight for a pairing that has happened before
  opponentRepeatCost: 0.3,// cost weight for two sides that have already met
  balanceCost: 2.5,       // cost per unit of rating imbalance between teams
  /**
   * Floor on how unlikely any single pairing can get. The team split is drawn
   * from a blend of the cost-based distribution and a flat one, so a stale
   * pairing stays rare without ever becoming impossible. At 0.06 across three
   * possible splits, the worst option still comes up about 2% of the time.
   */
  explorationRate: 0.06
};
