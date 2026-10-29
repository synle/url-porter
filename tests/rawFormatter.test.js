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
 * @returns {KeyboardEvent} Dispatched event, including its cancellation state.
 */
const press = (init) => {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  vi.spyOn(document, "addEventListener");
  window.getSelection().removeAllRanges();
  document.execCommand = vi.fn(() => false);
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  vi.stubGlobal("chrome", {
    runtime: { id: "acme", getURL: (p) => `file:///nonexistent/${p}` },
  });
});

afterEach(() => {
  for (const [type, listener, options] of document.addEventListener.mock.calls) {
    document.removeEventListener(type, listener, options);
  }
  vi.restoreAllMocks();
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
    const rows = [...root.querySelectorAll(".menu div.action")].map((d) => [
      d.querySelector(".check").textContent,
      d.querySelector(".label").textContent,
      d.querySelector(".kbd").textContent,
    ]);
    expect(rows).toMatchInlineSnapshot(`
      [
        [
          "",
          "Format JSON/JSON5",
          "Alt + S / Option + S",
        ],
        [
          "✓",
          "Wrap lines",
          "Ctrl + Shift + Enter / Cmd + Shift + Enter",
        ],
        [
          "",
          "Dark mode",
          "Shift + Esc",
        ],
        [
          "",
          "View JSON Tree",
          "Alt + M / Option + M",
        ],
        [
          "",
          "Copy to clipboard",
          "Ctrl + C / Cmd + C",
        ],
        [
          "",
          "Download",
          "Ctrl + S / Cmd + S",
        ],
      ]
    `);
    expect(root.querySelector("style").textContent).toMatch(/\.menu \.kbd \{[^}]*opacity:\.55/);
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
    await vi.waitFor(() =>
      expect(root.querySelector(".toast").textContent).toMatch(
        /^Could not format as JSON\/JSON5: \S/,
      ),
    );
    expect(pre.textContent).toBe("{not json");
    expect(root.querySelector(".err")).toBeNull();
  });

  it("tells the user to reload when the extension was updated under the page", async () => {
    vi.stubGlobal("chrome", {
      runtime: { getURL: (p) => `file:///nonexistent/${p}` },
    });
    const { root } = await loadPage("{not json", "application/json");
    root.querySelector(".main").click();
    await vi.waitFor(() =>
      expect(root.querySelector(".toast").textContent).toBe(
        "Could not format as JSON/JSON5: URL Porter was updated, reload this page",
      ),
    );
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
   * Find a menu item by label: an action row's `.label` column, or a syntax row's text.
   * @param {ShadowRoot} root - Formatter UI root.
   * @param {string} label - Label text.
   * @returns {HTMLElement | undefined} Matching item.
   */
  const item = (root, label) =>
    [...root.querySelectorAll(".menu div")].find(
      (d) => (d.querySelector(".label")?.textContent ?? d.textContent) === label,
    );

  it("offers Preview Markdown only when Markdown is selected", async () => {
    const { root } = await loadPage("{}");
    expect(item(root, "Preview Markdown")).toBeUndefined();
    item(root, "Markdown").click();
    await vi.waitFor(() => expect(item(root, "Preview Markdown")).toBeDefined());
  });

  /**
   * Stub chrome so marked loads from node_modules and the Markdown page maps to an inert about:blank.
   * @returns {void}
   */
  const stubMarked = () =>
    vi.stubGlobal("chrome", {
      runtime: {
        id: "acme",
        getURL: (p) =>
          p === "vendor/marked/marked.esm.js"
            ? pathToFileURL(resolve("node_modules/marked/lib/marked.esm.js")).href
            : p === "viewer/mdview.html"
              ? "about:blank#mdview"
              : `chrome-extension://acme/${p}`,
      },
    });

  /**
   * The newest Markdown preview frame (toolbars from earlier tests keep their listeners).
   * @returns {HTMLIFrameElement|undefined} The frame.
   */
  const mdFrame = () => [...document.querySelectorAll('iframe[title="Markdown preview"]')].at(-1);

  it("renders into the sandboxed Markdown page (scripts allowed, never same-origin) and toggles back", async () => {
    stubMarked();
    const { root, pre } = await loadPage("# Acme\n\n- **FALCON**\n", "text/markdown");
    item(root, "Preview Markdown").click();
    await vi.waitFor(() => expect(mdFrame()?.style.display).toBe("block"));
    const frame = mdFrame();
    expect(frame.src).toBe("about:blank#mdview");
    expect(frame.getAttribute("sandbox").split(" ")).toMatchInlineSnapshot(`
      [
        "allow-scripts",
        "allow-popups",
        "allow-popups-to-escape-sandbox",
      ]
    `);
    const post = vi.spyOn(frame.contentWindow, "postMessage");
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "url-porter:md-view:ready" },
        source: frame.contentWindow,
      }),
    );
    const [msg, target] = post.mock.calls.at(-1);
    expect(target).toBe("*");
    expect(msg.type).toBe("url-porter:md-view");
    expect(msg.html).toContain("<h1>Acme</h1>");
    expect(msg.html).toContain("<strong>FALCON</strong>");
    expect(msg.html).toContain("--fg:#000;--bg:#fff;--link:#0645ad;");
    expect(pre.style.display).toBe("none");
    expect(root.querySelector(".toast").textContent).toBe("Markdown preview ON");
    item(root, "Preview Markdown").click();
    await flush();
    expect(frame.style.display).toBe("none");
    expect(pre.style.display).toBe("block");
  });

  describe("on a CSP-sandboxed page, where the page's sandbox blocks scripts in child frames", () => {
    beforeEach(() => {
      Object.defineProperty(window, "origin", {
        value: "null",
        configurable: true,
      });
    });
    afterEach(() => {
      delete window.origin;
    });

    it("falls back to a script-less srcdoc preview", async () => {
      stubMarked();
      const { root } = await loadPage("# Globex\n", "text/markdown");
      item(root, "Preview Markdown").click();
      await vi.waitFor(() => expect(mdFrame()?.srcdoc).toContain("<h1>Globex</h1>"));
      expect(mdFrame().getAttribute("sandbox")).not.toContain("allow-scripts");
      expect(mdFrame().getAttribute("src")).toBeNull();
    });

    it("says the JSON tree is unavailable instead of showing a dead frame", async () => {
      const { root, pre } = await loadPage('{"team":"ORBIT"}');
      item(root, "View JSON Tree").click();
      await flush();
      expect(root.querySelector(".toast").textContent).toBe(
        "JSON tree is unavailable on this sandboxed page",
      );
      expect(pre.style.display).toBe("block");
    });
  });
});

