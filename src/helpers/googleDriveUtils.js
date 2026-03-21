/**
 * Google Drive bookmark utilities.
 *
 * Scans browser history and all bookmarks for Google Drive/Docs/Sheets/Slides URLs,
 * deduplicates by document ID, and maintains a "google drive" folder under
 * the url-porter bookmark folder. Sorted by most recently visited.
 *
 * Supported URL formats:
 *   https://docs.google.com/document/d/{id}/edit
 *   https://docs.google.com/spreadsheets/d/{id}/edit
 *   https://docs.google.com/presentation/d/{id}/edit
 *   https://docs.google.com/forms/d/{id}/edit
 *   https://drive.google.com/file/d/{id}/view
 *   https://drive.google.com/open?id={id}
 */

import { getBookmarkFolderName } from "./storage.js";
import { sanitizeBookmarkTitle } from "./configUtils.js";

const DOCS_REGEX = /^https?:\/\/docs\.google\.com\/(document|spreadsheets|presentation|forms)\/d\/([^/?#]+)/;
const DRIVE_FILE_REGEX = /^https?:\/\/drive\.google\.com\/file\/d\/([^/?#]+)/;
const DRIVE_OPEN_REGEX = /^https?:\/\/drive\.google\.com\/open\?id=([^&#]+)/;
const SUBFOLDER_NAME = "google drive";

/**
 * Parse a Google Drive/Docs URL into { docId, url, type } or null.
 * Strips query strings, hash fragments, and trailing slashes.
 * @param {string} url
 * @returns {{docId: string, url: string, type: string} | null}
 */
function parseGoogleDriveUrl(url) {
  if (!url) return null;

  // docs.google.com/document|spreadsheets|presentation|forms/d/{id}
  const docsMatch = url.match(DOCS_REGEX);
  if (docsMatch) {
    const type = docsMatch[1];
    const docId = docsMatch[2];
    return {
      docId,
      url: `https://docs.google.com/${type}/d/${docId}/edit`,
      type,
    };
  }

  // drive.google.com/file/d/{id}
  const driveFileMatch = url.match(DRIVE_FILE_REGEX);
  if (driveFileMatch) {
    const docId = driveFileMatch[1];
    return {
      docId,
      url: `https://drive.google.com/file/d/${docId}/view`,
      type: "file",
    };
  }

  // drive.google.com/open?id={id}
  const driveOpenMatch = url.match(DRIVE_OPEN_REGEX);
  if (driveOpenMatch) {
    const docId = driveOpenMatch[1];
    return {
      docId,
      url: `https://drive.google.com/file/d/${docId}/view`,
      type: "file",
    };
  }

  return null;
}

/**
 * Clean up a page title for use as a bookmark title.
 * Strips common suffixes like "- Google Docs", "- Google Sheets", etc.
 * @param {string} pageTitle
 * @returns {string}
 */
function cleanTitle(pageTitle) {
  if (!pageTitle) return "";
  return pageTitle.replace(/\s*-\s*Google (Docs|Sheets|Slides|Forms|Drive).*$/i, "").trim();
}

/**
 * Collect Google Drive URLs from browser history.
 * @returns {Promise<Map<string, object>>}
 */
async function getDocsFromHistory() {
  const docs = new Map();
  try {
    const [docsItems, driveItems] = await Promise.all([
      chrome.history.search({ text: "docs.google.com", maxResults: 10000, startTime: 0 }),
      chrome.history.search({ text: "drive.google.com", maxResults: 10000, startTime: 0 }),
    ]);
    for (const item of [...docsItems, ...driveItems]) {
      const parsed = parseGoogleDriveUrl(item.url);
      if (!parsed) continue;
      const existing = docs.get(parsed.docId);
      const visitTime = item.lastVisitTime || 0;
      if (!existing || visitTime > existing.visitTime) {
        docs.set(parsed.docId, {
          ...parsed,
          visitTime,
          title: cleanTitle(item.title) || existing?.title || "",
        });
      }
    }
  } catch (err) {
    console.error("[googleDriveUtils] failed to search history:", err);
  }
  return docs;
}

/**
 * Recursively walk all bookmarks and extract Google Drive URLs.
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
          const parsed = parseGoogleDriveUrl(node.url);
          if (parsed) {
            const existing = docs.get(parsed.docId);
            const dateAdded = node.dateAdded || 0;
            if (!existing || dateAdded > existing.visitTime) {
              docs.set(parsed.docId, {
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
    console.error("[googleDriveUtils] failed to walk bookmarks:", err);
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
 * Reconcile the "google drive" folder. Sorted by most recently visited (newest first).
 * @returns {Promise<void>}
 */
export async function reconcileGoogleDrive() {
  console.log("[googleDriveUtils] reconcileGoogleDrive: starting...");

  const folderName = await getBookmarkFolderName();
  const porterFolder = await findPorterFolder(folderName);
  if (!porterFolder) {
    console.log("[googleDriveUtils] reconcileGoogleDrive: url-porter folder not found, skipping");
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
    "[googleDriveUtils] reconcileGoogleDrive: found",
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
    console.log("[googleDriveUtils] reconcileGoogleDrive: deleted old folder");
  }

  // Place after "jira tickets"
  const updatedChildren = await chrome.bookmarks.getChildren(porterFolder.id);
  const jiraFolder = updatedChildren.find((c) => !c.url && c.title === "jira tickets");
  const figmaFolder = updatedChildren.find((c) => !c.url && c.title === "figma mocks");
  const githubFolder = updatedChildren.find((c) => !c.url && c.title === "github repos");
  let insertIndex;
  if (jiraFolder) {
    insertIndex = updatedChildren.indexOf(jiraFolder) + 1;
  } else if (figmaFolder) {
    insertIndex = updatedChildren.indexOf(figmaFolder) + 1;
  } else if (githubFolder) {
    insertIndex = updatedChildren.indexOf(githubFolder) + 1;
  } else {
    insertIndex = 3;
  }

  const subfolder = await chrome.bookmarks.create({ parentId: porterFolder.id, title: SUBFOLDER_NAME, index: insertIndex });

  // Sort by most recently visited (newest first)
  const sorted = [...allDocs.values()].sort((a, b) => (b.visitTime || 0) - (a.visitTime || 0));

  let added = 0;
  for (const entry of sorted) {
    const title = sanitizeBookmarkTitle(entry.title || entry.docId);
    await chrome.bookmarks.create({ parentId: subfolder.id, title, url: entry.url });
    added++;
  }

  console.log("[googleDriveUtils] reconcileGoogleDrive: done. added:", added, "docs");
}
