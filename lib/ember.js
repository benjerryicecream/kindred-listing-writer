/**
 * Muse Ember interface — system prompt, output schema, and the single call site.
 *
 * ---------------------------------------------------------------- STUB ------
 * Day 1 build: no Meta Model API credits yet, so `generateListing()` returns a
 * canned sample listing (Calming Donut Pet Bed) plus fixed token/cost numbers.
 * STUB — replace with Meta Model API call when credits land.
 *
 * The swap is already wired: the moment META_MODEL_API_KEY exists in .env, the
 * `callEmber()` path below runs instead of the stub. Nothing else changes.
 * ---------------------------------------------------------------------------
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Model ID and prices confirmed against Meta's docs on 24 Nov 2026:
 * https://dev.meta.ai/models/muse-ember
 *
 *   muse-ember-1.0, <200k context: $0.10 / Mtok input, $0.50 / Mtok output,
 *                                  $0.004 / Mtok cached input
 *   muse-ember-1.0, >200k context: $0.30 / $1.50 / $0.012 (not used here —
 *   listing prompts run ~2k tokens, so the <200k tier always applies)
 */
export const MODEL_LABEL = process.env.EMBER_MODEL || 'muse-ember-1.0';

const API_KEY = (process.env.META_MODEL_API_KEY || '').trim();
const BASE_URL = (process.env.EMBER_BASE_URL || 'https://api.meta.ai/v1').replace(/\/+$/, '');
const PRICE_IN_PER_MTOK = Number(process.env.EMBER_PRICE_IN_PER_MTOK || 0.1);
const PRICE_OUT_PER_MTOK = Number(process.env.EMBER_PRICE_OUT_PER_MTOK || 0.5);
const PRICE_CACHED_IN_PER_MTOK = Number(process.env.EMBER_PRICE_CACHED_IN_PER_MTOK || 0.004);

export const SYSTEM_PROMPT =
  'You are the listing writer for Kindred Goods, a Shopify store selling beauty, pets, family, and wellness products. ' +
  'Write warm, plain listings. No hype, no emojis, no false claims. ' +
  'Use only the supplier specs and what the photo shows; never invent features.';

/** Strict JSON schema handed to the model. Kept in code so prompt + schema ship together. */
export const OUTPUT_SCHEMA = {
  name: 'kindred_listing',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'description', 'bullets', 'seo_tags'],
    properties: {
      title: {
        type: 'string',
        description: 'Product title, under 140 characters. No ALL CAPS, no clickbait.'
      },
      description: {
        type: 'string',
        description: '2-3 short paragraphs separated by a blank line. Warm, plain, no emojis.'
      },
      bullets: {
        type: 'array',
        minItems: 4,
        maxItems: 5,
        items: { type: 'string', description: 'One short feature bullet.' }
      },
      seo_tags: {
        type: 'array',
        minItems: 5,
        maxItems: 8,
        items: { type: 'string', description: 'Lowercase search tag, 2-4 words.' }
      }
    }
  }
};

export function isStubMode() {
  return !API_KEY;
}

/** The user turn: supplier specs + the photo, nothing else. */
export function buildUserPrompt({ productName, specs, hasImage }) {
  return [
    `Product: ${productName}`,
    hasImage
      ? 'A product photo is attached. Describe only what it clearly shows.'
      : 'No product photo is attached.',
    '',
    'Supplier specs:',
    specs.trim(),
    '',
    'Write the listing as strict JSON with exactly these keys: title, description, bullets, seo_tags.',
    '- title: under 140 characters, no ALL CAPS, no clickbait.',
    '- description: 2-3 short paragraphs separated by a blank line.',
    '- bullets: 4-5 short feature bullets.',
    '- seo_tags: 5-8 lowercase search tags.',
    'Use only the supplier specs and the photo. Do not invent features, materials, sizes, prices, or claims. ' +
      'No emojis. Return JSON only, with no prose before or after it.'
  ].join('\n');
}

/** Flattened prompt string for the local trace log (never includes image bytes). */
export function promptText({ system, user }) {
  return `[SYSTEM]\n${system}\n\n[USER]\n${user}`;
}

/**
 * STUB — replace with Meta Model API call when credits land.
 * Realistic sample copy for the Calming Donut Pet Bed, used while the API key
 * is absent. Every stub response is this listing, regardless of selected product.
 */
