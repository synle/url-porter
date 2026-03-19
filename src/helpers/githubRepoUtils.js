/**
 * Repository bookmark utilities (GitHub + Azure DevOps).
 *
 * Scans browser history and all bookmarks for repo URLs, extracts the
 * org/repo, deduplicates, and maintains a "github repos" folder under
 * the url-porter bookmark folder with org subfolders.
 *
 * Supported URL formats:
 *   GitHub:
 *     https://github.com/synle/sqlui-native/actions/runs/123?tab=readme →
 *       org: "synle", repo: "sqlui-native", url: "https://github.com/synle/sqlui-native"
 *
 *   Azure DevOps:
 *     https://lnkd.visualstudio.com/EPE.CICD/_git/TDE-Azure-Migration-Service?path=... →
 *       org: "lnkd EPE.CICD", repo: "TDE-Azure-Migration-Service",
 *       url: "https://lnkd.visualstudio.com/EPE.CICD/_git/TDE-Azure-Migration-Service"
 */

import { getBookmarkFolderName, getGithubOrgThreshold } from "./storage.js";

const GITHUB_REPO_REGEX = /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)/;
const AZURE_DEVOPS_REGEX = /^https?:\/\/([^/?#]+)\.visualstudio\.com\/([^/?#]+)\/_git\/([^/?#]+)/;
const SUBFOLDER_NAME = "github repos";

/**
 * Convert a string to title case: replace `_`, `-`, `.` with spaces,
 * then capitalize the first letter of each word.
 */
function toTitleCase(str) {
  return str
    .replace(/[_\-.]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse a GitHub URL into { org, repo, url } or null.
 */
function parseGitHubRepo(url) {
  if (!url) return null;
  const cleanUrl = url.split("?")[0].split("#")[0];
  const match = cleanUrl.match(GITHUB_REPO_REGEX);
  if (!match) return null;
  const org = match[1];
  let repo = match[2];
  if (repo.endsWith(".git")) repo = repo.slice(0, -4);
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
    org: toTitleCase(org),
    repo: toTitleCase(repo),
    url: `https://github.com/${org.toLowerCase()}/${repo.toLowerCase()}`,
  };
}

/**
 * Parse an Azure DevOps URL into { org, repo, url } or null.
 * URL format: https://{instance}.visualstudio.com/{project}/_git/{repo}
 * org becomes "{instance} {project}", repo is the repo name.
 */
function parseAzureDevOpsRepo(url) {
  if (!url) return null;
  const cleanUrl = url.split("?")[0].split("#")[0];
  const match = cleanUrl.match(AZURE_DEVOPS_REGEX);
  if (!match) return null;
  const instance = match[1];
  const project = match[2];
  let repo = match[3];
  if (repo.endsWith(".git")) repo = repo.slice(0, -4);
  return {
    org: toTitleCase(`${instance} ${project}`),
    repo: toTitleCase(repo),
    url: `https://${instance}.visualstudio.com/${project}/_git/${repo}`,
  };
}

/**
 * Try to parse a URL as any supported repo type.
 */
function parseRepoUrl(url) {
  return parseGitHubRepo(url) || parseAzureDevOpsRepo(url);
}

/**
 * Collect repo URLs from browser history.
 */
async function getReposFromHistory() {
  const repos = new Map();
  try {
    const [githubItems, azureItems] = await Promise.all([
      chrome.history.search({ text: "github.com", maxResults: 10000, startTime: 0 }),
      chrome.history.search({ text: "visualstudio.com", maxResults: 10000, startTime: 0 }),
    ]);
    const allItems = [...githubItems, ...azureItems];
    for (const item of allItems) {
      const parsed = parseRepoUrl(item.url);
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
 * Recursively walk all bookmarks and extract repo URLs.
 */
async function getReposFromBookmarks() {
  const repos = new Map();
  try {
    const tree = await chrome.bookmarks.getTree();
    function walk(nodes) {
      for (const node of nodes) {
        if (node.url) {
          const parsed = parseRepoUrl(node.url);
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
 * Reconcile the "github repos" folder with repos found in history and bookmarks.
 * Deletes the old folder entirely and rebuilds from scratch.
 * Deduplicates, sorts by repo name, and groups by org in subfolders.
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
  const [historyRepos, bookmarkRepos] = await Promise.all([getReposFromHistory(), getReposFromBookmarks()]);

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

  // Delete the old "github repos" folder if it exists, then create a fresh one
  const porterChildren = await chrome.bookmarks.getChildren(porterFolder.id);
  const oldSubfolder = porterChildren.find((c) => !c.url && c.title === SUBFOLDER_NAME);
  if (oldSubfolder) {
    await chrome.bookmarks.removeTree(oldSubfolder.id);
    console.log("[githubRepoUtils] reconcileGitHubRepos: deleted old folder");
  }
  const subfolder = await chrome.bookmarks.create({ parentId: porterFolder.id, title: SUBFOLDER_NAME, index: 0 });

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

  // Split orgs into real groups (threshold+ repos) and misc (< threshold repos)
  const orgThreshold = await getGithubOrgThreshold();
  const sortedOrgs = [...byOrg.keys()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const miscRepos = [];
  const realOrgs = [];
  for (const org of sortedOrgs) {
    if (byOrg.get(org).length >= orgThreshold) {
      realOrgs.push(org);
    } else {
      miscRepos.push(...byOrg.get(org));
    }
  }

  // Create org subfolders and add bookmarks
  let added = 0;
  for (const org of realOrgs) {
    const orgFolder = await chrome.bookmarks.create({ parentId: subfolder.id, title: org });
    for (const { repo, url } of byOrg.get(org)) {
      await chrome.bookmarks.create({ parentId: orgFolder.id, title: repo, url });
      added++;
    }
  }

  // Create misc folder for small groups
  if (miscRepos.length > 0) {
    miscRepos.sort((a, b) => a.org.toLowerCase().localeCompare(b.org.toLowerCase()) || a.repo.toLowerCase().localeCompare(b.repo.toLowerCase()));
    const miscFolder = await chrome.bookmarks.create({ parentId: subfolder.id, title: "misc" });
    for (const { org, repo, url } of miscRepos) {
      await chrome.bookmarks.create({ parentId: miscFolder.id, title: `${repo} (${org})`, url });
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
