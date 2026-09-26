import { typeOf, wornToday, logWear, undoWear } from '../rack.js';
import { settings } from '../store.js';
import { esc, icon } from '../ui.js';
import {
  state, paint, on, avatar, memberName, member, layout, pairLabel, shelfLabel, shelfName, thumb, persist,
} from '../shared.js';

function familyChips() {
  if (!state.family.length) return '';
  const chip = (id, label, dot) =>
    `<button class="chip" data-filter="${esc(id)}" aria-pressed="${state.filter === id}">${dot ? `<span class="dot" style="background:${esc(dot)}"></span>` : ''}${esc(label)}</button>`;
  return `<div class="chips" role="group" aria-label="Show shoes for">${chip('all', 'Everyone')}${state.family.map((m) => chip(m.id, m.name, m.tone)).join('')}</div>`;
}

const mine = (p) => state.filter === 'all' || p.owner === state.filter;

export function renderRack() {
  if (state.filter !== 'all' && !member(state.filter)) state.filter = 'all';
  const { shelves, overflow } = layout();
  const visible = state.pairs.filter(mine);
  const who = state.filter === 'all' ? '' : ` · ${memberName(state.filter)}`;
  const full = shelves.filter((s) => s.capacity && s.used >= s.capacity).length;
  const rows = shelves
    .map((s) => ({ ...s, shown: s.groups.flatMap((g) => g.pairs).filter(mine) }))
    .filter((s) => state.showEmpty || s.shown.length);

  const alert = overflow.length
    ? `<button class="notice warn" data-go="plan">${icon('alert')}<span><b>${overflow.length} ${overflow.length === 1 ? 'pair doesn’t' : 'pairs don’t'} fit.</b> Plan your shelves</span>${icon('chevron')}</button>`
    : full
      ? `<button class="notice" data-go="plan">${icon('box')}<span>${full} ${full === 1 ? 'shelf is' : 'shelves are'} full. See a better layout</span>${icon('chevron')}</button>`
      : '';

  const body = !state.pairs.length
    ? `<div class="welcome">
        <div class="art">${icon('shoe')}</div>
        <h2>Let's fill your rack</h2>
        <p>Photograph one pair, or the whole rack at once, and the app works out what everything is and where it goes.</p>
        <ol class="steps">
          <li><b>1</b>Add your family so every pair has an owner</li>
          <li><b>2</b>Tell it your rack: shelves and pairs per shelf</li>
          <li><b>3</b>Scan the whole rack, or tap + for one pair</li>
        </ol>
        <div style="display:grid;gap:10px">
          <button class="btn block" data-go="scan">${icon('camera')} Scan the whole rack</button>
          <button class="btn ghost block" data-go="add">${icon('plus')} Add one pair</button>
        </div>
      </div>`
    : `${alert}
       <ol class="rack">${rows.map(shelfRow).join('')}</ol>
       ${overflow.filter(mine).length ? overflowRow(overflow.filter(mine)) : ''}
       <button class="toggle-empty" data-action="toggle-empty">${state.showEmpty ? 'Hide empty shelves' : 'Show empty shelves'}</button>`;

  paint(`
    <header class="top">
      <div class="top-row">
        <span class="count-chip">${icon('shelf')} ${visible.length} ${visible.length === 1 ? 'pair' : 'pairs'}${esc(who)}</span>
        <span class="top-actions">
          <a class="icon-btn plain" href="#/settings" aria-label="Settings">${icon('settings')}</a>
          <a href="#/family" aria-label="Family">${state.family[0] ? avatar(state.family[0], '') : `<span class="avatar">${icon('family')}</span>`}</a>
        </span>
      </div>
      <h1>Shoe Rack</h1>
      <p class="sub">${state.plan.shelves.length} shelves, top first${state.plan.capacity ? ` · ${state.plan.capacity} pairs each` : ''}</p>
      ${familyChips()}
      ${state.pairs.length ? `<div class="quick">
        <button data-go="scan">${icon('camera')}<span>Scan rack</span></button>
        <button data-go="check">${icon('scan')}<span>Tidy check</span></button>
        <button data-go="plan">${icon('grid')}<span>Plan shelves</span></button>
      </div>` : ''}
    </header>
    <section class="sheet" aria-label="Shelves">${body}</section>`);

  on('[data-filter]', 'click', (e, b) => {
    state.filter = b.dataset.filter;
    settings.set('filter', state.filter);
    renderRack();
  });
  on('[data-action="toggle-empty"]', 'click', () => {
    state.showEmpty = !state.showEmpty;
    settings.set('showEmpty', state.showEmpty);
    renderRack();
  });
}

