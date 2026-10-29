/** Tests for src/viewer/jsonview.js — the framed JSON tree page fed by the Format toolbar via postMessage. */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** JSON tree page body markup, taken from the real HTML (scripts stripped). @type {string} */
const BODY = readFileSync(resolve("src/viewer/jsonview.html"), "utf8")
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script[\s\S]*?<\/script>/g, "");

/**
 * Load the page script against the real markup (the web component itself is not loaded).
 * @returns {Promise<HTMLElement>} The tree element.
 */
async function openPage() {
  document.body.innerHTML = BODY;
  document.body.className = "";
  vi.resetModules();
  await import("../src/viewer/jsonview.js");
  return document.getElementById("tree");
}

/**
 * Deliver a message the way the toolbar does.
 * @param {object} data - Message payload.
 * @returns {void}
 */
const post = (data) => window.dispatchEvent(new MessageEvent("message", { data }));

beforeEach(() => vi.unstubAllGlobals());

describe("jsonview", () => {
  it("sets the parsed object (never a string, which the component would fetch as a URL)", async () => {
    const tree = await openPage();
    post({
      type: "url-porter:json-view",
      text: '{"team":"FALCON","n":[1]}',
      dark: false,
    });
    expect(tree.data).toMatchInlineSnapshot(`
      {
        "n": [
          1,
        ],
        "team": "FALCON",
      }
    `);
    expect(tree.getAttribute("theme")).toBe("default-light");
  });

  it("switches to the built-in dark theme on dark: true", async () => {
    const tree = await openPage();
    post({ type: "url-porter:json-view", text: "[]", dark: true });
    expect(tree.getAttribute("theme")).toBe("default-dark");
    expect(document.body.classList.contains("dark")).toBe(true);
  });

  it("follows the OS theme before any message arrives", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const tree = await openPage();
    expect(tree.getAttribute("theme")).toBe("default-dark");
  });

  it("shows an error instead of the tree for invalid JSON", async () => {
    const tree = await openPage();
    post({ type: "url-porter:json-view", text: "{oops" });
    expect(document.getElementById("err").textContent).toMatch(/^Not valid JSON: /);
    expect(tree.hidden).toBe(true);
  });

  it("ignores messages of other types", async () => {
    const tree = await openPage();
    post({ type: "acme:other", text: '{"a":1}' });
    expect(tree.data).toBeUndefined();
  });
});
