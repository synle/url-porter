/** Background-side text download for pages whose CSP `sandbox` blocks `<a download>` (e.g. raw.githubusercontent.com). */

/** Code points below this are control characters, never valid in a file name. @type {number} */
const FIRST_PRINTABLE = 0x20;

/** Characters Windows / Chrome reject in file names. @type {RegExp} */
const RESERVED_CHARS = /[<>:"|?*]/g;

/** File name used when the requested one is empty or unsafe. @type {string} */
export const DEFAULT_DOWNLOAD_NAME = "content.txt";

/**
 * Reduce a page-supplied name to a safe bare file name for chrome.downloads (no folders, no hidden/relative names).
 * @param {unknown} name - Requested file name.
 * @returns {string} Safe file name, or DEFAULT_DOWNLOAD_NAME.
 */
export function safeDownloadName(name) {
  const base = String(typeof name === "string" ? name : "")
    .split(/[/\\]/)
    .pop()
    .replace(RESERVED_CHARS, "_")
    .split("")
    .map((ch) => (ch.charCodeAt(0) < FIRST_PRINTABLE ? "_" : ch))
    .join("")
    .trim();
  if (!base || base.startsWith(".")) return DEFAULT_DOWNLOAD_NAME;
  return base;
}

/**
 * Save text as a file through chrome.downloads (a data: URL; the service worker has no URL.createObjectURL).
 * @param {{text?: unknown, fileName?: unknown}} request - Text and requested file name from the content script.
 * @returns {Promise<number>} Download id.
 * @throws {TypeError} When `text` is not a string.
 */
export async function downloadText(request) {
  if (typeof request?.text !== "string") throw new TypeError("download text must be a string");
  return chrome.downloads.download({
    url: `data:text/plain;charset=utf-8,${encodeURIComponent(request.text)}`,
    filename: safeDownloadName(request.fileName),
    saveAs: false,
  });
}
