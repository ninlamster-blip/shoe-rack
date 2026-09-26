import {
  TYPES, COLOURS, typeOf, normaliseOrder, shelfFor, moveShelf, groupByShelf, sortShelf,
  cleanRecognition, tidyReport, initials,
} from './rack.js';
import { settings, pairs as pairStore, newId } from './store.js';
import { shrink, base64Of } from './image.js';
import { recognisePair, readShelf } from './ai.js';
import { esc, icon, toast, confirmDialog, COLOUR_HEX, MEMBER_TONES } from './ui.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const cameraInput = document.getElementById('camera');
const libraryInput = document.getElementById('library');

const state = {
  pairs: [],
  family: settings.get('family', []),
  order: normaliseOrder(settings.get('order', [])),
  filter: settings.get('filter', 'all'),
  showEmpty: settings.get('showEmpty', true),
  draft: null,
  check: null,
};

const apiKey = () => settings.get('apiKey', '');
const member = (id) => state.family.find((m) => m.id === id);
const memberName = (id) => member(id)?.name ?? '';
const visiblePairs = () => (state.filter === 'all' ? state.pairs : state.pairs.filter((p) => p.owner === state.filter));

function saveFamily() { settings.set('family', state.family); }
function saveOrder() { settings.set('order', state.order); }

function pairLabel(p) {
  const colour = p.colour ? `${p.colour[0].toUpperCase()}${p.colour.slice(1)} ` : '';
  return p.name || `${colour}${typeOf(p.type).label.toLowerCase()}`;
}

function avatar(m, size = 'sm') {
  if (!m) return '';
  return `<span class="avatar ${size}" style="background:${esc(m.tone)}" aria-hidden="true">${esc(initials(m.name))}</span>`;
}

// ---------- routing ----------