export const STUB_LISTING = {
  title: 'Calming Donut Pet Bed — Self-Warming Plush Cuddler, Non-Slip Base, Sizes S–XL',
  description:
    'A round, plush cuddler gives dogs and cats somewhere soft to settle into, so they curl up instead of pacing the floor.\n\n' +
    'The surface is self-warming and the base is non-slip, so the bed stays put on tile and hardwood. The whole bed is machine washable when it needs a refresh, and it comes in sizes S through XL.',
  bullets: [
    'Round plush cuddler made for pets that like to curl up',
    'Self-warming surface for a cozy spot',
    'Non-slip base keeps the bed steady on smooth floors',
    'Machine washable',
    'Sizes S–XL, from small to extra large'
  ],
  seo_tags: [
    'calming dog bed',
    'donut pet bed',
    'self-warming pet bed',
    'machine washable dog bed',
    'non-slip dog bed',
    'cuddler pet bed',
    'small to xl dog bed'
  ]
};

const STUB_USAGE = { tokensIn: 2140, tokensOut: 812 };

/** Per-listing estimate shown in the cost meter, derived from the confirmed prices. */
export const PER_LISTING_USD = Number(
  ((STUB_USAGE.tokensIn * PRICE_IN_PER_MTOK + STUB_USAGE.tokensOut * PRICE_OUT_PER_MTOK) / 1_000_000).toFixed(4)
);

/**
 * Generate one listing.
 * Returns { listing, usage, prompt }. `usage.costUsd` is what the meter adds up.
 */
export async function generateListing({ productName, specs, photo }) {
  const prompt = {
    system: SYSTEM_PROMPT,
    user: buildUserPrompt({ productName, specs, hasImage: Boolean(photo) })
  };

  if (isStubMode()) {
    // STUB — replace with Meta Model API call when credits land.
    return {
      listing: {
        title: STUB_LISTING.title,
        description: STUB_LISTING.description,
        bullets: [...STUB_LISTING.bullets],
        seo_tags: [...STUB_LISTING.seo_tags]
      },
      usage: {
        model: MODEL_LABEL,
        stub: true,
        tokensIn: STUB_USAGE.tokensIn,
        tokensOut: STUB_USAGE.tokensOut,
        costUsd: PER_LISTING_USD
      },
      prompt
    };
  }

  return callEmber({ ...prompt, photoPath: photo?.path });
}

/**
 * The real call. One POST, strict JSON schema, cost computed from returned usage.
 * NOTE: field names follow the OpenAI-compatible shape; confirm against Meta's
 * Model API docs before the first paid call on Day 2.
 */
async function callEmber({ system, user, photoPath }) {
  const content = [{ type: 'text', text: user }];
  if (photoPath) {
    content.push({ type: 'image_url', image_url: { url: await fileToDataUrl(photoPath) } });
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL_LABEL,
      temperature: 0.4,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content }
      ],
      response_format: { type: 'json_schema', json_schema: OUTPUT_SCHEMA }
    })
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw Object.assign(new Error(`Ember API ${res.status}: ${detail}`), { status: 502 });
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
  } catch {
    throw Object.assign(new Error('Ember returned output that was not valid JSON.'), { status: 502 });
  }

  const tokensIn = Number(data?.usage?.prompt_tokens ?? data?.usage?.input_tokens ?? 0);
  const tokensOut = Number(data?.usage?.completion_tokens ?? data?.usage?.output_tokens ?? 0);
  const cachedIn = Number(
    data?.usage?.prompt_tokens_details?.cached_tokens ?? data?.usage?.cached_input_tokens ?? 0
  );
  const billedIn = Math.max(tokensIn - cachedIn, 0);
  const costUsd =
    (billedIn * PRICE_IN_PER_MTOK + cachedIn * PRICE_CACHED_IN_PER_MTOK + tokensOut * PRICE_OUT_PER_MTOK) /
    1_000_000;

  return {
    listing: normaliseListing(parsed),
    usage: {
      model: MODEL_LABEL,
      stub: false,
      tokensIn,
      tokensOut,
      costUsd: Number(costUsd.toFixed(6))
    },
    prompt: { system, user }
  };
}

/** Trim, clamp, and de-duplicate model output. Never adds content of its own. */
export function normaliseListing(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const list = (v) =>
    Array.isArray(v)
      ? v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
      : [];

  let title = text(src.title).replace(/\s+/g, ' ');
  if (title.length > 140) title = title.slice(0, 140).replace(/\s+\S*$/, '');

  const tags = [...new Set(list(src.seo_tags).map((t) => t.toLowerCase()))].slice(0, 8);

  return {
    title,
    description: text(src.description),
    bullets: list(src.bullets).slice(0, 5),
    seo_tags: tags
  };
}

const MIME_BY_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function fileToDataUrl(filePath) {
  const buf = await readFile(filePath);
  const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}
