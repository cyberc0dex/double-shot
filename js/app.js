/**
 * Double Shot - application controller.
 */

import { APP_ENV, APP_VERSION, IS_DEV, RULES } from '../config.js';
import * as store from './state.js';
import { generateMatch } from './matchmaking.js';
import { computeHighlights } from './highlights.js';
import {
  renderRoster, renderStandings, renderHistory, renderHighlights, refreshTeamSelects
} from './render.js';
import {
  toast, alertDialog, confirmDialog, openModal,
  registerPopover, closeAllPopovers, copyText
} from './ui.js';
import { clock, duration, sessionDate, parseClock } from './format.js';
import { openShareScreen } from './share.js';

const $ = id => document.getElementById(id);

const dom = {
  envBadge: $('envBadge'),
  sessionDate: $('sessionDate'),
  sessionSummary: $('sessionSummary'),

  shareBtn: $('shareBtn'),
  miShare: $('miShare'),
  menuBtn: $('menuBtn'),
  sessionMenu: $('sessionMenu'),

  addPlayerForm: $('addPlayerForm'),
  playerInput: $('playerInput'),
  rosterList: $('rosterList'),
  rosterCount: $('rosterCount'),

  matchPanel: $('matchPanel'),
  matchIdle: $('matchIdle'),
  matchIdleText: $('matchIdleText'),
  matchSetup: $('matchSetup'),
  matchLive: $('matchLive'),
  newMatchBtn: $('newMatchBtn'),

  selects: ['setupA1', 'setupA2', 'setupB1', 'setupB2'].map($),
  shuffleBtn: $('shuffleBtn'),
  startBtn: $('startBtn'),
  cancelSetupBtn: $('cancelSetupBtn'),

  liveA1: $('liveA1'),
  liveA2: $('liveA2'),
  liveB1: $('liveB1'),
  liveB2: $('liveB2'),
  scoreTapA: $('scoreTapA'),
  scoreTapB: $('scoreTapB'),
  minusA: $('minusA'),
  minusB: $('minusB'),
  timerDisplay: $('timerDisplay'),
  serveDot: $('serveDot'),
  matchPointNote: $('matchPointNote'),
  pauseBtn: $('pauseBtn'),
  pauseLabel: $('pauseLabel'),
  undoBtn: $('undoBtn'),
  finishBtn: $('finishBtn'),
  abandonBtn: $('abandonBtn'),

  standingsBody: $('standingsBody'),
  historyBody: $('historyBody'),
  highlights: $('highlights')
};

let setupDraft = null;   // { teamA:[a,b], teamB:[a,b] } before the match starts
let timerHandle = null;
let wakeLock = null;

/* ------------------------------------------------------------ scoring rules */

function isComplete(a, b) {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < RULES.target) return false;
  if (hi >= RULES.cap) return true;
  return hi - lo >= RULES.winBy;
}

function matchPoints(a, b) {
  if (isComplete(a, b)) return { a: false, b: false };
  return { a: isComplete(a + 1, b), b: isComplete(a, b + 1) };
}

/* ------------------------------------------------------------------- render */

function render() {
  const state = store.state;
  const stats = store.deriveStats();
  const standings = store.standings(stats);

  renderRoster(dom.rosterList, state.players, stats, {
    onStatus: (id, status) => store.setPlayerStatus(id, status),
    onRemove: onRemovePlayer
  });

  const available = store.selectablePlayers();
  dom.rosterCount.textContent = `${available.length} of ${state.players.length} available`;

  renderStandings(dom.standingsBody, standings);
  renderHistory(dom.historyBody, state.history, { onEdit: onEditMatch, onDelete: onDeleteMatch });
  renderHighlights(dom.highlights, computeHighlights(state.history, stats));
  renderSessionMeta(state);
  renderMatchPanel(available);
}

