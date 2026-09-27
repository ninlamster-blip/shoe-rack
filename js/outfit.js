// Draws an outfit as a flat-lay board: one simple illustration per garment,
// filled with the colour Claude chose, laid out beside the real shoe photo.
//
// Claude only ever describes an outfit (a kind of garment, a colour, a
// pattern); the pictures are drawn here, so they always look like the rest of
// the app and cost nothing. Everything Claude sends is checked first — an
// unknown garment is dropped and a colour that isn't a plain hex code falls
// back to a named one — so nothing from the network reaches the markup
// unescaped. No DOM, so it can be tested in Node.

export const PATTERNS = ['plain', 'stripes', 'check', 'dots'];

// Each garment is drawn on a 100×100 grid: `shape` is filled with the colour,
// `detail` is drawn in the outline colour on top (seams, collars, buttons).
const ART = {
  dress: {
    label: 'Dress',
    shape: 'M38 8h6q6 7 12 0h6l2 22q2 6 0 10l18 52q-32 7-64 0l18-52q-2-4 0-10z',
    detail: 'M36 40h28',
  },
  abaya: {
    label: 'Abaya',
    shape: 'M40 6q10 7 20 0l12 4 20 30-8 6-14-16 4 64q-24 5-48 0l4-64-14 16-8-6 20-30z',
    detail: 'M50 13v83',
  },
  top: {
    label: 'Top',
    shape: 'M36 14q14 9 28 0l20 8 6 18-14 4-2-8v50H26V36l-2 8-14-4 6-18z',
    detail: 'M40 16q10 6 20 0',
  },
  shirt: {
    label: 'Shirt',
    shape: 'M36 12l14 10 14-10 16 6 12 52-10 2-8-32v50H26V40l-8 32-10-2 12-52z',
    detail: 'M36 12l6 14 8-4 8 4 6-14M50 26v62M50 38h.1M50 52h.1M50 66h.1',
  },
  knit: {
    label: 'Knit',
    shape: 'M38 12q12 8 24 0l18 6 12 52-10 2-8-32v48H26V40l-8 32-10-2 12-52z',
    detail: 'M40 14q10 6 20 0M26 82h48M9.5 64l10 2M90.5 64l-10 2',
  },
  jacket: {
    label: 'Jacket',
    shape: 'M34 10l16 30 16-30 16 6 10 58-10 2-8-34v50H54l-4-48-4 48H26V42l-8 34-10-2 10-58z',
    detail: 'M34 10l8 22-4 4 12 4M66 10l-8 22 4 4-12 4M58 60h8',
  },
  coat: {
    label: 'Coat',
    shape: 'M34 8l16 28 16-28 16 6 10 60-10 2-8-34v56H54l-4-54-4 54H26V40l-8 34-10-2 10-60z',
    detail: 'M34 8l8 20-4 4 12 4M66 8l-8 20 4 4-12 4M58 52h.1M58 66h.1M26 60h20M54 60h20',
  },
  trousers: {
    label: 'Trousers',
    shape: 'M28 8h44l4 86H56l-6-60-6 60H24z',
    detail: 'M28 16h44M50 16v18',
  },
  shorts: {
    label: 'Shorts',
    shape: 'M26 22h48l6 48-24 2-6-26-6 26-24-2z',
    detail: 'M26 30h48M50 30v16',
  },
  skirt: {
    label: 'Skirt',
    shape: 'M34 18h32l16 68q-32 7-64 0z',
    detail: 'M34 26h32',
  },
  scarf: {
    label: 'Hijab / scarf',
    // Drawn with a face opening, so it reads as a hijab rather than a blob.
    shape: 'M50 8C30 8 24 28 26 46c2 16-6 30-12 44h72c-6-14-14-28-12-44 2-18-4-38-24-38zM50 24c-8 0-13 8-13 17s5 17 13 17 13-8 13-17-5-17-13-17z',
    detail: '',
    evenodd: true,
  },
  bag: {
    label: 'Bag',
    shape: 'M22 42h56l6 48H16z',
    detail: 'M36 42c0-24 28-24 28 0M16 58h68',
  },
  hat: {
    label: 'Hat',
    shape: 'M6 66a44 12 0 1 0 88 0 44 12 0 1 0-88 0zM30 64c0-30 40-30 40 0z',
    detail: 'M30 58q20 6 40 0',
  },
  belt: {
    label: 'Belt',
    shape: 'M6 42h88v16H6z',
    detail: 'M60 38h14v24H60zM67 50h12',
  },
  jewellery: {
    label: 'Jewellery',
    shape: 'M50 62a6 6 0 1 0 .1 0z',
    detail: '',
    line: 'M24 18c0 54 52 54 52 0',
  },
};

export const KINDS = Object.keys(ART);

const MAIN = ['dress', 'abaya'];
const TOPS = ['top', 'shirt', 'knit'];
const OUTER = ['jacket', 'coat'];
const BOTTOMS = ['trousers', 'shorts', 'skirt'];
const SMALL = ['scarf', 'hat', 'bag', 'belt', 'jewellery'];

