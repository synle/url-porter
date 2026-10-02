/** Tests for src/content/raw-formatter.js — floating Format button, menu, toasts, and copy behavior on raw text pages. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** Clipboard writeText spy, reset per test. @type {import("vitest").Mock} */
let writeText;

/**
 * Render a Chrome-style raw text page and run the content scripts against it.
 * @param {string} text - Body text inside the raw <pre>.
 * @param {string} [contentType] - Response content type.
 * @returns {Promise<{root: ShadowRoot, pre: HTMLPreElement}>} The formatter UI root and content <pre>.
 */
async function loadPage(text, contentType = "application/json") {
  document.documentElement.querySelectorAll(":scope > div").forEach((el) => el.remove());
  document.body.innerHTML = "";
  const pre = document.createElement("pre");
  pre.textContent = text;
  document.body.appendChild(pre);
  Object.defineProperty(document, "contentType", {
    value: contentType,
    configurable: true,
  });
  vi.resetModules();
  await import("../src/content/format-detect.js");
  await import("../src/content/raw-formatter.js");
  const host = document.documentElement.querySelector(":scope > div");
  return { root: host.shadowRoot, pre };
}

/**
 * Wait for pending promise callbacks (async format / clipboard) to settle.
 * @returns {Promise<void>}
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * Dispatch a keydown on the document.
 * @param {KeyboardEventInit} init - Key event fields.
 * @returns {void}
 */
const press = (init) =>
  document.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  vi.stubGlobal("chrome", {
    runtime: { getURL: (p) => `file:///nonexistent/${p}` },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Format button", () => {
  it("keeps the 'Format <syntax>' label after formatting instead of switching to Raw", async () => {
    const { root, pre } = await loadPage('{"acme":{"id":1}}');
    const main = root.querySelector(".main");
    expect(main.textContent).toBe("Format JSON");
    main.click();
    await flush();
    expect(pre.textContent).toBe('{\n  "acme": {\n    "id": 1\n  }\n}');
    expect(main.textContent).toBe("Format JSON");
    main.click();
    await flush();
    expect(main.textContent).toBe("Format JSON");
    expect(pre.textContent).toBe('{\n  "acme": {\n    "id": 1\n  }\n}');
  });

  it("is anchored top-right with a menu that drops down", async () => {
    const { root } = await loadPage("{}");
    const host = /** @type {HTMLElement} */ (root.host);
    expect(host.style.top).toBe("12px");
    expect(host.style.right).toBe("12px");
    expect(host.style.bottom).toBe("");
    expect(root.querySelector("style").textContent).toMatch(/\.menu \{[^}]*top:100%/);
  });

  it("offers a single combined JS/TS option", async () => {
    const { root } = await loadPage("{}");
    root.querySelector(".caret").click();
    const labels = [...root.querySelectorAll(".menu div")].map((d) => d.textContent);
    expect(labels).toContain("JS/TS");
    expect(labels).not.toContain("JS");
    expect(labels).not.toContain("TS");
  });

  it("formats XML picked from the menu and toasts the action", async () => {
    const { root, pre } = await loadPage("<a><b>hi</b></a>", "text/plain");
    root.querySelector(".caret").click();
    const xml = [...root.querySelectorAll(".menu div")].find((d) => d.textContent === "XML");
    xml.click();
    await flush();
    expect(pre.textContent).toBe("<a>\n  <b>hi</b>\n</a>\n");
    expect(root.querySelector(".main").textContent).toBe("Format XML");
    expect(root.querySelector(".toast").textContent).toBe("Content formatted as XML");
  });

  it("shows an error toast and keeps the original text when formatting fails", async () => {
    const { root, pre } = await loadPage("{not json", "application/json");
    root.querySelector(".main").click();
    // Prettier's vendored bundle is absent in tests, so the fallback import rejects.
    await vi.waitFor(() => expect(root.querySelector(".err").hidden).toBe(false));
    expect(pre.textContent).toBe("{not json");
    expect(root.querySelector(".toast").textContent).toBe("Could not format as JSON");
  });
});

describe("toasts", () => {
  it("announces word wrap OFF then ON and toggles the pre's white-space", async () => {
    const { root, pre } = await loadPage("{}");
    expect(pre.style.whiteSpace).toBe("pre-wrap");
    press({ key: "Enter", shiftKey: true, metaKey: true });
    expect(pre.style.whiteSpace).toBe("pre");
    expect(root.querySelector(".toast").textContent).toBe("Word wrap OFF");
    press({ key: "Enter", shiftKey: true, ctrlKey: true });
    expect(root.querySelector(".toast").textContent).toBe("Word wrap ON");
  });

  it("hides after 2 seconds, and a new toast restarts the timer", async () => {
    const { root } = await loadPage("{}");
    vi.useFakeTimers();
    const toast = root.querySelector(".toast");
    press({ key: "Enter", shiftKey: true, metaKey: true });
    vi.advanceTimersByTime(1500);
    press({ key: "Enter", shiftKey: true, metaKey: true });
    expect(toast.textContent).toBe("Word wrap ON");
    vi.advanceTimersByTime(1500);
    expect(toast.hidden).toBe(false);
    vi.advanceTimersByTime(500);
    expect(toast.hidden).toBe(true);
  });

  it("is non-selectable", async () => {
    const { root } = await loadPage("{}");
    expect(root.querySelector("style").textContent).toContain(
      ":host, * { user-select:none; -webkit-user-select:none; }",
    );
  });
});

describe("copy", () => {
  it("Alt+C copies the full displayed text verbatim, whitespace included", async () => {
    const text = '{\n    "pluto":   [1,  2]\n}';
    const { root } = await loadPage(text, "text/plain");
    press({ code: "KeyC", altKey: true });
    await flush();
    expect(writeText).toHaveBeenCalledWith(text);
    expect(root.querySelector(".toast").textContent).toBe("All content copied to clipboard");
  });

  it("Alt+S formats via the shortcut", async () => {
    const { pre } = await loadPage('{"orbit":1}');
    press({ code: "KeyS", altKey: true });
    await flush();
    expect(pre.textContent).toBe('{\n  "orbit": 1\n}');
  });

  it("native copy of a selection writes plain text only", async () => {
    const { pre } = await loadPage('{\n  "falcon": 1\n}', "text/plain");
    const range = document.createRange();
    range.selectNodeContents(pre);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const setData = vi.fn();
    const evt = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(evt, "clipboardData", { value: { setData } });
    document.dispatchEvent(evt);
    expect(setData).toHaveBeenCalledWith("text/plain", '{\n  "falcon": 1\n}');
    expect(evt.defaultPrevented).toBe(true);
  });
});
