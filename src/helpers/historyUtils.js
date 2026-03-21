/**
 * History tracking utilities for redirect rule changes.
 *
 * History is stored in chrome.storage.local as a map of alias → entries[].
 * Each entry records a from/to/action/date tuple. Two configurable limits
 * control growth: max aliases (default 5000) and max entries per alias (default 20).
 */

import { normalizeFrom } from "./configUtils.js";

const HISTORY_KEY = "linkHistory";
const ALIAS_LIMIT_KEY = "historyAliasLimit";
const ENTRY_LIMIT_KEY = "historyEntryLimit";
const DEFAULT_ALIAS_LIMIT = 5000;
const DEFAULT_ENTRY_LIMIT = 20;

/**
 * Normalize an alias to its canonical history key.
 * @param {string} from - The alias to normalize.
 * @returns {string} Lowercased, normalized alias key.
 */
function aliasKey(from) {
  return normalizeFrom(from).toLowerCase();
}

/**
 * Load the entire grouped history object from storage.
 *
 * @returns {Promise<Record<string, Array<{from: string, to: string, action: string, date: string}>>>}
 */
export async function getHistory() {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const val = result[HISTORY_KEY];
  return val && typeof val === "object" && !Array.isArray(val) ? val : {};
}

/**
 * Load all history entries as a flat array, sorted newest-first.
 *
 * @returns {Promise<Array<{from: string, to: string, action: string, date: string}>>}
 */
export async function getHistoryAsFlat() {
  const grouped = await getHistory();
  const all = [];
  for (const entries of Object.values(grouped)) {
    if (Array.isArray(entries)) {
      all.push(...entries);
    }
  }
  all.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return all;
}

/**
 * Get the configured max-aliases limit (default: 5000).
 * @returns {Promise<number>}
 */
export async function getHistoryAliasLimit() {
  const result = await chrome.storage.local.get(ALIAS_LIMIT_KEY);
  return typeof result[ALIAS_LIMIT_KEY] === "number" ? result[ALIAS_LIMIT_KEY] : DEFAULT_ALIAS_LIMIT;
}

/**
 * Persist a new max-aliases limit (minimum 1).
 * @param {number} n - The new limit.
 * @returns {Promise<void>}
 */
export async function setHistoryAliasLimit(n) {
  await chrome.storage.local.set({ [ALIAS_LIMIT_KEY]: Math.max(1, Math.floor(n)) });
}

/**
 * Get the configured max-entries-per-alias limit (default: 20).
 * @returns {Promise<number>}
 */
export async function getHistoryEntryLimit() {
  const result = await chrome.storage.local.get(ENTRY_LIMIT_KEY);
  return typeof result[ENTRY_LIMIT_KEY] === "number" ? result[ENTRY_LIMIT_KEY] : DEFAULT_ENTRY_LIMIT;
}

/**
 * Persist a new max-entries-per-alias limit (minimum 1).
 * @param {number} n - The new limit.
 * @returns {Promise<void>}
 */
export async function setHistoryEntryLimit(n) {
  await chrome.storage.local.set({ [ENTRY_LIMIT_KEY]: Math.max(1, Math.floor(n)) });
}

/**
 * Record a history entry for an alias change.
 * Enforces both per-alias and total-alias limits, evicting the
 * least-recently-touched aliases when the total limit is exceeded.
 *
 * @param {string} from - The alias (will be normalized)
 * @param {string} to - The destination URL
 * @param {"added"|"edited"|"deleted"} action - What happened
 */
export async function addHistoryEntry(from, to, action) {
  const history = await getHistory();
  const aliasLimit = await getHistoryAliasLimit();
  const entryLimit = await getHistoryEntryLimit();
  const key = aliasKey(from);

  // Get or create the alias bucket, prepend new entry
  const bucket = Array.isArray(history[key]) ? history[key] : [];
  bucket.unshift({
    from,
    to,
    action,
    date: new Date().toISOString(),
  });

  // Trim per-alias entries to the configured limit
  history[key] = bucket.slice(0, entryLimit);

  // Evict least-recently-touched aliases if over the total limit
  const keys = Object.keys(history);
  if (keys.length > aliasLimit) {
    const byLastTouch = keys
      .map((k) => ({
        key: k,
        lastTouch: (history[k][0] && history[k][0].date) || "",
      }))
      .sort((a, b) => b.lastTouch.localeCompare(a.lastTouch));

    for (const item of byLastTouch.slice(aliasLimit)) {
      delete history[item.key];
    }
  }

  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

/**
 * Clear all history entries.
 * @returns {Promise<void>}
 */
export async function clearHistory() {
  await chrome.storage.local.remove(HISTORY_KEY);
}
