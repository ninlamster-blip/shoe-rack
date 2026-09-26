import { inventory, knownIds } from '../rack.js';
import { askRack } from '../ai.js';
import { esc, icon } from '../ui.js';
import { state, paint, on, apiKey, layout, pairLabel, thumb, aiError, working } from '../shared.js';

const STARTERS = [
  'Which shoes haven’t been worn in ages?',
  'What should I wear to a wedding?',
  'How many sneakers do we have?',
  'Which shelf is the most crowded?',
];

let pending = false;
let lastError = null;

export function renderAsk() {
  const turns = state.chat;
  const kid = state.family.find((m) => m.kid);
  const starters = kid ? [`Where are ${kid.name}’s school shoes?`, ...STARTERS.slice(0, 3)] : STARTERS;

  paint(`
    <header class="top">
      <div class="top-row">
        <span class="count-chip">${icon('chat')} Ask</span>
        ${turns.length ? '<button class="mini ghost" data-action="clear">New chat</button>' : ''}
      </div>
      <h1>Ask your rack</h1>
      <p class="sub">Sends your question and a text list of the rack — types, colours, names, first names, sizes, shelves. Never photos.</p>
    </header>
    <section class="sheet chat">
      ${!turns.length ? `<div class="starters">${starters.map((q) => `<button class="chip" data-starter="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
      <ol class="bubbles" aria-live="polite">
        ${turns.map((t) => t.role === 'user'
          ? `<li class="bubble me">${esc(t.content)}</li>`
          : `<li class="bubble">${esc(t.content)}${pairCards(t.ids)}</li>`).join('')}
        ${pending ? `<li class="bubble">${working('Thinking…')}</li>` : ''}
      </ol>
      ${lastError ? aiError(lastError, 'retry') : ''}
      <form class="ask-bar" id="ask">
        <label class="sr-only" for="q">Your question</label>
        <input class="input" id="q" placeholder="Ask about your shoes…" autocomplete="off" maxlength="300" ${pending ? 'disabled' : ''}>
        <button class="btn small" aria-label="Send" ${pending ? 'disabled' : ''}>${icon('send')}</button>
      </form>
    </section>`, { keepScroll: false });

  window.scrollTo(0, document.body.scrollHeight);
  on('#ask', 'submit', (e) => {
    e.preventDefault();
    const q = e.target.querySelector('input').value.trim();
    if (q) ask(q);
  });
  on('[data-starter]', 'click', (e, b) => ask(b.dataset.starter));
  on('[data-action="clear"]', 'click', () => { state.chat = []; lastError = null; renderAsk(); });
  on('[data-action="retry"]', 'click', () => {
    const q = state.chat.at(-1)?.role === 'user' ? state.chat.pop().content : '';
    if (q) ask(q);
  });
}

function pairCards(ids = []) {
  const pairs = ids.map((id) => state.pairs.find((p) => p.id === id)).filter(Boolean).slice(0, 6);
  if (!pairs.length) return '';
  const { shelfOf } = layout();
  return `<span class="refs">${pairs.map((p) => `
    <a href="#/pair/${p.id}" class="ref">${thumb(p)}<span>${esc(pairLabel(p))}<small>${shelfOf.get(p.id) ? `Shelf ${shelfOf.get(p.id)}` : 'No room'}</small></span></a>`).join('')}</span>`;
}

async function ask(question) {
  if (pending) return;
  const history = state.chat.map((t) => ({ role: t.role, content: t.content }));
  state.chat.push({ role: 'user', content: question });
  pending = true;
  lastError = null;
  renderAsk();
  try {
    const rack = inventory(state.pairs, state.family, layout().shelfOf);
    const raw = await askRack(apiKey(), question, rack, history);
    state.chat.push({
      role: 'assistant',
      content: String(raw?.answer ?? '').slice(0, 1500) || 'I couldn’t find an answer to that.',
      ids: knownIds(raw?.pair_ids, state.pairs),
    });
  } catch (err) {
    lastError = err;
  }
  pending = false;
  if (location.hash.startsWith('#/ask')) renderAsk();
}
