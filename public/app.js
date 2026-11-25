/**
 * Kindred Goods · Listing Writer — single page app.
 * Plain ES modules, no build step, no dependencies.
 */
const STORAGE_KEY = 'kindred.drafts.v1';
const ACTIVE_KEY = 'kindred.activeId.v1';
const MAX_IMAGE_EDGE = 1024;

const els = {
  spendValue: document.getElementById('spend-value'),
  meterFill: document.getElementById('meter-fill'),
  perListing: document.getElementById('per-listing'),
  callCount: document.getElementById('call-count'),
  queue: document.getElementById('queue'),
  queueCount: document.getElementById('queue-count'),
  addProduct: document.getElementById('add-product'),
  addDialog: document.getElementById('add-product-dialog'),
  addForm: document.getElementById('add-product-form'),
  addName: document.getElementById('new-name'),
  addSpecs: document.getElementById('new-specs'),
  addPhoto: document.getElementById('new-photo'),
  addPhotoPreview: document.getElementById('new-photo-preview'),
  addError: document.getElementById('add-product-error'),
  addCancel: document.getElementById('add-product-cancel'),
  addSave: document.getElementById('add-product-save'),
  activeProduct: document.getElementById('active-product'),
  dropZone: document.getElementById('drop-zone'),
  photoInput: document.getElementById('photo-input'),
  photoEmpty: document.getElementById('photo-empty'),
  photoThumb: document.getElementById('photo-thumb'),
  photoMeta: document.getElementById('photo-meta'),
  photoName: document.getElementById('photo-name'),
  photoRemove: document.getElementById('photo-remove'),
  specs: document.getElementById('specs'),
  title: document.getElementById('title'),
  titleCount: document.getElementById('title-count'),
  description: document.getElementById('description'),
  bullets: document.getElementById('bullets'),
  addBullet: document.getElementById('add-bullet'),
  tags: document.getElementById('tags'),
  generate: document.getElementById('generate'),
  saveDraft: document.getElementById('save-draft'),
  shopifyHint: document.getElementById('shopify-hint'),
  status: document.getElementById('status'),
  traceLast: document.getElementById('trace-last'),
  traceList: document.getElementById('trace-list'),
  traceTotal: document.getElementById('trace-total')
};

const state = {
  products: [],
  config: { budgetUsd: 10, perListingUsd: 0.0006, stub: true, model: 'Muse Ember' },
  activeId: null,
  drafts: {},
  trace: [],
  traceTotal: 0,
  spend: { totalUsd: 0, calls: 0, budgetUsd: 10 },
  shopify: { configured: false, store: '', drafts: {} },
  busy: false
};

/* ---------------------------------------------------------------- helpers */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const formatSpend = (value) => (value === 0 ? '$0.00' : `$${value.toFixed(4)}`);

const formatCost = (value) => `$${Number(value || 0).toFixed(4)}`;

const formatNumber = (value) => Number(value || 0).toLocaleString('en-US');

const formatTime = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

function loadDrafts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

let draftTimer = null;

function writeDrafts() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.drafts));
    } catch {
      /* storage full or blocked — edits still live in the page */
    }
  }, 200);
}

function persistDraft() {
  if (!state.activeId) return;
  state.drafts[state.activeId] = {
    specs: els.specs.value,
    ...readListing()
  };
  writeDrafts();
}

/** Save a generated listing against the product it was written for. */
function saveDraftFor(id, listing, specs) {
  state.drafts[id] = {
    title: listing.title || '',
    description: listing.description || '',
    bullets: Array.isArray(listing.bullets) ? [...listing.bullets] : [],
    tags: Array.isArray(listing.tags) ? listing.tags.join(', ') : listing.tags || '',
    specs
  };
  writeDrafts();
}

function readListing() {
  return {
    title: els.title.value.trim(),
    description: els.description.value.trim(),
    bullets: [...els.bullets.querySelectorAll('.bullet-input')]
      .map((input) => input.value.trim())
      .filter(Boolean),
    tags: els.tags.value.trim()
  };
}

function setStatus(message, tone) {
  els.status.textContent = message || '';
  els.status.className = 'status' + (tone ? ` is-${tone}` : '');
}

/** Turn a network failure into something Chase can act on. */
function explainError(err) {
  const message = (err && err.message) || String(err || 'Something went wrong');
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return 'Cannot reach the local server. Check that npm start is still running, then try again.';
  }
  return message;
}

/* ---------------------------------------------------------------- render */

