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
import { sanitizeBookmarkTitle } from "./configUtils.js";
import { rebuildManagedSubfolder } from "./managedFolderUtils.js";

const GITHUB_REPO_REGEX = /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)/;
const AZURE_DEVOPS_REGEX = /^https?:\/\/([^/?#]+)\.visualstudio\.com\/([^/?#]+)\/_git\/([^/?#]+)/;
const SUBFOLDER_NAME = "github repos";

/**
 * Convert a string to title case: replace `_`, `-`, `.` with spaces,
 * then capitalize the first letter of each word.
 * @param {string} str
 * @returns {string}
 */
function toTitleCase(str) {
  return str.replace(/[_\-.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse a GitHub URL into { org, repo, url } or null.
 * @param {string} url
 * @returns {{org: string, repo: string, url: string} | null}
 */
function parseGitHubRepo(url) {
  if (!url) return null;
  const cleanUrl = url.split("?")[0].split("#")[0].replace(/\/+$/, "");
  const match = cleanUrl.match(GITHUB_REPO_REGEX);
  if (!match) return null;
  const org = match[1];
  let repo = match[2];
  if (repo.endsWith(".git")) repo = repo.slice(0, -4);
  // Reserved top-level github.com routes that are not `<org>/<repo>` pairs.
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
    "apps",
    "advisories",
    "codespaces",
    "sessions",
    "search",
    "dashboard",
    "account",
    "users",
    "stars",
    "security",
    "contact",
    "site",
    "readme",
  ];
  // Compare case-insensitively — "github.com/Settings/..." is the same route.
  if (nonRepoPages.includes(org.toLowerCase())) return null;
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
 * @param {string} url
 * @returns {{org: string, repo: string, url: string} | null}
 */
function parseAzureDevOpsRepo(url) {
  if (!url) return null;
  const cleanUrl = url.split("?")[0].split("#")[0].replace(/\/+$/, "");
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
 * @param {string} url
 * @returns {{org: string, repo: string, url: string} | null}
 */
function parseRepoUrl(url) {
  return parseGitHubRepo(url) || parseAzureDevOpsRepo(url);
}

/**
 * Collect repo URLs from browser history.
 * @returns {Promise<Map<string, object>>}
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
 * Skips bookmarks inside the url-porter folder to avoid feedback loops.
 * @param {string} porterFolderId
 * @returns {Promise<Map<string, object>>}
 */
async function getReposFromBookmarks(porterFolderId) {
  const repos = new Map();
  try {
    const tree = await chrome.bookmarks.getTree();
    /** Recursively collects matching bookmark entries into the results map. @param {Array} nodes @returns {void} */
    function walk(nodes) {
      for (const node of nodes) {
        if (node.id === porterFolderId) continue;
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
 * @param {string} folderName
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode | undefined>}
 */
async function findPorterFolder(folderName) {
  const results = await chrome.bookmarks.search({ title: folderName });
  return results.find((node) => !node.url && (node.parentId === "1" || node.parentId === "2"));
}

/**
 * Reconcile the "github repos" folder with repos found in history and bookmarks.
 * Deletes the old folder entirely and rebuilds from scratch.
 * Deduplicates, sorts by repo name, and groups by org in subfolders.
 * @returns {Promise<void>}
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
  const [historyRepos, bookmarkRepos] = await Promise.all([
    getReposFromHistory(),
    getReposFromBookmarks(porterFolder.id),
  ]);

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
  const sortedOrgs = [...byOrg.keys()].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  const miscRepos = [];
  const realOrgs = [];
  for (const org of sortedOrgs) {
    if (byOrg.get(org).length >= orgThreshold) {
      realOrgs.push(org);
    } else {
      miscRepos.push(...byOrg.get(org));
    }
  }

  let added = 0;
  await rebuildManagedSubfolder({
    parentId: porterFolder.id,
    title: SUBFOLDER_NAME,
    // Place after the "prs" folder
    resolveIndex: (children) => {
      const prsFolder = children.find((c) => !c.url && c.title === "prs");
      return prsFolder ? children.indexOf(prsFolder) + 1 : 0;
    },
    populate: async (folderId) => {
      // Create org subfolders and add bookmarks
      for (const org of realOrgs) {
        const orgFolder = await chrome.bookmarks.create({ parentId: folderId, title: org });
        for (const { repo, url } of byOrg.get(org)) {
          await chrome.bookmarks.create({
            parentId: orgFolder.id,
            title: sanitizeBookmarkTitle(repo),
            url,
          });
          added++;
        }
      }

      // Create misc folder for small groups
      if (miscRepos.length > 0) {
        miscRepos.sort(
          (a, b) =>
            a.org.toLowerCase().localeCompare(b.org.toLowerCase()) ||
            a.repo.toLowerCase().localeCompare(b.repo.toLowerCase()),
        );
        const miscFolder = await chrome.bookmarks.create({ parentId: folderId, title: "misc" });
        for (const { org, repo, url } of miscRepos) {
          await chrome.bookmarks.create({
            parentId: miscFolder.id,
            title: sanitizeBookmarkTitle(`${repo} (${org})`),
            url,
          });
          added++;
        }
      }
    },
  });

  console.log(
    "[githubRepoUtils] reconcileGitHubRepos: done. added:",
    added,
    "across",
    sortedOrgs.length,
    "org folders",
  );
}
