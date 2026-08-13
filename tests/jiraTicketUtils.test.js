/**
 * Tests for jiraTicketUtils — specifically the feedback loop bug where
 * bookmark titles accumulated dates on each reconciliation cycle because
 * the bookmark walker re-read its own previously-built titles.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock chrome APIs before importing the module
const mockBookmarks = [];
let nextBookmarkId = 100;

// storage.js uses callback-style chrome.storage.local.get(key, callback)
const storageData = {
  bookmarkFolderName: "url-porter",
  githubOrgThreshold: 3,
  jiraStatuses: {},
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

const { reconcileJiraTickets } = await import("../src/helpers/jiraTicketUtils.js");

/**
 * Add a mock bookmark node.
 * @param {string} parentId - Parent folder ID.
 * @param {string} title - Bookmark title.
 * @param {string} url - Bookmark URL.
 * @param {number} [dateAdded] - Timestamp when added.
 * @returns {object} The created mock bookmark node.
 */
function addMockBookmark(parentId, title, url, dateAdded) {
  const id = String(nextBookmarkId++);
  const node = { id, parentId, title, url, dateAdded: dateAdded || Date.now() };
  mockBookmarks.push(node);
  return node;
}

/**
 * Add a mock folder node.
 * @param {string} parentId - Parent folder ID.
 * @param {string} title - Folder title.
 * @returns {object} The created mock folder node.
 */
function addMockFolder(parentId, title) {
  const id = String(nextBookmarkId++);
  const node = { id, parentId, title };
  mockBookmarks.push(node);
  return node;
}

