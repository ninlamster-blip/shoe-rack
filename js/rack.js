// The rules of the rack, with no DOM and no storage, so they can be tested in Node.
//
// A rack is a list of physical shelves, top first. Each shelf holds one or more
// types — a big collection of sneakers can span two shelves, and a few boots
// and slippers can share one. That list is the *plan*. Nothing stores a shelf
// number on a pair: where a pair goes is worked out from the plan every time,
// so changing the plan moves every pair without a migration.

export const DAY = 86_400_000;

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

export const CONDITIONS = {
  good: 'Good',
  dirty: 'Needs a clean',
  worn: 'Getting worn',
  replace: 'Time to replace',
};

export function typeOf(id) {
  return TYPES.find((t) => t.id === id) ?? TYPES[TYPES.length - 1];
}

const typeKey = (p) => (TYPE_IDS.includes(p?.type) ? p.type : 'other');

// ---------- the plan ----------

// A type order is the v1 way of storing the rack (one shelf per type). It is
// still how a default plan is described.
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

export function defaultPlan(order) {
  return { capacity: 0, shelves: normaliseOrder(order).map((t) => [t]) };
}

// Whatever was stored, the result is a plan in which every type has a home:
// unknown types and empty shelves are dropped, and a type with nowhere to go
// joins the bottom shelf. Capacity 0 means "no limit".
export function normalisePlan(raw) {
  const cap = Math.round(Number(raw?.capacity));
  const capacity = Number.isFinite(cap) ? Math.min(Math.max(cap, 0), 60) : 0;
  const shelves = (Array.isArray(raw?.shelves) ? raw.shelves : [])
    .map((s) => [...new Set((Array.isArray(s) ? s : []).filter((id) => TYPE_IDS.includes(id)))])
    .filter((s) => s.length)
    .slice(0, 30);
  if (!shelves.length) return { ...defaultPlan(), capacity };
  const present = new Set(shelves.flat());
  const missing = TYPE_IDS.filter((id) => !present.has(id));
  if (missing.length) shelves[shelves.length - 1] = [...shelves[shelves.length - 1], ...missing];
  return { capacity, shelves };
}

export function homeShelf(plan, type) {
  const t = TYPE_IDS.includes(type) ? type : 'other';
  const i = plan.shelves.findIndex((s) => s.includes(t));
  return i < 0 ? plan.shelves.length : i + 1;
}

export function moveShelf(plan, index, delta) {
  const shelves = plan.shelves.map((s) => [...s]);
  const to = index + delta;
  if (index < 0 || index >= shelves.length || to < 0 || to >= shelves.length) return { ...plan, shelves };
  shelves.splice(to, 0, ...shelves.splice(index, 1));
  return { ...plan, shelves };
}

// Within a type, daily pairs go to the front, then by owner, then colour, so
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

// Put every pair on a shelf. With no capacity, a type's pairs all go on its
// first shelf. With a capacity, shelves fill top-down and a type spills onto
// its next shelf; pairs with no room left are returned as overflow.
export function placement(pairs, plan, family = []) {
  const byType = new Map(TYPE_IDS.map((t) => [t, sortShelf(pairs.filter((p) => typeKey(p) === t), family)]));
  const shelves = plan.shelves.map((types, i) => ({
    n: i + 1,
    types,
    groups: types.map((type) => ({ type, pairs: [] })),
    used: 0,
    capacity: plan.capacity,
  }));
  const next = new Map();
  for (const shelf of shelves) {
    for (const group of shelf.groups) {
      const list = byType.get(group.type);
      let i = next.get(group.type) ?? 0;
      if (!plan.capacity && next.has(group.type)) continue; // already placed on its first shelf
      while (i < list.length && (!plan.capacity || shelf.used < plan.capacity)) {
        group.pairs.push(list[i++]);
        shelf.used++;
      }
      next.set(group.type, i);
    }
  }
  const overflow = TYPE_IDS.flatMap((t) => byType.get(t).slice(next.get(t) ?? 0));
  const shelfOf = new Map();
  for (const s of shelves) for (const g of s.groups) for (const p of g.pairs) shelfOf.set(p.id, s.n);
  return { shelves, overflow, shelfOf };
}

// How much a type is really used: recent wears count most, a daily pair
// counts for a few, and sheer numbers break ties.
function usage(pairs, now) {
  const score = new Map(TYPE_IDS.map((t) => [t, 0]));
  const count = new Map(TYPE_IDS.map((t) => [t, 0]));
  for (const p of pairs) {
    const t = typeKey(p);
    count.set(t, count.get(t) + 1);
    score.set(t, score.get(t) + wearsSince(p, now - 60 * DAY) + (p.daily ? 3 : 0));
  }
  return { score, count };
}

