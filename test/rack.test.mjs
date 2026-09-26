import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY, TYPE_IDS, normaliseOrder, defaultPlan, normalisePlan, homeShelf, moveShelf, placement, suggestPlan,
  sortShelf, logWear, undoWear, wornToday, declutter, parseSize, outgrown, sizeCheckDue, care,
  cleanRecognition, cleanScan, likelyDuplicate, tidyReport, knownIds, inventory, initials,
} from '../js/rack.js';

const NOW = Date.UTC(2026, 8, 26, 12);
const many = (type, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `${type}${i}`, type, colour: 'black', createdAt: 0, ...extra }));

test('a v1 type order becomes one shelf per type', () => {
  const plan = defaultPlan(['boots']);
  assert.equal(plan.shelves.length, TYPE_IDS.length);
  assert.deepEqual(plan.shelves[0], ['boots']);
  assert.equal(plan.capacity, 0);
  assert.deepEqual(normaliseOrder(['x', 'boots', 'boots']).slice(0, 1), ['boots']);
});

test('a stored plan can never lose a type or keep junk', () => {
  const plan = normalisePlan({ capacity: 999, shelves: [['sneakers', 'sneakers', 'rocket'], [], ['boots']] });
  assert.equal(plan.capacity, 60);
  assert.deepEqual(plan.shelves[0], ['sneakers']);
  assert.equal(plan.shelves.length, 2);
  assert.deepEqual([...new Set(plan.shelves.flat())].sort(), [...TYPE_IDS].sort());
  assert.deepEqual(normalisePlan(null), defaultPlan());
});

test('a pair’s home shelf follows the plan', () => {
  const plan = normalisePlan({ shelves: [['formal', 'heels'], ['sneakers']] });
  assert.equal(homeShelf(plan, 'heels'), 1);
  assert.equal(homeShelf(plan, 'sneakers'), 2);
  assert.equal(homeShelf(plan, 'mystery'), homeShelf(plan, 'other'));
  const moved = moveShelf(plan, 1, -1);
  assert.equal(homeShelf(moved, 'sneakers'), 1);
  assert.deepEqual(moveShelf(plan, 0, -1).shelves, plan.shelves);
});

test('without a capacity every pair of a type sits on its first shelf', () => {
  const plan = normalisePlan({ shelves: [['sneakers'], ['sneakers', 'boots']] });
  const { shelves, overflow } = placement(many('sneakers', 12), plan);
  assert.equal(shelves[0].used, 12);
  assert.equal(shelves[1].used, 0);
  assert.equal(overflow.length, 0);
});

test('with a capacity a type spills to its next shelf, then overflows', () => {
  const plan = normalisePlan({ capacity: 5, shelves: [['sneakers'], ['sneakers', 'boots']] });
  const pairs = [...many('sneakers', 8), ...many('boots', 3)];
  const { shelves, overflow, shelfOf } = placement(pairs, plan);
  assert.equal(shelves[0].used, 5);
  assert.equal(shelves[1].used, 5); // 3 sneakers + 2 boots
  assert.equal(overflow.length, 1);
  assert.equal(overflow[0].type, 'boots');
  assert.equal(shelfOf.get('sneakers0'), 1);
  assert.equal(shelfOf.get('sneakers7'), 2);
  assert.equal(shelfOf.has(overflow[0].id), false);
});

test('the suggested plan puts the most-worn type on top and fits the rack', () => {
  const pairs = [
    ...many('formal', 3),
    ...many('sneakers', 12, { wears: [NOW - DAY, NOW - 2 * DAY] }),
    ...many('boots', 2),
    ...many('slippers', 2),
  ];
  const { plan, overflow, shelvesNeeded } = suggestPlan(pairs, { shelfCount: 4, capacity: 8 }, NOW);
  assert.ok(plan.shelves.length <= 4);
  assert.deepEqual(plan.shelves[0], ['sneakers']);
  assert.ok(plan.shelves[1].includes('sneakers')); // 12 sneakers span two shelves
  assert.equal(overflow, 0);
  assert.equal(shelvesNeeded, 3);
  // boots and slippers share rather than taking a shelf each
  assert.ok(plan.shelves.some((s) => s.includes('boots') && s.includes('slippers')));
  const { shelves, overflow: left } = placement(pairs, plan);
  assert.equal(left.length, 0);
  assert.ok(shelves.every((s) => s.used <= 8));
});

