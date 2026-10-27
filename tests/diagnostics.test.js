/** Diagnostics contracts: attribution, bounded persistence, restart semantics, privacy, and authenticated messages. */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

/** Fixed extension origin; never a real installed extension ID. */
const ROOT = "chrome-extension://acme/";
/** Fixed fake clock for deterministic record assertions. */
const NOW = 1700000000000;
/** Storage state owned by each test. */
let data;
/** Runtime and global listeners registered by the real script. */
let listeners;
/** Browser boundary mock. */
let chrome;

/**
 * Send a message through the actual registered background listener.
 * @param {string} action - Internal action suffix.
 * @param {object} [extra] - Additional message fields.
 * @param {object} [sender] - Browser-provided sender identity.
 * @returns {Promise<object>} RPC response.
 */
function rpc(
  action,
  extra = {},
  sender = { id: "acme", url: `${ROOT}pages/options/options.html` },
) {
  return new Promise((resolve) =>
    listeners.message({ type: `UrlPorter.diagnostics.${action}`, ...extra }, sender, resolve),
  );
}

/**
 * Import a fresh execution context using the real classic-script entry point.
 * @param {"background"|"content"|"page"} [context] - Execution context.
 * @returns {Promise<object>} Reporter API after any startup write is flushed.
 */
async function load(context = "background") {
  vi.resetModules();
  vi.stubGlobal("UrlPorterDiagnostics", undefined);
  vi.stubGlobal("location", {
    href:
      context === "page"
        ? `${ROOT}pages/options/options.html`
        : "https://acme.test/private?token=hidden",
  });
  await import("../src/content/diagnostics.js");
  const api = globalThis.UrlPorterDiagnostics;
  if (context === "background") {
    api.startBackground();
    await rpc("get");
  }
  return api;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  data = {};
  listeners = {};
  chrome = {
    runtime: {
      id: "acme",
      getURL: (path) => ROOT + path,
      getManifest: () => ({ version: "2.20.0" }),
      onMessage: {
        addListener: (fn) => {
          listeners.message = fn;
        },
      },
      onStartup: {
        addListener: (fn) => {
          listeners.startup = fn;
        },
      },
      onInstalled: {
        addListener: (fn) => {
          listeners.installed = fn;
        },
      },
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
    },
    storage: {
      local: {
        get: vi.fn(async () => structuredClone(data)),
        set: vi.fn(async (value) => {
          Object.assign(data, structuredClone(value));
        }),
        remove: vi.fn(async (key) => {
          delete data[key];
        }),
      },
    },
  };
  vi.stubGlobal("chrome", chrome);
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36",
  });
  vi.stubGlobal(
    "addEventListener",
    vi.fn((name, fn) => {
      listeners[name] = fn;
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("background observations", () => {
  it("retains starts across worker restarts and never infers a crash from an idle gap", async () => {
    await load();
    vi.advanceTimersByTime(600000);
    await load();
    listeners.startup();
    listeners.installed();
    const result = await rpc("get");
    expect(result.report.records).toEqual([
      {
        kind: "worker_started",
        frames: [],
        context: "background",
        timestamp: NOW,
        version: "2.20.0",
      },
      {
        kind: "worker_started",
        frames: [],
        context: "background",
        timestamp: NOW + 600000,
        version: "2.20.0",
      },
      {
        kind: "browser_started",
        frames: [],
        context: "background",
        timestamp: NOW + 600000,
        version: "2.20.0",
      },
      {
        kind: "extension_installed",
        frames: [],
        context: "background",
        timestamp: NOW + 600000,
        version: "2.20.0",
      },
    ]);
    expect(result.report.environment).toEqual({
      extensionVersion: "2.20.0",
      chromiumVersion: "130.0.0.0",
      os: "Windows",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("records global errors and non-Error rejections without retaining raw messages or external stack data", async () => {
    await load();
    listeners.error({
      error: {
        name: "TypeError",
        stack: `TypeError: SECRET\n at ${ROOT}background/background.js:4:2\n at https://private.test/?token=SECRET`,
      },
    });
    listeners.unhandledrejection({ reason: "SECRET selected text" });
    const result = await rpc("get");
    expect(result.report.records.slice(1)).toEqual([
      {
        kind: "error",
        errorName: "TypeError",
        frames: ["background/background.js:4:2"],
        context: "background",
        timestamp: NOW,
        version: "2.20.0",
      },
      {
        kind: "unhandled_rejection",
        errorName: "UnknownError",
        frames: [],
        context: "background",
        timestamp: NOW,
        version: "2.20.0",
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|private\.test|acme\/|selected text/);
    expect(console.error.mock.calls[0]).toEqual([
      "[URL Porter diagnostics] Extension JavaScript failure",
      result.report.records[1],
    ]);
  });

  it("serializes concurrent appends with clear and does not resurrect cleared records", async () => {
    const api = await load();
    const first = api.reportError(new TypeError("private"), "bookmark_read");
    const clear = rpc("clear");
    const second = api.reportError(new RangeError("private"), "download");
    expect(await Promise.all([first, clear, second])).toEqual([
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
    expect((await rpc("get")).report.records).toEqual([
      {
        kind: "error",
        errorName: "RangeError",
        operation: "download",
        frames: [],
        context: "background",
        timestamp: NOW,
        version: "2.20.0",
      },
    ]);
  });

  it("does not lose concurrent reports", async () => {
    const api = await load();
    await Promise.all([
      api.operation("operation_started", "redirect_rebuild"),
      api.reportError(new SyntaxError("private"), "redirect_rebuild"),
      api.operation("operation_completed", "redirect_rebuild"),
    ]);
    expect((await rpc("get")).report.records.slice(1).map((record) => record.kind)).toEqual([
      "operation_started",
      "error",
      "operation_completed",
    ]);
  });

  it("bounds retention across worker starts and evicts the oldest record", async () => {
    await load();
    data.urlPorterDiagnostics = Array.from({ length: 100 }, (_, index) => ({
      kind: "worker_started",
      frames: [],
      timestamp: index,
      context: "background",
      version: "2.19.0",
    }));
    await load();
    const records = (await rpc("get")).report.records;
    expect(records).toHaveLength(100);
    expect(records[0]).toEqual({
      kind: "worker_started",
      frames: [],
      timestamp: 1,
      context: "background",
      version: "2.19.0",
    });
    expect(records[99]).toEqual({
      kind: "worker_started",
      frames: [],
      timestamp: NOW,
      context: "background",
      version: "2.20.0",
    });
  });

  it("bounds pending writes and reports dropped events without a retry loop", async () => {
    const api = await load();
    const reports = Array.from({ length: 21 }, () => api.reportError(null, "bookmark_read"));
    const results = await Promise.all(reports);
    expect(results[20]).toEqual({ ok: false, error: "rate_limited" });
    const report = (await rpc("get")).report;
    expect(report.records).toHaveLength(21);
    expect(report.droppedSinceWorkerStart).toBe(1);
  });

  it("bounds sustained reporting and resets its budget without timers", async () => {
    const api = await load();
    for (let index = 0; index < 59; index++) await api.reportError(null, "download");
    expect(await api.reportError(null, "download")).toEqual({
      ok: false,
      error: "rate_limited",
    });
    vi.advanceTimersByTime(60000);
    expect(await api.reportError(null, "download")).toEqual({ ok: true });
    expect((await rpc("get")).report.records).toHaveLength(61);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["get", "set"])(
    "recovers after storage %s failure without poisoning later writes",
    async (method) => {
      const api = await load();
      chrome.storage.local[method].mockRejectedValueOnce(new Error("PRIVATE"));
      expect(await api.reportError(null, "download")).toEqual({
        ok: false,
        error: "recording_unavailable",
      });
      expect(await api.reportError(null, "bookmark_read")).toEqual({
        ok: true,
      });
      const records = (await rpc("get")).report.records;
      expect(records.map((record) => record.operation)).toEqual([undefined, "bookmark_read"]);
      expect(console.warn.mock.calls).toEqual([
        ["[URL Porter diagnostics] Recording unavailable; some evidence was not saved."],
      ]);
    },
  );

  it("returns typed storage errors for read and clear without deleting unrelated settings", async () => {
    await load();
    data.homepageUrl = "https://acme.test";
    chrome.storage.local.get.mockRejectedValueOnce(new Error("PRIVATE"));
    expect(await rpc("get")).toEqual({
      ok: false,
      error: "storage_unavailable",
    });
    chrome.storage.local.remove.mockRejectedValueOnce(new Error("PRIVATE"));
    expect(await rpc("clear")).toEqual({
      ok: false,
      error: "storage_unavailable",
    });
    expect(data.urlPorterDiagnostics).toHaveLength(1);
    expect(await rpc("clear")).toEqual({ ok: true });
    expect(data).toEqual({ homepageUrl: "https://acme.test" });
    expect((await rpc("get")).report.records).toEqual([]);
  });

  it("drops malformed stored records and strips unexpected stored fields", async () => {
    await load();
    data.urlPorterDiagnostics = [
      null,
      { kind: "error", frames: [], timestamp: -1 },
      {
        kind: "error",
        frames: [],
        timestamp: NOW,
        context: "background",
        version: "SECRET",
        message: "SECRET",
      },
    ];
    expect((await rpc("get")).report.records).toEqual([
      {
        kind: "error",
        frames: [],
        timestamp: NOW,
        context: "background",
        version: "unknown",
      },
    ]);
    data.urlPorterDiagnostics = { invalid: "SECRET" };
    expect((await rpc("get")).report.records).toEqual([]);
  });

  it.each([
    ["Mozilla/5.0 (Mac OS X) Chrome/131.0.0.0", "macOS", "131.0.0.0"],
    ["Mozilla/5.0 (Linux) Chromium/132.0", "Linux", "132.0"],
    ["unknown", "unknown", "unknown"],
  ])("exports coarse environment for %s", async (userAgent, os, chromiumVersion) => {
    vi.stubGlobal("navigator", { userAgent });
    await load();
    expect((await rpc("get")).report.environment).toEqual({
      extensionVersion: "2.20.0",
      chromiumVersion,
      os,
    });
  });
});

describe("message trust boundary", () => {
  it.each([
    null,
    [],
    {},
    { kind: "crash", frames: [] },
    { kind: "worker_started", frames: [] },
    { kind: "error", operation: "https://private.test", frames: [] },
    { kind: "error", errorName: "SECRET", frames: [] },
    { kind: "error", frames: "not an array" },
    { kind: "error", frames: ["https://private.test"] },
    { kind: "error", frames: ["content/../secret.js"] },
    { kind: "error", frames: Array(9).fill("content/fav.js") },
  ])("rejects malformed or forged event %j without effects", async (event) => {
    await load();
    const before = structuredClone(data);
    const writes = chrome.storage.local.set.mock.calls.length;
    expect(await rpc("record", { event })).toEqual({
      ok: false,
      error: "invalid_event",
    });
    expect(data).toEqual(before);
    expect(chrome.storage.local.set.mock.calls.length).toBe(writes);
  });

  it.each(["get", "clear"])(
    "denies content-script %s and foreign extension requests without effects",
    async (action) => {
      await load();
      const before = structuredClone(data);
      chrome.storage.local.get.mockClear();
      expect(await rpc(action, {}, { id: "acme", url: "https://acme.test" })).toEqual({
        ok: false,
        error: "unauthorized_or_unknown_action",
      });
      expect(
        await rpc(action, {}, { id: "globex", url: `${ROOT}pages/options/options.html` }),
      ).toEqual({ ok: false, error: "unauthorized" });
      expect(data).toEqual(before);
      expect(chrome.storage.local.get).not.toHaveBeenCalled();
      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    },
  );

  it("accepts safe error reports but derives context from the sender instead of the payload", async () => {
    await load();
    expect(
      await rpc(
        "record",
        {
          event: {
            kind: "error",
            errorName: "TypeError",
            frames: ["content/fav.js:1:2"],
            context: "background",
            message: "SECRET",
          },
        },
        { id: "acme", url: "https://acme.test" },
      ),
    ).toEqual({ ok: true });
    expect((await rpc("get")).report.records[1]).toEqual({
      kind: "error",
      errorName: "TypeError",
      frames: ["content/fav.js:1:2"],
      context: "content_script",
      timestamp: NOW,
      version: "2.20.0",
    });
  });

  it("ignores unrelated messages without claiming their response channel", async () => {
    await load();
    const respond = vi.fn();
    expect(listeners.message(null, {}, respond)).toBeUndefined();
    expect(listeners.message({ type: "Myevent.updateConfig" }, {}, respond)).toBeUndefined();
    expect(respond).not.toHaveBeenCalled();
  });
});

describe("content and extension-page reporters", () => {
  it("reports only extension-owned content errors with numeric source positions", async () => {
    await load("content");
    listeners.error({
      filename: "https://acme.test/private",
      error: new Error("PRIVATE"),
    });
    listeners.error({
      filename: "chrome-extension://globex/content/fav.js",
      error: new Error("PRIVATE"),
    });
    listeners.unhandledrejection({ reason: "PRIVATE" });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    listeners.error({
      filename: `${ROOT}content/fav.js`,
      lineno: 4,
      colno: 2,
      error: new TypeError("PRIVATE"),
    });
    expect(chrome.runtime.sendMessage.mock.calls).toEqual([
      [
        {
          type: "UrlPorter.diagnostics.record",
          event: {
            kind: "error",
            errorName: "TypeError",
            frames: ["content/fav.js:4:2"],
          },
        },
      ],
    ]);
  });

  it("captures extension-origin content rejections without copying raw stack lines", async () => {
    await load("content");
    listeners.unhandledrejection({
      reason: {
        name: "RangeError",
        stack: `RangeError: SECRET\n at ${ROOT}content/raw-formatter.js:3:7?token=SECRET`,
      },
    });
    expect(chrome.runtime.sendMessage.mock.calls).toEqual([
      [
        {
          type: "UrlPorter.diagnostics.record",
          event: {
            kind: "unhandled_rejection",
            errorName: "RangeError",
            frames: ["content/raw-formatter.js:3:7"],
          },
        },
      ],
    ]);
  });

  it("captures stackless failures on trusted extension pages", async () => {
    await load("page");
    listeners.error({});
    listeners.unhandledrejection({ reason: null });
    expect(chrome.runtime.sendMessage.mock.calls).toEqual([
      [
        {
          type: "UrlPorter.diagnostics.record",
          event: { kind: "error", errorName: "UnknownError", frames: [] },
        },
      ],
      [
        {
          type: "UrlPorter.diagnostics.record",
          event: {
            kind: "unhandled_rejection",
            errorName: "UnknownError",
            frames: [],
          },
        },
      ],
    ]);
  });

  it("warns once when the worker is unreachable and never starts a keepalive", async () => {
    const api = await load("content");
    chrome.runtime.sendMessage.mockRejectedValue(new Error("PRIVATE"));
    expect(await api.reportError(null, "download")).toEqual({
      ok: false,
      error: "recording_unavailable",
    });
    expect(await api.reportError(null, "download")).toEqual({
      ok: false,
      error: "recording_unavailable",
    });
    expect(console.warn.mock.calls).toEqual([
      ["[URL Porter diagnostics] Recording unavailable; some evidence was not saved."],
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("registers only once per context and safely skips unavailable extension APIs", async () => {
    const api = await load("content");
    vi.resetModules();
    await import("../src/content/diagnostics.js");
    expect(globalThis.UrlPorterDiagnostics).toBe(api);
    expect(globalThis.addEventListener.mock.calls.map(([name]) => name)).toEqual([
      "error",
      "unhandledrejection",
    ]);
    vi.stubGlobal("UrlPorterDiagnostics", undefined);
    vi.stubGlobal("chrome", undefined);
    vi.resetModules();
    await import("../src/content/diagnostics.js");
    expect(globalThis.UrlPorterDiagnostics).toBeUndefined();
  });
});
