/**
 * Jira ticket bookmark utilities.
 *
 * Scans browser history and all bookmarks for Jira ticket URLs,
 * deduplicates by ticket key, and maintains a "jira tickets" folder
 * under the url-porter bookmark folder grouped by project prefix.
 *
 * Supported URL formats:
 *   https://linkedin.atlassian.net/browse/SAAM-27948
 *   https://jira01.corp.linkedin.com:8443/browse/INFOSEC-101219
 *   (any host starting with "jira" or ending with ".atlassian.net" with /browse/KEY-123)
 */

import { getBookmarkFolderName, getGithubOrgThreshold, getJiraStatuses } from "./storage.js";
import { sanitizeBookmarkTitle } from "./configUtils.js";
import { rebuildManagedSubfolder } from "./managedFolderUtils.js";

const ATLASSIAN_REGEX = /^https?:\/\/[^/]*\.atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/i;
const JIRA_HOST_REGEX = /^https?:\/\/jira[^/]*\/browse\/([A-Z][A-Z0-9]+-\d+)/i;
const SUBFOLDER_NAME = "jira tickets";

/** @type {Object<string, string>} Status emoji prefixes for bookmark titles. */
const STATUS_ICONS = {
  in_progress: "\uD83D\uDD35 ", // 🔵
  closed: "\u2705 ", // ✅
  not_started: "\u26AA ", // ⚪
  blocked: "\u274C ", // ❌
};

/**
 * Extract the project prefix from a ticket key (e.g. "INFOSEC" from "INFOSEC-101219").
 * @param {string} ticketKey
 * @returns {string}
 */
function getProject(ticketKey) {
  return ticketKey.split("-")[0].toUpperCase();
}

/**
 * Format a timestamp as yyyy-MM.
 * @param {number} ts
 * @returns {string}
 */
function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

/**
 * Parse a Jira URL into { ticketKey, url } or null.
 * Strips query strings, hash fragments, and trailing slashes.
 * @param {string} url
 * @returns {{ticketKey: string, project: string, url: string} | null}
 */
function parseJiraTicket(url) {
  if (!url) return null;
  const cleanUrl = url.split("?")[0].split("#")[0].replace(/\/+$/, "");
  const match = cleanUrl.match(ATLASSIAN_REGEX) || cleanUrl.match(JIRA_HOST_REGEX);
  if (!match) return null;
  const ticketKey = match[1].toUpperCase();
  // Reconstruct canonical URL up to /browse/TICKET
  const browseIdx = cleanUrl.toLowerCase().indexOf("/browse/");
  const canonicalUrl = cleanUrl.substring(0, browseIdx) + "/browse/" + ticketKey;
  return {
    ticketKey,
    project: getProject(ticketKey),
    url: canonicalUrl,
  };
}

/**
 * Build the bookmark title from ticket key, optional page title, and status.
 * Format: "[status] INFOSEC-101219 - [Rotate Secrets for]: golinks-dev ..."
 * @param {string} ticketKey
 * @param {string} pageTitle
 * @param {string | null} status - Jira ticket status for icon prefix
 * @returns {string}
 */
function buildTitle(ticketKey, pageTitle, status) {
  const prefix = status && STATUS_ICONS[status] ? STATUS_ICONS[status] : "";
  let title = ticketKey;
  if (pageTitle) {
    // Strip leading ticket key and surrounding brackets/dashes from page title
    let detail = pageTitle
      .replace(
        new RegExp(
          `^\\[?${ticketKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]?\\s*[-:]?\\s*`,
          "i",
        ),
        "",
      )
      .trim();
    // Also strip any remaining [PROJECT-NUMBER] bracket pattern (e.g. when ticketKey is just the number)
    detail = detail.replace(/^\[?[A-Z][A-Z0-9]+-\d+\]?\s*[-:]?\s*/i, "").trim();
    // Strip common Jira suffixes like "- Jira", "- LinkedIn JIRA", "- JIRA Service Management"
    detail = detail.replace(/\s*-\s*(?:[\w\s]*\s)?Jira\b.*$/i, "").trim();
    if (detail) title += ` - ${detail}`;
  }
  return prefix + title;
}

/**
 * Extract Jira ticket status from an existing bookmark title by checking for icon prefix.
 * @param {string} title
 * @returns {"in_progress" | "closed" | "not_started" | "blocked" | null}
 */
function extractStatusFromTitle(title) {
  if (!title) return null;
  if (title.startsWith("\uD83D\uDD35 ")) return "in_progress";
  if (title.startsWith("\u2705 ")) return "closed";
  if (title.startsWith("\u26AA ")) return "not_started";
  if (title.startsWith("\u274C ")) return "blocked";
  return null;
}