describe("copy", () => {
  it("falls back to native copy when the Clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    document.execCommand = vi.fn(() => true);
    const { root } = await loadPage("copy me", "text/plain");

    const event = press({ code: "KeyC", altKey: true });

    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(event.defaultPrevented).toBe(false);
    expect(root.querySelector(".toast").textContent).toBe("All content copied to clipboard");
  });

  it("lets Alt+C bubble when both clipboard methods fail", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    document.execCommand = vi.fn(() => false);
    const { root } = await loadPage("copy me", "text/plain");

    const event = press({ code: "KeyC", altKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(root.querySelector(".toast").textContent).toBe("Copy failed");
  });

  it("falls back after async copy rejection and logs its error", async () => {
    const error = new Error("Clipboard permission denied");
    writeText.mockRejectedValue(error);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let copiedText;
    document.execCommand = vi.fn(() => {
      copiedText = String(window.getSelection());
      return true;
    });
    const { root } = await loadPage("  ORBIT\n", "text/plain");
    const event = press({ code: "KeyC", altKey: true });
    await flush();

    expect(event.defaultPrevented).toBe(false);
    expect(copiedText).toBe("  ORBIT\n");
    expect(warn).toHaveBeenCalledWith("url-porter: copy failed", error);
    expect(root.querySelector(".toast").textContent).toBe("All content copied to clipboard");
  });

  it.each([{ ctrlKey: true }, { metaKey: true }])(
    "leaves native copy uncanceled for %j",
    async (modifier) => {
      const { pre } = await loadPage("copy me", "text/plain");

      const event = press({ code: "KeyC", ...modifier });

      expect(event.defaultPrevented).toBe(false);
      expect(String(window.getSelection())).toBe("copy me");
      expect(writeText).not.toHaveBeenCalled();
      expect(pre.textContent).toBe("copy me");
    },
  );

  it("logs native copy errors and keeps Alt+C uncanceled", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    const error = new Error("Copy command denied");
    document.execCommand = () => {
      throw error;
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { root } = await loadPage("ORBIT", "text/plain");
    const event = press({ code: "KeyC", altKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(warn).toHaveBeenCalledWith("url-porter: native copy failed", error);
    expect(root.querySelector(".toast").textContent).toBe("Copy failed");
  });

  it("restores a partial selection after menu-copying the full content", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    const { root, pre } = await loadPage("ORBIT mission", "text/plain");
    const range = document.createRange();
    range.setStart(pre.firstChild, 0);
    range.setEnd(pre.firstChild, 5);
    window.getSelection().addRange(range);
    let copiedText;
    document.execCommand = () => {
      copiedText = String(window.getSelection());
      return true;
    };

    root.querySelector(".copy").click();

    expect(copiedText).toBe("ORBIT mission");
    expect(String(window.getSelection())).toBe("ORBIT");
  });

  it("keeps partial selections and native Cmd+C uncanceled", async () => {
    const { pre } = await loadPage("ORBIT mission", "text/plain");
    const range = document.createRange();
    range.setStart(pre.firstChild, 0);
    range.setEnd(pre.firstChild, 5);
    window.getSelection().addRange(range);

    const event = press({ code: "KeyC", metaKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(String(window.getSelection())).toBe("ORBIT");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("logs copy-event errors without canceling native copy", async () => {
    const { pre } = await loadPage("ORBIT", "text/plain");
    const range = document.createRange();
    range.selectNodeContents(pre);
    window.getSelection().addRange(range);
    const error = new Error("Clipboard data denied");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        setData: () => {
          throw error;
        },
      },
    });

    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(warn).toHaveBeenCalledWith("url-porter: native copy failed", error);
  });

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
    expect(anchors.at(-1).href).toBe("blob:acme");
    expect(await blobs.at(-1).text()).toBe('{"pluto":1}');
    expect(root.querySelector(".toast").textContent).toMatch(/^Downloaded original content as /);
    click.mockRestore();
  });

  describe("on a CSP-sandboxed page (opaque origin, e.g. raw.githubusercontent.com)", () => {
    beforeEach(() => {
      Object.defineProperty(window, "origin", {
        value: "null",
        configurable: true,
      });
    });
    afterEach(() => {
      delete window.origin;
    });

    /**
     * Load a page with a sendMessage stub and click the current toolbar's Download item.
     * @param {unknown} reply - What the background answers.
     * @returns {Promise<{root: ShadowRoot, sendMessage: import("vitest").Mock, click: import("vitest").MockInstance}>}
     */
    async function downloadVia(reply) {
      const sendMessage = vi.fn(async () => reply);
      vi.stubGlobal("chrome", {
        runtime: { getURL: (p) => `file:///nonexistent/${p}`, sendMessage },
      });
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const { root } = await loadPage('{"falcon":2}');
      root.querySelector(".menu .download").click();
      await flush();
      return { root, sendMessage, click };
    }

    it("hands the text to the background instead of an <a download> the page would block", async () => {
      const { root, sendMessage, click } = await downloadVia({ ok: true });
      expect(sendMessage).toHaveBeenCalledWith({
        type: "Myevent.download",
        text: '{"falcon":2}',
        fileName: "content.txt",
      });
      expect(click).not.toHaveBeenCalled();
      expect(root.querySelector(".toast").textContent).toBe(
        "Downloaded original content as content.txt",
      );
      click.mockRestore();
    });

    it("says the download failed when the background reports failure", async () => {
      const { root, click } = await downloadVia({
        ok: false,
        error: "Download failed",
      });
      expect(root.querySelector(".toast").textContent).toBe("Download failed");
      click.mockRestore();
    });
  });
});

