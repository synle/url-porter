/**
 * History page — audit trail viewer for redirect rule changes.
 *
 * Displays all history entries in a searchable, sortable table with
 * color-coded action chips (added/edited/deleted). Supports single
 * and bulk restore of entries back into the active config.
 */

import { useState, useEffect, useMemo } from "react";
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
  Chip,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
  Alert,
  InputAdornment,
  Tooltip,
  IconButton,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import RestoreIcon from "@mui/icons-material/Restore";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddLinkIcon from "@mui/icons-material/AddLink";
import { ThemeContextProvider } from "../../theme.jsx";
import { getHistoryAsFlat, clearHistory } from "../../helpers/historyUtils.js";
import { getConfig, setConfig } from "../../helpers/storage.js";
import { findDuplicateEntry, normalizeFrom, normalizeTo } from "../../helpers/configUtils.js";

const ACTION_COLORS = {
  added: "success",
  edited: "warning",
  deleted: "error",
};

function HistoryContent() {
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [restoreAllDialogOpen, setRestoreAllDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const history = await getHistoryAsFlat();
    setEntries(history);
  };

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        (e.from || "").toLowerCase().includes(q) || (e.to || "").toLowerCase().includes(q) || (e.action || "").toLowerCase().includes(q),
    );
  }, [entries, searchQuery]);

  const showSnackbar = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  // Restore entries into config without triggering history audit
  const restoreEntries = async (entriesToRestore) => {
    try {
      const configs = await getConfig();
      for (const entry of entriesToRestore) {
        const dup = findDuplicateEntry(configs, entry.from);
        if (dup) {
          configs[dup.index].to = entry.to;
        } else {
          configs.push({
            from: normalizeFrom(entry.from),
            to: normalizeTo(entry.to),
          });
        }
      }
      await setConfig(JSON.stringify(configs));
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
      return true;
    } catch (err) {
      showSnackbar("Restore failed: " + err, "error");
      return false;
    }
  };

  const handleRestore = async (entry) => {
    const ok = await restoreEntries([entry]);
    if (ok) showSnackbar("Link restored!");
  };

  const handleRestoreSelected = async () => {
    const entriesToRestore = selected.map((i) => filteredEntries[i]);
    const ok = await restoreEntries(entriesToRestore);
    if (ok) {
      showSnackbar(`${entriesToRestore.length} link(s) restored!`);
      setSelected([]);
    }
  };

  const handleRestoreAll = async () => {
    const ok = await restoreEntries(entries);
    if (ok) {
      showSnackbar(`${entries.length} link(s) restored!`);
      setRestoreAllDialogOpen(false);
    }
  };

  const handleClearHistory = async () => {
    await clearHistory();
    setEntries([]);
    setSelected([]);
    setClearDialogOpen(false);
    showSnackbar("History cleared!");
  };

  const navigateToOptions = () => {
    window.location.href = chrome.runtime.getURL("pages/options/options.html");
  };

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const toggleSelect = (index) => {
    setSelected((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));
  };

  const toggleSelectAll = () => {
    const allIndices = filteredEntries.map((_, i) => i);
    const allSelected = allIndices.every((i) => selected.includes(i));
    if (allSelected) {
      setSelected([]);
    } else {
      setSelected(allIndices);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton color="inherit" onClick={navigateToOptions} edge="start" sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Link History
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
          <Button color="inherit" startIcon={<RestoreIcon />} onClick={() => setRestoreAllDialogOpen(true)} disabled={entries.length === 0}>
            Restore All
          </Button>
          <Button
            color="inherit"
            startIcon={<DeleteForeverIcon />}
            onClick={() => setClearDialogOpen(true)}
            disabled={entries.length === 0}
          >
            Clear History
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box display="flex" gap={2} mb={2} alignItems="center">
          <TextField
            placeholder="Search history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
          />
          {selected.length > 0 && (
            <Button variant="contained" startIcon={<RestoreIcon />} onClick={handleRestoreSelected} sx={{ whiteSpace: "nowrap" }}>
              Restore ({selected.length})
            </Button>
          )}
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selected.length > 0 && selected.length < filteredEntries.length}
                    checked={filteredEntries.length > 0 && filteredEntries.every((_, i) => selected.includes(i))}
                    onChange={toggleSelectAll}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Alias</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>URL</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Action</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Date</TableCell>
                <TableCell align="right" sx={{ fontWeight: "bold" }}>
                  Restore
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">{searchQuery ? "No matching history entries." : "No history yet."}</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredEntries.map((entry, i) => (
                  <TableRow key={i} hover>
                    <TableCell padding="checkbox">
                      <Checkbox checked={selected.includes(i)} onChange={() => toggleSelect(i)} />
                    </TableCell>
                    <TableCell
                      sx={{
                        maxWidth: 200,
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
                        maxWidth: 250,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Tooltip title={entry.to || ""}>
                        <span>{entry.to}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip label={entry.action} color={ACTION_COLORS[entry.action] || "default"} size="small" />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDate(entry.date)}</TableCell>
                    <TableCell align="right">
                      <IconButton onClick={() => handleRestore(entry)} title="Restore">
                        <RestoreIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Container>

      {/* Clear History Dialog */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear All History</DialogTitle>
        <DialogContent>
          <DialogContentText>This will permanently delete all history entries. This action cannot be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleClearHistory}>
            Clear History
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restore All Dialog */}
      <Dialog open={restoreAllDialogOpen} onClose={() => setRestoreAllDialogOpen(false)}>
        <DialogTitle>Restore All Links</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will restore all {entries.length} history entry(ies) into your link configuration. Existing aliases will be updated, new
            ones will be added.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreAllDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleRestoreAll}>
            Restore All
          </Button>
        </DialogActions>
      </Dialog>

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

export default function History() {
  return (
    <ThemeContextProvider>
      <HistoryContent />
    </ThemeContextProvider>
  );
}
