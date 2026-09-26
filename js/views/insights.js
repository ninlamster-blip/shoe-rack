import {
  TYPES, DAY, typeOf, declutter, outgrown, sizeCheckDue, care, wearsSince, wornToday, logWear, undoWear,
  suggestPlan, normalisePlan, moveShelf, placement, CONDITIONS,
} from '../rack.js';
import { settings } from '../store.js';
import { esc, icon, toast, confirmDialog } from '../ui.js';
import {
  state, paint, on, save, persist, member, memberName, avatar, layout, pairLabel, thumb, shelfName, go,
} from '../shared.js';

const who = () => settings.get('insightsWho', state.family[0]?.id ?? 'all');

export function renderInsights() {
  const now = Date.now();
  let person = who();
  if (person !== 'all' && !member(person)) person = 'all';
  const theirs = state.pairs.filter((p) => person === 'all' || p.owner === person);
  const today = [...theirs].sort((a, b) => wearsSince(b, now - 30 * DAY) - wearsSince(a, now - 30 * DAY) || Number(b.daily) - Number(a.daily));

  const idle = declutter(state.pairs, now);
  const small = outgrown(state.pairs, state.family);
  const measure = sizeCheckDue(state.family, now);
  const { replace, clean, worn } = care(state.pairs, now);
  const { shelves, overflow } = layout();
  const cap = state.plan.capacity;
  const used = shelves.reduce((n, s) => n + s.used, 0);
  const top = [...state.pairs].sort((a, b) => wearsSince(b, now - 30 * DAY) - wearsSince(a, now - 30 * DAY))[0];
  const topCount = top ? wearsSince(top, now - 30 * DAY) : 0;

  const row = (p, desc, action = '') => `
    <li class="row-wrap">
      <button class="row" data-go="pair/${p.id}">${thumb(p)}
        <span class="body"><span class="title">${esc(pairLabel(p))}</span><span class="desc">${desc}</span></span>
      </button>${action}
    </li>`;

  const sections = [];

  if (small.length || measure.length) {
    sections.push(`
      <section class="panel">
        <h2>${icon('ruler')} Growing feet</h2>
        <ul class="list">
          ${small.map((x) => row(x.pair, `Too small for ${esc(x.member.name)} now — size ${x.pairSize}, they're ${x.memberSize}`,
            `<button class="mini" data-remove="${x.pair.id}">Remove</button>`)).join('')}
          ${measure.map((m) => `
            <li><button class="row" data-go="family">${avatar(m, '')}
              <span class="body"><span class="title">Measure ${esc(m.name)}'s feet</span>
              <span class="desc">${m.size ? `Size ${esc(m.size)} was set over 4 months ago` : 'No size saved yet'}</span></span>
              <span class="end">${icon('chevron')}</span></button></li>`).join('')}
        </ul>
      </section>`);
  }

  if (replace.length || clean.length || worn.length) {
    sections.push(`
      <section class="panel">
        <h2>${icon('drop')} Care</h2>
        <ul class="list">
          ${replace.map((p) => row(p, `<span class="bad">${CONDITIONS.replace}</span>${p.careTip ? ` · ${esc(p.careTip)}` : ''}`,
            `<button class="mini" data-remove="${p.id}">Remove</button>`)).join('')}
          ${clean.map((p) => row(p, `${p.condition === 'dirty' ? 'Looked dirty in its photo' : `Worn ${wearsSince(p, Math.max(p.cleanedAt ?? 0, p.createdAt ?? 0))} times since a clean`}${p.careTip ? ` · ${esc(p.careTip)}` : ''}`,
            `<button class="mini" data-cleaned="${p.id}">Cleaned</button>`)).join('')}
          ${worn.map((p) => row(p, `${CONDITIONS.worn}${p.careTip ? ` · ${esc(p.careTip)}` : ''}`)).join('')}
        </ul>
      </section>`);
  }

  if (idle.length) {
    sections.push(`
      <section class="panel">
        <h2>${icon('box')} Declutter</h2>
        <p class="lede">Nobody has worn these in a while. Donate, store them away, or keep them — the app will stop asking for six months.</p>
        <ul class="list">
          ${idle.slice(0, 8).map((x) => row(x.pair, `${esc(memberName(x.pair.owner) || 'No owner')} · not worn for ${months(x.idle)}`,
            `<span class="mini-pair"><button class="mini" data-keep="${x.pair.id}">Keep</button><button class="mini ghost" data-remove="${x.pair.id}">Remove</button></span>`)).join('')}
        </ul>
        ${idle.length > 8 ? `<p class="hint">…and ${idle.length - 8} more.</p>` : ''}
      </section>`);
  }

  sections.push(`
    <section class="panel">
      <h2>${icon('grid')} Rack space</h2>
      <button class="row" data-go="plan">
        <span class="stat"><b>${used}</b><small>${cap ? `of ${cap * state.plan.shelves.length}` : 'pairs'}</small></span>
        <span class="body"><span class="title">${overflow.length ? `${overflow.length} ${overflow.length === 1 ? 'pair has' : 'pairs have'} no room` : cap ? `${shelves.filter((s) => s.used >= cap).length} of ${shelves.length} shelves full` : 'No shelf limit set'}</span>
        <span class="desc">${cap ? 'See a better layout' : 'Set how many pairs fit on a shelf'}</span></span>
        <span class="end">${icon('chevron')}</span>
      </button>
    </section>`);

  paint(`
    <header class="top">
      <div class="top-row"><span class="count-chip">${icon('bulb')} Insights</span></div>
      <h1>Today</h1>
      <p class="sub">${top && topCount ? `Most worn this month: ${esc(pairLabel(top))} (${topCount}×)` : 'Tap what you wore to teach the app what matters.'}</p>
    </header>
    <section class="sheet">
      <p class="section-title">Who wore what today?</p>
      ${state.family.length ? `<div class="owners" role="group" aria-label="Person" style="margin-bottom:14px">
        <button class="chip" data-who="all" aria-pressed="${person === 'all'}">Everyone</button>
        ${state.family.map((m) => `<button class="chip" data-who="${esc(m.id)}" aria-pressed="${person === m.id}">${avatar(m, 'xs')}${esc(m.name)}</button>`).join('')}
      </div>` : ''}
      ${today.length
        ? `<div class="tiles">${today.slice(0, 12).map((p) => `
            <button class="tile ${wornToday(p) ? 'on' : ''}" data-wear="${p.id}" aria-pressed="${wornToday(p)}">
              ${thumb(p)}<span>${esc(pairLabel(p))}</span>${wornToday(p) ? `<i>${icon('check')}</i>` : ''}
            </button>`).join('')}</div>`
        : `<p class="lede">No pairs yet${person === 'all' ? '' : ` for ${esc(memberName(person))}`}.</p>`}
      ${sections.join('')}
    </section>`, { keepScroll: true });

  on('[data-who]', 'click', (e, b) => { settings.set('insightsWho', b.dataset.who); renderInsights(); });
  on('[data-wear]', 'click', async (e, b) => {
    const p = state.pairs.find((x) => x.id === b.dataset.wear);
    if (await persist(wornToday(p) ? undoWear(p) : logWear(p))) renderInsights();
  });
  on('[data-cleaned]', 'click', async (e, b) => {
    const p = state.pairs.find((x) => x.id === b.dataset.cleaned);
    if (await persist({ ...p, cleanedAt: Date.now(), condition: p.condition === 'dirty' ? 'good' : p.condition }, 'Marked as cleaned')) renderInsights();
  });
  on('[data-keep]', 'click', async (e, b) => {
    const p = state.pairs.find((x) => x.id === b.dataset.keep);
    if (await persist({ ...p, keptAt: Date.now() }, 'Kept — won’t ask again for six months')) renderInsights();
  });
  on('[data-remove]', 'click', async (e, b) => {
    const p = state.pairs.find((x) => x.id === b.dataset.remove);
    const ok = await confirmDialog({ title: `Remove ${pairLabel(p)}?`, body: 'It comes off the rack and its photo is deleted from this phone.', confirm: 'Remove' });
    if (!ok) return;
    await save.removePair(p.id);
    toast('Removed');
    renderInsights();
  });
}

function months(days) {
  if (days < 60) return `${days} days`;
  const m = Math.round(days / 30);
  return m >= 24 ? `${Math.round(m / 12)} years` : `${m} months`;
}

// ---------- shelf planning ----------

export function rackSize() {
  const saved = settings.get('rack', null);
  return {
    shelfCount: Math.min(Math.max(Number(saved?.shelfCount) || state.plan.shelves.length, 1), 30),
    capacity: Math.min(Math.max(Number(saved?.capacity ?? state.plan.capacity) || 0, 0), 60),
  };
}

let editing = -1;

export function renderPlan() {
  const rack = rackSize();
  const current = layout();
  const suggestion = suggestPlan(state.pairs, rack);
  const same = JSON.stringify(suggestion.plan) === JSON.stringify(state.plan);
  const suggested = placement(state.pairs, suggestion.plan, state.family).shelves;

  const shelfList = (shelves, editable) => shelves.map((s, i) => `
    <li class="order-row tone-${typeOf(s.types[0]).tone} ${editable && editing === i ? 'open' : ''}">
      <div class="order-main">
        <span class="num">${s.n}</span>
        <span class="name">${esc(shelfName(s.types))}<small>${s.capacity ? `${s.used} / ${s.capacity}` : `${s.used} ${s.used === 1 ? 'pair' : 'pairs'}`}</small></span>
        ${editable ? `
          <button class="icon-btn" data-move="${i}" data-delta="-1" aria-label="Move shelf ${s.n} up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
          <button class="icon-btn" data-move="${i}" data-delta="1" aria-label="Move shelf ${s.n} down" ${i === shelves.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
          <button class="icon-btn" data-edit="${i}" aria-expanded="${editing === i}" aria-label="Choose types for shelf ${s.n}">${icon('settings')}</button>` : ''}
      </div>
      ${editable && editing === i ? `<div class="order-edit">
        ${TYPES.map((t) => `<button class="chip" data-toggle="${t.id}" data-shelf="${i}" aria-pressed="${s.types.includes(t.id)}">${esc(t.label)}</button>`).join('')}
        <p class="hint">A type can be on more than one shelf — it fills the first, then spills onto the next.</p>
      </div>` : ''}
    </li>`).join('');

  paint(`
    <div class="form-screen">
      <header class="form-head">
        <button class="back" data-action="leave">${icon('close')} Back</button>
        <h1>Plan Shelves</h1>
        <p class="head-sub">Tell it your rack, and it lays the shelves out around what your family really wears.</p>
      </header>
      <section class="form-body">
        <div class="field two">
          <div>
            <span class="label">Shelves</span>
            <div class="stepper"><button class="icon-btn" data-step="shelfCount" data-delta="-1" aria-label="Fewer shelves">−</button>
              <b>${rack.shelfCount}</b><button class="icon-btn" data-step="shelfCount" data-delta="1" aria-label="More shelves">+</button></div>
          </div>
          <div>
            <span class="label">Pairs per shelf</span>
            <div class="stepper"><button class="icon-btn" data-step="capacity" data-delta="-1" aria-label="Fewer pairs per shelf">−</button>
              <b>${rack.capacity || '∞'}</b><button class="icon-btn" data-step="capacity" data-delta="1" aria-label="More pairs per shelf">+</button></div>
          </div>
        </div>
        <p class="hint" style="margin-top:-14px;margin-bottom:24px">Count the pairs that fit on one shelf side by side. ∞ means no limit.</p>

        ${same ? `<div class="verdict ok">${icon('check')}<span>Your rack already uses the best layout.</span></div>` : `
          <p class="section-title">${icon('sparkle')} Suggested layout</p>
          <p class="lede">Most-worn types on the top shelves${rack.capacity ? ', big collections split across shelves, small ones sharing' : ''}.
            ${!suggestion.overflow && suggestion.plan.shelves.length < rack.shelfCount ? `It needs only ${suggestion.plan.shelves.length} of your ${rack.shelfCount} shelves — the rest are spare.` : ''}
            ${suggestion.overflow ? `<b class="bad">${suggestion.overflow} ${suggestion.overflow === 1 ? 'pair' : 'pairs'} still won’t fit</b> — ${declutter(state.pairs).length ? 'see Declutter in Insights, or ' : ''}add a shelf.` : ''}</p>
          <ol class="list">${shelfList(suggested, false)}</ol>
          <button class="btn block" style="margin:16px 0 30px" data-action="apply">Use this layout</button>`}

        <p class="section-title">Your rack now</p>
        ${current.overflow.length ? `<p class="lede"><b class="bad">${current.overflow.length} ${current.overflow.length === 1 ? 'pair has' : 'pairs have'} no room.</b></p>` : ''}
        ${state.plan.shelves.length !== rack.shelfCount ? `<p class="lede">This layout uses ${state.plan.shelves.length} shelves but your rack has ${rack.shelfCount}. Use the suggestion above to fit it.</p>` : ''}
        <ol class="list">${shelfList(current.shelves, true)}</ol>
      </section>
    </div>`, { keepScroll: true });

  on('[data-step]', 'click', (e, b) => {
    const r = rackSize();
    const key = b.dataset.step;
    r[key] = Math.min(Math.max(r[key] + Number(b.dataset.delta), key === 'capacity' ? 0 : 1), key === 'capacity' ? 60 : 30);
    settings.set('rack', r);
    if (key === 'capacity') {
      state.plan = normalisePlan({ ...state.plan, capacity: r.capacity });
      save.plan();
    }
    renderPlan();
  });
  on('[data-action="apply"]', 'click', () => {
    state.plan = suggestion.plan;
    save.plan();
    editing = -1;
    toast('Layout updated — move the shoes to match');
    go('rack');
  });
  on('[data-move]', 'click', (e, b) => {
    state.plan = moveShelf(state.plan, Number(b.dataset.move), Number(b.dataset.delta));
    save.plan();
    editing = -1;
    renderPlan();
  });
  on('[data-edit]', 'click', (e, b) => {
    const i = Number(b.dataset.edit);
    editing = editing === i ? -1 : i;
    renderPlan();
  });
  on('[data-toggle]', 'click', (e, b) => {
    const i = Number(b.dataset.shelf);
    const t = b.dataset.toggle;
    const shelves = state.plan.shelves.map((s) => [...s]);
    if (shelves[i].includes(t)) {
      if (shelves[i].length === 1) return toast('A shelf needs at least one type');
      if (shelves.filter((s) => s.includes(t)).length === 1) return toast(`${typeOf(t).label} needs a shelf — add it to another first`);
      shelves[i] = shelves[i].filter((x) => x !== t);
    } else {
      shelves[i].push(t);
    }
    state.plan = normalisePlan({ ...state.plan, shelves });
    save.plan();
    renderPlan();
  });
  on('[data-action="leave"]', 'click', () => { editing = -1; history.length > 1 ? history.back() : go('rack'); });
}
