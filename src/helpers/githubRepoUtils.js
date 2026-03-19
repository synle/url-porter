/**
 * GitHub repository bookmark utilities.
 *
 * Scans browser history and all bookmarks for GitHub URLs, extracts the
 * org/repo, deduplicates, and maintains a "github repos" subfolder under
 * the url-porter bookmark folder.
 *
 * Example:
 *   https://github.com/synle/sqlui-native/actions/runs/123 →
 *     title: "sqlui-native (github/synle)"
 *     url:   "https://github.com/synle/sqlui-native"
 */

import { getBookmarkFolderName } from "./storage.js";

const GITHUB_REPO_REGEX = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)/;
const SUBFOLDER_NAME = "github repos";

/**
 * Parse a GitHub URL into { org, repo, url } or null.
 */
function parseGitHubRepo(url) {
  if (!url) return null;
  const match = url.match(GITHUB_REPO_REGEX);
  if (!match) return null;
  const org = match[1];
  let repo = match[2];
  // Strip .git suffix if present
  if (repo.endsWith(".git")) repo = repo.slice(0, -4);
  // Skip GitHub pages that aren't repos (e.g. github.com/settings, github.com/orgs)
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
 * Find or create the "github repos" subfolder under the url-porter folder.
 */
async function findOrCreateSubfolder(parentId) {
  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = children.find((c) => !c.url && c.title === SUBFOLDER_NAME);
  if (existing) return existing;
  return chrome.bookmarks.create({ parentId, title: SUBFOLDER_NAME });
}

/**
 * Find the url-porter folder under top-level bookmark folders.
 */
async function findPorterFolder(folderName) {
  const results = await chrome.bookmarks.search({ title: folderName });
  return results.find((node) => !node.url && (node.parentId === "1" || node.parentId === "2"));
}

/**
 * Reconcile the "github repos" subfolder with repos found in history and bookmarks.
 * Deduplicates by URL. Creates bookmarks with title format: "repo (github/org)".
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

  // Merge (dedup by URL)
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

  // Find or create subfolder
  const subfolder = await findOrCreateSubfolder(porterFolder.id);
  const children = await chrome.bookmarks.getChildren(subfolder.id);

  // Build map of existing bookmarks: url → node
  const existingByUrl = new Map();
  const toRemove = [];
  for (const child of children) {
    if (existingByUrl.has(child.url)) {
      // Duplicate — mark older one for removal
      toRemove.push(existingByUrl.get(child.url).id);
    }
    existingByUrl.set(child.url, child);
  }

  // Remove duplicates
  for (const id of toRemove) {
    await chrome.bookmarks.remove(id);
  }

  // Add missing repos
  let added = 0;
  for (const [url, { org, repo }] of allRepos) {
    if (!existingByUrl.has(url)) {
      const title = `${repo} (github/${org})`;
      await chrome.bookmarks.create({ parentId: subfolder.id, title, url });
      added++;
    }
  }

  console.log(
    "[githubRepoUtils] reconcileGitHubRepos: done. added:",
    added,
    "existing:",
    existingByUrl.size - toRemove.length,
    "dupes removed:",
    toRemove.length,
  );
}
