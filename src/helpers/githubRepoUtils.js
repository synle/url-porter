/**
 * GitHub repository bookmark utilities.
 *
 * Scans browser history and all bookmarks for GitHub URLs, extracts the
 * org/repo, deduplicates, and maintains a "github repos" folder under
 * the url-porter bookmark folder with org subfolders.
 *
 * Example:
 *   https://github.com/synle/sqlui-native/actions/runs/123?tab=readme →
 *     folder: "github repos > synle"
 *     title:  "sqlui-native"
 *     url:    "https://github.com/synle/sqlui-native"
 */

import { getBookmarkFolderName } from "./storage.js";

const GITHUB_REPO_REGEX = /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)/;
const SUBFOLDER_NAME = "github repos";

/**
 * Parse a GitHub URL into { org, repo, url } or null.
 */
function parseGitHubRepo(url) {
  if (!url) return null;
  // Strip query string and fragment before parsing
  const cleanUrl = url.split("?")[0].split("#")[0];
  const match = cleanUrl.match(GITHUB_REPO_REGEX);
  if (!match) return null;
  const org = match[1];
  let repo = match[2];
  // Strip .git suffix if present
  if (repo.endsWith(".git")) repo = repo.slice(0, -4);
  // Skip GitHub non-repo pages
  const nonRepoPages = [
    "settings",
    "orgs",
    "organizations",
    "marketplace",
    "explore",
    "topics",
    "trending",
    "collections",
    "sponsors",
    "issues",
    "pulls",
    "notifications",
    "new",
    "login",
    "signup",
    "features",
    "enterprise",
    "pricing",
    "about",
    "pages",
  ];
  if (nonRepoPages.includes(org)) return null;
  return {
    org,
    repo,
    url: `https://github.com/${org}/${repo}`,
  };
}

/**
 * Collect GitHub repo URLs from browser history.
 */
async function getGitHubReposFromHistory() {
  const repos = new Map();
  try {
    const historyItems = await chrome.history.search({
      text: "github.com",
      maxResults: 10000,
      startTime: 0,
    });
    for (const item of historyItems) {
      const parsed = parseGitHubRepo(item.url);
      if (parsed) {
        repos.set(parsed.url, parsed);
      }
    }
  } catch (err) {
    console.error("[githubRepoUtils] failed to search history:", err);
  }
  return repos;
}

/**
 * Recursively walk all bookmarks and extract GitHub repo URLs.
 */
async function getGitHubReposFromBookmarks() {
  const repos = new Map();
  try {
    const tree = await chrome.bookmarks.getTree();
    function walk(nodes) {
      for (const node of nodes) {
        if (node.url) {
          const parsed = parseGitHubRepo(node.url);
          if (parsed) {
            repos.set(parsed.url, parsed);
          }
        }
        if (node.children) {
          walk(node.children);
        }
      }
    }
    walk(tree);
  } catch (err) {
    console.error("[githubRepoUtils] failed to walk bookmarks:", err);
  }
  return repos;
}

/**
 * Find the url-porter folder under top-level bookmark folders.
 */
async function findPorterFolder(folderName) {
  const results = await chrome.bookmarks.search({ title: folderName });
  return results.find((node) => !node.url && (node.parentId === "1" || node.parentId === "2"));
}

/**
 * Recursively remove all children of a bookmark folder.
 */
async function clearFolder(folderId) {
  const children = await chrome.bookmarks.getChildren(folderId);
  for (const child of children) {
    if (child.url) {
      await chrome.bookmarks.remove(child.id);
    } else {
      await chrome.bookmarks.removeTree(child.id);
    }
  }
}

/**
 * Find or create a subfolder by title under a parent.
 */
async function findOrCreateSubfolder(parentId, title) {
  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = children.find((c) => !c.url && c.title === title);
  if (existing) return existing;
  return chrome.bookmarks.create({ parentId, title });
}

/**
 * Reconcile the "github repos" folder with repos found in history and bookmarks.
 * Wipes existing content, deduplicates, sorts by repo name, and groups by org in subfolders.
 */
export async function reconcileGitHubRepos() {
  console.log("[githubRepoUtils] reconcileGitHubRepos: starting...");

  const folderName = await getBookmarkFolderName();
  const porterFolder = await findPorterFolder(folderName);
  if (!porterFolder) {
    console.log("[githubRepoUtils] reconcileGitHubRepos: url-porter folder not found, skipping");
    return;
  }

  // Gather repos from history and bookmarks
  const [historyRepos, bookmarkRepos] = await Promise.all([getGitHubReposFromHistory(), getGitHubReposFromBookmarks()]);

  // Merge (dedup by URL — flatten)
  const allRepos = new Map([...historyRepos, ...bookmarkRepos]);
  console.log(
    "[githubRepoUtils] reconcileGitHubRepos: found",
    allRepos.size,
    "unique repos (history:",
    historyRepos.size,
    "bookmarks:",
    bookmarkRepos.size,
    ")",
  );

  if (allRepos.size === 0) return;

  // Find or create the top-level "github repos" subfolder
  const subfolder = await findOrCreateSubfolder(porterFolder.id, SUBFOLDER_NAME);

  // Wipe all existing content — clean rebuild
  await clearFolder(subfolder.id);

  // Sort all repos by repo name (case-insensitive), then by org
  const sortedRepos = [...allRepos.values()].sort((a, b) => {
    const repoCompare = a.repo.toLowerCase().localeCompare(b.repo.toLowerCase());
    if (repoCompare !== 0) return repoCompare;
    return a.org.toLowerCase().localeCompare(b.org.toLowerCase());
  });

  // Group by org
  const byOrg = new Map();
  for (const entry of sortedRepos) {
    if (!byOrg.has(entry.org)) {
      byOrg.set(entry.org, []);
    }
    byOrg.get(entry.org).push(entry);
  }

  // Create org subfolders (sorted by org name) and add bookmarks
  const sortedOrgs = [...byOrg.keys()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  let added = 0;
  for (const org of sortedOrgs) {
    const orgFolder = await chrome.bookmarks.create({ parentId: subfolder.id, title: org });
    for (const { repo, url } of byOrg.get(org)) {
      await chrome.bookmarks.create({ parentId: orgFolder.id, title: repo, url });
      added++;
    }
  }

  console.log(
    "[githubRepoUtils] reconcileGitHubRepos: done. added:",
    added,
    "across",
    sortedOrgs.length,
    "org folders",
  );
}
