/**
 * Add Link popup — lightweight form for quick-adding a redirect rule.
 *
 * Opens as the browser action popup or in a new tab from the context menu.
 * Pre-fills from the current tab URL or from query params passed by the
 * background script's context menu handler.
 */

import { useState, useEffect, useRef } from "react";
import {
  Container,
  Typography,
  TextField,
  Button,
  Paper,
  Box,
  Snackbar,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import SettingsIcon from "@mui/icons-material/Settings";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SyncIcon from "@mui/icons-material/Sync";
import { ThemeContextProvider } from "../../theme.jsx";
import { getConfig, setConfig } from "../../helpers/storage.js";
import { normalizeFrom, normalizeTo, findDuplicateEntry, cleanAlias, cleanUrl } from "../../helpers/configUtils.js";
import { ALIAS_PLACEHOLDER, URL_PLACEHOLDER } from "../../helpers/fieldHelpers.js";
import { addHistoryEntry } from "../../helpers/historyUtils.js";
import SyncDialog from "../../components/SyncDialog.jsx";

function AddLinkContent() {
  const [linkFrom, setLinkFrom] = useState("");
  const [linkTo, setLinkTo] = useState("");
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [duplicateDialog, setDuplicateDialog] = useState({ open: false, index: -1, oldTo: "" });
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const fromInputRef = useRef(null);

  useEffect(() => {
    detectContextAndPrefill();
  }, []);

  const detectContextAndPrefill = async () => {
    // Check for URL passed via query param (from context menu).
    // Values are URI-encoded by the background script's context menu handler.
    const params = new URLSearchParams(window.location.search);
    const paramUrl = params.get("url");
    const paramTitle = params.get("title");

    if (paramUrl) {
      setLinkTo(decodeURIComponent(paramUrl));
      if (paramTitle) {
        setLinkFrom(decodeURIComponent(paramTitle));
      }
      setTimeout(() => fromInputRef.current?.focus(), 100);
      return;
    }

    // For popup: query the active tab to get current page URL
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://")) {
        setLinkTo(tab.url);
        if (tab.title) {
          setLinkFrom(tab.title);
        }
      }
    } catch {
      // Not in extension context or no permission
    }

    setTimeout(() => fromInputRef.current?.focus(), 100);
  };

  const handleSave = async () => {
    if (!linkFrom.trim()) {
      showSnackbar("Please enter a link alias.", "error");
      return;
    }
    if (!linkTo.trim()) {
      showSnackbar("Please enter a URL.", "error");
      return;
    }

    try {
      const configs = await getConfig();
      const duplicate = findDuplicateEntry(configs, linkFrom);

      if (duplicate) {
        setDuplicateDialog({ open: true, index: duplicate.index, oldTo: duplicate.entry.to });
        return;
      }

      await saveNewLink(configs);
    } catch (err) {
      showSnackbar(String(err), "error");
    }
  };

  const saveNewLink = async (configs) => {
    const from = normalizeFrom(linkFrom.trim());
    const to = normalizeTo(linkTo.trim());
    configs.push({ from, to });

    await setConfig(JSON.stringify(configs));
    chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
    await addHistoryEntry(from, to, "added");
    showSnackbar("Link added!");
    setTimeout(() => window.close(), 1000);
  };

  const handleUpdateExisting = async () => {
    try {
      const configs = await getConfig();
      const { index } = duplicateDialog;
      const oldEntry = configs[index];
      configs[index] = {
        from: normalizeFrom(linkFrom.trim()),
        to: normalizeTo(linkTo.trim()),
      };

      await setConfig(JSON.stringify(configs));
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
      if (oldEntry) await addHistoryEntry(oldEntry.from, oldEntry.to, "edited");
      setDuplicateDialog({ open: false, index: -1, oldTo: "" });
      showSnackbar("Link updated!");
      setTimeout(() => window.close(), 1000);
    } catch (err) {
      showSnackbar(String(err), "error");
    }
  };

  const handleCancel = () => {
    window.close();
  };

  const navigateToOptions = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/options/options.html") });
  };

  const openInNewTab = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/addlink/addlink.html") });
  };

  const showSnackbar = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  const handleFromBlur = () => {
    setLinkFrom(cleanAlias(linkFrom));
  };

  const handleToBlur = () => {
    if (linkTo.trim()) {
      setLinkTo(cleanUrl(linkTo));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSave();
  };

  return (
    <Box
      sx={{
        minWidth: 700,
        minHeight: 325,
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
            Add Link
          </Typography>
          <Box>
            <IconButton onClick={() => setSyncDialogOpen(true)} title="Sync Settings">
              <SyncIcon />
            </IconButton>
            <IconButton onClick={openInNewTab} title="Open in New Tab">
              <OpenInNewIcon />
            </IconButton>
            <IconButton onClick={navigateToOptions} title="Open Settings">
              <SettingsIcon />
            </IconButton>
            <IconButton onClick={handleCancel} title="Close">
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        <Paper sx={{ p: 2.5 }} elevation={0} component="form" onSubmit={handleSubmit}>
          <TextField
            inputRef={fromInputRef}
            label="Link Alias"
            fullWidth
            value={linkFrom}
            onChange={(e) => setLinkFrom(e.target.value)}
            onBlur={handleFromBlur}
            placeholder={ALIAS_PLACEHOLDER}
            sx={{ mb: 2 }}
            required
            autoFocus
          />

          <TextField
            label="Full URL"
            fullWidth
            value={linkTo}
            onChange={(e) => setLinkTo(e.target.value)}
            onBlur={handleToBlur}
            placeholder={URL_PLACEHOLDER}
            sx={{ mb: 2.5 }}
            required
          />

          <Box display="flex" gap={1.5} justifyContent="flex-end">
            <Button variant="outlined" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="contained" startIcon={<SaveIcon />} type="submit">
              Add Link
            </Button>
          </Box>
        </Paper>
      </Container>

      {/* Duplicate Alias Dialog */}
      <Dialog open={duplicateDialog.open} onClose={() => setDuplicateDialog({ open: false, index: -1, oldTo: "" })} maxWidth="sm" fullWidth>
        <DialogTitle>Duplicate Alias</DialogTitle>
        <DialogContent>
          <DialogContentText>
            An alias matching <strong>{linkFrom.trim()}</strong> already exists and points to:
          </DialogContentText>
          <Typography
            variant="body2"
            sx={{
              mt: 1,
              p: 1.5,
              bgcolor: "action.hover",
              borderRadius: 1,
              wordBreak: "break-all",
              fontFamily: "monospace",
            }}
          >
            {duplicateDialog.oldTo}
          </Typography>
          <DialogContentText sx={{ mt: 2 }}>Do you want to update it to point to the new URL instead?</DialogContentText>
          <Typography
            variant="body2"
            sx={{
              mt: 1,
              p: 1.5,
              bgcolor: "action.hover",
              borderRadius: 1,
              wordBreak: "break-all",
              fontFamily: "monospace",
            }}
          >
            {linkTo.trim()}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicateDialog({ open: false, index: -1, oldTo: "" })}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateExisting}>
            Update Existing Link
          </Button>
        </DialogActions>
      </Dialog>

      <SyncDialog
        open={syncDialogOpen}
        onClose={() => setSyncDialogOpen(false)}
        onSuccess={() => showSnackbar("Settings synced successfully!")}
        onError={(msg) => showSnackbar(msg, "error")}
      />

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

export default function AddLink() {
  return (
    <ThemeContextProvider>
      <AddLinkContent />
    </ThemeContextProvider>
  );
}
