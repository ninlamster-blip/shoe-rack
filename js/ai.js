// Everything the app asks Claude.
//
// This is the only file that sends anything off the phone. Each request is
// built by a plain function so the tests can check exactly what would be sent
// without touching the network:
//
//   recognise a pair   one shoe photo
//   scan the rack      one rack photo
//   check a shelf      one shelf photo
//   style a pair       that pair's photo and its type/colour/name; the answer
//                      is garments to draw (js/outfit.js), not pictures
//   shoes for outfit   one outfit photo, the occasion you typed, and a text
//                      list of candidate pairs (no photos, no names)
//   ask your rack      your question, the last few turns, and a text list of
//                      the rack from rack.js#inventory — the only request that
//                      includes first names, because "where are Ali's…" needs them
//
// The API key is the one pasted in Settings; it stays in this browser and goes
// only to api.anthropic.com.

import { TYPE_IDS, COLOURS, CONDITIONS } from './rack.js';
import { KINDS, PATTERNS } from './outfit.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';
export const MODEL = 'claude-opus-5';

const CONDITION_IDS = Object.keys(CONDITIONS);

const TYPE_GUIDE =
  'Types: sneakers (casual trainers, canvas, low/high-tops), formal (oxfords, loafers, brogues, dress shoes), ' +
  'sandals (open-toe, flip-flops, slides worn outside), boots (ankle and higher), sports (running, football, ' +
  'gym, cleats), slippers (indoor), heels (heeled shoes and pumps), other (anything else).';

const CONDITION_GUIDE =
  'Condition: good; dirty (marks, dust or stains that a clean would fix); worn (creased, scuffed, soles wearing ' +
  'but still fine); replace (split, sole coming away, worn through). Judge only what the photo shows.';

const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description) => (description ? { type: 'string', description } : { type: 'string' });
const oneOf = (values) => ({ type: 'string', enum: values });
const list = (items) => ({ type: 'array', items });

const PAIR_SCHEMA = obj({
  is_shoe: { type: 'boolean', description: 'False if the photo does not show footwear.' },
  type: oneOf(TYPE_IDS),
  colour: oneOf(COLOURS),
  brand: str('Brand if a logo or name is clearly visible, else empty.'),
  name: str('Short everyday name, e.g. "White leather low-tops".'),
  size: str('Size only if printed and readable in the photo (e.g. "EU 38", "UK 5"), else empty.'),
  condition: oneOf(CONDITION_IDS),
  care_tip: str('One short, specific care tip for this material and condition.'),
  confidence: oneOf(['high', 'medium', 'low']),
});

const SCAN_SCHEMA = obj({
  pairs: list(obj({
    type: oneOf(TYPE_IDS),
    colour: oneOf(COLOURS),
    name: str(),
    brand: str('Only if clearly readable, else empty.'),
    condition: oneOf(CONDITION_IDS),
    box: { type: 'array', items: { type: 'integer' }, description: '[left, top, right, bottom] around the pair, each 0–1000 as a fraction of the image width/height.' },
  })),
});

const SHELF_SCHEMA = obj({
  pairs: list(obj({
    type: oneOf(TYPE_IDS),
    colour: oneOf(COLOURS),
    name: str(),
    position: str('Where on the shelf, e.g. "far left", "second from right".'),
  })),
});

const LOOKS_SCHEMA = obj({
  looks: list(obj({
    title: str('e.g. "Weekend brunch"'),
    pieces: list(obj({
      kind: oneOf(KINDS),
      name: str('Short, specific, e.g. "Linen midi dress", "Straight-leg jeans".'),
      colour: str('The colour as a hex code, e.g. "#a7b89a".'),
      colour_name: str('One or two words, e.g. "sage", "light denim".'),
      pattern: oneOf(PATTERNS),
    })),
    occasion: str(),
    why: str('One sentence on why it works with these shoes.'),
  })),
  avoid: str('One short line on what not to pair them with, or empty.'),
});

const OUTFIT_SCHEMA = obj({
  outfit: str('A few words describing the outfit in the photo.'),
  pick: obj({ pair_id: str(), why: str() }),
  alternatives: list(obj({ pair_id: str(), why: str() })),
  missing: str('If nothing on the rack suits it, the kind of shoe that would. Else empty.'),
});

const ASK_SCHEMA = obj({
  answer: str('Plain, friendly, short. Name shelves by number.'),
  pair_ids: list(str('ids of pairs the answer refers to, from the inventory')),
});

function request({ content, schema, effort = 'low', system, history = [] }) {
  return {
    model: MODEL,
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    ...(system ? { system } : {}),
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [...history, { role: 'user', content }],
  };
}

const image = (data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });

export function pairRequest(photo) {
  return request({
    schema: PAIR_SCHEMA,
    content: [
      image(photo),
      {
        type: 'text',
        text: `This is a photo of one pair of shoes from a family shoe rack. Identify it. ${TYPE_GUIDE} ${CONDITION_GUIDE} ` +
          'Pick the single closest colour. Only name a brand or size you can actually read.',
      },
    ],
  });
}

