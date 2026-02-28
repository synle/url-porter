import { normalizeEntriesForRedirect, normalizeEntry } from "../helpers/configUtils.js";
import { reconcileBookmarks } from "../helpers/bookmarkUtils.js";

// Initialize redirect rules, bookmarks, context menu, and omnibox on installation
chrome.runtime.onInstalled.addListener(async () => {
  await updateRedirectRules();
  reconcileBookmarksFromStorage();

  // Create context menu item
  chrome.contextMenus.create({
    id: "add-to-url-porter",
    title: "Add This Page to URL Porter",
    contexts: ["page"],
  });

  chrome.omnibox.setDefaultSuggestion({
    description: "Search URL Porter links: %s",
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "add-to-url-porter") {
    const url = encodeURIComponent(tab.url || "");
    const title = encodeURIComponent(tab.title || "");
    const addLinkUrl = chrome.runtime.getURL(
      `pages/addlink/addlink.html?url=${url}&title=${title}`,
    );
    chrome.tabs.create({ url: addLinkUrl });
  }
});

// Listen for configuration updates
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === "Myevent.updateConfig") {
    updateRedirectRules().then(() => reconcileBookmarksFromStorage());
  }
});

// Backup listener: sync bookmarks whenever config storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.jsonConfig) {
    updateRedirectRules().then(() => reconcileBookmarksFromStorage());
  }
});

// --- Omnibox ---

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const raw = await getRawConfig();
  const query = text.toLowerCase().trim();
  if (!query) return suggest([]);

  const suggestions = [];
  for (const item of raw) {
    const entry = normalizeEntry(item);
    if (!entry) continue;

    let alias = entry.from;
    if (alias.startsWith("||")) alias = alias.slice(2);
    if (alias.endsWith("^")) alias = alias.slice(0, -1);

    if (alias.toLowerCase().includes(query)) {
      const escapedAlias = escapeXml(alias);
      const escapedUrl = escapeXml(entry.to);
      suggestions.push({
        content: entry.to,
        description: `<match>${escapedAlias}</match> &rarr; <url>${escapedUrl}</url>`,
      });
    }
  }
  suggest(suggestions);
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  // If `text` is already a URL (selected from suggestions), use it directly.
  // Otherwise, try to find a matching alias.
  let url = text;
  if (!text.startsWith("http://") && !text.startsWith("https://")) {
    const raw = await getRawConfig();
    const query = text.toLowerCase().trim();
    for (const item of raw) {
      const entry = normalizeEntry(item);
      if (!entry) continue;
      let alias = entry.from;
      if (alias.startsWith("||")) alias = alias.slice(2);
      if (alias.endsWith("^")) alias = alias.slice(0, -1);
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

// --- Redirect rules ---

async function updateRedirectRules() {
  try {
    const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = oldRules.map((rule) => rule.id);

    const raw = await getRawConfig();
    const configs = normalizeEntriesForRedirect(raw);

    const rules = configs.map((config, index) => ({
      id: index + 1,
      condition: {
        urlFilter: config.from,
        resourceTypes: ["main_frame"],
      },
      action: {
        type: "redirect",
        redirect: {
          url: config.to,
        },
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

// --- Bookmark sync ---

async function reconcileBookmarksFromStorage() {
  try {
    const raw = await getRawConfig();
    await reconcileBookmarks(raw);
    console.log("Bookmarks reconciled");
  } catch (error) {
    console.error("Failed to reconcile bookmarks:", error);
  }
}

// --- Helpers ---

function getRawConfig() {
  return chrome.storage.sync.get(["jsonConfig"]).then((result) => {
    const raw = result.jsonConfig || [];
    return Array.isArray(raw) ? raw : [];
  });
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
