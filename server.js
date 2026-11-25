/**
 * Kindred Goods · Listing Writer — local server.
 *
 * No cloud, no deploy: `npm start` serves the single page and its JSON endpoints.
 * Photo + specs in, listing out, one trace line per Generate click. The queue is
 * seeded from data/products.seed.json and kept in the gitignored data/products.json,
 * so products added in the UI survive a reload and a restart.
 * Still no Shopify calls and no paid API calls.
 */
import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PER_LISTING_USD, MODEL_LABEL, generateListing, isStubMode, promptText } from './lib/ember.js';
import { appendTrace, spendSummary, traceState } from './lib/trace.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const PRODUCTS_PATH = path.join(DATA_DIR, 'products.json');
const SEED_PATH = path.join(DATA_DIR, 'products.seed.json');
const PORT = Number(process.env.PORT || 4173);
const MAX_BODY = 12 * 1024 * 1024;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

await mkdir(PHOTO_DIR, { recursive: true });

let products = await loadProducts();

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Photo or payload is too large (12 MB limit).'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function persistProducts() {
  await writeFile(PRODUCTS_PATH, `${JSON.stringify(products, null, 2)}\n`, 'utf8');
}

async function serveFile(res, filePath) {
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

function publicProduct(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    retail: p.retail,
    status: p.status,
    specs: p.specs,
    seeded: Boolean(p.seeded),
    photo: p.photo
      ? { name: p.photo.name, url: `/photos/${p.photo.file}`, bytes: p.photo.bytes, updatedAt: p.photo.updatedAt }
      : null
  };
}

/**
 * The five seeded winners live in data/products.seed.json and stay in the queue.
 * Runtime state (added products, photos, statuses) lives in the gitignored
 * data/products.json, created from the seed on first run.
 */
