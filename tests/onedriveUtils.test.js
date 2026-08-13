/**
 * Tests for onedriveUtils — OneDrive / SharePoint URL parsing and reconcile flow.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, mockBookmarks, addMockFolder, addMockBookmark, reset, setHistory } =
  createChromeMock();
vi.stubGlobal("chrome", chrome);

const { reconcileOnedrive } = await import("../src/helpers/onedriveUtils.js");

/**
 * Titles of the porter folder's subfolders, in their final on-disk order.
 * @param {string} porterId - The url-porter folder ID.
 * @returns {string[]} Subfolder titles in order.
 */
function subfolderOrder(porterId) {
  return mockBookmarks.filter((b) => b.parentId === porterId && !b.url).map((b) => b.title);
}

describe("onedriveUtils — reconcileOnedrive", () => {
  beforeEach(() => {
    reset();
  });

  it("skips reconcile when url-porter folder is missing", async () => {
    setHistory({
      "onedrive.live.com": [
        { url: "https://onedrive.live.com/edit.aspx?resid=ABC", title: "Doc", lastVisitTime: 1 },
      ],
    });
    await reconcileOnedrive();
    expect(mockBookmarks.find((b) => b.title === "onedrive")).toBeUndefined();
  });

  it("returns early when nothing parseable is found", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "sharepoint.com": [{ url: "https://example.com/", title: "x", lastVisitTime: 1 }],
    });
    await reconcileOnedrive();
    expect(mockBookmarks.find((b) => b.title === "onedrive")).toBeUndefined();
  });

  it("parses SharePoint sharing links, Doc.aspx, OneDrive live, and personal", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "sharepoint.com": [
        {
          url: "https://acme.sharepoint.com/:w:/g/personal/user_acme_com/EXISTS123?web=1",
          title: "Word - SharePoint",
          lastVisitTime: 100,
        },
        {
          url: "https://acme.sharepoint.com/sites/Team/_layouts/15/Doc.aspx?sourcedoc=%7BABC-123%7D&action=edit",
          title: "Excel.xlsx - Microsoft Excel Online",
          lastVisitTime: 200,
        },
        {
          url: "https://acme.sharepoint.com/sites/Team/Shared%20Documents/Report.docx",
          title: "Report - SharePoint",
          lastVisitTime: 300,
        },
        {
          url: "https://globex-my.sharepoint.com/personal/user_globex_com/Documents/notes.docx",
          title: "Notes - OneDrive",
          lastVisitTime: 400,
        },
      ],
      "onedrive.live.com": [
        {
          url: "https://onedrive.live.com/edit.aspx?resid=DEADBEEF&id=ROOT",
          title: "Live Doc - OneDrive",
          lastVisitTime: 500,
        },
      ],
    });
    await reconcileOnedrive();
    const folder = mockBookmarks.find((b) => b.title === "onedrive");
    expect(folder).toBeDefined();
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folder.id && b.url);
    expect(bookmarks.length).toBeGreaterThanOrEqual(4);
    // titles stripped of " - OneDrive"/SharePoint suffix
    for (const b of bookmarks) {
      expect(b.title.toLowerCase()).not.toContain("- onedrive");
    }
  });

  it("falls back to clean URL when SharePoint Doc.aspx has no sourcedoc", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "sharepoint.com": [
        {
          url: "https://acme.sharepoint.com/sites/X/_layouts/15/Doc.aspx",
          title: "Doc",
          lastVisitTime: 1,
        },
      ],
    });
    await reconcileOnedrive();
    const folder = mockBookmarks.find((b) => b.title === "onedrive");
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folder.id && b.url);
    expect(bookmarks).toHaveLength(1);
  });

  it("falls back to clean URL when onedrive.live has no resid", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "onedrive.live.com": [{ url: "https://onedrive.live.com/", title: "Home", lastVisitTime: 1 }],
    });
    await reconcileOnedrive();
    const folder = mockBookmarks.find((b) => b.title === "onedrive");
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folder.id && b.url);
    expect(bookmarks).toHaveLength(1);
  });

  it("dedupes by canonical URL between history and bookmarks", async () => {
    addMockFolder("2", "url-porter");
    addMockBookmark("1", "Bookmark", "https://acme.sharepoint.com/:w:/g/personal/u/SAMEID", 100);
    setHistory({
      "sharepoint.com": [
        {
          url: "https://acme.sharepoint.com/:w:/g/personal/u/SAMEID?web=1",
          title: "Newer",
          lastVisitTime: 200,
        },
      ],
    });
    await reconcileOnedrive();
    const folder = mockBookmarks.find((b) => b.title === "onedrive");
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folder.id && b.url);
    expect(bookmarks).toHaveLength(1);
  });

  it("falls back to dedupeKey when title is missing", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "sharepoint.com": [
        { url: "https://acme.sharepoint.com/:w:/g/p/u/NOTITLE", title: "", lastVisitTime: 1 },
      ],
    });
    await reconcileOnedrive();
    const folder = mockBookmarks.find((b) => b.title === "onedrive");
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folder.id && b.url);
    expect(bookmarks[0].title.length).toBeGreaterThan(0);
  });

  it("replaces existing onedrive subfolder on reconciliation", async () => {
    const porter = addMockFolder("2", "url-porter");
    const stale = addMockFolder(porter.id, "onedrive");
    addMockBookmark(stale.id, "Stale", "https://acme.sharepoint.com/:w:/g/p/u/STALE", 1);
    setHistory({
      "sharepoint.com": [
        { url: "https://acme.sharepoint.com/:w:/g/p/u/FRESH", title: "Fresh", lastVisitTime: 100 },
      ],
    });
    await reconcileOnedrive();
    const folders = mockBookmarks.filter((b) => !b.url && b.title === "onedrive");
    expect(folders).toHaveLength(1);
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folders[0].id && b.url);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].url).toContain("FRESH");
  });

  it("survives history.search errors", async () => {
    addMockFolder("2", "url-porter");
    chrome.history.search.mockRejectedValueOnce(new Error("boom"));
    addMockBookmark("1", "Outside", "https://acme.sharepoint.com/:w:/g/p/u/BM", 100);
    await reconcileOnedrive();
    const folder = mockBookmarks.find((b) => b.title === "onedrive");
    expect(folder).toBeDefined();
  });

  it("skips bookmarks inside the url-porter folder during walk", async () => {
    const porter = addMockFolder("2", "url-porter");
    const old = addMockFolder(porter.id, "onedrive");
    addMockBookmark(old.id, "Inside", "https://acme.sharepoint.com/:w:/g/p/u/INSIDE", 100);
    addMockBookmark("1", "Outside", "https://acme.sharepoint.com/:w:/g/p/u/OUTSIDE", 200);
    await reconcileOnedrive();
    const folders = mockBookmarks.filter((b) => !b.url && b.title === "onedrive");
    expect(folders).toHaveLength(1);
    const bookmarks = mockBookmarks.filter((b) => b.parentId === folders[0].id && b.url);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].url).toContain("OUTSIDE");
  });

  it("places onedrive after google drive when present", async () => {
    const porter = addMockFolder("2", "url-porter");
    addMockFolder(porter.id, "prs");
    addMockFolder(porter.id, "github repos");
    addMockFolder(porter.id, "jira tickets");
    addMockFolder(porter.id, "google drive");
    setHistory({
      "sharepoint.com": [
        { url: "https://acme.sharepoint.com/:w:/g/p/u/X", title: "X", lastVisitTime: 1 },
      ],
    });
    await reconcileOnedrive();
    expect(subfolderOrder(porter.id)).toEqual([
      "prs",
      "github repos",
      "jira tickets",
      "google drive",
      "onedrive",
    ]);
  });
});
