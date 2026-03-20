/**
 * Tests for prUtils — PR status icon prefixes on bookmark titles.
 *
 * Covers three key scenarios:
 * 1. Brand new PR (never visited) — no status prefix
 * 2. Visited PR — content script status overrides old bookmark status
 * 3. Existing PR not re-visited — old bookmark status is preserved
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBookmarks = [];
let nextBookmarkId = 100;

const storageData = {
  bookmarkFolderName: "url-porter",
  prStatuses: {},
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
    remove: vi.fn(),
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
    },
  },
  runtime: {
    lastError: null,
  },
};

vi.stubGlobal("chrome", chrome);

/** Build a bookmark tree from the flat mockBookmarks array. */
function buildTree() {
  function childrenOf(parentId) {
    return mockBookmarks.filter((b) => b.parentId === parentId).map((b) => ({ ...b, children: b.url ? undefined : childrenOf(b.id) }));
  }
  return {
    id: "0",
    children: [
      { id: "1", title: "Bookmarks Bar", children: childrenOf("1") },
      { id: "2", title: "Other Bookmarks", children: childrenOf("2") },
    ],
  };
}

const { reconcilePrs } = await import("../src/helpers/prUtils.js");

/**
 * Add a mock bookmark node.
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
 * Add a mock folder node.
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
 * Find the PR bookmark created during reconciliation for a given URL.
 * @param {string} url
 * @returns {object | undefined}
 */
function findCreatedPrBookmark(url) {
  // Find bookmarks matching the URL that are inside a "prs" subfolder (not the original source bookmark)
  const prsFolder = mockBookmarks.find((b) => !b.url && b.title === "prs");
  if (!prsFolder) return undefined;
  return mockBookmarks.filter((b) => b.url === url && b.parentId === prsFolder.id).pop();
}

