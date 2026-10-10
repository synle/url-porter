/** Tests for src/helpers/selectionViewer.js — selection context menus and hand-off to the viewer page. */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SELECTION_MENU,
  VIEWER_KEEP,
  createSelectionMenus,
  getSelectedText,
  handleSelectionMenuClick,
  updateSelectionMenus,
} from "../src/helpers/selectionViewer.js";

/** Fake chrome.storage.session contents. @type {Record<string, string>} */
let session;

beforeEach(() => {
  session = {};
  vi.stubGlobal("chrome", {
    contextMenus: { create: vi.fn(), update: vi.fn(async () => {}) },
    runtime: { getURL: (p) => `chrome-extension://acme/${p}` },
    scripting: { executeScript: vi.fn() },
    tabs: { create: vi.fn() },
    storage: {
      session: {
        get: vi.fn(async () => ({ ...session })),
        set: vi.fn(async (o) => Object.assign(session, o)),
        remove: vi.fn(async (keys) => keys.forEach((k) => delete session[k])),
      },
    },
  });
});

describe("createSelectionMenus", () => {
  it("adds hidden Markdown / JSON preview items and a Format submenu with one child per syntax", () => {
    createSelectionMenus([
      { id: "json", label: "JSON" },
      { id: "yaml", label: "YAML" },
    ]);
    const calls = chrome.contextMenus.create.mock.calls.map(([o]) => o);
    expect(calls).toEqual([
      {
        id: "selection-preview-markdown",
        title: "Preview Selection as Markdown",
        contexts: ["selection"],
        visible: false,
      },
      {
        id: "selection-view-json",
        title: "View Selection as JSON Tree",
        contexts: ["selection"],
        visible: false,
      },
      { id: "selection-format", title: "Format Selection as", contexts: ["selection"] },
      {
        id: "selection-format:json",
        parentId: "selection-format",
        title: "JSON",
        contexts: ["selection"],
      },
      {
        id: "selection-format:yaml",
        parentId: "selection-format",
        title: "YAML",
        contexts: ["selection"],
      },
    ]);
  });
});

describe("updateSelectionMenus", () => {
  it("shows only the JSON item for a JSON selection", async () => {
    await updateSelectionMenus({ json: true, markdown: false });
    expect(chrome.contextMenus.update.mock.calls).toEqual([
      ["selection-preview-markdown", { visible: false }],
      ["selection-view-json", { visible: true }],
    ]);
  });

  it("shows only the Markdown item for a Markdown selection", async () => {
    await updateSelectionMenus({ json: false, markdown: true });
    expect(chrome.contextMenus.update.mock.calls).toEqual([
      ["selection-preview-markdown", { visible: true }],
      ["selection-view-json", { visible: false }],
    ]);
  });

  it("hides both for a non-boolean payload", async () => {
    await updateSelectionMenus({ json: "yes", markdown: 1 });
    expect(chrome.contextMenus.update.mock.calls).toEqual([
      ["selection-preview-markdown", { visible: false }],
      ["selection-view-json", { visible: false }],
    ]);
  });
});

describe("getSelectedText", () => {
  it("returns the injected page selection, keeping newlines", async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: "# Acme\n\n- FALCON" }]);
    const text = await getSelectedText({ selectionText: "# Acme - FALCON", frameId: 3 }, { id: 7 });
    expect(text).toBe("# Acme\n\n- FALCON");
    expect(chrome.scripting.executeScript.mock.calls[0][0].target).toEqual({
      tabId: 7,
      frameIds: [3],
    });
  });

  it("falls back to selectionText when injection is blocked", async () => {
    chrome.scripting.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));
    expect(await getSelectedText({ selectionText: "PLUTO" }, { id: 1 })).toBe("PLUTO");
  });

  it("falls back to selectionText when there is no tab", async () => {
    expect(await getSelectedText({ selectionText: "ORBIT" }, undefined)).toBe("ORBIT");
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });
});

describe("handleSelectionMenuClick", () => {
  it("opens the viewer in markdown mode next to the source tab with the text stashed", async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: "**Globex**" }]);
    const handled = await handleSelectionMenuClick(
      { menuItemId: SELECTION_MENU.preview },
      { id: 2, index: 4 },
      1000,
    );
    expect(handled).toBe(true);
    const { url, index } = chrome.tabs.create.mock.calls[0][0];
    expect(index).toBe(5);
    const params = new URL(url).searchParams;
    expect(url.startsWith("chrome-extension://acme/viewer/textview.html?")).toBe(true);
    expect(params.get("mode")).toBe("markdown");
    expect(session[params.get("key")]).toBe("**Globex**");
  });

  it("passes the chosen syntax in format mode", async () => {
    await handleSelectionMenuClick(
      { menuItemId: "selection-format:yaml", selectionText: "a: 1" },
      undefined,
      1,
    );
    const params = new URL(chrome.tabs.create.mock.calls[0][0].url).searchParams;
    expect(params.get("mode")).toBe("format");
    expect(params.get("lang")).toBe("yaml");
    expect(chrome.tabs.create.mock.calls[0][0].index).toBeUndefined();
  });

  it("opens the viewer in json mode for the JSON tree item", async () => {
    await handleSelectionMenuClick(
      { menuItemId: "selection-view-json", selectionText: '{"team":"ORBIT"}' },
      undefined,
      1,
    );
    const params = new URL(chrome.tabs.create.mock.calls[0][0].url).searchParams;
    expect(params.get("mode")).toBe("json");
    expect(session[params.get("key")]).toBe('{"team":"ORBIT"}');
  });

  it("ignores other menu items", async () => {
    expect(await handleSelectionMenuClick({ menuItemId: "add-to-url-porter" }, {})).toBe(false);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("keeps only the newest handed-off selections", async () => {
    for (let t = 1; t <= VIEWER_KEEP + 3; t++) {
      await handleSelectionMenuClick(
        { menuItemId: SELECTION_MENU.preview, selectionText: `n${t}` },
        undefined,
        t,
      );
    }
    const kept = Object.values(session).sort();
    expect(kept).toHaveLength(VIEWER_KEEP);
    expect(kept).not.toContain("n1");
    expect(kept).toContain("n13");
  });
});