// Suggest a plan for a real rack of `shelfCount` shelves holding `capacity`
// pairs each: the most-worn types go on the top (easiest) shelves, a type
// bigger than a shelf spans several, and small types share rather than leave
// a shelf half empty. It never returns more shelves than the rack has; what
// doesn't fit is reported as overflow.
export function suggestPlan(pairs, { shelfCount, capacity }, now = Date.now()) {
  const count = Math.max(1, Math.round(shelfCount) || 1);
  const cap = Math.max(0, Math.round(capacity) || 0);
  const { score, count: n } = usage(pairs, now);
  const used = TYPE_IDS.filter((t) => n.get(t) > 0).sort(
    (a, b) => score.get(b) - score.get(a) || n.get(b) - n.get(a) || TYPE_IDS.indexOf(a) - TYPE_IDS.indexOf(b),
  );
  const empty = TYPE_IDS.filter((t) => !n.get(t));

  let shelves;
  if (!cap) {
    shelves = used.map((t) => [t]);
  } else {
    const pack = (keepSmallTogether) => {
      const out = [];
      let cur = null;
      for (const t of used) {
        let left = n.get(t);
        // A type that fits on one shelf starts a fresh one rather than being
        // split across two — unless that would need more shelves than exist.
        if (keepSmallTogether && cur && left <= cap && left > cur.free) cur = null;
        while (left > 0) {
          if (!cur || cur.free === 0) {
            cur = { types: [], free: cap };
            out.push(cur);
          }
          const take = Math.min(left, cur.free);
          cur.types.push(t);
          cur.free -= take;
          left -= take;
        }
      }
      return out.map((s) => s.types);
    };
    shelves = pack(true);
    if (shelves.length > count) shelves = pack(false);
  }
  const needed = Math.max(shelves.length, 1);
  if (shelves.length > count) {
    const extra = shelves.splice(count - 1).flat();
    shelves.push([...new Set(extra)]);
  }
  if (!shelves.length) shelves.push([]);
  shelves[shelves.length - 1] = [...new Set([...shelves[shelves.length - 1], ...empty])];

  const plan = normalisePlan({ capacity: cap, shelves });
  const overflow = cap ? Math.max(0, pairs.length - cap * plan.shelves.length) : 0;
  return { plan, shelvesNeeded: needed, overflow };
}

// ---------- wear ----------

export function wearsSince(pair, since) {
  return (Array.isArray(pair?.wears) ? pair.wears : []).filter((t) => t >= since).length;
}

export function lastWorn(pair) {
  const w = Array.isArray(pair?.wears) ? pair.wears : [];
  return w.length ? Math.max(...w) : 0;
}

export function wornToday(pair, now = Date.now()) {
  const last = lastWorn(pair);
  return Boolean(last) && new Date(last).toDateString() === new Date(now).toDateString();
}

// Logging twice on the same day counts once, so a double tap can't inflate it.
export function logWear(pair, now = Date.now()) {
  if (wornToday(pair, now)) return pair;
  return { ...pair, wears: [...(pair.wears ?? []), now].slice(-120) };
}

export function undoWear(pair, now = Date.now()) {
  if (!wornToday(pair, now)) return pair;
  const day = new Date(now).toDateString();
  return { ...pair, wears: (pair.wears ?? []).filter((t) => new Date(t).toDateString() !== day) };
}

// Pairs nobody has worn for a long time, longest first. A pair only just
// added is left alone — no wears yet is not the same as not wanted — and so is
// one you said to keep, for six months.
export function declutter(pairs, now = Date.now(), { idleDays = 120, minAgeDays = 30, keepDays = 180 } = {}) {
  return pairs
    .filter((p) => !p.daily && now - (p.createdAt ?? now) >= minAgeDays * DAY)
    .filter((p) => !p.keptAt || now - p.keptAt >= keepDays * DAY)
    .map((p) => ({ pair: p, idle: Math.floor((now - (lastWorn(p) || p.createdAt || now)) / DAY) }))
    .filter((x) => x.idle >= idleDays)
    .sort((a, b) => b.idle - a.idle);
}

// ---------- sizes ----------

