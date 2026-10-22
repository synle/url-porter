/** Production-bundle integration test for the Advanced mode JSON editor. */
// @vitest-environment node

import { resolve } from "node:path";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { createChromeMock } from "./_chromeMock.js";

afterEach(() => vi.unstubAllEnvs());

it("production bundle opens, edits, and saves Advanced mode without React errors", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const bundle = await build({
    configFile: false,
    logLevel: "silent",
    plugins: [react()],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      lib: {
        entry: resolve("src/pages/options/index.jsx"),
        name: "OptionsPage",
        formats: ["iife"],
      },
      minify: true,
    },
  });
  const errors = [];
  const console = new VirtualConsole();
  console.on("jsdomError", (error) => errors.push(error.message));
  console.on("error", (...args) => errors.push(args));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://extension.test/pages/options/options.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  const { chrome, storageData } = createChromeMock({
    initialStorage: {
      jsonConfig: [["acme/repos", "http://acme/repo"]],
      homepageUrl: "https://acme.test/",
    },
  });
  chrome.tabs = { create: vi.fn(), query: vi.fn(async () => []) };
  chrome.runtime.sendMessage = vi.fn();
  dom.window.chrome = chrome;

  try {
    dom.window.eval(bundle[0].output.find((item) => item.type === "chunk").code);
    const document = dom.window.document;
    await vi.waitFor(() => expect(document.body.textContent).toContain("http://acme/repo"));
    const advanced = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent.includes("Advanced Mode"),
    );
    expect(advanced).toBeDefined();
    advanced.click();
    await vi.waitFor(() => {
      expect(errors).toEqual([]);
      expect(document.querySelector("textarea")?.value).toContain('"configs"');
    });
    const editor = document.querySelector("textarea");
    const config = JSON.parse(editor.value);
    expect(config.configs).toEqual([["acme/repos", "http://acme/repo"]]);
    const nextConfig = { ...config, homepage: "https://globex.test/" };
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      "value",
    ).set;
    setter.call(editor, JSON.stringify(nextConfig));
    editor.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    const save = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent.trim() === "Save",
    );
    save.click();
    await vi.waitFor(() => expect(storageData.homepageUrl).toBe("https://globex.test/"));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "Myevent.updateConfig" });
    expect(errors).toEqual([]);
  } finally {
    dom.window.close();
  }
}, 15000);
