/** Options controls for inspecting, exporting, and clearing local extension diagnostics. */
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";

/**
 * Request diagnostics through the background's serialized storage owner.
 * @param {"get"|"clear"} action - Privileged Options-only action.
 * @returns {Promise<object>} Successful response.
 * @throws {Error} When the worker or storage is unavailable.
 */
async function request(action) {
  const response = await chrome.runtime.sendMessage({
    type: `UrlPorter.diagnostics.${action}`,
  });
  if (response?.ok !== true) throw new Error("Diagnostics unavailable");
  return response;
}

/**
 * Render an on-demand diagnostics dialog; no polling or background writes occur on render.
 * @returns {React.ReactElement} Options button and dialog.
 */
export default function DiagnosticsDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  /**
   * Read a fresh snapshot, export it, or clear records and read back through the same owner.
   * @param {"refresh"|"export"|"clear"} action - User action.
   * @returns {Promise<void>} Updates the report or displays a generic error without leaking raw exceptions.
   */
  async function act(action) {
    setBusy(true);
    setError("");
    try {
      if (action === "clear") await request("clear");
      const response = await request("get");
      setReport(response.report);
      if (action === "export") {
        await chrome.downloads.download({
          url: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(response.report, null, 2))}`,
          filename: "url-porter-diagnostics.json",
          saveAs: true,
        });
      }
    } catch {
      setError(
        "Diagnostics action failed. Check extension permissions and the service worker console, then retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        color="inherit"
        onClick={() => {
          setOpen(true);
          void act("refresh");
        }}
      >
        Diagnostics
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="md"
        fullWidth
        aria-labelledby="diagnostics-title"
      >
        <DialogTitle id="diagnostics-title">Extension diagnostics</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Local JavaScript evidence, not a browser crash detector. Normal MV3 worker stops are not
            crashes. Browser crashes, out-of-memory kills, and other extensions cannot be identified
            from these records alone.
          </Alert>
          <Typography paragraph>
            After a Brave/Windows crash, export these records and collect the crash time, Brave
            version from brave://version, and Uploaded crash report ID from brave://crashes. Note
            whether one tab or the whole browser closed.
          </Typography>
          <Typography paragraph variant="body2">
            Keeps at most 100 records on this device. No uploads, extension inventory, page URLs,
            config, selected text, or arbitrary error messages. Review before sharing. Abrupt
            termination may lose the latest events. Sandboxed previews and errors without
            extension-owned locations may not be captured.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {report && (
            <Box
              component="pre"
              aria-label="Diagnostic report"
              sx={{
                maxHeight: 360,
                overflow: "auto",
                fontSize: 12,
                whiteSpace: "pre-wrap",
              }}
            >
              {JSON.stringify(report, null, 2)}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={busy}
            onClick={() => {
              void act("refresh");
            }}
          >
            Refresh
          </Button>
          <Button
            disabled={busy || !report}
            onClick={() => {
              void act("export");
            }}
          >
            Export diagnostics
          </Button>
          <Button
            disabled={busy || !report}
            onClick={() => {
              void act("clear");
            }}
          >
            Clear diagnostics
          </Button>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
