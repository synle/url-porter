/**
 * Content script for https://synle.github.io/fav/
 *
 * Fetches all bookmarks from nested subfolders of the url-porter folder
 * (prs, github repos, figma mocks, etc.) and dispatches a CustomEvent
 * called "urlPorterBookmarks" on the document with a flat array of { url, title }.
 */
const TAG = "[url-porter:fav]";

/** Fetch nested bookmarks from the extension and dispatch them as a CustomEvent. */
async function init() {
  try {
    const bookmarks = await chrome.runtime.sendMessage({ type: "Myevent.getBookmarks" });
    console.log(TAG, "dispatching urlPorterBookmarks with", bookmarks.length, "items");
    document.dispatchEvent(
      new CustomEvent("urlPorterBookmarks", {
        detail: bookmarks,
      }),
    );
  } catch (err) {
    console.error(TAG, "failed to fetch bookmarks:", err);
  }
}

console.log(TAG, "content script loaded");
init();
