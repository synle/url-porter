/**
 * Service worker (background script) for URL Porter.
 *
 * Responsibilities:
 * - Maintain declarativeNetRequest redirect rules from user config
 * - Provide omnibox suggestions (keyword: "go")
 * - Context menu "Add This Page to URL Porter"
 * - Sync bookmarks with config on every change
 */

import { normalizeEntriesForRedirect, normalizeEntry, stripAlias } from "../helpers/configUtils.js";
import { getConfig, getBookmarkFolderName, setPrStatus, setJiraStatus } from "../helpers/storage.js";
import { reconcileBookmarks } from "../helpers/bookmarkUtils.js";
import { reconcilePrs } from "../helpers/prUtils.js";
import { reconcileGitHubRepos } from "../helpers/githubRepoUtils.js";
import { reconcileFigmaMocks } from "../helpers/figmaMockUtils.js";
import { reconcileJiraTickets } from "../helpers/jiraTicketUtils.js";
import { reconcileGoogleDrive } from "../helpers/googleDriveUtils.js";
import { reconcileOnedrive } from "../helpers/onedriveUtils.js";

// --- Lifecycle ---

/** Set up rules, bookmarks, context menu, and omnibox on install/update. */
chrome.runtime.onInstalled.addListener(async () => {
  await updateRedirectRules();
  reconcileBookmarksFromStorage();

  chrome.contextMenus.create({
    id: "add-to-url-porter",
    title: "Add This Page to URL Porter",
    contexts: ["page"],
  });

  chrome.omnibox.setDefaultSuggestion({
    description: "Search URL Porter links: %s",
  });
});

// --- Context Menu ---

/** Open the Add Link page pre-filled with the current tab's URL and title. */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "add-to-url-porter") {
    const url = encodeURIComponent(tab.url || "");
    const title = encodeURIComponent(tab.title || "");
    const addLinkUrl = chrome.runtime.getURL(`pages/addlink/addlink.html?url=${url}&title=${title}`);
    chrome.tabs.create({ url: addLinkUrl });
  }
});

// --- Message & Storage Listeners ---

/**
 * Reconciliation queue. Ensures only one reconciliation runs at a time.
 * If new requests arrive while a reconciliation is in progress, a single
 * follow-up reconciliation is scheduled after the current one finishes.
 * Uses a debounce so rapid-fire events (e.g. 20 tabs opening at once)
 * are batched into one reconciliation pass.
 */
let reconcileRunning = false;
let reconcilePending = false;
let reconcileTimer = null;

/**
 * Schedule a reconciliation. Debounces rapid calls and serializes execution
 * so only one reconciliation runs at a time.
 */
function scheduleReconcile() {
  clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => runReconcile(), 1000);
}

/**
 * Execute reconciliation with queue/lock protection.
 * @returns {Promise<void>}
 */
async function runReconcile() {
  if (reconcileRunning) {
    reconcilePending = true;
    return;
  }
  reconcileRunning = true;
  try {
    await reconcileBookmarksFromStorage();
  } finally {
    reconcileRunning = false;
    if (reconcilePending) {
      reconcilePending = false;
      // Small delay before the follow-up pass to collect any last stragglers
      clearTimeout(reconcileTimer);
      reconcileTimer = setTimeout(() => runReconcile(), 500);
    }
  }
}

/** Re-sync rules and bookmarks when UI pages send an update event. */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === "Myevent.updateConfig") {
    updateRedirectRules().then(scheduleReconcile);
  }
  if (request.type === "Myevent.prStatus") {
    setPrStatus(request.url, request.status).then(() => {
      console.log("[background] stored PR status:", request.status, "for", request.url);
      scheduleReconcile();
    });
    return;
  }
  if (request.type === "Myevent.jiraStatus") {
    setJiraStatus(request.url, request.status).then(() => {
      console.log("[background] stored Jira status:", request.status, "for", request.url);
      scheduleReconcile();
    });
    return;
  }
  if (request.type === "Myevent.getBookmarks") {
    getNestedBookmarks().then(sendResponse);
    return true; // keep channel open for async response
  }
});

/**
 * Collect all bookmarks from nested subfolders of the url-porter folder.
 * Skips root-level bookmarks (only returns items inside subfolders).
 * Returns a flat array of { url, title }.
 */
async function getNestedBookmarks() {
  try {
    const name = await getBookmarkFolderName();
    const results = await chrome.bookmarks.search({ title: name });
    const porterFolder = results.find((node) => !node.url && (node.parentId === "1" || node.parentId === "2"));
    if (!porterFolder) return [];

    const children = await chrome.bookmarks.getChildren(porterFolder.id);
    const bookmarks = [];

    for (const child of children) {
      // Only process subfolders (skip root-level bookmarks)
      if (child.url) continue;
      await walkFolder(child, bookmarks);
    }
    return bookmarks;
  } catch (err) {
    console.error("[background] getNestedBookmarks failed:", err);
    return [];
  }
}

/**
 * Recursively collect all bookmarks from a folder and its subfolders.
 *
 * @param {chrome.bookmarks.BookmarkTreeNode} node - The folder node to walk
 * @param {Array<{url: string, title: string}>} out - Accumulator array for results
 * @returns {Promise<void>}
 */
async function walkFolder(node, out) {
  const children = await chrome.bookmarks.getChildren(node.id);
  for (const child of children) {
    if (child.url) {
      out.push({ url: child.url, title: child.title });
    } else {
      await walkFolder(child, out);
    }
  }
}

