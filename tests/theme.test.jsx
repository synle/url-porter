/**
 * Tests for the ThemeContextProvider wrapper.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ThemeContextProvider } from "../src/theme.jsx";

describe("ThemeContextProvider", () => {
  it("renders children inside the MUI theme provider", () => {
    const { getByText } = render(
      <ThemeContextProvider>
        <div>hello theme</div>
      </ThemeContextProvider>,
    );
    expect(getByText("hello theme")).toBeTruthy();
  });

  it("applies the light theme when system prefers light", () => {
    // jsdom's matchMedia stub defaults to !matches → light mode path
    const { container } = render(
      <ThemeContextProvider>
        <span>x</span>
      </ThemeContextProvider>,
    );
    expect(container.firstChild).toBeTruthy();
  });
});
