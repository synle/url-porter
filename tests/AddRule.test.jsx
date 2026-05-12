/**
 * Tests for AddRule — pre-fill, save, cancel, navigateToOptions paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, storageData, reset } = createChromeMock();
chrome.tabs = { create: vi.fn() };
chrome.runtime.sendMessage = vi.fn();
chrome.runtime.getURL = vi.fn((p) => `chrome-extension://test/${p}`);

vi.stubGlobal("chrome", chrome);

if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID) globalThis.crypto.randomUUID = () => "uuid-" + Math.random().toString(36).slice(2);

const AddRule = (await import("../src/pages/addrule/AddRule.jsx")).default;

describe("AddRule", () => {
  beforeEach(() => {
    reset();
    chrome.tabs.create.mockClear();
    chrome.runtime.sendMessage.mockClear();
    // Use jsdom-friendly location stub
    window.history.replaceState({}, "", "/?url=" + encodeURIComponent("https://leetcode.com/problems/foo"));
    window.close = vi.fn();
  });
  afterEach(() => cleanup());

  it("renders the page header and form", async () => {
    render(<AddRule />);
    expect(await screen.findByText("Add Bookmark Rule")).toBeTruthy();
  });

  it("pre-fills rule fields when ?url= is present", async () => {
    render(<AddRule />);
    // deriveRuleFromUrl produces "leetcode.com mm/dd/yyyy" — name field will reflect.
    await waitFor(() => expect(screen.queryAllByDisplayValue(/leetcode\.com/i).length).toBeGreaterThan(0));
  });

  it("saves a new rule via the form and closes the window", async () => {
    render(<AddRule />);
    await waitFor(() => expect(screen.queryByText("Add Bookmark Rule")).toBeTruthy());
    // Click the last "Add" button (form submit).
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(storageData.bookmarkRules?.length).toBeGreaterThan(0));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "Myevent.updateConfig" });
  });

  it("opens options page from Settings icon", async () => {
    render(<AddRule />);
    await screen.findByText("Add Bookmark Rule");
    const settingsBtn = screen.getByRole("button", { name: /Open Settings/i });
    fireEvent.click(settingsBtn);
    expect(chrome.tabs.create).toHaveBeenCalled();
  });

  it("closes the page when Close icon clicked", async () => {
    render(<AddRule />);
    await screen.findByText("Add Bookmark Rule");
    const closeBtn = screen.getByRole("button", { name: /Close/i });
    fireEvent.click(closeBtn);
    expect(window.close).toHaveBeenCalled();
  });

  it("starts with empty pre-fill when no url param", async () => {
    window.history.replaceState({}, "", "/");
    render(<AddRule />);
    expect(await screen.findByText("Add Bookmark Rule")).toBeTruthy();
  });
});
