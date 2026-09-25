/**
 * Session report: renders the standings, match history and highlights into a
 * single shareable PNG on a canvas, then shows it on a display screen with a
 * download action.
 *
 * Drawn with the Canvas API rather than a screenshot library so it works
 * offline, needs no build step, and produces a clean composition rather than
 * a crop of the page.
 */

import { openModal, downloadBlob, toast, icon } from './ui.js';
import { duration, sessionDate } from './format.js';

/**
 * Report width in CSS pixels. This is the one knob for how wide the image
 * is; every column below is positioned from W and PAD, so nothing else needs
 * to change with it. The PNG is exported at twice this (see `scale`).
 */
const W = 820;
const PAD = 44;
const HISTORY_LIMIT = 12;

const C = {
  bg: '#04060b',
  panel: '#0c1220',
  line: 'rgba(125,170,255,0.16)',
  lineSoft: 'rgba(125,170,255,0.09)',
  text: '#e8eefb',
  muted: '#93a1bf',
  dim: '#5d6b89',
  accent: '#3df5b0',
  teamA: '#2bd9ff',
  teamB: '#ff5cc8',
  gold: '#ffcf5c',
  ember: '#ff8a4c',
  sky: '#8ec5ff',
  lilac: '#c4a6ff'
};

/** Card tone per highlight, matching the cards in the app. */
const TONE = { mvp: C.gold, duo: C.ember, quickest: C.sky, longest: C.lilac };

/**
 * Draws a glyph from the inlined Phosphor sprite, so the report uses the
 * same icon as the app. Skipped quietly if the sprite is not in the page.
 */
function drawIcon(ctx, name, x, y, size, color) {
  const path = document.querySelector && document.querySelector(`#i-${name} path`);
  if (!path || typeof Path2D === 'undefined') return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 256, size / 256);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(path.getAttribute('d')));
  ctx.restore();
}

const UI = (weight, size) => `${weight} ${size}px Biome, system-ui, sans-serif`;
const NUM = (weight, size) => `${weight} ${size}px ui-monospace, "SF Mono", Menlo, monospace`;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws text, clipping with an ellipsis if it exceeds maxWidth. */
function text(ctx, value, x, y, { font, color, align = 'left', maxWidth } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  let out = String(value);
  if (maxWidth && ctx.measureText(out).width > maxWidth) {
    while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) {
      out = out.slice(0, -1);
    }
    out += '...';
  }
  ctx.fillText(out, x, y);
}

function loadImage(src) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function readyFonts() {
  if (!document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('400 40px Biome'),
      document.fonts.load('700 40px Biome')
    ]);
    await document.fonts.ready;
  } catch { /* the system stack will stand in */ }
}

function sectionTitle(ctx, label, y) {
  text(ctx, label.toUpperCase(), PAD, y, {
    font: UI(400, 18), color: C.muted
  });
  ctx.fillStyle = C.line;
  ctx.fillRect(PAD, y + 19, W - PAD * 2, 1);
  return y + 42;
}

