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
import { getConfig } from "../helpers/storage.js";
import { reconcileBookmarks } from "../helpers/bookmarkUtils.js";

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

/** Re-sync rules and bookmarks when UI pages send an update event. */
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === "Myevent.updateConfig") {
    updateRedirectRules().then(() => reconcileBookmarksFromStorage());
  }
});

/** Backup listener: also sync when config changes via chrome.storage directly. */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.jsonConfig) {
    updateRedirectRules().then(() => reconcileBookmarksFromStorage());
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

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: rules,
    });

    console.log(`Updated ${rules.length} redirect rule(s)`, rules);
  } catch (error) {
    console.error("Failed to update redirect rules:", error);
  }
}

// --- Bookmark Sync ---

/** Load config from storage and reconcile the bookmark folder. */
async function reconcileBookmarksFromStorage() {
  try {
    const raw = await getConfig();
    await reconcileBookmarks(raw);
    console.log("Bookmarks reconciled");
  } catch (error) {
    console.error("Failed to reconcile bookmarks:", error);
  }
}

// --- Helpers ---

/**
 * Escape special XML characters for omnibox suggestion descriptions.
 * Chrome's omnibox API uses a restricted XML subset for formatting.
 */
function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
