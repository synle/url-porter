import { useState, useEffect, useMemo, useRef } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  TextField,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  Fab,
  InputAdornment,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import SyncIcon from "@mui/icons-material/Sync";
import SaveIcon from "@mui/icons-material/Save";
import ViewListIcon from "@mui/icons-material/ViewList";
import CodeIcon from "@mui/icons-material/Code";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import HistoryIcon from "@mui/icons-material/History";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import AddLinkIcon from "@mui/icons-material/AddLink";
import { ThemeContextProvider } from "../../theme.jsx";
import {
  getConfig,
  setConfig,
  getHomepageUrl,
  saveHomepageUrl,
  getSyncUrl,
  setSyncUrlToStorage,
  isValidUrl,
  DEFAULT_SYNC_URL,
} from "../../helpers/storage.js";
import { normalizeEntry, normalizeFrom, normalizeTo, findDuplicateEntry } from "../../helpers/configUtils.js";
import { addHistoryEntry, getHistoryAliasLimit, setHistoryAliasLimit, getHistoryEntryLimit, setHistoryEntryLimit } from "../../helpers/historyUtils.js";

function cleanAlias(value) {
  return value.trim().toLowerCase();
}

function cleanUrl(value) {
  let result = value.trim().toLowerCase();
  if (result && !result.startsWith("http://") && !result.startsWith("https://")) {
    result = "https://" + result;
  }
  return result;
}