function renderQueue() {
  els.queue.replaceChildren();
  els.queueCount.textContent = String(state.products.length);

  for (const product of state.products) {
    const item = el('button', 'queue-item' + (product.id === state.activeId ? ' is-active' : ''));
    item.type = 'button';
    item.dataset.id = product.id;
    item.addEventListener('click', () => selectProduct(product.id));

    const top = el('span', 'queue-item-top');
    top.append(el('span', 'queue-name', product.name));
    top.append(el('span', `pill pill-${product.status.toLowerCase()}`, product.status));

    const meta = el('span', 'queue-meta');
    meta.append(el('span', `queue-dot ${product.photo ? 'has-photo' : 'no-photo'}`));
    const facts = [product.category, product.retail].filter(Boolean);
    facts.forEach((fact, index) => {
      if (index) meta.append(el('span', 'dot', '·'));
      meta.append(el('span', null, fact));
    });

    item.append(top, meta);

    const li = el('li', 'queue-li');
    li.append(item);

    if (!product.seeded) {
      const remove = el('button', 'queue-remove', '×');
      remove.type = 'button';
      remove.title = `Remove ${product.name}`;
      remove.setAttribute('aria-label', `Remove ${product.name}`);
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        deleteProduct(product.id);
      });
      li.append(remove);
    }

    els.queue.append(li);
  }
}

function renderBullets(bullets) {
  els.bullets.replaceChildren();
  const rows = bullets.length ? bullets : [''];
  for (const text of rows) addBulletRow(text);
}

function addBulletRow(text = '') {
  const row = el('div', 'bullet-row');
  row.append(el('span', 'bullet-dot', '•'));

  const input = el('input', 'bullet-input');
  input.type = 'text';
  input.value = text;
  input.placeholder = 'One feature, one line';
  input.addEventListener('input', persistDraft);

  const remove = el('button', 'icon-btn', '×');
  remove.type = 'button';
  remove.title = 'Remove bullet';
  remove.setAttribute('aria-label', 'Remove bullet');
  remove.addEventListener('click', () => {
    row.remove();
    persistDraft();
    updateTitleCount();
  });

  row.append(input, remove);
  els.bullets.append(row);
}

function fillListing(listing) {
  els.title.value = listing.title || '';
  els.description.value = listing.description || '';
  els.tags.value = Array.isArray(listing.tags) ? listing.tags.join(', ') : listing.tags || '';
  renderBullets(Array.isArray(listing.bullets) ? listing.bullets : []);
  updateTitleCount();
  updateShopifyButton();
}

function updateShopifyButton() {
  const hasListing = els.title.value.trim().length > 0;
  els.saveDraft.disabled = !state.shopify.configured || !hasListing || !state.activeId;
  els.saveDraft.title = state.shopify.configured
    ? 'Creates a draft product in Shopify. Never publishes.'
    : 'Add SHOPIFY_ADMIN_TOKEN to .env to enable this';

  if (!state.shopify.configured) {
    els.shopifyHint.textContent = 'needs SHOPIFY_ADMIN_TOKEN';
    els.shopifyHint.classList.remove('pending-link');
    return;
  }

  const saved = state.activeId ? state.shopify.drafts[state.activeId] : null;
  if (saved && els.title.value.trim()) {
    const link = el('a', 'pending-link', 'view draft in Shopify');
    link.href = saved.adminUrl;
    link.target = '_blank';
    link.rel = 'noreferrer';
    els.shopifyHint.replaceChildren(link);
  } else {
    els.shopifyHint.textContent = 'drafts only · never publishes';
    els.shopifyHint.classList.remove('pending-link');
  }
}

function updateTitleCount() {
  const length = els.title.value.length;
  els.titleCount.textContent = `${length} / 140`;
  els.titleCount.classList.toggle('over', length > 140);
}

function renderPhoto(product) {
  const photo = product?.photo;
  if (photo) {
    els.photoThumb.src = photo.updatedAt ? `${photo.url}?v=${encodeURIComponent(photo.updatedAt)}` : photo.url;
    els.photoThumb.hidden = false;
    els.photoEmpty.hidden = true;
    els.photoName.textContent = `${photo.name} · ${Math.round(photo.bytes / 1024)} KB`;
    els.photoMeta.hidden = false;
  } else {
    els.photoThumb.removeAttribute('src');
    els.photoThumb.hidden = true;
    els.photoEmpty.hidden = false;
    els.photoMeta.hidden = true;
  }
}

