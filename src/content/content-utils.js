/**
 * Shared utilities for content scripts.
 *
 * Loaded before individual content scripts via the manifest's js array.
 * Provides error page detection and staggered reload with backoff.
 */

/** @type {number[]} Staggered reload delays: 5s, 30s, 90s. */
// eslint-disable-next-line no-unused-vars
const RELOAD_DELAYS = [5000, 30000, 90000];

/**
 * Check if the browser cannot reach the page (offline, VPN disconnected, DNS failure, etc.).
 * @returns {boolean}
 */
// eslint-disable-next-line no-unused-vars
function isNetworkError() {
  if (!navigator.onLine) return true;
  const body = document.body ? document.body.textContent : "";
  const title = document.title || "";
  const combined = body + " " + title;
  return (
    combined.includes("ERR_NAME_NOT_RESOLVED") ||
    combined.includes("ERR_CONNECTION_REFUSED") ||
    combined.includes("ERR_CONNECTION_TIMED_OUT") ||
    combined.includes("ERR_INTERNET_DISCONNECTED") ||
    combined.includes("ERR_NETWORK_CHANGED") ||
    combined.includes("ERR_ADDRESS_UNREACHABLE") ||
    combined.includes("This site can\u2019t be reached") ||
    combined.includes("This site can't be reached") ||
    combined.includes("No internet") ||
    combined.includes("is not available")
  );
}

/**
 * Check if the page should be retried with a staggered reload.
 * Uses sessionStorage to track reload attempts per key.
 * @param {string} storageKey - Unique key for this content script's reload counter
 * @param {string} tag - Logging tag (e.g. "[url-porter:jira-status]")
 * @returns {boolean} true if the page is being reloaded (caller should bail out)
 */
// eslint-disable-next-line no-unused-vars
function attemptErrorReload(storageKey, tag) {
  const reloadCount = parseInt(sessionStorage.getItem(storageKey) || "0", 10);
  if (reloadCount < RELOAD_DELAYS.length) {
    const delay = RELOAD_DELAYS[reloadCount];
    sessionStorage.setItem(storageKey, String(reloadCount + 1));
    console.log(tag, `error page detected, reload attempt ${reloadCount + 1}/${RELOAD_DELAYS.length} in ${delay / 1000}s...`);
    setTimeout(() => window.location.reload(), delay);
    return true;
  }
  console.log(tag, `error page detected after ${RELOAD_DELAYS.length} reloads, giving up`);
  return false;
}
