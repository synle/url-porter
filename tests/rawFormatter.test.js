/** Tests for src/content/raw-formatter.js — floating Format button, menu, toasts, and copy behavior on raw text pages. */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
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
  it("keeps the 'Format <syntax>' label and a second click reverts to the original", async () => {
    const { root, pre } = await loadPage('{"acme":{"id":1}}');
    const main = root.querySelector(".main");
    expect(main.textContent).toBe("Format JSON/JSON5");
    main.click();
    await flush();
    expect(pre.textContent).toBe('{\n  "acme": {\n    "id": 1\n  }\n}');
    expect(main.textContent).toBe("Format JSON/JSON5");
    expect(root.querySelector(".toast").textContent).toBe("Content formatted as JSON/JSON5");
    main.click();
    await flush();
    expect(main.textContent).toBe("Format JSON/JSON5");
    expect(pre.textContent).toBe('{"acme":{"id":1}}');
    expect(root.querySelector(".toast").textContent).toBe("Reverted to original (unformatted)");
  });

  it("lists Format, Wrap, Copy, Download with shortcuts above the syntax list", async () => {
    const { root } = await loadPage("{}");
    const labels = [...root.querySelectorAll(".menu div")].slice(0, 5).map((d) => d.textContent);
    expect(labels).toEqual([
      "\u2003 Format JSON/JSON5 (Alt + S / Option + S)",
      "\u2713 Wrap lines (Ctrl + Shift + Enter / Cmd + Shift + Enter)",
      "\u2003 Dark mode (Shift + Esc)",
      "\u2003 Copy to clipboard (Ctrl + C / Cmd + C)",
      "\u2003 Download (Ctrl + S / Cmd + S)",
    ]);
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
    expect(root.querySelector(".toast").textContent).toBe("Could not format as JSON/JSON5");
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

describe("markdown preview", () => {
  /**
   * Find a menu item by label, ignoring the check-mark column.
   * @param {ShadowRoot} root - Formatter UI root.
   * @param {string} label - Item text without the check-mark column.
   * @returns {HTMLElement | undefined} Matching item.
   */
  const item = (root, label) =>
    [...root.querySelectorAll(".menu div")].find(
      (d) => d.textContent.replace(/^[\u2713\u2003] /, "").replace(/ \(.*\)$/, "") === label,
    );

  it("offers Preview Markdown only when Markdown is selected", async () => {
    const { root } = await loadPage("{}");
    expect(item(root, "Preview Markdown")).toBeUndefined();
    item(root, "Markdown").click();
    await vi.waitFor(() => expect(item(root, "Preview Markdown")).toBeDefined());
  });

  it("renders the original markdown as HTML in a script-less sandboxed frame and toggles back", async () => {
    vi.stubGlobal("chrome", {
      runtime: {
        getURL: (p) =>
          p === "vendor/marked/marked.esm.js"
            ? pathToFileURL(resolve("node_modules/marked/lib/marked.esm.js")).href
            : `file:///nonexistent/${p}`,
      },
    });
    const { root, pre } = await loadPage("# Acme\n\n- **FALCON**\n", "text/markdown");
    const frame = document.querySelector("iframe");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-scripts");
    item(root, "Preview Markdown").click();
    await vi.waitFor(() => expect(frame.style.display).toBe("block"));
    expect(frame.srcdoc).toContain("<h1>Acme</h1>");
    expect(frame.srcdoc).toContain("<strong>FALCON</strong>");
    expect(pre.style.display).toBe("none");
    expect(root.querySelector(".toast").textContent).toBe("Markdown preview ON");
    item(root, "Preview Markdown").click();
    await flush();
    expect(frame.style.display).toBe("none");
    expect(pre.style.display).toBe("block");
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

  it("Alt+S again reverts to the original", async () => {
    const { pre } = await loadPage('{"orbit":1}');
    press({ code: "KeyS", altKey: true });
    await flush();
    press({ code: "KeyS", altKey: true });
    await flush();
    expect(pre.textContent).toBe('{"orbit":1}');
  });
});

describe("download", () => {
  it("Cmd+S downloads the displayed text as-is and toasts its state", async () => {
    const blobs = [];
    URL.createObjectURL = (b) => (blobs.push(b), "blob:acme");
    URL.revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { root } = await loadPage('{"pluto":1}');
    press({ code: "KeyS", metaKey: true });
    const anchors = click.mock.contexts.filter((el) => el instanceof HTMLAnchorElement);
    // Earlier tests' document listeners also fire; the newest page's download runs last.
    expect(anchors.at(-1).href).toBe("blob:acme");
    expect(await blobs.at(-1).text()).toBe('{"pluto":1}');
    expect(root.querySelector(".toast").textContent).toMatch(/^Downloaded original content as /);
    click.mockRestore();
  });
});

describe("theme", () => {
  it("Shift+Escape toggles dark mode on the page and toasts the state", async () => {
    const { root } = await loadPage("{}");
    press({ key: "Escape", shiftKey: true });
    expect(document.body.style.background).toBe("rgb(30, 30, 30)");
    expect(root.querySelector(".toast").textContent).toBe("Dark mode");
    press({ key: "Escape", shiftKey: true });
    expect(root.querySelector(".toast").textContent).toBe("Light mode");
  });
});
