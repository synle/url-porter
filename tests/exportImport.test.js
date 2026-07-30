/**
 * Tests for export/import config functionality.
 * Validates the data format used for export/import JSON files.
 */

import { describe, it, expect } from "vitest";

/**
 * Builds an export payload from config entries, homepage URL, and all settings.
 * Includes homepage, configs, bookmarkRules, and numeric/string settings.
 *
 * @param {string} homepage - The homepage URL
 * @param {Array<{from: string, to: string}>} configs - The config entries
 * @param {object} [options] - Optional settings (bookmarkRules, bookmarkFolderName, historyAliasLimit, historyEntryLimit, githubOrgThreshold)
 * @returns {object} Full export payload
 */
function buildExportPayload(homepage, configs, options = {}) {
  const payload = {
    homepage,
    configs,
    bookmarkRules: options.bookmarkRules || [],
    bookmarkFolderName: options.bookmarkFolderName || "url-porter",
    historyAliasLimit: options.historyAliasLimit || 5000,
    historyEntryLimit: options.historyEntryLimit || 20,
    githubOrgThreshold: options.githubOrgThreshold || 3,
    statsVisitThreshold: options.statsVisitThreshold || 3,
    statsMaxResults: options.statsMaxResults || 200,
    statsLookbackMonths: options.statsLookbackMonths || 6,
  };
  return payload;
}

/**
 * Validates an imported config payload.
 * Must contain a "configs" array; "homepage" and all other settings are optional.
 *
 * @param {unknown} data - The parsed JSON data to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateImportPayload(data) {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Invalid file: expected a JSON object." };
  }
  if (!("configs" in data) || !Array.isArray(data.configs)) {
    return { valid: false, error: 'Invalid file: must contain a "configs" array.' };
  }
  return { valid: true };
}

/**
 * Validates optional numeric settings fields from an import payload.
 * Returns true if the value is a positive number (>= 1).
 *
 * @param {unknown} value - The value to validate
 * @returns {boolean}
 */
function isValidPositiveNumber(value) {
  return typeof value === "number" && value >= 1;
}

