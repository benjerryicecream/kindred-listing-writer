/**
 * Shopify Admin API — draft product save.
 *
 * Drafts only: the mutation always sets status: DRAFT, and Shopify keeps
 * productCreate products unpublished unless something explicitly publishes them.
 * Credentials come from .env (gitignored): SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_TOKEN.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRAFTS_PATH = path.join(ROOT, 'data', 'shopify-drafts.json');

export const STORE = (process.env.SHOPIFY_STORE_DOMAIN || '')
  .trim()
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');
const API_VERSION = (process.env.SHOPIFY_API_VERSION || '2026-10').trim();

/** Read lazily: the OAuth callback sets this at runtime, no restart needed. */
const token = () => (process.env.SHOPIFY_ADMIN_TOKEN || '').trim();

export function isShopifyConfigured() {
  return Boolean(STORE && token());
}

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Shape the listing for Shopify: paragraphs as <p>, bullets as a <ul>, tags as
 * the product tag list. Status is always DRAFT — nothing here can publish.
 */
export function buildProductInput({ title, description, bullets, tags, seo_tags }) {
  const paragraphs = String(description || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const list = Array.isArray(bullets) ? bullets.map((b) => String(b).trim()).filter(Boolean) : [];

  const descriptionHtml = [
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    list.length ? `<ul>${list.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''
  ].join('');

  return {
    title: String(title || '').trim().slice(0, 255),
    descriptionHtml,
    status: 'DRAFT',
    tags: (Array.isArray(tags) ? tags : Array.isArray(seo_tags) ? seo_tags : [])
      .map((t) => String(t).trim())
      .filter(Boolean)
      .slice(0, 250)
  };
}

const PRODUCT_CREATE = `mutation KindredProductCreate($product: ProductCreateInput!) {
  productCreate(product: $product) {
    product { id title handle status }
    userErrors { field message }
  }
}`;

const PRODUCT_UPDATE = `mutation KindredProductUpdate($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product { id title handle status }
    userErrors { field message }
  }
}`;

async function readDraftMap() {
  try {
    return JSON.parse(await readFile(DRAFTS_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return {};
  }
}

async function writeDraftMap(map) {
  await writeFile(DRAFTS_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
}

async function graphql(query, variables) {
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token()
    },
    body: JSON.stringify({ query, variables })
  });

  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw Object.assign(new Error(`Shopify returned a non-JSON reply (HTTP ${res.status}).`), { status: 502 });
  }

  if (!res.ok) {
    const detail = payload?.errors ? JSON.stringify(payload.errors) : text.slice(0, 200);
    throw Object.assign(new Error(`Shopify HTTP ${res.status}: ${detail}`), { status: 502 });
  }
  if (Array.isArray(payload.errors) && payload.errors.length) {
    throw Object.assign(
      new Error(`Shopify error: ${payload.errors.map((e) => e.message).join('; ')}`),
      { status: 502 }
    );
  }
  return payload.data;
}

/**
 * Create a draft, or update the draft already saved for this product, so a
 * second click never creates a duplicate.
 */
export async function saveDraft({ productId, listing }) {
  if (!isShopifyConfigured()) {
    throw Object.assign(
      new Error('Shopify is not configured yet: add SHOPIFY_ADMIN_TOKEN to .env (write_products).'),
      { status: 503 }
    );
  }

  const input = buildProductInput(listing || {});
  if (!input.title) {
    throw Object.assign(new Error('Generate a listing before saving a draft.'), { status: 400 });
  }

  const map = await readDraftMap();
  const existing = map[productId]?.gid;

  const data = existing
    ? await graphql(PRODUCT_UPDATE, { product: { id: existing, ...input } })
    : await graphql(PRODUCT_CREATE, { product: input });

  const result = existing ? data.productUpdate : data.productCreate;
  const errors = result?.userErrors || [];
  if (errors.length) {
    throw Object.assign(
      new Error(`Shopify rejected the draft: ${errors.map((e) => e.message).join('; ')}`),
      { status: 422 }
    );
  }

  const product = result.product;
  const numericId = String(product.id).split('/').pop();

  map[productId] = {
    gid: product.id,
    handle: product.handle,
    adminUrl: `https://${STORE}/admin/products/${numericId}`,
    updatedAt: new Date().toISOString()
  };
  await writeDraftMap(map);

  return {
    created: !existing,
    gid: product.id,
    numericId,
    handle: product.handle,
    status: product.status,
    adminUrl: map[productId].adminUrl
  };
}

export async function savedDrafts() {
  return readDraftMap();
}
