#!/usr/bin/env node
/**
 * Export trace.jsonl into a submission-ready markdown table.
 *
 * Usage: node scripts/export-trace.mjs [--out docs/trace.md]
 * The trace holds prompts, token counts and costs — never API keys.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRACE = path.join(ROOT, 'trace.jsonl');
const BUDGET = Number(process.env.HACKATHON_BUDGET_USD || 10);

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const OUT = path.resolve(ROOT, outFlag >= 0 ? args[outFlag + 1] : 'docs/trace.md');

const raw = await readFile(TRACE, 'utf8').catch(() => '');
const entries = raw
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const sum = (list, key) => list.reduce((total, item) => total + (Number(item[key]) || 0), 0);
const money = (value) => `$${Number(value).toFixed(6)}`;

const real = entries.filter((e) => !e.stub);
const stub = entries.filter((e) => e.stub);
const realSpend = sum(real, 'cost_usd');
const stubSpend = sum(stub, 'cost_usd');
const totalSpend = realSpend + stubSpend;

const promptSummary = (prompt) => {
  const user = String(prompt || '').split('[USER]')[1] || '';
  const product = (user.match(/^Product:\s*(.+)$/m) || [])[1] || 'unknown';
  const photo = /A product photo is attached/.test(user) ? 'photo' : 'no photo';
  const specs = (user.split('Supplier specs:')[1] || '').split('Write the listing as')[0].trim();
  const first = specs.split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
  const summary = `${product} — ${photo} — “${first.slice(0, 70)}${first.length > 70 ? '…' : ''}”`;
  return summary.replace(/\|/g, '\\|');
};

let running = 0;
const rows = entries.map((entry, index) => {
  running += Number(entry.cost_usd) || 0;
  const when = String(entry.timestamp || '').replace('T', ' ').replace('Z', '').slice(0, 19);
  return [
    index + 1,
    when,
    promptSummary(entry.prompt),
    entry.model || '—',
    entry.stub ? 'stub' : 'real',
    Number(entry.tokens_in || 0).toLocaleString('en-US'),
    Number(entry.tokens_out || 0).toLocaleString('en-US'),
    money(entry.cost_usd || 0),
    money(running)
  ];
});

const table = [
  '| # | when (UTC) | call | model | kind | tokens in | tokens out | cost | running total |',
  '|---:|---|---|---|---|---:|---:|---:|---:|',
  ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} | ${r[5]} | ${r[6]} | ${r[7]} | ${r[8]} |`)
].join('\n');

const doc = `# Ember token trace

Exported from \`trace.jsonl\` on ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC by
\`node scripts/export-trace.mjs\`. One row per Generate call made by the app.

**Budget:** $${BUDGET.toFixed(2)} · **real spend:** ${money(realSpend)} · **stub rows:** ${money(stubSpend)}
(no API call, Day 1 canned responses) · **total:** ${money(totalSpend)} · **remaining:** ${money(Math.max(BUDGET - realSpend, 0))}

${real.length} paid calls to \`muse-ember-1.0\` and ${stub.length} stub calls. Prices: $0.10 / Mtok input,
$0.50 / Mtok output, $0.004 / Mtok cached input ([Meta docs](https://dev.meta.ai/models/muse-ember)).
Cost is computed from the token counts each response reports.

${table}

## Totals

| | tokens in | tokens out | cost |
|---|---:|---:|---:|
| real calls (${real.length}) | ${sum(real, 'tokens_in').toLocaleString('en-US')} | ${sum(real, 'tokens_out').toLocaleString('en-US')} | ${money(realSpend)} |
| stub calls (${stub.length}) | ${sum(stub, 'tokens_in').toLocaleString('en-US')} | ${sum(stub, 'tokens_out').toLocaleString('en-US')} | ${money(stubSpend)} |
| **all** (${entries.length}) | ${sum(entries, 'tokens_in').toLocaleString('en-US')} | ${sum(entries, 'tokens_out').toLocaleString('en-US')} | **${money(totalSpend)}** |

Real spend against the $10 budget: ${money(realSpend)} used, ${money(Math.max(BUDGET - realSpend, 0))} left.

## What is not in here

No API keys, no Shopify tokens, no image bytes. The \`prompt\` field on each line in \`trace.jsonl\`
is the exact system + user text for that call; this export summarises it and leaves the full text local.
`;

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, doc, 'utf8');
console.log(`wrote ${path.relative(ROOT, OUT)} · ${entries.length} rows · real spend ${money(realSpend)}`);