function renderSessionMeta(state) {
  dom.sessionDate.textContent = sessionDate(state.startedAt);
  const count = state.history.length;
  const played = state.history.reduce((sum, m) => sum + m.durationSeconds, 0);
  dom.sessionSummary.textContent = count
    ? `${count} ${count === 1 ? 'match' : 'matches'}, ${duration(played)} on court`
    : 'No matches yet';
  dom.shareBtn.disabled = count === 0;
  dom.miShare.disabled = count === 0;
}


function renderMatchPanel(available) {
  const active = store.state.activeMatch;

  if (active) {
    setPhase('live');
    renderLive(active);
    return;
  }

  if (setupDraft) {
    setPhase('setup');
    refreshTeamSelects(dom.selects, available,
      [setupDraft.teamA[0], setupDraft.teamA[1], setupDraft.teamB[0], setupDraft.teamB[1]]);
    return;
  }

  setPhase('idle');
  const total = store.state.players.length;
  if (total === 0) {
    dom.matchIdleText.textContent = 'Add at least four players to the roster to start a match.';
  } else if (available.length < 4) {
    dom.matchIdleText.textContent =
      `Four available players are needed. ${available.length} of ${total} are marked available.`;
  } else {
    dom.matchIdleText.textContent =
      'Teams are drawn from the available players, favouring whoever has played least.';
  }
  dom.newMatchBtn.disabled = available.length < 4;
}

function setPhase(phase) {
  dom.matchPanel.dataset.phase = phase;
  dom.matchIdle.classList.toggle('hidden', phase !== 'idle');
  dom.matchSetup.classList.toggle('hidden', phase !== 'setup');
  dom.matchLive.classList.toggle('hidden', phase !== 'live');
}

function renderLive(active) {
  dom.liveA1.textContent = active.teamA[0];
  dom.liveA2.textContent = active.teamA[1];
  dom.liveB1.textContent = active.teamB[0];
  dom.liveB2.textContent = active.teamB[1];

  dom.scoreTapA.textContent = String(active.scoreA);
  dom.scoreTapB.textContent = String(active.scoreB);
  dom.scoreTapA.setAttribute('aria-label',
    `Add a point to ${active.teamA.join(' and ')}. Currently ${active.scoreA}.`);
  dom.scoreTapB.setAttribute('aria-label',
    `Add a point to ${active.teamB.join(' and ')}. Currently ${active.scoreB}.`);

  const serve = store.servingSide();
  dom.serveDot.dataset.on = serve ? serve.toLowerCase() : '';

  const points = matchPoints(active.scoreA, active.scoreB);
  const done = isComplete(active.scoreA, active.scoreB);
  dom.matchPointNote.textContent =
    done ? 'Match complete' : (points.a || points.b) ? 'Match point' : '';
  dom.matchPointNote.classList.toggle('hidden', !dom.matchPointNote.textContent);

  dom.undoBtn.disabled = active.pointLog.length === 0;
  dom.pauseLabel.textContent = active.running ? 'Pause' : 'Resume';
  dom.timerDisplay.dataset.paused = String(!active.running);

  updateTimer();
}

function updateTimer() {
  const active = store.state.activeMatch;
  if (!active) return;
  dom.timerDisplay.textContent = clock(store.elapsedSeconds(active));
}

/* -------------------------------------------------------------------- timer */

function startTicking() {
  stopTicking();
  timerHandle = setInterval(updateTimer, 1000);
}

function stopTicking() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
}

function syncTicking() {
  const active = store.state.activeMatch;
  if (active && active.running && document.visibilityState === 'visible') startTicking();
  else stopTicking();
  if (active) updateTimer();
}

document.addEventListener('visibilitychange', () => {
  syncTicking();
  if (document.visibilityState === 'visible') requestWakeLock();
});

/* ----------------------------------------------------------------- wake lock */

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  if (!store.state.activeMatch || !store.state.activeMatch.running) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* denied or unsupported, the match still works */ }
}

