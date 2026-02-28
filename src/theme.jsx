import { useMemo } from "react";
import { createTheme, ThemeProvider, CssBaseline, useMediaQuery } from "@mui/material";

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
});

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