function route() {
  const [name = 'rack', arg] = location.hash.replace(/^#\/?/, '').split('/');
  const tabs = { rack: renderRack, check: renderCheck, family: renderFamily, settings: renderSettings };
  const isForm = name === 'add' || name === 'pair' || name === 'shelf';
  nav.hidden = isForm;
  for (const a of nav.querySelectorAll('a')) {
    if (a.dataset.tab === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (name === 'add') return renderForm(newDraft());
  if (name === 'pair') {
    const p = state.pairs.find((x) => x.id === arg);
    return p ? renderForm({ ...p, isNew: false, ai: { status: 'idle' }, touched: new Set() }) : go('rack');
  }
  if (name === 'shelf') return renderShelf(arg);
  if (name === 'check') return renderCheck(arg);
  (tabs[name] ?? renderRack)();
}

function go(path) {
  if (location.hash === `#/${path}`) route();
  else location.hash = `#/${path}`;
}

function paint(html, { keepScroll = false } = {}) {
  const y = window.scrollY;
  view.innerHTML = html;
  window.scrollTo(0, keepScroll ? y : 0);
}

// ---------- Rack ----------

function familyChips() {
  if (!state.family.length) return '';
  const chip = (id, label, dot) =>
    `<button class="chip" data-filter="${esc(id)}" aria-pressed="${state.filter === id}">${dot ? `<span class="dot" style="background:${esc(dot)}"></span>` : ''}${esc(label)}</button>`;
  return `<div class="chips" role="group" aria-label="Show shoes for">${chip('all', 'Everyone')}${state.family.map((m) => chip(m.id, m.name, m.tone)).join('')}</div>`;
}

function renderRack() {
  if (state.filter !== 'all' && !member(state.filter)) state.filter = 'all';
  const list = visiblePairs();
  const shelves = groupByShelf(list, state.order, state.family);
  const shown = state.showEmpty ? shelves : shelves.filter((s) => s.pairs.length);
  const who = state.filter === 'all' ? '' : ` · ${memberName(state.filter)}`;
  const me = state.family[0];

  const body = !state.pairs.length
    ? `<div class="welcome">
        <div class="art">${icon('shoe')}</div>
        <h2>Let's fill your rack</h2>
        <p>Photograph a pair and the app works out what it is and which shelf it belongs on.</p>
        <ol class="steps">
          <li><b>1</b>Add your family so every pair has an owner</li>
          <li><b>2</b>Paste your Claude API key in Settings</li>
          <li><b>3</b>Tap + and photograph a pair</li>
        </ol>
        <button class="btn block" data-go="add">${icon('camera')} Add the first pair</button>
      </div>`
    : `<ol class="rack">${shown.map(shelfRow).join('')}</ol>
       <button class="toggle-empty" data-action="toggle-empty">${state.showEmpty ? 'Hide empty shelves' : 'Show empty shelves'}</button>`;

  paint(`
    <header class="top">
      <div class="top-row">
        <span class="count-chip">${icon('shelf')} ${list.length} ${list.length === 1 ? 'pair' : 'pairs'}${esc(who)}</span>
        ${me ? `<a href="#/family" aria-label="Family">${avatar(me, '')}</a>` : ''}
      </div>
      <h1>Shoe Rack</h1>
      <p class="sub">Sorted by type, top shelf first</p>
      ${familyChips()}
    </header>
    <section class="sheet" aria-label="Shelves">${body}</section>`);

  view.querySelectorAll('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      state.filter = b.dataset.filter;
      settings.set('filter', state.filter);
      renderRack();
    }));
  view.querySelector('[data-action="toggle-empty"]')?.addEventListener('click', () => {
    state.showEmpty = !state.showEmpty;
    settings.set('showEmpty', state.showEmpty);
    renderRack();
  });
  bindGo();
}

function shelfRow({ shelf, type, pairs }) {
  const t = typeOf(type);
  const n = pairs.length;
  const thumbs = pairs.filter((p) => p.photo).slice(0, 4);
  const extra = n - thumbs.length;
  const names = pairs.slice(0, 2).map((p) => {
    const owner = memberName(p.owner);
    return `<li>${esc(pairLabel(p))}${owner ? ` · ${esc(owner)}` : ''}</li>`;
  });
  return `
    <li class="shelf tone-${t.tone} ${n ? '' : 'is-empty'}">
      <a class="shelf-pill" href="#/shelf/${type}" tabindex="-1" aria-hidden="true">
        <span class="label">${esc(t.label)}</span><span class="num">${shelf}</span>
      </a>
      <button class="shelf-card" data-go="shelf/${type}" aria-label="Shelf ${shelf}, ${esc(t.label)}, ${n} ${n === 1 ? 'pair' : 'pairs'}">
        <span class="meta">${icon('shelf')} Shelf ${shelf} · ${n} ${n === 1 ? 'pair' : 'pairs'}</span>
        ${n
          ? `${thumbs.length ? `<span class="thumbs">${thumbs.map((p) => `<img src="${p.photo}" alt="">`).join('')}${extra > 0 ? `<span class="more">+${extra}</span>` : ''}</span>` : ''}
             <ul>${names.join('')}</ul>`
          : `<span class="empty">Empty — ${esc(t.label.toLowerCase())} go here</span>`}
      </button>
    </li>`;
}

// ---------- Shelf detail: the order to line them up in ----------

function renderShelf(type) {
  const t = typeOf(type);
  const shelf = shelfFor(t.id, state.order);
  const list = sortShelf(state.pairs.filter((p) => p.type === t.id), state.family);
  paint(`
    <div class="form-screen tone-${t.tone}" style="background:var(--tone)">
      <header class="form-head">
        <button class="back" data-go="rack">${icon('back')} Rack</button>
        <h1>Shelf ${shelf} · ${esc(t.label)}</h1>
      </header>
      <section class="form-body">
        <p class="lede">${list.length
          ? 'Line them up left to right in this order — daily pairs at the front, then grouped by person.'
          : `Nothing here yet. Add a pair and choose ${esc(t.label.toLowerCase())}, and it will show up on this shelf.`}</p>
        <ol class="list">
          ${list.map((p, i) => `
            <li><button class="row" data-go="pair/${p.id}">
              <span class="pos">${i + 1}</span>
              ${p.photo ? `<img src="${p.photo}" alt="">` : `<span class="avatar sm" style="background:var(--tone)">${icon('shoe')}</span>`}
              <span class="body">
                <span class="title">${esc(pairLabel(p))}${p.daily ? '<span class="tag">Daily</span>' : ''}</span>
                <span class="desc">${esc([memberName(p.owner), p.brand].filter(Boolean).join(' · ') || 'No owner yet')}</span>
              </span>
              <span class="end">${icon('chevron')}</span>
            </button></li>`).join('')}
        </ol>
        <div style="display:grid;gap:10px;margin-top:24px">
          <button class="btn block" data-go="check/${t.id}">${icon('scan')} Check this shelf</button>
          <button class="btn ghost block" data-go="add">${icon('plus')} Add a pair</button>
        </div>
      </section>
    </div>`);
  bindGo();
}

// ---------- Add / edit a pair ----------

function newDraft() {
  return {
    id: newId(),
    isNew: true,
    photo: '',
    type: '',
    colour: '',
    brand: '',
    name: '',
    owner: state.filter !== 'all' ? state.filter : state.family.length === 1 ? state.family[0].id : '',
    daily: false,
    createdAt: Date.now(),
    ai: { status: 'idle' },
    touched: new Set(),
  };
}

function aiStatus(ai) {
  if (ai.status === 'working') {
    return `<div class="status working" role="status">${icon('loader', 'spin')}<span>Looking at your photo…</span></div>`;
  }
  if (ai.status === 'done') {
    return `<div class="status done" role="status">${icon('sparkle')}<span>${esc(ai.message)}</span></div>`;
  }
  if (ai.status === 'error') {
    const fix = ai.kind === 'no-key' || ai.kind === 'bad-key'
      ? ' <button data-go="settings">Open Settings</button>'
      : ai.kind === 'network' || ai.kind === 'busy' || ai.kind === 'garbled' ? ' <button data-action="retry-ai">Try again</button>' : '';
    return `<div class="status warn" role="status">${icon('alert')}<span>${esc(ai.message)}${fix}</span></div>`;
  }
  return '';
}

function renderForm(draft, opts) {
  state.draft = draft;
  const d = draft;
  const t = d.type ? typeOf(d.type) : null;
  const shelf = t ? shelfFor(t.id, state.order) : 0;

  const photo = d.photo
    ? `<div class="photo"><img src="${d.photo}" alt="Photo of this pair"><button class="retake" data-action="camera">${icon('camera')} Retake</button></div>`
    : `<div class="capture">
         <button class="shoot" data-action="camera">${icon('camera')} Take a photo</button>
         <button class="library" data-action="library">${icon('image')} Library</button>
       </div>`;

  paint(`
    <div class="form-screen">
      <header class="form-head">
        <button class="back" data-action="leave">${icon('close')} Back</button>
        <h1>${d.isNew ? 'Add New Pair' : 'Edit Pair'}</h1>
      </header>
      <form class="form-body" novalidate>
        <div class="field">
          <span class="label">Photo</span>
          ${photo}
          ${aiStatus(d.ai)}
        </div>

        <div class="field">
          <span class="label" id="type-label">Type</span>
          <div class="card"><div class="types" role="group" aria-labelledby="type-label">
            ${TYPES.map((x) => `<button type="button" class="type" data-type="${x.id}" aria-pressed="${d.type === x.id}">${esc(x.label)}</button>`).join('')}
          </div></div>
        </div>

        ${t ? `<div class="goes tone-${t.tone}"><span class="num">${shelf}</span><span>Goes on <b>Shelf ${shelf}</b> with the ${esc(t.label.toLowerCase())}</span></div>` : ''}

        <div class="field">
          <span class="label" id="colour-label">Colour</span>
          <div class="swatches" role="group" aria-labelledby="colour-label">
            ${COLOURS.map((c) => `<button type="button" class="swatch" data-colour="${c}" aria-pressed="${d.colour === c}" aria-label="${c}" title="${c}" style="background:${COLOUR_HEX[c]}"></button>`).join('')}
          </div>
        </div>

        <div class="field">
          <label class="label" for="name">Name</label>
          <input class="input" id="name" name="name" value="${esc(d.name)}" placeholder="e.g. White leather low-tops" autocomplete="off" maxlength="60">
        </div>

        <div class="field">
          <label class="label" for="brand">Brand <span style="color:var(--muted);font-weight:400">(optional)</span></label>
          <input class="input" id="brand" name="brand" value="${esc(d.brand)}" placeholder="Write the brand" autocomplete="off" maxlength="40">
        </div>

        <div class="field">
          <span class="label" id="owner-label">Whose?</span>
          ${state.family.length
            ? `<div class="owners" role="group" aria-labelledby="owner-label">
                ${state.family.map((m) => `<button type="button" class="chip" data-owner="${esc(m.id)}" aria-pressed="${d.owner === m.id}">${avatar(m, 'xs')}${esc(m.name)}</button>`).join('')}
              </div>`
            : `<p class="hint">Add your family in the Family tab to give every pair an owner.</p>`}
        </div>

        <div class="save-row">
          <div class="switch-field">
            <span class="label" id="daily-label">Daily pair</span>
            <button type="button" class="switch" role="switch" aria-checked="${d.daily}" aria-labelledby="daily-label" data-action="daily"></button>
          </div>
          <button type="submit" class="btn" ${d.type ? '' : 'disabled'}>Save</button>
        </div>
        ${d.type ? '' : '<p class="hint" style="text-align:right">Choose a type to save.</p>'}
        ${d.isNew ? '' : `<button type="button" class="link-danger" data-action="delete">${icon('trash')} Remove this pair</button>`}
      </form>
    </div>`, opts);

  const form = view.querySelector('form');
  form.addEventListener('submit', (e) => { e.preventDefault(); savePair(); });
  form.querySelector('#name').addEventListener('input', (e) => { d.name = e.target.value; d.touched.add('name'); });
  form.querySelector('#brand').addEventListener('input', (e) => { d.brand = e.target.value; d.touched.add('brand'); });
  const again = () => renderForm(d, { keepScroll: true });

  form.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { d.type = b.dataset.type; d.touched.add('type'); again(); }));
  form.querySelectorAll('[data-colour]').forEach((b) => b.addEventListener('click', () => { d.colour = d.colour === b.dataset.colour ? '' : b.dataset.colour; d.touched.add('colour'); again(); }));
  form.querySelectorAll('[data-owner]').forEach((b) => b.addEventListener('click', () => { d.owner = d.owner === b.dataset.owner ? '' : b.dataset.owner; again(); }));
  view.querySelector('[data-action="daily"]').addEventListener('click', () => { d.daily = !d.daily; again(); });
  view.querySelector('[data-action="camera"]')?.addEventListener('click', () => pickPhoto(cameraInput, onPairPhoto));
  view.querySelector('[data-action="library"]')?.addEventListener('click', () => pickPhoto(libraryInput, onPairPhoto));
  view.querySelector('[data-action="retry-ai"]')?.addEventListener('click', () => recognise(d));
  view.querySelector('[data-action="delete"]')?.addEventListener('click', () => deletePair(d));
  view.querySelector('[data-action="leave"]').addEventListener('click', () => history.length > 1 ? history.back() : go('rack'));
  bindGo();
}