/**
 * Renders the report.
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderReport({ standings, history, highlights, startedAt }) {
  await readyFonts();
  const logo = await loadImage('img/logo.png');

  const players = standings.filter(s => s.played > 0);
  const shownHistory = history.slice(-HISTORY_LIMIT).reverse();
  const olderCount = history.length - shownHistory.length;
  const unlocked = highlights.filter(h => h.unlocked);

  /* -------- measure ------------------------------------------------- */
  const ROW_S = 46;   // standings row
  const ROW_H = 46;   // history row
  const CARD_H = 130; // highlight card
  const CARD_GAP = 14;

  const headerH = 152;
  const standingsH = players.length ? 42 + 30 + players.length * ROW_S + 8 : 42 + 56;
  const historyH = shownHistory.length
    ? 42 + 30 + shownHistory.length * ROW_H + (olderCount ? 32 : 0) + 8
    : 42 + 56;
  const highlightRows = Math.ceil(unlocked.length / 2);
  const highlightsH = unlocked.length
    ? 42 + highlightRows * CARD_H + (highlightRows - 1) * CARD_GAP + 8
    : 0;
  const footerH = 66;
  const GAP = 28;

  let height = headerH + GAP + standingsH + GAP + historyH;
  if (highlightsH) height += GAP + highlightsH;
  height += footerH;

  /* -------- set up -------------------------------------------------- */
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Background: flat base plus the same aurora wash the app uses.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, height);

  const wash = (x, y, r, color, alpha) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, height);
    ctx.globalAlpha = 1;
  };
  wash(160, 40, 620, C.teamA, 0.13);
  wash(W - 120, 0, 560, C.teamB, 0.1);
  wash(W / 2, height, 700, C.accent, 0.07);

  let y = PAD;

  /* -------- header -------------------------------------------------- */
  if (logo) {
    const h = 30;
    const w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, PAD, y, w, h);
  } else {
    text(ctx, 'DOUBLE SHOT', PAD, y + 15, { font: UI(700, 24), color: C.text });
  }

  text(ctx, 'Session report', W - PAD, y + 15, {
    font: UI(400, 16), color: C.dim, align: 'right'
  });

  y += 52;
  text(ctx, sessionDate(startedAt), PAD, y, { font: UI(400, 31), color: C.text });

  y += 33;
  const facts = [
    `${history.length} ${history.length === 1 ? 'match' : 'matches'}`,
    `${players.length} players`,
    `${duration(history.reduce((sum, m) => sum + m.durationSeconds, 0))} on court`
  ];
  let fx = PAD;
  facts.forEach((fact, index) => {
    if (index) {
      ctx.fillStyle = C.dim;
      ctx.beginPath();
      ctx.arc(fx + 9, y, 2, 0, Math.PI * 2);
      ctx.fill();
      fx += 22;
    }
    text(ctx, fact, fx, y, { font: UI(400, 17), color: C.muted });
    ctx.font = UI(400, 17);
    fx += ctx.measureText(fact).width;
  });

  y = headerH + GAP;

  /* -------- standings ----------------------------------------------- */
  y = sectionTitle(ctx, 'Standings', y);

  if (players.length) {
    const BAR_W = 64;
    const rate = W - PAD - BAR_W - 14;   // right edge of the percentage
    const cols = {
      rank: PAD, name: PAD + 40,
      // WIN, LOSS and PLAYED are column centres; the rate is a right edge.
      win: rate - 250, loss: rate - 174, played: rate - 100, rate
    };
    const nameWidth = cols.win - cols.name - 40;

    text(ctx, 'PLAYER', cols.name, y, { font: UI(400, 13), color: C.dim });
    ['WIN', 'LOSS', 'PLAYED'].forEach((label, i) => {
      text(ctx, label, [cols.win, cols.loss, cols.played][i], y, {
        font: UI(400, 13), color: C.dim, align: 'center'
      });
    });
    text(ctx, 'WIN RATE', W - PAD, y, { font: UI(400, 13), color: C.dim, align: 'right' });

    y += 26;

    players.forEach((row, index) => {
      const rowY = y + 23;

      if (index % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        roundRect(ctx, PAD - 12, y, W - (PAD - 12) * 2, ROW_S, 9);
        ctx.fill();
      }

      const isTop = index === 0;
      ctx.fillStyle = isTop ? 'rgba(255,207,92,0.16)' : 'rgba(255,255,255,0.05)';
      roundRect(ctx, cols.rank, rowY - 12, 24, 24, 7);
      ctx.fill();
      text(ctx, String(index + 1), cols.rank + 12, rowY, {
        font: NUM(400, 13), color: isTop ? C.gold : C.dim, align: 'center'
      });

      text(ctx, row.name, cols.name, rowY, {
        font: UI(400, 21), color: isTop ? C.gold : C.text, maxWidth: nameWidth
      });
      text(ctx, String(row.win), cols.win, rowY, { font: NUM(700, 20), color: C.accent, align: 'center' });
      text(ctx, String(row.loss), cols.loss, rowY, { font: NUM(400, 20), color: C.teamB, align: 'center' });
      text(ctx, String(row.played), cols.played, rowY, { font: NUM(400, 20), color: C.muted, align: 'center' });
      text(ctx, `${Math.round(row.winRate * 100)}%`, cols.rate, rowY, {
        font: NUM(400, 20), color: C.text, align: 'right'
      });

      // Win rate bar: the same track and gradient as the app's standings.
      const barX = W - PAD - BAR_W;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, barX, rowY - 3, BAR_W, 6, 3);
      ctx.fill();
      const fillW = Math.round(BAR_W * row.winRate);
      if (fillW > 0) {
        const grad = ctx.createLinearGradient(barX, 0, barX + BAR_W, 0);
        grad.addColorStop(0, C.teamA);
        grad.addColorStop(1, C.accent);
        ctx.fillStyle = grad;
        roundRect(ctx, barX, rowY - 3, Math.max(fillW, 6), 6, 3);
        ctx.fill();
      }

      y += ROW_S;
    });
    y += 8;
  } else {
    text(ctx, 'No completed matches in this session.', PAD, y + 22, {
      font: UI(400, 17), color: C.dim
    });
    y += 56;
  }

  y += GAP;

  /* -------- history -------------------------------------------------- */
  y = sectionTitle(ctx, 'Match history', y);

  if (shownHistory.length) {
    // # | duration | Team A | score | Team B
    const timeX = PAD + 34;
    const teamAX = timeX + 84;
    const midX = (teamAX + W - PAD) / 2;
    const nameWidth = midX - teamAX - 50;

    drawIcon(ctx, 'hourglass', timeX, y - 8, 16, C.dim);
    text(ctx, 'TEAM A', teamAX, y, { font: UI(400, 13), color: C.dim });
    text(ctx, 'SCORE', midX, y, { font: UI(400, 13), color: C.dim, align: 'center' });
    text(ctx, 'TEAM B', W - PAD, y, { font: UI(400, 13), color: C.dim, align: 'right' });
    y += 26;

    shownHistory.forEach((match, offset) => {
      const number = history.length - offset;
      const rowY = y + 21;
      const aWon = match.winner === 'TeamA';

      ctx.fillStyle = C.lineSoft;
      ctx.fillRect(PAD, y + ROW_H - 1, W - PAD * 2, 1);

      text(ctx, String(number), PAD, rowY, { font: NUM(400, 14), color: C.dim });

      text(ctx, duration(match.durationSeconds), timeX, rowY, { font: NUM(400, 14), color: C.muted });

      text(ctx, match.teamA.join(' & '), teamAX, rowY, {
        font: UI(aWon ? 700 : 400, 18),
        color: aWon ? C.teamA : C.dim,
        maxWidth: nameWidth
      });

      // Anchor on the dash so it sits on midX whatever the digit counts.
      const scoreFont = NUM(700, 20);
      text(ctx, '-', midX, rowY, { font: scoreFont, color: C.text, align: 'center' });
      text(ctx, String(match.scoreA), midX - 12, rowY, { font: scoreFont, color: C.text, align: 'right' });
      text(ctx, String(match.scoreB), midX + 12, rowY, { font: scoreFont, color: C.text, align: 'left' });

      text(ctx, match.teamB.join(' & '), W - PAD, rowY, {
        font: UI(aWon ? 400 : 700, 18),
        color: aWon ? C.dim : C.teamB,
        align: 'right',
        maxWidth: nameWidth
      });

      y += ROW_H;
    });

    if (olderCount) {
      text(ctx, `${olderCount} earlier ${olderCount === 1 ? 'match' : 'matches'} not shown`,
        midX, y + 15, { font: UI(400, 14), color: C.dim, align: 'center' });
      y += 32;
    }
    y += 8;
  } else {
    text(ctx, 'No matches recorded yet.', PAD, y + 22, { font: UI(400, 17), color: C.dim });
    y += 56;
  }

  /* -------- highlights ------------------------------------------------ */
  if (unlocked.length) {
    y += GAP;
    y = sectionTitle(ctx, 'Highlights', y);

    const cardW = (W - PAD * 2 - CARD_GAP) / 2;

    for (let i = 0; i < unlocked.length; i++) {
      const item = unlocked[i];
      const x = PAD + (i % 2) * (cardW + CARD_GAP);
      const cardY = y + Math.floor(i / 2) * (CARD_H + CARD_GAP);
      const tone = TONE[item.key] || C.text;
      const inner = cardW - 36;

      ctx.fillStyle = C.panel;
      roundRect(ctx, x, cardY, cardW, CARD_H, 15);
      ctx.fill();
      // Edge tinted with the card's tone, as the app's glow is.
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = tone;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      text(ctx, item.label.toUpperCase(), x + 18, cardY + 26, {
        font: UI(400, 13), color: tone, maxWidth: inner
      });
      text(ctx, item.value, x + 18, cardY + 60, {
        font: UI(400, 26), color: tone, maxWidth: inner
      });

      if (item.sub) {
        text(ctx, item.sub.text, x + 18, cardY + 90, {
          font: UI(400, 14), color: C.muted, maxWidth: inner
        });
        if (item.sub.em) {
          ctx.font = UI(400, 14);
          const lead = ctx.measureText(`${item.sub.text} `).width;
          text(ctx, item.sub.em, x + 18 + lead, cardY + 90, {
            font: NUM(400, 14), color: tone,
            maxWidth: Math.max(0, inner - lead)
          });
        }
        if (item.sub.meta) {
          text(ctx, item.sub.meta, x + 18, cardY + 111, {
            font: NUM(400, 13), color: C.dim, maxWidth: inner
          });
        }
      }
    }

    y += highlightRows * CARD_H + (highlightRows - 1) * CARD_GAP + 8;
  }

  /* -------- footer ---------------------------------------------------- */
  ctx.fillStyle = C.line;
  ctx.fillRect(PAD, height - footerH + 16, W - PAD * 2, 1);
  text(ctx, 'Tracked with Double Shot', PAD, height - 26, {
    font: UI(400, 14), color: C.dim
  });
  text(ctx, sessionDate(startedAt), W - PAD, height - 26, {
    font: UI(400, 14), color: C.dim, align: 'right'
  });

  return canvas;
}

