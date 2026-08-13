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
 * Check whether the extension context is still valid.
 *
 * After the extension is reloaded or updated, content scripts already injected
 * into open tabs keep running but are orphaned — every `chrome.runtime` call
 * throws "Extension context invalidated". `chrome.runtime.id` is undefined in
 * that state, which is the cheapest way to detect it.
 *
 * @returns {boolean} true while the background script is still reachable
 */
// eslint-disable-next-line no-unused-vars
function isExtensionContextValid() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

/**
 * Send a message to the background script without ever raising.
 *
 * `chrome.runtime.sendMessage` throws synchronously in an orphaned content
 * script, and returns a promise that rejects when no receiver is listening —
 * both surface as uncaught errors in the page console.
 *
 * @param {object} message - The message payload to send
 * @param {string} tag - Logging tag (e.g. "[url-porter:jira-status]")
 * @returns {boolean} false if the extension context is gone (caller should stop working)
 */
// eslint-disable-next-line no-unused-vars
function sendToBackground(message, tag) {
  if (!isExtensionContextValid()) {
    console.log(tag, "extension context invalidated, skipping message");
    return false;
  }
  try {
    const result = chrome.runtime.sendMessage(message);
    if (result && typeof result.catch === "function") {
      result.catch((err) => console.log(tag, "background did not receive message:", err?.message));
    }
  } catch (err) {
    console.log(tag, "failed to send message:", err?.message);
    return false;
  }
  return true;
}

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
    console.log(
      tag,
      `error page detected, reload attempt ${reloadCount + 1}/${RELOAD_DELAYS.length} in ${delay / 1000}s...`,
    );
    setTimeout(() => window.location.reload(), delay);
    return true;
  }
  console.log(tag, `error page detected after ${RELOAD_DELAYS.length} reloads, giving up`);
  return false;
}
