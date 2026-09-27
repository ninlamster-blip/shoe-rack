import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, PATTERNS, cleanColour, cleanPieces, garmentSvg, arrange, boardHtml } from '../js/outfit.js';
import { styleRequest } from '../js/ai.js';

test('every garment the model may name has a drawing', () => {
  for (const kind of KINDS) {
    const svg = garmentSvg({ kind, name: kind, colour: '#a7b89a', colourName: 'sage', pattern: 'plain' });
    assert.match(svg, /^<svg class="garment" viewBox="0 0 100 100"/, kind);
    assert.match(svg, /<path d="M/, kind);
  }
});

test('the schema offers exactly the garments that can be drawn', () => {
  const schema = styleRequest('', { type: 'sneakers', colour: 'white', name: 'Low-tops' }).output_config.format.schema;
  const piece = schema.properties.looks.items.properties.pieces.items;
  assert.deepEqual(piece.properties.kind.enum, KINDS);
  assert.deepEqual(piece.properties.pattern.enum, PATTERNS);
});

test('colours: hex is kept, names are looked up, anything else is stone', () => {
  assert.equal(cleanColour('#A7B89A'), '#a7b89a');
  assert.equal(cleanColour('sage'), '#a7b89a');
  assert.equal(cleanColour('#zzz', 'Light denim'), '#5b7fa6');
  assert.equal(cleanColour('red;background:url(x)', ''), '#bcb0a6');
  assert.equal(cleanColour(undefined, undefined), '#bcb0a6');
});

test('unknown garments are dropped and text is bounded', () => {
  const pieces = cleanPieces([
    { kind: 'spaceship', name: 'x', colour: '#000000' },
    { kind: 'dress', name: 'D'.repeat(200), colour: '#123456', colour_name: 'navy', pattern: 'lasers' },
    null,
  ]);
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].name.length, 50);
  assert.equal(pieces[0].pattern, 'plain');
  assert.deepEqual(cleanPieces('nope'), []);
});

test('a dress or a top-and-bottom goes in the main column; the rest beside it', () => {
  const p = (kind) => ({ kind, name: kind, colour: '#ffffff', colourName: '', pattern: 'plain' });
  const { main, side } = arrange([p('bag'), p('trousers'), p('jacket'), p('shirt')]);
  assert.deepEqual(main.map((x) => x.kind), ['shirt', 'trousers']);
  assert.deepEqual(side.map((x) => x.kind), ['jacket', 'bag']);
});

test('the board escapes names and only shows a photo the app made', () => {
  const pieces = cleanPieces([{ kind: 'top', name: '<img src=x onerror=alert(1)>', colour: '#ffffff', colour_name: '"sage"' }]);
  const html = boardHtml(pieces, { shoePhoto: 'javascript:alert(1)' });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(boardHtml(pieces, { shoePhoto: 'data:image/jpeg;base64,AAAA' }).includes('data:image/jpeg;base64,AAAA'));
});

test('patterns get a pattern fill with a unique id', () => {
  const a = garmentSvg({ kind: 'skirt', name: 's', colour: '#27365e', colourName: 'navy', pattern: 'stripes' });
  const b = garmentSvg({ kind: 'skirt', name: 's', colour: '#27365e', colourName: 'navy', pattern: 'stripes' });
  const id = (s) => s.match(/pattern id="(\w+)"/)[1];
  assert.notEqual(id(a), id(b));
  assert.ok(a.includes(`url(#${id(a)})`));
});

test('the legend reads naturally', () => {
  const html = boardHtml(cleanPieces([
    { kind: 'shirt', name: 'Linen shirt', colour: '#ffffff', colour_name: 'white' },
    { kind: 'dress', name: 'Sage midi dress', colour: '#a7b89a', colour_name: 'sage' },
  ]));
  assert.ok(html.includes('White linen shirt'));
  assert.ok(html.includes('Sage midi dress'));
});