test('a rack too small reports how many pairs will not fit', () => {
  const pairs = [...many('sneakers', 10), ...many('boots', 10)];
  const { plan, overflow } = suggestPlan(pairs, { shelfCount: 2, capacity: 8 }, NOW);
  assert.equal(plan.shelves.length, 2);
  assert.equal(overflow, 4);
  assert.equal(placement(pairs, plan).overflow.length, 4);
});

test('daily pairs go to the front, then by family order', () => {
  const family = [{ id: 'mum' }, { id: 'dad' }];
  const sorted = sortShelf([
    { id: 'a', owner: 'dad', colour: 'black' },
    { id: 'b', owner: 'mum', colour: 'white' },
    { id: 'c', owner: 'dad', colour: 'blue', daily: true },
  ], family);
  assert.deepEqual(sorted.map((p) => p.id), ['c', 'b', 'a']);
});

test('wearing twice in a day counts once, and can be undone', () => {
  let p = { id: 'a' };
  assert.equal(wornToday(p, NOW), false);
  p = logWear(logWear(p, NOW), NOW + 1000);
  assert.equal(p.wears.length, 1);
  assert.equal(wornToday(p, NOW), true);
  p = logWear(p, NOW + DAY);
  assert.equal(p.wears.length, 2);
  assert.equal(undoWear(p, NOW + DAY).wears.length, 1);
});

test('declutter suggests long-idle pairs but never new or daily ones', () => {
  const pairs = [
    { id: 'old', createdAt: NOW - 400 * DAY },
    { id: 'worn', createdAt: NOW - 400 * DAY, wears: [NOW - 10 * DAY] },
    { id: 'new', createdAt: NOW - 5 * DAY },
    { id: 'daily', createdAt: NOW - 400 * DAY, daily: true },
    { id: 'older', createdAt: NOW - 500 * DAY, wears: [NOW - 300 * DAY] },
    { id: 'kept', createdAt: NOW - 500 * DAY, keptAt: NOW - 20 * DAY },
  ];
  assert.deepEqual(declutter(pairs, NOW).map((x) => x.pair.id), ['old', 'older']);
});

test('kids’ outgrown pairs and stale sizes are flagged', () => {
  const family = [
    { id: 'ali', kid: true, size: '32', sizeAt: NOW - 10 * DAY },
    { id: 'mum', kid: false, size: '38' },
    { id: 'sara', kid: true, size: '', sizeAt: 0 },
  ];
  const pairs = [
    { id: 'small', owner: 'ali', size: 'EU 30' },
    { id: 'ok', owner: 'ali', size: '32' },
    { id: 'nosize', owner: 'ali' },
    { id: 'mums', owner: 'mum', size: '36' },
  ];
  assert.deepEqual(outgrown(pairs, family).map((x) => x.pair.id), ['small']);
  assert.deepEqual(sizeCheckDue(family, NOW).map((m) => m.id), ['sara']);
  assert.equal(parseSize('10,5'), 10.5);
  assert.equal(parseSize('n/a'), null);
});

test('care: condition first, then pairs worn a lot since their last clean', () => {
  const lots = Array.from({ length: 20 }, (_, i) => NOW - i * DAY);
  const { replace, clean, worn } = care([
    { id: 'r', condition: 'replace' },
    { id: 'd', condition: 'dirty' },
    { id: 'busy', wears: lots, createdAt: 0 },
    { id: 'cleaned', wears: lots, cleanedAt: NOW },
    { id: 'w', condition: 'worn' },
  ], NOW);
  assert.deepEqual(replace.map((p) => p.id), ['r']);
  assert.deepEqual(clean.map((p) => p.id), ['d', 'busy']);
  assert.deepEqual(worn.map((p) => p.id), ['w']);
});

