/**
 * Generic bookmark rule reconciler.
 *
 * Allows users to define custom bookmark rules that scan browser history and
 * bookmarks for matching URLs, deduplicate by a configurable key, and maintain
 * a named subfolder under the url-porter bookmark folder.
 *
 * Each rule specifies history search keywords, a URL match regex, a dedup key
 * extraction regex, title cleanup patterns, and sort preferences. This module
 * generalizes the 5-step reconciliation pattern used by the hardcoded
 * reconcilers (PRs, Figma, Google Drive, etc.) into a single reusable function.
 */

import { getBookmarkFolderName, getBookmarkRules } from "./storage.js";
import { sanitizeBookmarkTitle } from "./configUtils.js";

/** @type {string[]} Folder names reserved by hardcoded reconcilers. */
const RESERVED_FOLDER_NAMES = ["prs", "github repos", "figma mocks", "jira tickets", "google drive", "onedrive"];

/**
 * Validate a bookmark rule for completeness and regex correctness.
 *
 * @param {object} rule - The bookmark rule to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateRule(rule) {
  if (!rule || typeof rule !== "object") {
    return { valid: false, error: "Rule must be an object" };
  }
  if (!rule.name || typeof rule.name !== "string" || !rule.name.trim()) {
    return { valid: false, error: "Name is required" };
  }
  if (RESERVED_FOLDER_NAMES.includes(rule.name.trim().toLowerCase())) {
    return { valid: false, error: `"${rule.name}" is reserved by a built-in reconciler` };
  }
  if (!Array.isArray(rule.historyKeywords) || rule.historyKeywords.length === 0) {
    return { valid: false, error: "At least one history keyword is required" };
  }
  if (!rule.urlMatchPattern || typeof rule.urlMatchPattern !== "string") {
    return { valid: false, error: "URL match pattern is required" };
  }
  try {
    new RegExp(rule.urlMatchPattern, "i");
  } catch (e) {
    return { valid: false, error: `Invalid URL match pattern: ${e.message}` };
  }
  if (!rule.dedupeKeyPattern || typeof rule.dedupeKeyPattern !== "string") {
    return { valid: false, error: "Dedup key pattern is required" };
  }
  try {
    new RegExp(rule.dedupeKeyPattern, "i");
  } catch (e) {
    return { valid: false, error: `Invalid dedup key pattern: ${e.message}` };
  }
  if (Array.isArray(rule.titleStripPatterns)) {
    for (const pattern of rule.titleStripPatterns) {
      try {
        new RegExp(pattern, "i");
      } catch (e) {
        return { valid: false, error: `Invalid title strip pattern "${pattern}": ${e.message}` };
      }
    }
  }
  return { valid: true };
}

/**
 * Parse a URL using the rule's regex patterns.
 * Returns the dedup key and canonical URL, or null if the URL doesn't match.
 *
 * @param {string} url - The URL to parse
 * @param {RegExp} urlMatchRegex - Compiled URL match regex
 * @param {RegExp} dedupeKeyRegex - Compiled dedup key extraction regex
 * @returns {{dedupeKey: string, url: string} | null}
 */
function parseUrl(url, urlMatchRegex, dedupeKeyRegex) {
  if (!url || !urlMatchRegex.test(url)) return null;
  const cleanUrl = url.split("?")[0].split("#")[0].replace(/\/+$/, "");
  const dedupeMatch = url.match(dedupeKeyRegex);
  const dedupeKey = dedupeMatch && dedupeMatch[1] ? dedupeMatch[1].toLowerCase() : cleanUrl.toLowerCase();
  return { dedupeKey, url: cleanUrl };
}

/**
 * Clean a page title by applying strip patterns in sequence.
 *
 * @param {string} pageTitle - The raw page title
 * @param {RegExp[]} titleStripRegexes - Compiled strip regexes
 * @returns {string} Cleaned title
 */
function cleanTitle(pageTitle, titleStripRegexes) {
  if (!pageTitle) return "";
  let title = pageTitle;
  for (const regex of titleStripRegexes) {
    title = title.replace(regex, "");
  }
  return title.trim();
}