async function releaseWakeLock() {
  try {
    if (wakeLock) await wakeLock.release();
  } catch { /* already gone */ }
  wakeLock = null;
}

/* ------------------------------------------------------------------- roster */

dom.addPlayerForm.addEventListener('submit', event => {
  event.preventDefault();
  const value = dom.playerInput.value.trim();
  if (!value) return;

  const { added, skipped } = store.addPlayers(value);
  dom.playerInput.value = '';

  if (added.length && skipped.length) {
    toast(`Added ${added.length}. ${skipped.join(', ')} already on the roster.`, { tone: 'warn' });
  } else if (added.length) {
    toast(added.length === 1 ? `${added[0]} added` : `${added.length} players added`);
  } else if (skipped.length) {
    toast(`${skipped.join(', ')} already on the roster`, { tone: 'warn' });
  }
  dom.playerInput.focus();
});

async function onRemovePlayer(player) {
  const stats = store.deriveStats().get(player.name);
  const body = stats && stats.played
    ? `${player.name} has ${stats.played} recorded ${stats.played === 1 ? 'match' : 'matches'}. Those results stay in the history and the standings.`
    : 'They can be added again at any time.';

  const ok = await confirmDialog(`Remove ${player.name} from the roster?`, body, {
    confirmLabel: 'Remove', danger: true
  });
  if (ok) {
    store.removePlayer(player.id);
    toast(`${player.name} removed`);
  }
}

/* -------------------------------------------------------------- match setup */

function drawTeams() {
  const available = store.selectablePlayers().map(p => p.name);
  const stats = store.deriveStats();
  const pairs = store.buildPairCounts();

  const drawn = generateMatch(available, stats, pairs, store.state.history.length);
  if (!drawn) {
    toast('Four available players are needed', { tone: 'warn' });
    return false;
  }

  setupDraft = drawn;
  render(); // renderMatchPanel applies the draw to the four dropdowns
  return true;
}

/** Mirrors the dropdowns back into the draft so a re-render keeps manual picks. */
function syncDraftFromSelects() {
  const picked = dom.selects.map(s => s.value);
  setupDraft = { teamA: [picked[0], picked[1]], teamB: [picked[2], picked[3]] };
}

dom.newMatchBtn.addEventListener('click', () => { drawTeams(); });
dom.shuffleBtn.addEventListener('click', () => {
  if (drawTeams()) toast('Teams redrawn');
});

dom.cancelSetupBtn.addEventListener('click', () => {
  setupDraft = null;
  render();
});

// Re-filter the other three dropdowns whenever one changes, so a name can
// never be selected twice.
dom.selects.forEach(select => {
  select.addEventListener('change', () => {
    refreshTeamSelects(dom.selects, store.selectablePlayers());
    syncDraftFromSelects();
  });
});

dom.startBtn.addEventListener('click', async () => {
  const picked = dom.selects.map(s => s.value);

  if (picked.some(name => !name)) {
    await alertDialog('Pick four players', 'Every slot needs a player before the match can start.');
    return;
  }
  if (new Set(picked).size !== 4) {
    await alertDialog('A player is selected twice',
      'Each of the four slots needs a different player.');
    return;
  }

  store.startMatch([picked[0], picked[1]], [picked[2], picked[3]]);
  setupDraft = null;
  requestWakeLock();
  render();
  syncTicking();
});

/* --------------------------------------------------------------- live match */

// Scoring never ends the match on its own. The "Match complete" note tells
// the court a game is won, and the players decide when to press Finish.
dom.scoreTapA.addEventListener('click', () => store.addPoint('A'));
dom.scoreTapB.addEventListener('click', () => store.addPoint('B'));
dom.minusA.addEventListener('click', () => store.adjustScore('A', -1));
dom.minusB.addEventListener('click', () => store.adjustScore('B', -1));