function renderSpend() {
  const { totalUsd, calls, budgetUsd } = state.spend;
  els.spendValue.textContent = formatSpend(totalUsd);
  els.perListing.textContent = `${formatCost(state.config.perListingUsd)} / listing`;
  els.callCount.textContent = `${calls} ${calls === 1 ? 'call' : 'calls'}`;

  const pct = budgetUsd > 0 ? (totalUsd / budgetUsd) * 100 : 0;
  els.meterFill.style.width = totalUsd > 0 ? `${Math.min(100, Math.max(1.5, pct))}%` : '0%';
}

function renderTrace(entries = state.trace, total = state.traceTotal) {
  state.trace = entries;
  state.traceTotal = total;

  els.traceTotal.textContent = `trace.jsonl · ${total} ${total === 1 ? 'line' : 'lines'}`;
  els.traceLast.replaceChildren();

  const last = entries[0];
  if (!last) {
    els.traceLast.append(el('p', 'empty', 'No calls yet. Generate a listing to write the first line of trace.jsonl.'));
    els.traceList.replaceChildren();
    return;
  }

  const stats = el('div', 'trace-stats');
  const cells = [
    ['Model', `${last.model || state.config.model}${last.stub ? ' · stub' : ''}`],
    ['Tokens in', formatNumber(last.tokens_in)],
    ['Tokens out', formatNumber(last.tokens_out)],
    ['Cost', formatCost(last.cost_usd)]
  ];
  for (const [label, value] of cells) {
    const cell = el('div', 'stat');
    cell.append(el('span', 'stat-label', label), el('span', 'stat-value', value));
    stats.append(cell);
  }
  els.traceLast.append(stats);
  els.traceLast.append(
    el('p', 'trace-note', `${last.product_name || 'Unknown product'} · ${formatTime(last.timestamp)}${last.has_photo ? ' · photo sent' : ''}`)
  );

  els.traceList.replaceChildren();
  const caption = el('div', 'trace-caption');
  caption.append(el('span', null, 'Time'), el('span', null, 'Product'), el('span', null, 'Tokens in / out'), el('span', null, 'Cost'));
  els.traceList.append(caption);

  for (const entry of entries.slice(0, 6)) {
    const row = el('div', 'trace-row');
    row.append(el('span', null, formatTime(entry.timestamp)));
    row.append(el('span', 'truncate', entry.product_name || '—'));
    row.append(el('span', 'num', `${formatNumber(entry.tokens_in)} / ${formatNumber(entry.tokens_out)}`));
    row.append(el('span', 'num', formatCost(entry.cost_usd)));
    els.traceList.append(row);
  }
}

/* ---------------------------------------------------------------- actions */

function selectProduct(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;

  if (state.activeId && state.activeId !== id) persistDraft();

  state.activeId = id;
  const draft = state.drafts[id];

  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* private mode — selection just won't survive a reload */
  }

  els.activeProduct.textContent = product.name;
  els.specs.value = draft?.specs ?? product.specs;
  fillListing(draft ?? {});
  renderPhoto(product);
  renderQueue();
  updateShopifyButton();
  setStatus('');
}

/** Trust the bytes, not the browser's MIME guess: some sources hand over an empty type. */
async function sniffImageType(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const ascii = (from, to) => String.fromCharCode(...head.slice(from, to));
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
    return null;
  } catch {
    return null;
  }
}

async function uploadPhoto(file) {
  if (!state.activeId) {
    setStatus('Pick a product from the queue first.', 'error');
    return false;
  }

  const declaredType = String(file.type || '').toLowerCase();
  const sniffedType = await sniffImageType(file);
  const type = sniffedType || (/^image\/(jpeg|png|webp)$/.test(declaredType) ? declaredType : null);
  if (!type) {
    setStatus(`"${file.name}" is not a JPEG, PNG, or WebP image.`, 'error');
    return false;
  }

  setStatus('Reading photo…');
  let dataUrl;
  try {
    dataUrl = await resizeImage(file, MAX_IMAGE_EDGE);
  } catch {
    setStatus(`Could not decode "${file.name}". HEIC and RAW files need exporting as JPEG first.`, 'error');
    return false;
  }

  els.photoThumb.src = dataUrl;
  els.photoThumb.hidden = false;
  els.photoEmpty.hidden = true;

  const uploadingFor = state.activeId;
  try {
    const res = await fetch('/api/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: uploadingFor, dataUrl, name: file.name })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed (HTTP ${res.status})`);

    state.products = data.products;
    renderQueue();
    renderPhoto(state.products.find((p) => p.id === state.activeId));
    setStatus(`Photo attached · ${data.photo.name} · ${Math.round(data.photo.bytes / 1024)} KB`, 'ok');
    return true;
  } catch (err) {
    setStatus(`Photo upload failed: ${explainError(err)}`, 'error');
    renderPhoto(state.products.find((p) => p.id === state.activeId));
    return false;
  }
}

function resizeImage(file, maxEdge) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unreadable image'));
    };
    img.src = url;
  });
}

