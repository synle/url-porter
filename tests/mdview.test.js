/** Tests for src/viewer/mdview.js — the framed Markdown preview page: renders posted HTML, copies code on double-click. */
import { describe, it, expect, beforeEach, vi } from "vitest";

/** Clipboard writeText spy, reset per test. @type {import("vitest").Mock} */
let writeText;

/**
 * Load the page script into a fresh body.
 * @returns {Promise<void>}
 */
async function openPage() {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  vi.resetModules();
  await import("../src/viewer/mdview.js");
}

/**
 * Deliver a message as the parent toolbar would (in jsdom the parent is the window itself).
 * @param {string} html - Rendered document.
 * @returns {void}
 */
const post = (html) =>
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { type: "url-porter:md-view", html },
      source: window.parent,
    }),
  );

/**
 * Double-click an element and let the async copy settle.
 * @param {Element} el - Target.
 * @returns {Promise<void>}
 */
async function dblclick(el) {
  el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

const DOC =
  "<!doctype html><style>:root{--fg:#000;}</style><h1>Acme</h1><p>run <code>npm test</code></p>" +
  '<pre><code class="language-js">code`x`; // FALCON\nlist`y`;\n</code></pre>';

describe("mdview", () => {
  it("renders the posted document's body and styles", async () => {
    await openPage();
    post(DOC);
    expect(document.querySelector("h1").textContent).toBe("Acme");
    expect(document.head.querySelector("style[data-md]").textContent).toBe(":root{--fg:#000;}");
  });

  it("replaces the previous render instead of stacking styles", async () => {
    await openPage();
    post(DOC);
    post("<style>b{}</style><p>Globex</p>");
    expect(document.head.querySelectorAll("style[data-md]")).toHaveLength(1);
    expect(document.body.textContent).toBe("Globex");
  });

  it("double-clicking a code block selects and copies the whole block without the trailing newline", async () => {
    await openPage();
    post(DOC);
    await dblclick(document.querySelector("pre code"));
    expect(writeText).toHaveBeenCalledWith("code`x`; // FALCON\nlist`y`;");
    expect(String(window.getSelection())).toBe("code`x`; // FALCON\nlist`y`;\n");
    expect(document.querySelector(".url-porter-toast").textContent).toBe("Copied to clipboard");
  });

  it("double-clicking inline code copies just that code", async () => {
    await openPage();
    post(DOC);
    await dblclick(document.querySelector("p code"));
    expect(writeText).toHaveBeenCalledWith("npm test");
  });

  it("ignores double-clicks outside code", async () => {
    await openPage();
    post(DOC);
    await dblclick(document.querySelector("h1"));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("reports a failed copy when neither clipboard path works", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    document.execCommand = () => false;
    await openPage();
    post(DOC);
    await dblclick(document.querySelector("pre code"));
    expect(document.querySelector(".url-porter-toast").textContent).toBe("Copy failed");
  });

  it("never runs scripts from the posted markup", async () => {
    await openPage();
    window.acmePwned = false;
    post("<p>x</p><script>window.acmePwned = true</script>");
    expect(window.acmePwned).toBe(false);
  });

  it("ignores messages from windows other than its parent", async () => {
    await openPage();
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "url-porter:md-view", html: "<h1>Initech</h1>" },
        source: null,
      }),
    );
    expect(document.querySelector("h1")).toBeNull();
  });
});
