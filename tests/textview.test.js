/** Tests for src/viewer/textview.js — renders handed-off selections as formatted code or a Markdown preview. */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Viewer page body markup, taken from the real HTML (scripts stripped). @type {string} */
const BODY = readFileSync(resolve("src/viewer/textview.html"), "utf8")
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script[\s\S]*?<\/script>/g, "");

/**
 * Load the viewer for a query string and stored session entries, and wait for it to render.
 * @param {string} search - Query string, e.g. "?mode=format&lang=json&key=k".
 * @param {Record<string, string>} session - chrome.storage.session contents.
 * @returns {Promise<void>}
 */
async function openViewer(search, session) {
  document.body.innerHTML = BODY;
  window.history.replaceState({}, "", `/viewer/textview.html${search}`);
  vi.stubGlobal("chrome", {
    runtime: {
      getURL: (p) =>
        p === "vendor/marked/marked.esm.js"
          ? pathToFileURL(resolve("node_modules/marked/lib/marked.esm.js")).href
          : p === "viewer/jsonview.html" || p === "viewer/mdview.html"
            ? `about:blank#${p.slice(7, -5)}` // jsdom can't load extension pages; keep the frame inert.
            : `file:///nonexistent/${p}`,
    },
    storage: { session: { get: async (k) => (k in session ? { [k]: session[k] } : {}) } },
  });
  vi.resetModules();
  await import("../src/content/format-detect.js");
  await import("../src/content/raw-formatter.js");
  await import("../src/viewer/textview.js");
  await globalThis.UrlPorterViewerReady;
}

const $ = (id) => document.getElementById(id);

beforeEach(() => vi.unstubAllGlobals());

describe("textview", () => {
  it("formats JSON as monospace text", async () => {
    await openViewer("?mode=format&lang=json&key=k", { k: '{"acme":[1,2]}' });
    expect($("out").textContent).toBe('{\n  "acme": [\n    1,\n    2\n  ]\n}');
    expect($("out").hidden).toBe(false);
    expect($("err").hidden).toBe(true);
    expect(document.title).toBe("Formatted JSON/JSON5");
  });

  it("shows the raw selection plus an error when formatting fails", async () => {
    await openViewer("?mode=format&lang=yaml&key=k", { k: "a: [" });
    expect($("out").textContent).toBe("a: [");
    expect($("err").textContent).toMatch(/^YAML: /);
  });

  /**
   * Answer the Markdown page's ready handshake and return the HTML the toolbar posts to it.
   * @returns {Promise<string>} Posted HTML document.
   */
  async function postedMarkdown() {
    await vi.waitFor(() => expect($("preview").getAttribute("src")).toBe("about:blank#mdview"));
    const post = vi.spyOn($("preview").contentWindow, "postMessage");
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "url-porter:md-view:ready" },
        source: $("preview").contentWindow,
      }),
    );
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    return post.mock.calls.at(-1)[0].html;
  }

  it("renders Markdown in the sandboxed Markdown page frame", async () => {
    await openViewer("?mode=markdown&key=k", { k: "# Initech\n\n*PLUTO*" });
    const html = await postedMarkdown();
    expect($("preview").hidden).toBe(false);
    expect($("preview").getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(html).toContain("<h1>Initech</h1>");
    expect(html).toContain("<em>PLUTO</em>");
    expect($("out").style.display).toBe("none");
  });

  it("styles the Markdown preview black on white with explicit link colors (light OS theme)", async () => {
    await openViewer("?mode=markdown&key=k", { k: "[Acme](https://acme.example)" });
    const html = await postedMarkdown();
    expect(html).toContain("--fg:#000;--bg:#fff;--link:#0645ad;");
    expect(html).toContain("a{color:var(--link);");
  });

  it("opens JSON mode with the formatted text and the JSON tree frame shown", async () => {
    await openViewer("?mode=json&key=k", { k: '{"globex":[1]}' });
    expect(document.title).toBe("JSON Tree");
    expect($("out").textContent).toBe('{\n  "globex": [\n    1\n  ]\n}');
    const frame = document.querySelector('iframe[title="JSON tree"]');
    expect(frame.src).toBe("about:blank#jsonview");
    expect(frame.style.display).toBe("block");
  });

  it("shows the raw text and an error when JSON mode gets invalid JSON", async () => {
    await openViewer("?mode=json&key=k", { k: "{oops" });
    expect($("out").textContent).toBe("{oops");
    expect($("err").textContent).toMatch(/^Not valid JSON: /);
  });

  it("reports a missing selection", async () => {
    await openViewer("?mode=markdown&key=gone", {});
    expect($("err").textContent).toMatch(/no longer available/);
  });

  it("shows the text as-is for an unknown syntax", async () => {
    await openViewer("?mode=format&lang=cobol&key=k", { k: "ORBIT" });
    expect($("out").textContent).toBe("ORBIT");
    expect($("err").textContent).toMatch(/Unknown syntax "cobol"/);
  });

  it("mounts the shared Format toolbar, which reverts to the original selection", async () => {
    document.documentElement.querySelectorAll(":scope > div").forEach((el) => el.remove());
    await openViewer("?mode=format&lang=json&key=k", { k: '{"globex":1}' });
    const root = document.documentElement.querySelector(":scope > div").shadowRoot;
    expect(root.querySelector(".main").textContent).toBe("Format JSON/JSON5");
    root.querySelector(".main").click();
    expect($("out").textContent).toBe('{"globex":1}');
    expect(root.querySelector(".toast").textContent).toBe("Reverted to original (unformatted)");
  });
});