function pickPhoto(input, handler) {
  input.value = '';
  input.onchange = () => input.files?.[0] && handler(input.files[0]);
  input.click();
}

async function onPairPhoto(file) {
  const d = state.draft;
  try {
    d.photo = await shrink(file);
  } catch {
    toast("That photo couldn't be opened. Try another.");
    return;
  }
  recognise(d);
}

async function recognise(d) {
  d.ai = { status: 'working' };
  renderForm(d, { keepScroll: true });
  let ai;
  try {
    const r = cleanRecognition(await recognisePair(apiKey(), base64Of(d.photo)));
    if (!r.isShoe) {
      ai = { status: 'error', kind: 'not-shoe', message: "This doesn't look like a shoe. Choose the type yourself if it is." };
    } else {
      // Claude fills only what you haven't already chosen yourself.
      if (!d.touched.has('type')) d.type = r.type;
      if (!d.touched.has('colour') && r.colour) d.colour = r.colour;
      if (!d.touched.has('name') && r.name) d.name = r.name;
      if (!d.touched.has('brand') && r.brand) d.brand = r.brand;
      const what = `${r.colour ? `${r.colour} ` : ''}${typeOf(r.type).label.toLowerCase()}${r.brand ? ` by ${r.brand}` : ''}`;
      ai = {
        status: 'done',
        message: r.confidence === 'low'
          ? `Best guess: ${what}. Not sure — please check the type.`
          : `Looks like ${what}. Change anything that's off.`,
      };
    }
  } catch (err) {
    ai = { status: 'error', kind: err.kind, message: err.message || 'Something went wrong. Choose the type yourself.' };
  }
  if (state.draft !== d) return; // left the screen while Claude was looking
  d.ai = ai;
  renderForm(d, { keepScroll: true });
}

