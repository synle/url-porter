/**
 * Content script for Azure DevOps pull request pages.
 *
 * Detects the PR status (completed, abandoned, or active) from the page DOM
 * and sends it to the background script for storage.
 */
const TAG = "[url-porter:pr-status-azure]";

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
    if (text.includes("completed")) return "merged";
    if (text.includes("abandoned")) return "closed";
    if (text.includes("active")) return "open";
  }

  // Fallback: broader text search in the header area
  const header = document.querySelector(".page-content, .repos-pr-header, .bolt-header");
  if (header) {
    const text = header.textContent.toLowerCase();
    if (text.includes("completed")) return "merged";
    if (text.includes("abandoned")) return "closed";
  }

  return null;
}

/**
 * Send the detected PR status to the background script.
 */
function reportStatus() {
  const status = detectStatus();
  if (!status) return;

  const url = window.location.href.split("?")[0].split("#")[0].replace(/\/+$/, "");
  const match =
    url.match(/^(https?:\/\/[^/]+\.visualstudio\.com\/[^/]+\/_git\/[^/]+\/pullrequest\/\d+)/) ||
    url.match(/^(https?:\/\/dev\.azure\.com\/[^/]+\/[^/]+\/_git\/[^/]+\/pullrequest\/\d+)/);
  if (!match) return;

  const canonicalUrl = match[1];
  console.log(TAG, "detected status:", status, "for", canonicalUrl);

  chrome.runtime.sendMessage({
    type: "Myevent.prStatus",
    url: canonicalUrl,
    status,
  });
}

// Run after page load with delay for SPA rendering
setTimeout(reportStatus, 2000);

// Observe for SPA navigation
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    setTimeout(reportStatus, 2000);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

console.log(TAG, "content script loaded");
