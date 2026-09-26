// The rules of the rack, with no DOM and no storage, so they can be tested in Node.
//
// The rack is sorted by type: every type owns one shelf, and a pair's shelf is
// whatever shelf its type is on. Nothing stores a shelf number on a pair —
// reorder the shelves in Settings and every pair follows without a migration.

export const TYPES = [
  { id: 'sneakers', label: 'Sneakers', tone: 'peach' },
  { id: 'formal', label: 'Formal', tone: 'rose' },
  { id: 'sandals', label: 'Sandals', tone: 'sun' },
  { id: 'boots', label: 'Boots', tone: 'lilac' },
  { id: 'sports', label: 'Sports', tone: 'mint' },
  { id: 'slippers', label: 'Slippers', tone: 'sky' },
  { id: 'heels', label: 'Heels', tone: 'coral' },
  { id: 'other', label: 'Other', tone: 'stone' },
];

export const TYPE_IDS = TYPES.map((t) => t.id);

export const COLOURS = [
  'black', 'white', 'grey', 'brown', 'beige', 'navy', 'blue',
  'red', 'pink', 'green', 'yellow', 'orange', 'purple', 'multi',
];

export function typeOf(id) {
  return TYPES.find((t) => t.id === id) ?? TYPES[TYPES.length - 1];
}

// A shelf order is a list of type ids, top shelf first. Anything missing is
// appended and anything unknown or repeated is dropped, so a stored order from
// an older version of the app can never lose a type or invent a shelf.
export function normaliseOrder(order) {
  const seen = new Set();
  const out = [];
  for (const id of Array.isArray(order) ? order : []) {
    if (TYPE_IDS.includes(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of TYPE_IDS) if (!seen.has(id)) out.push(id);
  return out;
}

export function shelfFor(type, order) {
  return normaliseOrder(order).indexOf(TYPE_IDS.includes(type) ? type : 'other') + 1;
}

export function moveShelf(order, type, delta) {
  const next = normaliseOrder(order);
  const from = next.indexOf(type);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= next.length) return next;
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

// Within a shelf, daily pairs go to the front, then by owner, then colour, so
// the same shelf always reads the same way from left to right.
export function sortShelf(pairs, family = []) {
  const ownerRank = (id) => {
    const i = family.findIndex((m) => m.id === id);
    return i < 0 ? family.length : i;
  };
  return [...pairs].sort(
    (a, b) =>
      Number(Boolean(b.daily)) - Number(Boolean(a.daily)) ||
      ownerRank(a.owner) - ownerRank(b.owner) ||
      String(a.colour).localeCompare(String(b.colour)) ||
      (a.createdAt ?? 0) - (b.createdAt ?? 0),
  );
}

export function groupByShelf(pairs, order, family = []) {
  return normaliseOrder(order).map((type, i) => ({
    shelf: i + 1,
    type,
    pairs: sortShelf(pairs.filter((p) => (TYPE_IDS.includes(p.type) ? p.type : 'other') === type), family),
  }));
}

// What the model sends back is data from the network, so it is checked here
// rather than trusted: an unknown type becomes "other", an unknown colour is
// dropped, and free text is trimmed to a length a card can show.
export function cleanRecognition(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const confidence = ['high', 'medium', 'low'].includes(r.confidence) ? r.confidence : 'low';
  return {
    isShoe: r.is_shoe !== false,
    type: TYPE_IDS.includes(r.type) ? r.type : 'other',
    colour: COLOURS.includes(r.colour) ? r.colour : '',
    brand: text(r.brand, 40),
    name: text(r.name, 60),
    confidence,
  };
}

// A tidy check compares what the camera saw on one shelf with what belongs
// there. Each seen pair either belongs, or is named with the shelf it should
// move to.
export function tidyReport(seen, shelfType, order) {
  const items = (Array.isArray(seen) ? seen : []).map((s) => {
    const c = cleanRecognition({ ...s, is_shoe: true });
    return {
      ...c,
      position: text60(s?.position),
      belongs: c.type === shelfType,
      moveTo: c.type === shelfType ? null : shelfFor(c.type, order),
    };
  });
  return { items, misplaced: items.filter((i) => !i.belongs) };
}

function text60(v) {
  return typeof v === 'string' ? v.trim().slice(0, 60) : '';
}

export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}
