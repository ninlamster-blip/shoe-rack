import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairRequest, scanRequest, shelfRequest, styleRequest, outfitRequest, askRequest, MODEL } from '../js/ai.js';
import { TYPE_IDS, inventory } from '../js/rack.js';

const family = [{ id: 'm1', name: 'Mariam Hassan' }, { id: 'm2', name: 'Yusuf' }];
const pairs = [
  { id: 'p1', type: 'heels', colour: 'beige', name: 'Nude block heels', owner: 'm1', photo: 'data:image/jpeg;base64,SECRETPHOTO' },
  { id: 'p2', type: 'sneakers', colour: 'white', name: 'White low-tops', owner: 'm2', photo: 'data:image/jpeg;base64,SECRETPHOTO' },
];
const images = (body) => body.messages.at(-1).content.filter((c) => c.type === 'image');
const sent = (body) => JSON.stringify(body);

test('every photo request carries exactly one photo and no family names', () => {
  for (const body of [pairRequest('IMG'), scanRequest('IMG'), shelfRequest('IMG'), styleRequest('IMG', pairs[0])]) {
    assert.equal(body.model, MODEL);
    assert.equal(images(body).length, 1);
    assert.equal(images(body)[0].source.data, 'IMG');
    for (const word of ['Mariam', 'Yusuf', 'Hassan', 'SECRETPHOTO', 'sk-ant']) assert.ok(!sent(body).includes(word), word);
  }
});

test('shoes-for-outfit sends the outfit photo and a text list with no owners', () => {
  const candidates = inventory(pairs, family, new Map()).map(({ owner, ...rest }) => rest);
  const body = outfitRequest('OUTFIT', 'wedding', candidates);
  assert.equal(images(body).length, 1);
  assert.ok(sent(body).includes('p1') && sent(body).includes('wedding'));
  for (const word of ['Mariam', 'Yusuf', 'SECRETPHOTO', '"owner"']) assert.ok(!sent(body).includes(word), word);
});

test('Ask sends text only: first names yes, surnames and photos never', () => {
  const rack = inventory(pairs, family, new Map([['p1', 1]]));
  const body = askRequest('Where are Mariam’s heels?', rack, [
    { role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' },
    { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' },
    { role: 'user', content: 'c' }, { role: 'assistant', content: 'd' },
  ]);
  assert.equal(images(body).length, 0);
  assert.ok(body.messages.at(-1).content[0].text.includes('"owner":"Mariam"'));
  assert.ok(!sent(body).includes('Hassan'));
  assert.ok(!sent(body).includes('SECRETPHOTO'));
  assert.equal(body.messages.length, 5, 'only the last four turns are kept');
  assert.equal(body.messages.at(-1).role, 'user');
});

test('answers are constrained to the app’s own types', () => {
  for (const body of [pairRequest('x'), scanRequest('x'), shelfRequest('x')]) {
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.ok(JSON.stringify(body.output_config.format.schema).includes(JSON.stringify(TYPE_IDS)));
  }
});

test('refusals fall back server-side rather than failing', () => {
  for (const body of [pairRequest('x'), askRequest('q', [])]) {
    assert.equal(body.fallbacks, 'default');
    assert.deepEqual(body.betas, ['server-side-fallback-2026-07-01']);
  }
});
