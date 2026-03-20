/**
 * OneDrive / SharePoint bookmark utilities.
 *
 * Scans browser history and all bookmarks for OneDrive and SharePoint document URLs,
 * deduplicates, and maintains a "onedrive" folder under the url-porter bookmark folder.
 * Sorted by most recently visited.
 *
 * Supported URL formats:
 *   https://onedrive.live.com/edit.aspx?resid=...
 *   https://*.sharepoint.com/:w:/...  (Word)
 *   https://*.sharepoint.com/:x:/...  (Excel)
 *   https://*.sharepoint.com/:p:/...  (PowerPoint)
 *   https://*.sharepoint.com/:o:/...  (OneNote)
 *   https://*.sharepoint.com/:b:/...  (PDF)
 *   https://*.sharepoint.com/.../_layouts/15/Doc.aspx?sourcedoc=...
 *   https://*-my.sharepoint.com/personal/...
 */

import { getBookmarkFolderName } from "./storage.js";
import { sanitizeBookmarkTitle } from "./configUtils.js";

const SUBFOLDER_NAME = "onedrive";

// SharePoint sharing links: https://xxx.sharepoint.com/:w:/g/personal/.../{id}
const SP_SHARE_REGEX = /^https?:\/\/[^/]*\.sharepoint\.com\/:[a-z]:\/[^?#]+/;
// SharePoint Doc.aspx with sourcedoc param
const SP_DOC_REGEX = /^https?:\/\/[^/]*\.sharepoint\.com\/[^?#]*\/_layouts\/15\/Doc\.aspx/;
// SharePoint general document URLs (Word, Excel, etc in personal or site paths)
const SP_GENERAL_REGEX = /^https?:\/\/[^/]*\.sharepoint\.com\/[^?#]*\.(aspx|docx|xlsx|pptx|pdf)/i;
// OneDrive live
const ONEDRIVE_LIVE_REGEX = /^https?:\/\/onedrive\.live\.com\//;
// OneDrive personal hosted on sharepoint
const ONEDRIVE_PERSONAL_REGEX = /^https?:\/\/[^/]*-my\.sharepoint\.com\/personal\//;

/**
 * Parse a OneDrive/SharePoint URL into { dedupeKey, url } or null.
 * Strips query strings, hash fragments, and trailing slashes for the canonical URL.
 * @param {string} rawUrl
 * @returns {{dedupeKey: string, url: string} | null}
 */
function parseOnedriveUrl(rawUrl) {
  if (!rawUrl) return null;

  // SharePoint sharing link (:w:, :x:, :p:, etc.)
  const spShareMatch = rawUrl.match(SP_SHARE_REGEX);
  if (spShareMatch) {
    const cleanUrl = rawUrl.split("?")[0].split("#")[0].replace(/\/+$/, "");
    return { dedupeKey: cleanUrl.toLowerCase(), url: cleanUrl };
  }

  // SharePoint Doc.aspx — keep sourcedoc param as dedupe key
  if (SP_DOC_REGEX.test(rawUrl)) {
    const urlObj = new URL(rawUrl);
    const sourcedoc = urlObj.searchParams.get("sourcedoc");
    if (sourcedoc) {
      const base = rawUrl.split("?")[0].replace(/\/+$/, "");
      const canonical = `${base}?sourcedoc=${sourcedoc}`;
      return { dedupeKey: sourcedoc.toLowerCase(), url: canonical };
    }
    const cleanUrl = rawUrl.split("?")[0].split("#")[0].replace(/\/+$/, "");
    return { dedupeKey: cleanUrl.toLowerCase(), url: cleanUrl };
  }

  // OneDrive live
  if (ONEDRIVE_LIVE_REGEX.test(rawUrl)) {
    try {
      const urlObj = new URL(rawUrl);
      const resid = urlObj.searchParams.get("resid") || urlObj.searchParams.get("id");
      if (resid) {
        const base = rawUrl.split("?")[0].replace(/\/+$/, "");
        const canonical = `${base}?resid=${resid}`;
        return { dedupeKey: resid.toLowerCase(), url: canonical };
      }
    } catch {}
    const cleanUrl = rawUrl.split("?")[0].split("#")[0].replace(/\/+$/, "");
    return { dedupeKey: cleanUrl.toLowerCase(), url: cleanUrl };
  }

  // OneDrive personal on sharepoint
  if (ONEDRIVE_PERSONAL_REGEX.test(rawUrl)) {
    const cleanUrl = rawUrl.split("?")[0].split("#")[0].replace(/\/+$/, "");
    return { dedupeKey: cleanUrl.toLowerCase(), url: cleanUrl };
  }

  // General sharepoint document files
  if (SP_GENERAL_REGEX.test(rawUrl)) {
    const cleanUrl = rawUrl.split("?")[0].split("#")[0].replace(/\/+$/, "");
    return { dedupeKey: cleanUrl.toLowerCase(), url: cleanUrl };
  }

  return null;
}

/**
 * Clean up a page title for use as a bookmark title.
 * Strips common suffixes like "- OneDrive", "- SharePoint", etc.
 * @param {string} pageTitle
 * @returns {string}
 */
function cleanTitle(pageTitle) {
  if (!pageTitle) return "";
  return pageTitle
    .replace(/\s*-\s*(OneDrive|SharePoint|Microsoft\s+\w+).*$/i, "")
    .replace(/\.docx$|\.xlsx$|\.pptx$|\.pdf$/i, "")
    .trim();
}

/**
 * Collect OneDrive/SharePoint URLs from browser history.
 * @returns {Promise<Map<string, object>>}
 */
async function getDocsFromHistory() {
  const docs = new Map();
  try {
    const [onedriveItems, sharepointItems] = await Promise.all([
      chrome.history.search({ text: "onedrive.live.com", maxResults: 10000, startTime: 0 }),
      chrome.history.search({ text: "sharepoint.com", maxResults: 10000, startTime: 0 }),
    ]);
    for (const item of [...onedriveItems, ...sharepointItems]) {
      const parsed = parseOnedriveUrl(item.url);
      if (!parsed) continue;
      const existing = docs.get(parsed.dedupeKey);
      const visitTime = item.lastVisitTime || 0;
      if (!existing || visitTime > existing.visitTime) {
        docs.set(parsed.dedupeKey, {
          ...parsed,
          visitTime,
          title: cleanTitle(item.title) || existing?.title || "",
        });
      }
    }
  } catch (err) {
    console.error("[onedriveUtils] failed to search history:", err);
  }
  return docs;
}

/**
 * Recursively walk all bookmarks and extract OneDrive/SharePoint URLs.
 * Skips bookmarks inside the url-porter folder to avoid feedback loops.
 * @param {string} porterFolderId
 * @returns {Promise<Map<string, object>>}
 */
async function getDocsFromBookmarks(porterFolderId) {
  const docs = new Map();
  try {
    const tree = await chrome.bookmarks.getTree();
    function walk(nodes) {
      for (const node of nodes) {
        if (node.id === porterFolderId) continue;
        if (node.url) {
          const parsed = parseOnedriveUrl(node.url);
          if (parsed) {
            const existing = docs.get(parsed.dedupeKey);
            const dateAdded = node.dateAdded || 0;
            if (!existing || dateAdded > existing.visitTime) {
              docs.set(parsed.dedupeKey, {
                ...parsed,
                visitTime: dateAdded,
                title: cleanTitle(node.title) || existing?.title || "",
              });
            }
          }
        }
        if (node.children) walk(node.children);
      }
    }
    walk(tree);
  } catch (err) {
    console.error("[onedriveUtils] failed to walk bookmarks:", err);
  }
  return docs;
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
 * Reconcile the "onedrive" folder. Sorted by most recently visited (newest first).
 * Placed right after "google drive".
 */
export async function reconcileOnedrive() {
  console.log("[onedriveUtils] reconcileOnedrive: starting...");

  const folderName = await getBookmarkFolderName();
  const porterFolder = await findPorterFolder(folderName);
  if (!porterFolder) {
    console.log("[onedriveUtils] reconcileOnedrive: url-porter folder not found, skipping");
    return;
  }

  const [historyDocs, bookmarkDocs] = await Promise.all([getDocsFromHistory(), getDocsFromBookmarks(porterFolder.id)]);

  // Merge — history wins for visitTime, prefer richer title
  const allDocs = new Map();
  for (const [key, val] of historyDocs) {
    allDocs.set(key, val);
  }
  for (const [key, val] of bookmarkDocs) {
    const existing = allDocs.get(key);
    if (existing) {
      allDocs.set(key, {
        ...existing,
        title: existing.title || val.title,
        visitTime: Math.max(existing.visitTime || 0, val.visitTime || 0),
      });
    } else {
      allDocs.set(key, val);
    }
  }

  console.log(
    "[onedriveUtils] reconcileOnedrive: found",
    allDocs.size,
    "unique docs (history:",
    historyDocs.size,
    "bookmarks:",
    bookmarkDocs.size,
    ")",
  );

  if (allDocs.size === 0) return;

  // Delete old folder
  const porterChildren = await chrome.bookmarks.getChildren(porterFolder.id);
  const oldSubfolder = porterChildren.find((c) => !c.url && c.title === SUBFOLDER_NAME);
  if (oldSubfolder) {
    await chrome.bookmarks.removeTree(oldSubfolder.id);
    console.log("[onedriveUtils] reconcileOnedrive: deleted old folder");
  }

  // Place after "google drive"
  const updatedChildren = await chrome.bookmarks.getChildren(porterFolder.id);
  const googleDriveFolder = updatedChildren.find((c) => !c.url && c.title === "google drive");
  const jiraFolder = updatedChildren.find((c) => !c.url && c.title === "jira tickets");
  const figmaFolder = updatedChildren.find((c) => !c.url && c.title === "figma mocks");
  const githubFolder = updatedChildren.find((c) => !c.url && c.title === "github repos");
  let insertIndex;
  if (googleDriveFolder) {
    insertIndex = updatedChildren.indexOf(googleDriveFolder) + 1;
  } else if (jiraFolder) {
    insertIndex = updatedChildren.indexOf(jiraFolder) + 1;
  } else if (figmaFolder) {
    insertIndex = updatedChildren.indexOf(figmaFolder) + 1;
  } else if (githubFolder) {
    insertIndex = updatedChildren.indexOf(githubFolder) + 1;
  } else {
    insertIndex = 4;
  }

  const subfolder = await chrome.bookmarks.create({ parentId: porterFolder.id, title: SUBFOLDER_NAME, index: insertIndex });

  // Sort by most recently visited (newest first)
  const sorted = [...allDocs.values()].sort((a, b) => (b.visitTime || 0) - (a.visitTime || 0));

  let added = 0;
  for (const entry of sorted) {
    const title = sanitizeBookmarkTitle(entry.title || entry.dedupeKey);
    await chrome.bookmarks.create({ parentId: subfolder.id, title, url: entry.url });
    added++;
  }

  console.log("[onedriveUtils] reconcileOnedrive: done. added:", added, "docs");
}
