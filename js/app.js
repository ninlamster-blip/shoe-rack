// Routing. Every screen lives in js/views/; this file only decides which one
// the hash asks for and keeps the bottom navigation in step.

import { pairs as pairStore } from './store.js';
import { state } from './shared.js';
import { renderRack, renderShelf } from './views/rack.js';
import { renderPair, newDraft, editDraft } from './views/pair.js';
import { renderCheck } from './views/check.js';
import { renderScan } from './views/scan.js';
import { renderInsights, renderPlan } from './views/insights.js';
import { renderStyle, renderLooks } from './views/style.js';
import { renderAsk } from './views/ask.js';
import { renderFamily } from './views/family.js';
import { renderSettings } from './views/settings.js';

const nav = document.getElementById('nav');

// Tabs show the bottom bar; everything else is a full-screen sheet.
const TABS = { rack: renderRack, insights: renderInsights, style: renderStyle, ask: renderAsk };

function route() {
  const [raw, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const name = raw || 'rack';
  const isTab = name in TABS && !(name === 'style' && arg);
  nav.hidden = !isTab;
  for (const a of nav.querySelectorAll('a[data-tab]')) {
    if (a.dataset.tab === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (state.draft && name !== 'add' && name !== 'pair') state.draft = null;

  switch (name) {
    case 'add': return renderPair(newDraft());
    case 'pair': {
      const p = state.pairs.find((x) => x.id === arg);
      return p ? renderPair(editDraft(p)) : renderRack();
    }
    case 'shelf': return renderShelf(arg);
    case 'check': return renderCheck(arg);
    case 'scan': return renderScan();
    case 'plan': return renderPlan();
    case 'style': return arg ? renderLooks(arg) : renderStyle();
    case 'family': return renderFamily();
    case 'settings': return renderSettings();
    default: return (TABS[name] ?? renderRack)();
  }
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
