/**
 * Tests for BookmarkRuleForm — validates inputs, calls onSave / onCancel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createChromeMock } from "./_chromeMock.js";

const { chrome, reset } = createChromeMock();
vi.stubGlobal("chrome", chrome);

// Polyfill crypto.randomUUID for jsdom.
if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () => "uuid-" + Math.random().toString(36).slice(2);
}

const BookmarkRuleForm = (await import("../src/components/BookmarkRuleForm.jsx")).default;

describe("BookmarkRuleForm", () => {
  beforeEach(() => {
    reset();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders with default placeholder values", () => {
    render(<BookmarkRuleForm onSave={() => {}} onCancel={() => {}} showSnackbar={() => {}} />);
    expect(screen.getAllByDisplayValue("leetcode problems")[0]).toBeTruthy();
  });

  it("renders edit mode with provided rule values", () => {
    const rule = {
      id: "1",
      name: "my-rule",
      historyKeywords: ["a.com", "b.com"],
      urlMatchPattern: "^https?://a\\.com/.+",
      dedupeKeyPattern: "a\\.com/(.+)",
      titleStripPatterns: ["\\s*-\\s*A.*$"],
      sortField: "title",
      sortDirection: "asc",
      enabled: false,
    };
    render(
      <BookmarkRuleForm
        rule={rule}
        onSave={() => {}}
        onCancel={() => {}}
        showSnackbar={() => {}}
      />,
    );
    expect(screen.getAllByDisplayValue("my-rule")[0]).toBeTruthy();
    expect(screen.getAllByDisplayValue("a.com, b.com")[0]).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save/i })).toBeTruthy();
  });

  it("blocks reserved folder names", () => {
    const showSnackbar = vi.fn();
    render(<BookmarkRuleForm onSave={() => {}} onCancel={() => {}} showSnackbar={showSnackbar} />);
    const nameInput = screen.getAllByDisplayValue("leetcode problems")[0];
    fireEvent.change(nameInput, { target: { value: "prs" } });
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(showSnackbar).toHaveBeenCalledWith(expect.stringContaining("reserved"), "error");
  });

  it("blocks duplicate names against existingNames", () => {
    const showSnackbar = vi.fn();
    render(
      <BookmarkRuleForm
        existingNames={["my-rule"]}
        onSave={() => {}}
        onCancel={() => {}}
        showSnackbar={showSnackbar}
      />,
    );
    const nameInput = screen.getAllByDisplayValue("leetcode problems")[0];
    fireEvent.change(nameInput, { target: { value: "my-rule" } });
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(showSnackbar).toHaveBeenCalledWith(expect.stringContaining("already exists"), "error");
  });

  it("blocks empty name", () => {
    const showSnackbar = vi.fn();
    render(<BookmarkRuleForm onSave={() => {}} onCancel={() => {}} showSnackbar={showSnackbar} />);
    const nameInput = screen.getAllByDisplayValue("leetcode problems")[0];
    fireEvent.change(nameInput, { target: { value: "   " } });
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(showSnackbar).toHaveBeenCalledWith(expect.stringContaining("required"), "error");
  });

  it("blocks empty keywords", () => {
    const showSnackbar = vi.fn();
    render(<BookmarkRuleForm onSave={() => {}} onCancel={() => {}} showSnackbar={showSnackbar} />);
    const keywordsInput = screen.getAllByDisplayValue("leetcode.com")[0];
    fireEvent.change(keywordsInput, { target: { value: "" } });
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(showSnackbar).toHaveBeenCalledWith(expect.stringContaining("keyword"), "error");
  });

  it("invokes onSave with a valid rule", () => {
    const onSave = vi.fn();
    const showSnackbar = vi.fn();
    render(<BookmarkRuleForm onSave={onSave} onCancel={() => {}} showSnackbar={showSnackbar} />);
    // The Add button is the very last button in the form.
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0]).toMatchObject({
      name: "leetcode problems",
      historyKeywords: ["leetcode.com"],
      enabled: true,
    });
  });

  it("invokes onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(<BookmarkRuleForm onSave={() => {}} onCancel={onCancel} showSnackbar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("auto-fills history keywords from URL match pattern onBlur when empty", () => {
    render(<BookmarkRuleForm onSave={() => {}} onCancel={() => {}} showSnackbar={() => {}} />);
    const keywordsInput = screen.getAllByDisplayValue("leetcode.com")[0];
    fireEvent.change(keywordsInput, { target: { value: "" } });
    const urlMatch = screen.getAllByDisplayValue("^https?://leetcode\\.com/problems/[^/?#]+")[0];
    fireEvent.blur(urlMatch);
    // domain extracted "leetcode.com"
    expect(keywordsInput.value).toContain("leetcode.com");
  });
});
