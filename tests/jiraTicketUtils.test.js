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

const { reconcileJiraTickets } = await import("../src/helpers/jiraTicketUtils.js");

function addMockBookmark(parentId, title, url, dateAdded) {
  const id = String(nextBookmarkId++);
  const node = { id, parentId, title, url, dateAdded: dateAdded || Date.now() };
  mockBookmarks.push(node);
  return node;
}

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
    const firstCreated = mockBookmarks.filter((b) => b.url?.includes("FALCON-8817") && b.parentId !== "1");
    expect(firstCreated.length).toBeGreaterThan(0);
    const firstTitle = firstCreated[firstCreated.length - 1].title;

    await reconcileJiraTickets();
    const secondCreated = mockBookmarks.filter((b) => b.url?.includes("FALCON-8817") && b.parentId !== "1");
    const secondTitle = secondCreated[secondCreated.length - 1].title;

    expect(secondTitle).toBe(firstTitle);

    const dateMatches = secondTitle.match(/\d{4}-\d{2}/g);
    expect(dateMatches?.length).toBe(1);
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

    const created = mockBookmarks.filter((b) => b.url?.includes("PLUTO-4401") && b.parentId !== "1");
    expect(created.length).toBeGreaterThan(0);
    const title = created[created.length - 1].title;

    expect(title).not.toMatch(/JIRA/i);
    expect(title).not.toMatch(/Globex/i);
    expect(title).toContain("API rate limiter not respecting burst config");
    expect(title).toMatch(/^PLUTO-4401 - \d{4}-\d{2} - API rate limiter not respecting burst config$/);
  });

  it("should not pick up bookmarks from inside the url-porter folder", async () => {
    const porterFolder = addMockFolder("2", "url-porter");
    const jiraSubfolder = addMockFolder(porterFolder.id, "jira tickets");
    const projectFolder = addMockFolder(jiraSubfolder.id, "ORBIT");
    addMockBookmark(
      projectFolder.id,
      "ORBIT-592 - 2025-09 - Deploy pipeline stuck on canary stage",
      "https://jira.initech.example.com/browse/ORBIT-592",
      new Date("2025-09-14").getTime(),
    );

    chrome.history.search.mockImplementation(async () => []);

    const bookmarksBefore = mockBookmarks.filter((b) => b.url?.includes("ORBIT-592")).length;

    await reconcileJiraTickets();

    const bookmarksAfter = mockBookmarks.filter((b) => b.url?.includes("ORBIT-592")).length;
    expect(bookmarksAfter).toBe(bookmarksBefore);
  });
});
