/**
 * Tests for rule derivation utilities (escapeRegex, deriveRuleFromUrl).
 * These functions auto-generate bookmark rule fields from a URL.
 */

import { describe, it, expect } from "vitest";
import { escapeRegex, deriveRuleFromUrl } from "../src/helpers/ruleDerivation.js";

describe("escapeRegex", () => {
  it("returns plain strings unchanged", () => {
    expect(escapeRegex("hello")).toBe("hello");
  });

  it("escapes dots", () => {
    expect(escapeRegex("example.com")).toBe("example\\.com");
  });

  it("escapes all special regex characters", () => {
    expect(escapeRegex("a.*+?^${}()|[]\\b")).toBe("a\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\b");
  });

  it("handles empty string", () => {
    expect(escapeRegex("")).toBe("");
  });

  it("escapes multiple dots in a domain", () => {
    expect(escapeRegex("sub.example.co.uk")).toBe("sub\\.example\\.co\\.uk");
  });
});

describe("deriveRuleFromUrl", () => {
  /** @type {Date} Fixed date for deterministic tests. */
  const fixedDate = new Date(2026, 3, 11); // April 11, 2026

  it("derives fields from a standard URL with path", () => {
    const result = deriveRuleFromUrl("https://leetcode.com/problems/two-sum", fixedDate);
    expect(result.name).toBe("leetcode.com 04/11/2026");
    expect(result.historyKeywords).toEqual(["leetcode.com"]);
    expect(result.urlMatchPattern).toBe("^https?://leetcode\\.com/problems/[^/?#]+");
    expect(result.dedupeKeyPattern).toBe("leetcode\\.com/problems/([^/?#]+)");
  });

  it("strips www prefix from domain", () => {
    const result = deriveRuleFromUrl("https://www.example.com/docs/guide", fixedDate);
    expect(result.name).toBe("example.com 04/11/2026");
    expect(result.historyKeywords).toEqual(["example.com"]);
  });

  it("handles URL with no path segments", () => {
    const result = deriveRuleFromUrl("https://example.com/", fixedDate);
    expect(result.urlMatchPattern).toBe("^https?://example\\.com/[^/?#]+");
    expect(result.dedupeKeyPattern).toBe("example\\.com/([^/?#]+)");
  });

  it("handles URL with only root domain", () => {
    const result = deriveRuleFromUrl("https://example.com", fixedDate);
    expect(result.urlMatchPattern).toBe("^https?://example\\.com/[^/?#]+");
    expect(result.dedupeKeyPattern).toBe("example\\.com/([^/?#]+)");
  });

  it("uses first path segment for pattern", () => {
    const result = deriveRuleFromUrl("https://stackoverflow.com/questions/12345/some-title", fixedDate);
    expect(result.urlMatchPattern).toBe("^https?://stackoverflow\\.com/questions/[^/?#]+");
    expect(result.dedupeKeyPattern).toBe("stackoverflow\\.com/questions/([^/?#]+)");
  });

  it("handles subdomain URLs", () => {
    const result = deriveRuleFromUrl("https://docs.acme.com/wiki/page-name", fixedDate);
    expect(result.name).toBe("docs.acme.com 04/11/2026");
    expect(result.historyKeywords).toEqual(["docs.acme.com"]);
    expect(result.urlMatchPattern).toContain("docs\\.acme\\.com");
  });

  it("handles URL with query parameters (ignores them)", () => {
    const result = deriveRuleFromUrl("https://globex.com/search?q=test&page=1", fixedDate);
    expect(result.urlMatchPattern).toBe("^https?://globex\\.com/search/[^/?#]+");
    expect(result.historyKeywords).toEqual(["globex.com"]);
  });

  it("handles URL with fragment (ignores it)", () => {
    const result = deriveRuleFromUrl("https://initech.com/docs/guide#section-1", fixedDate);
    expect(result.urlMatchPattern).toBe("^https?://initech\\.com/docs/[^/?#]+");
  });

  it("returns empty values for invalid URL", () => {
    const result = deriveRuleFromUrl("not-a-url", fixedDate);
    expect(result.name).toBe("");
    expect(result.historyKeywords).toEqual([]);
    expect(result.urlMatchPattern).toBe("");
    expect(result.dedupeKeyPattern).toBe("");
  });

  it("returns empty values for empty string", () => {
    const result = deriveRuleFromUrl("", fixedDate);
    expect(result.name).toBe("");
    expect(result.historyKeywords).toEqual([]);
  });

  it("formats date with zero-padded month and day", () => {
    const jan1 = new Date(2026, 0, 5); // Jan 5
    const result = deriveRuleFromUrl("https://example.com/path", jan1);
    expect(result.name).toBe("example.com 01/05/2026");
  });

  it("generates patterns that work as valid regex", () => {
    const result = deriveRuleFromUrl("https://leetcode.com/problems/two-sum", fixedDate);
    const regex = new RegExp(result.urlMatchPattern, "i");
    expect(regex.test("https://leetcode.com/problems/two-sum")).toBe(true);
    expect(regex.test("https://leetcode.com/problems/merge-sort")).toBe(true);
    expect(regex.test("https://other.com/problems/two-sum")).toBe(false);
  });

  it("generates dedup pattern that captures the unique key", () => {
    const result = deriveRuleFromUrl("https://leetcode.com/problems/two-sum", fixedDate);
    const regex = new RegExp(result.dedupeKeyPattern, "i");
    const match = "https://leetcode.com/problems/two-sum".match(regex);
    expect(match).not.toBeNull();
    expect(match[1]).toBe("two-sum");
  });

  it("handles http:// URLs", () => {
    const result = deriveRuleFromUrl("http://acme.com/page/123", fixedDate);
    expect(result.name).toBe("acme.com 04/11/2026");
    expect(result.urlMatchPattern).toContain("^https?://");
  });

  it("handles URL with port number", () => {
    const result = deriveRuleFromUrl("https://localhost:3000/api/users", fixedDate);
    expect(result.name).toBe("localhost 04/11/2026");
    expect(result.historyKeywords).toEqual(["localhost"]);
  });
});
