import { outgrown, sizeCheckDue } from '../rack.js';
import { newId, settings } from '../store.js';
import { esc, icon, toast, confirmDialog, MEMBER_TONES } from '../ui.js';
import { state, paint, on, save, avatar } from '../shared.js';

let open = '';

export function renderFamily() {
  const count = (id) => state.pairs.filter((p) => p.owner === id).length;
  const unowned = state.pairs.filter((p) => !state.family.some((m) => m.id === p.owner)).length;
  const small = outgrown(state.pairs, state.family);
  const due = new Set(sizeCheckDue(state.family).map((m) => m.id));

  paint(`
    <div class="form-screen">
      <header class="form-head">
        <button class="back" data-go="rack">${icon('back')} Rack</button>
        <h1>Family</h1>
        <p class="head-sub">Everyone who keeps shoes on the rack.</p>
      </header>
      <section class="form-body">
        <ul class="list">
          ${state.family.map((m) => {
            const tooSmall = small.filter((x) => x.member.id === m.id).length;
            const desc = [
              `${count(m.id)} ${count(m.id) === 1 ? 'pair' : 'pairs'}`,
              m.size ? `size ${m.size}` : '',
              m.kid ? 'child' : '',
              tooSmall ? `<span class="bad">${tooSmall} outgrown</span>` : '',
              due.has(m.id) ? '<span class="bad">measure feet</span>' : '',
            ].filter(Boolean).join(' · ');
            return `
            <li class="member ${open === m.id ? 'open' : ''}">
              <button class="row" data-open="${esc(m.id)}" aria-expanded="${open === m.id}">
                ${avatar(m, '')}
                <span class="body"><span class="title">${esc(m.name)}</span><span class="desc">${desc}</span></span>
                <span class="end">${icon(open === m.id ? 'up' : 'down')}</span>
              </button>
              ${open === m.id ? `
                <form class="member-edit" data-member="${esc(m.id)}">
                  <div class="field two" style="margin:0">
                    <div>
                      <label class="label" for="size-${esc(m.id)}">Shoe size <span class="muted">(${esc(state.sizeSystem)})</span></label>
                      <input class="input" id="size-${esc(m.id)}" name="size" value="${esc(m.size)}" inputmode="decimal" maxlength="12" placeholder="e.g. 32">
                    </div>
                    <div class="switch-field">
                      <span class="label" id="kid-${esc(m.id)}">Child</span>
                      <button type="button" class="switch" role="switch" aria-checked="${m.kid}" aria-labelledby="kid-${esc(m.id)}" data-kid="${esc(m.id)}"></button>
                    </div>
                  </div>
                  <p class="hint">For children the app flags pairs smaller than their size, and reminds you to measure every four months.</p>
                  <div class="inline" style="margin-top:12px">
                    <button class="btn small">Save</button>
                    <button type="button" class="link-danger" data-remove="${esc(m.id)}">Remove ${esc(m.name)}</button>
                  </div>
                </form>` : ''}
            </li>`;
          }).join('')}
        </ul>
        ${unowned && state.family.length ? `<p class="hint">${unowned} ${unowned === 1 ? 'pair has' : 'pairs have'} no owner yet — open one from the rack to set it.</p>` : ''}
        <p class="section-title">Add someone</p>
        <form class="inline" id="add-member">
          <label class="sr-only" for="member-name">Name</label>
          <input class="input" id="member-name" placeholder="Name" maxlength="24" autocomplete="off" required>
          <button class="btn small">Add</button>
        </form>
      </section>
    </div>`, { keepScroll: true });

  on('#add-member', 'submit', (e) => {
    e.preventDefault();
    const name = e.target.querySelector('input').value.trim();
    if (!name) return;
    const m = { id: newId(), name, tone: MEMBER_TONES[state.family.length % MEMBER_TONES.length], kid: false, size: '', sizeAt: 0 };
    state.family.push(m);
    save.family();
    open = m.id;
    renderFamily();
  });
  on('[data-open]', 'click', (e, b) => { open = open === b.dataset.open ? '' : b.dataset.open; renderFamily(); });
  on('[data-kid]', 'click', (e, b) => {
    const m = state.family.find((x) => x.id === b.dataset.kid);
    m.kid = !m.kid;
    save.family();
    renderFamily();
  });
  on('[data-member]', 'submit', (e, f) => {
    e.preventDefault();
    const m = state.family.find((x) => x.id === f.dataset.member);
    const size = f.querySelector('[name="size"]').value.trim();
    if (size !== m.size) {
      m.size = size;
      m.sizeAt = Date.now();
    } else if (size) {
      m.sizeAt = Date.now(); // re-measured, same size
    }
    save.family();
    open = '';
    toast('Saved');
    renderFamily();
  });
  on('[data-remove]', 'click', async (e, b) => {
    const m = state.family.find((x) => x.id === b.dataset.remove);
    const n = count(m.id);
    const ok = await confirmDialog({
      title: `Remove ${m.name}?`,
      body: n ? `Their ${n} ${n === 1 ? 'pair stays' : 'pairs stay'} on the rack without an owner.` : 'They have no pairs on the rack.',
      confirm: 'Remove',
    });
    if (!ok) return;
    state.family = state.family.filter((x) => x.id !== m.id);
    if (state.filter === m.id) { state.filter = 'all'; settings.set('filter', 'all'); }
    save.family();
    renderFamily();
  });
}