export function parseSize(s) {
  const m = String(s ?? '').replace(',', '.').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// A child's pair is outgrown when it's smaller than their current size.
export function outgrown(pairs, family) {
  const out = [];
  for (const m of family) {
    const size = parseSize(m.size);
    if (!m.kid || size == null) continue;
    for (const p of pairs) {
      const ps = parseSize(p.size);
      if (p.owner === m.id && ps != null && ps < size) out.push({ pair: p, member: m, pairSize: ps, memberSize: size });
    }
  }
  return out;
}

// Children's feet grow every few months; nudge when a size is old or missing.
export function sizeCheckDue(family, now = Date.now(), days = 120) {
  return family.filter((m) => m.kid && (!m.size || now - (m.sizeAt ?? 0) > days * DAY));
}

// ---------- care ----------

export function care(pairs, now = Date.now(), wearsPerClean = 20) {
  const replace = [];
  const clean = [];
  const worn = [];
  for (const p of pairs) {
    if (p.condition === 'replace') replace.push(p);
    else if (p.condition === 'dirty' || wearsSince(p, Math.max(p.cleanedAt ?? 0, p.createdAt ?? 0)) >= wearsPerClean) clean.push(p);
    else if (p.condition === 'worn') worn.push(p);
  }
  return { replace, clean, worn };
}

// ---------- what the model sends back ----------

// Model output is data from the network, so it is checked here rather than
// trusted: an unknown type becomes "other", an unknown colour is dropped, and
// free text is trimmed to a length a card can show.
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function cleanRecognition(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    isShoe: r.is_shoe !== false,
    type: TYPE_IDS.includes(r.type) ? r.type : 'other',
    colour: COLOURS.includes(r.colour) ? r.colour : '',
    brand: text(r.brand, 40),
    name: text(r.name, 60),
    size: text(r.size, 12),
    condition: Object.hasOwn(CONDITIONS, r.condition) ? r.condition : '',
    careTip: text(r.care_tip, 160),
    confidence: ['high', 'medium', 'low'].includes(r.confidence) ? r.confidence : 'low',
  };
}

// A whole-rack scan: each pair plus the box it sits in, on a 0–1000 grid.
export function cleanScan(raw) {
  const list = Array.isArray(raw?.pairs) ? raw.pairs.slice(0, 40) : [];
  return list.map((p) => {
    const c = cleanRecognition({ ...p, is_shoe: true });
    const b = Array.isArray(p?.box) ? p.box.map(Number) : [];
    let box = null;
    if (b.length === 4 && b.every(Number.isFinite)) {
      const [x0, y0, x1, y1] = b.map((v) => Math.min(Math.max(v, 0), 1000));
      if (x1 - x0 >= 20 && y1 - y0 >= 20) box = [x0, y0, x1, y1];
    }
    return { ...c, box };
  });
}

// The pair already on the rack that a newly seen pair most likely is. Type
// and colour alone aren't enough — a family can own three pairs of brown
// boots — so it also needs a shared word in the name (colour and shoe words
// don't count) or the same brand.
const PLAIN_WORDS = new Set([...COLOURS, ...TYPE_IDS, 'tan', 'cream', 'gold', 'silver', 'nude', 'dark', 'light',
  'shoe', 'shoes', 'pair', 'boot', 'sneaker', 'trainer', 'trainers', 'heel', 'sandal', 'slipper', 'the', 'and', 'with']);

export function likelyDuplicate(candidate, pairs) {
  const words = (s) => new Set(String(s ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 1 && !PLAIN_WORDS.has(w)));
  const cw = words(candidate.name);
  let best = null;
  let bestScore = 0;
  for (const p of pairs) {
    if (typeKey(p) !== candidate.type || !candidate.colour || p.colour !== candidate.colour) continue;
    let score = 0;
    for (const w of words(p.name)) if (cw.has(w)) score++;
    if (candidate.brand && p.brand && candidate.brand.toLowerCase() === p.brand.toLowerCase()) score++;
    if (score > bestScore) [best, bestScore] = [p, score];
  }
  return best;
}

// A tidy check compares what the camera saw on one shelf with what belongs
// there. Each seen pair either belongs, or is named with the shelf it should
// move to.
export function tidyReport(seen, shelfTypes, plan) {
  const items = (Array.isArray(seen) ? seen : []).map((s) => {
    const c = cleanRecognition({ ...s, is_shoe: true });
    const belongs = shelfTypes.includes(c.type);
    return { ...c, position: text(s?.position, 60), belongs, moveTo: belongs ? null : homeShelf(plan, c.type) };
  });
  return { items, misplaced: items.filter((i) => !i.belongs) };
}

// Keep only ids that really are pairs on this rack.
export function knownIds(ids, pairs) {
  const have = new Set(pairs.map((p) => p.id));
  return [...new Set((Array.isArray(ids) ? ids : []).filter((id) => have.has(id)))];
}

// ---------- what the model is allowed to see ----------

// The one place that decides how a pair is described to the model: these keys
// and nothing else — no photo, and only the owner's first name.
export function inventory(pairs, family, shelfOf, now = Date.now()) {
  const first = (id) => String(family.find((m) => m.id === id)?.name ?? '').trim().split(/\s+/)[0];
  return pairs.map((p) => ({
    id: p.id,
    type: typeKey(p),
    colour: p.colour || '',
    name: p.name || '',
    brand: p.brand || '',
    owner: first(p.owner),
    size: p.size || '',
    shelf: shelfOf.get(p.id) ?? null,
    daily: Boolean(p.daily),
    condition: p.condition || '',
    last_worn_days_ago: lastWorn(p) ? Math.floor((now - lastWorn(p)) / DAY) : null,
  }));
}

export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}
