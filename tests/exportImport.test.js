/**
 * Tests for export/import config functionality.
 * Validates the data format used for export/import JSON files.
 */

import { describe, it, expect } from "vitest";

/**
 * Builds an export payload from config entries and homepage URL.
 * Matches the sync server format: {homepage, configs}.
 *
 * @param {string} homepage - The homepage URL
 * @param {Array<{from: string, to: string}>} configs - The config entries
 * @returns {{homepage: string, configs: Array<{from: string, to: string}>}}
 */
function buildExportPayload(homepage, configs) {
  return { homepage, configs };
}

/**
 * Validates an imported config payload.
 * Must contain a "configs" array; "homepage" is optional.
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

describe("buildExportPayload", () => {
  it("produces the correct shape with homepage and configs", () => {
    const payload = buildExportPayload("https://example.com", [{ from: "gh", to: "https://github.com" }]);
    expect(payload).toEqual({
      homepage: "https://example.com",
      configs: [{ from: "gh", to: "https://github.com" }],
    });
  });

  it("works with empty configs", () => {
    const payload = buildExportPayload("", []);
    expect(payload).toEqual({ homepage: "", configs: [] });
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
});