describe("theme", () => {
  it("Shift+Escape toggles dark mode on the page and toasts the state", async () => {
    const { root } = await loadPage("{}");
    press({ key: "Escape", shiftKey: true });
    expect(document.body.style.background).toBe("rgb(0, 0, 0)");
    expect(document.body.style.color).toBe("rgb(255, 255, 255)");
    expect(root.querySelector(".toast").textContent).toBe("Dark mode");
    press({ key: "Escape", shiftKey: true });
    expect(document.body.style.background).toBe("rgb(255, 255, 255)");
    expect(document.body.style.color).toBe("rgb(0, 0, 0)");
    expect(root.querySelector(".toast").textContent).toBe("Light mode");
  });
});

describe("JSON tree preview", () => {
  /**
   * The newest JSON tree iframe (toolbars from earlier tests keep their key listeners, so the current one appends last).
   * @returns {HTMLIFrameElement|undefined} The frame, or undefined before first use.
   */
  const jsonFrame = () => [...document.querySelectorAll('iframe[title="JSON tree"]')].at(-1);

  /** getURL stub: the JSON page maps to about:blank so jsdom never tries to load a missing file. @type {import("vitest").Mock} */
  let getURL;
  beforeEach(() => {
    getURL = vi.fn((p) =>
      p === "viewer/jsonview.html" ? "about:blank" : `chrome-extension://acme/${p}`,
    );
    vi.stubGlobal("chrome", { runtime: { getURL } });
  });

  it("Alt+M on JSON opens the JSON tree frame in place of the text, and toggles back", async () => {
    const { root, pre } = await loadPage('{"team":"FALCON"}');
    press({ code: "KeyM", altKey: true });
    expect(getURL).toHaveBeenCalledWith("viewer/jsonview.html");
    expect(jsonFrame().src).toBe("about:blank");
    expect(jsonFrame().style.display).toBe("block");
    expect(pre.style.display).toBe("none");
    expect(root.querySelector(".toast").textContent).toBe("JSON tree ON");
    press({ code: "KeyM", altKey: true });
    expect(jsonFrame().style.display).toBe("none");
    expect(pre.style.display).toBe("block");
    expect(root.querySelector(".toast").textContent).toBe("JSON tree OFF");
  });

  it("posts the original text and theme to the frame only after it reports ready", async () => {
    await loadPage('{"team":"PLUTO"}');
    press({ code: "KeyM", altKey: true });
    const post = vi.spyOn(jsonFrame().contentWindow, "postMessage");
    expect(post).not.toHaveBeenCalled();
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "url-porter:json-view:ready" },
        source: jsonFrame().contentWindow,
      }),
    );
    expect(post).toHaveBeenCalledWith(
      { type: "url-porter:json-view", text: '{"team":"PLUTO"}', dark: false },
      "chrome-extension://acme",
    );
  });

  it("ignores a ready message from a window other than its frame", async () => {
    await loadPage('{"team":"ORBIT"}');
    press({ code: "KeyM", altKey: true });
    const post = vi.spyOn(jsonFrame().contentWindow, "postMessage");
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "url-porter:json-view:ready" },
        source: window,
      }),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("follows the selected syntax, not the content: YAML has no preview item and Alt+M does nothing", async () => {
    const { root } = await loadPage("team: FALCON", "text/yaml");
    expect(root.querySelector(".menu .preview")).toBeNull();
    root.querySelector(".toast").textContent = "";
    press({ code: "KeyM", altKey: true });
    expect(root.querySelector(".toast").textContent).toBe("");
  });

  it("offers the JSON tree when the user picks JSON even if the text is not JSON", async () => {
    const { root } = await loadPage("team: FALCON", "text/yaml");
    const jsonItem = [...root.querySelectorAll(".menu div")].find(
      (d) => d.textContent === "JSON/JSON5",
    );
    jsonItem.click();
    await vi.waitFor(() =>
      expect(root.querySelector(".menu .preview .label")?.textContent).toBe("View JSON Tree"),
    );
  });
});

describe("selection handling", () => {
  it("does not inspect or report document selections", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      runtime: { getURL: (p) => `file:///nonexistent/${p}`, sendMessage },
    });
    document.body.innerHTML = "<p>Acme</p>";
    Object.defineProperty(document, "contentType", {
      value: "text/html",
      configurable: true,
    });
    vi.resetModules();
    await import("../src/content/format-detect.js");
    await import("../src/content/raw-formatter.js");
    document.dispatchEvent(new Event("selectionchange"));
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
