import { typeOf, inventory, knownIds } from '../rack.js';
import { shrink, base64Of } from '../image.js';
import { styleShoes, shoesForOutfit } from '../ai.js';
import { settings } from '../store.js';
import { esc, icon, toast } from '../ui.js';
import {
  state, paint, on, apiKey, member, memberName, avatar, pairLabel, thumb, pickPhoto, cameraInput, libraryInput,
  working, aiError, layout, go,
} from '../shared.js';

const OCCASIONS = ['Everyday', 'Work', 'School', 'Wedding', 'Eid', 'Party', 'Date night', 'Travel'];
const looks = new Map(); // pairId → { occasion, status, result, error }

const person = () => {
  const id = settings.get('styleWho', state.family[0]?.id ?? 'all');
  return id === 'all' || member(id) ? id : 'all';
};

function occasionChips(selected, attr) {
  return `<div class="owners" role="group" aria-label="Occasion">
    ${OCCASIONS.map((o) => `<button class="chip" data-${attr}="${esc(o)}" aria-pressed="${selected === o}">${esc(o)}</button>`).join('')}
  </div>`;
}

function personChips(selected) {
  if (!state.family.length) return '';
  return `<div class="owners" role="group" aria-label="Whose shoes">
    <button class="chip" data-person="all" aria-pressed="${selected === 'all'}">Everyone</button>
    ${state.family.map((m) => `<button class="chip" data-person="${esc(m.id)}" aria-pressed="${selected === m.id}">${avatar(m, 'xs')}${esc(m.name)}</button>`).join('')}
  </div>`;
}

// ---------- hub ----------

export function renderStyle() {
  const s = (state.style ??= { photo: '', occasion: '', status: 'idle' });
  const who = person();
  const pairs = state.pairs.filter((p) => (who === 'all' || p.owner === who) && p.condition !== 'replace');

  let result = '';
  if (s.status === 'working') result = working('Matching your outfit with the rack…');
  else if (s.status === 'error') result = aiError(s.error, 'retry');
  else if (s.status === 'done') result = outfitResult(s.result);

  paint(`
    <header class="top">
      <div class="top-row"><span class="count-chip">${icon('hanger')} Style</span></div>
      <h1>What goes with what?</h1>
      <p class="sub">Photograph a dress or outfit to pick the shoes, or pick shoes to get outfit ideas.</p>
    </header>
    <section class="sheet">
      <div class="panel">
        <h2>${icon('camera')} Which shoes for this outfit?</h2>
        ${personChips(who)}
        <p class="label" style="margin:16px 0 10px">Occasion <span class="muted">(optional)</span></p>
        ${occasionChips(s.occasion, 'occasion')}
        <div style="margin-top:16px">
          ${s.photo
            ? `<div class="photo"><img src="${s.photo}" alt="The outfit"><button class="retake" data-action="camera">${icon('camera')} New photo</button></div>`
            : `<div class="capture">
                 <button class="shoot" data-action="camera" ${pairs.length ? '' : 'disabled'}>${icon('hanger')} Photograph the outfit</button>
                 <button class="library" data-action="library" ${pairs.length ? '' : 'disabled'}>${icon('image')} Library</button>
               </div>
               ${pairs.length ? '' : '<p class="hint">Add some shoes first — there’s nothing to choose from yet.</p>'}`}
        </div>
        <div style="margin-top:14px">${result}</div>
      </div>

      <div class="panel">
        <h2>${icon('sparkle')} Outfit ideas for a pair</h2>
        ${pairs.length
          ? `<div class="tiles">${pairs.slice(0, 18).map((p) => `
              <button class="tile" data-go="style/${p.id}">${thumb(p)}<span>${esc(pairLabel(p))}</span></button>`).join('')}</div>`
          : '<p class="lede">No shoes to show yet.</p>'}
      </div>
    </section>`, { keepScroll: true });

  on('[data-person]', 'click', (e, b) => { settings.set('styleWho', b.dataset.person); if (s.status === 'done') s.status = 'idle'; renderStyle(); });
  on('[data-occasion]', 'click', (e, b) => {
    s.occasion = s.occasion === b.dataset.occasion ? '' : b.dataset.occasion;
    if (s.photo) return runOutfit();
    renderStyle();
  });
  on('[data-action="camera"]', 'click', () => pickPhoto(cameraInput, onOutfitPhoto));
  on('[data-action="library"]', 'click', () => pickPhoto(libraryInput, onOutfitPhoto));
  on('[data-action="retry"]', 'click', runOutfit);
}

function outfitResult(r) {
  const card = (id, why, label) => {
    const p = state.pairs.find((x) => x.id === id);
    if (!p) return '';
    return `<li class="pick ${label ? 'best' : ''}">
      <button class="row" data-go="pair/${p.id}">${thumb(p)}
        <span class="body">${label ? `<span class="tag">${label}</span>` : ''}<span class="title">${esc(pairLabel(p))}</span>
        <span class="desc">${esc(why)}</span></span></button></li>`;
  };
  const cards = [
    r.pick ? card(r.pick.pair_id, r.pick.why, 'Best match') : '',
    ...r.alternatives.map((a) => card(a.pair_id, a.why)),
  ].filter(Boolean);
  return `
    ${r.outfit ? `<p class="lede">For: ${esc(r.outfit)}</p>` : ''}
    ${cards.length ? `<ul class="list">${cards.join('')}</ul>` : ''}
    ${r.missing ? `<div class="notice">${icon('bulb')}<span>${cards.length ? 'Even better: ' : 'Nothing on the rack really suits it. '}${esc(r.missing)}</span></div>` : ''}`;
}

