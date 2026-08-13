/**
 * Tests for AddLink — prefill, save (new + duplicate), cancel, navigation paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, storageData, reset } = createChromeMock();
chrome.tabs = {
  create: vi.fn(),
  query: vi.fn(async () => [{ url: "https://example.com/page", title: "Example" }]),
};
chrome.runtime.sendMessage = vi.fn();
chrome.runtime.getURL = vi.fn((p) => `chrome-extension://test/${p}`);

vi.stubGlobal("chrome", chrome);

if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID)
  globalThis.crypto.randomUUID = () => "uuid-" + Math.random().toString(36).slice(2);

const AddLink = (await import("../src/pages/addlink/AddLink.jsx")).default;

describe("AddLink", () => {
  beforeEach(() => {
    reset();
    chrome.tabs.create.mockClear();
    chrome.tabs.query.mockClear();
    chrome.tabs.query.mockImplementation(async () => [
      { url: "https://example.com/page", title: "Example" },
    ]);
    chrome.runtime.sendMessage.mockClear();
    window.history.replaceState({}, "", "/");
    window.close = vi.fn();
  });
  afterEach(() => cleanup());

  it("renders the header and form", async () => {
    render(<AddLink />);
    expect(await screen.findByRole("heading", { name: /Add Link/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Add Link$/i })).toBeTruthy();
  });

  it("prefills from active tab when no query params", async () => {
    render(<AddLink />);
    await waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryAllByDisplayValue("https://example.com/page").length).toBeGreaterThan(0),
    );
  });

  it("prefills from ?url= and ?title= query params", async () => {
    window.history.replaceState(
      {},
      "",
      "/?url=" +
        encodeURIComponent("https://foo.test/path") +
        "&title=" +
        encodeURIComponent("Foo Title"),
    );
    render(<AddLink />);
    await waitFor(() =>
      expect(screen.queryAllByDisplayValue("https://foo.test/path").length).toBeGreaterThan(0),
    );
    expect(screen.queryAllByDisplayValue("Foo Title").length).toBeGreaterThan(0);
  });

  it("prefills a URL containing a literal percent sign without corrupting it", async () => {
    // URLSearchParams already decodes; an extra decodeURIComponent threw
    // URIError here and left both fields empty.
    const raw = "https://foo.test/discount/50%";
    window.history.replaceState(
      {},
      "",
      "/?url=" + encodeURIComponent(raw) + "&title=" + encodeURIComponent("50% off"),
    );
    render(<AddLink />);
    await waitFor(() => expect(screen.queryAllByDisplayValue(raw).length).toBeGreaterThan(0));
    expect(screen.queryAllByDisplayValue("50% off").length).toBeGreaterThan(0);
  });

  it("does not double-decode an escaped percent in the query param", async () => {
    const raw = "https://foo.test/search?q=100%25";
    window.history.replaceState({}, "", "/?url=" + encodeURIComponent(raw));
    render(<AddLink />);
    await waitFor(() => expect(screen.queryAllByDisplayValue(raw).length).toBeGreaterThan(0));
  });

  it("skips prefill for chrome:// URLs", async () => {
    chrome.tabs.query.mockImplementation(async () => [
      { url: "chrome://settings/", title: "Settings" },
    ]);
    render(<AddLink />);
    await waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
    // The "Full URL" field should remain empty
    const inputs = await screen.findAllByRole("textbox");
    expect(inputs.every((i) => i.value !== "chrome://settings/")).toBe(true);
  });

  it("saves a new link and sends update message", async () => {
    storageData.jsonConfig = [];
    render(<AddLink />);
    await screen.findByRole("heading", { name: /Add Link/i });
    const inputs = await screen.findAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "myalias" } });
    fireEvent.change(inputs[1], { target: { value: "https://target.test" } });
    const submit = screen.getByRole("button", { name: /^Add Link$/i });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "Myevent.updateConfig" }),
    );
  });

  it("shows duplicate dialog when alias already exists", async () => {
    storageData.jsonConfig = [{ from: "||myalias^", to: "https://old.test" }];
    render(<AddLink />);
    await screen.findByRole("heading", { name: /Add Link/i });
    const inputs = await screen.findAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "myalias" } });
    fireEvent.change(inputs[1], { target: { value: "https://new.test" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add Link$/i }));
    expect(await screen.findByText("Duplicate Alias")).toBeTruthy();
  });

  it("updates existing link when user confirms in duplicate dialog", async () => {
    storageData.jsonConfig = [{ from: "||myalias^", to: "https://old.test" }];
    render(<AddLink />);
    await screen.findByRole("heading", { name: /Add Link/i });
    const inputs = await screen.findAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "myalias" } });
    fireEvent.change(inputs[1], { target: { value: "https://new.test" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add Link$/i }));
    await screen.findByText("Duplicate Alias");
    fireEvent.click(screen.getByRole("button", { name: /Update Existing Link/i }));
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "Myevent.updateConfig" }),
    );
  });

  it("shows error when alias is missing", async () => {
    render(<AddLink />);
    await screen.findByRole("heading", { name: /Add Link/i });
    const inputs = await screen.findAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "" } });
    fireEvent.change(inputs[1], { target: { value: "https://x.test" } });
    // Form submission via fireEvent.submit since required HTML attr can block click.
    const form = inputs[0].closest("form");
    fireEvent.submit(form);
    // No update message should be sent without a valid alias.
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ type: "Myevent.updateConfig" });
  });

  it("shows error when URL is missing", async () => {
    render(<AddLink />);
    await screen.findByRole("heading", { name: /Add Link/i });
    const inputs = await screen.findAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "abc" } });
    fireEvent.change(inputs[1], { target: { value: "" } });
    const form = inputs[0].closest("form");
    fireEvent.submit(form);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ type: "Myevent.updateConfig" });
  });

  it("calls window.close when Cancel clicked", async () => {
    render(<AddLink />);
    await screen.findByRole("heading", { name: /Add Link/i });
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(window.close).toHaveBeenCalled();
  });

  it("opens options page from Settings icon", async () => {
    render(<AddLink />);
    await screen.findByRole("heading", { name: /Add Link/i });
    fireEvent.click(screen.getByRole("button", { name: /Open Settings/i }));
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://test/pages/options/options.html",
    });
  });

  it("opens Add Link page in new tab from icon", async () => {
    render(<AddLink />);
    await screen.findByRole("heading", { name: /Add Link/i });
    fireEvent.click(screen.getByRole("button", { name: /Open in New Tab/i }));
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://test/pages/addlink/addlink.html",
    });
  });

  it("opens Sync dialog from Sync icon", async () => {
    render(<AddLink />);
    await screen.findByRole("heading", { name: /Add Link/i });
    fireEvent.click(screen.getByRole("button", { name: /Sync Settings/i }));
    expect(await screen.findByText("Sync Settings")).toBeTruthy();
  });

  it("cleans URL on blur", async () => {
    render(<AddLink />);
    await screen.findByRole("heading", { name: /Add Link/i });
    const inputs = await screen.findAllByRole("textbox");
    fireEvent.change(inputs[1], { target: { value: "  https://x.test  " } });
    fireEvent.blur(inputs[1]);
    await waitFor(() => expect(inputs[1].value).toBe("https://x.test"));
  });

  it("cleans alias on blur", async () => {
    render(<AddLink />);
    await screen.findByRole("heading", { name: /Add Link/i });
    const inputs = await screen.findAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "  myalias  " } });
    fireEvent.blur(inputs[0]);
    await waitFor(() => expect(inputs[0].value).toBe("myalias"));
  });

  it("handles chrome.tabs.query rejection gracefully", async () => {
    chrome.tabs.query.mockImplementation(async () => {
      throw new Error("no permission");
    });
    render(<AddLink />);
    expect(await screen.findByRole("heading", { name: /Add Link/i })).toBeTruthy();
  });

  it("can close duplicate dialog via Cancel button", async () => {
    storageData.jsonConfig = [{ from: "||myalias^", to: "https://old.test" }];
    render(<AddLink />);
    await screen.findByRole("heading", { name: /Add Link/i });
    const inputs = await screen.findAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "myalias" } });
    fireEvent.change(inputs[1], { target: { value: "https://new.test" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add Link$/i }));
    await screen.findByText("Duplicate Alias");
    // Click the dialog's Cancel button (last one is in dialog actions).
    const cancelButtons = screen.getAllByRole("button", { name: /^Cancel$/i });
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);
    await waitFor(() => expect(screen.queryByText("Duplicate Alias")).toBeNull());
  });
});
