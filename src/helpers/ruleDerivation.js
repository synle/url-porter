/** Utilities for deriving bookmark rule fields from a URL. */

/**
 * Escape special regex characters in a string.
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for use in a regex
 */
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract a domain from a URL match regex pattern.
 * Looks for a hostname-like segment (e.g. "leetcode\\.com" → "leetcode.com").
 * Returns empty string if no domain can be extracted.
 *
 * @param {string} pattern - A URL match regex string
 * @returns {string} The extracted domain or empty string
 */
export function extractDomainFromRegex(pattern) {
  if (!pattern) return "";
  // Match a hostname pattern: word chars and escaped/literal dots, at least one dot required
  const match = pattern.match(/(?:\/\/)?([a-zA-Z0-9][-a-zA-Z0-9]*(?:\\?\.[a-zA-Z0-9][-a-zA-Z0-9]*)+)/);
  if (!match) return "";
  // Unescape regex dots
  const domain = match[1].replace(/\\\./g, ".");
  // Only return if the last segment looks like a real TLD (2+ alpha chars)
  const parts = domain.split(".");
  const tld = parts[parts.length - 1];
  if (!/^[a-zA-Z]{2,}$/.test(tld)) return "";
  return domain;
}

/**
 * Derive auto-fill values for a bookmark rule from a URL string.
 * Extracts domain, builds history keywords, URL match pattern, and dedup key pattern.
 *
 * @param {string} urlStr - The page URL to derive rule fields from
 * @param {Date} [now] - Optional date override (for testing); defaults to current date
 * @returns {{name: string, historyKeywords: string[], urlMatchPattern: string, dedupeKeyPattern: string}}
 */
export function deriveRuleFromUrl(urlStr, now) {
  try {
    const url = new URL(urlStr);
    const domain = url.hostname.replace(/^www\./, "");
    const today = now || new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const yyyy = today.getFullYear();
    const name = `${domain} ${mm}/${dd}/${yyyy}`;

    const pathParts = url.pathname.split("/").filter(Boolean);
    let urlMatchPattern = `^https?://${escapeRegex(url.hostname)}`;
    let dedupeKeyPattern = `${escapeRegex(url.hostname)}`;

    if (pathParts.length >= 1) {
      urlMatchPattern += `/${escapeRegex(pathParts[0])}/[^/?#]+`;
      dedupeKeyPattern += `/${escapeRegex(pathParts[0])}/([^/?#]+)`;
    } else {
      urlMatchPattern += "/[^/?#]+";
      dedupeKeyPattern += "/([^/?#]+)";
    }

    return {
      name,
      historyKeywords: [domain],
      urlMatchPattern,
      dedupeKeyPattern,
    };
  } catch {
    return { name: "", historyKeywords: [], urlMatchPattern: "", dedupeKeyPattern: "" };
  }
}
