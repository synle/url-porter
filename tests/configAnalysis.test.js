/**
 * Tests for configAnalysis helpers — findDuplicateAliases, findRedirectChains,
 * findOverlappingAliases, checkBrokenLinks (with a mocked global fetch).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findDuplicateAliases, findRedirectChains, findOverlappingAliases, checkBrokenLinks } from "../src/helpers/configAnalysis.js";

describe("findDuplicateAliases", () => {
  it("returns empty for no duplicates", () => {
    const entries = [
      { from: "||gh^", to: "https://github.com" },
      { from: "||gl^", to: "https://gitlab.com" },
    ];
    expect(findDuplicateAliases(entries)).toEqual([]);
  });

  it("finds exact duplicate aliases", () => {
    const entries = [
      { from: "||gh^", to: "https://github.com" },
      { from: "||gh^", to: "https://github.com/org" },
    ];
    const result = findDuplicateAliases(entries);
    expect(result).toHaveLength(1);
    expect(result[0].alias).toBe("gh");
    expect(result[0].entries).toHaveLength(2);
  });

  it("matches aliases case-insensitively", () => {
    const entries = [
      { from: "||GH^", to: "https://github.com" },
      { from: "||gh^", to: "https://github.com/org" },
    ];
    const result = findDuplicateAliases(entries);
    expect(result).toHaveLength(1);
  });

  it("matches aliases with and without delimiters", () => {
    const entries = [
      { from: "gh", to: "https://github.com" },
      { from: "||gh^", to: "https://github.com/org" },
    ];
    const result = findDuplicateAliases(entries);
    expect(result).toHaveLength(1);
  });

  it("returns empty for empty or non-array input", () => {
    expect(findDuplicateAliases([])).toEqual([]);
    expect(findDuplicateAliases(null)).toEqual([]);
    expect(findDuplicateAliases("not an array")).toEqual([]);
  });

  it("finds multiple duplicate groups", () => {
    const entries = [
      { from: "||gh^", to: "https://github.com" },
      { from: "||gh^", to: "https://github.com/org" },
      { from: "||gl^", to: "https://gitlab.com" },
      { from: "||gl^", to: "https://gitlab.com/org" },
    ];
    const result = findDuplicateAliases(entries);
    expect(result).toHaveLength(2);
  });

  it("preserves original indices", () => {
    const entries = [
      { from: "||a^", to: "https://a.com" },
      { from: "||b^", to: "https://b.com" },
      { from: "||a^", to: "https://a2.com" },
    ];
    const result = findDuplicateAliases(entries);
    expect(result).toHaveLength(1);
    expect(result[0].entries[0].index).toBe(0);
    expect(result[0].entries[1].index).toBe(2);
  });
});

describe("findRedirectChains", () => {
  it("returns empty when no chains exist", () => {
    const entries = [
      { from: "||gh^", to: "https://github.com" },
      { from: "||gl^", to: "https://gitlab.com" },
    ];
    expect(findRedirectChains(entries)).toEqual([]);
  });

  it("detects a simple chain (a -> b -> url)", () => {
    const entries = [
      { from: "||a^", to: "https://b" },
      { from: "||b^", to: "https://final.com" },
    ];
    const result = findRedirectChains(entries);
    expect(result).toHaveLength(1);
    expect(result[0].from).toBe("||a^");
    expect(result[0].chain.length).toBeGreaterThanOrEqual(2);
  });

  it("detects multi-hop chains", () => {
    const entries = [
      { from: "||a^", to: "https://b" },
      { from: "||b^", to: "https://c" },
      { from: "||c^", to: "https://final.com" },
    ];
    const result = findRedirectChains(entries);
    // a -> b and b -> c are both chains
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty for non-array input", () => {
    expect(findRedirectChains(null)).toEqual([]);
    expect(findRedirectChains("string")).toEqual([]);
  });

  it("handles entries where to does not match any alias", () => {
    const entries = [{ from: "||gh^", to: "https://github.com" }];
    expect(findRedirectChains(entries)).toEqual([]);
  });
});

describe("findOverlappingAliases", () => {
  it("returns empty when no overlaps exist", () => {
    const entries = [
      { from: "||gh^", to: "https://github.com" },
      { from: "||gl^", to: "https://gitlab.com" },
    ];
    expect(findOverlappingAliases(entries)).toEqual([]);
  });

  it("detects when one alias is a prefix of another", () => {
    const entries = [
      { from: "||chat^", to: "https://chat.com" },
      { from: "||chatgpt^", to: "https://chatgpt.com" },
    ];
    const result = findOverlappingAliases(entries);
    expect(result).toHaveLength(1);
    expect(result[0].aliasA).toBe("chat");
    expect(result[0].aliasB).toBe("chatgpt");
  });

  it("does not flag non-prefix substrings", () => {
    const entries = [
      { from: "||hub^", to: "https://hub.com" },
      { from: "||github^", to: "https://github.com" },
    ];
    expect(findOverlappingAliases(entries)).toEqual([]);
  });

  it("does not flag exact duplicates (handled by findDuplicateAliases)", () => {
    const entries = [
      { from: "||gh^", to: "https://github.com" },
      { from: "||gh^", to: "https://github.com/org" },
    ];
    expect(findOverlappingAliases(entries)).toEqual([]);
  });

  it("detects multiple overlaps", () => {
    const entries = [
      { from: "||a^", to: "https://a.com" },
      { from: "||ab^", to: "https://ab.com" },
      { from: "||abc^", to: "https://abc.com" },
    ];
    const result = findOverlappingAliases(entries);
    // a in ab, a in abc, ab in abc
    expect(result).toHaveLength(3);
  });

  it("returns empty for non-array input", () => {
    expect(findOverlappingAliases(null)).toEqual([]);
    expect(findOverlappingAliases([])).toEqual([]);
  });

  it("correctly identifies the shorter alias as aliasA", () => {
    const entries = [
      { from: "||tplinkwifi.net^", to: "https://192.168.1.1" },
      { from: "||tplinkwifi^", to: "https://tplinkwifi.net" },
    ];
    const result = findOverlappingAliases(entries);
    expect(result).toHaveLength(1);
    expect(result[0].aliasA).toBe("tplinkwifi");
    expect(result[0].aliasB).toBe("tplinkwifi.net");
  });
});

describe("checkBrokenLinks", () => {
  let origFetch;
  beforeEach(() => {
    origFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("returns [] when no entries", async () => {
    globalThis.fetch = vi.fn();
    const result = await checkBrokenLinks([]);
    expect(result).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("skips entries that do not have an http(s) destination", async () => {
    globalThis.fetch = vi.fn();
    const result = await checkBrokenLinks([
      { from: "a", to: "ftp://x.com" },
      { from: "b", to: "" },
    ]);
    expect(result).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("skips short-link redirects that point to another alias", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const result = await checkBrokenLinks([
      { from: "a", to: "aaa" },
      { from: "aaa", to: "https://aaa.com" },
    ]);
    expect(result).toEqual([]);
    // Only the second entry's URL should be fetched
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://aaa.com", { method: "HEAD", mode: "no-cors" });
  });

  it("flags 404 responses as broken links", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 404 });
    const result = await checkBrokenLinks([{ from: "x", to: "https://missing.example.com" }]);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe(404);
  });

  it("treats fetch errors as reachable (no false positives)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await checkBrokenLinks([{ from: "x", to: "https://blocked.example.com" }]);
    expect(result).toEqual([]);
  });

  it("invokes the onProgress callback after each entry", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const onProgress = vi.fn();
    await checkBrokenLinks(
      [
        { from: "a", to: "https://a.com" },
        { from: "b", to: "https://b.com" },
      ],
      onProgress,
    );
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });
});
