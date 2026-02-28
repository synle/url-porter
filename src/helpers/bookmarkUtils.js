/**
 * Bookmark synchronization utilities.
 *
 * Maintains a "url-porter" bookmark folder under "Other Bookmarks" that
 * mirrors the current redirect config. Each config entry becomes a bookmark
 * with the alias as the title and the destination URL as the bookmark URL.
 */

import { normalizeEntry, normalizeTo, stripAlias } from "./configUtils.js";

/**
 * Extract a clean bookmark title from a config entry's `from` field.
 * Strips the `||` prefix and `^` suffix used by declarativeNetRequest.
 *
 * @param {import('./configUtils.js').ConfigEntry} entry - A normalized config entry
 * @returns {string}
 */
export function bookmarkTitleFromEntry(entry) {
  return stripAlias(entry.from);
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
 * Uses the config's `to` URL directly (no HTTP resolution) for reliable matching.
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

  // Build desired state from config: title → url
  const entries = configEntries.map(normalizeEntry).filter(Boolean);
  const desiredMap = new Map();
  for (const entry of entries) {
    const title = bookmarkTitleFromEntry(entry);
    if (title) {
      desiredMap.set(title, normalizeTo(entry.to));
    }
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
