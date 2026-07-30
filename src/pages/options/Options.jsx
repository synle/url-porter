/**
 * Options page — main settings UI for URL Porter.
 *
 * Two modes:
 * - "Clean" (default): table UI with search, sort, multi-select, and CRUD dialogs.
 * - "Advanced": raw JSON editor with comment support.
 *
 * Also manages homepage URL, sync server, history limits, and bulk operations.
 */

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
  ListItemIcon,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Chip,
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
import BarChartIcon from "@mui/icons-material/BarChart";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import AddLinkIcon from "@mui/icons-material/AddLink";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import Editor from "react-simple-code-editor";
import { highlight, languages } from "prismjs/components/prism-core";
import "prismjs/components/prism-json";

import { ThemeContextProvider } from "../../theme.jsx";
import SyncDialog from "../../components/SyncDialog.jsx";
import BookmarkRulesSection from "../../components/BookmarkRulesSection.jsx";
import HistoryStatsSection from "../../components/HistoryStatsSection.jsx";
import {
  getConfig,
  setConfig,
  getHomepageUrl,
  saveHomepageUrl,
  getBookmarkFolderName,
  setBookmarkFolderName,
  getGithubOrgThreshold,
  setGithubOrgThreshold,
  getBookmarkRules,
  setBookmarkRules,
  getStatsVisitThreshold,
  setStatsVisitThreshold,
  getStatsMaxResults,
  setStatsMaxResults,
  getStatsLookbackMonths,
  setStatsLookbackMonths,
} from "../../helpers/storage.js";
import {
  normalizeEntry,
  normalizeFrom,
  normalizeTo,
  findDuplicateEntry,
  cleanAlias,
  cleanUrl,
  validateAlias,
} from "../../helpers/configUtils.js";
import {
  ALIAS_PLACEHOLDER,
  ALIAS_HELPER_TEXT,
  URL_PLACEHOLDER,
  URL_HELPER_TEXT,
} from "../../helpers/fieldHelpers.js";
import {
  checkBrokenLinks,
  findDuplicateAliases,
  findRedirectChains,
  findOverlappingAliases,
} from "../../helpers/configAnalysis.js";
import {
  addHistoryEntry,
  getHistoryAliasLimit,
  setHistoryAliasLimit,
  getHistoryEntryLimit,
  setHistoryEntryLimit,
} from "../../helpers/historyUtils.js";

