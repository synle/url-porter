/**
 * Shared in-memory chrome API mock used by helper tests.
 *
 * Provides a Jest/Vitest-friendly fake for the bookmark, history, and
 * storage APIs that mirror the surface the helper modules use.
 */

import { vi } from "vitest";

/**
 * Build a fresh chrome API mock backed by an in-memory bookmark store.
 *
 * @param {object} [opts]
 * @param {Record<string, unknown>} [opts.initialStorage] Initial chrome.storage.local payload.
 * @returns {{
 *   chrome: object,
 *   mockBookmarks: Array<object>,
 *   storageData: Record<string, unknown>,
 *   addMockFolder: (parentId: string, title: string) => object,
 *   addMockBookmark: (parentId: string, title: string, url: string, dateAdded?: number) => object,
 *   reset: () => void,
 *   setHistory: (resultsByText: Record<string, Array<object>>) => void,
 * }}
 */
export function createChromeMock(opts = {}) {
  const mockBookmarks = [];
  let nextBookmarkId = 100;
  const storageData = {
    bookmarkFolderName: "url-porter",
    githubOrgThreshold: 3,
    prStatuses: {},
    jiraStatuses: {},
    ...(opts.initialStorage || {}),
  };

  /**
   * Build a bookmark tree from the flat mockBookmarks array.
   * @returns {{id: string, children: Array}} Root tree node.
   */
  function buildTree() {
    /**
     * Recursively collect children for a given parent ID.
     * @param {string} parentId - The parent node ID.
     * @returns {Array} Child nodes with nested children.
     */
    function childrenOf(parentId) {
      return mockBookmarks
        .filter((b) => b.parentId === parentId)
        .map((b) => ({ ...b, children: b.url ? undefined : childrenOf(b.id) }));
    }
    return {
      id: "0",
      children: [
        { id: "1", title: "Bookmarks Bar", children: childrenOf("1") },
        { id: "2", title: "Other Bookmarks", children: childrenOf("2") },
      ],
    };
  }

  const chrome = {
    bookmarks: {
      search: vi.fn(async ({ title }) => mockBookmarks.filter((b) => b.title === title)),
      getChildren: vi.fn(async (id) => mockBookmarks.filter((b) => b.parentId === id)),
      getTree: vi.fn(async () => [buildTree()]),
      create: vi.fn(async ({ parentId, title, url, index }) => {
        const node = { id: String(nextBookmarkId++), parentId, title, url, index };
        mockBookmarks.push(node);
        return node;
      }),
      update: vi.fn(async (id, { url, title }) => {
        const node = mockBookmarks.find((b) => b.id === id);
        if (node) {
          if (url !== undefined) node.url = url;
          if (title !== undefined) node.title = title;
        }
        return node;
      }),
      removeTree: vi.fn(async (id) => {
        const toRemove = new Set();
        /**
         * Recursively collect node IDs to remove.
         * @param {string} nodeId - Node ID to start from.
         * @returns {void}
         */
        function collect(nodeId) {
          toRemove.add(nodeId);
          for (const b of mockBookmarks) {
            if (b.parentId === nodeId) collect(b.id);
          }
        }
        collect(id);
        for (let i = mockBookmarks.length - 1; i >= 0; i--) {
          if (toRemove.has(mockBookmarks[i].id)) mockBookmarks.splice(i, 1);
        }
      }),
      remove: vi.fn(async (id) => {
        const idx = mockBookmarks.findIndex((b) => b.id === id);
        if (idx >= 0) mockBookmarks.splice(idx, 1);
      }),
    },
    history: {
      search: vi.fn(async () => []),
    },
    storage: {
      local: {
        get: vi.fn((key, callback) => {
          const keys =
            typeof key === "string"
              ? [key]
              : Array.isArray(key)
                ? key
                : key && typeof key === "object"
                  ? Object.keys(key)
                  : [];
          const result = {};
          for (const k of keys) {
            if (storageData[k] !== undefined) result[k] = storageData[k];
            else if (key && typeof key === "object" && !Array.isArray(key)) result[k] = key[k];
          }
          if (typeof callback === "function") {
            callback(result);
            return;
          }
          return Promise.resolve(result);
        }),
        set: vi.fn((obj, callback) => {
          Object.assign(storageData, obj);
          if (typeof callback === "function") callback();
          return Promise.resolve();
        }),
        remove: vi.fn((key, callback) => {
          const keys = Array.isArray(key) ? key : [key];
          for (const k of keys) delete storageData[k];
          if (typeof callback === "function") callback();
          return Promise.resolve();
        }),
      },
      sync: {
        get: vi.fn((key, callback) => {
          const keys =
            typeof key === "string" ? [key] : Array.isArray(key) ? key : Object.keys(key);
          const result = {};
          for (const k of keys) {
            if (storageData[k] !== undefined) result[k] = storageData[k];
          }
          if (typeof callback === "function") {
            callback(result);
            return;
          }
          return Promise.resolve(result);
        }),
        set: vi.fn((obj, callback) => {
          Object.assign(storageData, obj);
          if (typeof callback === "function") callback();
          return Promise.resolve();
        }),
      },
    },
    runtime: {
      lastError: null,
      sendMessage: vi.fn(),
      getURL: vi.fn((path) => `chrome-extension://test/${path}`),
    },
  };

  /**
   * Add a folder node to the mock bookmark store.
   * @param {string} parentId
   * @param {string} title
   * @returns {object}
   */
  function addMockFolder(parentId, title) {
    const id = String(nextBookmarkId++);
    const node = { id, parentId, title };
    mockBookmarks.push(node);
    return node;
  }

  /**
   * Add a bookmark node to the mock bookmark store.
   * @param {string} parentId
   * @param {string} title
   * @param {string} url
   * @param {number} [dateAdded]
   * @returns {object}
   */
  function addMockBookmark(parentId, title, url, dateAdded) {
    const id = String(nextBookmarkId++);
    const node = { id, parentId, title, url, dateAdded: dateAdded || Date.now() };
    mockBookmarks.push(node);
    return node;
  }

  /**
   * Reset the in-memory state to a clean slate.
   * @returns {void}
   */
  function reset() {
    mockBookmarks.length = 0;
    nextBookmarkId = 100;
    for (const k of Object.keys(storageData)) delete storageData[k];
    Object.assign(storageData, {
      bookmarkFolderName: "url-porter",
      githubOrgThreshold: 3,
      prStatuses: {},
      jiraStatuses: {},
      ...(opts.initialStorage || {}),
    });
    chrome.runtime.lastError = null;
    // Clear mock call history so each test inspects only its own invocations.
    chrome.history.search.mockClear();
    chrome.bookmarks.search.mockClear();
    chrome.bookmarks.getChildren.mockClear();
    chrome.bookmarks.getTree.mockClear();
    chrome.bookmarks.create.mockClear();
    chrome.bookmarks.update.mockClear();
    chrome.bookmarks.removeTree.mockClear();
    chrome.bookmarks.remove.mockClear();
    chrome.history.search.mockImplementation(async () => []);
    chrome.bookmarks.getTree.mockImplementation(async () => [buildTree()]);
  }

  /**
   * Configure chrome.history.search to return results keyed by query text.
   * Any text not present returns an empty array.
   * @param {Record<string, Array<object>>} resultsByText
   * @returns {void}
   */
  function setHistory(resultsByText) {
    chrome.history.search.mockImplementation(async ({ text }) => {
      // Find any key the search text contains (e.g. "github.com/pull" key matches text "github.com/pull")
      if (resultsByText[text]) return resultsByText[text];
      for (const key of Object.keys(resultsByText)) {
        if (text === key) return resultsByText[key];
      }
      return [];
    });
  }

  return { chrome, mockBookmarks, storageData, addMockFolder, addMockBookmark, reset, setHistory };
}