dom.undoBtn.addEventListener('click', () => {
  if (store.undoPoint()) {
    toast('Last point removed');
  }
});

dom.pauseBtn.addEventListener('click', () => {
  store.togglePause();
  const running = store.state.activeMatch.running;
  if (running) requestWakeLock(); else releaseWakeLock();
  syncTicking();
  toast(running ? 'Timer resumed' : 'Timer paused');
});

dom.finishBtn.addEventListener('click', async () => {
  const active = store.state.activeMatch;
  if (!active) return;

  if (active.scoreA === active.scoreB) {
    await alertDialog('The score is level',
      `Both sides are on ${active.scoreA}. A match needs a winner before it can be recorded.`);
    return;
  }

  if (!isComplete(active.scoreA, active.scoreB)) {
    const ok = await confirmDialog(
      'End the match early?',
      `${active.scoreA} to ${active.scoreB} is short of a finished game at ${RULES.target} points. It will be recorded as it stands.`,
      { confirmLabel: 'Record anyway' }
    );
    if (!ok) return;
  }

  finishMatch();
});

function finishMatch() {
  const active = store.state.activeMatch;
  if (!active) return;

  const seconds = store.elapsedSeconds(active);
  const winner = active.scoreA > active.scoreB ? 'TeamA' : 'TeamB';
  const winners = winner === 'TeamA' ? active.teamA : active.teamB;

  store.addMatch({
    teamA: active.teamA,
    teamB: active.teamB,
    scoreA: active.scoreA,
    scoreB: active.scoreB,
    winner,
    durationSeconds: seconds
  });

  store.clearActiveMatch();
  releaseWakeLock();
  syncTicking();

  toast(`${winners.join(' & ')} win ${Math.max(active.scoreA, active.scoreB)} to ${Math.min(active.scoreA, active.scoreB)}`);
}

dom.abandonBtn.addEventListener('click', async () => {
  const ok = await confirmDialog('Abandon this match?',
    'The score and the timer are discarded. Nothing is added to the history.',
    { confirmLabel: 'Abandon', danger: true });
  if (!ok) return;

  store.clearActiveMatch();
  releaseWakeLock();
  syncTicking();
  toast('Match abandoned');
});

/* --------------------------------------------------------- edit and delete */

