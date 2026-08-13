/**
 * Tests for googleDriveUtils — parsing Google Drive / Docs URLs and reconcile flow.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, mockBookmarks, addMockFolder, addMockBookmark, reset, setHistory } =
  createChromeMock();
vi.stubGlobal("chrome", chrome);

const { reconcileGoogleDrive } = await import("../src/helpers/googleDriveUtils.js");

/**
 * Titles of the porter folder's subfolders, in their final on-disk order.
 * @param {string} porterId - The url-porter folder ID.
 * @returns {string[]} Subfolder titles in order.
 */
function subfolderOrder(porterId) {
  return mockBookmarks.filter((b) => b.parentId === porterId && !b.url).map((b) => b.title);
}

describe("googleDriveUtils — reconcileGoogleDrive", () => {
  beforeEach(() => {
    reset();
  });

  it("skips reconcile when url-porter folder is missing", async () => {
    setHistory({
      "docs.google.com": [
        { url: "https://docs.google.com/document/d/DOC1/edit", title: "Doc", lastVisitTime: 1 },
      ],
    });
    await reconcileGoogleDrive();
    expect(mockBookmarks.find((b) => b.title === "google drive")).toBeUndefined();
  });

  it("returns early when nothing parseable is found", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "docs.google.com": [{ url: "https://example.com/", title: "x", lastVisitTime: 1 }],
    });
    await reconcileGoogleDrive();
    expect(mockBookmarks.find((b) => b.title === "google drive")).toBeUndefined();
  });

  it("creates google drive subfolder with parsed entries from history", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "docs.google.com": [
        {
          url: "https://docs.google.com/document/d/DOC1/edit",
          title: "Document Title - Google Docs",
          lastVisitTime: 100,
        },
        {
          url: "https://docs.google.com/spreadsheets/d/SHEET1/edit#gid=0",
          title: "Spreadsheet - Google Sheets",
          lastVisitTime: 200,
        },
        {
          url: "https://docs.google.com/presentation/d/PRES1/edit?slide=1",
          title: "Deck - Google Slides",
          lastVisitTime: 300,
        },
        {
          url: "https://docs.google.com/forms/d/FORM1/edit",
          title: "Survey - Google Forms",
          lastVisitTime: 50,
        },
      ],
      "drive.google.com": [
        {
          url: "https://drive.google.com/file/d/FILE1/view",
          title: "File - Google Drive",
          lastVisitTime: 400,
        },
        {
          url: "https://drive.google.com/open?id=OPEN1",
          title: "Open - Google Drive",
          lastVisitTime: 500,
        },
      ],
    });
    await reconcileGoogleDrive();
    const folder = mockBookmarks.find((b) => b.title === "google drive");
    expect(folder).toBeDefined();
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folder.id && b.url);
    expect(bookmarks).toHaveLength(6);
    // Newest visit time first
    expect(bookmarks[0].title).toBe("Open");
    // Suffix "- Google ..." stripped from titles
    for (const b of bookmarks) {
      expect(b.title).not.toContain("Google Docs");
    }
  });

  it("dedupes by docId between history and bookmarks", async () => {
    addMockFolder("2", "url-porter");
    addMockBookmark(
      "1",
      "Existing Doc - Google Docs",
      "https://docs.google.com/document/d/SAMEID/edit",
      100,
    );
    setHistory({
      "docs.google.com": [
        {
          url: "https://docs.google.com/document/d/SAMEID/edit",
          title: "Newer - Google Docs",
          lastVisitTime: 200,
        },
      ],
    });
    await reconcileGoogleDrive();
    const folder = mockBookmarks.find((b) => b.title === "google drive");
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folder.id && b.url);
    expect(bookmarks).toHaveLength(1);
  });

  it("falls back to docId when title is missing", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "docs.google.com": [
        { url: "https://docs.google.com/document/d/DOCONLY/edit", title: "", lastVisitTime: 10 },
      ],
    });
    await reconcileGoogleDrive();
    const folder = mockBookmarks.find((b) => b.title === "google drive");
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folder.id && b.url);
    expect(bookmarks[0].title).toBe("DOCONLY");
  });

  it("replaces existing google drive subfolder on reconciliation", async () => {
    const porter = addMockFolder("2", "url-porter");
    const stale = addMockFolder(porter.id, "google drive");
    addMockBookmark(stale.id, "Stale", "https://docs.google.com/document/d/STALE/edit", 1);
    setHistory({
      "docs.google.com": [
        {
          url: "https://docs.google.com/document/d/FRESH/edit",
          title: "Fresh",
          lastVisitTime: 100,
        },
      ],
    });
    await reconcileGoogleDrive();
    const folders = mockBookmarks.filter((b) => !b.url && b.title === "google drive");
    expect(folders).toHaveLength(1);
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folders[0].id && b.url);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].url).toContain("FRESH");
  });

  it("places google drive after jira tickets if present", async () => {
    const porter = addMockFolder("2", "url-porter");
    addMockFolder(porter.id, "prs");
    addMockFolder(porter.id, "github repos");
    addMockFolder(porter.id, "jira tickets");
    setHistory({
      "docs.google.com": [
        { url: "https://docs.google.com/document/d/X/edit", title: "X", lastVisitTime: 1 },
      ],
    });
    await reconcileGoogleDrive();
    expect(subfolderOrder(porter.id)).toEqual([
      "prs",
      "github repos",
      "jira tickets",
      "google drive",
    ]);
  });

  it("falls back to figma index when jira is missing", async () => {
    const porter = addMockFolder("2", "url-porter");
    addMockFolder(porter.id, "prs");
    addMockFolder(porter.id, "github repos");
    addMockFolder(porter.id, "figma mocks");
    setHistory({
      "docs.google.com": [
        { url: "https://docs.google.com/document/d/X/edit", title: "X", lastVisitTime: 1 },
      ],
    });
    await reconcileGoogleDrive();
    expect(subfolderOrder(porter.id)).toEqual([
      "prs",
      "github repos",
      "figma mocks",
      "google drive",
    ]);
  });

  it("falls back to github repos index when no jira or figma", async () => {
    const porter = addMockFolder("2", "url-porter");
    addMockFolder(porter.id, "prs");
    addMockFolder(porter.id, "github repos");
    setHistory({
      "docs.google.com": [
        { url: "https://docs.google.com/document/d/X/edit", title: "X", lastVisitTime: 1 },
      ],
    });
    await reconcileGoogleDrive();
    // github repos is the last sibling — google drive is placed right after it.
    expect(subfolderOrder(porter.id)).toEqual(["prs", "github repos", "google drive"]);
  });

  it("survives history.search errors", async () => {
    addMockFolder("2", "url-porter");
    chrome.history.search.mockRejectedValueOnce(new Error("boom"));
    addMockBookmark("1", "From Bookmark", "https://docs.google.com/document/d/BOOK/edit", 100);
    await reconcileGoogleDrive();
    const folder = mockBookmarks.find((b) => b.title === "google drive");
    expect(folder).toBeDefined();
  });

  it("skips bookmarks inside the url-porter folder during walk", async () => {
    const porter = addMockFolder("2", "url-porter");
    const old = addMockFolder(porter.id, "google drive");
    addMockBookmark(old.id, "Inside", "https://docs.google.com/document/d/INSIDE/edit", 100);
    addMockBookmark("1", "Outside", "https://docs.google.com/document/d/OUTSIDE/edit", 200);
    await reconcileGoogleDrive();
    const folders = mockBookmarks.filter((b) => !b.url && b.title === "google drive");
    expect(folders).toHaveLength(1);
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folders[0].id && b.url);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].url).toContain("OUTSIDE");
  });

  it("returns null on bookmarks.getTree error", async () => {
    addMockFolder("2", "url-porter");
    chrome.bookmarks.getTree.mockRejectedValueOnce(new Error("tree boom"));
    setHistory({
      "docs.google.com": [
        { url: "https://docs.google.com/document/d/X/edit", title: "X", lastVisitTime: 1 },
      ],
    });
    await reconcileGoogleDrive();
    const folder = mockBookmarks.find((b) => b.title === "google drive");
    expect(folder).toBeDefined();
  });
});
