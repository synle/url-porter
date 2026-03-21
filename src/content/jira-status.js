/**
 * Content script for Jira ticket pages.
 *
 * Detects the ticket status (in progress, closed, not started, blocked)
 * from the page DOM and sends it to the background script for storage.
 *
 * Supports Atlassian Cloud (*.atlassian.net) and Jira Server (jira* hosts).
 */
const TAG = "[url-porter:jira-status]";

/**
 * Detect the ticket status from the Jira page DOM.
 * @returns {"in_progress" | "closed" | "not_started" | "blocked" | null}
 */
function detectStatus() {
  // Gather status text from known Jira UI elements
  const candidates = [];

  // Atlassian Cloud: status button/lozenge
  const cloudStatus = document.querySelector(
    '[data-testid="issue.views.issue-base.foundation.status.status-field-wrapper"] button, [data-testid="issue.fields.status.common.ui.status-lozenge"] span',
  );
  if (cloudStatus) candidates.push(cloudStatus.textContent.trim().toLowerCase());

  // Jira Server / Data Center
  const serverStatus = document.querySelector("#status-val, #status-val .jira-issue-status-lozenge");
  if (serverStatus) candidates.push(serverStatus.textContent.trim().toLowerCase());

  // Generic lozenge fallback (works across versions)
  const lozenges = document.querySelectorAll(".jira-issue-status-lozenge, .status-lozenge, .ghx-label, [class*='StatusLozenge']");
  for (const el of lozenges) {
    candidates.push(el.textContent.trim().toLowerCase());
  }

  // Also check the page title for status hints
  const titleEl = document.querySelector("title");
  if (titleEl) candidates.push(titleEl.textContent.trim().toLowerCase());

  for (const text of candidates) {
    if (!text) continue;

    // Blocked
    if (text.includes("blocked") || text.includes("impediment")) return "blocked";

    // Closed / Done / Resolved / Won't Fix / Won't Do
    if (
      text === "done" ||
      text === "closed" ||
      text === "resolved" ||
      text === "completed" ||
      text.includes("won't fix") ||
      text.includes("wont fix") ||
      text.includes("won't do") ||
      text.includes("wont do") ||
      text.includes("cancelled") ||
      text.includes("canceled") ||
      text.includes("declined") ||
      text.includes("duplicate") ||
      text.includes("dev complete") ||
      text.includes("complete") ||
      text === "fixed" ||
      text.includes("verified") ||
      text.includes("released") ||
      text.includes("deployed")
    )
      return "closed";

    // In progress
    if (
      text.includes("in progress") ||
      text.includes("in review") ||
      text.includes("in development") ||
      text.includes("in testing") ||
      text.includes("in qa") ||
      text.includes("code review") ||
      text.includes("under review") ||
      text.includes("working") ||
      text.includes("active")
    )
      return "in_progress";

    // Not started
    if (
      text === "to do" ||
      text === "todo" ||
      text === "open" ||
      text === "new" ||
      text === "backlog" ||
      text === "created" ||
      text.includes("not started") ||
      text.includes("waiting") ||
      text.includes("ready for")
    )
      return "not_started";
  }

  return null;
}

/**
 * Extract the canonical Jira ticket URL from the current page.
 * @returns {string | null}
 */
function getCanonicalUrl() {
  const url = window.location.href.split("?")[0].split("#")[0].replace(/\/+$/, "");
  const match =
    url.match(/^(https?:\/\/[^/]*\.atlassian\.net\/browse\/[A-Z][A-Z0-9]+-\d+)/i) ||
    url.match(/^(https?:\/\/jira[^/]*\/browse\/[A-Z][A-Z0-9]+-\d+)/i);
  if (!match) return null;
  return match[1];
}

/**
 * Check if the current page is a Jira error page (e.g. "We couldn't connect to that work item").
 * @returns {boolean}
 */
function isErrorPage() {
  const body = document.body ? document.body.textContent : "";
  return (
    body.includes("We couldn\u2019t connect") || body.includes("We couldn't connect") || body.includes("Something went wrong on our end")
  );
}

/**
 * Send the detected ticket status to the background script.
 */
function reportStatus() {
  if (isNetworkError()) {
    console.log(TAG, "network error detected, skipping");
    return;
  }
  if (isErrorPage()) {
    attemptErrorReload("url-porter-jira-reload-count", TAG);
    return;
  }

  const status = detectStatus();
  if (!status) return;

  const canonicalUrl = getCanonicalUrl();
  if (!canonicalUrl) return;

  console.log(TAG, "detected status:", status, "for", canonicalUrl);

  chrome.runtime.sendMessage({
    type: "Myevent.jiraStatus",
    url: canonicalUrl,
    status,
  });
}

// Run after page load, with a delay to let Jira's SPA render.
// Random jitter (3-6s) prevents 20+ tabs from all reporting at once.
setTimeout(reportStatus, 3000 + Math.random() * 3000);

// Also observe for SPA navigation (Jira Cloud uses client-side routing)
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    setTimeout(reportStatus, 3000);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

console.log(TAG, "content script loaded");