function onEditMatch(match) {
  const form = document.createElement('div');
  form.className = 'dialog dialog-form';

  const heading = document.createElement('h2');
  heading.id = 'edit-title';
  heading.textContent = 'Edit match';
  form.appendChild(heading);

  // One input per player and per score: no delimiter parsing, so names
  // containing "&" or "-" survive a round trip.
  const field = (labelText, value, attrs = {}) => {
    const row = document.createElement('div');
    row.className = 'form-row';
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.className = 'field';
    input.value = value;
    Object.entries(attrs).forEach(([k, v]) => input.setAttribute(k, v));
    const id = `edit-${Math.random().toString(36).slice(2, 8)}`;
    input.id = id;
    label.htmlFor = id;
    label.textContent = labelText;
    row.append(label, input);
    return { row, input };
  };

  // Players are picked from the roster, never typed, so a match can only
  // reference real roster names in their roster spelling.
  const nameSelect = labelText => {
    const select = document.createElement('select');
    select.className = 'field';
    select.setAttribute('aria-label', labelText);
    return select;
  };

  const scoreInput = (value, labelText) => {
    const input = document.createElement('input');
    input.className = 'field field-score';
    input.type = 'number';
    input.min = '0';
    input.inputMode = 'numeric';
    input.value = String(value);
    input.setAttribute('aria-label', labelText);
    return input;
  };

  // One box per side: its two players, then its score.
  const sideBox = (team, tag, inputs) => {
    const box = document.createElement('div');
    box.className = 'edit-side';
    box.dataset.team = team;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', tag);
    const label = document.createElement('div');
    label.className = 'edit-side-tag';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = tag;
    box.append(label, ...inputs);
    return box;
  };

  const a1 = nameSelect('Side A, first player');
  const a2 = nameSelect('Side A, second player');
  const b1 = nameSelect('Side B, first player');
  const b2 = nameSelect('Side B, second player');
  const nameSelects = [a1, a2, b1, b2];

  // The whole roster, whatever their availability: this is a finished match.
  // Someone since removed from the roster stays listed so the match can still
  // be saved without replacing them. A name that differs from the roster
  // only in case takes the roster spelling.
  const current = [...match.teamA, ...match.teamB].map(n => {
    const onRoster = store.findPlayer(n);
    return onRoster ? onRoster.name : n;
  });
  const pool = store.state.players.map(p => ({ name: p.name }));
  current.forEach(n => {
    if (!pool.some(p => p.name === n)) pool.push({ name: n });
  });

  refreshTeamSelects(nameSelects, pool, current);
  nameSelects.forEach(select => {
    select.addEventListener('change', () => refreshTeamSelects(nameSelects, pool));
  });

  const scoreA = scoreInput(match.scoreA, 'Side A score');
  const scoreB = scoreInput(match.scoreB, 'Side B score');

  const sides = document.createElement('div');
  sides.className = 'edit-sides';
  sides.append(
    sideBox('a', 'Side A', [a1, a2, scoreA]),
    sideBox('b', 'Side B', [b1, b2, scoreB])
  );

  const durationField = field('Duration (mm:ss)', clock(match.durationSeconds), {
    inputmode: 'numeric', placeholder: '18:24'
  });

  form.append(sides, durationField.row);

  const error = document.createElement('p');
  error.style.color = 'var(--danger)';
  error.style.margin = '0 0 14px';
  error.style.fontSize = '12.5px';
  error.hidden = true;
  form.appendChild(error);

  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = 'Cancel';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn btn-primary';
  save.textContent = 'Save changes';
  actions.append(cancel, save);
  form.appendChild(actions);

  const close = openModal(form, { labelledBy: 'edit-title' });
  cancel.addEventListener('click', close);

  save.addEventListener('click', () => {
    const teamA = [a1.value, a2.value];
    const teamB = [b1.value, b2.value];
    const sa = parseInt(scoreA.value, 10);
    const sb = parseInt(scoreB.value, 10);
    const seconds = parseClock(durationField.input.value);

    const names = [...teamA, ...teamB];
    const fail = message => {
      error.textContent = message;
      error.hidden = false;
    };

    if (names.some(n => !n)) return fail('Every slot needs a player.');
    if (new Set(names.map(n => n.toLowerCase())).size !== 4) {
      return fail('The same player cannot appear twice in one match.');
    }
    if (!Number.isFinite(sa) || !Number.isFinite(sb) || sa < 0 || sb < 0) {
      return fail('Both scores must be whole numbers.');
    }
    if (sa === sb) return fail('A match cannot end level. One side has to win.');
    if (!Number.isFinite(seconds)) return fail('Duration must look like 18:24.');

    store.updateMatch(match.id, {
      teamA, teamB,
      scoreA: sa,
      scoreB: sb,
      winner: sa > sb ? 'TeamA' : 'TeamB',
      durationSeconds: seconds
    });

    close();
    toast('Match updated');
  });
}

async function onDeleteMatch(match) {
  const ok = await confirmDialog(
    'Delete this match?',
    `${match.teamA.join(' & ')} vs ${match.teamB.join(' & ')}, ${match.scoreA} to ${match.scoreB}.`,
    { confirmLabel: 'Delete', danger: true }
  );
  if (!ok) return;

  const removed = store.removeMatch(match.id);
  if (!removed) return;

  toast('Match deleted', {
    tone: 'warn',
    action: {
      label: 'Undo',
      onClick: () => {
        store.restoreMatch(removed.match, removed.index);
        toast('Match restored');
      }
    }
  });
}

