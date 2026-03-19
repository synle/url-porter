/**
 * Pull request bookmark utilities.
 *
 * Scans browser history and all bookmarks for GitHub and Azure DevOps PR URLs,
 * deduplicates, and maintains a "prs" folder under the url-porter bookmark folder.
 * Flat list sorted by date (newest first).
 *
 * Supported URL formats:
 *   GitHub:
 *     https://github.com/{org}/{repo}/pull/{number}
 *     https://github.com/{org}/{repo}/pull/{number}/files
 *     https://github.com/{org}/{repo}/pull/{number}/commits
 *
 *   Azure DevOps:
 *     https://{instance}.visualstudio.com/{project}/_git/{repo}/pullrequest/{number}
 */

import { getBookmarkFolderName } from "./storage.js";

const GITHUB_PR_REGEX = /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/pull\/(\d+)/;
const AZURE_PR_REGEX = /^https?:\/\/([^/?#]+)\.visualstudio\.com\/([^/?#]+)\/_git\/([^/?#]+)\/pullrequest\/(\d+)/;
const SUBFOLDER_NAME = "prs";

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
 * Format a timestamp as m/yy (e.g. 3/26).
 */
function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const m = d.getMonth() + 1;
  const yy = String(d.getFullYear()).slice(2);
  return `${m}/${yy}`;
}

/**
 * Parse a GitHub PR URL into { org, repo, prNumber, url } or null.
 */
function parseGitHubPr(url) {
  if (!url) return null;
  const cleanUrl = url.split("?")[0].split("#")[0].replace(/\/+$/, "");
  const match = cleanUrl.match(GITHUB_PR_REGEX);
  if (!match) return null;
  const org = match[1];
  const repo = match[2];
  const prNumber = match[3];
  const canonicalUrl = `https://github.com/${org}/${repo}/pull/${prNumber}`;
  return {
    org: toTitleCase(org),
    repo: toTitleCase(repo),
    prNumber,
    url: canonicalUrl,
    dedupeKey: `github:${org.toLowerCase()}/${repo.toLowerCase()}/${prNumber}`,
  };
}

/**
 * Parse an Azure DevOps PR URL into { org, repo, prNumber, url } or null.
 * org becomes "{instance} {project}".
 */
function parseAzureDevOpsPr(url) {
  if (!url) return null;
  const cleanUrl = url.split("?")[0].split("#")[0].replace(/\/+$/, "");
  const match = cleanUrl.match(AZURE_PR_REGEX);
  if (!match) return null;
  const instance = match[1];
  const project = match[2];
  const repo = match[3];
  const prNumber = match[4];
  const canonicalUrl = `https://${instance}.visualstudio.com/${project}/_git/${repo}/pullrequest/${prNumber}`;
  return {
    org: toTitleCase(`${instance} ${project}`),
    repo: toTitleCase(repo),
    prNumber,
    url: canonicalUrl,
    dedupeKey: `azure:${instance.toLowerCase()}/${project.toLowerCase()}/${repo.toLowerCase()}/${prNumber}`,
  };
}

/**
 * Try to parse a URL as any supported PR type.
 */
function parsePrUrl(url) {
  return parseGitHubPr(url) || parseAzureDevOpsPr(url);
}

/**
 * Clean a page title to extract just the PR description.
 * Strips PR numbers, repo/org names, "Pull requests", GitHub suffixes, "by user" patterns.
 */
function cleanPrTitle(pageTitle, prNumber) {
  if (!pageTitle) return "";
  let detail = pageTitle;
  // Strip "Pull requests · org/repo" suffix
  detail = detail.replace(/\s*[-·]\s*Pull [Rr]equests?\s*[-·].*$/i, "").trim();
  // Strip trailing "by username · Pull Request #123 · org/repo" pattern
  detail = detail.replace(/\s*by\s+\S+\s*[-·].*$/i, "").trim();
  // Strip trailing " - GitHub" or similar
  detail = detail.replace(/\s*-\s*GitHub.*$/i, "").trim();
  // Strip leading PR number patterns like "#123 " or "PR #123: "
  detail = detail.replace(new RegExp(`^(PR\\s*)?#?${prNumber}\\s*[:/-]?\\s*`, "i"), "").trim();
  return detail;
}

/**
 * Build the bookmark title.
 * Format: "#1692 - 3/26 - Repo Name / Org Name - PR description"
 */
function buildTitle(entry) {
  const dateStr = formatDate(entry.visitTime);
  let title = `#${entry.prNumber}`;
  if (dateStr) title += ` - ${dateStr}`;
  title += ` - ${entry.repo} / ${entry.org}`;
  if (entry.pageTitle) {
    const detail = cleanPrTitle(entry.pageTitle, entry.prNumber);
    if (detail) title += ` - ${detail}`;
  }
  return title;
}

/**
 * Collect PR URLs from browser history.
 */
async function getPrsFromHistory() {
  const prs = new Map();
  try {
    const [githubItems, azureItems] = await Promise.all([
      chrome.history.search({ text: "github.com/pull", maxResults: 10000, startTime: 0 }),
      chrome.history.search({ text: "pullrequest", maxResults: 10000, startTime: 0 }),
    ]);
    for (const item of [...githubItems, ...azureItems]) {
      const parsed = parsePrUrl(item.url);
      if (!parsed) continue;
      const existing = prs.get(parsed.dedupeKey);
      const visitTime = item.lastVisitTime || 0;
      if (!existing || visitTime > existing.visitTime) {
        prs.set(parsed.dedupeKey, {
          ...parsed,
          visitTime,
          pageTitle: item.title || existing?.pageTitle || "",
        });
      }
    }
  } catch (err) {
    console.error("[prUtils] failed to search history:", err);
  }
  return prs;
}

/**
 * Recursively walk all bookmarks and extract PR URLs.
 */
async function getPrsFromBookmarks() {
  const prs = new Map();
  try {
    const tree = await chrome.bookmarks.getTree();
    function walk(nodes) {
      for (const node of nodes) {
        if (node.url) {
          const parsed = parsePrUrl(node.url);
          if (parsed) {
            const existing = prs.get(parsed.dedupeKey);
            const dateAdded = node.dateAdded || 0;
            if (!existing || dateAdded > existing.visitTime) {
              prs.set(parsed.dedupeKey, {
                ...parsed,
                visitTime: dateAdded,
                pageTitle: node.title || existing?.pageTitle || "",
              });
            }
          }
        }
        if (node.children) walk(node.children);
      }
    }
    walk(tree);
  } catch (err) {
    console.error("[prUtils] failed to walk bookmarks:", err);
  }
  return prs;
}

/**
 * Find the url-porter folder under top-level bookmark folders.
 */
async function findPorterFolder(folderName) {
  const results = await chrome.bookmarks.search({ title: folderName });
  return results.find((node) => !node.url && (node.parentId === "1" || node.parentId === "2"));
}

/**
 * Reconcile the "prs" folder with PR URLs found in history and bookmarks.
 * Flat list sorted by date (newest first). Placed above "github repos".
 */
export async function reconcilePrs() {
  console.log("[prUtils] reconcilePrs: starting...");

  const folderName = await getBookmarkFolderName();
  const porterFolder = await findPorterFolder(folderName);
  if (!porterFolder) {
    console.log("[prUtils] reconcilePrs: url-porter folder not found, skipping");
    return;
  }

  const [historyPrs, bookmarkPrs] = await Promise.all([getPrsFromHistory(), getPrsFromBookmarks()]);

  // Merge — prefer richer page title, keep most recent visitTime
  const allPrs = new Map();
  for (const [key, val] of historyPrs) {
    allPrs.set(key, val);
  }
  for (const [key, val] of bookmarkPrs) {
    const existing = allPrs.get(key);
    if (existing) {
      allPrs.set(key, {
        ...existing,
        pageTitle: existing.pageTitle || val.pageTitle,
        visitTime: Math.max(existing.visitTime || 0, val.visitTime || 0),
      });
    } else {
      allPrs.set(key, val);
    }
  }

  console.log(
    "[prUtils] reconcilePrs: found",
    allPrs.size,
    "unique PRs (history:",
    historyPrs.size,
    "bookmarks:",
    bookmarkPrs.size,
    ")",
  );

  if (allPrs.size === 0) return;

  // Delete old folder
  const porterChildren = await chrome.bookmarks.getChildren(porterFolder.id);
  const oldSubfolder = porterChildren.find((c) => !c.url && c.title === SUBFOLDER_NAME);
  if (oldSubfolder) {
    await chrome.bookmarks.removeTree(oldSubfolder.id);
    console.log("[prUtils] reconcilePrs: deleted old folder");
  }

  // Place at index 0 (above github repos)
  const subfolder = await chrome.bookmarks.create({ parentId: porterFolder.id, title: SUBFOLDER_NAME, index: 0 });

  // Sort by date (newest first)
  const sorted = [...allPrs.values()].sort((a, b) => (b.visitTime || 0) - (a.visitTime || 0));

  let added = 0;
  for (const entry of sorted) {
    const title = buildTitle(entry);
    await chrome.bookmarks.create({ parentId: subfolder.id, title, url: entry.url });
    added++;
  }

  console.log("[prUtils] reconcilePrs: done. added:", added, "PRs");
}
