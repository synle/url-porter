/**
 * Tests for genericBookmarkRuleUtils — validates rule validation, URL parsing,
 * title cleaning, and the full reconciliation flow with mocked Chrome APIs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock chrome APIs before importing the module
const mockBookmarks = [];
let nextBookmarkId = 100;

/** @type {Record<string, unknown>} */
const storageData = {
  bookmarkFolderName: "url-porter",
  bookmarkRules: [],
};

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
    removeTree: vi.fn(async (id) => {
      const toRemove = new Set();
      /**
       * Recursively collect node IDs to remove.
       * @param {string} nodeId - The node ID to start from.
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
  },
  history: {
    search: vi.fn(async () => []),
  },
  storage: {
    local: {
      get: vi.fn((key, callback) => {
        const k = typeof key === "string" ? key : Object.keys(key)[0];
        const result = { [k]: storageData[k] };
        if (typeof callback === "function") {
          callback(result);
          return;
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((data, callback) => {
        Object.assign(storageData, data);
        if (typeof callback === "function") callback();
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    lastError: null,
  },
};

vi.stubGlobal("chrome", chrome);

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
    return mockBookmarks.filter((b) => b.parentId === parentId).map((b) => ({ ...b, children: b.url ? undefined : childrenOf(b.id) }));
  }
  return { id: "0", children: childrenOf("0") };
}

/**
 * Create a valid sample bookmark rule for testing.
 * @param {object} [overrides] - Fields to override on the default rule.
 * @returns {object} A bookmark rule.
 */
function sampleRule(overrides = {}) {
  return {
    id: "test-rule-1",
    name: "acme docs",
    historyKeywords: ["acme.example.com"],
    urlMatchPattern: "^https?://acme\\.example\\.com/docs/[^/?#]+",
    dedupeKeyPattern: "acme\\.example\\.com/docs/([^/?#]+)",
    titleStripPatterns: ["\\s*-\\s*Acme Docs.*$"],
    sortField: "visitTime",
    sortDirection: "desc",
    enabled: true,
    ...overrides,
  };
}

// Import after mocking
const { validateRule, reconcileBookmarkRule, reconcileAllBookmarkRules } = await import("../src/helpers/genericBookmarkRuleUtils.js");

describe("validateRule", () => {
  it("accepts a valid rule", () => {
    const result = validateRule(sampleRule());
    expect(result.valid).toBe(true);
  });

  it("rejects null", () => {
    const result = validateRule(null);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("object");
  });

  it("rejects missing name", () => {
    const result = validateRule(sampleRule({ name: "" }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Name");
  });

  it("rejects reserved folder names", () => {
    for (const name of ["prs", "github repos", "figma mocks", "jira tickets", "google drive", "onedrive"]) {
      const result = validateRule(sampleRule({ name }));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("reserved");
    }
  });

  it("rejects reserved names case-insensitively", () => {
    const result = validateRule(sampleRule({ name: "Google Drive" }));
    expect(result.valid).toBe(false);
  });

  it("rejects empty historyKeywords", () => {
    const result = validateRule(sampleRule({ historyKeywords: [] }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("keyword");
  });

  it("rejects invalid urlMatchPattern regex", () => {
    const result = validateRule(sampleRule({ urlMatchPattern: "[invalid" }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("URL match pattern");
  });

  it("rejects invalid dedupeKeyPattern regex", () => {
    const result = validateRule(sampleRule({ dedupeKeyPattern: "[invalid" }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("dedup key pattern");
  });

  it("rejects invalid titleStripPatterns regex", () => {
    const result = validateRule(sampleRule({ titleStripPatterns: ["valid", "[bad"] }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("title strip pattern");
  });

  it("accepts rule with empty titleStripPatterns", () => {
    const result = validateRule(sampleRule({ titleStripPatterns: [] }));
    expect(result.valid).toBe(true);
  });

  it("rejects missing urlMatchPattern", () => {
    const result = validateRule(sampleRule({ urlMatchPattern: "" }));
    expect(result.valid).toBe(false);
  });

  it("rejects missing dedupeKeyPattern", () => {
    const result = validateRule(sampleRule({ dedupeKeyPattern: "" }));
    expect(result.valid).toBe(false);
  });
});

describe("reconcileBookmarkRule", () => {
  beforeEach(() => {
    mockBookmarks.length = 0;
    nextBookmarkId = 100;
    vi.clearAllMocks();

    // Set up base bookmark tree: root > Other Bookmarks > url-porter folder
    mockBookmarks.push(
      { id: "0", title: "root" },
      { id: "2", parentId: "0", title: "Other Bookmarks" },
      { id: "10", parentId: "2", title: "url-porter" },
    );
  });

  it("creates subfolder and populates bookmarks from history", async () => {
    chrome.history.search.mockResolvedValue([
      { url: "https://acme.example.com/docs/getting-started", title: "Getting Started - Acme Docs", lastVisitTime: 1000 },
      { url: "https://acme.example.com/docs/api-reference", title: "API Reference - Acme Docs", lastVisitTime: 2000 },
    ]);

    await reconcileBookmarkRule(sampleRule());

    // Should have created a subfolder
    const subfolder = mockBookmarks.find((b) => b.title === "acme docs" && b.parentId === "10");
    expect(subfolder).toBeTruthy();

    // Should have created 2 bookmarks inside subfolder
    const children = mockBookmarks.filter((b) => b.parentId === subfolder.id);
    expect(children).toHaveLength(2);

    // Titles should have " - Acme Docs" stripped
    expect(children[0].title).toBe("API Reference");
    expect(children[1].title).toBe("Getting Started");
  });

  it("deduplicates entries keeping latest visitTime", async () => {
    chrome.history.search.mockResolvedValue([
      { url: "https://acme.example.com/docs/intro?v=1", title: "Intro Old - Acme Docs", lastVisitTime: 1000 },
      { url: "https://acme.example.com/docs/intro?v=2", title: "Intro New - Acme Docs", lastVisitTime: 2000 },
    ]);

    await reconcileBookmarkRule(sampleRule());

    const subfolder = mockBookmarks.find((b) => b.title === "acme docs" && b.parentId === "10");
    const children = mockBookmarks.filter((b) => b.parentId === subfolder.id);
    expect(children).toHaveLength(1);
    expect(children[0].title).toBe("Intro New");
  });

  it("skips the url-porter folder when walking bookmarks", async () => {
    // Add a bookmark inside url-porter that matches the rule's pattern
    mockBookmarks.push({
      id: "50",
      parentId: "10",
      title: "acme docs",
    });
    mockBookmarks.push({
      id: "51",
      parentId: "50",
      title: "Should Not Appear - Acme Docs",
      url: "https://acme.example.com/docs/inside-porter",
      dateAdded: 3000,
    });

    chrome.history.search.mockResolvedValue([]);

    await reconcileBookmarkRule(sampleRule());

    // The bookmark inside url-porter should not have been picked up
    // No subfolder should be created since there are 0 results
    const subfolder = mockBookmarks.find((b) => b.title === "acme docs" && b.parentId === "10" && b.id !== "50");
    expect(subfolder).toBeUndefined();
  });

  it("picks up matching bookmarks outside url-porter folder", async () => {
    // Add a matching bookmark outside url-porter
    mockBookmarks.push({
      id: "60",
      parentId: "2",
      title: "Globex Tutorial - Acme Docs",
      url: "https://acme.example.com/docs/globex-tutorial",
      dateAdded: 5000,
    });

    chrome.history.search.mockResolvedValue([]);

    await reconcileBookmarkRule(sampleRule());

    const subfolder = mockBookmarks.find((b) => b.title === "acme docs" && b.parentId === "10" && !b.url);
    expect(subfolder).toBeTruthy();

    const children = mockBookmarks.filter((b) => b.parentId === subfolder.id);
    expect(children).toHaveLength(1);
    expect(children[0].title).toBe("Globex Tutorial");
  });

  it("deletes old subfolder before recreating", async () => {
    // Pre-existing subfolder with old bookmark
    mockBookmarks.push(
      { id: "70", parentId: "10", title: "acme docs" },
      { id: "71", parentId: "70", title: "Old Entry", url: "https://acme.example.com/docs/old" },
    );

    chrome.history.search.mockResolvedValue([
      { url: "https://acme.example.com/docs/new-entry", title: "New Entry - Acme Docs", lastVisitTime: 1000 },
    ]);

    await reconcileBookmarkRule(sampleRule());

    // Old subfolder should be gone
    expect(mockBookmarks.find((b) => b.id === "70")).toBeUndefined();
    expect(mockBookmarks.find((b) => b.id === "71")).toBeUndefined();

    // New subfolder should exist
    const subfolder = mockBookmarks.find((b) => b.title === "acme docs" && b.parentId === "10");
    expect(subfolder).toBeTruthy();
    const children = mockBookmarks.filter((b) => b.parentId === subfolder.id);
    expect(children).toHaveLength(1);
    expect(children[0].title).toBe("New Entry");
  });

  it("sorts by visitTime descending by default", async () => {
    chrome.history.search.mockResolvedValue([
      { url: "https://acme.example.com/docs/first", title: "First - Acme Docs", lastVisitTime: 1000 },
      { url: "https://acme.example.com/docs/second", title: "Second - Acme Docs", lastVisitTime: 3000 },
      { url: "https://acme.example.com/docs/third", title: "Third - Acme Docs", lastVisitTime: 2000 },
    ]);

    await reconcileBookmarkRule(sampleRule({ sortField: "visitTime", sortDirection: "desc" }));

    const subfolder = mockBookmarks.find((b) => b.title === "acme docs" && b.parentId === "10");
    const children = mockBookmarks.filter((b) => b.parentId === subfolder.id);
    expect(children.map((c) => c.title)).toEqual(["Second", "Third", "First"]);
  });

  it("sorts by title ascending", async () => {
    chrome.history.search.mockResolvedValue([
      { url: "https://acme.example.com/docs/zebra", title: "Zebra - Acme Docs", lastVisitTime: 1000 },
      { url: "https://acme.example.com/docs/alpha", title: "Alpha - Acme Docs", lastVisitTime: 2000 },
      { url: "https://acme.example.com/docs/middle", title: "Middle - Acme Docs", lastVisitTime: 3000 },
    ]);

    await reconcileBookmarkRule(sampleRule({ sortField: "title", sortDirection: "asc" }));

    const subfolder = mockBookmarks.find((b) => b.title === "acme docs" && b.parentId === "10");
    const children = mockBookmarks.filter((b) => b.parentId === subfolder.id);
    expect(children.map((c) => c.title)).toEqual(["Alpha", "Middle", "Zebra"]);
  });

  it("skips invalid rule gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await reconcileBookmarkRule(sampleRule({ urlMatchPattern: "[invalid" }));

    // Should not throw, should log a warning
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("does nothing when url-porter folder is missing", async () => {
    mockBookmarks.length = 0;
    mockBookmarks.push({ id: "0", title: "root" }, { id: "2", parentId: "0", title: "Other Bookmarks" });

    chrome.history.search.mockResolvedValue([
      { url: "https://acme.example.com/docs/test", title: "Test - Acme Docs", lastVisitTime: 1000 },
    ]);

    await reconcileBookmarkRule(sampleRule());

    // No subfolder should be created
    expect(mockBookmarks.find((b) => b.title === "acme docs")).toBeUndefined();
  });
});

describe("reconcileAllBookmarkRules", () => {
  beforeEach(() => {
    mockBookmarks.length = 0;
    nextBookmarkId = 100;
    vi.clearAllMocks();

    mockBookmarks.push(
      { id: "0", title: "root" },
      { id: "2", parentId: "0", title: "Other Bookmarks" },
      { id: "10", parentId: "2", title: "url-porter" },
    );
  });

  it("skips disabled rules", async () => {
    storageData.bookmarkRules = [sampleRule({ enabled: false })];

    chrome.history.search.mockResolvedValue([
      { url: "https://acme.example.com/docs/test", title: "Test - Acme Docs", lastVisitTime: 1000 },
    ]);

    await reconcileAllBookmarkRules();

    // No subfolder should be created
    expect(mockBookmarks.find((b) => b.title === "acme docs")).toBeUndefined();
  });

  it("reconciles enabled rules", async () => {
    storageData.bookmarkRules = [sampleRule({ enabled: true })];

    chrome.history.search.mockResolvedValue([
      { url: "https://acme.example.com/docs/test", title: "Test - Acme Docs", lastVisitTime: 1000 },
    ]);

    await reconcileAllBookmarkRules();

    const subfolder = mockBookmarks.find((b) => b.title === "acme docs" && b.parentId === "10");
    expect(subfolder).toBeTruthy();
  });

  it("does nothing when no rules exist", async () => {
    storageData.bookmarkRules = [];
    await reconcileAllBookmarkRules();

    // Only the base bookmarks should exist
    expect(mockBookmarks).toHaveLength(3);
  });
});