async function generateListing() {
  if (state.busy) return;
  if (!state.activeId) {
    setStatus('Pick a product from the queue first.', 'error');
    return;
  }
  const specs = els.specs.value.trim();
  if (!specs) {
    setStatus('Add supplier specs before generating.', 'error');
    els.specs.focus();
    return;
  }

  const requestProduct = state.activeId;
  state.busy = true;
  els.generate.disabled = true;
  els.generate.textContent = 'Drafting…';
  setStatus('Muse Ember is drafting the listing…');

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: requestProduct, specs })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Generate failed (HTTP ${res.status})`);

    const listing = {
      title: data.listing.title,
      description: data.listing.description,
      bullets: data.listing.bullets,
      tags: data.listing.seo_tags
    };
    saveDraftFor(requestProduct, listing, specs);

    state.spend = data.spend;
    state.products = data.products;
    renderSpend();
    renderQueue();
    renderTrace(data.traceEntries, data.spend.calls);

    if (state.activeId !== requestProduct) {
      setStatus('Listing written for the product you started on. Switch back to see it.', 'ok');
      return;
    }

    fillListing(listing);
    renderPhoto(state.products.find((p) => p.id === state.activeId));

    const cost = formatCost(data.usage.costUsd);
    setStatus(
      data.usage.stub
        ? `Stub listing written · ${formatNumber(data.usage.tokensIn)} in / ${formatNumber(data.usage.tokensOut)} out · ${cost} logged (no credits spent).`
        : `Listing drafted · ${formatNumber(data.usage.tokensIn)} in / ${formatNumber(data.usage.tokensOut)} out · ${cost}.`,
      'ok'
    );
  } catch (err) {
    setStatus(explainError(err), 'error');
  } finally {
    state.busy = false;
    els.generate.disabled = false;
    els.generate.textContent = 'Generate listing';
  }
}

async function saveShopifyDraft() {
  if (!state.activeId || els.saveDraft.disabled) return;
  const listing = readListing();
  const payload = {
    productId: state.activeId,
    listing: {
      title: listing.title,
      description: listing.description,
      bullets: listing.bullets,
      tags: listing.tags.split(',').map((t) => t.trim()).filter(Boolean)
    }
  };

  els.saveDraft.disabled = true;
  els.saveDraft.textContent = 'Saving…';
  setStatus('Saving a draft in Shopify…');

  try {
    const res = await fetch('/api/shopify/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Shopify save failed (HTTP ${res.status})`);

    const draft = data.draft;
    state.shopify.drafts[state.activeId] = { gid: draft.gid, adminUrl: draft.adminUrl };
    setStatus(
      `${draft.created ? 'Draft created' : 'Draft updated'} in Shopify · ${draft.gid} · status ${draft.status} — not published.`,
      'ok'
    );
    updateShopifyButton();
  } catch (err) {
    setStatus(explainError(err), 'error');
    updateShopifyButton();
  } finally {
    els.saveDraft.textContent = 'Save as Shopify draft';
  }
}

async function removePhoto() {
  if (!state.activeId) return;
  try {
    const res = await fetch(`/api/photo?productId=${encodeURIComponent(state.activeId)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not remove the photo');
    state.products = data.products;
    renderPhoto(state.products.find((p) => p.id === state.activeId));
    renderQueue();
    setStatus('Photo removed.', 'ok');
  } catch (err) {
    setStatus(explainError(err), 'error');
  }
}

/* ------------------------------------------------------- products: add/remove */

function openAddDialog() {
  els.addForm.reset();
  els.addError.textContent = '';
  els.addPhotoPreview.hidden = true;
  els.addPhotoPreview.removeAttribute('src');
  els.addDialog.showModal();
  els.addName.focus();
}

function closeAddDialog() {
  if (els.addDialog.open) els.addDialog.close();
}

async function submitNewProduct(event) {
  event.preventDefault();

  const name = els.addName.value.trim().replace(/\s+/g, ' ');
  const specs = els.addSpecs.value.trim();
  const file = els.addPhoto.files?.[0] || null;

  if (!name) {
    els.addError.textContent = 'Give the product a name.';
    els.addName.focus();
    return;
  }
  if (!specs) {
    els.addError.textContent = 'Supplier specs are required — the listing may only use what is written there.';
    els.addSpecs.focus();
    return;
  }

  els.addError.textContent = '';
  els.addSave.disabled = true;
  els.addSave.textContent = 'Adding…';

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, specs })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Could not add the product (HTTP ${res.status})`);

    const created = data.product;
    state.products = data.products;
    closeAddDialog();
    selectProduct(created.id);

    if (file) {
      const attached = await uploadPhoto(file);
      setStatus(
        attached ? `Added ${created.name} with a photo.` : `Added ${created.name}, but the photo did not attach.`,
        attached ? 'ok' : 'error'
      );
    } else {
      setStatus(`Added ${created.name}.`, 'ok');
    }
  } catch (err) {
    els.addError.textContent = explainError(err);
  } finally {
    els.addSave.disabled = false;
    els.addSave.textContent = 'Add product';
  }
}

