/**
 * Tests for NewTab — redirect path vs welcome screen.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, storageData, reset } = createChromeMock();
chrome.tabs = {
  query: vi.fn(async () => [{ id: 42 }]),
  update: vi.fn(),
};
vi.stubGlobal("chrome", chrome);

const NewTab = (await import("../src/pages/newtab/NewTab.jsx")).default;

describe("NewTab", () => {
  beforeEach(() => {
    reset();
    chrome.tabs.query.mockClear();
    chrome.tabs.update.mockClear();
  });
  afterEach(() => cleanup());

  it("redirects the current tab when a homepage URL is configured", async () => {
    storageData.homepageUrl = "https://home.example.com";
    render(<NewTab />);
    await waitFor(() => expect(chrome.tabs.update).toHaveBeenCalled());
    expect(chrome.tabs.update).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ url: "https://home.example.com" }),
    );
  });

  it("falls back to tab-less update when query throws", async () => {
    storageData.homepageUrl = "https://home.example.com";
    chrome.tabs.query.mockRejectedValueOnce(new Error("no permission"));
    render(<NewTab />);
    await waitFor(() => expect(chrome.tabs.update).toHaveBeenCalled());
    expect(chrome.tabs.update).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://home.example.com" }),
    );
  });

  it("shows the welcome content when no homepage is configured", async () => {
    render(<NewTab />);
    expect(await screen.findByText("URL Porter")).toBeTruthy();
    expect(screen.getByText(/Welcome/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open Settings/i })).toBeTruthy();
  });
});