describe("buildExportPayload", () => {
  it("produces the correct shape with homepage and configs", () => {
    const payload = buildExportPayload("https://example.com", [
      { from: "gh", to: "https://github.com" },
    ]);
    expect(payload.homepage).toBe("https://example.com");
    expect(payload.configs).toEqual([{ from: "gh", to: "https://github.com" }]);
  });

  it("works with empty configs and includes default settings", () => {
    const payload = buildExportPayload("", []);
    expect(payload.homepage).toBe("");
    expect(payload.configs).toEqual([]);
    expect(payload.bookmarkFolderName).toBe("url-porter");
    expect(payload.historyAliasLimit).toBe(5000);
    expect(payload.historyEntryLimit).toBe(20);
    expect(payload.githubOrgThreshold).toBe(3);
    expect(payload.statsVisitThreshold).toBe(3);
    expect(payload.statsMaxResults).toBe(200);
    expect(payload.statsLookbackMonths).toBe(6);
    expect(payload.bookmarkRules).toEqual([]);
  });

  it("produces valid JSON round-trip", () => {
    const configs = [
      { from: "a", to: "https://a.com" },
      { from: "b", to: "https://b.com" },
    ];
    const payload = buildExportPayload("https://home.com", configs);
    const json = JSON.stringify(payload, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(payload);
  });

  it("includes all settings when provided", () => {
    const payload = buildExportPayload("https://home.com", [], {
      bookmarkRules: [{ id: "r1", name: "initech docs" }],
      bookmarkFolderName: "my-bookmarks",
      historyAliasLimit: 10000,
      historyEntryLimit: 50,
      githubOrgThreshold: 5,
      statsVisitThreshold: 10,
      statsMaxResults: 500,
      statsLookbackMonths: 12,
    });
    expect(payload.bookmarkFolderName).toBe("my-bookmarks");
    expect(payload.historyAliasLimit).toBe(10000);
    expect(payload.historyEntryLimit).toBe(50);
    expect(payload.githubOrgThreshold).toBe(5);
    expect(payload.statsVisitThreshold).toBe(10);
    expect(payload.statsMaxResults).toBe(500);
    expect(payload.statsLookbackMonths).toBe(12);
    expect(payload.bookmarkRules).toEqual([{ id: "r1", name: "initech docs" }]);
  });

  it("round-trips full config with all settings through JSON", () => {
    const payload = buildExportPayload("https://home.com", [{ from: "a", to: "https://a.com" }], {
      bookmarkRules: [
        { id: "r1", name: "globex wiki", historyKeywords: ["globex.com"], enabled: true },
      ],
      bookmarkFolderName: "custom-folder",
      historyAliasLimit: 2000,
      historyEntryLimit: 10,
      githubOrgThreshold: 7,
      statsVisitThreshold: 5,
      statsMaxResults: 100,
      statsLookbackMonths: 3,
    });
    const json = JSON.stringify(payload, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(payload);
  });
});

describe("validateImportPayload", () => {
  it("accepts valid payload with homepage and configs", () => {
    const result = validateImportPayload({
      homepage: "https://example.com",
      configs: [{ from: "gh", to: "https://github.com" }],
    });
    expect(result.valid).toBe(true);
  });

  it("accepts payload without homepage (optional)", () => {
    const result = validateImportPayload({
      configs: [{ from: "gh", to: "https://github.com" }],
    });
    expect(result.valid).toBe(true);
  });

  it("accepts empty configs array", () => {
    const result = validateImportPayload({ configs: [] });
    expect(result.valid).toBe(true);
  });

  it("rejects null", () => {
    const result = validateImportPayload(null);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("JSON object");
  });

  it("rejects a string", () => {
    const result = validateImportPayload("not an object");
    expect(result.valid).toBe(false);
  });

  it("rejects object without configs key", () => {
    const result = validateImportPayload({ homepage: "https://example.com" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("configs");
  });

  it("rejects object where configs is not an array", () => {
    const result = validateImportPayload({ configs: "not an array" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("configs");
  });

  it("rejects object where configs is an object", () => {
    const result = validateImportPayload({ configs: { from: "a", to: "b" } });
    expect(result.valid).toBe(false);
  });

  it("accepts payload with bookmarkRules (optional)", () => {
    const result = validateImportPayload({
      configs: [],
      bookmarkRules: [{ id: "1", name: "test rule" }],
    });
    expect(result.valid).toBe(true);
  });

  it("accepts payload without bookmarkRules (backward-compatible)", () => {
    const result = validateImportPayload({ configs: [] });
    expect(result.valid).toBe(true);
  });
});

describe("isValidPositiveNumber", () => {
  it("accepts positive integers", () => {
    expect(isValidPositiveNumber(1)).toBe(true);
    expect(isValidPositiveNumber(5000)).toBe(true);
  });

  it("rejects zero", () => {
    expect(isValidPositiveNumber(0)).toBe(false);
  });

  it("rejects negative numbers", () => {
    expect(isValidPositiveNumber(-1)).toBe(false);
  });

  it("rejects non-number types", () => {
    expect(isValidPositiveNumber("5000")).toBe(false);
    expect(isValidPositiveNumber(null)).toBe(false);
    expect(isValidPositiveNumber(undefined)).toBe(false);
    expect(isValidPositiveNumber(true)).toBe(false);
  });
});

describe("validateImportPayload with full config fields", () => {
  it("accepts payload with all settings", () => {
    const result = validateImportPayload({
      homepage: "https://home.com",
      configs: [],
      bookmarkRules: [],
      bookmarkFolderName: "my-folder",
      historyAliasLimit: 5000,
      historyEntryLimit: 20,
      githubOrgThreshold: 3,
    });
    expect(result.valid).toBe(true);
  });

  it("accepts payload with only required configs (backward-compatible)", () => {
    const result = validateImportPayload({ configs: [] });
    expect(result.valid).toBe(true);
  });

  it("accepts payload with partial settings", () => {
    const result = validateImportPayload({
      configs: [{ from: "a", to: "https://a.com" }],
      bookmarkFolderName: "custom",
    });
    expect(result.valid).toBe(true);
  });
});

describe("buildExportPayload with bookmarkRules", () => {
  it("includes bookmarkRules when provided", () => {
    const rules = [
      { id: "r1", name: "initech docs", historyKeywords: ["initech.com"], enabled: true },
    ];
    const payload = buildExportPayload("https://home.com", [{ from: "a", to: "https://a.com" }], {
      bookmarkRules: rules,
    });
    expect(payload.bookmarkRules).toEqual(rules);
  });

  it("defaults bookmarkRules to empty array when not provided", () => {
    const payload = buildExportPayload("https://home.com", []);
    expect(payload.bookmarkRules).toEqual([]);
  });

  it("round-trips bookmarkRules through JSON", () => {
    const rules = [
      {
        id: "r1",
        name: "globex wiki",
        historyKeywords: ["globex.example.com"],
        urlMatchPattern: "^https?://globex\\.example\\.com/wiki/",
        dedupeKeyPattern: "globex\\.example\\.com/wiki/([^/?#]+)",
        titleStripPatterns: ["\\s*-\\s*Globex Wiki.*$"],
        sortField: "title",
        sortDirection: "asc",
        enabled: true,
      },
    ];
    const payload = buildExportPayload("https://home.com", [], { bookmarkRules: rules });
    const json = JSON.stringify(payload, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed.bookmarkRules).toEqual(rules);
  });
});
