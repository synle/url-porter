/**
 * Tests for the background service worker — event handler routing,
 * omnibox suggestions, redirect rule sync, and tracked-site debounce.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const listeners = {
  onInstalled: [],
  contextMenuClick: [],
  message: [],
  storageChanged: [],
  omniboxInput: [],
  omniboxEntered: [],
  tabsUpdated: [],
};

/** @type {Record<string, unknown>} */
const storageData = {};

/** @type {Array<object>} */
let mockBookmarks = [];
let nextBookmarkId = 100;

/** @type {Array<object>} */
let dynamicRules = [];

/**
 * Build a tree from flat mockBookmarks.
 * @returns {Array<object>}
 */
function buildTree() {
  /**
   * Children of a parent id.
   * @param {string} parentId
   * @returns {Array<object>}
   */
  function childrenOf(parentId) {
    return mockBookmarks.filter((b) => b.parentId === parentId).map((b) => ({ ...b, children: b.url ? undefined : childrenOf(b.id) }));
  }
  return [
    {
      id: "0",
      children: [
        { id: "1", title: "Bookmarks Bar", children: childrenOf("1") },
        { id: "2", title: "Other Bookmarks", children: childrenOf("2") },
      ],
    },
  ];
}

const chrome = {
  runtime: {
    lastError: null,
    onInstalled: { addListener: (fn) => listeners.onInstalled.push(fn) },
    onMessage: { addListener: (fn) => listeners.message.push(fn) },
    getURL: vi.fn((path) => `chrome-extension://test/${path}`),
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: { addListener: (fn) => listeners.contextMenuClick.push(fn) },
  },
  omnibox: {
    setDefaultSuggestion: vi.fn(),
    onInputChanged: { addListener: (fn) => listeners.omniboxInput.push(fn) },
    onInputEntered: { addListener: (fn) => listeners.omniboxEntered.push(fn) },
  },
  storage: {
    sync: {
      get: vi.fn((key, cb) => {
        const keys = typeof key === "string" ? [key] : Array.isArray(key) ? key : Object.keys(key);
        const result = {};
        for (const k of keys) if (storageData[k] !== undefined) result[k] = storageData[k];
        if (typeof cb === "function") cb(result);
        return Promise.resolve(result);
      }),
      set: vi.fn((obj, cb) => {
        Object.assign(storageData, obj);
        if (typeof cb === "function") cb();
        return Promise.resolve();
      }),
    },
    local: {
      get: vi.fn((key, cb) => {
        const keys = typeof key === "string" ? [key] : Array.isArray(key) ? key : Object.keys(key);
        const result = {};
        for (const k of keys) if (storageData[k] !== undefined) result[k] = storageData[k];
        if (typeof cb === "function") {
          cb(result);
          return;
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((obj, cb) => {
        Object.assign(storageData, obj);
        if (typeof cb === "function") cb();
        return Promise.resolve();
      }),
      remove: vi.fn((key, cb) => {
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) delete storageData[k];
        if (typeof cb === "function") cb();
        return Promise.resolve();
      }),
    },
    onChanged: { addListener: (fn) => listeners.storageChanged.push(fn) },
  },
  bookmarks: {
    search: vi.fn(async ({ title }) => mockBookmarks.filter((b) => b.title === title)),
    getChildren: vi.fn(async (id) => mockBookmarks.filter((b) => b.parentId === id)),
    getTree: vi.fn(async () => buildTree()),
    create: vi.fn(async ({ parentId, title, url, index }) => {
      const node = { id: String(nextBookmarkId++), parentId, title, url, index };
      mockBookmarks.push(node);
      return node;
    }),
    update: vi.fn(async (id, props) => {
      const n = mockBookmarks.find((b) => b.id === id);
      if (n) Object.assign(n, props);
      return n;
    }),
    removeTree: vi.fn(async (id) => {
      const ids = new Set();
      /**
       * @param {string} nid
       * @returns {void}
       */
      function collect(nid) {
        ids.add(nid);
        for (const b of mockBookmarks) if (b.parentId === nid) collect(b.id);
      }
      collect(id);
      for (let i = mockBookmarks.length - 1; i >= 0; i--) {
        if (ids.has(mockBookmarks[i].id)) mockBookmarks.splice(i, 1);
      }
    }),
    remove: vi.fn(),
  },
  tabs: {
    create: vi.fn(),
    update: vi.fn(),
    onUpdated: { addListener: (fn) => listeners.tabsUpdated.push(fn) },
  },
  history: {
    search: vi.fn(async () => []),
  },
  declarativeNetRequest: {
    getDynamicRules: vi.fn(async () => dynamicRules),
    updateDynamicRules: vi.fn(async ({ removeRuleIds = [], addRules = [] }) => {
      dynamicRules = dynamicRules.filter((r) => !removeRuleIds.includes(r.id));
      dynamicRules.push(...addRules);
    }),
  },
};

vi.stubGlobal("chrome", chrome);

// Use fake timers so we can advance the 1s/8s debounces deterministically.
vi.useFakeTimers();

// Import once — registers all listeners at module top level.
await import("../src/background/background.js");

/**
 * Reset mutable state between tests but keep registered listeners.
 * @returns {void}
 */
function resetState() {
  mockBookmarks = [];
  nextBookmarkId = 100;
  dynamicRules = [];
  for (const k of Object.keys(storageData)) delete storageData[k];
  /**
   * Recursively clear vi.fn mocks in an object tree.
   * @param {object} obj
   * @returns {void}
   */
  function clearMocksDeep(obj) {
    if (!obj || typeof obj !== "object") return;
    for (const v of Object.values(obj)) {
      if (v && typeof v === "function" && v.mockClear) v.mockClear();
      else if (v && typeof v === "object") clearMocksDeep(v);
    }
  }
  clearMocksDeep(chrome);
  // updateDynamicRules implementation may have been overridden — restore default.
  chrome.declarativeNetRequest.updateDynamicRules.mockImplementation(async ({ removeRuleIds = [], addRules = [] }) => {
    dynamicRules = dynamicRules.filter((r) => !removeRuleIds.includes(r.id));
    dynamicRules.push(...addRules);
  });
  vi.clearAllTimers();
}

describe("background — listener registration", () => {
  it("registers onInstalled, contextMenu, message, storage, omnibox, and tabs listeners", () => {
    expect(listeners.onInstalled.length).toBeGreaterThan(0);
    expect(listeners.contextMenuClick.length).toBeGreaterThan(0);
    expect(listeners.message.length).toBeGreaterThan(0);
    expect(listeners.storageChanged.length).toBeGreaterThan(0);
    expect(listeners.omniboxInput.length).toBeGreaterThan(0);
    expect(listeners.omniboxEntered.length).toBeGreaterThan(0);
    expect(listeners.tabsUpdated.length).toBeGreaterThan(0);
  });
});

describe("background — onInstalled", () => {
  beforeEach(() => {
    resetState();
  });

  it("creates context menus and sets default omnibox suggestion", async () => {
    await listeners.onInstalled[0]();
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "add-to-url-porter" }));
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "add-bookmark-rule" }));
    expect(chrome.omnibox.setDefaultSuggestion).toHaveBeenCalled();
  });
});

