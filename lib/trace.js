/**
 * Token trace: one JSON line per Ember call, appended to trace.jsonl at the
 * project root. This file is the spend evidence for the hackathon submission.
 *
 * Line shape: { timestamp, prompt, tokens_in, tokens_out, cost_usd, ... }
 * Image bytes are never written — only the file name and size.
 */
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TRACE_PATH = path.join(ROOT, 'trace.jsonl');
export const BUDGET_USD = Number(process.env.HACKATHON_BUDGET_USD || 10);

export async function appendTrace(entry) {
  await appendFile(TRACE_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
}

async function readEntries() {
  let raw = '';
  try {
    raw = await readFile(TRACE_PATH, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return [];
  }
  const entries = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip a half-written line rather than losing the whole trace.
    }
  }
  return entries;
}

/** Newest-first window plus running totals for the cost meter. */
export async function traceState(limit = 6) {
  const entries = await readEntries();
  const totalUsd = entries.reduce((sum, e) => sum + (Number(e.cost_usd) || 0), 0);
  return {
    entries: entries.slice(-limit).reverse(),
    total: entries.length,
    spend: {
      totalUsd: Number(totalUsd.toFixed(6)),
      budgetUsd: BUDGET_USD,
      remainingUsd: Number(Math.max(BUDGET_USD - totalUsd, 0).toFixed(6)),
      calls: entries.length
    }
  };
}

export async function spendSummary() {
  return (await traceState(0)).spend;
}
