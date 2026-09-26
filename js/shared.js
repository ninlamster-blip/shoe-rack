// State and helpers every screen uses. Screens import from here, never from
// each other, and navigate by changing the hash — app.js does the routing.

import { normalisePlan, defaultPlan, placement, typeOf, initials, homeShelf } from './rack.js';
import { settings, pairs as pairStore } from './store.js';
import { esc, icon, toast } from './ui.js';

export const view = document.getElementById('view');
export const cameraInput = document.getElementById('camera');
export const libraryInput = document.getElementById('library');

export function normaliseMember(m, i = 0) {
  return {
    id: String(m.id),
    name: String(m.name ?? '').slice(0, 24),
    tone: typeof m.tone === 'string' ? m.tone : '#ef9a6e',
    kid: Boolean(m.kid),
    size: String(m.size ?? '').slice(0, 12),
    sizeAt: Number(m.sizeAt) || 0,
  };
}

function loadPlan() {
  const saved = settings.get('plan', null);
  if (saved) return normalisePlan(saved);
  return normalisePlan(defaultPlan(settings.get('order', null))); // v1 stored a type order
}

export const state = {
  pairs: [],
  family: settings.get('family', []).filter((m) => m && m.id).map(normaliseMember),
  plan: loadPlan(),
  sizeSystem: settings.get('sizeSystem', 'EU'),
  filter: settings.get('filter', 'all'),
  showEmpty: settings.get('showEmpty', true),
  draft: null,
  check: null,
  scan: null,
  style: null,
  chat: [],
};

export const save = {
  family: () => settings.set('family', state.family),
  plan: () => settings.set('plan', state.plan),
  async pair(pair) {
    await pairStore.put(pair);
    const i = state.pairs.findIndex((p) => p.id === pair.id);
    if (i >= 0) state.pairs[i] = pair;
    else state.pairs.push(pair);
    return pair;
  },
  async removePair(id) {
    await pairStore.remove(id);
    state.pairs = state.pairs.filter((p) => p.id !== id);
  },
};

export const apiKey = () => settings.get('apiKey', '');
export const member = (id) => state.family.find((m) => m.id === id);
export const memberName = (id) => member(id)?.name ?? '';
export const layout = (pairs = state.pairs) => placement(pairs, state.plan, state.family);

export function shelfLabel(types) {
  const first = typeOf(types[0]).label;
  return types.length > 1 ? `${first} +${types.length - 1}` : first;
}

export function shelfName(types) {
  return types.map((t) => typeOf(t).label).join(', ');
}

// Where a pair is (or would be) on the rack right now.
export function whereIs(pair, pairs = state.pairs) {
  const others = pairs.filter((p) => p.id !== pair.id);
  const { shelfOf } = layout([...others, pair]);
  return shelfOf.get(pair.id) ?? null;
}

export function pairLabel(p) {
  const colour = p.colour ? `${p.colour[0].toUpperCase()}${p.colour.slice(1)} ` : '';
  return p.name || `${colour}${typeOf(p.type).label.toLowerCase()}`;
}

export function avatar(m, size = 'sm') {
  if (!m) return '';
  return `<span class="avatar ${size}" style="background:${esc(m.tone)}" aria-hidden="true">${esc(initials(m.name))}</span>`;
}

export function thumb(p, cls = '') {
  return p.photo
    ? `<img class="${cls}" src="${p.photo}" alt="">`
    : `<span class="thumb-blank tone-${typeOf(p.type).tone} ${cls}">${icon('shoe')}</span>`;
}

export function go(path) {
  if (location.hash === `#/${path}`) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = `#/${path}`;
}

export function paint(html, { keepScroll = false } = {}) {
  const y = window.scrollY;
  view.innerHTML = html;
  window.scrollTo(0, keepScroll ? y : 0);
  bindGo();
}

export function bindGo(root = view) {
  root.querySelectorAll('[data-go]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      go(el.dataset.go);
    }));
}

export function on(selector, event, fn, root = view) {
  root.querySelectorAll(selector).forEach((el) => el.addEventListener(event, (e) => fn(e, el)));
}

export function pickPhoto(input, handler) {
  input.value = '';
  input.onchange = () => input.files?.[0] && handler(input.files[0]);
  input.click();
}

// Error from ai.js → a status line with the one action that fixes it.
export function aiError(err, retryAction) {
  const fix = err.kind === 'no-key' || err.kind === 'bad-key'
    ? ' <button data-go="settings">Open Settings</button>'
    : retryAction && ['network', 'busy', 'garbled', 'offline'].includes(err.kind)
      ? ` <button data-action="${retryAction}">Try again</button>`
      : '';
  return `<div class="status warn" role="status">${icon('alert')}<span>${esc(err.message || 'Something went wrong.')}${fix}</span></div>`;
}

export function working(message) {
  return `<div class="status working" role="status">${icon('loader', 'spin')}<span>${esc(message)}</span></div>`;
}

export function ownerChips(selected, attr = 'owner', { allowAll = false } = {}) {
  if (!state.family.length) return '';
  const chip = (id, label, m) =>
    `<button type="button" class="chip" data-${attr}="${esc(id)}" aria-pressed="${selected === id}">${m ? avatar(m, 'xs') : ''}${esc(label)}</button>`;
  return `<div class="owners" role="group">${allowAll ? chip('all', 'Everyone') : ''}${state.family.map((m) => chip(m.id, m.name, m)).join('')}</div>`;
}

export function shelfText(n) {
  return n ? `Shelf ${n}` : 'No room on the rack';
}

export async function persist(pair, message) {
  try {
    await save.pair(pair);
    if (message) toast(message);
    return true;
  } catch {
    toast("Couldn't save — the phone may be out of space.");
    return false;
  }
}

export { homeShelf };
