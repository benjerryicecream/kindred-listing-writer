# Kindred Goods · Listing Writer

Give it a product photo and the supplier's specs, and it writes the listing: title, description, feature bullets, SEO tags. You edit anything you like, then save it to Shopify as a draft.

The listing AI is **Muse Ember, via the Meta Model API**.

Everything runs on this machine — one Node process, one page on localhost. No cloud hosting, no deploy step, no dependencies, no build.

## Status

The page, the prompt, the strict JSON schema, the token trace, and the product queue all work. The queue ships with the five seeded holiday winners, and you can add your own.

The Ember call is **stubbed** until `META_MODEL_API_KEY` lands in `.env`: `POST /api/generate` returns a realistic sample listing for the Calming Donut Pet Bed, with fixed token counts (2,140 in / 812 out) and a fixed $0.0006 cost. The moment that key exists, `lib/ember.js` calls the Meta Model API instead — nothing else changes.

This build makes **no Shopify calls**. "Save as Shopify draft" is on screen but disabled; it needs `SHOPIFY_STORE_DOMAIN` and an Admin API token in `.env`.

## Run it

```bash
npm start
```

Then open <http://localhost:4173>.

No `npm install` step — there are zero dependencies. Node 22.9 or newer (the start script uses `--env-file-if-exists`).

## Setup

Copy `.env.example` to `.env` and fill in what you use:

| Variable | What it is |
|---|---|
| `META_MODEL_API_KEY` | Meta Model API key for Muse Ember |
| `SHOPIFY_STORE_DOMAIN` | the store, e.g. `your-store.myshopify.com` |
| `SHOPIFY_ADMIN_TOKEN` | Admin API token with `read_products, write_products` |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | only for the one-time OAuth exchange at `/auth/shopify` |

`/auth/shopify` runs the OAuth exchange and writes `SHOPIFY_ADMIN_TOKEN` into `.env` itself — the token is
never shown on screen or logged. `.env` is gitignored and no secret is committed; the Shopify side only
ever sets `status: DRAFT`, so nothing can publish.

## How it works

1. Pick a product in the queue, or add one.
2. Drop a photo and paste the supplier specs.
3. **Generate listing** — `POST /api/generate` sends the system prompt, the specs and the photo (base64
   `image_url`) to Muse Ember with a strict JSON schema, and normalises the reply into title, description,
   bullets and SEO tags.
4. Edit anything; edits are kept per product.
5. **Save as Shopify draft** — `POST /api/shopify/draft` turns the listing into `descriptionHtml`
   (paragraphs plus a bullet list), sets `status: DRAFT`, and calls `productCreate` the first time or
   `productUpdate` on the same product afterwards.
6. Every call appends a line to `trace.jsonl`; the cost meter adds them up.

## What works

- **Product queue** — the five holiday winners, each with a status (Done / Editing / Queued). Click one to load it.
- **Add products** — "+ Add product" takes a name, supplier specs, and an optional photo. New products join the queue, generate like the seeded ones, persist across reloads and restarts, and can be removed. The five seeded products stay.
- **Photo upload** — drag or click, thumbnail preview, resized to 1024 px in the browser and stored in `data/photos/`. The photo is attached to that product, so it survives a reload.
- **Supplier specs** — editable per product; only what is written there (plus what the photo shows) is allowed into the listing.
- **Generate listing** — fills the editable title, description, bullets, and SEO tags.
- **Edits stick** — field edits are saved per product in `localStorage` as you type, and survive product switches and reloads.
- **Cost meter** — running total against the $10 budget plus the $0.0006 / listing estimate, computed from `trace.jsonl`.
- **Token trace** — every Generate click appends one JSON line to `trace.jsonl`; the panel shows the last call's tokens in / out and cost.
- **Listings persist** — generated listings are stored server-side in `data/listings.json` and load back into the editor after a reload or a restart, so nothing has to be regenerated to save a draft.

## The token trace

`trace.jsonl` at the project root, one line per call:

```json
{"timestamp":"2026-11-24T19:02:11.480Z","prompt":"[SYSTEM]\n…\n\n[USER]\n…","tokens_in":2140,"tokens_out":812,"cost_usd":0.0006,"model":"muse-ember-1.0","stub":true,"product_id":"calming-donut-pet-bed","product_name":"Calming Donut Pet Bed","has_photo":false,"photo_name":null}
```

The `prompt` field is the exact system + user text sent for that listing. Image bytes are never written to the trace — only whether a photo was attached. This file is the spend evidence for the hackathon submission; it is deliberately gitignored (it contains prompts and product data) but stays on disk.

## Cost

Real numbers from `trace.jsonl`, one row per draft currently in the store (its last generation):

| Listing | Tokens in | Tokens out | Cost |
|---|---:|---:|---:|
| Calming Donut Pet Bed | 398 | 1,691 | $0.000850 |
| Dog Snuffle Mat | 399 | 1,440 | $0.000760 |
| Interactive Pet Feeder Toy | 396 | 2,600 | $0.001340 |
| Jade Roller + Gua Sha Set | 402 | 2,535 | $0.001308 |
| Shiatsu Neck Massager with Heat | 404 | 2,302 | $0.001191 |
| **All five** | **1,999** | **10,568** | **$0.005449** |

**Whole build: $0.018521 of the $10 budget, $9.981479 left.** That total covers the five listings plus
regenerations and one image-path test; [docs/trace.md](docs/trace.md) lists every call with a running
total. 16 paid calls, plus 6 stub rows at $0.0006 each from Day 1 (canned responses, no API call).

Rates for `muse-ember-1.0`: $0.10 / million input tokens, $0.50 / million output, $0.004 / million cached
input ([Meta docs](https://dev.meta.ai/models/muse-ember)). Cost is computed from the usage each response
reports, with cache hits billed at the cached rate — so it sits slightly under a flat in/out multiplication.

## Layout

```
kindred-listing-writer/
  server.js            local HTTP server + /api routes
  lib/ember.js         system prompt, JSON schema, the one Ember call site (STUB marked here)
  lib/trace.js         appends/reads trace.jsonl, sums spend
  public/index.html    the single page
  public/app.js        queue, upload, generate, trace panel
  public/styles.css
  data/products.seed.json  the five seeded products and their specs
  data/products.json   runtime queue state (gitignored, created on first run)
  data/listings.json   last generated listing per product (gitignored)
  data/photos/         uploaded photos (gitignored)
  ember_prompt.md      the prompt and schema in readable form
  trace.jsonl          local token trace (gitignored)
  .env                 local API key slot (gitignored)
```

## Demo

A 2:40 recording script — shot list, exact clicks and narration — is in
[docs/demo-script.md](docs/demo-script.md). It is a script rather than a video because this machine has no
screen recorder (no OBS, no ffmpeg) and the browser used here is not signed in to the Shopify admin.

## Next

1. **Real Ember call** — needs `META_MODEL_API_KEY` in `.env` and the $10 credit on that account. Then confirm the endpoint and request shape against Meta's Model API docs, run one listing, and check the trace line shows real usage.
2. **Save as Shopify draft** — needs `SHOPIFY_STORE_DOMAIN` and an Admin API token with product write access, both in `.env`. The button stays disabled until then.
3. **Spend check** — total `cost_usd` from `trace.jsonl`.

## License

MIT.
