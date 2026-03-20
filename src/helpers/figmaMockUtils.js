/**
 * Figma mock bookmark utilities.
 *
 * Scans browser history and all bookmarks for Figma design/mock URLs,
 * extracts the file name, deduplicates, and maintains a "figma mocks"
 * folder under the url-porter bookmark folder.
 *
 * Supported URL formats:
 *   https://www.figma.com/design/ABC123/My-Mock-Name?node-id=...
 *   https://www.figma.com/file/ABC123/My-Mock-Name
 *   https://www.figma.com/proto/ABC123/My-Mock-Name
 *   https://www.figma.com/board/ABC123/My-Mock-Name
 *
 * Ignored:
 *   https://cream-stone-68528668.figma.site/ (figma.site top-level)
 *   https://www.figma.com/ (homepage, no file)
 */

import { getBookmarkFolderName } from "./storage.js";
import { sanitizeBookmarkTitle } from "./configUtils.js";

const FIGMA_MOCK_REGEX = /^https?:\/\/(?:www\.)?figma\.com\/(design|file|proto|board)\/([^/?#]+)\/([^/?#]+)/;
const SUBFOLDER_NAME = "figma mocks";

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
 * Parse a Figma URL into { title, url } or null.
 * Strips query strings, hash fragments, and trailing slashes.
 * Ignores figma.site URLs entirely.
 * @param {string} url
 * @returns {{title: string, url: string, dedupeKey: string} | null}
 */
function parseFigmaMock(url) {
  if (!url) return null;
  if (/\.figma\.site/i.test(url)) return null;
  const cleanUrl = url.split("?")[0].split("#")[0].replace(/\/+$/, "");
  const match = cleanUrl.match(FIGMA_MOCK_REGEX);
  if (!match) return null;
  const type = match[1];
  const fileId = match[2];
  const slug = match[3];
  const title = toTitleCase(decodeURIComponent(slug));
  const canonicalUrl = `https://www.figma.com/${type}/${fileId}/${slug}`;
  return {
    title,
    url: canonicalUrl,
    dedupeKey: fileId.toLowerCase(),
  };
}

/**
 * Collect Figma URLs from browser history.
 * @returns {Promise<Map<string, object>>}
 */
async function getFigmaFromHistory() {
  const mocks = new Map();
  try {
    const items = await chrome.history.search({ text: "figma.com", maxResults: 10000, startTime: 0 });
    for (const item of items) {
      const parsed = parseFigmaMock(item.url);
      if (parsed) {
        mocks.set(parsed.dedupeKey, parsed);
      }
    }
  } catch (err) {
    console.error("[figmaMockUtils] failed to search history:", err);
  }
  return mocks;
}

/**
 * Recursively walk all bookmarks and extract Figma URLs.
 * Skips bookmarks inside the url-porter folder to avoid feedback loops.
 * @param {string} porterFolderId
 * @returns {Promise<Map<string, object>>}
 */
async function getFigmaFromBookmarks(porterFolderId) {
  const mocks = new Map();
  try {
    const tree = await chrome.bookmarks.getTree();
    function walk(nodes) {
      for (const node of nodes) {
        if (node.id === porterFolderId) continue;
        if (node.url) {
          const parsed = parseFigmaMock(node.url);
          if (parsed) {
            mocks.set(parsed.dedupeKey, parsed);
          }
        }
        if (node.children) {
          walk(node.children);
        }
      }
    }
    walk(tree);
  } catch (err) {
    console.error("[figmaMockUtils] failed to walk bookmarks:", err);
  }
  return mocks;
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
 * Reconcile the "figma mocks" folder with Figma URLs found in history and bookmarks.
 * Deletes the old folder entirely and rebuilds from scratch.
 * Deduplicates by file ID, sorts by title, placed right after "github repos".
 */
export async function reconcileFigmaMocks() {
  console.log("[figmaMockUtils] reconcileFigmaMocks: starting...");

  const folderName = await getBookmarkFolderName();
  const porterFolder = await findPorterFolder(folderName);
  if (!porterFolder) {
    console.log("[figmaMockUtils] reconcileFigmaMocks: url-porter folder not found, skipping");
    return;
  }

  // Gather mocks from history and bookmarks
  const [historyMocks, bookmarkMocks] = await Promise.all([getFigmaFromHistory(), getFigmaFromBookmarks(porterFolder.id)]);

  // Merge (dedup by file ID)
  const allMocks = new Map([...historyMocks, ...bookmarkMocks]);
  console.log(
    "[figmaMockUtils] reconcileFigmaMocks: found",
    allMocks.size,
    "unique mocks (history:",
    historyMocks.size,
    "bookmarks:",
    bookmarkMocks.size,
    ")",
  );

  if (allMocks.size === 0) return;

  // Delete the old "figma mocks" folder if it exists
  const porterChildren = await chrome.bookmarks.getChildren(porterFolder.id);
  const oldSubfolder = porterChildren.find((c) => !c.url && c.title === SUBFOLDER_NAME);
  if (oldSubfolder) {
    await chrome.bookmarks.removeTree(oldSubfolder.id);
    console.log("[figmaMockUtils] reconcileFigmaMocks: deleted old folder");
  }

  // Find the "github repos" folder index so we can place right after it
  const updatedChildren = await chrome.bookmarks.getChildren(porterFolder.id);
  const githubFolder = updatedChildren.find((c) => !c.url && c.title === "github repos");
  const insertIndex = githubFolder ? updatedChildren.indexOf(githubFolder) + 1 : 1;

  const subfolder = await chrome.bookmarks.create({ parentId: porterFolder.id, title: SUBFOLDER_NAME, index: insertIndex });

  // Sort all mocks by title (case-insensitive)
  const sortedMocks = [...allMocks.values()].sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));

  // Create bookmarks
  let added = 0;
  for (const { title: rawTitle, url } of sortedMocks) {
    const title = sanitizeBookmarkTitle(rawTitle);
    await chrome.bookmarks.create({ parentId: subfolder.id, title, url });
    added++;
  }

  console.log("[figmaMockUtils] reconcileFigmaMocks: done. added:", added, "mocks");
}
