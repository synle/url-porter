/**
 * Content script for Azure DevOps pull request pages.
 *
 * Detects the PR status (completed, abandoned, or active) from the page DOM
 * and sends it to the background script for storage.
 */
const TAG = "[url-porter:pr-status-azure]";

/**
 * Whole-word status matchers. Plain `includes()` is not safe here because the
 * selector below is deliberately broad — `"inactive".includes("active")` is
 * true, which would report an abandoned or draft PR as open.
 */
const COMPLETED_RE = /\bcompleted\b/;
const ABANDONED_RE = /\babandoned\b/;
const ACTIVE_RE = /\bactive\b/;

/**
 * Detect the PR status from the Azure DevOps page DOM.
 * @returns {"merged" | "closed" | "open" | null}
 */
function detectStatus() {
  // Azure DevOps shows status badges/pills with text like "Completed", "Abandoned", "Active"
  const statusElements = document.querySelectorAll(
    ".repos-pr-header-vote-status, .bolt-pill, .status-indicator, .vc-pullrequest-rollupstatus, [class*='status']",
  );
  for (const el of statusElements) {
    const text = el.textContent.trim().toLowerCase();
    if (COMPLETED_RE.test(text)) return "merged";
    if (ABANDONED_RE.test(text)) return "closed";
    if (ACTIVE_RE.test(text)) return "open";
  }

  // Fallback: broader text search in the header area
  const header = document.querySelector(".page-content, .repos-pr-header, .bolt-header");
  if (header) {
    const text = header.textContent.toLowerCase();
    if (COMPLETED_RE.test(text)) return "merged";
    if (ABANDONED_RE.test(text)) return "closed";
  }

  return null;
}

/**
 * Check if the current page is an Azure DevOps error page.
 * @returns {boolean}
 */
function isAzureErrorPage() {
  // Lowercase the haystack — the page renders "Something went wrong", so a
  // lowercase needle against raw textContent never matched.
  const body = document.body ? document.body.textContent.toLowerCase() : "";
  return (
    body.includes("azure devops services unavailable") || body.includes("something went wrong")
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
  if (isAzureErrorPage()) {
    attemptErrorReload("url-porter-azure-reload-count", TAG);
    return;
  }

  const status = detectStatus();
  if (!status) return;

  const url = window.location.href.split("?")[0].split("#")[0].replace(/\/+$/, "");
  const match =
    url.match(/^(https?:\/\/[^/]+\.visualstudio\.com\/[^/]+\/_git\/[^/]+\/pullrequest\/\d+)/) ||
    url.match(/^(https?:\/\/dev\.azure\.com\/[^/]+\/[^/]+\/_git\/[^/]+\/pullrequest\/\d+)/);
  if (!match) return;

  const canonicalUrl = match[1];
  console.log(TAG, "detected status:", status, "for", canonicalUrl);

  sendToBackground(
    {
      type: "Myevent.prStatus",
      url: canonicalUrl,
      status,
    },
    TAG,
  );
}

// Run after page load with delay for SPA rendering.
// Random jitter (2-5s) prevents 20+ tabs from all reporting at once.
setTimeout(reportStatus, 2000 + Math.random() * 3000);

// Observe for SPA navigation
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  // An orphaned script (extension reloaded/updated) would otherwise keep this
  // observer running for the life of the tab, on every DOM mutation.
  if (!isExtensionContextValid()) {
    observer.disconnect();
    return;
  }
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    setTimeout(reportStatus, 2000);
  }
});
if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
}

console.log(TAG, "content script loaded");
