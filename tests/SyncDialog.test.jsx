/**
 * Tests for SyncDialog — renders, submits, validates URL, handles fetch errors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, storageData, reset } = createChromeMock({
  initialStorage: { syncUrl: "https://my.sync.example.com/config.json" },
});
vi.stubGlobal("chrome", chrome);

const SyncDialog = (await import("../src/components/SyncDialog.jsx")).default;

describe("SyncDialog", () => {
  beforeEach(() => {
    reset();
    storageData.syncUrl = "https://my.sync.example.com/config.json";
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    delete globalThis.fetch;
    cleanup();
  });

  it("does not render dialog content when closed", () => {
    render(<SyncDialog open={false} onClose={() => {}} onSuccess={() => {}} onError={() => {}} />);
    expect(screen.queryByText("Sync Settings")).toBeNull();
  });

  it("renders dialog with title and inputs when open", async () => {
    render(<SyncDialog open={true} onClose={() => {}} onSuccess={() => {}} onError={() => {}} />);
    expect(await screen.findByText("Sync Settings")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sync Now/i })).toBeTruthy();
  });

  it("invokes onError when URL is invalid", async () => {
    const onError = vi.fn();
    render(<SyncDialog open={true} onClose={() => {}} onSuccess={() => {}} onError={onError} />);
    // Find the input by role rather than label text to avoid duplicate label matches.
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "not-a-url" } });
    fireEvent.click(screen.getByRole("button", { name: /Sync Now/i }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0]).toMatch(/valid URL/i);
  });

  it("invokes onError when fetch fails (non-OK response)", async () => {
    const onError = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
    render(<SyncDialog open={true} onClose={() => {}} onSuccess={() => {}} onError={onError} />);
    fireEvent.click(await screen.findByRole("button", { name: /Sync Now/i }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0]).toMatch(/Sync failed/i);
  });

  it("invokes onError when response shape is invalid", async () => {
    const onError = vi.fn();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ randomKey: true }) });
    render(<SyncDialog open={true} onClose={() => {}} onSuccess={() => {}} onError={onError} />);
    fireEvent.click(await screen.findByRole("button", { name: /Sync Now/i }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
  });

  it("invokes onSuccess + onClose on a valid response", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        homepage: "https://home.example.com",
        configs: [{ from: "x", to: "https://x.com" }],
      }),
    });
    render(<SyncDialog open={true} onClose={onClose} onSuccess={onSuccess} onError={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Sync Now/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(storageData.homepageUrl).toBe("https://home.example.com");
  });

  it("triggers onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    render(<SyncDialog open={true} onClose={onClose} onSuccess={() => {}} onError={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
