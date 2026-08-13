/**
 * Tests for historyUtils — history tracking + alias/entry limits.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, storageData, reset } = createChromeMock();
vi.stubGlobal("chrome", chrome);

const {
  getHistory,
  getHistoryAsFlat,
  getHistoryAliasLimit,
  setHistoryAliasLimit,
  getHistoryEntryLimit,
  setHistoryEntryLimit,
  addHistoryEntry,
  clearHistory,
} = await import("../src/helpers/historyUtils.js");

describe("historyUtils", () => {
  beforeEach(() => {
    reset();
  });

  describe("getHistory", () => {
    it("returns empty object when nothing stored", async () => {
      expect(await getHistory()).toEqual({});
    });

    it("returns the stored grouped map", async () => {
      storageData.linkHistory = {
        foo: [{ from: "foo", to: "https://f.com", action: "added", date: "2026" }],
      };
      const result = await getHistory();
      expect(result.foo).toBeDefined();
      expect(result.foo[0].to).toBe("https://f.com");
    });

    it("returns empty object when stored value is an array (legacy)", async () => {
      storageData.linkHistory = [];
      expect(await getHistory()).toEqual({});
    });

    it("returns empty object when stored value is null", async () => {
      storageData.linkHistory = null;
      expect(await getHistory()).toEqual({});
    });
  });

  describe("getHistoryAsFlat", () => {
    it("flattens grouped entries and sorts newest-first", async () => {
      storageData.linkHistory = {
        a: [{ from: "a", to: "https://a", action: "added", date: "2026-01-01" }],
        b: [{ from: "b", to: "https://b", action: "added", date: "2026-03-01" }],
      };
      const flat = await getHistoryAsFlat();
      expect(flat).toHaveLength(2);
      expect(flat[0].from).toBe("b");
    });

    it("returns empty array when nothing stored", async () => {
      expect(await getHistoryAsFlat()).toEqual([]);
    });
  });

  describe("limits getters/setters", () => {
    it("returns default alias limit when nothing stored", async () => {
      expect(await getHistoryAliasLimit()).toBe(5000);
    });

    it("returns stored alias limit", async () => {
      storageData.historyAliasLimit = 100;
      expect(await getHistoryAliasLimit()).toBe(100);
    });

    it("setHistoryAliasLimit clamps to minimum 1", async () => {
      await setHistoryAliasLimit(0);
      expect(storageData.historyAliasLimit).toBe(1);
      await setHistoryAliasLimit(-5);
      expect(storageData.historyAliasLimit).toBe(1);
    });

    it("setHistoryAliasLimit floors fractional input", async () => {
      await setHistoryAliasLimit(3.9);
      expect(storageData.historyAliasLimit).toBe(3);
    });

    it("returns default entry limit when nothing stored", async () => {
      expect(await getHistoryEntryLimit()).toBe(20);
    });

    it("returns stored entry limit", async () => {
      storageData.historyEntryLimit = 5;
      expect(await getHistoryEntryLimit()).toBe(5);
    });

    it("setHistoryEntryLimit clamps to minimum 1", async () => {
      await setHistoryEntryLimit(0);
      expect(storageData.historyEntryLimit).toBe(1);
    });
  });

  describe("addHistoryEntry", () => {
    it("creates a new alias bucket on first entry", async () => {
      await addHistoryEntry("foo", "https://foo.com", "added");
      const history = storageData.linkHistory;
      expect(history).toBeDefined();
      const key = Object.keys(history)[0];
      expect(history[key]).toHaveLength(1);
      expect(history[key][0].to).toBe("https://foo.com");
      expect(history[key][0].action).toBe("added");
    });

    it("prepends new entries to the bucket", async () => {
      await addHistoryEntry("foo", "https://v1.com", "added");
      await addHistoryEntry("foo", "https://v2.com", "edited");
      const history = storageData.linkHistory;
      const key = Object.keys(history)[0];
      expect(history[key]).toHaveLength(2);
      expect(history[key][0].to).toBe("https://v2.com");
      expect(history[key][1].to).toBe("https://v1.com");
    });

    it("trims per-alias bucket to the configured entry limit", async () => {
      storageData.historyEntryLimit = 2;
      await addHistoryEntry("foo", "https://1.com", "added");
      await addHistoryEntry("foo", "https://2.com", "edited");
      await addHistoryEntry("foo", "https://3.com", "edited");
      const history = storageData.linkHistory;
      const key = Object.keys(history)[0];
      expect(history[key]).toHaveLength(2);
      expect(history[key][0].to).toBe("https://3.com");
    });

    it("evicts least-recently-touched aliases when alias limit is exceeded", async () => {
      storageData.historyAliasLimit = 2;
      await addHistoryEntry("first", "https://a.com", "added");
      await new Promise((r) => setTimeout(r, 2));
      await addHistoryEntry("second", "https://b.com", "added");
      await new Promise((r) => setTimeout(r, 2));
      await addHistoryEntry("third", "https://c.com", "added");
      const history = storageData.linkHistory;
      expect(Object.keys(history)).toHaveLength(2);
    });
  });

  describe("clearHistory", () => {
    it("removes the history key from storage", async () => {
      storageData.linkHistory = { foo: [] };
      await clearHistory();
      expect(storageData.linkHistory).toBeUndefined();
    });
  });

  describe("concurrent writes", () => {
    it("keeps every entry when calls overlap", async () => {
      // Each call is a read-modify-write of the whole history object. Fired
      // together they all used to read the same empty snapshot, so the last
      // write discarded the others.
      await Promise.all([
        addHistoryEntry("alpha", "https://alpha.example.com", "added"),
        addHistoryEntry("bravo", "https://bravo.example.com", "added"),
        addHistoryEntry("charlie", "https://charlie.example.com", "added"),
      ]);

      const history = await getHistory();
      expect(Object.keys(history).sort()).toEqual(["||alpha^", "||bravo^", "||charlie^"]);
    });

    it("keeps every entry when the same alias is written concurrently", async () => {
      await Promise.all([
        addHistoryEntry("dup", "https://one.example.com", "added"),
        addHistoryEntry("dup", "https://two.example.com", "edited"),
      ]);

      const history = await getHistory();
      expect(history["||dup^"]).toHaveLength(2);
      expect(history["||dup^"].map((e) => e.to).sort()).toEqual([
        "https://one.example.com",
        "https://two.example.com",
      ]);
    });
  });
});
