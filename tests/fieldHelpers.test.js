/**
 * Tests for fieldHelpers — placeholder + helper text constants.
 */

import { describe, it, expect } from "vitest";
import { ALIAS_PLACEHOLDER, ALIAS_HELPER_TEXT, URL_PLACEHOLDER, URL_HELPER_TEXT } from "../src/helpers/fieldHelpers.js";

describe("fieldHelpers", () => {
  it("exposes a non-empty alias placeholder", () => {
    expect(typeof ALIAS_PLACEHOLDER).toBe("string");
    expect(ALIAS_PLACEHOLDER.length).toBeGreaterThan(0);
  });

  it("exposes alias helper text that documents pattern syntax", () => {
    expect(ALIAS_HELPER_TEXT).toContain("||");
    expect(ALIAS_HELPER_TEXT).toContain("^");
  });

  it("exposes a non-empty URL placeholder", () => {
    expect(URL_PLACEHOLDER).toMatch(/^https?:\/\//);
  });

  it("exposes URL helper text", () => {
    expect(URL_HELPER_TEXT.length).toBeGreaterThan(0);
  });
});