async function savePair() {
  const d = state.draft;
  if (!d?.type) return;
  const pair = {
    id: d.id, photo: d.photo, type: d.type, colour: d.colour,
    brand: d.brand.trim(), name: d.name.trim(), owner: d.owner, daily: d.daily,
    createdAt: d.createdAt, updatedAt: Date.now(),
  };
  try {
    await pairStore.put(pair);
  } catch {
    toast("Couldn't save — the phone may be out of space.");
    return;
  }
  const i = state.pairs.findIndex((p) => p.id === pair.id);
  if (i >= 0) state.pairs[i] = pair; else state.pairs.push(pair);
  state.draft = null;
  toast(`Saved — put it on Shelf ${shelfFor(pair.type, state.order)}`);
  go('rack');
}

async function deletePair(d) {
  const ok = await confirmDialog({ title: 'Remove this pair?', body: 'It comes off the rack and its photo is deleted from this phone.', confirm: 'Remove' });
  if (!ok) return;
  await pairStore.remove(d.id);
  state.pairs = state.pairs.filter((p) => p.id !== d.id);
  state.draft = null;
  toast('Removed');
  go('rack');
}

// ---------- Tidy check ----------

function renderCheck(preset) {
  const c = (state.check ??= { type: '', photo: '', status: 'idle' });
  if (preset && typeOf(preset).id === preset) c.type = preset;
  const t = c.type ? typeOf(c.type) : null;

  let result = '';
  if (c.status === 'working') {
    result = `<div class="status working" role="status">${icon('loader', 'spin')}<span>Checking the shelf…</span></div>`;
  } else if (c.status === 'error') {
    const fix = c.kind === 'no-key' || c.kind === 'bad-key' ? ' <button data-go="settings">Open Settings</button>' : ' <button data-action="retry">Try again</button>';
    result = `<div class="status warn" role="status">${icon('alert')}<span>${esc(c.message)}${fix}</span></div>`;
  } else if (c.status === 'done') {
    const { items, misplaced } = c.report;
    result = `
      <div class="verdict ${misplaced.length ? 'move' : 'ok'}" role="status">
        ${icon(misplaced.length ? 'alert' : 'check')}
        <span>${!items.length
          ? 'No shoes spotted. Try a photo with the whole shelf in view.'
          : misplaced.length
            ? `${misplaced.length} of ${items.length} ${items.length === 1 ? 'pair' : 'pairs'} ${misplaced.length === 1 ? 'needs' : 'need'} to move`
            : `All ${items.length} ${items.length === 1 ? 'pair is' : 'pairs are'} on the right shelf`}</span>
      </div>
      <ul class="list">
        ${[...misplaced, ...items.filter((i) => i.belongs)].map((i) => `
          <li class="check-item ${i.belongs ? 'ok' : 'move'}">
            <span class="icon">${icon(i.belongs ? 'check' : 'arrow')}</span>
            <span><span class="title" style="display:block">${esc(i.name || `${i.colour} ${typeOf(i.type).label.toLowerCase()}`)}</span>
            <span class="desc" style="display:block">${esc(i.position)}${i.position ? ' · ' : ''}${i.belongs ? 'Belongs here' : `Move to Shelf ${i.moveTo} · ${esc(typeOf(i.type).label)}`}</span></span>
          </li>`).join('')}
      </ul>
      <button class="btn ghost block" style="margin-top:18px" data-action="again">Check another shelf</button>`;
  }

  paint(`
    <header class="top">
      <div class="top-row"><span class="count-chip">${icon('scan')} Tidy check</span></div>
      <h1>Is it in order?</h1>
      <p class="sub">Photograph one shelf and Claude points out any pair on the wrong one.</p>
    </header>
    <section class="sheet">
      <p class="section-title">Which shelf are you checking?</p>
      <div class="types shelves" role="group" aria-label="Shelf">
        ${state.order.map((id, i) => `<button class="type" data-shelf="${id}" aria-pressed="${c.type === id}">${i + 1} · ${esc(typeOf(id).label)}</button>`).join('')}
      </div>
      <p class="section-title">Photo of the shelf</p>
      ${c.photo
        ? `<div class="photo"><img src="${c.photo}" alt="Photo of the shelf"><button class="retake" data-action="shoot">${icon('camera')} Retake</button></div>`
        : `<div class="capture">
             <button class="shoot" data-action="shoot" ${t ? '' : 'disabled'}>${icon('camera')} ${t ? `Photograph Shelf ${shelfFor(t.id, state.order)}` : 'Choose a shelf first'}</button>
             <button class="library" data-action="library" ${t ? '' : 'disabled'}>${icon('image')} Library</button>
           </div>`}
      <div style="margin-top:14px">${result}</div>
    </section>`, { keepScroll: c.status !== 'idle' });

  view.querySelectorAll('[data-shelf]').forEach((b) => b.addEventListener('click', () => {
    c.type = b.dataset.shelf;
    if (c.photo) return runCheck();
    renderCheck();
  }));
  view.querySelector('[data-action="shoot"]')?.addEventListener('click', () => pickPhoto(cameraInput, onShelfPhoto));
  view.querySelector('[data-action="library"]')?.addEventListener('click', () => pickPhoto(libraryInput, onShelfPhoto));
  view.querySelector('[data-action="retry"]')?.addEventListener('click', runCheck);
  view.querySelector('[data-action="again"]')?.addEventListener('click', () => { state.check = null; renderCheck(); });
  bindGo();
}

