/**
 * Tests for bookmarkUtils — reconcileBookmarks and bookmarkTitleFromEntry.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, mockBookmarks, addMockFolder, addMockBookmark, reset, storageData } =
  createChromeMock();
vi.stubGlobal("chrome", chrome);

const { reconcileBookmarks, bookmarkTitleFromEntry } =
  await import("../src/helpers/bookmarkUtils.js");

describe("bookmarkUtils", () => {
  beforeEach(() => {
    reset();
  });

  describe("bookmarkTitleFromEntry", () => {
    it("strips || prefix and ^ suffix from from field", () => {
      expect(bookmarkTitleFromEntry({ from: "||alias^", to: "https://example.com" })).toBe("alias");
    });

    it("handles entries that already lack delimiters", () => {
      expect(bookmarkTitleFromEntry({ from: "bare", to: "https://example.com" })).toBe("bare");
    });
  });

  describe("reconcileBookmarks", () => {
    it("creates the porter folder under Other Bookmarks when missing", async () => {
      await reconcileBookmarks([{ from: "alias", to: "https://example.com" }]);
      const folder = mockBookmarks.find((b) => b.title === "url-porter" && !b.url);
      expect(folder).toBeDefined();
      expect(folder.parentId).toBe("2");
    });

    it("reuses an existing porter folder under Other Bookmarks", async () => {
      const existing = addMockFolder("2", "url-porter");
      await reconcileBookmarks([{ from: "a", to: "https://a.com" }]);
      const folders = mockBookmarks.filter((b) => b.title === "url-porter" && !b.url);
      expect(folders).toHaveLength(1);
      expect(folders[0].id).toBe(existing.id);
    });

    it("creates new bookmarks for each config entry", async () => {
      const porter = addMockFolder("2", "url-porter");
      await reconcileBookmarks([
        { from: "a", to: "https://a.com" },
        { from: "b", to: "https://b.com" },
      ]);
      const created = mockBookmarks.filter((b) => b.parentId === porter.id && b.url);
      expect(created).toHaveLength(2);
      expect(created.map((b) => b.url).sort()).toEqual(["https://a.com", "https://b.com"]);
    });

    it("updates existing bookmark URL in place when it changed", async () => {
      const porter = addMockFolder("2", "url-porter");
      addMockBookmark(porter.id, "alias", "https://old.com", 1);
      await reconcileBookmarks([{ from: "alias", to: "https://new.com" }]);
      const updated = mockBookmarks.find((b) => b.parentId === porter.id && b.title === "alias");
      expect(updated.url).toBe("https://new.com");
    });

    it("leaves untouched bookmarks that still match", async () => {
      const porter = addMockFolder("2", "url-porter");
      addMockBookmark(porter.id, "alias", "https://same.com", 1);
      await reconcileBookmarks([{ from: "alias", to: "https://same.com" }]);
      const bms = mockBookmarks.filter((b) => b.parentId === porter.id && b.url);
      expect(bms).toHaveLength(1);
      expect(bms[0].url).toBe("https://same.com");
    });

    it("keeps unique bookmarks not in config (does not delete)", async () => {
      const porter = addMockFolder("2", "url-porter");
      addMockBookmark(porter.id, "manual", "https://manual.com", 1);
      await reconcileBookmarks([{ from: "alias", to: "https://example.com" }]);
      const manual = mockBookmarks.find((b) => b.title === "manual" && b.parentId === porter.id);
      expect(manual).toBeDefined();
    });

    it("dedupes bookmarks sharing the same title (later wins)", async () => {
      const porter = addMockFolder("2", "url-porter");
      addMockBookmark(porter.id, "dup", "https://older.com", 1);
      addMockBookmark(porter.id, "dup", "https://newer.com", 2);
      await reconcileBookmarks([{ from: "dup", to: "https://newer.com" }]);
      const remaining = mockBookmarks.filter((b) => b.title === "dup" && b.parentId === porter.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].url).toBe("https://newer.com");
    });

    it("resolves alias chains (a -> aaa -> https://aaa.com)", async () => {
      const porter = addMockFolder("2", "url-porter");
      await reconcileBookmarks([
        { from: "a", to: "aaa" },
        { from: "aaa", to: "https://aaa.com" },
      ]);
      const aliasA = mockBookmarks.find((b) => b.parentId === porter.id && b.title === "a");
      expect(aliasA.url).toBe("https://aaa.com");
    });

    it("filters out entries that fail normalization", async () => {
      const porter = addMockFolder("2", "url-porter");
      await reconcileBookmarks([{ from: "ok", to: "https://ok.com" }, null, "not-an-entry"]);
      const created = mockBookmarks.filter((b) => b.parentId === porter.id && b.url);
      expect(created).toHaveLength(1);
    });

    it("uses configured bookmark folder name from storage", async () => {
      storageData.bookmarkFolderName = "my-shortcuts";
      await reconcileBookmarks([{ from: "x", to: "https://x.com" }]);
      const folder = mockBookmarks.find((b) => !b.url && b.title === "my-shortcuts");
      expect(folder).toBeDefined();
    });
  });
});
