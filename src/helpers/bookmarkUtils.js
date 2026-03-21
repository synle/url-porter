/**
 * Bookmark synchronization utilities.
 *
 * Maintains a bookmark folder under "Other Bookmarks" that mirrors the current
 * redirect config. The folder name is configurable (defaults to "url-porter")
 * and stored in chrome.storage.local. Each config entry becomes a bookmark
 * with the alias as the title and the destination URL as the bookmark URL.
 * Duplicate bookmarks (same title) are cleaned up — the later entry wins.
 */

import { normalizeEntry, normalizeTo, stripAlias, sanitizeBookmarkTitle } from "./configUtils.js";
import { getBookmarkFolderName } from "./storage.js";

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
 * @param {string} folderName - The bookmark folder name to find or create
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
async function findOrCreateFolder(folderName) {
  console.log("[bookmarkUtils] findOrCreateFolder: searching for existing folder:", folderName);
  const results = await chrome.bookmarks.search({ title: folderName });
  console.log("[bookmarkUtils] findOrCreateFolder: search results:", JSON.stringify(results, null, 2));
  // Accept folders (no url) whose parent is a top-level root folder
  const existing = results.find((node) => !node.url && (node.parentId === "1" || node.parentId === "2"));
  if (existing) {
    const children = await chrome.bookmarks.getChildren(existing.id);
    console.log("[bookmarkUtils] findOrCreateFolder: found existing folder_id:", existing.id, "total bookmarks:", children.length);
    return existing;
  }

  // Create under "Other Bookmarks" (id "2" in Chrome)
  console.log("[bookmarkUtils] findOrCreateFolder: no existing folder found, creating new one under Other Bookmarks");
  const folder = await chrome.bookmarks.create({ parentId: "2", title: folderName });
  console.log("[bookmarkUtils] findOrCreateFolder: created folder_id:", folder.id, "total bookmarks: 0");
  return folder;
}

/**
 * Resolve a URL through the alias chain until it reaches a full URL.
 * If the `to` value matches another alias, keep expanding.
 * e.g. a => aaa => aaa.com means a resolves to https://aaa.com
 *
 * @param {string} rawTo - The raw `to` value to resolve
 * @param {Map<string, string>} aliasToRawUrl - Map of alias → raw `to` value
 * @param {number} [maxDepth=10] - Max resolution depth to prevent infinite loops
 * @returns {string} The fully resolved URL
 */
function resolveShortLink(rawTo, aliasToRawUrl, maxDepth = 10) {
  const chain = [rawTo];
  let current = rawTo;

  for (let depth = 0; depth < maxDepth; depth++) {
    // Strip protocol if present to check against aliases
    let bare = current;
    if (bare.startsWith("https://")) bare = bare.slice(8);
    if (bare.startsWith("http://")) bare = bare.slice(7);

    // Check if the bare value matches any alias
    if (aliasToRawUrl.has(bare) && aliasToRawUrl.get(bare) !== current) {
      const next = aliasToRawUrl.get(bare);
      chain.push(next);
      current = next;
    } else {
      break;
    }
  }

  const resolved = normalizeTo(current);
  if (chain.length > 1) {
    console.log("[bookmarkUtils] resolveShortLink:", chain.join(" => "), "=>", resolved);
  }
  return resolved;
}

/**
 * Reconcile the "url-porter" bookmark folder with the given config entries.
 * - Deduplicates existing bookmarks by title (later entry wins, older duplicates removed).
 * - Preserves existing bookmark sort order.
 * - Updates existing bookmarks in-place if the title matches a config entry.
 * - Adds new config entries to the bottom of the folder.
 * - Resolves short links: if a `to` value matches another alias, keeps expanding.
 *
 * @param {import('./configUtils.js').RawConfigEntry[]} configEntries
 */
