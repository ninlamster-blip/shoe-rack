import {
  TYPES, COLOURS, CONDITIONS, DAY, typeOf, cleanRecognition, logWear, undoWear, wornToday, wearsSince, lastWorn,
  homeShelf,
} from '../rack.js';
import { newId } from '../store.js';
import { shrink, base64Of } from '../image.js';
import { recognisePair } from '../ai.js';
import { esc, icon, toast, confirmDialog, COLOUR_HEX } from '../ui.js';
import {
  state, paint, on, go, save, apiKey, avatar, pickPhoto, cameraInput, libraryInput, whereIs, working, aiError, persist,
} from '../shared.js';

export function newDraft() {
  return {
    id: newId(),
    isNew: true,
    photo: '',
    type: '',
    colour: '',
    brand: '',
    name: '',
    size: '',
    condition: '',
    careTip: '',
    owner: state.filter !== 'all' ? state.filter : state.family.length === 1 ? state.family[0].id : '',
    daily: false,
    wears: [],
    createdAt: Date.now(),
    ai: { status: 'idle' },
    touched: new Set(),
  };
}

export function editDraft(p) {
  return { careTip: '', size: '', condition: '', wears: [], ...p, isNew: false, ai: { status: 'idle' }, touched: new Set() };
}

function aiStatus(ai) {
  if (ai.status === 'working') return working('Looking at your photo…');
  if (ai.status === 'done') return `<div class="status done" role="status">${icon('sparkle')}<span>${esc(ai.message)}</span></div>`;
  if (ai.status === 'error') return aiError(ai.error, 'retry-ai');
  return '';
}

