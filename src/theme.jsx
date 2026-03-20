/**
 * Shared MUI theme with automatic light/dark mode detection.
 * All extension pages wrap their content in <ThemeContextProvider>.
 */

import { useMemo } from "react";
import { createTheme, ThemeProvider, CssBaseline, useMediaQuery } from "@mui/material";

/**
 * Generate MUI theme design tokens for the given color mode.
 *
 * @param {"light" | "dark"} mode - The color scheme mode
 * @returns {object} MUI theme configuration object
 */
const getDesignTokens = (mode) => ({
  palette: {
    mode,
    ...(mode === "light"
      ? {
          primary: { main: "#1976d2" },
          secondary: { main: "#9c27b0" },
          background: { default: "#f5f5f5", paper: "#ffffff" },
        }
      : {
          primary: { main: "#90caf9" },
          secondary: { main: "#ce93d8" },
          background: { default: "#121212", paper: "#1e1e1e" },
        }),
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
  shape: {
    borderRadius: 8,
  },
  transitions: {
    create: () => "none",
  },
  components: {
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
    },
    MuiButton: {
      defaultProps: { size: "small" },
    },
    MuiTextField: {
      defaultProps: { size: "small" },
    },
    MuiFormControl: {
      defaultProps: { size: "small" },
    },
    MuiTable: {
      defaultProps: { size: "small" },
    },
    MuiToolbar: {
      defaultProps: { variant: "dense" },
    },
    MuiIconButton: {
      defaultProps: { size: "small" },
    },
    MuiFab: {
      defaultProps: { size: "small" },
    },
    MuiCheckbox: {
      defaultProps: { size: "small" },
    },
    MuiSelect: {
      defaultProps: { size: "small" },
    },
    MuiInputLabel: {
      defaultProps: { size: "small" },
    },
    MuiToggleButton: {
      defaultProps: { size: "small" },
    },
  },
});

/**
 * Theme provider component with automatic light/dark mode detection.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - Child components to wrap
 * @returns {React.ReactElement}
 */
export function ThemeContextProvider({ children }) {
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const mode = prefersDarkMode ? "dark" : "light";
  const theme = useMemo(() => createTheme(getDesignTokens(mode)), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
