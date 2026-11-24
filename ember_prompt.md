# Muse Ember — listing prompt and output contract

The source of truth lives in [`lib/ember.js`](lib/ember.js) (`SYSTEM_PROMPT`, `OUTPUT_SCHEMA`, `buildUserPrompt`). This file mirrors it in readable form for review and for the hackathon write-up. If the two ever disagree, the code wins.

Model: **Muse Ember via the Meta Model API** — `muse-ember-1.0` (`EMBER_MODEL`), with prices confirmed against https://dev.meta.ai/models/muse-ember on 24 Nov 2026.

## System prompt

> You are the listing writer for Kindred Goods, a Shopify store selling beauty, pets, family, and wellness products. Write warm, plain listings. No hype, no emojis, no false claims. Use only the supplier specs and what the photo shows; never invent features.

## User message

```
Product: {product name}
{A product photo is attached. Describe only what it clearly shows. | No product photo is attached.}

Supplier specs:
{supplier specs text}

Write the listing as strict JSON with exactly these keys: title, description, bullets, seo_tags.
- title: under 140 characters, no ALL CAPS, no clickbait.
- description: 2-3 short paragraphs separated by a blank line.
- bullets: 4-5 short feature bullets.
- seo_tags: 5-8 lowercase search tags.
Use only the supplier specs and the photo. Do not invent features, materials, sizes, prices, or claims. No emojis. Return JSON only, with no prose before or after it.
```

Implementation: system prompt as the `system` message; the block above as a single `user` message with the photo attached as an image part.

## Output schema

Strict JSON, no wrapper text.

```json
{
  "name": "kindred_listing",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["title", "description", "bullets", "seo_tags"],
    "properties": {
      "title":       { "type": "string", "description": "Product title, under 140 characters. No ALL CAPS, no clickbait." },
      "description": { "type": "string", "description": "2-3 short paragraphs separated by a blank line. Warm, plain, no emojis." },
      "bullets":     { "type": "array", "minItems": 4, "maxItems": 5, "items": { "type": "string" } },
      "seo_tags":    { "type": "array", "minItems": 5, "maxItems": 8, "items": { "type": "string" } }
    }
  }
}
```

## Contract checks after parsing

`normaliseListing()` trims and clamps — it never adds content:

- title collapses whitespace; over 140 characters gets cut on a word boundary
- description keeps its blank-line paragraph breaks
- bullets: 4–5 kept, empties dropped
- seo_tags: lowercased, de-duplicated, max 8

## Stub sample (Day 1, no credits spent)

While `META_MODEL_API_KEY` is absent, `POST /api/generate` returns this for every product:

```json
{
  "title": "Calming Donut Pet Bed — Self-Warming Plush Cuddler, Non-Slip Base, Sizes S–XL",
  "description": "A round, plush cuddler gives dogs and cats somewhere soft to settle into, so they curl up instead of pacing the floor.\n\nThe surface is self-warming and the base is non-slip, so the bed stays put on tile and hardwood. The whole bed is machine washable when it needs a refresh, and it comes in sizes S through XL.",
  "bullets": [
    "Round plush cuddler made for pets that like to curl up",
    "Self-warming surface for a cozy spot",
    "Non-slip base keeps the bed steady on smooth floors",
    "Machine washable",
    "Sizes S–XL, from small to extra large"
  ],
  "seo_tags": [
    "calming dog bed",
    "donut pet bed",
    "self-warming pet bed",
    "machine washable dog bed",
    "non-slip dog bed",
    "cuddler pet bed",
    "small to xl dog bed"
  ]
}
```

Fixed stub usage: 2,140 tokens in, 812 out, $0.0006 — so the cost meter and trace panel exercise the real code path before any credits are spent.

## Swapping the stub for the real call

1. Put the key in `.env`: `META_MODEL_API_KEY=…`
2. Confirm `EMBER_BASE_URL` / `EMBER_MODEL` and the response shape against Meta's Model API docs (the request currently uses the OpenAI-compatible chat-completions shape with `response_format: json_schema`).
3. Restart `npm start`. `isStubMode()` turns false and `callEmber()` runs; cost comes from the returned token usage at the confirmed $0.10 / million input and $0.50 / million output ($0.004 cached input).