/**
 * Collect matching URLs from browser history.
 *
 * @param {string[]} historyKeywords - Keywords to search history for
 * @param {RegExp} urlMatchRegex - Compiled URL match regex
 * @param {RegExp} dedupeKeyRegex - Compiled dedup key extraction regex
 * @param {RegExp[]} titleStripRegexes - Compiled title strip regexes
 * @returns {Promise<Map<string, {dedupeKey: string, url: string, visitTime: number, title: string}>>}
 */
async function getFromHistory(historyKeywords, urlMatchRegex, dedupeKeyRegex, titleStripRegexes) {
  const items = new Map();
  try {
    const searches = historyKeywords.map((keyword) => chrome.history.search({ text: keyword.trim(), maxResults: 10000, startTime: 0 }));
    const results = await Promise.all(searches);
    for (const historyItems of results) {
      for (const item of historyItems) {
        const parsed = parseUrl(item.url, urlMatchRegex, dedupeKeyRegex);
        if (!parsed) continue;
        const existing = items.get(parsed.dedupeKey);
        const visitTime = item.lastVisitTime || 0;
        if (!existing || visitTime > existing.visitTime) {
          items.set(parsed.dedupeKey, {
            ...parsed,
            visitTime,
            title: cleanTitle(item.title, titleStripRegexes) || existing?.title || "",
          });
        }
      }
    }
  } catch (err) {
    console.error("[genericBookmarkRuleUtils] failed to search history:", err);
  }
  return items;
}

/**
 * Recursively walk all bookmarks and extract matching URLs.
 * Skips bookmarks inside the url-porter folder to avoid feedback loops.
 *
 * @param {string} porterFolderId - ID of the url-porter folder to skip
 * @param {RegExp} urlMatchRegex - Compiled URL match regex
 * @param {RegExp} dedupeKeyRegex - Compiled dedup key extraction regex
 * @param {RegExp[]} titleStripRegexes - Compiled title strip regexes
 * @returns {Promise<Map<string, {dedupeKey: string, url: string, visitTime: number, title: string}>>}
 */
async function getFromBookmarks(porterFolderId, urlMatchRegex, dedupeKeyRegex, titleStripRegexes) {
  const items = new Map();
  try {
    const tree = await chrome.bookmarks.getTree();
    /** @param {chrome.bookmarks.BookmarkTreeNode[]} nodes */
    function walk(nodes) {
      for (const node of nodes) {
        if (node.id === porterFolderId) continue;
        if (node.url) {
          const parsed = parseUrl(node.url, urlMatchRegex, dedupeKeyRegex);
          if (parsed) {
            const existing = items.get(parsed.dedupeKey);
            const dateAdded = node.dateAdded || 0;
            if (!existing || dateAdded > existing.visitTime) {
              items.set(parsed.dedupeKey, {
                ...parsed,
                visitTime: dateAdded,
                title: cleanTitle(node.title, titleStripRegexes) || existing?.title || "",
              });
            }
          }
        }
        if (node.children) walk(node.children);
      }
    }
    walk(tree);
  } catch (err) {
    console.error("[genericBookmarkRuleUtils] failed to walk bookmarks:", err);
  }
  return items;
}

/**
 * Find the url-porter folder under top-level bookmark folders.
 *
 * @param {string} folderName - Name of the url-porter folder
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode | undefined>}
 */
async function findPorterFolder(folderName) {
  const results = await chrome.bookmarks.search({ title: folderName });
  return results.find((node) => !node.url && (node.parentId === "1" || node.parentId === "2"));
}

/**
 * Reconcile a single custom bookmark rule.
 * Searches history and bookmarks for matching URLs, deduplicates, and rebuilds
 * the rule's subfolder under the url-porter bookmark folder.
 *
 * @param {object} rule - The bookmark rule to reconcile
 * @returns {Promise<void>}
 */
