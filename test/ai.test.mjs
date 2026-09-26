import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairRequest, shelfRequest, MODEL } from '../js/ai.js';
import { TYPE_IDS } from '../js/rack.js';

test('a recognition request carries one photo and nothing about the family', () => {
  const body = pairRequest('BASE64');
  assert.equal(body.model, MODEL);
  const content = body.messages[0].content;
  assert.equal(body.messages.length, 1);
  assert.deepEqual(content.map((c) => c.type), ['image', 'text']);
  assert.equal(content[0].source.data, 'BASE64');
  const sent = JSON.stringify(body);
  for (const word of ['owner', 'apiKey', 'sk-ant', 'Mum', 'Dad']) {
    assert.ok(!sent.includes(word), `request mentions ${word}`);
  }
});

test('answers are constrained to the app’s own types', () => {
  for (const body of [pairRequest('x'), shelfRequest('x')]) {
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.ok(JSON.stringify(body.output_config.format.schema).includes(JSON.stringify(TYPE_IDS)));
  }
});

test('refusals fall back server-side rather than failing the photo', () => {
  const body = pairRequest('x');
  assert.equal(body.fallbacks, 'default');
  assert.deepEqual(body.betas, ['server-side-fallback-2026-07-01']);
});