/* ------------------------------------------------------------- session menu */

dom.menuBtn.addEventListener('click', event => {
  event.stopPropagation();
  const willOpen = dom.sessionMenu.classList.contains('hidden');
  closeAllPopovers(dom.sessionMenu);
  dom.sessionMenu.classList.toggle('hidden', !willOpen);
  dom.menuBtn.setAttribute('aria-expanded', String(willOpen));
});
registerPopover(dom.sessionMenu, dom.menuBtn);

/**
 * Extract Data keeps the original pipe delimited shape, one line per match:
 *   mm:ss|Aisyah & Farid|Wei Ling & Danish|21 - 18
 */
function extractData() {
  return store.state.history
    .map(m => [
      clock(m.durationSeconds),
      m.teamA.join(' & '),
      m.teamB.join(' & '),
      `${m.scoreA} - ${m.scoreB}`
    ].join('|'))
    .join('\n');
}

$('miExtract').addEventListener('click', async () => {
  if (!store.state.history.length) {
    toast('Nothing to extract yet', { tone: 'warn' });
    return;
  }
  const ok = await copyText(extractData());
  toast(ok ? 'Session data copied to clipboard' : 'Could not copy the session data',
    { tone: ok ? 'info' : 'error' });
});

$('miReset').addEventListener('click', async () => {
  const ok = await confirmDialog('Reset this session?',
    'Every player, match and highlight is cleared. Extract the data first if you want to keep it.',
    { confirmLabel: 'Reset everything', danger: true });
  if (!ok) return;

  store.resetSession();
  setupDraft = null;
  releaseWakeLock();
  syncTicking();
  toast('Session reset');
});

function openReport() {
  const stats = store.deriveStats();
  openShareScreen({
    standings: store.standings(stats),
    history: store.state.history,
    highlights: computeHighlights(store.state.history, stats),
    startedAt: store.state.startedAt
  });
}

// Tablet and desktop share from the top bar; phones from the session menu.
dom.shareBtn.addEventListener('click', openReport);
dom.miShare.addEventListener('click', () => {
  closeAllPopovers(null);
  dom.menuBtn.setAttribute('aria-expanded', 'false');
  openReport();
});

/* ------------------------------------------------- service worker / dev mode */

async function setupEnvironment() {
  dom.envBadge.classList.toggle('hidden', !IS_DEV);
  if (IS_DEV) dom.envBadge.title = `APP_ENV is "${APP_ENV}". Caching is off.`;

  if (!('serviceWorker' in navigator)) return;

  if (IS_DEV) {
    // Tear down anything a previous production build left installed, so a
    // plain refresh always serves the files straight off disk.
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister()));
      if (window.caches) {
        const names = await caches.keys();
        await Promise.all(names.map(name => caches.delete(name)));
      }
      if (registrations.length) {
        console.info('[double-shot] development mode: service worker removed and caches cleared');
      }
    } catch (error) {
      console.warn('[double-shot] could not clear the service worker', error);
    }
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register(
      `service-worker.js?v=${APP_VERSION}`
    );

    registration.addEventListener('updatefound', () => {
      const incoming = registration.installing;
      if (!incoming) return;
      incoming.addEventListener('statechange', () => {
        if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
          toast('A new version is ready', {
            action: { label: 'Reload', onClick: () => location.reload() },
            duration: 12000
          });
        }
      });
    });
  } catch (error) {
    console.warn('[double-shot] service worker registration failed', error);
  }
}

/* --------------------------------------------------------------------- boot */

store.load();
store.subscribe(() => {
  render();
  syncTicking();
});

render();
syncTicking();
setupEnvironment();

if (store.state.activeMatch) {
  const active = store.state.activeMatch;
  requestWakeLock();
  toast(`Match in progress: ${active.teamA.join(' & ')} vs ${active.teamB.join(' & ')}`);
}