async function deleteProduct(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product || product.seeded) return;
  if (!window.confirm(`Remove "${product.name}" from the queue? Its photo goes too. Shopify drafts are not touched.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Could not remove the product (HTTP ${res.status})`);

    state.products = data.products;
    delete state.drafts[id];
    writeDrafts();

    if (state.activeId === id) {
      state.activeId = null;
      if (state.products[0]) selectProduct(state.products[0].id);
      else renderQueue();
    } else {
      renderQueue();
    }
    setStatus(`Removed ${product.name}.`, 'ok');
  } catch (err) {
    setStatus(explainError(err), 'error');
  }
}

/* ---------------------------------------------------------------- wiring */

els.title.addEventListener('input', () => {
  updateTitleCount();
  updateShopifyButton();
  persistDraft();
});
els.description.addEventListener('input', persistDraft);
els.tags.addEventListener('input', persistDraft);
els.specs.addEventListener('input', persistDraft);

els.addBullet.addEventListener('click', () => {
  addBulletRow('');
  const inputs = els.bullets.querySelectorAll('.bullet-input');
  inputs[inputs.length - 1]?.focus();
  persistDraft();
});

els.generate.addEventListener('click', generateListing);
els.saveDraft.addEventListener('click', saveShopifyDraft);

els.addProduct.addEventListener('click', openAddDialog);
els.addCancel.addEventListener('click', closeAddDialog);
els.addForm.addEventListener('submit', submitNewProduct);
els.addPhoto.addEventListener('change', () => {
  const file = els.addPhoto.files?.[0];
  if (!file) {
    els.addPhotoPreview.hidden = true;
    els.addPhotoPreview.removeAttribute('src');
    return;
  }
  const url = URL.createObjectURL(file);
  els.addPhotoPreview.src = url;
  els.addPhotoPreview.hidden = false;
  els.addPhotoPreview.onload = () => URL.revokeObjectURL(url);
});
els.photoRemove.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  removePhoto();
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    generateListing();
  }
});

els.photoInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (file) uploadPhoto(file);
});

for (const type of ['dragenter', 'dragover']) {
  els.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropZone.classList.add('is-drag');
  });
}
for (const type of ['dragleave', 'drop']) {
  els.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove('is-drag');
  });
}
els.dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) uploadPhoto(file);
});

// Without this, a drop that misses the zone navigates the tab to the raw image
// and the whole app disappears.
for (const type of ['dragover', 'drop']) {
  window.addEventListener(type, (event) => {
    if (!els.dropZone.contains(event.target)) event.preventDefault();
  });
}

async function init() {
  state.drafts = loadDrafts();
  try {
    const res = await fetch('/api/bootstrap');
    if (!res.ok) throw new Error('Could not load the queue');
    const boot = await res.json();

    state.products = boot.products;
    state.config = { ...state.config, ...boot.config };
    state.spend = boot.spend;
    state.traceTotal = boot.traceTotal;
    state.shopify = boot.shopify || state.shopify;

    renderSpend();
    renderTrace(boot.trace, boot.traceTotal);

    const savedId = (() => {
      try {
        return localStorage.getItem(ACTIVE_KEY);
      } catch {
        return null;
      }
    })();
    const first =
      boot.products.find((p) => p.id === savedId) ||
      boot.products.find((p) => p.status === 'Editing') ||
      boot.products[0];
    if (first) selectProduct(first.id);

    if (boot.config.stub) {
      setStatus('Day 1 stub active — sample copy, no credits spent. Real Ember call lands with the API key.');
    }
  } catch (err) {
    setStatus(explainError(err), 'error');
  }
}

init();
