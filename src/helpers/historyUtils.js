import { normalizeFrom } from "./configUtils.js";

const HISTORY_KEY = "linkHistory";
const ALIAS_LIMIT_KEY = "historyAliasLimit";
const ENTRY_LIMIT_KEY = "historyEntryLimit";
const DEFAULT_ALIAS_LIMIT = 5000;
const DEFAULT_ENTRY_LIMIT = 20;

function aliasKey(from) {
  return normalizeFrom(from).toLowerCase();
}

export async function getHistory() {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const val = result[HISTORY_KEY];
  return val && typeof val === "object" && !Array.isArray(val) ? val : {};
}

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

export async function getHistoryAliasLimit() {
  const result = await chrome.storage.local.get(ALIAS_LIMIT_KEY);
  return typeof result[ALIAS_LIMIT_KEY] === "number" ? result[ALIAS_LIMIT_KEY] : DEFAULT_ALIAS_LIMIT;
}

export async function setHistoryAliasLimit(n) {
  await chrome.storage.local.set({ [ALIAS_LIMIT_KEY]: Math.max(1, Math.floor(n)) });
}

export async function getHistoryEntryLimit() {
  const result = await chrome.storage.local.get(ENTRY_LIMIT_KEY);
  return typeof result[ENTRY_LIMIT_KEY] === "number" ? result[ENTRY_LIMIT_KEY] : DEFAULT_ENTRY_LIMIT;
}

export async function setHistoryEntryLimit(n) {
  await chrome.storage.local.set({ [ENTRY_LIMIT_KEY]: Math.max(1, Math.floor(n)) });
}

export async function addHistoryEntry(from, to, action) {
  const history = await getHistory();
  const aliasLimit = await getHistoryAliasLimit();
  const entryLimit = await getHistoryEntryLimit();
  const key = aliasKey(from);

  // Get or create the alias bucket
  const bucket = Array.isArray(history[key]) ? history[key] : [];

  // Prepend new entry
  bucket.unshift({
    from,
    to,
    action,
    date: new Date().toISOString(),
  });

  // Trim per-alias to entry limit
  history[key] = bucket.slice(0, entryLimit);

  // Trim total aliases to alias limit (evict least-recently-touched)
  const keys = Object.keys(history);
  if (keys.length > aliasLimit) {
    // Find the last-touched time for each alias (first entry's date since newest is first)
    const byLastTouch = keys
      .map((k) => ({
        key: k,
        lastTouch: (history[k][0] && history[k][0].date) || "",
      }))
      .sort((a, b) => b.lastTouch.localeCompare(a.lastTouch));

    // Keep only the most recent aliases
    const toRemove = byLastTouch.slice(aliasLimit);
    for (const item of toRemove) {
      delete history[item.key];
    }
  }

  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

export async function clearHistory() {
  await chrome.storage.local.remove(HISTORY_KEY);
}