/**
 * Extract status-by-URL map from existing bookmarks in the old jira tickets subfolder.
 * Walks into project subfolders and the misc folder.
 * @param {chrome.bookmarks.BookmarkTreeNode[]} children - Children of the porter folder
 * @returns {Promise<Object<string, "in_progress" | "closed" | "not_started" | "blocked">>}
 */
async function extractStatusesFromOldBookmarks(children) {
  const statuses = {};
  const oldSubfolder = children.find((c) => !c.url && c.title === SUBFOLDER_NAME);
  if (!oldSubfolder) return statuses;

  const projectFolders = await chrome.bookmarks.getChildren(oldSubfolder.id);
  for (const folder of projectFolders) {
    if (folder.url) continue;
    const bookmarks = await chrome.bookmarks.getChildren(folder.id);
    for (const bm of bookmarks) {
      if (!bm.url) continue;
      const status = extractStatusFromTitle(bm.title);
      if (status) {
        statuses[bm.url] = status;
      }
    }
  }
  return statuses;
}

/**
 * Collect Jira tickets from browser history.
 * @returns {Promise<Map<string, object>>}
 */
async function getTicketsFromHistory() {
  const tickets = new Map();
  try {
    const [atlassianItems, jiraItems] = await Promise.all([
      chrome.history.search({ text: "atlassian.net/browse", maxResults: 10000, startTime: 0 }),
      chrome.history.search({ text: "jira", maxResults: 10000, startTime: 0 }),
    ]);
    const allItems = [...atlassianItems, ...jiraItems];
    for (const item of allItems) {
      const parsed = parseJiraTicket(item.url);
      if (!parsed) continue;
      const existing = tickets.get(parsed.ticketKey);
      // Keep the one with the most recent lastVisitTime
      const visitTime = item.lastVisitTime || 0;
      if (!existing || visitTime > (existing.visitTime || 0)) {
        tickets.set(parsed.ticketKey, {
          ...parsed,
          visitTime,
          pageTitle: item.title || existing?.pageTitle || "",
        });
      }
    }
  } catch (err) {
    console.error("[jiraTicketUtils] failed to search history:", err);
  }
  return tickets;
}

/**
 * Recursively walk all bookmarks and extract Jira ticket URLs.
 * Skips bookmarks inside the url-porter folder to avoid a feedback loop
 * where previously-built titles get re-parsed and accumulate dates.
 * @param {string} porterFolderId
 * @returns {Promise<Map<string, object>>}
 */