function filenameFor(startedAt) {
  const d = new Date(startedAt);
  const pad = n => String(n).padStart(2, '0');
  return `double-shot-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.png`;
}

function toBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Opens the display screen: the rendered report with a download action, plus
 * a native share sheet where the platform supports sharing files.
 */
export async function openShareScreen(data) {
  const shell = document.createElement('div');
  shell.className = 'dialog share-dialog';

  const head = document.createElement('div');
  head.className = 'share-head';
  const title = document.createElement('h2');
  title.id = 'share-title';
  title.textContent = 'Session report';
  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn btn-icon btn-sm';
  closeButton.setAttribute('aria-label', 'Close session report');
  closeButton.appendChild(icon('x'));
  head.append(title, spacer, closeButton);

  const body = document.createElement('div');
  body.className = 'share-canvas-wrap';
  const busy = document.createElement('div');
  busy.className = 'share-busy';
  busy.textContent = 'Rendering report...';
  body.appendChild(busy);

  const foot = document.createElement('div');
  foot.className = 'share-foot';

  shell.append(head, body, foot);
  const close = openModal(shell, { labelledBy: 'share-title' });
  closeButton.addEventListener('click', close);

  let canvas;
  try {
    canvas = await renderReport(data);
  } catch (error) {
    console.error('[double-shot] report render failed', error);
    busy.textContent = 'The report could not be rendered.';
    return;
  }

  const blob = await toBlob(canvas);
  busy.remove();

  const image = document.createElement('img');
  image.id = 'shareImage';
  image.alt = 'Session report showing standings, match history and highlights';
  image.src = URL.createObjectURL(blob);
  body.appendChild(image);

  const filename = filenameFor(data.startedAt);

  const hint = document.createElement('div');
  hint.className = 'spacer';

  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'btn btn-primary';
  download.appendChild(icon('download-simple'));
  const downloadLabel = document.createElement('span');
  downloadLabel.textContent = 'Save image';
  download.appendChild(downloadLabel);
  download.addEventListener('click', () => {
    downloadBlob(blob, filename);
    toast('Report saved to your device');
  });

  foot.append(hint, download);

  // Native share sheet, when the platform can share a file.
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'btn';
    share.appendChild(icon('share-network'));
    const shareLabel = document.createElement('span');
    shareLabel.textContent = 'Share';
    share.appendChild(shareLabel);
    share.addEventListener('click', async () => {
      try {
        await navigator.share({ files: [file], title: 'Double Shot session report' });
      } catch { /* the user dismissed the sheet */ }
    });
    foot.insertBefore(share, download);
  }

  image.addEventListener('load', () => URL.revokeObjectURL(image.src), { once: true });
}
