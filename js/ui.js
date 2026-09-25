/**
 * Shared UI primitives: icons, toasts, and accessible modal dialogs.
 * Modals trap focus, close on Escape and on backdrop click, and restore
 * focus to whatever opened them.
 */

/**
 * Builds an <svg><use> node pointing at the Phosphor sprite.
 *
 * The sprite paths carry no fill attribute, so they would paint black. The
 * `ico` class sets `fill: currentColor` and an explicit size, which is why
 * every icon in the app, markup or script, must carry it.
 */
export function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className ? `ico ${className}` : 'ico');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

/** Convenience: a button with an icon and optional label. */
export function iconButton(name, label, { className = 'btn btn-icon', title } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.appendChild(icon(name));
  if (label) {
    const span = document.createElement('span');
    span.textContent = label;
    button.appendChild(span);
  } else {
    button.setAttribute('aria-label', title || name);
  }
  if (title) button.title = title;
  return button;
}

/* -------------------------------------------------------------------- toasts */

let toastHost = null;

function host() {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

/**
 * @param {string} message
 * @param {{tone?: 'info'|'warn'|'error', action?: {label: string, onClick: Function}, duration?: number}} options
 */
export function toast(message, options = {}) {
  const { tone = 'info', action, duration = action ? 7000 : 3400 } = options;

  const node = document.createElement('div');
  node.className = 'toast';
  node.dataset.tone = tone;

  const dot = document.createElement('i');
  const text = document.createElement('span');
  text.textContent = message;
  node.append(dot, text);

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    node.classList.add('out');
    node.addEventListener('animationend', () => node.remove(), { once: true });
  };

  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      dismiss();
      action.onClick();
    });
    node.appendChild(button);
  }

  host().appendChild(node);
  timer = setTimeout(dismiss, duration);
  return dismiss;
}

/* -------------------------------------------------------------------- modals */

const openStack = [];

function focusables(root) {
  return [...root.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )].filter(el => !el.disabled && el.offsetParent !== null);
}

/**
 * Mounts `content` inside a backdrop and returns a close function.
 * @param {HTMLElement} content
 * @param {{onClose?: Function, dismissible?: boolean, labelledBy?: string}} options
 */
export function openModal(content, options = {}) {
  const { onClose, dismissible = true, labelledBy } = options;
  const restoreTo = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  if (labelledBy) overlay.setAttribute('aria-labelledby', labelledBy);
  overlay.appendChild(content);

  const close = () => {
    const index = openStack.indexOf(close);
    if (index === -1) return;
    openStack.splice(index, 1);
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
    if (!openStack.length) document.body.style.removeProperty('overflow');
    if (restoreTo && restoreTo.focus) restoreTo.focus();
    if (onClose) onClose();
  };

  function onKeyDown(event) {
    if (openStack[openStack.length - 1] !== close) return;

    if (event.key === 'Escape' && dismissible) {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === 'Tab') {
      const items = focusables(overlay);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (document.activeElement === overlay) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  if (dismissible) {
    overlay.addEventListener('mousedown', event => {
      if (event.target === overlay) close();
    });
  }

  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  openStack.push(close);
  document.addEventListener('keydown', onKeyDown, true);

  // Focus the dialog itself, not its first control: iOS Safari opens the
  // native picker when a <select> is focused programmatically.
  overlay.tabIndex = -1;
  overlay.focus({ preventScroll: true });

  return close;
}

/** Simple message dialog. Resolves when dismissed. */
export function alertDialog(title, body) {
  return new Promise(resolve => {
    const dialog = document.createElement('div');
    dialog.className = 'dialog';

    const heading = document.createElement('h2');
    heading.id = 'dlg-title';
    heading.textContent = title;
    dialog.appendChild(heading);

    if (body) {
      const p = document.createElement('p');
      p.textContent = body;
      dialog.appendChild(p);
    }

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn btn-primary';
    ok.textContent = 'Got it';
    actions.appendChild(ok);
    dialog.appendChild(actions);

    const close = openModal(dialog, { labelledBy: 'dlg-title', onClose: resolve });
    ok.addEventListener('click', close);
  });
}

/** Confirmation dialog. Resolves true or false. */
export function confirmDialog(title, body, options = {}) {
  const { confirmLabel = 'Confirm', danger = false } = options;

  return new Promise(resolve => {
    let answer = false;

    const dialog = document.createElement('div');
    dialog.className = 'dialog';

    const heading = document.createElement('h2');
    heading.id = 'dlg-title';
    heading.textContent = title;
    dialog.appendChild(heading);

    if (body) {
      const p = document.createElement('p');
      p.textContent = body;
      dialog.appendChild(p);
    }

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = 'Cancel';

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = danger ? 'btn btn-solid-danger' : 'btn btn-primary';
    confirm.textContent = confirmLabel;

    actions.append(cancel, confirm);
    dialog.appendChild(actions);

    const close = openModal(dialog, {
      labelledBy: 'dlg-title',
      onClose: () => resolve(answer)
    });

    cancel.addEventListener('click', close);
    confirm.addEventListener('click', () => { answer = true; close(); });
  });
}

/* ------------------------------------------------------------------ popovers */

const popovers = new Set();

/**
 * Registers a menu so it closes on outside click or Escape.
 *
 * History rows re-register on every render, so entries whose menu has been
 * detached from the document are dropped as we go. Without this the set grows
 * without bound across a long session.
 */
export function registerPopover(menu, trigger) {
  const entry = { menu, trigger };
  popovers.add(entry);
  return () => popovers.delete(entry);
}

function livePopovers() {
  popovers.forEach(entry => {
    if (!entry.menu.isConnected) popovers.delete(entry);
  });
  return popovers;
}

export function closeAllPopovers(except) {
  livePopovers().forEach(({ menu, trigger }) => {
    if (menu === except) return;
    menu.classList.add('hidden');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  });
}

document.addEventListener('click', event => {
  let inside = null;
  livePopovers().forEach(({ menu, trigger }) => {
    if (menu.contains(event.target) || (trigger && trigger.contains(event.target))) {
      inside = menu;
    }
  });
  closeAllPopovers(inside);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeAllPopovers(null);
});

/** Triggers a file download from a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Copies text, falling back to a hidden textarea when the async Clipboard API
 * is unavailable. navigator.clipboard needs a secure context, which plain
 * http over a LAN address is not.
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
