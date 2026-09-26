// Recognising a pair, and checking a shelf, with Claude.
//
// This is the only file that sends anything off the phone, and what it sends is
// one photo plus a fixed instruction — never the family's names or the rest of
// the rack. The API key is the one you pasted in Settings; it stays in this
// browser and goes only to api.anthropic.com.
//
// The request builders are plain functions so the tests can check exactly what
// would be sent without touching the network.

import { TYPE_IDS, COLOURS } from './rack.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';
export const MODEL = 'claude-opus-5';

const PAIR_SCHEMA = {
  type: 'object',
  properties: {
    is_shoe: { type: 'boolean', description: 'False if the photo does not show footwear.' },
    type: { type: 'string', enum: TYPE_IDS },
    colour: { type: 'string', enum: COLOURS },
    brand: { type: 'string', description: 'Brand if a logo or name is clearly visible, else empty.' },
    name: { type: 'string', description: 'Short everyday name, e.g. "White leather low-tops".' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['is_shoe', 'type', 'colour', 'brand', 'name', 'confidence'],
  additionalProperties: false,
};

const SHELF_SCHEMA = {
  type: 'object',
  properties: {
    pairs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: TYPE_IDS },
          colour: { type: 'string', enum: COLOURS },
          name: { type: 'string' },
          position: { type: 'string', description: 'Where on the shelf, e.g. "far left", "second from right".' },
        },
        required: ['type', 'colour', 'name', 'position'],
        additionalProperties: false,
      },
    },
  },
  required: ['pairs'],
  additionalProperties: false,
};

const TYPE_GUIDE =
  'Types: sneakers (casual trainers, canvas, low/high-tops), formal (oxfords, loafers, brogues, dress shoes), ' +
  'sandals (open-toe, flip-flops, slides worn outside), boots (ankle and higher), sports (running, football, ' +
  'gym, cleats), slippers (indoor), heels (heeled shoes and pumps), other (anything else).';

function request(dataBase64, prompt, schema) {
  return {
    model: MODEL,
    max_tokens: 2048,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dataBase64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  };
}

export function pairRequest(dataBase64) {
  return request(
    dataBase64,
    `This is a photo of one pair of shoes from a family shoe rack. Identify it. ${TYPE_GUIDE} ` +
      'Pick the single closest colour. Only name a brand you can actually read or clearly recognise.',
    PAIR_SCHEMA,
  );
}

export function shelfRequest(dataBase64) {
  return request(
    dataBase64,
    `This is a photo of one shelf of a shoe rack. List every pair you can see, left to right. ${TYPE_GUIDE} ` +
      'Count a pair once even if the two shoes are apart. Skip anything that is not footwear.',
    SHELF_SCHEMA,
  );
}

let clientPromise;
let clientKey;

async function client(apiKey) {
  if (!clientPromise || clientKey !== apiKey) {
    clientKey = apiKey;
    clientPromise = import(SDK_URL).then(
      ({ default: Anthropic }) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 }),
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
  if (!apiKey) throw new AIError('no-key', 'Add your Anthropic API key in Settings to recognise shoes.');
  if (!navigator.onLine) throw new AIError('offline', "You're offline. Choose the type yourself — it takes a second.");
  let res;
  try {
    const c = await client(apiKey);
    res = await c.beta.messages.create(body);
  } catch (err) {
    const status = err?.status;
    if (status === 401) throw new AIError('bad-key', 'That API key was refused. Check it in Settings.');
    if (status === 429) throw new AIError('busy', 'Too many requests just now. Try again in a minute.');
    throw new AIError('network', "Couldn't reach Claude. Choose the type yourself, or try again.");
  }
  if (res.stop_reason === 'refusal') throw new AIError('refused', "Claude couldn't read this photo. Choose the type yourself.");
  const text = res.content.find((b) => b.type === 'text')?.text;
  try {
    return JSON.parse(text);
  } catch {
    throw new AIError('garbled', "Claude's answer didn't come through cleanly. Try once more.");
  }
}

export const recognisePair = (apiKey, b64) => send(apiKey, pairRequest(b64));
export const readShelf = (apiKey, b64) => send(apiKey, shelfRequest(b64));
