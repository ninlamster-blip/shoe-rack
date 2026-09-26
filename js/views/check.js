import { typeOf, tidyReport } from '../rack.js';
import { shrink, base64Of } from '../image.js';
import { readShelf } from '../ai.js';
import { esc, icon, toast } from '../ui.js';
import { state, paint, on, apiKey, pickPhoto, cameraInput, libraryInput, working, aiError, shelfName } from '../shared.js';

export function renderCheck(preset) {
  const c = (state.check ??= { shelf: 0, photo: '', status: 'idle' });
  const n = Number(preset);
  if (n >= 1 && n <= state.plan.shelves.length) c.shelf = n;
  if (c.shelf > state.plan.shelves.length) c.shelf = 0;
  const types = c.shelf ? state.plan.shelves[c.shelf - 1] : null;

  let result = '';
  if (c.status === 'working') result = working('Checking the shelf…');
  else if (c.status === 'error') result = aiError(c.error, 'retry');
  else if (c.status === 'done') {
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
    <div class="form-screen">
      <header class="form-head">
        <button class="back" data-go="rack">${icon('close')} Back</button>
        <h1>Tidy Check</h1>
        <p class="head-sub">Photograph one shelf and Claude points out any pair on the wrong one.</p>
      </header>
      <section class="form-body">
        <p class="section-title">Which shelf?</p>
        <div class="types shelves" role="group" aria-label="Shelf">
          ${state.plan.shelves.map((t, i) => `<button class="type" data-shelf="${i + 1}" aria-pressed="${c.shelf === i + 1}">${i + 1} · ${esc(shelfName(t))}</button>`).join('')}
        </div>
        <p class="section-title">Photo of the shelf</p>
        ${c.photo
          ? `<div class="photo"><img src="${c.photo}" alt="Photo of the shelf"><button class="retake" data-action="shoot">${icon('camera')} Retake</button></div>`
          : `<div class="capture">
               <button class="shoot" data-action="shoot" ${types ? '' : 'disabled'}>${icon('camera')} ${types ? `Photograph Shelf ${c.shelf}` : 'Choose a shelf first'}</button>
               <button class="library" data-action="library" ${types ? '' : 'disabled'}>${icon('image')} Library</button>
             </div>`}
        <div style="margin-top:14px">${result}</div>
      </section>
    </div>`, { keepScroll: c.status !== 'idle' });

  on('[data-shelf]', 'click', (e, b) => {
    c.shelf = Number(b.dataset.shelf);
    if (c.photo) return run();
    renderCheck();
  });
  on('[data-action="shoot"]', 'click', () => pickPhoto(cameraInput, onPhoto));
  on('[data-action="library"]', 'click', () => pickPhoto(libraryInput, onPhoto));
  on('[data-action="retry"]', 'click', run);
  on('[data-action="again"]', 'click', () => { state.check = null; renderCheck(); });
}

async function onPhoto(file) {
  try {
    state.check.photo = await shrink(file, 1400);
  } catch {
    toast("That photo couldn't be opened. Try another.");
    return;
  }
  run();
}

async function run() {
  const c = state.check;
  if (!c?.photo || !c.shelf) return renderCheck();
  c.status = 'working';
  renderCheck();
  try {
    const raw = await readShelf(apiKey(), base64Of(c.photo));
    Object.assign(c, { status: 'done', report: tidyReport(raw?.pairs, state.plan.shelves[c.shelf - 1], state.plan) });
  } catch (err) {
    Object.assign(c, { status: 'error', error: err });
  }
  if (state.check === c && location.hash.startsWith('#/check')) renderCheck();
}
