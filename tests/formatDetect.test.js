/** Tests for src/content/format-detect.js — syntax detection and XML formatting for the raw-page formatter. */
import { describe, it, expect, beforeAll } from "vitest";

/** Detection API exposed on globalThis by the content script. @type {any} */
let F;
beforeAll(async () => {
  await import("../src/content/format-detect.js");
  F = globalThis.UrlPorterFormat;
});

/**
 * Detect with an unhelpful header and URL so only content sniffing applies.
 * @param {string} text - Page text.
 * @returns {string|null} Detected language id.
 */
const sniff = (text) =>
  F.detectLanguage({ contentType: "text/plain", url: "http://localhost/raw", text });

describe("detectLanguage priority", () => {
  it("prefers the content-type header over URL and content", () => {
    expect(
      F.detectLanguage({
        contentType: "application/json",
        url: "https://acme.test/a.yml",
        text: "a: 1",
      }),
    ).toBe("json");
  });
  it("falls back to the URL extension when the header is generic", () => {
    expect(F.detectLanguage({ contentType: "text/plain", url: "http://localhost/abc.ts" })).toBe(
      "typescript",
    );
  });
  it("ignores the query string when reading the extension", () => {
    expect(
      F.detectLanguage({ contentType: "text/plain", url: "http://localhost/abc.json?x=1" }),
    ).toBe("json");
  });
  it("returns null when nothing is recognizable", () => {
    expect(F.detectLanguage({ text: "" })).toBeNull();
  });
});

describe("fromContentType", () => {
  it.each([
    ["application/vnd.globex+json; charset=utf-8", "json"],
    ["application/atom+xml", "xml"],
    ["text/javascript", "javascript"],
    ["text/css", "css"],
    ["application/yaml", "yaml"],
    ["text/plain", null],
  ])("%s → %s", (ct, expected) => {
    expect(F.fromContentType(ct)).toBe(expected);
  });
});

describe("fromContent", () => {
  it.each([
    ['{"statusCode":404,"message":"Resource not found"}', "json"],
    ['<?xml version="1.0"?><a/>', "xml"],
    ["<!DOCTYPE html><html></html>", "html"],
    ["<initech><id>1</id></initech>", "xml"],
    ["interface Acme { id: number }", "typescript"],
    ["const a = () => 1;", "javascript"],
    ["body { color: red; }", "css"],
    ["name: initech\nport: 80", "yaml"],
    ["# FALCON\n\nsome text", "markdown"],
    ["query { pluto { id } }", "graphql"],
    ["{a: 1}", "json5"],
  ])("%s → %s", (text, expected) => {
    expect(sniff(text)).toBe(expected);
  });
});

describe("formatXml", () => {
  it("indents nested elements and keeps leaf text inline", () => {
    expect(F.formatXml("<a><b>hi</b><c><d/></c></a>")).toBe(
      "<a>\n  <b>hi</b>\n  <c>\n    <d/>\n  </c>\n</a>\n",
    );
  });
});

describe("LANGUAGES", () => {
  it("covers the requested syntaxes", () => {
    const ids = F.LANGUAGES.map((l) => l.id);
    expect(ids).toEqual(
      expect.arrayContaining(["json", "javascript", "typescript", "css", "html", "xml", "yaml"]),
    );
  });
});
