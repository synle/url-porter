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
          : `file:///nonexistent/${p}`,
    },
    storage: { session: { get: async (k) => (k in session ? { [k]: session[k] } : {}) } },
  });
  vi.resetModules();
  await import("../src/content/format-detect.js");
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

  it("renders Markdown into the sandboxed preview frame", async () => {
    await openViewer("?mode=markdown&key=k", { k: "# Initech\n\n*PLUTO*" });
    expect($("preview").hidden).toBe(false);
    expect($("preview").getAttribute("sandbox")).not.toContain("allow-scripts");
    expect($("preview").srcdoc).toContain("<h1>Initech</h1>");
    expect($("preview").srcdoc).toContain("<em>PLUTO</em>");
    expect($("out").hidden).toBe(true);
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
});
