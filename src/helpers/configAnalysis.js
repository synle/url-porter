/**
 * Config analysis helpers for broken link detection and conflict/duplicate resolution.
 *
 * Pure functions that analyze config entries and return structured results.
 * Used by the Options page for on-demand health checks.
 */

import { normalizeEntry, normalizeFrom, stripAlias } from "./configUtils.js";

/**
 * @typedef {Object} BrokenLinkResult
 * @property {number} index - Original index of the entry in the config array
 * @property {string} from - The alias
 * @property {string} to - The destination URL
 * @property {number} status - HTTP status code (0 if network error)
 * @property {string} error - Error message if the request failed
 */

/**
 * Check all config entry destination URLs for broken links using HEAD requests.
 * Calls onProgress after each URL is checked.
 *
 * @param {import('./configUtils.js').RawConfigEntry[]} entries - Config entries to check
 * @param {(checked: number, total: number) => void} [onProgress] - Progress callback
 * @returns {Promise<BrokenLinkResult[]>} Array of broken link results (only failures)
 */
export async function checkBrokenLinks(entries, onProgress) {
  const normalized = entries
    .map((e, i) => ({ entry: normalizeEntry(e), index: i }))
    .filter((x) => x.entry);

  // Build a set of known aliases so we can skip short links that redirect to another alias
  const aliasSet = new Set();
  for (const { entry } of normalized) {
    const key = stripAlias(normalizeFrom(entry.from)).toLowerCase();
    if (key) aliasSet.add(key);
  }

  const broken = [];
  let checked = 0;

  for (const { entry, index } of normalized) {
    const url = entry.to;
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      checked++;
      if (onProgress) onProgress(checked, normalized.length);
      continue;
    }

    // Skip short links whose destination is another alias (redirect chains)
    const strippedTo = url
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .toLowerCase();
    if (aliasSet.has(strippedTo)) {
      checked++;
      if (onProgress) onProgress(checked, normalized.length);
      continue;
    }

    try {
      const res = await fetch(url, { method: "HEAD", mode: "no-cors" });
      // no-cors returns opaque responses (status 0) for most cross-origin URLs — treat as OK.
      // Only flag HTTP 404 since that clearly means the page doesn't exist.
      if (res.status === 404) {
        broken.push({ index, from: entry.from, to: url, status: res.status, error: "HTTP 404" });
      }
    } catch {
      // fetch throws for CORS blocks, DNS failures, timeouts, connection refused, etc.
      // In a Chrome extension options page with no-cors, all these produce the same
      // "Failed to fetch" error — we can't distinguish real failures from CORS blocks,
      // so treat all catch errors as likely-reachable to avoid false positives.
    }

    checked++;
    if (onProgress) onProgress(checked, normalized.length);
  }

  return broken;
}

/**
 * @typedef {Object} DuplicateGroup
 * @property {string} alias - The normalized alias (bare, without || and ^)
 * @property {Array<{index: number, from: string, to: string}>} entries - All entries sharing this alias
 */

/**
 * Find groups of config entries that share the same alias (case-insensitive).
 *
 * @param {import('./configUtils.js').RawConfigEntry[]} entries - Config entries to analyze
 * @returns {DuplicateGroup[]} Groups with 2+ entries sharing the same alias
 */
export function findDuplicateAliases(entries) {
  if (!Array.isArray(entries)) return [];

  /** @type {Map<string, Array<{index: number, from: string, to: string}>>} */
  const groups = new Map();

  entries.forEach((raw, index) => {
    const entry = normalizeEntry(raw);
    if (!entry) return;
    const key = stripAlias(normalizeFrom(entry.from)).toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ index, from: entry.from, to: entry.to });
  });

  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([alias, group]) => ({ alias, entries: group }));
}

/**
 * @typedef {Object} RedirectChain
 * @property {number} index - Original index of the entry
 * @property {string} from - The alias
 * @property {string} to - The destination (which is itself an alias)
 * @property {string[]} chain - Full chain of aliases from start to final destination
 */

/**
 * Find entries whose `to` value matches another entry's alias, forming redirect chains.
 *
 * @param {import('./configUtils.js').RawConfigEntry[]} entries - Config entries to analyze
 * @returns {RedirectChain[]} Entries that chain through other aliases
 */
export function findRedirectChains(entries) {
  if (!Array.isArray(entries)) return [];

  /** @type {Map<string, {from: string, to: string, index: number}>} */
  const aliasMap = new Map();
  const normalized = [];

  entries.forEach((raw, index) => {
    const entry = normalizeEntry(raw);
    if (!entry) return;
    const key = stripAlias(normalizeFrom(entry.from)).toLowerCase();
    aliasMap.set(key, { from: entry.from, to: entry.to, index });
    normalized.push({ ...entry, index, key });
  });

  const chains = [];

  for (const item of normalized) {
    const toStripped = item.to
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .toLowerCase();
    if (aliasMap.has(toStripped)) {
      const chain = [item.from];
      let current = toStripped;
      const visited = new Set();
      while (aliasMap.has(current) && !visited.has(current)) {
        visited.add(current);
        const next = aliasMap.get(current);
        chain.push(next.from);
        current = next.to
          .replace(/^https?:\/\//, "")
          .replace(/\/$/, "")
          .toLowerCase();
      }
      if (!aliasMap.has(current)) {
        chain.push(aliasMap.get(Array.from(visited).pop())?.to || current);
      }
      chains.push({ index: item.index, from: item.from, to: item.to, chain });
    }
  }

  return chains;
}

/**
 * @typedef {Object} OverlapPair
 * @property {number} indexA - Index of the shorter/substring alias
 * @property {number} indexB - Index of the longer alias that contains it
 * @property {string} aliasA - The shorter alias
 * @property {string} aliasB - The longer alias
 */

/**
 * Find pairs of aliases where one is a prefix of another,
 * which could cause unexpected matching with declarativeNetRequest.
 * Only prefix matches matter because the urlFilter pattern uses `||` (domain start anchor)
 * and `^` (separator/end), so `||fi^` won't match `googlefi` but could match `fi.something`.
 *
 * @param {import('./configUtils.js').RawConfigEntry[]} entries - Config entries to analyze
 * @returns {OverlapPair[]} Pairs of overlapping aliases
 */
export function findOverlappingAliases(entries) {
  if (!Array.isArray(entries)) return [];

  const items = entries
    .map((raw, index) => {
      const entry = normalizeEntry(raw);
      if (!entry) return null;
      return { index, alias: stripAlias(normalizeFrom(entry.from)).toLowerCase() };
    })
    .filter(Boolean);

  const overlaps = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.alias === b.alias) continue; // exact duplicates handled by findDuplicateAliases
      // Only flag prefix matches — the urlFilter `||alias^` anchors at domain start,
      // so only a prefix of a longer alias can cause unexpected matching.
      if (b.alias.startsWith(a.alias)) {
        overlaps.push({ indexA: a.index, indexB: b.index, aliasA: a.alias, aliasB: b.alias });
      } else if (a.alias.startsWith(b.alias)) {
        overlaps.push({ indexA: b.index, indexB: a.index, aliasA: b.alias, aliasB: a.alias });
      }
    }
  }

  return overlaps;
}