describe("jiraTicketUtils — feedback loop prevention", () => {
  beforeEach(() => {
    mockBookmarks.length = 0;
    nextBookmarkId = 100;
    vi.clearAllMocks();
    chrome.bookmarks.getTree.mockImplementation(async () => [buildTree()]);
  });

  it("should not accumulate dates when reconciled multiple times", async () => {
    addMockFolder("2", "url-porter");

    addMockBookmark(
      "1",
      "[FALCON-8817] Widget rendering timeout on dashboard - Acme JIRA",
      "https://jira.acme-corp.example.com:8443/browse/FALCON-8817",
      new Date("2024-06-10").getTime(),
    );

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "jira") {
        return [
          {
            url: "https://jira.acme-corp.example.com:8443/browse/FALCON-8817",
            title: "[FALCON-8817] Widget rendering timeout on dashboard - Acme JIRA",
            lastVisitTime: new Date("2026-02-05").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcileJiraTickets();
    const firstCreated = mockBookmarks.filter(
      (b) => b.url?.includes("FALCON-8817") && b.parentId !== "1",
    );
    expect(firstCreated.length).toBeGreaterThan(0);
    const firstTitle = firstCreated[firstCreated.length - 1].title;

    await reconcileJiraTickets();
    const secondCreated = mockBookmarks.filter(
      (b) => b.url?.includes("FALCON-8817") && b.parentId !== "1",
    );
    const secondTitle = secondCreated[secondCreated.length - 1].title;

    expect(secondTitle).toBe(firstTitle);

    // No date should appear in the title
    const dateMatches = secondTitle.match(/\d{4}-\d{2}/g);
    expect(dateMatches).toBeNull();
  });

  it("should strip vendor JIRA suffix from page titles", async () => {
    addMockFolder("2", "url-porter");

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "jira") {
        return [
          {
            url: "https://jira.globex.example.com:8443/browse/PLUTO-4401",
            title: "[PLUTO-4401] API rate limiter not respecting burst config - Globex JIRA",
            lastVisitTime: new Date("2025-11-22").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcileJiraTickets();

    const created = mockBookmarks.filter(
      (b) => b.url?.includes("PLUTO-4401") && b.parentId !== "1",
    );
    expect(created.length).toBeGreaterThan(0);
    const title = created[created.length - 1].title;

    expect(title).not.toMatch(/JIRA/i);
    expect(title).not.toMatch(/Globex/i);
    expect(title).toContain("API rate limiter not respecting burst config");
    expect(title).toMatch(/^PLUTO-4401 - API rate limiter not respecting burst config$/);
  });

  it("should not pick up bookmarks from inside the url-porter folder", async () => {
    const porterFolder = addMockFolder("2", "url-porter");
    const jiraSubfolder = addMockFolder(porterFolder.id, "jira tickets");
    const projectFolder = addMockFolder(jiraSubfolder.id, "ORBIT");
    addMockBookmark(
      projectFolder.id,
      "ORBIT-592 - Deploy pipeline stuck on canary stage",
      "https://jira.initech.example.com/browse/ORBIT-592",
      new Date("2025-09-14").getTime(),
    );

    chrome.history.search.mockImplementation(async () => []);

    const bookmarksBefore = mockBookmarks.filter((b) => b.url?.includes("ORBIT-592")).length;

    await reconcileJiraTickets();

    const bookmarksAfter = mockBookmarks.filter((b) => b.url?.includes("ORBIT-592")).length;
    expect(bookmarksAfter).toBe(bookmarksBefore);
  });

  it("should prefix bookmark titles with status icons from stored statuses", async () => {
    addMockFolder("2", "url-porter");

    storageData.jiraStatuses = {
      "https://jira.acme-corp.example.com:8443/browse/FALCON-1001": "in_progress",
      "https://jira.acme-corp.example.com:8443/browse/FALCON-1002": "closed",
      "https://jira.acme-corp.example.com:8443/browse/FALCON-1003": "not_started",
      "https://jira.acme-corp.example.com:8443/browse/FALCON-1004": "blocked",
    };

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "jira") {
        return [
          {
            url: "https://jira.acme-corp.example.com:8443/browse/FALCON-1001",
            title: "In progress ticket",
            lastVisitTime: Date.now(),
          },
          {
            url: "https://jira.acme-corp.example.com:8443/browse/FALCON-1002",
            title: "Done ticket",
            lastVisitTime: Date.now(),
          },
          {
            url: "https://jira.acme-corp.example.com:8443/browse/FALCON-1003",
            title: "Todo ticket",
            lastVisitTime: Date.now(),
          },
          {
            url: "https://jira.acme-corp.example.com:8443/browse/FALCON-1004",
            title: "Blocked ticket",
            lastVisitTime: Date.now(),
          },
        ];
      }
      return [];
    });

    await reconcileJiraTickets();

    const created = mockBookmarks.filter(
      (b) => b.url?.includes("FALCON-100") && b.parentId !== "1",
    );
    const titles = Object.fromEntries(created.map((b) => [b.url.match(/FALCON-\d+/)[0], b.title]));

    expect(titles["FALCON-1001"]).toMatch(/^\uD83D\uDD35 /); // 🔵 in_progress
    expect(titles["FALCON-1002"]).toMatch(/^\u2705 /); // ✅ closed
    expect(titles["FALCON-1003"]).toMatch(/^\u26AA /); // ⚪ not_started
    expect(titles["FALCON-1004"]).toMatch(/^\u274C /); // ❌ blocked
  });

  it("should preserve status icons from old bookmarks when no stored status exists", async () => {
    const porterFolder = addMockFolder("2", "url-porter");
    const jiraSubfolder = addMockFolder(porterFolder.id, "jira tickets");
    const projectFolder = addMockFolder(jiraSubfolder.id, "FALCON");
    addMockBookmark(
      projectFolder.id,
      "\u2705 FALCON-2001 - Previously closed ticket",
      "https://jira.acme-corp.example.com:8443/browse/FALCON-2001",
      new Date("2025-09-14").getTime(),
    );

    storageData.jiraStatuses = {};

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "jira") {
        return [
          {
            url: "https://jira.acme-corp.example.com:8443/browse/FALCON-2001",
            title: "Previously closed ticket",
            lastVisitTime: new Date("2025-09-14").getTime(),
          },
        ];
      }
      return [];
    });

    await reconcileJiraTickets();

    const created = mockBookmarks.filter(
      (b) =>
        b.url?.includes("FALCON-2001") && b.parentId !== "1" && b.parentId !== projectFolder.id,
    );
    expect(created.length).toBeGreaterThan(0);
    expect(created[created.length - 1].title).toMatch(/^\u2705 /); // ✅ preserved from old bookmark
  });

  it("should not add status prefix when no status is known", async () => {
    addMockFolder("2", "url-porter");
    storageData.jiraStatuses = {};

    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "jira") {
        return [
          {
            url: "https://jira.acme-corp.example.com:8443/browse/FALCON-3001",
            title: "No status ticket",
            lastVisitTime: Date.now(),
          },
        ];
      }
      return [];
    });

    await reconcileJiraTickets();

    const created = mockBookmarks.filter(
      (b) => b.url?.includes("FALCON-3001") && b.parentId !== "1",
    );
    expect(created.length).toBeGreaterThan(0);
    const title = created[created.length - 1].title;
    expect(title).toMatch(/^FALCON-3001/); // no emoji prefix
  });

  it("sorts misc tickets numerically, not lexicographically", async () => {
    addMockFolder("2", "url-porter");
    storageData.jiraStatuses = {};
    // Two tickets is below the default threshold of 3, so they land in "misc".
    const base = "https://jira.acme-corp.example.com:8443/browse/";
    chrome.history.search.mockImplementation(async ({ text }) => {
      if (text === "jira") {
        return [
          { url: `${base}ORBIT-9`, title: "[ORBIT-9] Older", lastVisitTime: 1 },
          { url: `${base}ORBIT-10`, title: "[ORBIT-10] Newer", lastVisitTime: 2 },
        ];
      }
      return [];
    });

    await reconcileJiraTickets();

    const miscFolder = mockBookmarks.find((b) => !b.url && b.title === "misc");
    expect(miscFolder).toBeDefined();
    const order = mockBookmarks
      .filter((b) => b.parentId === miscFolder.id && b.url)
      .map((b) => b.url.split("/browse/")[1]);
    // Newest first. localeCompare put "ORBIT-9" ahead of "ORBIT-10".
    expect(order).toEqual(["ORBIT-10", "ORBIT-9"]);
  });
});