function shelfRow(s) {
  const tone = typeOf(s.types[0]).tone;
  const n = s.shown.length;
  const photos = s.shown.filter((p) => p.photo).slice(0, 4);
  const extra = n - photos.length;
  const names = s.shown.slice(0, 2).map((p) => {
    const owner = memberName(p.owner);
    return `<li>${esc(pairLabel(p))}${owner ? ` · ${esc(owner)}` : ''}</li>`;
  });
  const isFull = s.capacity && s.used >= s.capacity;
  const count = s.capacity ? `${s.used} / ${s.capacity}` : `${s.used} ${s.used === 1 ? 'pair' : 'pairs'}`;
  return `
    <li class="shelf tone-${tone} ${n ? '' : 'is-empty'}">
      <a class="shelf-pill" href="#/shelf/${s.n}" tabindex="-1" aria-hidden="true">
        <span class="label">${esc(shelfLabel(s.types))}</span><span class="num">${s.n}</span>
      </a>
      <button class="shelf-card" data-go="shelf/${s.n}" aria-label="Shelf ${s.n}, ${esc(shelfName(s.types))}, ${count}">
        <span class="meta">${icon('shelf')} Shelf ${s.n} · ${count}${isFull ? '<span class="tag full">Full</span>' : ''}</span>
        ${s.capacity ? `<span class="meter" aria-hidden="true"><span style="width:${Math.min(100, (s.used / s.capacity) * 100)}%"></span></span>` : ''}
        ${n
          ? `${photos.length ? `<span class="thumbs">${photos.map((p) => `<img src="${p.photo}" alt="">`).join('')}${extra > 0 ? `<span class="more">+${extra}</span>` : ''}</span>` : ''}
             <ul>${names.join('')}</ul>`
          : `<span class="empty">Empty — for ${esc(shelfName(s.types).toLowerCase())}</span>`}
      </button>
    </li>`;
}

function overflowRow(list) {
  return `
    <div class="overflow">
      <p class="section-title">${icon('box')} No room on the rack</p>
      <ul class="list">${list.map((p) => `
        <li><button class="row" data-go="pair/${p.id}">${thumb(p)}
          <span class="body"><span class="title">${esc(pairLabel(p))}</span><span class="desc">${esc(memberName(p.owner) || typeOf(p.type).label)}</span></span>
          <span class="end">${icon('chevron')}</span></button></li>`).join('')}
      </ul>
    </div>`;
}

export function renderShelf(arg) {
  const { shelves } = layout();
  const s = shelves[Number(arg) - 1];
  if (!s) return renderRack();
  const tone = typeOf(s.types[0]).tone;
  const list = s.groups.flatMap((g) => g.pairs);

  paint(`
    <div class="form-screen tone-${tone}" style="background:var(--tone)">
      <header class="form-head">
        <button class="back" data-go="rack">${icon('back')} Rack</button>
        <h1>Shelf ${s.n}</h1>
        <p class="head-sub">${esc(shelfName(s.types))}${s.capacity ? ` · ${s.used} of ${s.capacity} spaces` : ''}</p>
      </header>
      <section class="form-body">
        <p class="lede">${list.length
          ? 'Line them up left to right in this order — daily pairs at the front, then grouped by person. Tap the foot when someone wears a pair.'
          : `Nothing here yet. ${esc(shelfName(s.types))} will show up on this shelf.`}</p>
        <ol class="list">
          ${list.map((p, i) => `
            <li class="row-wrap">
              <button class="row" data-go="pair/${p.id}">
                <span class="pos">${i + 1}</span>
                ${thumb(p)}
                <span class="body">
                  <span class="title">${esc(pairLabel(p))}${p.daily ? '<span class="tag">Daily</span>' : ''}</span>
                  <span class="desc">${esc([memberName(p.owner), p.size].filter(Boolean).join(' · ') || 'No owner yet')}</span>
                </span>
              </button>
              <button class="wear ${wornToday(p) ? 'on' : ''}" data-wear="${p.id}" aria-pressed="${wornToday(p)}" aria-label="${wornToday(p) ? 'Worn today — tap to undo' : 'Wore these today'}">${icon('foot')}</button>
            </li>`).join('')}
        </ol>
        <div style="display:grid;gap:10px;margin-top:24px">
          <button class="btn block" data-go="check/${s.n}">${icon('scan')} Check this shelf</button>
          <button class="btn ghost block" data-go="add">${icon('plus')} Add a pair</button>
        </div>
      </section>
    </div>`);

  on('[data-wear]', 'click', async (e, b) => {
    const p = state.pairs.find((x) => x.id === b.dataset.wear);
    const was = wornToday(p);
    if (await persist(was ? undoWear(p) : logWear(p), was ? 'Unmarked' : `Logged: ${pairLabel(p)} worn today`)) {
      renderShelfKeepingScroll(s.n);
    }
  });
}

function renderShelfKeepingScroll(n) {
  const y = window.scrollY;
  renderShelf(n);
  window.scrollTo(0, y);
}
