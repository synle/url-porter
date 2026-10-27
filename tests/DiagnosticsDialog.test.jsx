/** Diagnostics dialog interactions, downloads, readback after clear, and visible failure paths. */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DiagnosticsDialog from "../src/components/DiagnosticsDialog.jsx";

/** Deterministic safe export fixture; no real user data. */
const REPORT = {
  schemaVersion: 1,
  environment: { os: "Windows" },
  records: [{ kind: "worker_started", timestamp: 1700000000000 }],
};
/** Browser boundary mock reset for every interaction. */
let chrome;

beforeEach(() => {
  chrome = {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ ok: true, report: REPORT }),
    },
    downloads: { download: vi.fn().mockResolvedValue(1) },
  };
  vi.stubGlobal("chrome", chrome);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Open the dialog through its visible Options toolbar control.
 * @returns {Promise<void>} Resolves after the report is shown.
 */
async function open() {
  render(<DiagnosticsDialog />);
  expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Diagnostics" }));
  await screen.findByLabelText("Diagnostic report");
}

describe("DiagnosticsDialog", () => {
  it("loads on demand and shows attribution limits instead of a crash verdict", async () => {
    await open();
    expect(screen.getByLabelText("Diagnostic report").textContent).toBe(
      JSON.stringify(REPORT, null, 2),
    );
    expect(screen.getByText(/Normal MV3 worker stops are not crashes/).textContent).toContain(
      "cannot be identified from these records alone",
    );
    expect(chrome.runtime.sendMessage.mock.calls).toEqual([
      [{ type: "UrlPorter.diagnostics.get" }],
    ]);
    expect(chrome.downloads.download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("exports a fresh report through an explicit local download", async () => {
    await open();
    const updated = { ...REPORT, records: [] };
    chrome.runtime.sendMessage.mockResolvedValue({ ok: true, report: updated });
    fireEvent.click(screen.getByRole("button", { name: "Export diagnostics" }));
    await waitFor(() => expect(chrome.downloads.download).toHaveBeenCalled());
    expect(chrome.downloads.download.mock.calls).toEqual([
      [
        {
          url: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(updated, null, 2))}`,
          filename: "url-porter-diagnostics.json",
          saveAs: true,
        },
      ],
    ]);
    expect(screen.getByLabelText("Diagnostic report").textContent).toBe(
      JSON.stringify(updated, null, 2),
    );
  });

  it("clears through the owner and displays a fresh empty readback", async () => {
    await open();
    chrome.runtime.sendMessage
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, report: { ...REPORT, records: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Clear diagnostics" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Diagnostic report").textContent).toBe(
        JSON.stringify({ ...REPORT, records: [] }, null, 2),
      ),
    );
    expect(chrome.runtime.sendMessage.mock.calls).toEqual([
      [{ type: "UrlPorter.diagnostics.get" }],
      [{ type: "UrlPorter.diagnostics.clear" }],
      [{ type: "UrlPorter.diagnostics.get" }],
    ]);
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });

  it("shows a worker error, disables export without a report, and recovers on refresh", async () => {
    chrome.runtime.sendMessage.mockRejectedValueOnce(new Error("PRIVATE"));
    render(<DiagnosticsDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Diagnostics" }));
    expect(await screen.findByText(/Diagnostics action failed/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Export diagnostics" }).disabled).toBe(true);
    expect(screen.queryByLabelText("Diagnostic report")).toBeNull();
    expect(document.body.textContent).not.toContain("PRIVATE");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect((await screen.findByLabelText("Diagnostic report")).textContent).toBe(
      JSON.stringify(REPORT, null, 2),
    );
    expect(screen.queryByText(/Diagnostics action failed/)).toBeNull();
  });

  it("does not export or overwrite the displayed report after a failed clear", async () => {
    await open();
    chrome.runtime.sendMessage.mockResolvedValueOnce({
      ok: false,
      error: "storage_unavailable",
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear diagnostics" }));
    await screen.findByText(/Diagnostics action failed/);
    expect(screen.getByLabelText("Diagnostic report").textContent).toBe(
      JSON.stringify(REPORT, null, 2),
    );
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });

  it("shows download failure without claiming successful export", async () => {
    await open();
    chrome.downloads.download.mockRejectedValueOnce(new Error("PRIVATE"));
    fireEvent.click(screen.getByRole("button", { name: "Export diagnostics" }));
    await screen.findByText(/Diagnostics action failed/);
    expect(document.body.textContent).not.toContain("PRIVATE");
    expect(screen.getByRole("button", { name: "Export diagnostics" }).disabled).toBe(false);
  });
});
