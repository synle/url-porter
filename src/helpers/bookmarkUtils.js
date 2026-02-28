/**
 * Bookmark synchronization utilities.
 *
 * Maintains a "url-porter" bookmark folder under "Other Bookmarks" that
 * mirrors the current redirect config. Bookmarks are resolved to their
 * final URL (following redirects) so they point to the real destination.
 */

import { normalizeEntry, stripAlias } from "./configUtils.js";

/** Timeout (ms) for HEAD requests when resolving redirect URLs. */
const RESOLVE_TIMEOUT_MS = 5000;

/**
 * Extract a clean bookmark title from a config entry's `from` field.
 * Strips the `||` prefix and `^` suffix used by declarativeNetRequest.
 *
 * @param {import('./configUtils.js').RawConfigEntry} entry
 * @returns {string}
 */
export function bookmarkTitleFromEntry(entry) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return "";
  return stripAlias(normalized.from);
}

/**
 * Follow redirects to resolve the final URL.
 * Returns the original URL on network error or timeout.
 *
 * @param {string} url
 * @returns {Promise<string>} The resolved URL, or the original on error
 */
export async function resolveUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.url;
  } catch {
    return url;
  }
}

/**
 * Find or create the "url-porter" bookmark folder under "Other Bookmarks".
 * Chrome uses well-known folder IDs: "1" = Bookmarks Bar, "2" = Other Bookmarks.
 *
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
async function findOrCreateFolder() {
  const results = await chrome.bookmarks.search({ title: "url-porter" });
  // Accept folders (no url) whose parent is a top-level root folder
  const existing = results.find((node) => !node.url && (node.parentId === "1" || node.parentId === "2"));
  if (existing) return existing;

  // Create under "Other Bookmarks" (id "2" in Chrome)
  return chrome.bookmarks.create({ parentId: "2", title: "url-porter" });
}

/**
 * Reconcile the "url-porter" bookmark folder with the given config entries.
 * Adds missing bookmarks, updates changed URLs, and removes stale ones.
 *
 * @param {import('./configUtils.js').RawConfigEntry[]} configEntries
 */
export async function reconcileBookmarks(configEntries) {
  const folder = await findOrCreateFolder();
  const children = await chrome.bookmarks.getChildren(folder.id);

  // Build map of existing bookmarks: title → { id, url }
  const existingMap = new Map();
  for (const child of children) {
    existingMap.set(child.title, { id: child.id, url: child.url });
  }

  // Build desired state: title → resolvedUrl
  const entries = configEntries.map(normalizeEntry).filter(Boolean);
  const desiredMap = new Map();

  const resolutions = await Promise.all(
    entries.map(async (entry) => {
      const title = bookmarkTitleFromEntry(entry);
      if (!title) return null;
      const resolvedUrl = await resolveUrl(entry.to);
      return { title, url: resolvedUrl };
    }),
  );

  for (const result of resolutions) {
    if (result) desiredMap.set(result.title, result.url);
  }

  // Add missing and update changed bookmarks
  for (const [title, url] of desiredMap) {
    const existing = existingMap.get(title);
    if (!existing) {
      await chrome.bookmarks.create({ parentId: folder.id, title, url });
    } else if (existing.url !== url) {
      await chrome.bookmarks.update(existing.id, { url });
    }
  }

  // Remove bookmarks that are no longer in the config
  for (const [title, { id }] of existingMap) {
    if (!desiredMap.has(title)) {
      await chrome.bookmarks.remove(id);
    }
  }
}
