/**
 * Content script for GitHub pull request pages.
 *
 * Detects the PR status (merged, closed, or open) from the page DOM
 * and sends it to the background script for storage.
 */
const TAG = "[url-porter:pr-status-github]";

/**
 * Detect the PR status from the GitHub page DOM.
 * @returns {"merged" | "closed" | "open" | null}
 */
function detectStatus() {
  // GitHub renders a status badge with class "State" or inside .gh-header-meta
  // The badge text is "Merged", "Closed", or "Open"
  const stateLabel = document.querySelector(
    ".gh-header-meta .State, #partial-discussion-header .State, [title='Status: Merged'], [title='Status: Closed'], [title='Status: Open']",
  );
  if (stateLabel) {
    const text = stateLabel.textContent.trim().toLowerCase();
    if (text.includes("merged")) return "merged";
    if (text.includes("closed")) return "closed";
    if (text.includes("open")) return "open";
  }

  // Fallback: look for the status icon SVGs GitHub uses
  const mergedIcon = document.querySelector(".octicon-git-merge");
  if (mergedIcon) return "merged";

  const closedIcon = document.querySelector(".octicon-git-pull-request-closed");
  if (closedIcon) return "closed";

  const openIcon = document.querySelector(".octicon-git-pull-request");
  if (openIcon && !document.querySelector(".octicon-git-merge, .octicon-git-pull-request-closed"))
    return "open";

  return null;
}

/**
 * Check if the current page is a GitHub error page (IP block, 500 unicorn, etc.).
 * @returns {boolean}
 */
function isGitHubErrorPage() {
  const body = document.body ? document.body.textContent : "";
  return (
    body.includes("Access forbidden") ||
    body.includes("is not permitted to access this resource") ||
    body.includes("This is not the web page you are looking for") ||
    body.includes("Unicorn!") ||
    document.querySelector("img[alt='Unicorn']") !== null
  );
}

/**
 * Send the detected PR status to the background script.
 * @returns {void}
 */
function reportStatus() {
  if (isNetworkError()) {
    console.log(TAG, "network error detected, skipping");
    return;
  }
  if (isGitHubErrorPage()) {
    attemptErrorReload("url-porter-github-reload-count", TAG);
    return;
  }

  const status = detectStatus();
  if (!status) return;

  const url = window.location.href.split("?")[0].split("#")[0].replace(/\/+$/, "");
  // Normalize to canonical PR URL (strip /files, /commits, etc.)
  // Supports github.com, *.githubprivate.com, and *.ghe.com (GitHub Enterprise)
  const match = url.match(
    /^(https?:\/\/(?:github\.com|[^/]+\.githubprivate\.com|[^/]+\.ghe\.com)\/[^/]+\/[^/]+\/pull\/\d+)/,
  );
  if (!match) return;

  const canonicalUrl = match[1];
  console.log(TAG, "detected status:", status, "for", canonicalUrl);

  chrome.runtime.sendMessage({
    type: "Myevent.prStatus",
    url: canonicalUrl,
    status,
  });
}

// Run after page load, with a delay to let GitHub's SPA render.
// Random jitter (2-5s) prevents 20+ tabs from all reporting at once.
setTimeout(reportStatus, 2000 + Math.random() * 3000);

// Also observe for SPA navigation (GitHub uses turbo/pjax)
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    setTimeout(reportStatus, 2000);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

console.log(TAG, "content script loaded");
