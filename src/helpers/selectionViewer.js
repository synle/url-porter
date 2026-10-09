/** Context-menu actions on selected text: preview it as rendered Markdown, or format it with a chosen syntax, in a new viewer tab. */

/** Context menu ids. @type {{preview: string, formatParent: string, formatPrefix: string}} */
export const SELECTION_MENU = {
  preview: "selection-preview-markdown",
  formatParent: "selection-format",
  formatPrefix: "selection-format:",
};

/** chrome.storage.session key prefix for handed-off selections. @type {string} */
export const VIEWER_KEY_PREFIX = "textview:";

/** How many handed-off selections stay in session storage (older ones are pruned). @type {number} */
export const VIEWER_KEEP = 10;

/** Extension path of the viewer page. @type {string} */
export const VIEWER_PAGE = "viewer/textview.html";

/**
 * Register the selection context menus: "Preview Markdown" plus a "Format" submenu with one item per language.
 * @param {Array<{id: string, label: string}>} languages - Supported syntaxes.
 * @returns {void}
 */
export function createSelectionMenus(languages) {
  chrome.contextMenus.create({
    id: SELECTION_MENU.preview,
    title: "Preview Selection as Markdown",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: SELECTION_MENU.formatParent,
    title: "Format Selection as",
    contexts: ["selection"],
  });
  for (const lang of languages) {
    chrome.contextMenus.create({
      id: SELECTION_MENU.formatPrefix + lang.id,
      parentId: SELECTION_MENU.formatParent,
      title: lang.label,
      contexts: ["selection"],
    });
  }
}

/**
 * Read the selection in the page with line breaks intact (info.selectionText collapses whitespace).
 * Covers <textarea>/<input> selections, which window.getSelection() does not see.
 * Runs inside the page via chrome.scripting.
 * @returns {string} Selected text.
 */
function readPageSelection() {
  const el = document.activeElement;
  if (el && /^(TEXTAREA|INPUT)$/.test(el.tagName) && typeof el.selectionStart === "number") {
    return el.value.slice(el.selectionStart, el.selectionEnd);
  }
  return String(window.getSelection() || "");
}

/**
 * Get the selected text for a context-menu click, preferring the exact page selection.
 * Falls back to info.selectionText when injection is blocked (chrome:// pages, PDF viewer, web store).
 * @param {chrome.contextMenus.OnClickData} info - Click data.
 * @param {chrome.tabs.Tab} [tab] - Tab the click came from.
 * @returns {Promise<string>} Selected text.
 */
export async function getSelectedText(info, tab) {
  const fallback = info.selectionText || "";
  if (tab?.id === undefined) return fallback;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
      func: readPageSelection,
    });
    return result?.result || fallback;
  } catch (err) {
    console.warn("[selectionViewer] selection injection failed, using selectionText", err);
    return fallback;
  }
}

/**
 * Store text in session storage under a fresh key, pruning all but the newest handed-off entries.
 * @param {string} text - Text to hand to the viewer page.
 * @param {number} now - Timestamp used to order entries.
 * @returns {Promise<string>} Storage key.
 */
async function stashText(text, now) {
  const key = `${VIEWER_KEY_PREFIX}${now}-${crypto.randomUUID()}`;
  const all = await chrome.storage.session.get(null);
  const stale = Object.keys(all)
    .filter((k) => k.startsWith(VIEWER_KEY_PREFIX))
    .sort((a, b) => Number(a.split(/[:-]/)[1]) - Number(b.split(/[:-]/)[1]))
    .slice(0, -(VIEWER_KEEP - 1) || undefined);
  if (stale.length) await chrome.storage.session.remove(stale);
  await chrome.storage.session.set({ [key]: text });
  return key;
}

/**
 * Handle a selection context-menu click: hand the text to the viewer page and open it next to the source tab.
 * @param {chrome.contextMenus.OnClickData} info - Click data.
 * @param {chrome.tabs.Tab} [tab] - Source tab.
 * @param {number} [now] - Timestamp (injectable for tests).
 * @returns {Promise<boolean>} True when the click was a selection-viewer item.
 */
export async function handleSelectionMenuClick(info, tab, now = Date.now()) {
  const id = String(info.menuItemId);
  let params;
  if (id === SELECTION_MENU.preview) {
    params = new URLSearchParams({ mode: "markdown" });
  } else if (id.startsWith(SELECTION_MENU.formatPrefix)) {
    params = new URLSearchParams({
      mode: "format",
      lang: id.slice(SELECTION_MENU.formatPrefix.length),
    });
  } else {
    return false;
  }
  const text = await getSelectedText(info, tab);
  params.set("key", await stashText(text, now));
  const create = { url: chrome.runtime.getURL(`${VIEWER_PAGE}?${params}`) };
  if (tab?.index !== undefined) create.index = tab.index + 1;
  await chrome.tabs.create(create);
  return true;
}
