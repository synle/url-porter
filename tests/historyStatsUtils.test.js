/**
 * Tests for historyStatsUtils — groupHistoryItems function.
 */

import { describe, it, expect } from "vitest";
import { groupHistoryItems } from "../src/helpers/historyStatsUtils.js";

describe("groupHistoryItems", () => {
  it("returns empty array for empty input", () => {
    expect(groupHistoryItems([])).toEqual([]);
  });

  it("groups a single URL without query string as-is", () => {
    const result = groupHistoryItems([{ url: "https://example.com/page", title: "Acme Page", visitCount: 5, lastVisitTime: 1000 }]);
    expect(result).toHaveLength(1);
    expect(result[0].strippedUrl).toBe("https://example.com/page");
    expect(result[0].title).toBe("Acme Page");
    expect(result[0].totalVisitCount).toBe(5);
    expect(result[0].variants).toHaveLength(1);
    expect(result[0].variants[0].url).toBe("https://example.com/page");
  });

  it("groups URLs with same origin+pathname but different query strings", () => {
    const result = groupHistoryItems([
      { url: "https://globex.com/search?q=foo", title: "Globex - foo", visitCount: 3, lastVisitTime: 1000 },
      { url: "https://globex.com/search?q=bar", title: "Globex - bar", visitCount: 7, lastVisitTime: 2000 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].strippedUrl).toBe("https://globex.com/search");
    expect(result[0].totalVisitCount).toBe(10);
    expect(result[0].variants).toHaveLength(2);
  });

  it("groups URLs with same origin+pathname but different hash fragments", () => {
    const result = groupHistoryItems([
      { url: "https://initech.com/docs#section1", title: "Initech Docs S1", visitCount: 2, lastVisitTime: 500 },
      { url: "https://initech.com/docs#section2", title: "Initech Docs S2", visitCount: 4, lastVisitTime: 1500 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].strippedUrl).toBe("https://initech.com/docs");
    expect(result[0].totalVisitCount).toBe(6);
    expect(result[0].variants).toHaveLength(2);
    expect(result[0].variants[0].url).toBe("https://initech.com/docs#section1");
    expect(result[0].variants[1].url).toBe("https://initech.com/docs#section2");
  });

  it("picks title from the most recently visited variant", () => {
    const result = groupHistoryItems([
      { url: "https://acme.com/page?v=1", title: "Old Title", visitCount: 1, lastVisitTime: 100 },
      { url: "https://acme.com/page?v=2", title: "New Title", visitCount: 1, lastVisitTime: 9999 },
      { url: "https://acme.com/page?v=3", title: "Middle Title", visitCount: 1, lastVisitTime: 500 },
    ]);
    expect(result[0].title).toBe("New Title");
  });

  it("keeps existing title when newer variant has empty title", () => {
    const result = groupHistoryItems([
      { url: "https://globex.com/app?a=1", title: "Globex App", visitCount: 2, lastVisitTime: 100 },
      { url: "https://globex.com/app?a=2", title: "", visitCount: 3, lastVisitTime: 9999 },
    ]);
    expect(result[0].title).toBe("Globex App");
  });

  it("sums visitCount across all variants", () => {
    const result = groupHistoryItems([
      { url: "https://initech.com/?tab=1", title: "Initech", visitCount: 10, lastVisitTime: 1 },
      { url: "https://initech.com/?tab=2", title: "Initech", visitCount: 20, lastVisitTime: 2 },
      { url: "https://initech.com/?tab=3", title: "Initech", visitCount: 30, lastVisitTime: 3 },
    ]);
    expect(result[0].totalVisitCount).toBe(60);
  });

  it("keeps different paths as separate groups", () => {
    const result = groupHistoryItems([
      { url: "https://acme.com/a", title: "A", visitCount: 1, lastVisitTime: 1 },
      { url: "https://acme.com/b", title: "B", visitCount: 2, lastVisitTime: 2 },
    ]);
    expect(result).toHaveLength(2);
  });

  it("handles URLs that fail URL parsing gracefully", () => {
    const result = groupHistoryItems([{ url: "not-a-valid-url", title: "Bad URL", visitCount: 1, lastVisitTime: 1 }]);
    expect(result).toHaveLength(1);
    expect(result[0].strippedUrl).toBe("not-a-valid-url");
    expect(result[0].title).toBe("Bad URL");
  });

  it("handles chrome:// and about: URLs without crash", () => {
    const result = groupHistoryItems([
      { url: "chrome://settings/", title: "Settings", visitCount: 5, lastVisitTime: 1 },
      { url: "about:blank", title: "", visitCount: 1, lastVisitTime: 2 },
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((e) => e.title === "Settings")).toBeTruthy();
  });

  it("skips items with no url", () => {
    const result = groupHistoryItems([{ title: "No URL", visitCount: 1, lastVisitTime: 1 }]);
    expect(result).toHaveLength(0);
  });

  it("defaults missing fields to safe values", () => {
    const result = groupHistoryItems([{ url: "https://globex.com/" }]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("");
    expect(result[0].totalVisitCount).toBe(0);
    expect(result[0].lastVisitTime).toBe(0);
    expect(result[0].variants[0].visitCount).toBe(0);
  });
});
