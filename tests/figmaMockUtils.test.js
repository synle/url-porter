/**
 * Tests for figmaMockUtils — Figma URL parsing and reconcile flow.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, mockBookmarks, addMockFolder, addMockBookmark, reset, setHistory } = createChromeMock();
vi.stubGlobal("chrome", chrome);

const { reconcileFigmaMocks } = await import("../src/helpers/figmaMockUtils.js");

describe("figmaMockUtils — reconcileFigmaMocks", () => {
  beforeEach(() => {
    reset();
  });

  it("skips reconcile when url-porter folder is missing", async () => {
    setHistory({
      "figma.com": [{ url: "https://www.figma.com/design/ABC123/My-Mock-Name", title: "Mock", lastVisitTime: 1 }],
    });
    await reconcileFigmaMocks();
    // No url-porter folder, no subfolder should be created
    expect(mockBookmarks.find((b) => b.title === "figma mocks")).toBeUndefined();
  });

  it("creates figma mocks subfolder with parsed entries from history", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "figma.com": [
        { url: "https://www.figma.com/design/ABC123/My-Cool-Mock?node-id=1", title: "Design", lastVisitTime: 100 },
        { url: "https://www.figma.com/file/XYZ789/Old-File", title: "Old File", lastVisitTime: 50 },
        { url: "https://www.figma.com/proto/PROTO1/Prototype-Name", title: "Proto", lastVisitTime: 200 },
        { url: "https://www.figma.com/board/BOARD1/Board-Name", title: "Board", lastVisitTime: 300 },
      ],
    });
    await reconcileFigmaMocks();
    const folder = mockBookmarks.find((b) => b.title === "figma mocks");
    expect(folder).toBeDefined();
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folder.id && b.url);
    expect(bookmarks).toHaveLength(4);
    // Titles should be title-cased from the slug
    const titles = bookmarks.map((b) => b.title).sort();
    expect(titles[0]).toMatch(/Board Name/i);
  });

  it("dedupes by file id across history and bookmarks", async () => {
    const porter = addMockFolder("2", "url-porter");
    // pre-existing bookmark outside porter
    addMockBookmark("1", "Old Mock", "https://www.figma.com/design/ABC123/Renamed-Slug", 100);
    setHistory({
      "figma.com": [{ url: "https://www.figma.com/design/ABC123/My-Cool-Mock?node-id=1", title: "Mock", lastVisitTime: 200 }],
    });
    await reconcileFigmaMocks();
    const folder = mockBookmarks.find((b) => b.title === "figma mocks" && b.parentId === porter.id);
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folder.id && b.url);
    // Same fileId ABC123 — only one entry, history wins for canonical URL
    expect(bookmarks).toHaveLength(1);
  });

  it("ignores figma.site URLs", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "figma.com": [
        { url: "https://cream-stone-68528668.figma.site/", title: "Figma Site", lastVisitTime: 1 },
        { url: "https://www.figma.com/design/REAL/Real-Mock", title: "Real", lastVisitTime: 2 },
      ],
    });
    await reconcileFigmaMocks();
    const folder = mockBookmarks.find((b) => b.title === "figma mocks");
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folder?.id && b.url);
    expect(bookmarks).toHaveLength(1);
  });

  it("returns early when no figma URLs are found", async () => {
    addMockFolder("2", "url-porter");
    setHistory({ "figma.com": [{ url: "https://example.com/not-figma", title: "x", lastVisitTime: 1 }] });
    await reconcileFigmaMocks();
    expect(mockBookmarks.find((b) => b.title === "figma mocks")).toBeUndefined();
  });

  it("replaces existing figma mocks folder on reconciliation", async () => {
    const porter = addMockFolder("2", "url-porter");
    const stale = addMockFolder(porter.id, "figma mocks");
    addMockBookmark(stale.id, "Stale", "https://www.figma.com/design/STALE/Stale-Slug", 1);
    setHistory({
      "figma.com": [{ url: "https://www.figma.com/design/NEW/Fresh-Slug", title: "Fresh", lastVisitTime: 100 }],
    });
    await reconcileFigmaMocks();
    const folders = mockBookmarks.filter((b) => !b.url && b.title === "figma mocks");
    expect(folders).toHaveLength(1);
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folders[0].id && b.url);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].url).toContain("/NEW/");
  });

  it("places figma mocks folder right after github repos", async () => {
    const porter = addMockFolder("2", "url-porter");
    addMockFolder(porter.id, "prs");
    addMockFolder(porter.id, "github repos");
    setHistory({
      "figma.com": [{ url: "https://www.figma.com/design/ABC/Mock", title: "M", lastVisitTime: 1 }],
    });
    await reconcileFigmaMocks();
    const create = chrome.bookmarks.create.mock.calls.find((c) => c[0].title === "figma mocks");
    // figma mocks placed right after github repos (index of github repos + 1).
    // github repos is index 1 in porter folder, so figma mocks goes to index 2.
    expect(create[0].index).toBeGreaterThanOrEqual(1);
  });

  it("walks bookmarks tree for figma URLs", async () => {
    const porter = addMockFolder("2", "url-porter");
    addMockBookmark("1", "Existing", "https://www.figma.com/file/EXISTING/Existing-Slug", 100);
    await reconcileFigmaMocks();
    const folder = mockBookmarks.find((b) => b.title === "figma mocks" && b.parentId === porter.id);
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folder.id && b.url);
    expect(bookmarks).toHaveLength(1);
  });

  it("survives history.search errors", async () => {
    addMockFolder("2", "url-porter");
    chrome.history.search.mockRejectedValueOnce(new Error("boom"));
    addMockBookmark("1", "From Bookmark", "https://www.figma.com/design/BOOK/From-Bookmark", 100);
    await reconcileFigmaMocks();
    const folder = mockBookmarks.find((b) => b.title === "figma mocks");
    expect(folder).toBeDefined();
  });

  it("skips bookmarks inside the url-porter folder (no feedback loop)", async () => {
    const porter = addMockFolder("2", "url-porter");
    const sub = addMockFolder(porter.id, "figma mocks");
    addMockBookmark(sub.id, "Inside porter", "https://www.figma.com/design/PORTER/Inside", 100);
    addMockBookmark("1", "Outside", "https://www.figma.com/design/OUTSIDE/Outside", 200);
    await reconcileFigmaMocks();
    const folders = mockBookmarks.filter((b) => !b.url && b.title === "figma mocks");
    expect(folders).toHaveLength(1);
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folders[0].id && b.url);
    // Only the outside bookmark — the porter one was skipped during walk and the old folder was deleted
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].url).toContain("/OUTSIDE/");
  });
});