describe("prUtils — PR status icons", () => {
  beforeEach(() => {
    mockBookmarks.length = 0;
    nextBookmarkId = 100;
    storageData.prStatuses = {};
    vi.clearAllMocks();
    chrome.bookmarks.getTree.mockImplementation(async () => [buildTree()]);
  });

  it("should have no status prefix for a brand new PR (never visited)", async () => {
    addMockFolder("2", "url-porter");

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "github.com/pull") {
        return [
          {
            url: "https://github.com/acme/widget/pull/42",
            title: "Fix rendering bug by user123 · Pull Request #42 · acme/widget",
            lastVisitTime: new Date("2026-03-15").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcilePrs();

    const bm = findCreatedPrBookmark("https://github.com/acme/widget/pull/42");
    expect(bm).toBeDefined();
    // No status prefix — title should start with the PR number
    expect(bm.title).toMatch(/^42 /);
    expect(bm.title).not.toMatch(/^\[/);
  });

  it("should use stored status from content script when available", async () => {
    addMockFolder("2", "url-porter");

    // Simulate content script having reported "merged" status
    storageData.prStatuses = {
      "https://github.com/acme/widget/pull/42": "merged",
    };

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "github.com/pull") {
        return [
          {
            url: "https://github.com/acme/widget/pull/42",
            title: "Fix rendering bug by user123 · Pull Request #42 · acme/widget",
            lastVisitTime: new Date("2026-03-15").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcilePrs();

    const bm = findCreatedPrBookmark("https://github.com/acme/widget/pull/42");
    expect(bm).toBeDefined();
    expect(bm.title).toMatch(/^\u2705 42 /);
  });

  it("should show \u274C prefix for closed/abandoned PRs", async () => {
    addMockFolder("2", "url-porter");

    storageData.prStatuses = {
      "https://github.com/acme/widget/pull/99": "closed",
    };

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "github.com/pull") {
        return [
          {
            url: "https://github.com/acme/widget/pull/99",
            title: "Abandoned feature by user456 · Pull Request #99 · acme/widget",
            lastVisitTime: new Date("2026-01-10").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcilePrs();

    const bm = findCreatedPrBookmark("https://github.com/acme/widget/pull/99");
    expect(bm).toBeDefined();
    expect(bm.title).toMatch(/^\u274C 99 /);
  });

  it("should show \uD83D\uDD35 prefix for open/in-progress PRs", async () => {
    addMockFolder("2", "url-porter");

    storageData.prStatuses = {
      "https://github.com/acme/widget/pull/77": "open",
    };

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "github.com/pull") {
        return [
          {
            url: "https://github.com/acme/widget/pull/77",
            title: "WIP: new feature by dev · Pull Request #77 · acme/widget",
            lastVisitTime: new Date("2026-03-18").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcilePrs();

    const bm = findCreatedPrBookmark("https://github.com/acme/widget/pull/77");
    expect(bm).toBeDefined();
    expect(bm.title).toMatch(/^\uD83D\uDD35 77 /);
  });

  it("should preserve old bookmark status when PR is not re-visited (no stored status)", async () => {
    const porterFolder = addMockFolder("2", "url-porter");
    const prsFolder = addMockFolder(porterFolder.id, "prs");

    // Old bookmark already had \u2705 prefix from a previous reconciliation
    addMockBookmark(
      prsFolder.id,
      "\u2705 42 Fix rendering bug Widget/Acme",
      "https://github.com/acme/widget/pull/42",
      new Date("2026-03-15").getTime(),
    );

    // No stored status (user hasn't visited since last reconcile)
    storageData.prStatuses = {};

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "github.com/pull") {
        return [
          {
            url: "https://github.com/acme/widget/pull/42",
            title: "Fix rendering bug by user123 · Pull Request #42 · acme/widget",
            lastVisitTime: new Date("2026-03-15").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcilePrs();

    const bm = findCreatedPrBookmark("https://github.com/acme/widget/pull/42");
    expect(bm).toBeDefined();
    // Should preserve the \u2705 prefix from the old bookmark
    expect(bm.title).toMatch(/^\u2705 42 /);
  });

  it("should let stored status override old bookmark status", async () => {
    const porterFolder = addMockFolder("2", "url-porter");
    const prsFolder = addMockFolder(porterFolder.id, "prs");

    // Old bookmark had \uD83D\uDD35 (open) prefix
    addMockBookmark(
      prsFolder.id,
      "\uD83D\uDD35 42 Fix rendering bug Widget/Acme",
      "https://github.com/acme/widget/pull/42",
      new Date("2026-03-15").getTime(),
    );

    // User visited the PR and it's now merged — stored status takes priority
    storageData.prStatuses = {
      "https://github.com/acme/widget/pull/42": "merged",
    };

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "github.com/pull") {
        return [
          {
            url: "https://github.com/acme/widget/pull/42",
            title: "Fix rendering bug by user123 · Pull Request #42 · acme/widget",
            lastVisitTime: new Date("2026-03-15").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcilePrs();

    const bm = findCreatedPrBookmark("https://github.com/acme/widget/pull/42");
    expect(bm).toBeDefined();
    // Stored "merged" should override old bookmark's "open"
    expect(bm.title).toMatch(/^\u2705 42 /);
    expect(bm.title).not.toMatch(/^\uD83D\uDD35/);
  });

  it("should handle Azure DevOps PRs with status", async () => {
    addMockFolder("2", "url-porter");

    storageData.prStatuses = {
      "https://globex.visualstudio.com/phoenix/_git/api-server/pullrequest/1234": "closed",
    };

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "pullrequest") {
        return [
          {
            url: "https://globex.visualstudio.com/phoenix/_git/api-server/pullrequest/1234",
            title: "Refactor auth module",
            lastVisitTime: new Date("2026-02-20").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcilePrs();

    const bm = findCreatedPrBookmark("https://globex.visualstudio.com/phoenix/_git/api-server/pullrequest/1234");
    expect(bm).toBeDefined();
    expect(bm.title).toMatch(/^\u274C 1234 /);
  });

  it("should handle *.githubprivate.com PR URLs with status", async () => {
    addMockFolder("2", "url-porter");

    storageData.prStatuses = {
      "https://acme.githubprivate.com/teamx/service-api/pull/200": "open",
    };

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "githubprivate.com/pull") {
        return [
          {
            url: "https://acme.githubprivate.com/teamx/service-api/pull/200/files",
            title: "Update config parser by dev1 · Pull Request #200 · teamx/service-api",
            lastVisitTime: new Date("2026-03-12").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcilePrs();

    const bm = findCreatedPrBookmark("https://acme.githubprivate.com/teamx/service-api/pull/200");
    expect(bm).toBeDefined();
    expect(bm.title).toMatch(/^\uD83D\uDD35 200 /);
    expect(bm.title).toContain("ServiceApi/Teamx");
  });

  it("should handle *.ghe.com PR URLs with status", async () => {
    addMockFolder("2", "url-porter");

    storageData.prStatuses = {
      "https://globex.ghe.com/multiproduct/tde-tool-backend/pull/306": "merged",
    };

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "ghe.com/pull") {
        return [
          {
            url: "https://globex.ghe.com/multiproduct/tde-tool-backend/pull/306",
            title: "Fix build pipeline by dev2 · Pull Request #306 · multiproduct/tde-tool-backend",
            lastVisitTime: new Date("2026-03-18").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcilePrs();

    const bm = findCreatedPrBookmark("https://globex.ghe.com/multiproduct/tde-tool-backend/pull/306");
    expect(bm).toBeDefined();
    expect(bm.title).toMatch(/^\u2705 306 /);
    expect(bm.title).toContain("TdeToolBackend/Multiproduct");
  });

  it("should handle dev.azure.com PR URLs with status", async () => {
    addMockFolder("2", "url-porter");

    storageData.prStatuses = {
      "https://dev.azure.com/initech/alpha/_git/backend/pullrequest/567": "merged",
    };

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "pullrequest") {
        return [
          {
            url: "https://dev.azure.com/initech/alpha/_git/backend/pullrequest/567",
            title: "Add caching layer",
            lastVisitTime: new Date("2026-03-01").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcilePrs();

    const bm = findCreatedPrBookmark("https://dev.azure.com/initech/alpha/_git/backend/pullrequest/567");
    expect(bm).toBeDefined();
    expect(bm.title).toMatch(/^\u2705 567 /);
    expect(bm.title).toContain("Backend/InitechAlpha");
  });

  it("should dedupe dev.azure.com and visualstudio.com PRs from same org/project/repo", async () => {
    addMockFolder("2", "url-porter");

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "pullrequest") {
        return [
          {
            url: "https://dev.azure.com/globex/phoenix/_git/api-server/pullrequest/100",
            title: "Dev azure format",
            lastVisitTime: new Date("2026-03-10").getTime(),
          },
          {
            url: "https://globex.visualstudio.com/phoenix/_git/api-server/pullrequest/100",
            title: "VS format",
            lastVisitTime: new Date("2026-03-05").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcilePrs();

    // Both URLs share the same dedupeKey, so only one bookmark should be created
    const prsFolder = mockBookmarks.find((b) => !b.url && b.title === "prs");
    const prBookmarks = mockBookmarks.filter((b) => b.parentId === prsFolder.id && b.url);
    expect(prBookmarks.length).toBe(1);
    expect(prBookmarks[0].title).toContain("100");
  });

  it("should not accumulate status prefixes when reconciled multiple times", async () => {
    addMockFolder("2", "url-porter");

    storageData.prStatuses = {
      "https://github.com/acme/widget/pull/42": "merged",
    };

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "github.com/pull") {
        return [
          {
            url: "https://github.com/acme/widget/pull/42",
            title: "Fix rendering bug by user123 · Pull Request #42 · acme/widget",
            lastVisitTime: new Date("2026-03-15").getTime(),
          },
        ];
      }
      return [];
    });

    // Reconcile twice
    await reconcilePrs();
    await reconcilePrs();

    const bm = findCreatedPrBookmark("https://github.com/acme/widget/pull/42");
    expect(bm).toBeDefined();
    // Should have exactly one \u2705 prefix, not \u2705 \u2705
    expect(bm.title).toMatch(/^\u2705 42 /);
    expect(bm.title).not.toMatch(/^\u2705 \u2705/);
  });

  it("should handle mixed PRs with different statuses", async () => {
    addMockFolder("2", "url-porter");

    storageData.prStatuses = {
      "https://github.com/acme/widget/pull/10": "merged",
      "https://github.com/acme/widget/pull/20": "closed",
      "https://github.com/acme/widget/pull/30": "open",
    };

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "github.com/pull") {
        return [
          { url: "https://github.com/acme/widget/pull/10", title: "PR 10", lastVisitTime: new Date("2026-03-10").getTime() },
          { url: "https://github.com/acme/widget/pull/20", title: "PR 20", lastVisitTime: new Date("2026-03-12").getTime() },
          { url: "https://github.com/acme/widget/pull/30", title: "PR 30", lastVisitTime: new Date("2026-03-14").getTime() },
          { url: "https://github.com/acme/widget/pull/40", title: "PR 40", lastVisitTime: new Date("2026-03-16").getTime() },
        ];
      }
      return [];
    });

    await reconcilePrs();

    const bm10 = findCreatedPrBookmark("https://github.com/acme/widget/pull/10");
    const bm20 = findCreatedPrBookmark("https://github.com/acme/widget/pull/20");
    const bm30 = findCreatedPrBookmark("https://github.com/acme/widget/pull/30");
    const bm40 = findCreatedPrBookmark("https://github.com/acme/widget/pull/40");

    expect(bm10.title).toMatch(/^\u2705/);
    expect(bm20.title).toMatch(/^\u274C/);
    expect(bm30.title).toMatch(/^\uD83D\uDD35/);
    // PR 40 has no status — no prefix
    expect(bm40.title).toMatch(/^40 /);
  });
});
