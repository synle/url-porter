/** Config normalization utilities for declarativeNetRequest redirect rules. */

/**
 * @typedef {Object} ConfigEntry
 * @property {string} from - The URL filter pattern (e.g. "||example^")
 * @property {string} to - The destination URL (e.g. "https://example.com")
 */

/**
 * @typedef {ConfigEntry | [string, string]} RawConfigEntry
 * A config entry in either object `{from, to}` or array `[from, to]` format.
 */

/**
 * Normalize a single config entry to `{from, to}` object format.
 * Accepts both `{from, to}` objects and `[from, to]` arrays.
 *
 * @param {RawConfigEntry} item - A config entry in any supported format
 * @returns {ConfigEntry | null} Normalized entry, or null if the input is invalid
 */
export function normalizeEntry(item) {
  if (Array.isArray(item) && item.length === 2) {
    return { from: String(item[0] ?? ""), to: String(item[1] ?? "") };
  }
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return { from: String(item.from ?? ""), to: String(item.to ?? "") };
  }
  return null;
}

/**
 * Normalize an array of raw config entries to `{from, to}` objects.
 * Filters out any entries that cannot be normalized.
 *
 * @param {RawConfigEntry[]} entries - Array of config entries in any supported format
 * @returns {ConfigEntry[]} Array of normalized entries
 */
export function normalizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(normalizeEntry).filter(Boolean);
}

/**
 * Normalize the `from` field for use as a declarativeNetRequest urlFilter.
 * Ensures it starts with `||` and ends with `^`.
 *
 * @param {string} from - The raw from value
 * @returns {string} Normalized urlFilter pattern
 */
export function normalizeFrom(from) {
  let result = String(from ?? "")
    .replace(/[^\x20-\x7E]/g, "") // Strip invisible/non-ASCII unicode characters
    .trim()
    .toLowerCase();
  if (!result.startsWith("||")) result = "||" + result;
  if (!result.endsWith("^")) result = result + "^";
  return result;
}

/**
 * Normalize the `to` field to ensure it has an http(s) protocol.
 *
 * @param {string} to - The raw destination URL
 * @returns {string} URL with protocol prefix
 */
export function normalizeTo(to) {
  let result = String(to ?? "")
    .trim()
    .toLowerCase();
  if (!result.startsWith("http://") && !result.startsWith("https://")) {
    result = "https://" + result;
  }
  return result;
}

/**
 * Fully normalize a config entry for redirect rule consumption.
 * Normalizes the shape, `from` pattern, and `to` URL.
 * Returns null if the entry is invalid or has empty from/to.
 *
 * @param {RawConfigEntry} item - A config entry in any supported format
 * @returns {ConfigEntry | null} Fully normalized entry ready for redirect rules, or null
 */
export function normalizeEntryForRedirect(item) {
  const entry = normalizeEntry(item);
  if (!entry) return null;

  const from = normalizeFrom(entry.from);
  const to = normalizeTo(entry.to);

  if (!from || !to) return null;
  return { from, to };
}

/**
 * Normalize an array of raw config entries for redirect rule consumption.
 * Each entry gets full normalization (shape + from pattern + to URL).
 * Filters out any invalid entries.
 *
 * @param {RawConfigEntry[]} entries - Array of config entries in any supported format
 * @returns {ConfigEntry[]} Array of fully normalized entries ready for redirect rules
 */
export function normalizeEntriesForRedirect(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(normalizeEntryForRedirect).filter(Boolean);
}

/**
 * @typedef {Object} DuplicateResult
 * @property {number} index - The index of the duplicate entry in the original array
 * @property {ConfigEntry} entry - The normalized duplicate entry
 */

/**
 * Strip the `||` prefix and `^` suffix from an alias to get the bare keyword.
 *
 * @param {string} alias - The raw alias (may or may not have delimiters)
 * @returns {string} The bare alias without declarativeNetRequest delimiters
 */
export function stripAlias(alias) {
  let result = String(alias ?? "");
  if (result.startsWith("||")) result = result.slice(2);
  if (result.endsWith("^")) result = result.slice(0, -1);
  return result;
}

/**
 * Clean a user-entered alias: trim whitespace and lowercase.
 *
 * @param {string} value - Raw user input
 * @returns {string} Cleaned alias
 */
export function cleanAlias(value) {
  return value
    .replace(/[^\x20-\x7E]/g, "") // Strip invisible/non-ASCII unicode characters
    .trim()
    .toLowerCase();
}

/**
 * Validate an alias for issues that would break declarativeNetRequest rules.
 * Returns an error message string if invalid, or null if valid.
 *
 * @param {string} value - The alias to validate
 * @returns {string | null} Error message or null
 */
export function validateAlias(value) {
  if (!value || !value.trim()) return "Please enter a link alias.";
  if (/[^\x20-\x7E]/.test(value))
    return `Alias "${value}" contains invisible or non-ASCII characters. They will be stripped automatically.`;
  return null;
}

/**
 * Clean a user-entered URL: trim, lowercase, and prepend https:// if no protocol.
 *
 * @param {string} value - Raw user input
 * @returns {string} Cleaned URL with protocol
 */
export function cleanUrl(value) {
  let result = value.trim().toLowerCase();
  if (result && !result.startsWith("http://") && !result.startsWith("https://")) {
    result = "https://" + result;
  }
  return result;
}

/**
 * Percent-decode a URI component without throwing.
 *
 * `decodeURIComponent` raises `URIError: URI malformed` when the input holds a
 * literal `%` that is not followed by two hex digits (e.g. the Figma slug
 * `100%-Redesign`). Returns the input unchanged in that case.
 *
 * @param {string} value - The possibly percent-encoded string
 * @returns {string} The decoded string, or the original when it cannot be decoded
 */
export function safeDecodeURIComponent(value) {
  const str = String(value ?? "");
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

/**
 * Sanitize a bookmark title for safe display in external consumers.
 * - Replaces `#` and `|` with `/` to avoid misinterpretation as
 *   markdown headers or nav schema separators.
 *
 * @param {string} title
 * @returns {string}
 */
export function sanitizeBookmarkTitle(title) {
  return String(title ?? "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\d*\./, "")
    .replace(/[#|]/g, "/")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Find an existing entry whose `from` field matches the given alias
 * (case-insensitive, after normalizing both sides with `normalizeFrom`).
 *
 * @param {RawConfigEntry[]} entries - The current config entries (any format)
 * @param {string} alias - The alias to check (raw user input, will be normalized)
 * @param {number} [skipIndex=-1] - Index to skip (for edit mode, so the entry being edited is not matched)
 * @returns {DuplicateResult | null} The duplicate entry and its index, or null if no duplicate
 */
export function findDuplicateEntry(entries, alias, skipIndex = -1) {
  if (!Array.isArray(entries) || !alias) return null;

  const normalizedAlias = normalizeFrom(alias.trim()).toLowerCase();

  for (let i = 0; i < entries.length; i++) {
    if (i === skipIndex) continue;
    const entry = normalizeEntry(entries[i]);
    if (!entry) continue;
    if (normalizeFrom(entry.from).toLowerCase() === normalizedAlias) {
      return { index: i, entry };
    }
  }
  return null;
}