// Named colours Claude might use instead of a hex code, and the ones the rack
// already knows. Anything else becomes a neutral stone.
const NAMED = {
  black: '#2b2b2b', white: '#fbfaf7', ivory: '#f4efe2', cream: '#f1e6cf', grey: '#9e9e9e', gray: '#9e9e9e',
  charcoal: '#44474d', silver: '#c9ccd1', brown: '#7a5234', tan: '#c9a27a', camel: '#c19a6b', beige: '#e3cfae',
  nude: '#e2bfa3', navy: '#27365e', blue: '#4f86d6', denim: '#5b7fa6', 'sky blue': '#9cc3e8', teal: '#2f7f7f',
  green: '#5aa56d', olive: '#6f7442', sage: '#a7b89a', mint: '#bfe3cf', red: '#d54b45', burgundy: '#7c2433',
  maroon: '#6d2230', pink: '#f2a3bd', blush: '#f1c6c0', rose: '#e39aa8', yellow: '#f3cf4f', mustard: '#d4a72c',
  gold: '#d4af37', orange: '#f08a3c', coral: '#ee857c', rust: '#b5562d', purple: '#8a62c9', lilac: '#c7b3e6',
  lavender: '#cdbfe8', khaki: '#b8a77a',
};

const STONE = '#bcb0a6';
const INK = '#2d2622';

export function cleanColour(hex, name) {
  if (typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex.trim())) return hex.trim().toLowerCase();
  const key = String(name ?? hex ?? '').trim().toLowerCase();
  return NAMED[key] ?? NAMED[key.split(/\s+/).pop()] ?? STONE;
}

// What the model sent for one look → pieces that are safe to draw.
export function cleanPieces(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((p) => p && KINDS.includes(p.kind))
    .slice(0, 7)
    .map((p) => ({
      kind: p.kind,
      name: String(p.name ?? ART[p.kind].label).trim().slice(0, 50) || ART[p.kind].label,
      colour: cleanColour(p.colour, p.colour_name),
      colourName: String(p.colour_name ?? '').trim().slice(0, 24),
      pattern: PATTERNS.includes(p.pattern) ? p.pattern : 'plain',
    }));
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function mix(hex, other, amount) {
  const a = hex.match(/\w\w/g).map((h) => parseInt(h, 16));
  const b = other.match(/\w\w/g).map((h) => parseInt(h, 16));
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('')}`;
}

// Light garments need a firmer outline than dark ones to stay visible on cream.
function outline(hex) {
  const [r, g, b] = hex.match(/\w\w/g).map((h) => parseInt(h, 16));
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return mix(hex, INK, light > 0.8 ? 0.45 : 0.3);
}

let uid = 0;

export function garmentSvg(piece) {
  const art = ART[piece.kind];
  const fill = piece.colour;
  const line = outline(fill);
  const id = `pt${(uid += 1)}`;
  const ink = mix(fill, INK, 0.22);
  const pattern = {
    stripes: `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${fill}"/><rect width="8" height="3" fill="${ink}"/></pattern>`,
    check: `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${fill}"/><path d="M0 0h6v12H0zM0 0h12v6H0z" fill="${ink}" opacity=".45"/></pattern>`,
    dots: `<pattern id="${id}" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="${fill}"/><circle cx="4.5" cy="4.5" r="1.6" fill="${ink}"/></pattern>`,
  }[piece.pattern];
  const paint = pattern ? `url(#${id})` : fill;
  const stroke = `stroke="${line}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;
  return `<svg class="garment" viewBox="0 0 100 100" role="img" aria-label="${esc(`${piece.colourName} ${piece.name}`.trim())}">`
    + (pattern ? `<defs>${pattern}</defs>` : '')
    + (art.line ? `<path d="${art.line}" fill="none" stroke="${fill}" stroke-width="3.2" stroke-linecap="round"/>` : '')
    + `<path d="${art.shape}" fill="${paint}" ${art.evenodd ? 'fill-rule="evenodd"' : ''} ${stroke}/>`
    + (art.detail ? `<path d="${art.detail}" fill="none" ${stroke}/>` : '')
    + '</svg>';
}

// Where each garment sits: the main column holds a dress or abaya, or a top
// over a bottom; a jacket or coat, the accessories and the shoes share the
// side column.
export function arrange(pieces) {
  const pick = (kinds) => pieces.filter((p) => kinds.includes(p.kind));
  return {
    main: [...pick(MAIN), ...pick(TOPS), ...pick(BOTTOMS)],
    side: [...pick(OUTER), ...pick(SMALL)],
  };
}

// The board, as markup. `shoePhoto` must be a data: URL the app made itself.
export function boardHtml(pieces, { shoePhoto = '', shoeLabel = 'Your shoes' } = {}) {
  const { main, side } = arrange(pieces);
  // A slight, fixed tilt per position makes it read as clothes laid out on a
  // surface rather than a grid of icons — and the same look always lands the same way.
  const tilts = [-3, 2, -1.5, 3, -2.5, 1.5, -1];
  let n = 0;
  const tile = (p, cls) => `<figure class="piece ${cls}" style="--tilt:${tilts[n++ % tilts.length]}deg">${garmentSvg(p)}</figure>`;
  const shoe = typeof shoePhoto === 'string' && shoePhoto.startsWith('data:image/')
    ? `<figure class="piece shoe"><img src="${shoePhoto}" alt="${esc(shoeLabel)}"></figure>`
    : '';
  return `<div class="board">
    <div class="board-main">${main.map((p) => tile(p, MAIN.includes(p.kind) ? 'tall' : 'wide')).join('')}</div>
    <div class="board-side ${side.length <= 2 ? 'roomy' : ''}">${side.map((p) => tile(p, OUTER.includes(p.kind) ? 'outer' : 'small')).join('')}${shoe}</div>
  </div>
  <ul class="legend">${pieces.map((p) => `<li><span class="dot" style="background:${p.colour}"></span>${esc(legendText(p))}</li>`).join('')}</ul>`;
}

// "Sage midi dress" — not "sage Sage midi dress" or "white Linen shirt".
function legendText(p) {
  const colour = p.colourName.toLowerCase();
  const name = p.name.toLowerCase();
  const text = colour && !name.includes(colour) ? `${colour} ${name}` : name;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