function ago(t) {
  if (!t) return 'never logged';
  const d = Math.floor((Date.now() - t) / DAY);
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

export function renderPair(draft, opts) {
  state.draft = draft;
  const d = draft;
  const t = d.type ? typeOf(d.type) : null;
  const shelf = t ? whereIs({ ...d, type: d.type }) : null;
  const home = t ? homeShelf(state.plan, t.id) : null;

  const photo = d.photo
    ? `<div class="photo"><img src="${d.photo}" alt="Photo of this pair"><button type="button" class="retake" data-action="camera">${icon('camera')} ${d.isNew ? 'Retake' : 'New photo'}</button></div>`
    : `<div class="capture">
         <button type="button" class="shoot" data-action="camera">${icon('camera')} Take a photo</button>
         <button type="button" class="library" data-action="library">${icon('image')} Library</button>
       </div>`;

  const goes = t
    ? shelf
      ? `<div class="goes tone-${t.tone}"><span class="num">${shelf}</span><span>Goes on <b>Shelf ${shelf}</b>${shelf !== home ? ` (Shelf ${home} is full)` : ` with the ${esc(t.label.toLowerCase())}`}</span></div>`
      : `<button type="button" class="goes warn" data-go="plan"><span class="num">!</span><span><b>No room</b> for ${esc(t.label.toLowerCase())} — the shelves are full. Plan shelves ›</span></button>`
    : '';

  const wear = d.isNew ? '' : `
    <div class="field">
      <span class="label">Wear &amp; care</span>
      <div class="card stack">
        <div class="wear-row">
          <div><b>${wearsSince(d, Date.now() - 30 * DAY)}</b> wears this month<div class="hint" style="margin:2px 0 0">Last worn ${ago(lastWorn(d))}</div></div>
          <button type="button" class="chip ${wornToday(d) ? '' : 'solid'}" data-action="wear" aria-pressed="${wornToday(d)}">${icon('foot')} ${wornToday(d) ? 'Worn today ✓' : 'Wore today'}</button>
        </div>
        <div class="wear-row">
          <div>Cleaned ${ago(d.cleanedAt)}</div>
          <button type="button" class="chip" data-action="cleaned">${icon('drop')} Cleaned it</button>
        </div>
      </div>
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

        ${goes}

        <div class="field">
          <span class="label" id="colour-label">Colour</span>
          <div class="swatches" role="group" aria-labelledby="colour-label">
            ${COLOURS.map((c) => `<button type="button" class="swatch" data-colour="${c}" aria-pressed="${d.colour === c}" aria-label="${c}" title="${c}" style="background:${COLOUR_HEX[c]}"></button>`).join('')}
          </div>
        </div>

        <div class="field">
          <label class="label" for="name">Name</label>
          <input class="input" id="name" value="${esc(d.name)}" placeholder="e.g. White leather low-tops" autocomplete="off" maxlength="60">
        </div>

        <div class="field two">
          <div>
            <label class="label" for="brand">Brand</label>
            <input class="input" id="brand" value="${esc(d.brand)}" placeholder="Optional" autocomplete="off" maxlength="40">
          </div>
          <div>
            <label class="label" for="size">Size <span class="muted">(${esc(state.sizeSystem)})</span></label>
            <input class="input" id="size" value="${esc(d.size)}" placeholder="e.g. 38" inputmode="decimal" autocomplete="off" maxlength="12">
          </div>
        </div>

        <div class="field">
          <span class="label" id="owner-label">Whose?</span>
          ${state.family.length
            ? `<div class="owners" role="group" aria-labelledby="owner-label">
                ${state.family.map((m) => `<button type="button" class="chip" data-owner="${esc(m.id)}" aria-pressed="${d.owner === m.id}">${avatar(m, 'xs')}${esc(m.name)}</button>`).join('')}
              </div>`
            : `<p class="hint">Add your family in the Family screen to give every pair an owner.</p>`}
        </div>

        <div class="field">
          <span class="label" id="cond-label">Condition</span>
          <div class="owners" role="group" aria-labelledby="cond-label">
            ${Object.entries(CONDITIONS).map(([id, label]) => `<button type="button" class="chip" data-condition="${id}" aria-pressed="${d.condition === id}">${esc(label)}</button>`).join('')}
          </div>
          ${d.careTip ? `<p class="tip">${icon('drop')}<span>${esc(d.careTip)}</span></p>` : ''}
        </div>

        ${wear}

        ${!d.isNew && d.type ? `<button type="button" class="btn ghost block" style="margin-bottom:26px" data-go="style/${d.id}">${icon('hanger')} What to wear with these</button>` : ''}

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

  const again = () => renderPair(d, { keepScroll: true });
  const form = view().querySelector('form');
  form.addEventListener('submit', (e) => { e.preventDefault(); savePair(d); });
  for (const f of ['name', 'brand', 'size']) {
    form.querySelector(`#${f}`).addEventListener('input', (e) => { d[f] = e.target.value; d.touched.add(f); });
  }
  on('[data-type]', 'click', (e, b) => { d.type = b.dataset.type; d.touched.add('type'); again(); });
  on('[data-colour]', 'click', (e, b) => { d.colour = d.colour === b.dataset.colour ? '' : b.dataset.colour; d.touched.add('colour'); again(); });
  on('[data-owner]', 'click', (e, b) => { d.owner = d.owner === b.dataset.owner ? '' : b.dataset.owner; again(); });
  on('[data-condition]', 'click', (e, b) => { d.condition = d.condition === b.dataset.condition ? '' : b.dataset.condition; d.touched.add('condition'); again(); });
  on('[data-action="daily"]', 'click', () => { d.daily = !d.daily; again(); });
  on('[data-action="camera"]', 'click', () => pickPhoto(cameraInput, (f) => onPhoto(d, f)));
  on('[data-action="library"]', 'click', () => pickPhoto(libraryInput, (f) => onPhoto(d, f)));
  on('[data-action="retry-ai"]', 'click', () => recognise(d));
  on('[data-action="delete"]', 'click', () => deletePair(d));
  // Wear and clean are logged the moment they're tapped — they shouldn't
  // wait on Save, or be lost by leaving without it.
  const stored = () => state.pairs.find((p) => p.id === d.id);
  on('[data-action="wear"]', 'click', async () => {
    const base = stored();
    const next = wornToday(base) ? undoWear(base) : logWear(base);
    if (await persist(next, wornToday(next) ? 'Logged as worn today' : 'Unmarked')) {
      d.wears = next.wears;
      again();
    }
  });
  on('[data-action="cleaned"]', 'click', async () => {
    const base = stored();
    const next = { ...base, cleanedAt: Date.now(), condition: base.condition === 'dirty' ? 'good' : base.condition };
    if (await persist(next, 'Marked as cleaned')) {
      d.cleanedAt = next.cleanedAt;
      if (!d.touched.has('condition')) d.condition = next.condition;
      again();
    }
  });
  on('[data-action="leave"]', 'click', () => (history.length > 1 ? history.back() : go('rack')));
}