/** React component for the main options page content, including clean and advanced modes. */
function OptionsContent() {
  // Core state
  const [homepageUrl, setHomepageUrl] = useState("");
  const [configEntries, setConfigEntries] = useState([]);
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
  const [duplicateDialog, setDuplicateDialog] = useState({
    open: false,
    index: -1,
    oldTo: "",
    context: "",
  });
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
  const [bookmarkFolderNameValue, setBookmarkFolderNameValue] = useState("url-porter");
  const [githubOrgThresholdValue, setGithubOrgThresholdValue] = useState(3);

  // Broken link checker state
  const [brokenLinks, setBrokenLinks] = useState({}); // {[origIndex]: errorMsg}
  const [linkCheckRunning, setLinkCheckRunning] = useState(false);
  const [linkCheckProgress, setLinkCheckProgress] = useState({ checked: 0, total: 0 });

  // Config health dialog state
  const [healthDialogOpen, setHealthDialogOpen] = useState(false);
  const [healthResults, setHealthResults] = useState(null);

  const fromInputRef = useRef(null);

  useEffect(() => {
    loadSettings();
  }, []);

  /**
   * Loads all settings (config, homepage, history limits, bookmark folder) from storage into state.
   * @returns {Promise<void>}
   */
  const loadSettings = async () => {
    const config = await getConfig();
    const homepage = await getHomepageUrl();
    setHomepageUrl(homepage);
    setConfigEntries(Array.isArray(config) ? config : []);
    const aliasLimit = await getHistoryAliasLimit();
    setHistoryAliasLimitValue(aliasLimit);
    const entryLimit = await getHistoryEntryLimit();
    setHistoryEntryLimitValue(entryLimit);
    const folderName = await getBookmarkFolderName();
    setBookmarkFolderNameValue(folderName);
    const orgThreshold = await getGithubOrgThreshold();
    setGithubOrgThresholdValue(orgThreshold);
    const bookmarkRules = await getBookmarkRules();
    const statsVisitThreshold = await getStatsVisitThreshold();
    const statsMaxResults = await getStatsMaxResults();
    const statsLookbackMonths = await getStatsLookbackMonths();
    const fullConfig = {
      homepage,
      configs: Array.isArray(config) ? config : [],
      bookmarkRules,
      bookmarkFolderName: folderName,
      historyAliasLimit: aliasLimit,
      historyEntryLimit: entryLimit,
      githubOrgThreshold: orgThreshold,
      statsVisitThreshold,
      statsMaxResults,
      statsLookbackMonths,
    };
    const json = JSON.stringify(fullConfig, null, 2);
    setEditorContent(json);
    setLastSavedEditorContent(json);
  };

  /**
   * Displays a snackbar notification.
   * @param {string} message - The message to display.
   * @param {string} [severity="success"] - MUI alert severity ("success", "error", etc.).
   */
  const showSnackbar = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  /**
   * Persists config entries to storage, notifies the background service worker, and refreshes state.
   * @param {Array<{from: string, to: string}>} entries - The config entries to save.
   * @returns {Promise<boolean>} Whether the save succeeded.
   */
  const saveAndNotify = async (entries) => {
    try {
      await setConfig(JSON.stringify(entries));
      await saveHomepageUrl(homepageUrl.trim());
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
      const refreshed = await getConfig();
      const configs = Array.isArray(refreshed) ? refreshed : [];
      setConfigEntries(configs);
      const bookmarkRules = await getBookmarkRules();
      const folderName = await getBookmarkFolderName();
      const aliasLimit = await getHistoryAliasLimit();
      const entryLimit = await getHistoryEntryLimit();
      const orgThreshold = await getGithubOrgThreshold();
      const svt = await getStatsVisitThreshold();
      const smr = await getStatsMaxResults();
      const slm = await getStatsLookbackMonths();
      const fullConfig = {
        homepage: homepageUrl,
        configs,
        bookmarkRules,
        bookmarkFolderName: folderName,
        historyAliasLimit: aliasLimit,
        historyEntryLimit: entryLimit,
        githubOrgThreshold: orgThreshold,
        statsVisitThreshold: svt,
        statsMaxResults: smr,
        statsLookbackMonths: slm,
      };
      const json = JSON.stringify(fullConfig, null, 2);
      setEditorContent(json);
      setLastSavedEditorContent(json);
      return true;
    } catch (err) {
      showSnackbar(String(err), "error");
      return false;
    }
  };

  /**
   * Auto-saves the homepage URL to storage on input blur.
   * @returns {Promise<void>}
   */
  const handleHomepageBlur = async () => {
    try {
      await saveHomepageUrl(homepageUrl.trim());
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
    } catch (err) {
      showSnackbar("Failed to save homepage: " + err, "error");
    }
  };

  /**
   * Validates and adds a new redirect link in clean mode, checking for duplicates.
   * @returns {Promise<void>}
   */
  const handleAddLink = async () => {
    const aliasError = validateAlias(linkFrom);
    if (aliasError) {
      showSnackbar(aliasError, "error");
      setLinkFrom(cleanAlias(linkFrom));
      return;
    }
    if (!linkTo.trim()) return;

    const duplicate = findDuplicateEntry(configEntries, linkFrom);
    if (duplicate) {
      setAddDialogOpen(false);
      setDuplicateDialog({
        open: true,
        index: duplicate.index,
        oldTo: duplicate.entry.to,
        context: "add",
      });
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

  /**
   * Saves an edited link after validating the alias and checking for duplicates.
   * @returns {Promise<void>}
   */
  const handleEditSave = async () => {
    if (editIndex < 0) return;

    const aliasError = validateAlias(editFrom);
    if (aliasError) {
      showSnackbar(aliasError, "error");
      setEditFrom(cleanAlias(editFrom));
      return;
    }

    const duplicate = findDuplicateEntry(configEntries, editFrom, editIndex);
    if (duplicate) {
      setEditDialogOpen(false);
      setDuplicateDialog({
        open: true,
        index: duplicate.index,
        oldTo: duplicate.entry.to,
        context: "edit",
      });
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

  /**
   * Deletes a single link after confirmation and logs it to history.
   * @returns {Promise<void>}
   */
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

  /**
   * Deletes all currently selected links and logs each deletion to history.
   * @returns {Promise<void>}
   */
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

  /**
   * Resolves a duplicate alias by updating the existing entry's URL to the new value.
   * @returns {Promise<void>}
   */
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

  /**
   * Saves the raw JSON config from the advanced mode editor to storage.
   * @returns {Promise<void>}
   */
  const handleAdvancedSave = async () => {
    try {
      const { stripJsonComments } = await import("../../helpers/storage.js");
      const cleaned = stripJsonComments(editorContent);
      const data = JSON.parse(cleaned);

      // Support both the full config object and a plain configs array for backwards compatibility
      if (Array.isArray(data)) {
        await setConfig(JSON.stringify(data));
        await saveHomepageUrl(homepageUrl.trim());
      } else {
        if (!("configs" in data) || !Array.isArray(data.configs)) {
          showSnackbar('Invalid config: must contain a "configs" array.', "error");
          return;
        }
        await setConfig(JSON.stringify(data.configs));
        if (typeof data.homepage === "string") {
          await saveHomepageUrl(data.homepage.trim());
        }
        if (Array.isArray(data.bookmarkRules)) {
          await setBookmarkRules(data.bookmarkRules);
        }
        if (typeof data.bookmarkFolderName === "string" && data.bookmarkFolderName.trim()) {
          await setBookmarkFolderName(data.bookmarkFolderName.trim());
        }
        if (typeof data.historyAliasLimit === "number" && data.historyAliasLimit >= 1) {
          await setHistoryAliasLimit(data.historyAliasLimit);
        }
        if (typeof data.historyEntryLimit === "number" && data.historyEntryLimit >= 1) {
          await setHistoryEntryLimit(data.historyEntryLimit);
        }
        if (typeof data.githubOrgThreshold === "number" && data.githubOrgThreshold >= 1) {
          await setGithubOrgThreshold(data.githubOrgThreshold);
        }
        if (typeof data.statsVisitThreshold === "number" && data.statsVisitThreshold >= 1) {
          await setStatsVisitThreshold(data.statsVisitThreshold);
        }
        if (typeof data.statsMaxResults === "number" && data.statsMaxResults >= 1) {
          await setStatsMaxResults(data.statsMaxResults);
        }
        if (typeof data.statsLookbackMonths === "number" && data.statsLookbackMonths >= 1) {
          await setStatsLookbackMonths(data.statsLookbackMonths);
        }
      }

      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
      await loadSettings();
      showSnackbar("Settings saved!");
    } catch (err) {
      setJsonErrorDialogOpen(true);
    }
  };

  /**
   * Handles the toggle button group change for switching between clean and advanced modes.
   * @param {Event} _ - Unused event parameter.
   * @param {string} newMode - The mode to switch to ("clean" or "advanced").
   */
  const handleModeChange = (_, newMode) => {
    if (!newMode || newMode === mode) return;

    if (mode === "advanced" && editorContent !== lastSavedEditorContent) {
      setUnsavedDialogOpen(true);
      return;
    }

    switchMode(newMode);
  };

  /**
   * Switches the UI mode, resyncing editor content if entering advanced mode.
   * @param {string} newMode - The mode to switch to ("clean" or "advanced").
   */
  const switchMode = async (newMode) => {
    if (newMode === "advanced") {
      const bookmarkRules = await getBookmarkRules();
      const svt = await getStatsVisitThreshold();
      const smr = await getStatsMaxResults();
      const slm = await getStatsLookbackMonths();
      const fullConfig = {
        homepage: homepageUrl,
        configs: configEntries,
        bookmarkRules,
        bookmarkFolderName: bookmarkFolderNameValue,
        historyAliasLimit: historyAliasLimitValue,
        historyEntryLimit: historyEntryLimitValue,
        githubOrgThreshold: githubOrgThresholdValue,
        statsVisitThreshold: svt,
        statsMaxResults: smr,
        statsLookbackMonths: slm,
      };
      const json = JSON.stringify(fullConfig, null, 2);
      setEditorContent(json);
      setLastSavedEditorContent(json);
    }
    setMode(newMode);
    setSelected([]);
    setSearchQuery("");
  };

  /**
   * Resets all settings to defaults, clears config and homepage, and logs deletions to history.
   * @returns {Promise<void>}
   */
  const handleReset = async () => {
    try {
      // Close dialog immediately so the UI doesn't appear to hang
      setResetDialogOpen(false);

      const entriesToLog = configEntries.map(normalizeEntry).filter(Boolean);
      await setConfig("[]");
      await saveHomepageUrl("");
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
      for (const entry of entriesToLog) {
        await addHistoryEntry(entry.from, entry.to, "deleted");
      }
      await loadSettings();
      setSelected([]);
      showSnackbar("All settings have been reset.");
    } catch (err) {
      showSnackbar("Failed to reset: " + err, "error");
    }
  };

  /**
   * Exports the full config (homepage, configs, bookmarkRules, and settings) as a downloadable JSON file.
   * @returns {Promise<void>}
   */
  const handleExport = async () => {
    const bookmarkRules = await getBookmarkRules();
    const aliasLimit = await getHistoryAliasLimit();
    const entryLimit = await getHistoryEntryLimit();
    const folderName = await getBookmarkFolderName();
    const orgThreshold = await getGithubOrgThreshold();
    const svt = await getStatsVisitThreshold();
    const smr = await getStatsMaxResults();
    const slm = await getStatsLookbackMonths();
    const data = {
      homepage: homepageUrl,
      configs: configEntries,
      bookmarkRules,
      bookmarkFolderName: folderName,
      historyAliasLimit: aliasLimit,
      historyEntryLimit: entryLimit,
      githubOrgThreshold: orgThreshold,
      statsVisitThreshold: svt,
      statsMaxResults: smr,
      statsLookbackMonths: slm,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `url-porter-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSnackbar("Config exported!");
  };

  /**
   * Prompts the user to select a JSON file and imports its config and homepage.
   * Expects the same format as the sync server ({homepage, configs}).
   * @returns {void}
   */
  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!("configs" in data) || !Array.isArray(data.configs)) {
          showSnackbar('Invalid file: must contain a "configs" array.', "error");
          return;
        }
        const newHomepage = (data.homepage || "").trim();
        setHomepageUrl(newHomepage);
        const ok = await saveAndNotify(data.configs);
        if (ok) {
          await saveHomepageUrl(newHomepage);
          if (Array.isArray(data.bookmarkRules)) {
            await setBookmarkRules(data.bookmarkRules);
          }
          if (typeof data.bookmarkFolderName === "string" && data.bookmarkFolderName.trim()) {
            await setBookmarkFolderName(data.bookmarkFolderName.trim());
          }
          if (typeof data.historyAliasLimit === "number" && data.historyAliasLimit >= 1) {
            await setHistoryAliasLimit(data.historyAliasLimit);
          }
          if (typeof data.historyEntryLimit === "number" && data.historyEntryLimit >= 1) {
            await setHistoryEntryLimit(data.historyEntryLimit);
          }
          if (typeof data.githubOrgThreshold === "number" && data.githubOrgThreshold >= 1) {
            await setGithubOrgThreshold(data.githubOrgThreshold);
          }
          if (typeof data.statsVisitThreshold === "number" && data.statsVisitThreshold >= 1) {
            await setStatsVisitThreshold(data.statsVisitThreshold);
          }
          if (typeof data.statsMaxResults === "number" && data.statsMaxResults >= 1) {
            await setStatsMaxResults(data.statsMaxResults);
          }
          if (typeof data.statsLookbackMonths === "number" && data.statsLookbackMonths >= 1) {
            await setStatsLookbackMonths(data.statsLookbackMonths);
          }
          chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
          await loadSettings();
          showSnackbar("Config imported successfully!");
        }
      } catch (err) {
        showSnackbar("Import failed: " + err.message, "error");
      }
    };
    input.click();
  };

  /**
   * Runs broken link detection on all config entries.
   * Sends HEAD requests to each URL and flags 4xx/5xx or network errors.
   * @returns {Promise<void>}
   */
  const handleCheckLinks = async () => {
    if (linkCheckRunning) return;
    setLinkCheckRunning(true);
    setBrokenLinks({});
    setLinkCheckProgress({ checked: 0, total: configEntries.length });
    try {
      const results = await checkBrokenLinks(configEntries, (checked, total) => {
        setLinkCheckProgress({ checked, total });
      });
      const brokenMap = {};
      for (const r of results) {
        brokenMap[r.index] = r.error;
      }
      setBrokenLinks(brokenMap);
      if (results.length === 0) {
        showSnackbar("All links are healthy!");
      } else {
        showSnackbar(`Found ${results.length} broken link(s).`, "warning");
      }
    } catch (err) {
      showSnackbar("Link check failed: " + err.message, "error");
    } finally {
      setLinkCheckRunning(false);
    }
  };

  /**
   * Analyzes the current config for duplicates, redirect chains, and overlapping aliases.
   * Opens the health dialog with the results.
   * @returns {void}
   */
  const handleConfigHealth = () => {
    const duplicates = findDuplicateAliases(configEntries);
    const chains = findRedirectChains(configEntries);
    const overlaps = findOverlappingAliases(configEntries);
    setHealthResults({ duplicates, chains, overlaps });
    setHealthDialogOpen(true);
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
        (e) => (e.from || "").toLowerCase().includes(q) || (e.to || "").toLowerCase().includes(q),
      );
    }

    entries.sort((a, b) => {
      const aVal = (a[sortBy] || "").toLowerCase();
      const bVal = (b[sortBy] || "").toLowerCase();
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    return entries;
  }, [configEntries, searchQuery, sortBy, sortDir]);

  /**
   * Toggles the sort direction for a column, or sets a new sort column.
   * @param {string} field - The field to sort by ("from" or "to").
   */
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  /**
   * Toggles selection state of a single table row.
   * @param {number} origIndex - The original index of the entry in configEntries.
   */
  const toggleSelect = (origIndex) => {
    setSelected((prev) =>
      prev.includes(origIndex) ? prev.filter((i) => i !== origIndex) : [...prev, origIndex],
    );
  };

  /**
   * Toggles selection of all currently visible (filtered) entries.
   * @returns {void}
   */
  const toggleSelectAll = () => {
    const visibleIndices = filteredEntries.map((e) => e._origIndex);
    const allSelected = visibleIndices.every((i) => selected.includes(i));
    if (allSelected) {
      setSelected((prev) => prev.filter((i) => !visibleIndices.includes(i)));
    } else {
      setSelected((prev) => [...new Set([...prev, ...visibleIndices])]);
    }
  };

  /**
   * Returns an arrow indicator string for the currently sorted column.
   * @param {string} field - The field to check ("from" or "to").
   * @returns {string} An up/down arrow if this field is the active sort, otherwise empty string.
   */
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
          <Button color="inherit" startIcon={<FileDownloadIcon />} onClick={handleExport}>
            Export
          </Button>
          <Button color="inherit" startIcon={<FileUploadIcon />} onClick={handleImport}>
            Import
          </Button>
          <Button
            color="inherit"
            startIcon={
              linkCheckRunning ? <CircularProgress size={18} color="inherit" /> : <LinkOffIcon />
            }
            onClick={handleCheckLinks}
            disabled={linkCheckRunning}
          >
            {linkCheckRunning
              ? `${linkCheckProgress.checked}/${linkCheckProgress.total}`
              : "Check Links"}
          </Button>
          <Button color="inherit" startIcon={<HealthAndSafetyIcon />} onClick={handleConfigHealth}>
            Config Health
          </Button>
          <Button
            color="inherit"
            startIcon={<DeleteForeverIcon />}
            onClick={() => setResetDialogOpen(true)}
          >
            Reset All
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Mode Toggle */}
        <Box display="flex" justifyContent="center" mb={3}>
          <ToggleButtonGroup value={mode} exclusive onChange={handleModeChange}>
            <ToggleButton value="clean">
              <ViewListIcon sx={{ mr: 1 }} /> Clean Mode
            </ToggleButton>
            <ToggleButton value="advanced">
              <CodeIcon sx={{ mr: 1 }} /> Advanced Mode
            </ToggleButton>
            <ToggleButton value="stats">
              <BarChartIcon sx={{ mr: 1 }} /> Stats
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {mode === "clean" && (
          <>
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

            {/* Bookmark Folder Name */}
            <TextField
              label="Bookmark Folder Name"
              fullWidth
              value={bookmarkFolderNameValue}
              onChange={(e) => setBookmarkFolderNameValue(e.target.value)}
              onBlur={async () => {
                const val = bookmarkFolderNameValue.trim() || "url-porter";
                setBookmarkFolderNameValue(val);
                try {
                  await setBookmarkFolderName(val);
                  chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
                } catch (err) {
                  showSnackbar("Failed to save bookmark folder name: " + err, "error");
                }
              }}
              placeholder="url-porter"
              sx={{ mb: 3 }}
            />

            {/* History Limits */}
            <Box display="flex" alignItems="center" gap={2} mb={3} flexWrap="wrap">
              <Typography variant="body2" color="text.secondary">
                Max link aliases in history:
              </Typography>
              <TextField
                type="number"
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
              <Typography variant="body2" color="text.secondary">
                GitHub org folder threshold:
              </Typography>
              <TextField
                type="number"
                value={githubOrgThresholdValue}
                onChange={(e) => setGithubOrgThresholdValue(Number(e.target.value))}
                onBlur={async () => {
                  const val = Math.max(1, githubOrgThresholdValue || 3);
                  setGithubOrgThresholdValue(val);
                  await setGithubOrgThreshold(val);
                  chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
                }}
                slotProps={{ input: { inputProps: { min: 1 } } }}
                sx={{ width: 100 }}
              />
            </Box>

            {/* Custom Bookmark Rules */}
            <BookmarkRulesSection showSnackbar={showSnackbar} />
          </>
        )}

        {/* Stats Mode */}
        {mode === "stats" && <HistoryStatsSection showSnackbar={showSnackbar} />}

        {/* Clean Mode */}
        {mode === "clean" && (
          <Box>
            {/* Search & Actions */}
            <Box display="flex" gap={2} mb={2} alignItems="center" flexWrap="wrap">
              <TextField
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
              <FormControl sx={{ minWidth: 140 }}>
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
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={
                          selected.length > 0 && selected.length < filteredEntries.length
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
                          {searchQuery
                            ? "No matching links found."
                            : "No links configured. Click + to add one."}
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
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            {brokenLinks[entry._origIndex] && (
                              <Tooltip title={`Broken: ${brokenLinks[entry._origIndex]}`}>
                                <WarningAmberIcon
                                  fontSize="small"
                                  color="warning"
                                  sx={{ flexShrink: 0 }}
                                />
                              </Tooltip>
                            )}
                            <Tooltip title={entry.to || ""}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                {entry.to}
                              </span>
                            </Tooltip>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
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
            <Box
              component="fieldset"
              sx={(theme) => ({
                mb: 2,
                border: 1,
                borderColor:
                  theme.palette.mode === "light"
                    ? "rgba(0, 0, 0, 0.23)"
                    : "rgba(255, 255, 255, 0.23)",
                borderRadius: 1,
                overflow: "auto",
                maxHeight: "calc(100vh - 250px)",
                minHeight: 400,
                p: 0,
                m: 0,
                "& .prism-code-editor": {
                  minHeight: 400,
                },
                "&:hover": {
                  borderColor:
                    theme.palette.mode === "light"
                      ? "rgba(0, 0, 0, 0.87)"
                      : "rgba(255, 255, 255, 0.87)",
                },
                "&:focus-within": {
                  borderColor: theme.palette.primary.main,
                  borderWidth: 2,
                },
                ...(theme.palette.mode === "light"
                  ? {
                      "& .token.property": { color: "#905" },
                      "& .token.string": { color: "#690" },
                      "& .token.number": { color: "#07a" },
                      "& .token.boolean": { color: "#07a" },
                      "& .token.null": { color: "#07a" },
                      "& .token.punctuation": { color: "#999" },
                    }
                  : {
                      "& .token.property": { color: "#f8c555" },
                      "& .token.string": { color: "#a6e22e" },
                      "& .token.number": { color: "#ae81ff" },
                      "& .token.boolean": { color: "#ae81ff" },
                      "& .token.null": { color: "#ae81ff" },
                      "& .token.punctuation": { color: "#ccc" },
                    }),
              })}
            >
              <Typography
                component="legend"
                variant="caption"
                sx={{ ml: 1, px: 0.5, color: "text.secondary" }}
              >
                Full Config JSON
              </Typography>
              <Editor
                className="prism-code-editor"
                value={editorContent}
                onValueChange={(code) => setEditorContent(code)}
                highlight={(code) => highlight(code, languages.json, "json")}
                padding={12}
                style={{
                  fontFamily: '"Roboto Mono", "Courier New", monospace',
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              />
            </Box>
            <Box display="flex" justifyContent="flex-end" mt={1}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleAdvancedSave}
                size="large"
              >
                Save
              </Button>
            </Box>
          </Box>
        )}
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddLink();
          }}
        >
          <DialogTitle>Add a Link</DialogTitle>
          <DialogContent>
            <TextField
              inputRef={fromInputRef}
              label="Link Alias"
              fullWidth
              value={linkFrom}
              onChange={(e) => setLinkFrom(e.target.value)}
              onBlur={() => setLinkFrom(cleanAlias(linkFrom))}
              placeholder={ALIAS_PLACEHOLDER}
              helperText={ALIAS_HELPER_TEXT}
              sx={{ mt: 1, mb: 2 }}
              required
            />
            <TextField
              label="Full URL"
              fullWidth
              value={linkTo}
              onChange={(e) => setLinkTo(e.target.value)}
              onBlur={() => {
                if (linkTo.trim()) setLinkTo(cleanUrl(linkTo));
              }}
              placeholder={URL_PLACEHOLDER}
              helperText={URL_HELPER_TEXT}
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
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleEditSave();
          }}
        >
          <DialogTitle>Edit Link</DialogTitle>
          <DialogContent>
            <TextField
              label="From"
              fullWidth
              value={editFrom}
              onChange={(e) => setEditFrom(e.target.value)}
              onBlur={() => setEditFrom(cleanAlias(editFrom))}
              placeholder={ALIAS_PLACEHOLDER}
              helperText={ALIAS_HELPER_TEXT}
              sx={{ mt: 1, mb: 2 }}
            />
            <TextField
              label="To"
              fullWidth
              value={editTo}
              onChange={(e) => setEditTo(e.target.value)}
              onBlur={() => {
                if (editTo.trim()) setEditTo(cleanUrl(editTo));
              }}
              placeholder={URL_PLACEHOLDER}
              helperText={URL_HELPER_TEXT}
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

      <SyncDialog
        open={syncDialogOpen}
        onClose={() => setSyncDialogOpen(false)}
        onSuccess={(ajaxResponse) => {
          setHomepageUrl((ajaxResponse.homepage || "").trim());
          loadSettings();
          showSnackbar("Settings synced successfully!");
        }}
        onError={(msg) => showSnackbar(msg, "error")}
      />

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
            This will permanently delete all your redirect links and clear your homepage URL. This
            action cannot be undone.
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
            An alias matching{" "}
            <strong>{(duplicateDialog.context === "edit" ? editFrom : linkFrom).trim()}</strong>{" "}
            already exists and points to:
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
          <Button
            onClick={() => setDuplicateDialog({ open: false, index: -1, oldTo: "", context: "" })}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={handleDuplicateUpdate}>
            Update Existing Link
          </Button>
        </DialogActions>
      </Dialog>

      {/* Config Health Dialog */}
      <Dialog
        open={healthDialogOpen}
        onClose={() => setHealthDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Config Health</DialogTitle>
        <DialogContent>
          {healthResults &&
            healthResults.duplicates.length === 0 &&
            healthResults.chains.length === 0 &&
            healthResults.overlaps.length === 0 && (
              <Alert severity="success" sx={{ mb: 2 }}>
                No issues found! Your config is clean.
              </Alert>
            )}

          {healthResults?.duplicates.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: "bold", mb: 1, display: "flex", alignItems: "center", gap: 1 }}
              >
                <ContentCopyIcon fontSize="small" color="error" />
                Duplicate Aliases ({healthResults.duplicates.length})
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Multiple entries share the same alias. Only one redirect can be active per alias.
              </Typography>
              <List dense>
                {healthResults.duplicates.map((group) => (
                  <ListItem
                    key={group.alias}
                    sx={{ flexDirection: "column", alignItems: "flex-start" }}
                  >
                    <ListItemText
                      primary={<Chip label={group.alias} variant="outlined" />}
                      secondary={group.entries.map((e) => `→ ${e.to}`).join(" | ")}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {healthResults?.chains.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: "bold", mb: 1, display: "flex", alignItems: "center", gap: 1 }}
              >
                <CallSplitIcon fontSize="small" color="warning" />
                Redirect Chains ({healthResults.chains.length})
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                These entries redirect to another alias instead of a final URL. The bookmark
                reconciler resolves these, but the browser redirect may require two hops.
              </Typography>
              <List dense>
                {healthResults.chains.map((chain) => (
                  <ListItem key={chain.index}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <CallSplitIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={chain.chain.join(" → ")}
                      secondary={`Entry #${chain.index + 1}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {healthResults?.overlaps.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: "bold", mb: 1, display: "flex", alignItems: "center", gap: 1 }}
              >
                <CompareArrowsIcon fontSize="small" color="info" />
                Overlapping Aliases ({healthResults.overlaps.length})
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                One alias is a substring of another, which could cause unexpected URL matching.
              </Typography>
              <List dense>
                {healthResults.overlaps.map((pair, i) => (
                  <ListItem key={i}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <CompareArrowsIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <>
                          <Chip label={pair.aliasA} variant="outlined" /> is contained in{" "}
                          <Chip label={pair.aliasB} variant="outlined" />
                        </>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setHealthDialogOpen(false)}>
            Close
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

/** Exported wrapper component that provides the MUI theme context around OptionsContent. */
export default function Options() {
  return (
    <ThemeContextProvider>
      <OptionsContent />
    </ThemeContextProvider>
  );
}