export function scanRequest(photo) {
  return request({
    schema: SCAN_SCHEMA,
    effort: 'medium',
    content: [
      image(photo),
      {
        type: 'text',
        text: `This is a photo of a family shoe rack. List every pair you can see, shelf by shelf, left to right. ${TYPE_GUIDE} ` +
          `${CONDITION_GUIDE} Count a pair once even if the two shoes are apart, and give a box that contains both shoes. ` +
          'Skip anything that is not footwear and anything too hidden to identify.',
      },
    ],
  });
}

export function shelfRequest(photo) {
  return request({
    schema: SHELF_SCHEMA,
    content: [
      image(photo),
      {
        type: 'text',
        text: `This is a photo of one shelf of a shoe rack. List every pair you can see, left to right. ${TYPE_GUIDE} ` +
          'Count a pair once even if the two shoes are apart. Skip anything that is not footwear.',
      },
    ],
  });
}

export function styleRequest(photo, pair, occasion = '') {
  const about = [pair.colour, pair.name || pair.type].filter(Boolean).join(' ');
  return request({
    schema: LOOKS_SCHEMA,
    effort: 'medium',
    content: [
      ...(photo ? [image(photo)] : []),
      {
        type: 'text',
        text: `These shoes are: ${about} (${pair.type}). Suggest three complete outfits they would look good with, ` +
          'from pieces a family wardrobe is likely to have. Each outfit is drawn as a flat-lay picture, so give 3–5 ' +
          'pieces: either a dress or abaya, or a top (top, shirt or knit) with a bottom (trousers, shorts or skirt); ' +
          'optionally a jacket or coat and one or two accessories (scarf or hijab, bag, hat, belt, jewellery). ' +
          'Do not list the shoes themselves. Give each piece a realistic colour as a hex code, and a pattern only if ' +
          `it really matters to the look. Vary the occasions.${occasion ? ` Focus on this occasion: ${occasion}.` : ''}`,
      },
    ],
  });
}

// `candidates` is a list from rack.js#inventory with the owner removed.
export function outfitRequest(photo, occasion, candidates) {
  return request({
    schema: OUTFIT_SCHEMA,
    effort: 'medium',
    content: [
      image(photo),
      {
        type: 'text',
        text: 'This photo shows an outfit (for example a dress). Choose the best shoes for it from the pairs below, ' +
          'and up to two alternatives. Consider colour, formality, season and the occasion. Use pair ids exactly as ' +
          `given. Skip pairs marked replace.${occasion ? ` Occasion: ${occasion}.` : ''}\n\n` +
          `Pairs:\n${JSON.stringify(candidates)}`,
      },
    ],
  });
}

// `history` is earlier turns as { role, content: string }; only the latest
// question carries the inventory, so it isn't repeated turn after turn.
export function askRequest(question, rack, history = []) {
  return request({
    schema: ASK_SCHEMA,
    effort: 'medium',
    system:
      'You help a family manage their shoe rack. Answer only from the inventory given; if something is not in it, ' +
      'say so plainly. Shelves are numbered from the top. last_worn_days_ago is null if never logged. Keep answers ' +
      'short and practical, and reply in the language the question is asked in.',
    history: history.slice(-4).map((t) => ({ role: t.role, content: String(t.content) })),
    content: [{ type: 'text', text: `Rack inventory:\n${JSON.stringify(rack)}\n\nQuestion: ${question}` }],
  });
}

// ---------- sending ----------

let clientPromise;
let clientKey;

async function client(apiKey) {
  if (!clientPromise || clientKey !== apiKey) {
    clientKey = apiKey;
    clientPromise = import(SDK_URL).then(
      ({ default: Anthropic }) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 90_000 }),
    );
  }
  return clientPromise;
}

export class AIError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

async function send(apiKey, body) {
  if (!apiKey) throw new AIError('no-key', 'Add your Anthropic API key in Settings first.');
  if (!navigator.onLine) throw new AIError('offline', "You're offline. Try again when you have a signal.");
  let res;
  try {
    const c = await client(apiKey);
    res = await c.beta.messages.create(body);
  } catch (err) {
    const status = err?.status;
    if (status === 401) throw new AIError('bad-key', 'That API key was refused. Check it in Settings.');
    if (status === 429) throw new AIError('busy', 'Too many requests just now. Try again in a minute.');
    if (/credit balance/i.test(String(err?.message))) throw new AIError('credit', 'Your Anthropic account is out of credit. Top it up at console.anthropic.com.');
    throw new AIError('network', "Couldn't reach Claude. Check your signal and try again.");
  }
  if (res.stop_reason === 'refusal') throw new AIError('refused', "Claude couldn't help with that one.");
  if (res.stop_reason === 'max_tokens') throw new AIError('garbled', 'That answer ran long and got cut off. Try again.');
  const text = res.content.find((b) => b.type === 'text')?.text;
  try {
    return JSON.parse(text);
  } catch {
    throw new AIError('garbled', "Claude's answer didn't come through cleanly. Try once more.");
  }
}

export const recognisePair = (key, photo) => send(key, pairRequest(photo));
export const scanRack = (key, photo) => send(key, scanRequest(photo));
export const readShelf = (key, photo) => send(key, shelfRequest(photo));
export const styleShoes = (key, photo, pair, occasion) => send(key, styleRequest(photo, pair, occasion));
export const shoesForOutfit = (key, photo, occasion, candidates) => send(key, outfitRequest(photo, occasion, candidates));
export const askRack = (key, question, rack, history) => send(key, askRequest(question, rack, history));
