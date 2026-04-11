/**
 * Add Bookmark Rule page — standalone form for quick-adding a bookmark reconciler rule.
 *
 * Opens from the context menu pre-filled with the current tab's URL context.
 * Auto-generates rule name (domain + date), history keywords, URL match pattern,
 * and dedup key pattern from the provided URL.
 */

import { useState, useEffect } from "react";
import { Container, Typography, Paper, Box, Snackbar, Alert, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SettingsIcon from "@mui/icons-material/Settings";
import { ThemeContextProvider } from "../../theme.jsx";
import { getBookmarkRules, setBookmarkRules } from "../../helpers/storage.js";
import { deriveRuleFromUrl } from "../../helpers/ruleDerivation.js";
import BookmarkRuleForm from "../../components/BookmarkRuleForm.jsx";

/** React component that renders the Add Bookmark Rule page content. */
function AddRuleContent() {
  const [existingNames, setExistingNames] = useState([]);
  const [prefillRule, setPrefillRule] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  useEffect(() => {
    init();
  }, []);

  /**
   * Load existing rule names and derive auto-fill from URL params.
   * @returns {Promise<void>}
   */
  const init = async () => {
    const rules = await getBookmarkRules();
    setExistingNames(rules.map((r) => r.name));

    const params = new URLSearchParams(window.location.search);
    const paramUrl = params.get("url");

    if (paramUrl) {
      const decoded = decodeURIComponent(paramUrl);
      const derived = deriveRuleFromUrl(decoded);
      setPrefillRule({
        id: null,
        name: derived.name,
        historyKeywords: derived.historyKeywords,
        urlMatchPattern: derived.urlMatchPattern,
        dedupeKeyPattern: derived.dedupeKeyPattern,
        titleStripPatterns: [],
        sortField: "visitTime",
        sortDirection: "desc",
        enabled: true,
      });
    } else {
      setPrefillRule(null);
    }
  };

  /**
   * Save the new rule to storage and close the page.
   * @param {object} rule - The validated rule object from BookmarkRuleForm
   * @returns {Promise<void>}
   */
  const handleSave = async (rule) => {
    const existing = await getBookmarkRules();
    existing.push(rule);
    await setBookmarkRules(existing);
    chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
    showSnackbar("Bookmark rule added!");
    setTimeout(() => window.close(), 1000);
  };

  /**
   * Close the page.
   * @returns {void}
   */
  const handleCancel = () => {
    window.close();
  };

  /**
   * Navigate to the Options page.
   * @returns {void}
   */
  const navigateToOptions = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/options/options.html") });
  };

  /**
   * Displays a snackbar notification.
   * @param {string} message - The message to display
   * @param {string} [severity="success"] - The alert severity
   */
  const showSnackbar = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  return (
    <Box
      sx={{
        minWidth: 600,
        minHeight: 500,
        width: "100%",
        mx: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Container disableGutters sx={{ px: 2.5, py: 2, flexGrow: 1 }}>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h6" fontWeight="bold">
            Add Bookmark Rule
          </Typography>
          <Box>
            <IconButton onClick={navigateToOptions} title="Open Settings">
              <SettingsIcon />
            </IconButton>
            <IconButton onClick={handleCancel} title="Close">
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        <Paper sx={{ p: 2.5 }} elevation={0}>
          <BookmarkRuleForm
            rule={prefillRule}
            existingNames={existingNames}
            onSave={handleSave}
            onCancel={handleCancel}
            showSnackbar={showSnackbar}
          />
        </Paper>
      </Container>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

/** Exported Add Bookmark Rule page wrapper with theme provider. */
export default function AddRule() {
  return (
    <ThemeContextProvider>
      <AddRuleContent />
    </ThemeContextProvider>
  );
}