async function onShelfPhoto(file) {
  try {
    state.check.photo = await shrink(file, 1400);
  } catch {
    toast("That photo couldn't be opened. Try another.");
    return;
  }
  runCheck();
}

async function runCheck() {
  const c = state.check;
  if (!c?.photo || !c.type) return renderCheck();
  c.status = 'working';
  renderCheck();
  try {
    const raw = await readShelf(apiKey(), base64Of(c.photo));
    Object.assign(c, { status: 'done', report: tidyReport(raw?.pairs, c.type, state.order) });
  } catch (err) {
    Object.assign(c, { status: 'error', kind: err.kind, message: err.message || 'Something went wrong. Try again.' });
  }
  if (state.check === c && location.hash.startsWith('#/check')) renderCheck();
}

// ---------- Family ----------

function renderFamily() {
  const count = (id) => state.pairs.filter((p) => p.owner === id).length;
  const unowned = state.pairs.filter((p) => !member(p.owner)).length;
  paint(`
    <header class="top">
      <div class="top-row"><span class="count-chip">${icon('family')} ${state.family.length} ${state.family.length === 1 ? 'person' : 'people'}</span></div>
      <h1>Family</h1>
      <p class="sub">Everyone who keeps shoes on the rack.</p>
    </header>
    <section class="sheet">
      <ul class="list">
        ${state.family.map((m) => `
          <li class="row">
            ${avatar(m, '')}
            <span class="body"><span class="title">${esc(m.name)}</span><span class="desc">${count(m.id)} ${count(m.id) === 1 ? 'pair' : 'pairs'}</span></span>
            <button class="icon-btn" data-remove="${esc(m.id)}" aria-label="Remove ${esc(m.name)}">${icon('trash')}</button>
          </li>`).join('')}
      </ul>
      ${unowned && state.family.length ? `<p class="hint">${unowned} ${unowned === 1 ? 'pair has' : 'pairs have'} no owner yet — open one from the rack to set it.</p>` : ''}
      <p class="section-title">Add someone</p>
      <form class="inline" id="add-member">
        <label class="sr-only" for="member-name">Name</label>
        <input class="input" id="member-name" placeholder="Name" maxlength="24" autocomplete="off" required>
        <button class="btn small">Add</button>
      </form>
    </section>`);

  view.querySelector('#add-member').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.querySelector('input').value.trim();
    if (!name) return;
    state.family.push({ id: newId(), name, tone: MEMBER_TONES[state.family.length % MEMBER_TONES.length] });
    saveFamily();
    renderFamily();
    view.querySelector('#member-name').focus();
  });
  view.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    const m = member(b.dataset.remove);
    const n = count(m.id);
    const ok = await confirmDialog({
      title: `Remove ${m.name}?`,
      body: n ? `Their ${n} ${n === 1 ? 'pair stays' : 'pairs stay'} on the rack without an owner.` : 'They have no pairs on the rack.',
      confirm: 'Remove',
    });
    if (!ok) return;
    state.family = state.family.filter((x) => x.id !== m.id);
    if (state.filter === m.id) { state.filter = 'all'; settings.set('filter', 'all'); }
    saveFamily();
    renderFamily();
  }));
}