async function loadProducts() {
  const seed = JSON.parse(await readFile(SEED_PATH, 'utf8'));
  const seedIds = new Set(seed.map((p) => p.id));

  let stored;
  try {
    stored = JSON.parse(await readFile(PRODUCTS_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    stored = seed;
    await writeFile(PRODUCTS_PATH, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');
  }

  return stored.map((p) => ({ ...p, seeded: p.seeded ?? seedIds.has(p.id) }));
}

function slugify(name) {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'product';
  let id = base;
  let n = 2;
  while (products.some((p) => p.id === id)) id = `${base}-${n++}`;
  return id;
}

async function handleCreateProduct(req, res) {
  const payload = JSON.parse((await readBody(req)) || '{}');
  const name = String(payload.name ?? '').trim().replace(/\s+/g, ' ');
  const specs = String(payload.specs ?? '').trim();

  if (!name) return json(res, 400, { error: 'Give the product a name.' });
  if (name.length > 120) return json(res, 400, { error: 'Product names top out at 120 characters.' });
  if (!specs) {
    return json(res, 400, {
      error: 'Supplier specs are required — the listing may only use what is written there.'
    });
  }
  if (products.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return json(res, 409, { error: `"${name}" is already in the queue.` });
  }

  const product = {
    id: slugify(name),
    name,
    category: 'added',
    retail: '',
    status: 'Queued',
    photo: null,
    specs,
    seeded: false
  };
  products.push(product);
  await persistProducts();

  return json(res, 201, { product: publicProduct(product), products: products.map(publicProduct) });
}

async function handleDeleteProduct(res, id) {
  const product = products.find((p) => p.id === id);
  if (!product) return json(res, 404, { error: 'That product is not in the queue.' });
  if (product.seeded) return json(res, 403, { error: 'The five seeded products stay in the queue.' });

  if (product.photo) await rm(path.join(PHOTO_DIR, product.photo.file), { force: true });
  products = products.filter((p) => p.id !== id);
  await persistProducts();

  return json(res, 200, { products: products.map(publicProduct) });
}

async function handleGenerate(req, res) {
  const payload = JSON.parse((await readBody(req)) || '{}');
  const product = products.find((p) => p.id === payload.productId) || null;
  if (!product) return json(res, 400, { error: 'Pick a product from the queue first.' });

  const specs = String(payload.specs ?? product.specs ?? '').trim();
  if (!specs) return json(res, 400, { error: 'Add supplier specs before generating a listing.' });

  const result = await generateListing({
    productName: product.name,
    specs,
    photo: product.photo ? { path: path.join(PHOTO_DIR, product.photo.file) } : null
  });

  const trace = {
    timestamp: new Date().toISOString(),
    prompt: promptText(result.prompt),
    tokens_in: result.usage.tokensIn,
    tokens_out: result.usage.tokensOut,
    cost_usd: result.usage.costUsd,
    model: result.usage.model,
    stub: result.usage.stub,
    product_id: product.id,
    product_name: product.name,
    has_photo: Boolean(product.photo),
    photo_name: product.photo?.name ?? null
  };
  await appendTrace(trace);

  product.status = 'Done';
  await persistProducts();

  const { spend, entries } = await traceState(6);
  return json(res, 200, {
    listing: result.listing,
    usage: result.usage,
    trace,
    spend,
    traceEntries: entries,
    products: products.map(publicProduct)
  });
}

/** Identify the image by its bytes — the MIME type a browser reports is not trustworthy. */
function sniffImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

async function handlePhoto(req, res) {
  const payload = JSON.parse((await readBody(req)) || '{}');
  const product = products.find((p) => p.id === payload.productId);
  if (!product) return json(res, 400, { error: 'Pick a product from the queue first.' });

  const match = /^data:([^;,]*);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(payload.dataUrl || ''));
  if (!match) return json(res, 400, { error: 'Upload the photo as a base64 data URL.' });

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) return json(res, 400, { error: 'That image came through empty. Try another file.' });
  if (buffer.length > MAX_PHOTO_BYTES) {
    return json(res, 413, { error: 'Photo is larger than 8 MB after resizing. Try a smaller image.' });
  }

  const ext = sniffImage(buffer);
  if (!ext) {
    return json(res, 400, {
      error: 'That file is not a JPEG, PNG, or WebP image. HEIC and RAW need exporting first.'
    });
  }

  const file = `${product.id}.${ext}`;
  const previousFile = product.photo?.file;
  await writeFile(path.join(PHOTO_DIR, file), buffer);
  if (previousFile && previousFile !== file) {
    await rm(path.join(PHOTO_DIR, previousFile), { force: true });
  }

  product.photo = {
    name: String(payload.name || 'photo.jpg').slice(0, 120),
    file,
    bytes: buffer.length,
    updatedAt: new Date().toISOString()
  };
  await persistProducts();

  return json(res, 200, {
    products: products.map(publicProduct),
    photo: { name: product.photo.name, url: `/photos/${file}`, bytes: buffer.length }
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/bootstrap') {
      const { entries, total, spend } = await traceState(6);
      return json(res, 200, {
        products: products.map(publicProduct),
        trace: entries,
        traceTotal: total,
        spend,
        config: {
          budgetUsd: spend.budgetUsd,
          perListingUsd: PER_LISTING_USD,
          model: MODEL_LABEL,
          stub: isStubMode()
        }
      });
    }

    if (req.method === 'GET' && pathname === '/api/trace') {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 6, 1), 50);
      const { entries, total, spend } = await traceState(limit);
      return json(res, 200, { entries, total, spend });
    }

    if (req.method === 'POST' && pathname === '/api/generate') return await handleGenerate(req, res);
    if (req.method === 'POST' && pathname === '/api/photo') return await handlePhoto(req, res);

    if (req.method === 'POST' && pathname === '/api/products') return await handleCreateProduct(req, res);

    if (req.method === 'DELETE' && pathname.startsWith('/api/products/')) {
      const id = decodeURIComponent(pathname.slice('/api/products/'.length));
      return await handleDeleteProduct(res, id);
    }

    if (req.method === 'DELETE' && pathname === '/api/photo') {
      const product = products.find((p) => p.id === url.searchParams.get('productId'));
      if (!product) return json(res, 400, { error: 'Pick a product from the queue first.' });
      if (product.photo) {
        await rm(path.join(PHOTO_DIR, product.photo.file), { force: true });
        product.photo = null;
        await persistProducts();
      }
      return json(res, 200, { products: products.map(publicProduct) });
    }

    if (req.method === 'GET' && pathname.startsWith('/photos/')) {
      const name = path.basename(decodeURIComponent(pathname.slice('/photos/'.length)));
      return await serveFile(res, path.join(PHOTO_DIR, name));
    }

    if (req.method === 'GET' && pathname === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }

    if (req.method === 'GET') {
      const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
      const filePath = path.resolve(PUBLIC_DIR, rel);
      if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return sendText(res, 403, 'Forbidden');
      return await serveFile(res, filePath);
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[kindred]', err);
    return json(res, status, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Kindred Goods / Listing Writer -> http://localhost:${PORT}`);
  console.log(
    isStubMode()
      ? 'Muse Ember: STUB (no META_MODEL_API_KEY in .env - no credits spent)'
      : `Muse Ember: live via ${MODEL_LABEL}`
  );
});