test('what the model sends back is checked, not trusted', () => {
  const r = cleanRecognition({ type: 'rocket', colour: 'plaid', brand: 'x'.repeat(200), confidence: 'certain', condition: 'toString' });
  assert.equal(r.type, 'other');
  assert.equal(r.colour, '');
  assert.equal(r.brand.length, 40);
  assert.equal(r.confidence, 'low');
  assert.equal(r.condition, '');
  assert.equal(cleanRecognition(null).type, 'other');
  assert.equal(cleanRecognition({ is_shoe: false }).isShoe, false);
});

test('scan boxes are clamped, and a nonsense box is dropped', () => {
  const pairs = cleanScan({ pairs: [
    { type: 'boots', colour: 'brown', name: 'A', box: [-50, 10, 400, 1200] },
    { type: 'boots', colour: 'brown', name: 'B', box: [10, 10, 15, 15] },
    { type: 'boots', colour: 'brown', name: 'C', box: 'here' },
  ] });
  assert.deepEqual(pairs[0].box, [0, 10, 400, 1000]);
  assert.equal(pairs[1].box, null);
  assert.equal(pairs[2].box, null);
  assert.deepEqual(cleanScan(undefined), []);
});

test('a scanned pair that matches one on the rack is flagged', () => {
  const rack = [
    { id: '1', type: 'sneakers', colour: 'white', name: 'White Air Force 1', brand: 'Nike' },
    { id: '2', type: 'sneakers', colour: 'white', name: 'White canvas' },
    { id: '3', type: 'boots', colour: 'white', name: 'White boots' },
  ];
  assert.equal(likelyDuplicate({ type: 'sneakers', colour: 'white', name: 'Nike Air Force', brand: 'nike' }, rack).id, '1');
  assert.equal(likelyDuplicate({ type: 'sneakers', colour: 'black', name: 'Black' }, rack), null);
  // same type and colour, but nothing else in common: a different pair
  assert.equal(likelyDuplicate({ type: 'boots', colour: 'white', name: 'White snow boots' }, rack), null);
  assert.equal(likelyDuplicate({ type: 'sneakers', colour: 'white', name: 'White trainers' }, rack), null);
});

test('a tidy check names where a stray pair should go', () => {
  const plan = normalisePlan({ shelves: [['sneakers', 'sports'], ['boots']] });
  const { items, misplaced } = tidyReport([
    { type: 'sports', colour: 'white', name: 'A', position: 'left' },
    { type: 'boots', colour: 'brown', name: 'B', position: 'right' },
  ], plan.shelves[0], plan);
  assert.equal(items.length, 2);
  assert.equal(misplaced.length, 1);
  assert.equal(misplaced[0].moveTo, 2);
});

test('only ids that are really on the rack survive', () => {
  assert.deepEqual(knownIds(['a', 'zz', 'a', 5], [{ id: 'a' }, { id: 'b' }]), ['a']);
  assert.deepEqual(knownIds(undefined, []), []);
});

test('the inventory for Ask carries no photo and only a first name', () => {
  const family = [{ id: 'm', name: 'Mariam Al-Sabah' }];
  const [row] = inventory([{ id: 'p', type: 'boots', photo: 'data:image/jpeg;base64,AAAA', owner: 'm', wears: [NOW - 3 * DAY] }], family, new Map([['p', 2]]), NOW);
  assert.deepEqual(Object.keys(row).sort(), ['brand', 'colour', 'condition', 'daily', 'id', 'last_worn_days_ago', 'name', 'owner', 'shelf', 'size', 'type']);
  assert.equal(row.owner, 'Mariam');
  assert.equal(row.shelf, 2);
  assert.equal(row.last_worn_days_ago, 3);
});

test('initials', () => {
  assert.equal(initials('mum'), 'M');
  assert.equal(initials('Ali Hassan'), 'AH');
  assert.equal(initials('  '), '?');
});
