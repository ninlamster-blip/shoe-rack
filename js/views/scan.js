import { TYPES, cleanScan, likelyDuplicate, typeOf, CONDITIONS } from '../rack.js';
import { newId } from '../store.js';
import { shrink, crop, base64Of } from '../image.js';
import { scanRack } from '../ai.js';
import { esc, icon, toast } from '../ui.js';
import {
  state, paint, on, go, apiKey, save, pickPhoto, cameraInput, libraryInput, working, aiError, pairLabel, layout,
} from '../shared.js';

// One photo of the whole rack → every pair found, each cut out of the photo,
// for you to review before anything is saved. Pairs that look like ones
// already on the rack start unticked, so a second scan doesn't double up.
export function renderScan() {
  const s = (state.scan ??= { photo: '', status: 'idle', items: [], owner: '' });

  let body = '';
  if (s.status === 'working') body = working('Finding every pair… a full rack can take half a minute.');
  else if (s.status === 'error') body = aiError(s.error, 'retry');
  else if (s.status === 'done') body = results(s);

  paint(`
    <div class="form-screen">
      <header class="form-head">
        <button class="back" data-go="rack">${icon('close')} Back</button>
        <h1>Scan the Rack</h1>
        <p class="head-sub">One photo adds every pair at once.</p>
      </header>
      <section class="form-body">
        ${s.photo
          ? `<div class="photo"><img src="${s.photo}" alt="Photo of the rack"><button class="retake" data-action="camera">${icon('camera')} Retake</button></div>`
          : `<ul class="tips">
               <li>${icon('check')} Step back until the whole rack is in the frame</li>
               <li>${icon('check')} Good light, no flash glare</li>
               <li>${icon('check')} A big rack? Do it one or two shelves at a time</li>
             </ul>
             <div class="capture">
               <button class="shoot" data-action="camera">${icon('camera')} Photograph the rack</button>
               <button class="library" data-action="library">${icon('image')} Library</button>
             </div>`}
        <div style="margin-top:14px">${body}</div>
      </section>
    </div>`, { keepScroll: s.status === 'done' });

  on('[data-action="camera"]', 'click', () => pickPhoto(cameraInput, onPhoto));
  on('[data-action="library"]', 'click', () => pickPhoto(libraryInput, onPhoto));
  on('[data-action="retry"]', 'click', run);
  on('[data-include]', 'change', (e, el) => { s.items[el.dataset.include].include = el.checked; renderScan(); });
  on('[data-item-type]', 'change', (e, el) => { s.items[el.dataset.itemType].type = el.value; });
  on('[data-item-owner]', 'change', (e, el) => { s.items[el.dataset.itemOwner].owner = el.value; });
  on('[data-all-owner]', 'change', (e, el) => {
    s.owner = el.value;
    for (const it of s.items) it.owner = el.value;
    renderScan();
  });
  on('[data-action="save"]', 'click', saveAll);
}

function results(s) {
  const chosen = s.items.filter((i) => i.include).length;
  const dupes = s.items.filter((i) => i.dupe).length;
  if (!s.items.length) {
    return `<div class="verdict move">${icon('alert')}<span>No shoes spotted. Try closer, or with more light.</span></div>`;
  }
  const ownerOptions = (selected) =>
    `<option value="">No owner</option>${state.family.map((m) => `<option value="${esc(m.id)}" ${selected === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}`;
  return `
    <div class="verdict ok">${icon('sparkle')}<span>Found ${s.items.length} ${s.items.length === 1 ? 'pair' : 'pairs'}${dupes ? ` · ${dupes} already on the rack` : ''}</span></div>
    ${state.family.length ? `<label class="label" for="all-owner">Whose are these?</label>
      <select class="input" id="all-owner" data-all-owner style="margin-bottom:16px">${ownerOptions(s.owner)}</select>` : ''}
    <ul class="list">
      ${s.items.map((it, i) => `
        <li class="scan-item ${it.include ? '' : 'off'}">
          <label class="scan-top">
            <input type="checkbox" data-include="${i}" ${it.include ? 'checked' : ''} aria-label="Add ${esc(it.name)}">
            ${it.photo ? `<img src="${it.photo}" alt="">` : `<span class="thumb-blank tone-${typeOf(it.type).tone}">${icon('shoe')}</span>`}
            <span class="body">
              <span class="title">${esc(it.name || `${it.colour} ${typeOf(it.type).label.toLowerCase()}`)}</span>
              <span class="desc">${it.dupe ? `Looks like <b>${esc(pairLabel(it.dupe))}</b>, already saved` : it.condition && it.condition !== 'good' ? esc(CONDITIONS[it.condition]) : esc(it.colour)}</span>
            </span>
          </label>
          ${it.include ? `<div class="scan-edit">
            <select class="input" data-item-type="${i}" aria-label="Type">${TYPES.map((t) => `<option value="${t.id}" ${t.id === it.type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
            ${state.family.length ? `<select class="input" data-item-owner="${i}" aria-label="Owner">${ownerOptions(it.owner)}</select>` : ''}
          </div>` : ''}
        </li>`).join('')}
    </ul>
    <button class="btn block" style="margin-top:20px" data-action="save" ${chosen ? '' : 'disabled'}>${icon('plus')} Add ${chosen} ${chosen === 1 ? 'pair' : 'pairs'}</button>
    <p class="hint" style="text-align:center">You can fix any detail later by opening the pair.</p>`;
}

async function onPhoto(file) {
  try {
    state.scan.photo = await shrink(file, 1600, 0.85);
  } catch {
    toast("That photo couldn't be opened. Try another.");
    return;
  }
  run();
}

async function run() {
  const s = state.scan;
  s.status = 'working';
  renderScan();
  try {
    const found = cleanScan(await scanRack(apiKey(), base64Of(s.photo)));
    s.items = await Promise.all(found.map(async (f) => {
      const dupe = likelyDuplicate(f, state.pairs);
      let photo = '';
      if (f.box) {
        try { photo = await crop(s.photo, f.box); } catch { /* keep it without a photo */ }
      }
      return { ...f, photo, dupe, include: !dupe, owner: s.owner };
    }));
    s.status = 'done';
  } catch (err) {
    Object.assign(s, { status: 'error', error: err });
  }
  if (state.scan === s && location.hash.startsWith('#/scan')) renderScan();
}

async function saveAll() {
  const s = state.scan;
  const chosen = s.items.filter((i) => i.include);
  const now = Date.now();
  try {
    for (const [i, it] of chosen.entries()) {
      await save.pair({
        id: newId(), photo: it.photo, type: it.type, colour: it.colour, brand: it.brand, name: it.name,
        size: it.size, owner: it.owner, daily: false, condition: it.condition, careTip: it.careTip,
        conditionAt: now, wears: [], createdAt: now + i, updatedAt: now,
      });
    }
  } catch {
    toast("Couldn't save them all — the phone may be out of space.");
  }
  const left = layout().overflow.length;
  toast(`Added ${chosen.length} ${chosen.length === 1 ? 'pair' : 'pairs'}${left ? ` · ${left} don't fit` : ''}`);
  state.scan = null;
  go('rack');
}
