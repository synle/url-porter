/** Tests for src/helpers/downloadUtils.js — background chrome.downloads fallback for CSP-sandboxed raw pages. */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_DOWNLOAD_NAME,
  downloadText,
  safeDownloadName,
} from "../src/helpers/downloadUtils.js";

beforeEach(() => {
  vi.stubGlobal("chrome", { downloads: { download: vi.fn(async () => 7) } });
});

describe("safeDownloadName", () => {
  it.each([
    ["acme.json", "acme.json"],
    ["../../etc/passwd", "passwd"],
    ["dir\\falcon.yaml", "falcon.yaml"],
    ['pl:u*t?o"<>|.txt', "pl_u_t_o____.txt"],
    ["glo\tbex\n.txt", "glo_bex_.txt"],
    [".env", DEFAULT_DOWNLOAD_NAME],
    ["", DEFAULT_DOWNLOAD_NAME],
    ["folder/", DEFAULT_DOWNLOAD_NAME],
    [42, DEFAULT_DOWNLOAD_NAME],
    [undefined, DEFAULT_DOWNLOAD_NAME],
  ])("%s → %s", (name, expected) => {
    expect(safeDownloadName(name)).toBe(expected);
  });
});

describe("downloadText", () => {
  it("saves the exact text as a UTF-8 data URL under the sanitized name", async () => {
    const id = await downloadText({ text: '{"team": "ORBIT ✓"}\n', fileName: "../initech.json" });
    expect(id).toBe(7);
    const { url, filename, saveAs } = chrome.downloads.download.mock.calls[0][0];
    expect(filename).toBe("initech.json");
    expect(saveAs).toBe(false);
    expect(url.startsWith("data:text/plain;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.slice("data:text/plain;charset=utf-8,".length))).toBe(
      '{"team": "ORBIT ✓"}\n',
    );
  });

  it("keeps empty text as an empty file", async () => {
    await downloadText({ text: "", fileName: "globex.txt" });
    expect(chrome.downloads.download.mock.calls[0][0].url).toBe("data:text/plain;charset=utf-8,");
  });

  it("rejects non-string text without downloading", async () => {
    await expect(downloadText({ text: { a: 1 } })).rejects.toThrow(TypeError);
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });
});