export async function reconcileBookmarks(configEntries) {
  console.log("[bookmarkUtils] reconcileBookmarks: called with", configEntries?.length, "entries");
  console.log("[bookmarkUtils] reconcileBookmarks: raw configEntries:", JSON.stringify(configEntries, null, 2));

  const folderName = await getBookmarkFolderName();
  const folder = await findOrCreateFolder(folderName);
  console.log("[bookmarkUtils] reconcileBookmarks: using folder_id:", folder.id);

  const children = await chrome.bookmarks.getChildren(folder.id);
  console.log("[bookmarkUtils] reconcileBookmarks: existing bookmarks count:", children.length);
  console.log("[bookmarkUtils] reconcileBookmarks: existing bookmarks:", JSON.stringify(children, null, 2));

  // Deduplicate existing bookmarks by title.
  // Later bookmarks (higher index) are the source of truth.
  // Earlier duplicates get removed.
  const deduped = new Map(); // title → child node (keeps last seen)
  const toRemove = []; // duplicate bookmark IDs to delete
  for (const child of children) {
    if (deduped.has(child.title)) {
      const older = deduped.get(child.title);
      console.log(
        "[bookmarkUtils] reconcileBookmarks: DEDUP removing older bookmark:",
        older.id,
        "title:",
        child.title,
        "url:",
        older.url,
        "| keeping newer:",
        child.id,
        "url:",
        child.url,
      );
      toRemove.push(older.id);
    }
    deduped.set(child.title, child);
  }
  for (const id of toRemove) {
    await chrome.bookmarks.removeTree(id);
  }
  if (toRemove.length > 0) {
    console.log("[bookmarkUtils] reconcileBookmarks: removed", toRemove.length, "duplicate bookmark(s)");
  }

  // Build map of existing bookmarks (post-dedup): title → { id, url }
  const existingMap = new Map();
  for (const [title, child] of deduped) {
    existingMap.set(title, { id: child.id, url: child.url });
  }

  // Normalize config entries
  const allNormalized = configEntries.map(normalizeEntry);
  const entries = allNormalized.filter(Boolean);
  const droppedCount = configEntries.length - entries.length;
  const droppedEntries = configEntries.filter((_, i) => !allNormalized[i]);
  console.log(
    "[bookmarkUtils] reconcileBookmarks: normalizeEntry results -",
    "raw config:",
    configEntries.length,
    "| valid after normalize:",
    entries.length,
    "| dropped (failed normalize):",
    droppedCount,
  );
  if (droppedCount > 0) {
    console.log("[bookmarkUtils] reconcileBookmarks: dropped entries:", JSON.stringify(droppedEntries, null, 2));
  }

  // Build alias → raw `to` map for short link resolution
  const aliasToRawUrl = new Map();
  for (const entry of entries) {
    const alias = stripAlias(entry.from);
    if (alias) {
      aliasToRawUrl.set(alias, entry.to);
    }
  }
  console.log(
    "[bookmarkUtils] reconcileBookmarks: alias map for short link resolution:",
    JSON.stringify([...aliasToRawUrl.entries()], null, 2),
  );

  // Build desired state: title → fully resolved URL
  console.log("[bookmarkUtils] reconcileBookmarks: resolving short links...");
  const desiredMap = new Map();
  for (const entry of entries) {
    const title = bookmarkTitleFromEntry(entry);
    if (title) {
      const resolvedUrl = resolveShortLink(entry.to, aliasToRawUrl);
      desiredMap.set(title, resolvedUrl);
    }
  }
  console.log("[bookmarkUtils] reconcileBookmarks: desired bookmarks:", JSON.stringify([...desiredMap.entries()], null, 2));

  // Compare desired vs existing bookmarks
  const desiredTitles = new Set(desiredMap.keys());
  const existingTitles = new Set(existingMap.keys());
  const overlapping = [...desiredTitles].filter((t) => existingTitles.has(t));
  const toAdd = [...desiredTitles].filter((t) => !existingTitles.has(t));
  const kept = [...existingTitles].filter((t) => !desiredTitles.has(t));
  console.log(
    "[bookmarkUtils] reconcileBookmarks: diff summary -",
    "desired:",
    desiredMap.size,
    "| existing:",
    existingMap.size,
    "| overlapping (will update):",
    overlapping.length,
    "| new (will add to bottom):",
    toAdd.length,
    "| old-only (will keep as-is):",
    kept.length,
  );
  if (overlapping.length > 0) {
    console.log("[bookmarkUtils] reconcileBookmarks: overlapping titles:", JSON.stringify(overlapping, null, 2));
  }
  if (toAdd.length > 0) {
    console.log("[bookmarkUtils] reconcileBookmarks: titles to add:", JSON.stringify(toAdd, null, 2));
  }
  if (kept.length > 0) {
    console.log("[bookmarkUtils] reconcileBookmarks: old bookmarks kept (not in config, NOT deleted):", JSON.stringify(kept, null, 2));
  }

  // Update existing bookmarks in-place (preserves sort order)
  for (const [title, url] of desiredMap) {
    const existing = existingMap.get(title);
    if (existing) {
      if (existing.url !== url) {
        console.log("[bookmarkUtils] reconcileBookmarks: UPDATING existing bookmark:", title, "from", existing.url, "→", url);
        await chrome.bookmarks.update(existing.id, { url });
      } else {
        console.log("[bookmarkUtils] reconcileBookmarks: UNCHANGED existing bookmark:", title, "url:", url);
      }
    }
  }

  // Add new bookmarks to the bottom of the folder
  for (const [title, url] of desiredMap) {
    if (!existingMap.has(title)) {
      console.log("[bookmarkUtils] reconcileBookmarks: ADDING new bookmark to bottom:", title, "→", url);
      await chrome.bookmarks.create({ parentId: folder.id, title: sanitizeBookmarkTitle(title), url });
    }
  }

  console.log("[bookmarkUtils] reconcileBookmarks: done");
}
