/**
 * DOM rendering for the data views.
 *
 * Everything here builds nodes and sets textContent. No user-supplied value
 * ever reaches innerHTML, so a player called `Jean-Luc` or `R&B` or
 * `<script>` renders as written and breaks nothing.
 */

import { icon, registerPopover, closeAllPopovers } from './ui.js';
import { duration } from './format.js';
import { STATUS, STATUS_ORDER, effectiveStatus } from './state.js';

const STATUS_LABEL = {
  [STATUS.AVAILABLE]: 'Available',
  [STATUS.RESTING]: 'Resting',
  [STATUS.UNAVAILABLE]: 'Unavailable',
  playing: 'On court'
};

const STATUS_ICON = {
  [STATUS.AVAILABLE]: 'check-circle',
  [STATUS.RESTING]: 'coffee',
  [STATUS.UNAVAILABLE]: 'prohibit'
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/* ------------------------------------------------------------------ roster */

export function renderRoster(list, players, stats, handlers) {
  clear(list);

  if (!players.length) {
    const empty = el('li', 'roster-empty');
    empty.append(
      'No players yet.',
      el('br'),
      'Add four or more names to start a match.'
    );
    list.appendChild(empty);
    return;
  }

  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));

  sorted.forEach(player => {
    const status = effectiveStatus(player);
    const s = stats.get(player.name);

    const row = el('li', 'rp');
    row.dataset.status = status;

    row.appendChild(el('span', 'rp-rail'));

    const id = el('div', 'rp-id');
    id.appendChild(el('div', 'rp-name', player.name));

    const sub = el('div', 'rp-sub');
    if (s && s.played) {
      sub.append(
        el('span', 'w', `${s.win}W`),
        ' ',
        el('span', 'l', `${s.loss}L`),
        ` from ${s.played}`
      );
    } else {
      sub.textContent = status === 'playing' ? 'On court' : 'No games yet';
    }
    id.appendChild(sub);
    row.appendChild(id);

    const actions = el('div', 'rp-actions');

    if (status === 'playing') {
      // Status cannot change while they are on court.
      const chip = el('span', 'chip', 'On court');
      actions.appendChild(chip);
    } else {
      const seg = el('div', 'seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', `Availability for ${player.name}`);

      STATUS_ORDER.forEach(value => {
        const button = el('button');
        button.type = 'button';
        button.dataset.status = value;
        button.title = STATUS_LABEL[value];
        button.setAttribute('aria-label', `${STATUS_LABEL[value]}: ${player.name}`);
        button.setAttribute('aria-pressed', String(player.status === value));
        button.appendChild(icon(STATUS_ICON[value]));
        button.addEventListener('click', () => handlers.onStatus(player.id, value));
        seg.appendChild(button);
      });
      actions.appendChild(seg);

      const remove = el('button', 'rp-remove');
      remove.type = 'button';
      remove.title = `Remove ${player.name}`;
      remove.setAttribute('aria-label', `Remove ${player.name}`);
      remove.appendChild(icon('x'));
      remove.addEventListener('click', () => handlers.onRemove(player));
      actions.appendChild(remove);
    }

    row.appendChild(actions);
    list.appendChild(row);
  });
}

/* -------------------------------------------------------------- standings */