const view = () => document.getElementById('view');

async function onPhoto(d, file) {
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
  renderPair(d, { keepScroll: true });
  let ai;
  try {
    const r = cleanRecognition(await recognisePair(apiKey(), base64Of(d.photo)));
    if (!r.isShoe) {
      ai = { status: 'error', error: { kind: 'not-shoe', message: "This doesn't look like a shoe. Choose the type yourself if it is." } };
    } else {
      // Claude fills only what you haven't already chosen yourself. On an
      // existing pair a new photo only updates its condition.
      const fill = (key, value) => { if (value && (d.isNew || key === 'condition' || key === 'careTip') && !d.touched.has(key)) d[key] = value; };
      if (d.isNew && !d.touched.has('type')) d.type = r.type;
      fill('colour', r.colour);
      fill('name', r.name);
      fill('brand', r.brand);
      fill('size', r.size);
      fill('condition', r.condition);
      fill('careTip', r.careTip);
      const what = `${r.colour ? `${r.colour} ` : ''}${typeOf(r.type).label.toLowerCase()}${r.brand ? ` by ${r.brand}` : ''}`;
      const cond = r.condition && r.condition !== 'good' ? ` Condition: ${CONDITIONS[r.condition].toLowerCase()}.` : '';
      ai = {
        status: 'done',
        message: d.isNew
          ? r.confidence === 'low'
            ? `Best guess: ${what}. Not sure — please check the type.${cond}`
            : `Looks like ${what}.${cond} Change anything that's off.`
          : `Condition updated: ${CONDITIONS[r.condition]?.toLowerCase() ?? 'unclear'}.`,
      };
    }
  } catch (err) {
    ai = { status: 'error', error: err };
  }
  if (state.draft !== d) return; // left the screen while Claude was looking
  d.ai = ai;
  renderPair(d, { keepScroll: true });
}

async function savePair(d) {
  if (!d.type) return;
  const pair = {
    id: d.id, photo: d.photo, type: d.type, colour: d.colour,
    brand: d.brand.trim(), name: d.name.trim(), size: d.size.trim(), owner: d.owner, daily: d.daily,
    condition: d.condition, careTip: d.careTip, conditionAt: d.touched.has('condition') || d.ai.status === 'done' ? Date.now() : d.conditionAt,
    wears: d.wears ?? [], cleanedAt: d.cleanedAt, createdAt: d.createdAt, updatedAt: Date.now(),
  };
  const shelf = whereIs(pair);
  if (!(await persist(pair, shelf ? `Saved — put it on Shelf ${shelf}` : 'Saved — but the rack is full. See Plan shelves.'))) return;
  state.draft = null;
  go('rack');
}

async function deletePair(d) {
  const ok = await confirmDialog({ title: 'Remove this pair?', body: 'It comes off the rack and its photo is deleted from this phone.', confirm: 'Remove' });
  if (!ok) return;
  await save.removePair(d.id);
  state.draft = null;
  toast('Removed');
  go('rack');
}