// ---------- Settings ----------

function renderSettings() {
  const key = apiKey();
  paint(`
    <header class="top">
      <div class="top-row"><span class="count-chip">${icon('settings')} Settings</span></div>
      <h1>Settings</h1>
      <p class="sub">Everything here stays on this phone.</p>
    </header>
    <section class="sheet">
      <p class="section-title">Claude API key</p>
      <form class="inline" id="key-form">
        <label class="sr-only" for="api-key">API key</label>
        <input class="input" id="api-key" type="password" placeholder="${key ? '•••••••• saved' : 'sk-ant-…'}" autocomplete="off" spellcheck="false">
        <button class="btn small">Save</button>
      </form>
      <p class="hint">Used only to recognise shoes. It's stored in this browser and sent only to Anthropic, together with the one photo being checked. Get a key at console.anthropic.com. Each photo costs about one or two US cents.
        ${key ? ' <button class="link-danger" style="padding:0;min-height:0;font-size:inherit" data-action="forget-key">Remove key</button>' : ''}</p>

      <p class="section-title">Shelf order</p>
      <p class="lede">Top shelf first. Move a type and every pair of that type follows it.</p>
      <ol class="list">
        ${state.order.map((id, i) => {
          const t = typeOf(id);
          return `<li class="order-row tone-${t.tone}">
            <span class="num">${i + 1}</span><span class="name">${esc(t.label)}</span>
            <button class="icon-btn" data-move="${id}" data-delta="-1" aria-label="Move ${esc(t.label)} up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
            <button class="icon-btn" data-move="${id}" data-delta="1" aria-label="Move ${esc(t.label)} down" ${i === state.order.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
          </li>`;
        }).join('')}
      </ol>

      <p class="section-title">Backup</p>
      <p class="lede">Save the whole rack, photos included, as one file, so you can restore it after a new phone or a cleared browser.</p>
      <div style="display:grid;gap:10px">
        <button class="btn ghost block" data-action="export">Save a backup</button>
        <button class="btn ghost block" data-action="import">Restore from backup</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
        <button class="link-danger" data-action="erase">Erase everything on this phone</button>
      </div>
    </section>`);

  view.querySelector('#key-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.target.querySelector('input').value.trim();
    if (!v) return;
    if (!v.startsWith('sk-ant-')) { toast('That doesn’t look like an Anthropic key (sk-ant-…)'); return; }
    settings.set('apiKey', v);
    toast('Key saved');
    renderSettings();
  });
  view.querySelector('[data-action="forget-key"]')?.addEventListener('click', () => {
    settings.remove('apiKey');
    toast('Key removed');
    renderSettings();
  });
  view.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => {
    state.order = moveShelf(state.order, b.dataset.move, Number(b.dataset.delta));
    saveOrder();
    renderSettings();
    view.querySelector(`[data-move="${b.dataset.move}"][data-delta="${b.dataset.delta}"]:not(:disabled)`)?.focus();
  }));
  view.querySelector('[data-action="export"]').addEventListener('click', exportBackup);
  const file = view.querySelector('#import-file');
  view.querySelector('[data-action="import"]').addEventListener('click', () => file.click());
  file.addEventListener('change', () => file.files?.[0] && importBackup(file.files[0]));
  view.querySelector('[data-action="erase"]').addEventListener('click', eraseAll);
}

