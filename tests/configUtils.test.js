/**
 * Tests for configUtils — sanitizeBookmarkTitle, normalizeFrom, normalizeTo,
 * stripAlias, cleanAlias, cleanUrl, and validateAlias.
 */

import { describe, it, expect } from "vitest";
import {
  sanitizeBookmarkTitle,
  normalizeFrom,
  normalizeTo,
  stripAlias,
  cleanAlias,
  cleanUrl,
  validateAlias,
  normalizeEntry,
} from "../src/helpers/configUtils.js";

describe("sanitizeBookmarkTitle", () => {
  it("replaces # with /", () => {
    expect(sanitizeBookmarkTitle("section#anchor")).toBe("section/anchor");
  });

  it("replaces | with /", () => {
    expect(sanitizeBookmarkTitle("left|right")).toBe("left/right");
  });

  it("does not add spaces around /", () => {
    expect(sanitizeBookmarkTitle("3/26")).toBe("3/26");
    expect(sanitizeBookmarkTitle("2025/03/19")).toBe("2025/03/19");
  });

  it("preserves existing slashes without adding spaces", () => {
    expect(sanitizeBookmarkTitle("a / b")).toBe("a / b");
    expect(sanitizeBookmarkTitle("path/to/file")).toBe("path/to/file");
  });

  it("strips http:// protocol prefix", () => {
    expect(sanitizeBookmarkTitle("http://example.com/page")).toBe("example.com/page");
  });

  it("strips https:// protocol prefix", () => {
    expect(sanitizeBookmarkTitle("https://example.com/page")).toBe("example.com/page");
  });

  it("strips www. prefix", () => {
    expect(sanitizeBookmarkTitle("www.example.com")).toBe("example.com");
  });

  it("strips www2. prefix", () => {
    expect(sanitizeBookmarkTitle("www2.example.com")).toBe("example.com");
  });

  it("strips www3. prefix", () => {
    expect(sanitizeBookmarkTitle("www3.example.com")).toBe("example.com");
  });

  it("strips both protocol and www prefix", () => {
    expect(sanitizeBookmarkTitle("https://www.example.com/page")).toBe("example.com/page");
    expect(sanitizeBookmarkTitle("http://www2.example.com")).toBe("example.com");
  });

  it("collapses multiple spaces", () => {
    expect(sanitizeBookmarkTitle("hello   world")).toBe("hello world");
  });

  it("trims whitespace", () => {
    expect(sanitizeBookmarkTitle("  hello  ")).toBe("hello");
  });

  it("handles null/undefined", () => {
    expect(sanitizeBookmarkTitle(null)).toBe("");
    expect(sanitizeBookmarkTitle(undefined)).toBe("");
  });

  it("handles empty string", () => {
    expect(sanitizeBookmarkTitle("")).toBe("");
  });

  it("handles combined transformations", () => {
    expect(sanitizeBookmarkTitle("https://www.example.com/path#section")).toBe("example.com/path/section");
  });
});

describe("normalizeFrom", () => {
  it("adds || prefix and ^ suffix", () => {
    expect(normalizeFrom("example")).toBe("||example^");
  });

  it("does not double-add delimiters", () => {
    expect(normalizeFrom("||example^")).toBe("||example^");
  });

  it("lowercases", () => {
    expect(normalizeFrom("MyAlias")).toBe("||myalias^");
  });

  it("strips non-ASCII characters", () => {
    expect(normalizeFrom("test\u200Balias")).toBe("||testalias^");
  });

  it("trims whitespace", () => {
    expect(normalizeFrom("  foo  ")).toBe("||foo^");
  });
});

describe("normalizeTo", () => {
  it("adds https:// if no protocol", () => {
    expect(normalizeTo("example.com")).toBe("https://example.com");
  });

  it("preserves http://", () => {
    expect(normalizeTo("http://example.com")).toBe("http://example.com");
  });

  it("preserves https://", () => {
    expect(normalizeTo("https://example.com")).toBe("https://example.com");
  });

  it("lowercases", () => {
    expect(normalizeTo("Example.COM")).toBe("https://example.com");
  });

  it("trims whitespace", () => {
    expect(normalizeTo("  example.com  ")).toBe("https://example.com");
  });
});

describe("stripAlias", () => {
  it("strips || prefix and ^ suffix", () => {
    expect(stripAlias("||example^")).toBe("example");
  });

  it("handles bare alias without delimiters", () => {
    expect(stripAlias("example")).toBe("example");
  });

  it("handles only prefix", () => {
    expect(stripAlias("||example")).toBe("example");
  });

  it("handles only suffix", () => {
    expect(stripAlias("example^")).toBe("example");
  });
});

describe("cleanAlias", () => {
  it("trims and lowercases", () => {
    expect(cleanAlias("  MyAlias  ")).toBe("myalias");
  });

  it("strips non-ASCII", () => {
    expect(cleanAlias("test\u00A0alias")).toBe("testalias");
  });
});

describe("cleanUrl", () => {
  it("trims and lowercases", () => {
    expect(cleanUrl("  Example.COM  ")).toBe("https://example.com");
  });

  it("preserves existing protocol", () => {
    expect(cleanUrl("http://example.com")).toBe("http://example.com");
  });

  it("adds https:// if missing", () => {
    expect(cleanUrl("example.com")).toBe("https://example.com");
  });

  it("returns empty for empty input", () => {
    expect(cleanUrl("")).toBe("");
  });
});

describe("validateAlias", () => {
  it("returns error for empty input", () => {
    expect(validateAlias("")).toBeTruthy();
    expect(validateAlias("  ")).toBeTruthy();
  });

  it("returns null for valid alias", () => {
    expect(validateAlias("my-alias")).toBeNull();
  });

  it("warns about non-ASCII characters", () => {
    const result = validateAlias("test\u200B");
    expect(result).toContain("non-ASCII");
  });
});

describe("normalizeEntry", () => {
  it("normalizes {from, to} objects", () => {
    expect(normalizeEntry({ from: "a", to: "b" })).toEqual({ from: "a", to: "b" });
  });

  it("normalizes [from, to] arrays", () => {
    expect(normalizeEntry(["a", "b"])).toEqual({ from: "a", to: "b" });
  });

  it("returns null for invalid input", () => {
    expect(normalizeEntry(null)).toBeNull();
    expect(normalizeEntry("string")).toBeNull();
    expect(normalizeEntry([1])).toBeNull();
  });
});
