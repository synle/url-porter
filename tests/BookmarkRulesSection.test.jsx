/**
 * Tests for BookmarkRulesSection — loads rules, supports add/edit/delete/toggle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, storageData, reset } = createChromeMock();
vi.stubGlobal("chrome", chrome);

if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () => "uuid-" + Math.random().toString(36).slice(2);
}

const BookmarkRulesSection = (await import("../src/components/BookmarkRulesSection.jsx")).default;

describe("BookmarkRulesSection", () => {
  beforeEach(() => {
    reset();
  });

  afterEach(() => cleanup());

  it("shows the empty-state message when no rules", async () => {
    render(<BookmarkRulesSection showSnackbar={() => {}} />);
    expect(await screen.findByText(/No custom bookmark rules/i)).toBeTruthy();
  });

  it("renders the rule list when rules exist", async () => {
    storageData.bookmarkRules = [
      { id: "1", name: "leet", historyKeywords: ["leet.com"], sortField: "visitTime", sortDirection: "desc", enabled: true },
    ];
    render(<BookmarkRulesSection showSnackbar={() => {}} />);
    expect(await screen.findByText("leet")).toBeTruthy();
  });

  it("opens the Add dialog when Add Rule clicked", async () => {
    render(<BookmarkRulesSection showSnackbar={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add Rule/i }));
    expect(await screen.findByText(/Add Bookmark Rule/)).toBeTruthy();
  });

  it("toggles a rule's enabled state", async () => {
    storageData.bookmarkRules = [
      { id: "1", name: "leet", historyKeywords: ["x"], sortField: "visitTime", sortDirection: "desc", enabled: true },
    ];
    const snackbar = vi.fn();
    render(<BookmarkRulesSection showSnackbar={snackbar} />);
    await screen.findByText("leet");
    // MUI Switch renders an <input role="switch"> in current versions and a checkbox in older.
    const toggle = screen.queryByRole("switch") || screen.queryByRole("checkbox");
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    await waitFor(() => expect(storageData.bookmarkRules[0].enabled).toBe(false));
  });

  it("opens delete confirmation and removes a rule on confirm", async () => {
    storageData.bookmarkRules = [
      { id: "1", name: "to-delete", historyKeywords: ["x"], sortField: "visitTime", sortDirection: "desc", enabled: true },
    ];
    const snackbar = vi.fn();
    render(<BookmarkRulesSection showSnackbar={snackbar} />);
    // Wait for rule render
    await screen.findByText("to-delete");
    // Click the delete (error-colored) IconButton — it's the third button on the row (toggle, edit, delete)
    const buttons = screen.getAllByRole("button");
    // Last button is Add Rule; second-to-last is Delete; third-to-last is Edit.
    // To be robust, find the Delete confirmation by clicking the last error-colored IconButton in the list.
    const deleteBtn = buttons[buttons.length - 1]; // Add Rule is first, list buttons after — but with MUI, hard to tell. Use the actual delete by query.
    void deleteBtn;
    // Instead, find all buttons and pick the one that's an icon-button on the list (skip Add Rule).
    const ruleButtons = screen.getAllByRole("button").filter((b) => b.textContent === "" || b.querySelector("svg"));
    // The delete IconButton is the last per row (after toggle + edit). Find by aria-label or position.
    // Click the last icon button (delete).
    const iconButtons = screen.getAllByRole("button").filter((b) => b.querySelector("svg") && !b.textContent.match(/Add/i));
    fireEvent.click(iconButtons[iconButtons.length - 1]);
    // Confirm delete
    const confirmBtn = await screen.findByRole("button", { name: /^Delete$/i });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(storageData.bookmarkRules).toHaveLength(0));
    void ruleButtons;
  });
});
