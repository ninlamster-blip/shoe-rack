import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TYPE_IDS, normaliseOrder, shelfFor, moveShelf, groupByShelf, sortShelf, cleanRecognition, tidyReport, initials,
} from '../js/rack.js';

test('a stored shelf order can never lose or invent a shelf', () => {
  assert.deepEqual(normaliseOrder(undefined), TYPE_IDS);
  const odd = normaliseOrder(['boots', 'boots', 'spaceships', 'sneakers']);
  assert.deepEqual(odd.slice(0, 2), ['boots', 'sneakers']);
  assert.deepEqual([...odd].sort(), [...TYPE_IDS].sort());
});

test('a pair’s shelf follows its type when shelves are reordered', () => {
  const order = normaliseOrder([]);
  assert.equal(shelfFor('sneakers', order), 1);
  const moved = moveShelf(order, 'boots', -3);
  assert.equal(shelfFor('boots', moved), 1);
  assert.equal(shelfFor('sneakers', moved), 2);
  assert.equal(shelfFor('mystery', order), shelfFor('other', order));
});

test('moving the top shelf up or the bottom shelf down does nothing', () => {
  const order = normaliseOrder([]);
  assert.deepEqual(moveShelf(order, order[0], -1), order);
  assert.deepEqual(moveShelf(order, order.at(-1), 1), order);
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

test('every pair lands on exactly one shelf', () => {
  const pairs = [{ id: 1, type: 'boots' }, { id: 2, type: 'sneakers' }, { id: 3, type: 'weird' }];
  const shelves = groupByShelf(pairs, []);
  assert.equal(shelves.length, TYPE_IDS.length);
  assert.equal(shelves.flatMap((s) => s.pairs).length, pairs.length);
  assert.equal(shelves.find((s) => s.type === 'other').pairs[0].id, 3);
});

test('what the model sends back is checked, not trusted', () => {
  const r = cleanRecognition({ type: 'rocket', colour: 'plaid', brand: 'x'.repeat(200), confidence: 'certain' });
  assert.equal(r.type, 'other');
  assert.equal(r.colour, '');
  assert.equal(r.brand.length, 40);
  assert.equal(r.confidence, 'low');
  assert.equal(cleanRecognition(null).type, 'other');
  assert.equal(cleanRecognition({ is_shoe: false }).isShoe, false);
});

test('a tidy check names where a stray pair should go', () => {
  const order = normaliseOrder([]);
  const { items, misplaced } = tidyReport(
    [{ type: 'sneakers', colour: 'white', name: 'A', position: 'left' }, { type: 'boots', colour: 'brown', name: 'B', position: 'right' }],
    'sneakers', order,
  );
  assert.equal(items.length, 2);
  assert.equal(misplaced.length, 1);
  assert.equal(misplaced[0].moveTo, shelfFor('boots', order));
  assert.deepEqual(tidyReport(undefined, 'sneakers', order).items, []);
});

test('initials', () => {
  assert.equal(initials('mum'), 'M');
  assert.equal(initials('Ali Hassan'), 'AH');
  assert.equal(initials('  '), '?');
});
