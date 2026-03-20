import { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, TextField, Button } from "@mui/material";
import { getSyncUrl, setSyncUrlToStorage, setConfig, saveHomepageUrl, isValidUrl, DEFAULT_SYNC_URL } from "../helpers/storage.js";

/**
 * Dialog component for syncing settings from a remote server URL.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is visible
 * @param {() => void} props.onClose - Callback to close the dialog
 * @param {(response: object) => void} props.onSuccess - Callback on successful sync
 * @param {(message: string) => void} props.onError - Callback on sync failure
 * @returns {React.ReactElement}
 */
export default function SyncDialog({ open, onClose, onSuccess, onError }) {
  const [syncUrl, setSyncUrl] = useState(DEFAULT_SYNC_URL);

  useEffect(() => {
    if (open) {
      getSyncUrl().then(setSyncUrl);
    }
  }, [open]);

  /** Validate the URL, fetch remote config, and apply it to local storage. */
  const handleSyncSubmit = async () => {
    if (!isValidUrl(syncUrl)) {
      onError("Please enter a valid URL starting with http:// or https://");
      return;
    }

    await setSyncUrlToStorage(syncUrl);

    try {
      const res = await fetch(syncUrl, { method: "GET" });
      if (!res.ok) throw new Error("Failed to sync settings from server");

      const ajaxResponse = await res.json();
      if (!("homepage" in ajaxResponse) || !("configs" in ajaxResponse)) {
        throw new Error("Invalid response format");
      }

      onClose();

      await setConfig(JSON.stringify(ajaxResponse.configs ?? []));
      await saveHomepageUrl((ajaxResponse.homepage || "").trim());
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });

      onSuccess(ajaxResponse);
    } catch (err) {
      onError("Sync failed: " + err.message);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Sync Settings</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>Enter the URL of your settings configuration file.</DialogContentText>
        <TextField
          label="Server URL"
          type="url"
          fullWidth
          value={syncUrl}
          onChange={(e) => setSyncUrl(e.target.value)}
          placeholder="https://example.com/config.json"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSyncSubmit}>
          Sync Now
        </Button>
      </DialogActions>
    </Dialog>
  );
}