function exportBackup() {
  const data = { app: 'shoe-rack', version: 1, exportedAt: new Date().toISOString(), family: state.family, order: state.order, pairs: state.pairs };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shoe-rack-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('That file isn’t a Shoe Rack backup.');
    return;
  }
  if (data?.app !== 'shoe-rack' || !Array.isArray(data.pairs)) { toast('That file isn’t a Shoe Rack backup.'); return; }
  const ok = await confirmDialog({
    title: 'Replace this rack?',
    body: `The backup has ${data.pairs.length} pairs. What's on this phone now will be replaced.`,
    confirm: 'Replace',
  });
  if (!ok) return;
  const clean = data.pairs
    .filter((p) => p && typeof p.id === 'string')
    .map((p) => ({
      id: p.id,
      photo: typeof p.photo === 'string' && p.photo.startsWith('data:image/') ? p.photo : '',
      type: cleanRecognition({ type: p.type }).type,
      colour: COLOURS.includes(p.colour) ? p.colour : '',
      brand: String(p.brand ?? '').slice(0, 40),
      name: String(p.name ?? '').slice(0, 60),
      owner: typeof p.owner === 'string' ? p.owner : '',
      daily: Boolean(p.daily),
      createdAt: Number(p.createdAt) || Date.now(),
      updatedAt: Date.now(),
    }));
  await pairStore.clear();
  for (const p of clean) await pairStore.put(p);
  state.pairs = clean;
  state.family = (Array.isArray(data.family) ? data.family : [])
    .filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string')
    .map((m, i) => ({ id: m.id, name: m.name.slice(0, 24), tone: MEMBER_TONES.includes(m.tone) ? m.tone : MEMBER_TONES[i % MEMBER_TONES.length] }));
  state.order = normaliseOrder(data.order);
  saveFamily();
  saveOrder();
  toast(`Restored ${clean.length} pairs`);
  go('rack');
}

async function eraseAll() {
  const ok = await confirmDialog({ title: 'Erase everything?', body: 'Every pair, photo, family member and your API key are deleted from this phone. Save a backup first if you might want them back.', confirm: 'Erase' });
  if (!ok) return;
  await pairStore.clear();
  for (const k of ['family', 'order', 'filter', 'showEmpty', 'apiKey']) settings.remove(k);
  Object.assign(state, { pairs: [], family: [], order: normaliseOrder([]), filter: 'all', showEmpty: true, draft: null, check: null });
  toast('Erased');
  go('rack');
}

// ---------- shared ----------

function bindGo() {
  view.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    go(el.dataset.go);
  }));
}

async function start() {
  state.pairs = await pairStore.all();
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

start();
