/**
 * Tests for History page — renders, filters, selects, restores, clears entries.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, storageData, reset } = createChromeMock();
chrome.tabs = { create: vi.fn() };
chrome.runtime.sendMessage = vi.fn();
chrome.runtime.getURL = vi.fn((p) => `chrome-extension://test/${p}`);

vi.stubGlobal("chrome", chrome);

const History = (await import("../src/pages/history/History.jsx")).default;

/**
 * Seed mock storage with a couple of history entries.
 * @returns {void}
 */
function seedHistory() {
  storageData.linkHistory = {
    "||alpha^": [
      { from: "||alpha^", to: "https://alpha.test", action: "added", date: "2025-01-02T00:00:00Z" },
      {
        from: "||alpha^",
        to: "https://alpha-old.test",
        action: "edited",
        date: "2025-01-01T00:00:00Z",
      },
    ],
    "||beta^": [
      { from: "||beta^", to: "https://beta.test", action: "deleted", date: "2025-01-03T00:00:00Z" },
    ],
  };
}

describe("History page", () => {
  beforeEach(() => {
    reset();
    chrome.tabs.create.mockClear();
    chrome.runtime.sendMessage.mockClear();
    delete window.location;
    window.location = { href: "", assign: vi.fn() };
  });
  afterEach(() => cleanup());

  it("renders the header and empty state when no history", async () => {
    render(<History />);
    expect(await screen.findByText("Link History")).toBeTruthy();
    expect(await screen.findByText(/No history yet/i)).toBeTruthy();
  });

  it("renders history entries from storage", async () => {
    seedHistory();
    render(<History />);
    await waitFor(() => expect(screen.queryByText("https://alpha.test")).toBeTruthy());
    expect(screen.queryByText("https://beta.test")).toBeTruthy();
  });

  it("filters entries by search query", async () => {
    seedHistory();
    render(<History />);
    await waitFor(() => expect(screen.queryByText("https://alpha.test")).toBeTruthy());
    const search = screen.getByPlaceholderText("Search history...");
    fireEvent.change(search, { target: { value: "beta" } });
    await waitFor(() => expect(screen.queryByText("https://alpha.test")).toBeNull());
    expect(screen.queryByText("https://beta.test")).toBeTruthy();
  });

  it("shows 'No matching history entries' when filter has no results", async () => {
    seedHistory();
    render(<History />);
    await waitFor(() => expect(screen.queryByText("https://alpha.test")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("Search history..."), {
      target: { value: "zzzzz" },
    });
    expect(await screen.findByText(/No matching history entries/i)).toBeTruthy();
  });

  it("opens Clear History dialog and clears entries on confirm", async () => {
    seedHistory();
    render(<History />);
    await waitFor(() => expect(screen.queryByText("https://alpha.test")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Clear History/i }));
    // Dialog action button: find the second "Clear History" (in dialog) or look for confirm.
    const confirmButtons = screen.getAllByRole("button", { name: /Clear History/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(storageData.linkHistory).toBeUndefined());
  });

  it("opens Restore All dialog and restores entries on confirm", async () => {
    seedHistory();
    storageData.jsonConfig = [];
    render(<History />);
    await waitFor(() => expect(screen.queryByText("https://alpha.test")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Restore All/i }));
    const confirmButtons = screen.getAllByRole("button", { name: /Restore All/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "Myevent.updateConfig" }),
    );
  });

  it("toggles selection of all entries via header checkbox", async () => {
    seedHistory();
    render(<History />);
    await waitFor(() => expect(screen.queryByText("https://alpha.test")).toBeTruthy());
    const checkboxes = screen.getAllByRole("checkbox");
    // First checkbox is the header select-all
    fireEvent.click(checkboxes[0]);
    // After selecting all, the "Restore (N)" button should appear
    await waitFor(() => expect(screen.queryByText(/Restore \(/i)).toBeTruthy());
    // Toggle off
    fireEvent.click(checkboxes[0]);
    await waitFor(() => expect(screen.queryByText(/Restore \(/i)).toBeNull());
  });

  it("restores selected entries via the Restore (N) button", async () => {
    seedHistory();
    storageData.jsonConfig = [];
    render(<History />);
    await waitFor(() => expect(screen.queryByText("https://alpha.test")).toBeTruthy());
    const checkboxes = screen.getAllByRole("checkbox");
    // Click the first row checkbox (index 1).
    fireEvent.click(checkboxes[1]);
    const restoreBtn = await screen.findByRole("button", { name: /Restore \(1\)/i });
    fireEvent.click(restoreBtn);
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "Myevent.updateConfig" }),
    );
  });

  it("navigates to Options page when back button clicked", async () => {
    render(<History />);
    await screen.findByText("Link History");
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(window.location.href).toBe("chrome-extension://test/pages/options/options.html");
  });

  it("opens Add Link page in new tab from header", async () => {
    render(<History />);
    await screen.findByText("Link History");
    fireEvent.click(screen.getByRole("button", { name: /Add Link/i }));
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://test/pages/addlink/addlink.html",
    });
  });

  it("restores a single entry via the inline restore button", async () => {
    seedHistory();
    storageData.jsonConfig = [];
    render(<History />);
    await waitFor(() => expect(screen.queryByText("https://alpha.test")).toBeTruthy());
    // Each row has a Restore tooltip on the icon button. Pick the first restore icon.
    const tooltipBtns = screen.getAllByRole("button", { name: /Restore$/i });
    expect(tooltipBtns.length).toBeGreaterThan(0);
    fireEvent.click(tooltipBtns[0]);
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "Myevent.updateConfig" }),
    );
  });
});
