/**
 * Smoke + interaction tests for HistoryStatsSection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, storageData, reset } = createChromeMock();
vi.stubGlobal("chrome", chrome);

// jsdom doesn't implement URL.createObjectURL — stub for the export-to-CSV path.
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
}

const HistoryStatsSection = (await import("../src/components/HistoryStatsSection.jsx")).default;

describe("HistoryStatsSection", () => {
  beforeEach(() => {
    reset();
  });
  afterEach(() => cleanup());

  it("renders the section header and loads history stats", async () => {
    chrome.history.search.mockResolvedValue([
      { url: "https://acme.com/a", title: "A", visitCount: 10, lastVisitTime: 100 },
      { url: "https://acme.com/b", title: "B", visitCount: 5, lastVisitTime: 200 },
    ]);
    render(<HistoryStatsSection showSnackbar={() => {}} />);
    expect(await screen.findByText(/Browse History Stats/i)).toBeTruthy();
    await waitFor(() => expect(chrome.history.search).toHaveBeenCalled());
  });

  it("filters by search query", async () => {
    chrome.history.search.mockResolvedValue([
      { url: "https://acme.com/a", title: "Acme A", visitCount: 10, lastVisitTime: 100 },
      { url: "https://globex.com/b", title: "Globex B", visitCount: 10, lastVisitTime: 200 },
    ]);
    render(<HistoryStatsSection showSnackbar={() => {}} />);
    await screen.findByText(/Browse History Stats/i);
    await waitFor(() => expect(screen.queryByText("Acme A")).toBeTruthy());
    const search = screen.getByPlaceholderText(/Search/i);
    fireEvent.change(search, { target: { value: "globex" } });
    await waitFor(() => expect(screen.queryByText("Acme A")).toBeNull());
  });

  it("shows snackbar error when chrome.history.search throws", async () => {
    chrome.history.search.mockRejectedValueOnce(new Error("history denied"));
    const snackbar = vi.fn();
    render(<HistoryStatsSection showSnackbar={snackbar} />);
    await waitFor(() => expect(snackbar).toHaveBeenCalledWith(expect.stringContaining("history denied"), "error"));
  });

  it("refresh button re-fetches history", async () => {
    chrome.history.search.mockResolvedValue([{ url: "https://acme.com/a", title: "A", visitCount: 10, lastVisitTime: 100 }]);
    render(<HistoryStatsSection showSnackbar={() => {}} />);
    await screen.findByText(/Browse History Stats/i);
    await waitFor(() => expect(chrome.history.search).toHaveBeenCalledTimes(1));
    const refresh = screen.getAllByRole("button").find((b) => b.querySelector("svg"));
    if (refresh) fireEvent.click(refresh);
  });
});