export function renderStandings(tbody, rows) {
  clear(tbody);

  if (!rows.length || rows.every(r => r.played === 0)) {
    const tr = el('tr');
    const td = el('td', 'empty');
    td.colSpan = 5;
    td.append('Standings appear once the first match is recorded.');
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((row, index) => {
    const tr = el('tr');
    tr.dataset.rank = String(index + 1);

    const player = el('td');
    const cell = el('div', 'cell-player');
    cell.appendChild(el('span', 'rank num', String(index + 1)));
    cell.appendChild(el('span', 'nm', row.name));
    player.appendChild(cell);
    tr.appendChild(player);

    tr.appendChild(el('td', 'num v-win', String(row.win)));
    tr.appendChild(el('td', 'num v-loss', String(row.loss)));
    tr.appendChild(el('td', 'num', String(row.played)));

    const rate = el('td');
    const wrap = el('div', 'wr-cell');
    const bar = el('div', 'wr-bar');
    const fill = el('i');
    fill.style.width = `${Math.round(row.winRate * 100)}%`;
    bar.appendChild(fill);
    wrap.appendChild(el('span', 'num', `${Math.round(row.winRate * 100)}%`));
    wrap.appendChild(bar);
    rate.appendChild(wrap);
    tr.appendChild(rate);

    tbody.appendChild(tr);
  });
}

/* ---------------------------------------------------------------- history */

export function renderHistory(tbody, history, handlers) {
  clear(tbody);

  if (!history.length) {
    const tr = el('tr');
    const td = el('td', 'empty');
    td.colSpan = 6;
    td.append('No matches yet.', el('br'), 'Finished matches are logged here.');
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  // Newest first: the last result is the one people look for.
  [...history].reverse().forEach((match, offset) => {
    const number = history.length - offset;
    const aWon = match.winner === 'TeamA';

    const tr = el('tr');
    tr.dataset.id = match.id;

    const index = el('td', 'num');
    index.textContent = String(number);
    tr.appendChild(index);

    tr.appendChild(el('td', 'num time-cell', duration(match.durationSeconds)));

    const teamA = el('td');
    teamA.className = `team-cell a${aWon ? '' : ' lost'}`;
    teamA.textContent = match.teamA.join(' & ');
    tr.appendChild(teamA);

    const teamB = el('td');
    teamB.className = `team-cell b${aWon ? ' lost' : ''}`;
    teamB.textContent = match.teamB.join(' & ');
    tr.appendChild(teamB);

    const score = el('td', 'score-cell');
    score.append(
      el('span', aWon ? 'win' : 'lose', String(match.scoreA)),
      el('span', 'sep', '-'),
      el('span', aWon ? 'lose' : 'win', String(match.scoreB))
    );
    tr.appendChild(score);

    tr.appendChild(rowMenu(match, handlers));
    tbody.appendChild(tr);
  });
}

function rowMenu(match, handlers) {
  const td = el('td');
  const wrap = el('div', 'row-menu');

  const trigger = el('button');
  trigger.type = 'button';
  trigger.setAttribute('aria-label', `Actions for match against ${match.teamB.join(' and ')}`);
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.appendChild(icon('dots-three-vertical'));

  const menu = el('div', 'menu hidden');

  const edit = el('button', null, 'Edit');
  edit.type = 'button';
  edit.prepend(icon('pencil-simple'));
  edit.addEventListener('click', () => {
    closeAllPopovers(null);
    handlers.onEdit(match);
  });

  const remove = el('button', 'danger', 'Delete');
  remove.type = 'button';
  remove.prepend(icon('trash'));
  remove.addEventListener('click', () => {
    closeAllPopovers(null);
    handlers.onDelete(match);
  });

  menu.append(edit, remove);

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    const willOpen = menu.classList.contains('hidden');
    closeAllPopovers(menu);
    menu.classList.toggle('hidden', !willOpen);
    trigger.setAttribute('aria-expanded', String(willOpen));
  });

  registerPopover(menu, trigger);
  wrap.append(trigger, menu);
  td.appendChild(wrap);
  return td;
}

/* ------------------------------------------------------------- highlights */

export function renderHighlights(host, highlights) {
  clear(host);

  highlights.forEach(item => {
    const card = el('article', 'panel hl');
    card.dataset.key = item.key;

    const label = el('div', 'hl-label');
    label.appendChild(icon(item.icon));
    label.appendChild(el('span', null, item.label));
    card.appendChild(label);

    if (item.unlocked) {
      card.appendChild(el('div', 'hl-value', item.value));
      if (item.sub) {
        const sub = el('div', 'hl-sub');
        sub.append(item.sub.text);
        if (item.sub.em) sub.append(' ', el('span', 'em', item.sub.em));
        card.appendChild(sub);
        if (item.sub.meta) card.appendChild(el('div', 'hl-sub hl-meta', item.sub.meta));
      }
    } else {
      card.appendChild(el('div', 'hl-locked', item.value));
    }

    host.appendChild(card);
  });
}

/* ------------------------------------------------------ team select fields */

/**
 * Repopulates the four team dropdowns so each one offers only the players who
 * are available and not already chosen in one of the other three slots. The
 * currently selected name always stays in its own list.
 *
 * @param {HTMLSelectElement[]} selects
 * @param {Array<{name:string}>} pool  available players
 * @param {string[]} [desired]  four names to select, used after a fresh draw
 */
export function refreshTeamSelects(selects, pool, desired) {
  const chosen = desired && desired.length === 4
    ? desired.slice()
    : selects.map(s => s.value);

  selects.forEach((select, index) => {
    const mine = chosen[index];
    const takenElsewhere = new Set(chosen.filter((_, i) => i !== index).filter(Boolean));

    const options = pool
      .map(p => p.name)
      .filter(name => !takenElsewhere.has(name));

    // Keep the current pick selectable even if their status just changed.
    if (mine && !options.includes(mine)) options.unshift(mine);
    options.sort((a, b) => a.localeCompare(b));

    clear(select);

    if (!options.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No one available';
      select.appendChild(option);
      select.value = '';
      return;
    }

    options.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });

    select.value = options.includes(mine) ? mine : options[0];
  });
}

export { el, clear };