async function getTicketsFromBookmarks(porterFolderId) {
  const tickets = new Map();
  try {
    const tree = await chrome.bookmarks.getTree();
    function walk(nodes, insidePorter) {
      for (const node of nodes) {
        if (node.id === porterFolderId) {
          // Skip the entire url-porter folder to prevent feedback loop
          continue;
        }
        if (node.url && !insidePorter) {
          const parsed = parseJiraTicket(node.url);
          if (parsed) {
            const existing = tickets.get(parsed.ticketKey);
            const dateAdded = node.dateAdded || 0;
            if (!existing || dateAdded > (existing.visitTime || 0)) {
              tickets.set(parsed.ticketKey, {
                ...parsed,
                visitTime: dateAdded,
                pageTitle: node.title || existing?.pageTitle || "",
              });
            }
          }
        }
        if (node.children) {
          walk(node.children, insidePorter || node.id === porterFolderId);
        }
      }
    }
    walk(tree, false);
  } catch (err) {
    console.error("[jiraTicketUtils] failed to walk bookmarks:", err);
  }
  return tickets;
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
 * Reconcile the "jira tickets" folder with Jira URLs found in history and bookmarks.
 * Deletes the old folder entirely and rebuilds from scratch.
 * Deduplicates by ticket key, groups by project, placed after "figma mocks".
 * @returns {Promise<void>}
 */
export async function reconcileJiraTickets() {
  console.log("[jiraTicketUtils] reconcileJiraTickets: starting...");

  const folderName = await getBookmarkFolderName();
  const porterFolder = await findPorterFolder(folderName);
  if (!porterFolder) {
    console.log("[jiraTicketUtils] reconcileJiraTickets: url-porter folder not found, skipping");
    return;
  }

  // Gather tickets from history and bookmarks (skip url-porter folder to avoid feedback loop)
  const [historyTickets, bookmarkTickets] = await Promise.all([
    getTicketsFromHistory(),
    getTicketsFromBookmarks(porterFolder.id),
  ]);

  // Merge — bookmark data wins for date if present, but prefer history for page title
  const allTickets = new Map();
  for (const [key, val] of historyTickets) {
    allTickets.set(key, val);
  }
  for (const [key, val] of bookmarkTickets) {
    const existing = allTickets.get(key);
    if (existing) {
      // Keep richer page title, prefer bookmark dateAdded for date
      allTickets.set(key, {
        ...val,
        pageTitle: existing.pageTitle || val.pageTitle,
        visitTime: val.visitTime || existing.visitTime,
      });
    } else {
      allTickets.set(key, val);
    }
  }

  console.log(
    "[jiraTicketUtils] reconcileJiraTickets: found",
    allTickets.size,
    "unique tickets (history:",
    historyTickets.size,
    "bookmarks:",
    bookmarkTickets.size,
    ")",
  );

  if (allTickets.size === 0) return;

  // Extract statuses from old bookmarks before deleting
  const porterChildren = await chrome.bookmarks.getChildren(porterFolder.id);
  const oldBookmarkStatuses = await extractStatusesFromOldBookmarks(porterChildren);

  // Get stored statuses from content script reports
  const storedStatuses = await getJiraStatuses();

  // Group by project
  const byProject = new Map();
  for (const entry of allTickets.values()) {
    if (!byProject.has(entry.project)) {
      byProject.set(entry.project, []);
    }
    byProject.get(entry.project).push(entry);
  }

  // Sort projects alphabetically, within each project sort by ticket number descending (newest first)
  const sortedProjects = [...byProject.keys()].sort((a, b) => a.localeCompare(b));

  // Split into real project folders vs misc using the same org threshold
  const orgThreshold = await getGithubOrgThreshold();
  const realProjects = [];
  const miscTickets = [];
  for (const project of sortedProjects) {
    if (byProject.get(project).length >= orgThreshold) {
      realProjects.push(project);
    } else {
      miscTickets.push(...byProject.get(project));
    }
  }

  let added = 0;
  await rebuildManagedSubfolder({
    parentId: porterFolder.id,
    title: SUBFOLDER_NAME,
    // Place after "figma mocks" (or after "github repos" if no figma, or index 2)
    resolveIndex: (children) => {
      const figmaFolder = children.find((c) => !c.url && c.title === "figma mocks");
      const githubFolder = children.find((c) => !c.url && c.title === "github repos");
      if (figmaFolder) return children.indexOf(figmaFolder) + 1;
      if (githubFolder) return children.indexOf(githubFolder) + 1;
      return 2;
    },
    populate: async (folderId) => {
      for (const project of realProjects) {
        const projectFolder = await chrome.bookmarks.create({
          parentId: folderId,
          title: project,
        });
        const tickets = byProject.get(project).sort((a, b) => {
          const numA = parseInt(a.ticketKey.split("-")[1], 10);
          const numB = parseInt(b.ticketKey.split("-")[1], 10);
          return numB - numA;
        });
        for (const entry of tickets) {
          const status = storedStatuses[entry.url] || oldBookmarkStatuses[entry.url] || null;
          // Inside a project folder, drop the project prefix (e.g. "96899" instead of "DEPEND-96899")
          const ticketNumber = entry.ticketKey.split("-")[1];
          const title = sanitizeBookmarkTitle(buildTitle(ticketNumber, entry.pageTitle, status));
          await chrome.bookmarks.create({ parentId: projectFolder.id, title, url: entry.url });
          added++;
        }
      }

      // Misc folder for projects with few tickets
      if (miscTickets.length > 0) {
        miscTickets.sort(
          (a, b) =>
            a.project.localeCompare(b.project) ||
            // Numeric, matching the project-folder sort above. localeCompare is
            // lexicographic, which ordered "ABC-9" ahead of "ABC-10".
            parseInt(b.ticketKey.split("-")[1], 10) - parseInt(a.ticketKey.split("-")[1], 10),
        );
        const miscFolder = await chrome.bookmarks.create({ parentId: folderId, title: "misc" });
        for (const entry of miscTickets) {
          const status = storedStatuses[entry.url] || oldBookmarkStatuses[entry.url] || null;
          const title = sanitizeBookmarkTitle(buildTitle(entry.ticketKey, entry.pageTitle, status));
          await chrome.bookmarks.create({ parentId: miscFolder.id, title, url: entry.url });
          added++;
        }
      }
    },
  });

  console.log(
    "[jiraTicketUtils] reconcileJiraTickets: done. added:",
    added,
    "across",
    sortedProjects.length,
    "projects",
  );
}
