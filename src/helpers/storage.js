/**
 * Chrome Storage API wrappers.
 *
 * Config rules use `chrome.storage.sync` (synced across devices).
 * Homepage URL, sync server URL, and history use `chrome.storage.local`.
 */

/** Default sync server URL, overridable at build time via env var. */
const DEFAULT_SYNC_URL = import.meta.env.VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL || "https://synle.github.io/fav/url-porter.json";

export { DEFAULT_SYNC_URL };

/**
 * Retrieve the saved config entries from sync storage.
 * Returns an empty array if nothing is stored or on error.
 *
 * @returns {Promise<import('./configUtils.js').RawConfigEntry[]>}
 */
export function getConfig() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(["jsonConfig"], (result) => {
        if (chrome.runtime.lastError) {
          console.error("getConfig error:", chrome.runtime.lastError);
          return resolve([]);
        }
        resolve(result.jsonConfig || []);
      });
    } catch (err) {
      console.error("getConfig exception:", err);
      resolve([]);
    }
  });
}

/**
 * Strip single-line (//) and multi-line block comments from a JSON string.
 * Preserves comment-like content inside quoted strings.
 *
 * @param {string} jsonString - JSON text potentially containing comments
 * @returns {string} Comment-free JSON
 */
export function stripJsonComments(jsonString) {
  return jsonString.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? "" : m)).trim();
}

/**
 * Parse and persist config entries to sync storage.
 * Accepts a JSON string (comments are stripped before parsing).
 *
 * @param {string} input_value - JSON string of config entries
 * @returns {Promise<void>}
 */
export function setConfig(input_value) {
  return new Promise((resolve, reject) => {
    if (!input_value) {
      input_value = `[]`;
    }

    let jsonConfig;
    try {
      const cleanedJson = stripJsonComments(input_value);
      jsonConfig = JSON.parse(cleanedJson);
    } catch (e) {
      reject("Invalid JSON: " + e.message);
      return;
    }

    chrome.storage.sync.set({ jsonConfig }, () => {
      if (chrome.runtime.lastError) {
        reject("Storage error: " + chrome.runtime.lastError.message);
        return;
      }
      resolve();
    });
  });
}

/**
 * Get the user's configured homepage URL from local storage.
 *
 * @returns {Promise<string>} Homepage URL or empty string
 */
export function getHomepageUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get("homepageUrl", (result) => {
      resolve(result.homepageUrl || "");
    });
  });
}

/**
 * Save the homepage URL to local storage.
 *
 * @param {string} input_value - The homepage URL to save
 * @returns {Promise<void>}
 */
export function saveHomepageUrl(input_value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ homepageUrl: input_value }, () => {
      resolve();
    });
  });
}

/**
 * Get the remote sync server URL from local storage.
 * Falls back to DEFAULT_SYNC_URL if none is stored.
 *
 * @returns {Promise<string>}
 */
export function getSyncUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get("syncUrl", (result) => {
      resolve(result.syncUrl || DEFAULT_SYNC_URL);
    });
  });
}

/**
 * Save the sync server URL to local storage.
 *
 * @param {string} input_value - The sync server URL
 * @returns {Promise<void>}
 */
export function setSyncUrlToStorage(input_value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ syncUrl: input_value }, () => {
      resolve();
    });
  });
}

/**
 * Validate that a string is a well-formed http(s) URL.
 *
 * @param {string} url
 * @returns {boolean}
 */
/**
 * Get the bookmark folder name from local storage.
 *
 * @returns {Promise<string>} Folder name or "url-porter"
 */
export function getBookmarkFolderName() {
  return new Promise((resolve) => {
    chrome.storage.local.get("bookmarkFolderName", (result) => {
      resolve(result.bookmarkFolderName || "url-porter");
    });
  });
}

/**
 * Save the bookmark folder name to local storage.
 *
 * @param {string} input_value - The bookmark folder name to save
 * @returns {Promise<void>}
 */
export function setBookmarkFolderName(input_value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ bookmarkFolderName: input_value }, () => {
      resolve();
    });
  });
}

/**
 * Get the GitHub org grouping threshold from local storage.
 * Orgs with at least this many repos get their own subfolder; others go to "misc".
 *
 * @returns {Promise<number>} Threshold (default 3)
 */
export function getGithubOrgThreshold() {
  return new Promise((resolve) => {
    chrome.storage.local.get("githubOrgThreshold", (result) => {
      resolve(result.githubOrgThreshold || 3);
    });
  });
}

/**
 * Save the GitHub org grouping threshold to local storage.
 *
 * @param {number} input_value - The threshold to save
 * @returns {Promise<void>}
 */
export function setGithubOrgThreshold(input_value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ githubOrgThreshold: input_value }, () => {
      resolve();
    });
  });
}

export function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch {
    return false;
  }
}
