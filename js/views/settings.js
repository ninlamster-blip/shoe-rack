import { COLOURS, CONDITIONS, TYPE_IDS, normalisePlan, defaultPlan } from '../rack.js';
import { settings, pairs as pairStore } from '../store.js';
import { icon, toast, confirmDialog, MEMBER_TONES } from '../ui.js';
import { state, paint, on, go, apiKey, save, normaliseMember } from '../shared.js';

const SYSTEMS = ['EU', 'UK', 'US'];

export function renderSettings() {
  const key = apiKey();
  paint(`
    <div class="form-screen">
      <header class="form-head">
        <button class="back" data-go="rack">${icon('back')} Rack</button>
        <h1>Settings</h1>
        <p class="head-sub">Everything here stays on this phone.</p>
      </header>
      <section class="form-body">
        <p class="section-title">Claude API key</p>
        <form class="inline" id="key-form">
          <label class="sr-only" for="api-key">API key</label>
          <input class="input" id="api-key" type="password" placeholder="${key ? '•••••••• saved' : 'sk-ant-…'}" autocomplete="off" spellcheck="false">
          <button class="btn small">Save</button>
        </form>
        <p class="hint">Stored in this browser and sent only to Anthropic. Recognising, scanning and checking send one photo; Style sends the outfit or shoe photo; Ask sends text only. Get a key at console.anthropic.com.
          ${key ? ' <button class="link-danger" style="padding:0;min-height:0;font-size:inherit" data-action="forget-key">Remove key</button>' : ''}</p>

        <p class="section-title">Shelves</p>
        <button class="row" data-go="plan">${icon('grid')}
          <span class="body"><span class="title">Plan shelves</span>
          <span class="desc">${state.plan.shelves.length} shelves${state.plan.capacity ? ` · ${state.plan.capacity} pairs each` : ' · no limit'}</span></span>
          <span class="end">${icon('chevron')}</span></button>

        <p class="section-title">Shoe sizes</p>
        <div class="owners" role="group" aria-label="Size system">
          ${SYSTEMS.map((s) => `<button class="chip" data-system="${s}" aria-pressed="${state.sizeSystem === s}">${s}</button>`).join('')}
        </div>
        <p class="hint">Use one system for the whole family so sizes compare properly.</p>

        <p class="section-title">Backup</p>
        <p class="lede">Save the whole rack — photos, wear history, family and layout — as one file, so you can restore it on a new phone.</p>
        <div style="display:grid;gap:10px">
          <button class="btn ghost block" data-action="export">Save a backup</button>
          <button class="btn ghost block" data-action="import">Restore from backup</button>
          <input type="file" id="import-file" accept="application/json,.json" hidden>
          <button class="link-danger" data-action="erase">Erase everything on this phone</button>
        </div>
      </section>
    </div>`);

  on('#key-form', 'submit', (e) => {
    e.preventDefault();
    const v = e.target.querySelector('input').value.trim();
    if (!v) return;
    if (!v.startsWith('sk-ant-')) return toast('That doesn’t look like an Anthropic key (sk-ant-…)');
    settings.set('apiKey', v);
    toast('Key saved');
    renderSettings();
  });
  on('[data-action="forget-key"]', 'click', () => { settings.remove('apiKey'); toast('Key removed'); renderSettings(); });
  on('[data-system]', 'click', (e, b) => { state.sizeSystem = b.dataset.system; settings.set('sizeSystem', state.sizeSystem); renderSettings(); });
  on('[data-action="export"]', 'click', exportBackup);
  const file = document.getElementById('import-file');
  on('[data-action="import"]', 'click', () => file.click());
  file.addEventListener('change', () => file.files?.[0] && importBackup(file.files[0]));
  on('[data-action="erase"]', 'click', eraseAll);
}

function exportBackup() {
  const data = {
    app: 'shoe-rack', version: 2, exportedAt: new Date().toISOString(),
    family: state.family, plan: state.plan, rack: settings.get('rack', null), sizeSystem: state.sizeSystem, pairs: state.pairs,
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shoe-rack-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const nums = (a) => (Array.isArray(a) ? a.map(Number).filter(Number.isFinite).slice(-120) : []);
const num = (v) => (Number.isFinite(Number(v)) && v != null ? Number(v) : undefined);

// A backup is a file from anywhere, so every field is checked on the way in.
export function cleanPair(p) {
  return {
    id: p.id,
    photo: typeof p.photo === 'string' && p.photo.startsWith('data:image/') ? p.photo : '',
    type: TYPE_IDS.includes(p.type) ? p.type : 'other',
    colour: COLOURS.includes(p.colour) ? p.colour : '',
    brand: String(p.brand ?? '').slice(0, 40),
    name: String(p.name ?? '').slice(0, 60),
    size: String(p.size ?? '').slice(0, 12),
    owner: typeof p.owner === 'string' ? p.owner : '',
    daily: Boolean(p.daily),
    condition: Object.hasOwn(CONDITIONS, p.condition) ? p.condition : '',
    careTip: String(p.careTip ?? '').slice(0, 160),
    conditionAt: num(p.conditionAt),
    wears: nums(p.wears),
    cleanedAt: num(p.cleanedAt),
    keptAt: num(p.keptAt),
    createdAt: Number(p.createdAt) || Date.now(),
    updatedAt: Date.now(),
  };
}

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toast('That file isn’t a Shoe Rack backup.');
  }
  if (data?.app !== 'shoe-rack' || !Array.isArray(data.pairs)) return toast('That file isn’t a Shoe Rack backup.');
  const ok = await confirmDialog({
    title: 'Replace this rack?',
    body: `The backup has ${data.pairs.length} pairs. What's on this phone now will be replaced.`,
    confirm: 'Replace',
  });
  if (!ok) return;
  const clean = data.pairs.filter((p) => p && typeof p.id === 'string').map(cleanPair);
  await pairStore.clear();
  for (const p of clean) await pairStore.put(p);
  state.pairs = clean;
  state.family = (Array.isArray(data.family) ? data.family : [])
    .filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string')
    .map((m, i) => normaliseMember({ ...m, tone: MEMBER_TONES.includes(m.tone) ? m.tone : MEMBER_TONES[i % MEMBER_TONES.length] }));
  state.plan = data.plan ? normalisePlan(data.plan) : normalisePlan(defaultPlan(data.order)); // v1 backups have `order`
  if (SYSTEMS.includes(data.sizeSystem)) state.sizeSystem = data.sizeSystem;
  if (data.rack) settings.set('rack', data.rack);
  settings.set('sizeSystem', state.sizeSystem);
  save.family();
  save.plan();
  toast(`Restored ${clean.length} pairs`);
  go('rack');
}

async function eraseAll() {
  const ok = await confirmDialog({ title: 'Erase everything?', body: 'Every pair, photo, family member, the layout and your API key are deleted from this phone. Save a backup first if you might want them back.', confirm: 'Erase' });
  if (!ok) return;
  await pairStore.clear();
  for (const k of ['family', 'order', 'plan', 'rack', 'filter', 'showEmpty', 'apiKey', 'sizeSystem', 'insightsWho', 'styleWho']) settings.remove(k);
  Object.assign(state, {
    pairs: [], family: [], plan: normalisePlan(null), sizeSystem: 'EU', filter: 'all', showEmpty: true,
    draft: null, check: null, scan: null, style: null, chat: [],
  });
  toast('Erased');
  go('rack');
}
