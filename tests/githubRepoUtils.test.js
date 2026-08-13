/**
 * Tests for githubRepoUtils — parsing GitHub / Azure DevOps repo URLs and reconcile.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, mockBookmarks, addMockFolder, addMockBookmark, reset, setHistory, storageData } =
  createChromeMock();
vi.stubGlobal("chrome", chrome);

const { reconcileGitHubRepos } = await import("../src/helpers/githubRepoUtils.js");

/**
 * Titles of the porter folder's subfolders, in their final on-disk order.
 * @param {string} porterId - The url-porter folder ID.
 * @returns {string[]} Subfolder titles in order.
 */
function subfolderOrder(porterId) {
  return mockBookmarks.filter((b) => b.parentId === porterId && !b.url).map((b) => b.title);
}

describe("githubRepoUtils — reconcileGitHubRepos", () => {
  beforeEach(() => {
    reset();
    chrome.bookmarks.create.mockClear();
  });

  it("skips reconcile when url-porter folder is missing", async () => {
    setHistory({
      "github.com": [{ url: "https://github.com/acme/widget", title: "widget", lastVisitTime: 1 }],
    });
    await reconcileGitHubRepos();
    expect(mockBookmarks.find((b) => b.title === "github repos")).toBeUndefined();
  });

  it("returns early when no repos are found", async () => {
    addMockFolder("2", "url-porter");
    await reconcileGitHubRepos();
    expect(mockBookmarks.find((b) => b.title === "github repos")).toBeUndefined();
  });

  it("filters out non-repo GitHub pages (settings, issues, marketplace, etc.)", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "github.com": [
        { url: "https://github.com/settings/profile", title: "Settings", lastVisitTime: 1 },
        { url: "https://github.com/marketplace/actions", title: "Marketplace", lastVisitTime: 2 },
        { url: "https://github.com/explore", title: "Explore", lastVisitTime: 3 },
        { url: "https://github.com/notifications", title: "Notifications", lastVisitTime: 4 },
        { url: "https://github.com/pulls", title: "Pulls", lastVisitTime: 5 },
        { url: "https://github.com/acme/widget", title: "real repo", lastVisitTime: 100 },
      ],
    });
    await reconcileGitHubRepos();
    const repoFolder = mockBookmarks.find((b) => b.title === "github repos");
    // Should contain only the real repo (single repo → goes under misc since threshold=3)
    const allBookmarks = mockBookmarks.filter(
      (b) => b.url && b.parentId !== "1" && b.parentId !== "2",
    );
    const inside = allBookmarks.filter((b) => {
      // chase parent until we hit github repos
      let cur = b;
      while (cur) {
        if (cur.parentId === repoFolder.id) return true;
        cur = mockBookmarks.find((x) => x.id === cur.parentId);
      }
      return false;
    });
    expect(inside).toHaveLength(1);
  });

  it("strips .git suffix from repo names", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "github.com": [
        { url: "https://github.com/acme/widget.git", title: "w", lastVisitTime: 1 },
        { url: "https://github.com/acme/gadget.git", title: "g", lastVisitTime: 2 },
        { url: "https://github.com/acme/sprocket.git", title: "s", lastVisitTime: 3 },
      ],
    });
    await reconcileGitHubRepos();
    const repoFolder = mockBookmarks.find((b) => b.title === "github repos");
    const subfolders = mockBookmarks.filter((b) => !b.url && b.parentId === repoFolder.id);
    // With 3 repos in same org and threshold=3 → org gets its own folder
    expect(subfolders.length).toBeGreaterThanOrEqual(1);
    // Check that .git was stripped from URLs
    const allBms = mockBookmarks.filter((b) => b.url);
    for (const bm of allBms) {
      expect(bm.url).not.toMatch(/\.git$/);
    }
  });

  it("groups orgs by threshold into org subfolders and misc", async () => {
    addMockFolder("2", "url-porter");
    storageData.githubOrgThreshold = 3;
    setHistory({
      "github.com": [
        // big org (3 repos)
        { url: "https://github.com/bigorg/repo1", title: "r1", lastVisitTime: 1 },
        { url: "https://github.com/bigorg/repo2", title: "r2", lastVisitTime: 2 },
        { url: "https://github.com/bigorg/repo3", title: "r3", lastVisitTime: 3 },
        // small org (1 repo)
        { url: "https://github.com/tinyorg/lone", title: "lone", lastVisitTime: 4 },
      ],
    });
    await reconcileGitHubRepos();
    const repoFolder = mockBookmarks.find((b) => b.title === "github repos");
    const subs = mockBookmarks.filter((b) => !b.url && b.parentId === repoFolder.id);
    const subNames = subs.map((b) => b.title).sort();
    expect(subNames).toContain("misc");
    expect(subs.length).toBe(2);
  });

  it("parses Azure DevOps repo URLs", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "visualstudio.com": [
        {
          url: "https://acme.visualstudio.com/Project/_git/MyRepo?path=foo",
          title: "Repo",
          lastVisitTime: 100,
        },
      ],
    });
    await reconcileGitHubRepos();
    const repoFolder = mockBookmarks.find((b) => b.title === "github repos");
    expect(repoFolder).toBeDefined();
    const allBms = mockBookmarks.filter((b) => b.url);
    expect(allBms.some((b) => b.url.includes("visualstudio.com"))).toBe(true);
  });

  it("dedupes between history and bookmarks by canonical URL", async () => {
    addMockFolder("2", "url-porter");
    addMockBookmark("1", "Existing", "https://github.com/acme/widget/issues/5", 100);
    setHistory({
      "github.com": [
        { url: "https://github.com/acme/widget/pulls", title: "newer", lastVisitTime: 200 },
      ],
    });
    await reconcileGitHubRepos();
    const repoFolder = mockBookmarks.find((b) => b.title === "github repos");
    // Should have just one entry under github repos (deduped by canonical URL)
    const allBms = mockBookmarks.filter(
      (b) =>
        b.url &&
        b.url.includes("/acme/widget") &&
        !b.url.includes("pulls") &&
        !b.url.includes("issues"),
    );
    expect(allBms.length).toBe(1);
  });

  it("replaces existing github repos folder on reconcile", async () => {
    const porter = addMockFolder("2", "url-porter");
    const stale = addMockFolder(porter.id, "github repos");
    addMockBookmark(stale.id, "Stale", "https://github.com/acme/old", 1);
    setHistory({
      "github.com": [
        { url: "https://github.com/acme/fresh", title: "f", lastVisitTime: 1 },
        { url: "https://github.com/acme/fresh2", title: "f2", lastVisitTime: 2 },
        { url: "https://github.com/acme/fresh3", title: "f3", lastVisitTime: 3 },
      ],
    });
    await reconcileGitHubRepos();
    const folders = mockBookmarks.filter((b) => !b.url && b.title === "github repos");
    expect(folders).toHaveLength(1);
    const allUrls = mockBookmarks.filter((b) => b.url).map((b) => b.url);
    expect(allUrls).not.toContain("https://github.com/acme/old");
  });

  it("places github repos right after prs when present", async () => {
    const porter = addMockFolder("2", "url-porter");
    addMockFolder(porter.id, "prs");
    setHistory({
      "github.com": [{ url: "https://github.com/acme/widget", title: "w", lastVisitTime: 1 }],
    });
    await reconcileGitHubRepos();
    expect(subfolderOrder(porter.id)).toEqual(["prs", "github repos"]);
  });

  it("places github repos at index 0 when prs is missing", async () => {
    const porter = addMockFolder("2", "url-porter");
    setHistory({
      "github.com": [{ url: "https://github.com/acme/widget", title: "w", lastVisitTime: 1 }],
    });
    await reconcileGitHubRepos();
    expect(subfolderOrder(porter.id)).toEqual(["github repos"]);
  });

  it("skips bookmarks inside porter folder during walk", async () => {
    const porter = addMockFolder("2", "url-porter");
    const old = addMockFolder(porter.id, "github repos");
    addMockBookmark(old.id, "Inside", "https://github.com/inside/secret", 100);
    addMockBookmark("1", "Outside", "https://github.com/outside/public", 200);
    await reconcileGitHubRepos();
    const allUrls = mockBookmarks.filter((b) => b.url).map((b) => b.url);
    // inside is in the deleted folder; outside survives
    expect(allUrls).toContain("https://github.com/outside/public");
  });

  it("survives history.search errors", async () => {
    addMockFolder("2", "url-porter");
    chrome.history.search.mockRejectedValueOnce(new Error("boom"));
    addMockBookmark("1", "From Bookmark", "https://github.com/acme/widget", 100);
    await reconcileGitHubRepos();
    const repoFolder = mockBookmarks.find((b) => b.title === "github repos");
    expect(repoFolder).toBeDefined();
  });

  it("rejects reserved top-level routes that look like org/repo pairs", async () => {
    addMockFolder("2", "url-porter");
    setHistory({
      "github.com": [
        { url: "https://github.com/apps/some-app", title: "App", lastVisitTime: 1 },
        { url: "https://github.com/codespaces/fuzzy-name", title: "Codespace", lastVisitTime: 2 },
        { url: "https://github.com/advisories/GHSA-xxxx", title: "Advisory", lastVisitTime: 3 },
        // Case-insensitive: the route is the same regardless of casing.
        { url: "https://github.com/Settings/profile", title: "Settings", lastVisitTime: 4 },
        { url: "https://github.com/acme/widget", title: "widget", lastVisitTime: 5 },
      ],
    });

    await reconcileGitHubRepos();

    const allUrls = mockBookmarks.filter((b) => b.url).map((b) => b.url);
    expect(allUrls).toContain("https://github.com/acme/widget");
    expect(allUrls.some((u) => u.includes("/apps/"))).toBe(false);
    expect(allUrls.some((u) => u.includes("/codespaces/"))).toBe(false);
    expect(allUrls.some((u) => u.includes("/advisories/"))).toBe(false);
    expect(allUrls.some((u) => u.includes("/settings/"))).toBe(false);
  });
});