/**
 * Backup listener: sync when config changes via chrome.storage directly
 * (e.g. cross-device sync or external writes).
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.jsonConfig) {
    updateRedirectRules().then(scheduleReconcile);
  }
});

// --- Omnibox ---

/** Provide autocomplete suggestions as the user types in the omnibox. */
chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const raw = await getConfig();
  const query = text.toLowerCase().trim();
  if (!query) return suggest([]);

  const suggestions = [];
  for (const item of raw) {
    const entry = normalizeEntry(item);
    if (!entry) continue;

    const alias = stripAlias(entry.from);
    if (alias.toLowerCase().includes(query)) {
      suggestions.push({
        content: entry.to,
        description: `<match>${escapeXml(alias)}</match> &rarr; <url>${escapeXml(entry.to)}</url>`,
      });
    }
  }
  suggest(suggestions);
});

/** Navigate to the selected suggestion or the first matching alias. */
chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  let url = text;

  // If text isn't already a URL (from selecting a suggestion), look up the alias
  if (!text.startsWith("http://") && !text.startsWith("https://")) {
    const raw = await getConfig();
    const query = text.toLowerCase().trim();
    for (const item of raw) {
      const entry = normalizeEntry(item);
      if (!entry) continue;
      const alias = stripAlias(entry.from);
      if (alias.toLowerCase().includes(query)) {
        url = entry.to;
        break;
      }
    }
  }

  switch (disposition) {
    case "newForegroundTab":
      chrome.tabs.create({ url });
      break;
    case "newBackgroundTab":
      chrome.tabs.create({ url, active: false });
      break;
    default:
      chrome.tabs.update({ url });
      break;
  }
});

// --- Redirect Rules ---

/**
 * Replace all dynamic redirect rules with the current config.
 * Each config entry becomes a declarativeNetRequest rule that redirects
 * main_frame requests matching the urlFilter pattern.
 */
async function updateRedirectRules() {
  try {
    const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = oldRules.map((rule) => rule.id);

    // Remove all old rules first
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [] });

    const raw = await getConfig();
    const configs = normalizeEntriesForRedirect(raw);

    const rules = configs.map((config, index) => ({
      id: index + 1,
      condition: {
        urlFilter: config.from,
        resourceTypes: ["main_frame"],
      },
      action: {
        type: "redirect",
        redirect: { url: config.to },
      },
    }));

    // Add rules one-by-one so a single bad rule doesn't break everything
    let added = 0;
    for (const rule of rules) {
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [], addRules: [rule] });
        added++;
      } catch (error) {
        const from = rule.condition.urlFilter;
        const to = rule.action.redirect.url;
        console.error(`Skipping bad redirect rule: "${from}" → "${to}" — ${error.message}`);
      }
    }

    console.log(`Updated ${added}/${rules.length} redirect rule(s)`);
  } catch (error) {
    console.error("Failed to update redirect rules:", error);
  }
}

// --- Bookmark Sync ---

/** Load config from storage and reconcile the bookmark folder. */
async function reconcileBookmarksFromStorage() {
  console.log("[background] reconcileBookmarksFromStorage: starting...");
  try {
    const raw = await getConfig();
    console.log("[background] reconcileBookmarksFromStorage: got config with", raw?.length, "entries");
    console.log("[background] reconcileBookmarksFromStorage: raw config:", JSON.stringify(raw, null, 2));
    await reconcileBookmarks(raw);
    console.log("[background] reconcileBookmarksFromStorage: bookmarks reconciled successfully");
    await reconcilePrs();
    console.log("[background] reconcileBookmarksFromStorage: prs reconciled successfully");
    await reconcileGitHubRepos();
    console.log("[background] reconcileBookmarksFromStorage: github repos reconciled successfully");
    await reconcileFigmaMocks();
    console.log("[background] reconcileBookmarksFromStorage: figma mocks reconciled successfully");
    await reconcileJiraTickets();
    console.log("[background] reconcileBookmarksFromStorage: jira tickets reconciled successfully");
    await reconcileGoogleDrive();
    console.log("[background] reconcileBookmarksFromStorage: google drive reconciled successfully");
    await reconcileOnedrive();
    console.log("[background] reconcileBookmarksFromStorage: onedrive reconciled successfully");
  } catch (error) {
    console.error("[background] reconcileBookmarksFromStorage: FAILED:", error, error?.stack);
  }
}

// --- Auto-reconcile on visiting tracked sites ---

const TRACKED_SITE_PATTERNS = [
  /github\.com/i,
  /githubprivate\.com/i,
  /ghe\.com/i,
  /visualstudio\.com/i,
  /dev\.azure\.com/i,
  /figma\.com/i,
  /jira/i,
  /atlassian/i,
  /docs\.google\.com/i,
  /drive\.google\.com/i,
  /onedrive\.live\.com/i,
  /sharepoint\.com/i,
];
let bucketReconcileTimer = null;

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  const isTracked = TRACKED_SITE_PATTERNS.some((re) => re.test(tab.url));
  if (!isTracked) return;
  // Debounce — wait 8s after last tracked navigation to batch rapid browsing
  // (e.g. opening a folder with 20+ tabs at once)
  clearTimeout(bucketReconcileTimer);
  bucketReconcileTimer = setTimeout(() => {
    console.log("[background] tracked site visited, scheduling reconciliation...");
    scheduleReconcile();
  }, 8000);
});

// --- Helpers ---

/**
 * Escape special XML characters for omnibox suggestion descriptions.
 * Chrome's omnibox API uses a restricted XML subset for formatting.
 */
function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