async function onOutfitPhoto(file) {
  try {
    state.style.photo = await shrink(file);
  } catch {
    toast("That photo couldn't be opened. Try another.");
    return;
  }
  runOutfit();
}

async function runOutfit() {
  const s = state.style;
  const who = person();
  const pairs = state.pairs.filter((p) => (who === 'all' || p.owner === who) && p.condition !== 'replace');
  // Candidates go as text, without owners: the model needs to know what the
  // shoes are, not whose they are.
  const candidates = inventory(pairs, state.family, layout().shelfOf).map(({ owner, ...rest }) => rest);
  s.status = 'working';
  renderStyle();
  try {
    const raw = await shoesForOutfit(apiKey(), base64Of(s.photo), s.occasion, candidates);
    const ids = new Set(knownIds([raw?.pick?.pair_id, ...(raw?.alternatives ?? []).map((a) => a?.pair_id)], pairs));
    // Each pair appears once: the model sometimes repeats its pick as an alternative.
    const clean = (x) => {
      if (!x || !ids.has(x.pair_id)) return null;
      ids.delete(x.pair_id);
      return { pair_id: x.pair_id, why: String(x.why ?? '').slice(0, 200) };
    };
    s.result = {
      outfit: String(raw?.outfit ?? '').slice(0, 120),
      pick: clean(raw?.pick),
      alternatives: (Array.isArray(raw?.alternatives) ? raw.alternatives : []).map(clean).filter(Boolean).slice(0, 2),
      missing: String(raw?.missing ?? '').slice(0, 200),
    };
    s.status = 'done';
  } catch (err) {
    Object.assign(s, { status: 'error', error: err });
  }
  if (state.style === s && location.hash.startsWith('#/style')) renderStyle();
}

// ---------- ideas for one pair ----------

export function renderLooks(id) {
  const p = state.pairs.find((x) => x.id === id);
  if (!p) return go('style');
  const l = looks.get(id) ?? { occasion: '', status: 'idle' };
  looks.set(id, l);
  const t = typeOf(p.type);

  let body = '';
  if (l.status === 'working') body = working('Putting outfits together…');
  else if (l.status === 'error') body = aiError(l.error, 'run');
  else if (l.status === 'done') {
    body = `<ul class="list">${l.result.looks.map((look) => `
      <li class="look">
        <p class="title">${esc(look.title)}<span class="tag">${esc(look.occasion)}</span></p>
        <ul class="pieces">${look.pieces.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${look.colours.length ? `<p class="colours">${look.colours.map((c) => `<span>${esc(c)}</span>`).join('')}</p>` : ''}
        <p class="desc">${esc(look.why)}</p>
      </li>`).join('')}</ul>
      ${l.result.avoid ? `<div class="notice">${icon('alert')}<span>${esc(l.result.avoid)}</span></div>` : ''}`;
  }

  paint(`
    <div class="form-screen tone-${t.tone}" style="background:var(--tone)">
      <header class="form-head">
        <button class="back" data-action="leave">${icon('back')} Back</button>
        <h1>Style It</h1>
        <p class="head-sub">${esc(pairLabel(p))}${memberName(p.owner) ? ` · ${esc(memberName(p.owner))}` : ''}</p>
      </header>
      <section class="form-body">
        ${p.photo ? `<div class="photo small"><img src="${p.photo}" alt=""></div>` : ''}
        <p class="section-title">Occasion <span class="muted">(optional)</span></p>
        ${occasionChips(l.occasion, 'look-occasion')}
        <button class="btn block" style="margin:18px 0" data-action="run" ${l.status === 'working' ? 'disabled' : ''}>${icon('sparkle')} ${l.status === 'done' ? 'New ideas' : 'Suggest outfits'}</button>
        ${body}
      </section>
    </div>`, { keepScroll: l.status !== 'idle' });

  const run = async () => {
    l.status = 'working';
    renderLooks(id);
    try {
      const raw = await styleShoes(apiKey(), p.photo ? base64Of(p.photo) : '', p, l.occasion);
      const text = (v, n) => String(v ?? '').slice(0, n);
      const strings = (a, n) => (Array.isArray(a) ? a : []).map((x) => text(x, 60)).filter(Boolean).slice(0, n);
      l.result = {
        looks: (Array.isArray(raw?.looks) ? raw.looks : []).slice(0, 3).map((x) => ({
          title: text(x?.title, 60), occasion: text(x?.occasion, 30), why: text(x?.why, 200),
          pieces: strings(x?.pieces, 6), colours: strings(x?.colours, 5),
        })),
        avoid: text(raw?.avoid, 160),
      };
      l.status = 'done';
    } catch (err) {
      Object.assign(l, { status: 'error', error: err });
    }
    if (location.hash === `#/style/${id}`) renderLooks(id);
  };
  on('[data-look-occasion]', 'click', (e, b) => { l.occasion = l.occasion === b.dataset.lookOccasion ? '' : b.dataset.lookOccasion; renderLooks(id); });
  on('[data-action="run"]', 'click', run);
  on('[data-action="leave"]', 'click', () => (history.length > 1 ? history.back() : go('style')));
}