export async function reconcileBookmarkRule(rule) {
  const logPrefix = `[genericBookmarkRuleUtils] [${rule?.name || "unknown"}]`;
  console.log(`${logPrefix} starting...`);

  const validation = validateRule(rule);
  if (!validation.valid) {
    console.warn(`${logPrefix} skipping invalid rule:`, validation.error);
    return;
  }

  let urlMatchRegex, dedupeKeyRegex, titleStripRegexes;
  try {
    urlMatchRegex = new RegExp(rule.urlMatchPattern, "i");
    dedupeKeyRegex = new RegExp(rule.dedupeKeyPattern, "i");
    titleStripRegexes = (rule.titleStripPatterns || []).map((p) => new RegExp(p, "i"));
  } catch (err) {
    console.warn(`${logPrefix} skipping rule with bad regex:`, err.message);
    return;
  }

  const folderName = await getBookmarkFolderName();
  const porterFolder = await findPorterFolder(folderName);
  if (!porterFolder) {
    console.log(`${logPrefix} url-porter folder not found, skipping`);
    return;
  }

  const [historyItems, bookmarkItems] = await Promise.all([
    getFromHistory(rule.historyKeywords, urlMatchRegex, dedupeKeyRegex, titleStripRegexes),
    getFromBookmarks(porterFolder.id, urlMatchRegex, dedupeKeyRegex, titleStripRegexes),
  ]);

  // Merge — history wins for visitTime, prefer richer title
  const allItems = new Map();
  for (const [key, val] of historyItems) {
    allItems.set(key, val);
  }
  for (const [key, val] of bookmarkItems) {
    const existing = allItems.get(key);
    if (existing) {
      allItems.set(key, {
        ...existing,
        title: existing.title || val.title,
        visitTime: Math.max(existing.visitTime || 0, val.visitTime || 0),
      });
    } else {
      allItems.set(key, val);
    }
  }

  console.log(`${logPrefix} found ${allItems.size} unique items (history: ${historyItems.size}, bookmarks: ${bookmarkItems.size})`);

  if (allItems.size === 0) return;

  // Delete old subfolder
  const subfolderName = rule.name.trim();
  const porterChildren = await chrome.bookmarks.getChildren(porterFolder.id);
  const oldSubfolder = porterChildren.find((c) => !c.url && c.title === subfolderName);
  if (oldSubfolder) {
    await chrome.bookmarks.removeTree(oldSubfolder.id);
    console.log(`${logPrefix} deleted old folder`);
  }

  // Create new subfolder at end of porter folder
  const updatedChildren = await chrome.bookmarks.getChildren(porterFolder.id);
  const subfolder = await chrome.bookmarks.create({
    parentId: porterFolder.id,
    title: subfolderName,
    index: updatedChildren.length,
  });

  // Sort
  const sortField = rule.sortField || "visitTime";
  const sortDesc = (rule.sortDirection || "desc") === "desc";
  const sorted = [...allItems.values()].sort((a, b) => {
    if (sortField === "title") {
      const cmp = (a.title || "").toLowerCase().localeCompare((b.title || "").toLowerCase());
      return sortDesc ? -cmp : cmp;
    }
    const cmp = (a.visitTime || 0) - (b.visitTime || 0);
    return sortDesc ? -cmp : cmp;
  });

  // Populate
  let added = 0;
  for (const entry of sorted) {
    const title = sanitizeBookmarkTitle(entry.title || entry.dedupeKey);
    await chrome.bookmarks.create({ parentId: subfolder.id, title, url: entry.url });
    added++;
  }

  console.log(`${logPrefix} done. added: ${added} items`);
}

/**
 * Reconcile all enabled custom bookmark rules.
 * Reads rules from storage and runs each sequentially.
 *
 * @returns {Promise<void>}
 */
export async function reconcileAllBookmarkRules() {
  const rules = await getBookmarkRules();
  const enabledRules = rules.filter((r) => r.enabled);
  if (enabledRules.length === 0) return;

  console.log(`[genericBookmarkRuleUtils] reconciling ${enabledRules.length} custom rule(s)...`);
  for (const rule of enabledRules) {
    await reconcileBookmarkRule(rule);
  }
  console.log(`[genericBookmarkRuleUtils] all custom rules reconciled`);
}
