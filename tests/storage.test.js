/**
 * Tests for storage helpers — chrome.storage wrappers and pure utilities.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, storageData, reset } = createChromeMock();
vi.stubGlobal("chrome", chrome);

const storage = await import("../src/helpers/storage.js");

describe("storage", () => {
  beforeEach(() => {
    reset();
  });

  describe("stripJsonComments", () => {
    it("removes single-line // comments", () => {
      expect(storage.stripJsonComments("[1, 2] // trailing")).toBe("[1, 2]");
    });

    it("removes block comments", () => {
      expect(storage.stripJsonComments("/* hi */ [1, 2]")).toBe("[1, 2]");
    });

    it("preserves comment-like text inside strings", () => {
      expect(storage.stripJsonComments('"//not a comment"')).toBe('"//not a comment"');
    });

    it("handles escaped quotes inside strings", () => {
      const input = '"escaped \\"//still inside\\" "';
      expect(storage.stripJsonComments(input)).toContain("//still inside");
    });
  });

  describe("isValidUrl", () => {
    it("returns true for http", () => {
      expect(storage.isValidUrl("http://example.com")).toBe(true);
    });

    it("returns true for https", () => {
      expect(storage.isValidUrl("https://example.com")).toBe(true);
    });

    it("returns false for non-http(s) protocols", () => {
      expect(storage.isValidUrl("javascript:alert(1)")).toBe(false);
      expect(storage.isValidUrl("ftp://example.com")).toBe(false);
    });

    it("returns false for invalid URL strings", () => {
      expect(storage.isValidUrl("not a url")).toBe(false);
      expect(storage.isValidUrl("")).toBe(false);
    });
  });

  describe("getConfig", () => {
    it("returns empty array when nothing stored", async () => {
      expect(await storage.getConfig()).toEqual([]);
    });

    it("returns stored config", async () => {
      storageData.jsonConfig = [{ from: "a", to: "https://a" }];
      const result = await storage.getConfig();
      expect(result).toHaveLength(1);
    });

    it("returns [] when chrome.runtime.lastError is set", async () => {
      chrome.runtime.lastError = { message: "boom" };
      chrome.storage.sync.get.mockImplementationOnce((key, cb) => {
        cb({});
      });
      const result = await storage.getConfig();
      expect(result).toEqual([]);
    });

    it("returns [] when chrome.storage.sync.get throws", async () => {
      chrome.storage.sync.get.mockImplementationOnce(() => {
        throw new Error("boom");
      });
      const result = await storage.getConfig();
      expect(result).toEqual([]);
    });
  });

  describe("setConfig", () => {
    it("parses JSON and persists to chrome.storage.sync", async () => {
      await storage.setConfig('[{"from":"a","to":"https://a"}]');
      expect(storageData.jsonConfig).toHaveLength(1);
    });

    it("falls back to [] when input is empty", async () => {
      await storage.setConfig("");
      expect(storageData.jsonConfig).toEqual([]);
    });

    it("strips comments before parsing", async () => {
      await storage.setConfig("[1, 2] // trailing");
      expect(storageData.jsonConfig).toEqual([1, 2]);
    });

    it("rejects on invalid JSON", async () => {
      await expect(storage.setConfig("not json")).rejects.toMatch(/Invalid JSON/);
    });

    it("rejects on chrome.runtime.lastError after set", async () => {
      chrome.storage.sync.set.mockImplementationOnce((obj, cb) => {
        chrome.runtime.lastError = { message: "quota" };
        cb();
      });
      await expect(storage.setConfig("[]")).rejects.toMatch(/Storage error/);
      chrome.runtime.lastError = null;
    });
  });

  describe("homepage URL", () => {
    it("returns empty string when not set", async () => {
      expect(await storage.getHomepageUrl()).toBe("");
    });

    it("round-trips through saveHomepageUrl", async () => {
      await storage.saveHomepageUrl("https://home.example.com");
      expect(storageData.homepageUrl).toBe("https://home.example.com");
      expect(await storage.getHomepageUrl()).toBe("https://home.example.com");
    });
  });

  describe("sync URL", () => {
    it("returns default sync URL when not set", async () => {
      expect(await storage.getSyncUrl()).toBe(storage.DEFAULT_SYNC_URL);
    });

    it("round-trips through setSyncUrlToStorage", async () => {
      await storage.setSyncUrlToStorage("https://my.sync.example.com");
      expect(storageData.syncUrl).toBe("https://my.sync.example.com");
      expect(await storage.getSyncUrl()).toBe("https://my.sync.example.com");
    });
  });

  describe("bookmark folder name", () => {
    it("returns 'url-porter' when not set", async () => {
      delete storageData.bookmarkFolderName;
      expect(await storage.getBookmarkFolderName()).toBe("url-porter");
    });

    it("round-trips through setBookmarkFolderName", async () => {
      await storage.setBookmarkFolderName("my-folder");
      expect(await storage.getBookmarkFolderName()).toBe("my-folder");
    });
  });

  describe("github org threshold", () => {
    it("returns 3 when not set", async () => {
      delete storageData.githubOrgThreshold;
      expect(await storage.getGithubOrgThreshold()).toBe(3);
    });

    it("round-trips through setGithubOrgThreshold", async () => {
      await storage.setGithubOrgThreshold(7);
      expect(await storage.getGithubOrgThreshold()).toBe(7);
    });
  });

  describe("PR statuses", () => {
    it("returns empty object when not set", async () => {
      delete storageData.prStatuses;
      expect(await storage.getPrStatuses()).toEqual({});
    });

    it("setPrStatus merges with existing map", async () => {
      await storage.setPrStatus("https://github.com/a/b/pull/1", "merged");
      await storage.setPrStatus("https://github.com/a/b/pull/2", "open");
      const result = await storage.getPrStatuses();
      expect(result["https://github.com/a/b/pull/1"]).toBe("merged");
      expect(result["https://github.com/a/b/pull/2"]).toBe("open");
    });
  });

  describe("Jira statuses", () => {
    it("returns empty object when not set", async () => {
      delete storageData.jiraStatuses;
      expect(await storage.getJiraStatuses()).toEqual({});
    });

    it("setJiraStatus merges with existing map", async () => {
      await storage.setJiraStatus("https://acme.atlassian.net/browse/FOO-1", "in_progress");
      const result = await storage.getJiraStatuses();
      expect(result["https://acme.atlassian.net/browse/FOO-1"]).toBe("in_progress");
    });
  });

  describe("stats settings", () => {
    it("getStatsVisitThreshold default 3", async () => {
      delete storageData.statsVisitThreshold;
      expect(await storage.getStatsVisitThreshold()).toBe(3);
    });

    it("setStatsVisitThreshold round-trip", async () => {
      await storage.setStatsVisitThreshold(10);
      expect(await storage.getStatsVisitThreshold()).toBe(10);
    });

    it("getStatsMaxResults default 200", async () => {
      delete storageData.statsMaxResults;
      expect(await storage.getStatsMaxResults()).toBe(200);
    });

    it("setStatsMaxResults round-trip", async () => {
      await storage.setStatsMaxResults(500);
      expect(await storage.getStatsMaxResults()).toBe(500);
    });

    it("getStatsLookbackMonths default 6", async () => {
      delete storageData.statsLookbackMonths;
      expect(await storage.getStatsLookbackMonths()).toBe(6);
    });

    it("setStatsLookbackMonths round-trip", async () => {
      await storage.setStatsLookbackMonths(12);
      expect(await storage.getStatsLookbackMonths()).toBe(12);
    });
  });

  describe("bookmark rules", () => {
    it("returns [] when not set", async () => {
      expect(await storage.getBookmarkRules()).toEqual([]);
    });

    it("round-trips through setBookmarkRules", async () => {
      const rules = [{ id: "1", name: "test", enabled: true }];
      await storage.setBookmarkRules(rules);
      expect(await storage.getBookmarkRules()).toEqual(rules);
    });
  });
});