describe("background — context menu click", () => {
  beforeEach(() => {
    resetState();
  });

  it("opens addlink page when 'add-to-url-porter' clicked", () => {
    listeners.contextMenuClick[0]({ menuItemId: "add-to-url-porter" }, { url: "https://example.com/page", title: "Example" });
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: expect.stringContaining("addlink.html?url="),
    });
    const tabUrl = chrome.tabs.create.mock.calls[0][0].url;
    expect(tabUrl).toContain(encodeURIComponent("https://example.com/page"));
    expect(tabUrl).toContain(encodeURIComponent("Example"));
  });

  it("opens addrule page when 'add-bookmark-rule' clicked", () => {
    listeners.contextMenuClick[0]({ menuItemId: "add-bookmark-rule" }, { url: "https://example.com/" });
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: expect.stringContaining("addrule.html?url="),
    });
  });

  it("ignores unknown menu item IDs", () => {
    listeners.contextMenuClick[0]({ menuItemId: "other" }, { url: "https://x" });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("falls back to empty URL/title when tab fields missing", () => {
    listeners.contextMenuClick[0]({ menuItemId: "add-to-url-porter" }, {});
    expect(chrome.tabs.create).toHaveBeenCalled();
  });
});

describe("background — message handler", () => {
  beforeEach(() => {
    resetState();
  });

  it("handles Myevent.updateConfig", async () => {
    storageData.jsonConfig = [{ from: "gh", to: "https://github.com" }];
    listeners.message[0]({ type: "Myevent.updateConfig" }, {}, () => {});
    await vi.advanceTimersByTimeAsync(2000);
    expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalled();
  });

  it("handles Myevent.prStatus", async () => {
    listeners.message[0]({ type: "Myevent.prStatus", url: "https://github.com/a/b/pull/1", status: "merged" }, {}, () => {});
    await vi.advanceTimersByTimeAsync(2000);
    expect(storageData.prStatuses["https://github.com/a/b/pull/1"]).toBe("merged");
  });

  it("handles Myevent.jiraStatus", async () => {
    listeners.message[0](
      { type: "Myevent.jiraStatus", url: "https://acme.atlassian.net/browse/FOO-1", status: "in_progress" },
      {},
      () => {},
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(storageData.jiraStatuses["https://acme.atlassian.net/browse/FOO-1"]).toBe("in_progress");
  });

  it("handles Myevent.getBookmarks and returns nested bookmarks", async () => {
    // Set up a porter folder with a nested bookmark
    const porter = { id: "100", parentId: "2", title: "url-porter" };
    const sub = { id: "101", parentId: "100", title: "prs" };
    const bookmark = { id: "102", parentId: "101", title: "PR 1", url: "https://github.com/a/b/pull/1" };
    mockBookmarks.push(porter, sub, bookmark);

    const response = await new Promise((resolve) => {
      const keepOpen = listeners.message[0]({ type: "Myevent.getBookmarks" }, {}, resolve);
      expect(keepOpen).toBe(true);
    });
    expect(response).toBeDefined();
    expect(response.some((b) => b.url === "https://github.com/a/b/pull/1")).toBe(true);
  });

  it("ignores unknown message types", () => {
    const r = listeners.message[0]({ type: "Unknown" }, {}, () => {});
    // Should not throw and not return true (no async response)
    expect(r).not.toBe(true);
  });
});

describe("background — storage.onChanged", () => {
  beforeEach(() => {
    resetState();
  });

  it("refreshes redirect rules when sync.jsonConfig changes", async () => {
    storageData.jsonConfig = [{ from: "gh", to: "https://github.com" }];
    listeners.storageChanged[0]({ jsonConfig: {} }, "sync");
    await vi.advanceTimersByTimeAsync(2000);
    expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalled();
  });

  it("ignores changes in other storage areas", async () => {
    listeners.storageChanged[0]({ other: {} }, "local");
    await vi.advanceTimersByTimeAsync(2000);
    expect(chrome.declarativeNetRequest.updateDynamicRules).not.toHaveBeenCalled();
  });
});

describe("background — omnibox", () => {
  beforeEach(() => {
    resetState();
  });

  it("returns matching suggestions for typed text", async () => {
    storageData.jsonConfig = [
      { from: "||gh^", to: "https://github.com" },
      { from: "||gl^", to: "https://gitlab.com" },
    ];
    const suggest = vi.fn();
    await listeners.omniboxInput[0]("gh", suggest);
    expect(suggest).toHaveBeenCalled();
    const last = suggest.mock.calls[suggest.mock.calls.length - 1][0];
    expect(last.some((s) => s.content === "https://github.com")).toBe(true);
  });

  it("returns empty suggestions for empty input", async () => {
    storageData.jsonConfig = [{ from: "||gh^", to: "https://github.com" }];
    const suggest = vi.fn();
    await listeners.omniboxInput[0]("", suggest);
    expect(suggest).toHaveBeenLastCalledWith([]);
  });

  it("XML-escapes special chars in suggestion description", async () => {
    storageData.jsonConfig = [{ from: "||a&b^", to: "https://x.com?a=1&b=2" }];
    const suggest = vi.fn();
    await listeners.omniboxInput[0]("a&b", suggest);
    const desc = suggest.mock.calls[suggest.mock.calls.length - 1][0][0].description;
    expect(desc).toContain("&amp;");
  });

  it("onInputEntered navigates directly when input is a URL (currentTab)", async () => {
    await listeners.omniboxEntered[0]("https://direct.example.com", "currentTab");
    expect(chrome.tabs.update).toHaveBeenCalledWith({ url: "https://direct.example.com" });
  });

  it("onInputEntered opens in newForegroundTab", async () => {
    await listeners.omniboxEntered[0]("https://x.com", "newForegroundTab");
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://x.com" });
  });

  it("onInputEntered opens in newBackgroundTab", async () => {
    await listeners.omniboxEntered[0]("https://x.com", "newBackgroundTab");
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://x.com", active: false });
  });

  it("onInputEntered resolves alias when input is not a URL", async () => {
    storageData.jsonConfig = [{ from: "||gh^", to: "https://github.com" }];
    await listeners.omniboxEntered[0]("gh", "currentTab");
    expect(chrome.tabs.update).toHaveBeenCalledWith({ url: "https://github.com" });
  });
});

describe("background — tabs.onUpdated", () => {
  beforeEach(() => {
    resetState();
  });

  it("ignores non-complete events", () => {
    listeners.tabsUpdated[0](1, { status: "loading" }, { url: "https://github.com" });
    // No timer should be scheduled
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores tabs without a URL", () => {
    listeners.tabsUpdated[0](1, { status: "complete" }, { url: "" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores untracked URLs", () => {
    listeners.tabsUpdated[0](1, { status: "complete" }, { url: "https://random.example.com" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("debounces tracked-site visits and schedules reconciliation after 8s", async () => {
    listeners.tabsUpdated[0](1, { status: "complete" }, { url: "https://github.com/a/b/pull/1" });
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(10000);
    // reconciliation chain ran (declarativeNetRequest may not be called here, but the bookmark search will)
    expect(chrome.bookmarks.search).toHaveBeenCalled();
  });

  it("recognizes Jira, Atlassian, Figma, Azure, OneDrive, SharePoint, Drive as tracked", () => {
    const urls = [
      "https://jira01.corp.example.com/browse/FOO-1",
      "https://acme.atlassian.net/browse/FOO-1",
      "https://www.figma.com/design/X/Mock",
      "https://acme.visualstudio.com/p/_git/r",
      "https://dev.azure.com/o/p",
      "https://onedrive.live.com/",
      "https://acme.sharepoint.com/x",
      "https://docs.google.com/document/d/X/edit",
      "https://drive.google.com/file/d/X/view",
    ];
    for (const url of urls) {
      const beforeCount = vi.getTimerCount();
      listeners.tabsUpdated[0](1, { status: "complete" }, { url });
      // Each tracked site visit either creates a new timer or replaces the existing one.
      expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1);
      // Clear pending timer so the next iteration starts clean
      vi.clearAllTimers();
      void beforeCount;
    }
  });
});

describe("background — updateRedirectRules", () => {
  beforeEach(() => {
    resetState();
  });

  it("rebuilds redirect rules from stored config", async () => {
    storageData.jsonConfig = [
      { from: "gh", to: "github.com" },
      { from: "gl", to: "https://gitlab.com" },
    ];
    listeners.message[0]({ type: "Myevent.updateConfig" }, {}, () => {});
    await vi.advanceTimersByTimeAsync(2000);
    // First call: remove old rules. Then per-rule adds.
    expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalled();
    expect(dynamicRules.length).toBe(2);
  });

  it("skips rules that fail to add (per-rule try/catch)", async () => {
    storageData.jsonConfig = [
      { from: "gh", to: "github.com" },
      { from: "bad", to: "https://bad.com" },
    ];
    let callCount = 0;
    chrome.declarativeNetRequest.updateDynamicRules.mockImplementation(async ({ removeRuleIds = [], addRules = [] }) => {
      callCount++;
      // First call: bulk remove. After that, per-rule add. Reject the second add.
      if (callCount === 3) throw new Error("invalid pattern");
      dynamicRules = dynamicRules.filter((r) => !removeRuleIds.includes(r.id));
      dynamicRules.push(...addRules);
    });
    listeners.message[0]({ type: "Myevent.updateConfig" }, {}, () => {});
    await vi.advanceTimersByTimeAsync(2000);
    expect(dynamicRules.length).toBe(1);
  });
});