function OptionsContent() {
  // Core state
  const [homepageUrl, setHomepageUrl] = useState("");
  const [configEntries, setConfigEntries] = useState([]);
  const [syncUrl, setSyncUrl] = useState(DEFAULT_SYNC_URL);

  // Mode state
  const [mode, setMode] = useState("clean"); // "clean" | "advanced"
  const [editorContent, setEditorContent] = useState("");
  const [lastSavedEditorContent, setLastSavedEditorContent] = useState("");

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [massDeleteDialogOpen, setMassDeleteDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const [jsonErrorDialogOpen, setJsonErrorDialogOpen] = useState(false);
  const [duplicateDialog, setDuplicateDialog] = useState({ open: false, index: -1, oldTo: "", context: "" });
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  // Form state
  const [linkFrom, setLinkFrom] = useState("");
  const [linkTo, setLinkTo] = useState("");
  const [editIndex, setEditIndex] = useState(-1);
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [deleteIndex, setDeleteIndex] = useState(-1);

  // Table state
  const [selected, setSelected] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("from");
  const [sortDir, setSortDir] = useState("asc");

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  // History limits
  const [historyAliasLimitValue, setHistoryAliasLimitValue] = useState(5000);
  const [historyEntryLimitValue, setHistoryEntryLimitValue] = useState(20);

  const fromInputRef = useRef(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const config = await getConfig();
    const homepage = await getHomepageUrl();
    const savedSyncUrl = await getSyncUrl();
    setHomepageUrl(homepage);
    setConfigEntries(Array.isArray(config) ? config : []);
    setSyncUrl(savedSyncUrl);
    const json = JSON.stringify(Array.isArray(config) ? config : [], null, 2);
    setEditorContent(json);
    setLastSavedEditorContent(json);
    const aliasLimit = await getHistoryAliasLimit();
    setHistoryAliasLimitValue(aliasLimit);
    const entryLimit = await getHistoryEntryLimit();
    setHistoryEntryLimitValue(entryLimit);
  };

  const showSnackbar = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  const saveAndNotify = async (entries) => {
    try {
      await setConfig(JSON.stringify(entries));
      await saveHomepageUrl(homepageUrl.trim());
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
      const refreshed = await getConfig();
      setConfigEntries(Array.isArray(refreshed) ? refreshed : []);
      const json = JSON.stringify(Array.isArray(refreshed) ? refreshed : [], null, 2);
      setEditorContent(json);
      setLastSavedEditorContent(json);
      return true;
    } catch (err) {
      showSnackbar(String(err), "error");
      return false;
    }
  };

  // Homepage autosave on blur
  const handleHomepageBlur = async () => {
    try {
      await saveHomepageUrl(homepageUrl.trim());
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
    } catch (err) {
      showSnackbar("Failed to save homepage: " + err, "error");
    }
  };

  // --- Clean Mode CRUD ---
  const handleAddLink = async () => {
    if (!linkFrom.trim() || !linkTo.trim()) return;

    const duplicate = findDuplicateEntry(configEntries, linkFrom);
    if (duplicate) {
      setAddDialogOpen(false);
      setDuplicateDialog({ open: true, index: duplicate.index, oldTo: duplicate.entry.to, context: "add" });
      return;
    }

    const newEntries = [
      ...configEntries,
      {
        from: normalizeFrom(linkFrom.trim()),
        to: normalizeTo(linkTo.trim()),
      },
    ];
    const ok = await saveAndNotify(newEntries);
    if (ok) {
      await addHistoryEntry(normalizeFrom(linkFrom.trim()), normalizeTo(linkTo.trim()), "added");
      showSnackbar("Link added!");
      setLinkFrom("");
      setLinkTo("");
      setAddDialogOpen(false);
    }
  };

  const handleEditSave = async () => {
    if (editIndex < 0) return;

    const duplicate = findDuplicateEntry(configEntries, editFrom, editIndex);
    if (duplicate) {
      setEditDialogOpen(false);
      setDuplicateDialog({ open: true, index: duplicate.index, oldTo: duplicate.entry.to, context: "edit" });
      return;
    }

    const oldEntry = configEntries[editIndex];
    const newEntries = [...configEntries];
    newEntries[editIndex] = {
      from: editFrom.trim(),
      to: editTo.trim(),
    };
    const ok = await saveAndNotify(newEntries);
    if (ok) {
      if (oldEntry) await addHistoryEntry(oldEntry.from, oldEntry.to, "edited");
      showSnackbar("Link updated!");
      setEditDialogOpen(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteIndex < 0) return;
    const deletedEntry = configEntries[deleteIndex];
    const newEntries = configEntries.filter((_, i) => i !== deleteIndex);
    const ok = await saveAndNotify(newEntries);
    if (ok) {
      if (deletedEntry) await addHistoryEntry(deletedEntry.from, deletedEntry.to, "deleted");
      showSnackbar("Link deleted!");
      setDeleteDialogOpen(false);
      setSelected((prev) => prev.filter((i) => i !== deleteIndex));
    }
  };

  const handleMassDelete = async () => {
    const deletedEntries = configEntries.filter((_, i) => selected.includes(i));
    const newEntries = configEntries.filter((_, i) => !selected.includes(i));
    const ok = await saveAndNotify(newEntries);
    if (ok) {
      for (const raw of deletedEntries) {
        const entry = normalizeEntry(raw);
        if (entry) await addHistoryEntry(entry.from, entry.to, "deleted");
      }
      showSnackbar(`${selected.length} link(s) deleted!`);
      setSelected([]);
      setMassDeleteDialogOpen(false);
    }
  };

  // --- Duplicate resolution ---
  const handleDuplicateUpdate = async () => {
    const { index, context } = duplicateDialog;
    const from = context === "edit" ? editFrom.trim() : linkFrom.trim();
    const to = context === "edit" ? editTo.trim() : linkTo.trim();

    const oldEntry = configEntries[index];
    const newEntries = [...configEntries];
    newEntries[index] = { from, to };

    // If editing a different entry, remove it since we merged into the duplicate
    if (context === "edit" && editIndex >= 0 && editIndex !== index) {
      newEntries.splice(editIndex, 1);
    }

    const ok = await saveAndNotify(newEntries);
    if (ok) {
      if (oldEntry) await addHistoryEntry(oldEntry.from, oldEntry.to, "edited");
      showSnackbar("Link updated!");
      setDuplicateDialog({ open: false, index: -1, oldTo: "", context: "" });
      setLinkFrom("");
      setLinkTo("");
    }
  };

  // --- Advanced Mode ---
  const handleAdvancedSave = async () => {
    try {
      await setConfig(editorContent);
      await saveHomepageUrl(homepageUrl.trim());
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
      await loadSettings();
      showSnackbar("Settings saved!");
    } catch (err) {
      setJsonErrorDialogOpen(true);
    }
  };

  // --- Mode switching ---
  const handleModeChange = (_, newMode) => {
    if (!newMode || newMode === mode) return;

    if (mode === "advanced" && editorContent !== lastSavedEditorContent) {
      setUnsavedDialogOpen(true);
      return;
    }

    switchMode(newMode);
  };

  const switchMode = (newMode) => {
    if (newMode === "advanced") {
      const json = JSON.stringify(configEntries, null, 2);
      setEditorContent(json);
      setLastSavedEditorContent(json);
    }
    setMode(newMode);
    setSelected([]);
    setSearchQuery("");
  };

  // --- Sync ---
  const handleSyncSubmit = async () => {
    if (!isValidUrl(syncUrl)) {
      showSnackbar("Please enter a valid URL starting with http:// or https://", "error");
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

      setHomepageUrl((ajaxResponse.homepage || "").trim());
      await setConfig(JSON.stringify(ajaxResponse.configs ?? []));
      await saveHomepageUrl((ajaxResponse.homepage || "").trim());
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
      await loadSettings();

      setSyncDialogOpen(false);
      showSnackbar("Settings synced successfully!");
    } catch (err) {
      showSnackbar("Sync failed: " + err.message, "error");
    }
  };

  // --- Reset ---
  const handleReset = async () => {
    try {
      const entriesToLog = configEntries.map(normalizeEntry).filter(Boolean);
      await setConfig("[]");
      await saveHomepageUrl("");
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
      for (const entry of entriesToLog) {
        await addHistoryEntry(entry.from, entry.to, "deleted");
      }
      await loadSettings();
      setResetDialogOpen(false);
      setSelected([]);
      showSnackbar("All settings have been reset.");
    } catch (err) {
      showSnackbar("Failed to reset: " + err, "error");
    }
  };

  // --- Filtering & sorting ---
  const filteredEntries = useMemo(() => {
    let entries = configEntries
      .map((entry, index) => {
        const normalized = normalizeEntry(entry);
        return normalized ? { ...normalized, _origIndex: index } : null;
      })
      .filter(Boolean);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter(
        (e) =>
          (e.from || "").toLowerCase().includes(q) || (e.to || "").toLowerCase().includes(q),
      );
    }

    entries.sort((a, b) => {
      const aVal = (a[sortBy] || "").toLowerCase();
      const bVal = (b[sortBy] || "").toLowerCase();
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    return entries;
  }, [configEntries, searchQuery, sortBy, sortDir]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  const toggleSelect = (origIndex) => {
    setSelected((prev) =>
      prev.includes(origIndex) ? prev.filter((i) => i !== origIndex) : [...prev, origIndex],
    );
  };

  const toggleSelectAll = () => {
    const visibleIndices = filteredEntries.map((e) => e._origIndex);
    const allSelected = visibleIndices.every((i) => selected.includes(i));
    if (allSelected) {
      setSelected((prev) => prev.filter((i) => !visibleIndices.includes(i)));
    } else {
      setSelected((prev) => [...new Set([...prev, ...visibleIndices])]);
    }
  };

  const sortIndicator = (field) => {
    if (sortBy !== field) return "";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  };

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            URL Porter Options
          </Typography>
          <Button
            color="inherit"
            startIcon={<AddLinkIcon />}
            onClick={() => {
              chrome.tabs.create({ url: chrome.runtime.getURL("pages/addlink/addlink.html") });
            }}
          >
            Add Link
          </Button>
          <Button
            color="inherit"
            startIcon={<HistoryIcon />}
            onClick={() => {
              window.location.href = chrome.runtime.getURL("pages/history/history.html");
            }}
          >
            History
          </Button>
          <Button color="inherit" startIcon={<SyncIcon />} onClick={() => setSyncDialogOpen(true)}>
            Sync
          </Button>
          <Button color="inherit" startIcon={<DeleteForeverIcon />} onClick={() => setResetDialogOpen(true)}>
            Reset All
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Mode Toggle */}
        <Box display="flex" justifyContent="center" mb={3}>
          <ToggleButtonGroup value={mode} exclusive onChange={handleModeChange} size="small">
            <ToggleButton value="clean">
              <ViewListIcon sx={{ mr: 1 }} /> Clean Mode
            </ToggleButton>
            <ToggleButton value="advanced">
              <CodeIcon sx={{ mr: 1 }} /> Advanced Mode
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Homepage URL */}
        <TextField
          label="Homepage URL"
          fullWidth
          value={homepageUrl}
          onChange={(e) => setHomepageUrl(e.target.value)}
          onBlur={handleHomepageBlur}
          placeholder="Enter your Homepage URL here"
          sx={{ mb: 3 }}
        />

        {/* Clean Mode */}
        {mode === "clean" && (
          <Box>
            {/* Search & Actions */}
            <Box display="flex" gap={2} mb={2} alignItems="center" flexWrap="wrap">
              <TextField
                size="small"
                placeholder="Search links..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ flexGrow: 1, minWidth: 200 }}
              />
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Sort by</InputLabel>
                <Select
                  value={sortBy}
                  label="Sort by"
                  onChange={(e) => {
                    setSortBy(e.target.value);
                    setSortDir("asc");
                  }}
                >
                  <MenuItem value="from">From</MenuItem>
                  <MenuItem value="to">To</MenuItem>
                </Select>
              </FormControl>
              {selected.length > 0 && (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => setMassDeleteDialogOpen(true)}
                >
                  Delete ({selected.length})
                </Button>
              )}
            </Box>

            {/* Table */}
            <TableContainer component={Paper} sx={{ mb: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={
                          selected.length > 0 &&
                          selected.length < filteredEntries.length
                        }
                        checked={
                          filteredEntries.length > 0 &&
                          filteredEntries.every((e) => selected.includes(e._origIndex))
                        }
                        onChange={toggleSelectAll}
                      />
                    </TableCell>
                    <TableCell
                      onClick={() => handleSort("from")}
                      sx={{ cursor: "pointer", fontWeight: "bold", userSelect: "none" }}
                    >
                      From{sortIndicator("from")}
                    </TableCell>
                    <TableCell
                      onClick={() => handleSort("to")}
                      sx={{ cursor: "pointer", fontWeight: "bold", userSelect: "none" }}
                    >
                      To{sortIndicator("to")}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold" }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          {searchQuery ? "No matching links found." : "No links configured. Click + to add one."}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map((entry) => (
                      <TableRow key={entry._origIndex} hover>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={selected.includes(entry._origIndex)}
                            onChange={() => toggleSelect(entry._origIndex)}
                          />
                        </TableCell>
                        <TableCell
                          sx={{
                            maxWidth: 250,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Tooltip title={entry.from || ""}>
                            <span>{entry.from}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell
                          sx={{
                            maxWidth: 300,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Tooltip title={entry.to || ""}>
                            <span>{entry.to}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setEditIndex(entry._origIndex);
                              setEditFrom(entry.from || "");
                              setEditTo(entry.to || "");
                              setEditDialogOpen(true);
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => {
                              setDeleteIndex(entry._origIndex);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* FAB Add */}
            <Fab
              color="primary"
              onClick={() => {
                setLinkFrom("");
                setLinkTo("");
                setAddDialogOpen(true);
              }}
              sx={{ position: "fixed", bottom: 24, right: 24 }}
            >
              <AddIcon />
            </Fab>
          </Box>
        )}

        {/* Advanced Mode */}
        {mode === "advanced" && (
          <Box>
            <TextField
              multiline
              fullWidth
              minRows={20}
              maxRows={30}
              value={editorContent}
              onChange={(e) => setEditorContent(e.target.value)}
              slotProps={{
                input: {
                  sx: {
                    fontFamily: '"Roboto Mono", "Courier New", monospace',
                    fontSize: 13,
                    lineHeight: 1.5,
                  },
                },
              }}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleAdvancedSave}
              size="large"
            >
              Save
            </Button>
          </Box>
        )}
        {/* History Limits */}
        <Box display="flex" alignItems="center" gap={2} mt={3} flexWrap="wrap">
          <Typography variant="body2" color="text.secondary">
            Max link aliases in history:
          </Typography>
          <TextField
            type="number"
            size="small"
            value={historyAliasLimitValue}
            onChange={(e) => setHistoryAliasLimitValue(Number(e.target.value))}
            onBlur={async () => {
              const val = Math.max(1, historyAliasLimitValue || 5000);
              setHistoryAliasLimitValue(val);
              await setHistoryAliasLimit(val);
            }}
            slotProps={{ input: { inputProps: { min: 1 } } }}
            sx={{ width: 100 }}
          />
          <Typography variant="body2" color="text.secondary">
            Max entries per alias:
          </Typography>
          <TextField
            type="number"
            size="small"
            value={historyEntryLimitValue}
            onChange={(e) => setHistoryEntryLimitValue(Number(e.target.value))}
            onBlur={async () => {
              const val = Math.max(1, historyEntryLimitValue || 20);
              setHistoryEntryLimitValue(val);
              await setHistoryEntryLimit(val);
            }}
            slotProps={{ input: { inputProps: { min: 1 } } }}
            sx={{ width: 100 }}
          />
        </Box>
      </Container>

      {/* Add Link Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        TransitionProps={{
          onEntered: () => fromInputRef.current?.focus(),
        }}
      >
        <form onSubmit={(e) => { e.preventDefault(); handleAddLink(); }}>
          <DialogTitle>Add a Link</DialogTitle>
          <DialogContent>
            <TextField
              inputRef={fromInputRef}
              label="Link Alias"
              fullWidth
              value={linkFrom}
              onChange={(e) => setLinkFrom(e.target.value)}
              onBlur={() => setLinkFrom(cleanAlias(linkFrom))}
              sx={{ mt: 1, mb: 2 }}
              required
            />
            <TextField
              label="Full URL"
              fullWidth
              value={linkTo}
              onChange={(e) => setLinkTo(e.target.value)}
              onBlur={() => { if (linkTo.trim()) setLinkTo(cleanUrl(linkTo)); }}
              required
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" type="submit">
              Add
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Edit Link Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={(e) => { e.preventDefault(); handleEditSave(); }}>
          <DialogTitle>Edit Link</DialogTitle>
          <DialogContent>
            <TextField
              label="From"
              fullWidth
              value={editFrom}
              onChange={(e) => setEditFrom(e.target.value)}
              onBlur={() => setEditFrom(cleanAlias(editFrom))}
              sx={{ mt: 1, mb: 2 }}
            />
            <TextField
              label="To"
              fullWidth
              value={editTo}
              onChange={(e) => setEditTo(e.target.value)}
              onBlur={() => { if (editTo.trim()) setEditTo(cleanUrl(editTo)); }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" type="submit">
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Link</DialogTitle>
        <DialogContent>
          <DialogContentText>Are you sure you want to delete this link?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Mass Delete Confirmation Dialog */}
      <Dialog open={massDeleteDialogOpen} onClose={() => setMassDeleteDialogOpen(false)}>
        <DialogTitle>Delete Selected Links</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete {selected.length} selected link(s)?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMassDeleteDialogOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleMassDelete}>
            Delete All
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sync Settings Dialog */}
      <Dialog open={syncDialogOpen} onClose={() => setSyncDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Sync Settings</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Enter the URL of your settings configuration file.
          </DialogContentText>
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
          <Button onClick={() => setSyncDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSyncSubmit}>
            Sync Now
          </Button>
        </DialogActions>
      </Dialog>

      {/* Unsaved Changes Dialog */}
      <Dialog open={unsavedDialogOpen} onClose={() => setUnsavedDialogOpen(false)}>
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes in the editor. Switching modes will discard them. Continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnsavedDialogOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setUnsavedDialogOpen(false);
              switchMode("clean");
            }}
          >
            Discard & Switch
          </Button>
        </DialogActions>
      </Dialog>

      {/* JSON Error Dialog */}
      <Dialog open={jsonErrorDialogOpen} onClose={() => setJsonErrorDialogOpen(false)}>
        <DialogTitle>Invalid JSON</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Invalid JSON. Please fix errors before saving. The editor highlights syntax errors
            inline.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setJsonErrorDialogOpen(false)}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset All Dialog */}
      <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)}>
        <DialogTitle>Reset All Settings</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete all your redirect links and clear your homepage URL. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialogOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleReset}>
            Reset Everything
          </Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate Alias Dialog */}
      <Dialog
        open={duplicateDialog.open}
        onClose={() => setDuplicateDialog({ open: false, index: -1, oldTo: "", context: "" })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Duplicate Alias</DialogTitle>
        <DialogContent>
          <DialogContentText>
            An alias matching <strong>{(duplicateDialog.context === "edit" ? editFrom : linkFrom).trim()}</strong> already exists and points to:
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
          <DialogContentText sx={{ mt: 2 }}>
            Do you want to update it to point to the new URL instead?
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
            {(duplicateDialog.context === "edit" ? editTo : linkTo).trim()}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicateDialog({ open: false, index: -1, oldTo: "", context: "" })}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleDuplicateUpdate}>
            Update Existing Link
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
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

export default function Options() {
  return (
    <ThemeContextProvider>
      <OptionsContent />
    </ThemeContextProvider>
  );
}
