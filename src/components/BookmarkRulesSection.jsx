/** Bookmark rules section for configuring custom bookmark reconciler rules. */
import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import { getBookmarkRules, setBookmarkRules } from "../helpers/storage.js";
import { validateRule } from "../helpers/genericBookmarkRuleUtils.js";

/** @type {string[]} Folder names reserved by hardcoded reconcilers. */
const RESERVED_NAMES = ["prs", "github repos", "figma mocks", "jira tickets", "google drive", "onedrive"];

/**
 * Create an empty bookmark rule with default values.
 * @returns {object} A new blank bookmark rule
 */
function createEmptyRule() {
  return {
    id: crypto.randomUUID(),
    name: "",
    historyKeywords: [],
    urlMatchPattern: "",
    dedupeKeyPattern: "",
    titleStripPatterns: [],
    sortField: "visitTime",
    sortDirection: "desc",
    enabled: true,
  };
}

/**
 * Section component for managing custom bookmark reconciler rules.
 * Provides a list view with add, edit, and delete operations.
 *
 * @param {object} props
 * @param {(message: string, severity?: string) => void} props.showSnackbar - Callback to display snackbar messages
 * @returns {React.ReactElement}
 */
export default function BookmarkRulesSection({ showSnackbar }) {
  const [rules, setRules] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState(null);

  // Form state
  const [editingRule, setEditingRule] = useState(null);
  const [formName, setFormName] = useState("");
  const [formKeywords, setFormKeywords] = useState("");
  const [formUrlMatch, setFormUrlMatch] = useState("");
  const [formDedupeKey, setFormDedupeKey] = useState("");
  const [formTitleStrip, setFormTitleStrip] = useState("");
  const [formSortField, setFormSortField] = useState("visitTime");
  const [formSortDirection, setFormSortDirection] = useState("desc");
  const [formEnabled, setFormEnabled] = useState(true);

  useEffect(() => {
    loadRules();
  }, []);

  /**
   * Load bookmark rules from storage into state.
   * @returns {Promise<void>}
   */
  const loadRules = async () => {
    const stored = await getBookmarkRules();
    setRules(stored);
  };

  /**
   * Save rules to storage and notify background to reconcile.
   * @param {object[]} newRules - Updated rules array
   * @returns {Promise<void>}
   */
  const saveRules = async (newRules) => {
    await setBookmarkRules(newRules);
    setRules(newRules);
    chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
  };

  /**
   * Open the add/edit dialog. Passing null opens in "add" mode.
   * @param {object | null} rule - Existing rule to edit, or null for a new rule
   */
  const openDialog = (rule) => {
    if (rule) {
      setEditingRule(rule);
      setFormName(rule.name);
      setFormKeywords(rule.historyKeywords.join(", "));
      setFormUrlMatch(rule.urlMatchPattern);
      setFormDedupeKey(rule.dedupeKeyPattern);
      setFormTitleStrip((rule.titleStripPatterns || []).join("\n"));
      setFormSortField(rule.sortField || "visitTime");
      setFormSortDirection(rule.sortDirection || "desc");
      setFormEnabled(rule.enabled !== false);
    } else {
      setEditingRule(null);
      setFormName("");
      setFormKeywords("");
      setFormUrlMatch("");
      setFormDedupeKey("");
      setFormTitleStrip("");
      setFormSortField("visitTime");
      setFormSortDirection("desc");
      setFormEnabled(true);
    }
    setDialogOpen(true);
  };

  /**
   * Validate form inputs and save the rule.
   * @returns {Promise<void>}
   */
  const handleSave = async () => {
    const name = formName.trim();
    if (!name) {
      showSnackbar("Rule name is required.", "error");
      return;
    }

    // Check reserved names
    if (RESERVED_NAMES.includes(name.toLowerCase())) {
      showSnackbar(`"${name}" is reserved by a built-in bookmark folder.`, "error");
      return;
    }

    // Check duplicate names
    const duplicate = rules.find((r) => r.name.trim().toLowerCase() === name.toLowerCase() && r.id !== editingRule?.id);
    if (duplicate) {
      showSnackbar(`A rule named "${name}" already exists.`, "error");
      return;
    }

    const keywords = formKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (keywords.length === 0) {
      showSnackbar("At least one history keyword is required.", "error");
      return;
    }

    const titleStripPatterns = formTitleStrip
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

    const rule = {
      id: editingRule?.id || crypto.randomUUID(),
      name,
      historyKeywords: keywords,
      urlMatchPattern: formUrlMatch.trim(),
      dedupeKeyPattern: formDedupeKey.trim(),
      titleStripPatterns,
      sortField: formSortField,
      sortDirection: formSortDirection,
      enabled: formEnabled,
    };

    const validation = validateRule(rule);
    if (!validation.valid) {
      showSnackbar(validation.error, "error");
      return;
    }

    let newRules;
    if (editingRule) {
      newRules = rules.map((r) => (r.id === editingRule.id ? rule : r));
    } else {
      newRules = [...rules, rule];
    }

    await saveRules(newRules);
    setDialogOpen(false);
    showSnackbar(editingRule ? "Rule updated!" : "Rule added!");
  };

  /**
   * Delete the rule identified by deletingRuleId.
   * @returns {Promise<void>}
   */
  const handleDelete = async () => {
    const newRules = rules.filter((r) => r.id !== deletingRuleId);
    await saveRules(newRules);
    setDeleteDialogOpen(false);
    setDeletingRuleId(null);
    showSnackbar("Rule deleted.");
  };

  /**
   * Toggle a rule's enabled state.
   * @param {string} ruleId - The rule ID to toggle
   * @returns {Promise<void>}
   */
  const handleToggleEnabled = async (ruleId) => {
    const newRules = rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r));
    await saveRules(newRules);
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <BookmarkIcon color="action" />
          <Typography variant="subtitle1" fontWeight="bold">
            Custom Bookmark Rules
          </Typography>
          <Chip label={rules.length} variant="outlined" />
        </Box>
        <Button startIcon={<AddIcon />} onClick={() => openDialog(null)}>
          Add Rule
        </Button>
      </Box>

      {rules.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
          No custom bookmark rules. Add one to auto-organize bookmarks from any website.
        </Typography>
      ) : (
        <List dense disablePadding>
          {rules.map((rule) => (
            <ListItem
              key={rule.id}
              secondaryAction={
                <Box>
                  <Switch checked={rule.enabled !== false} onChange={() => handleToggleEnabled(rule.id)} />
                  <IconButton onClick={() => openDialog(rule)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    color="error"
                    onClick={() => {
                      setDeletingRuleId(rule.id);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              }
            >
              <ListItemText
                primary={rule.name}
                secondary={`Keywords: ${rule.historyKeywords.join(", ")} | Sort: ${rule.sortField} ${rule.sortDirection}`}
              />
            </ListItem>
          ))}
        </List>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingRule ? "Edit Bookmark Rule" : "Add Bookmark Rule"}</DialogTitle>
        <DialogContent>
          <TextField
            label="Rule Name"
            fullWidth
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="leetcode problems"
            helperText="Becomes the bookmark subfolder name"
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label="History Keywords"
            fullWidth
            value={formKeywords}
            onChange={(e) => setFormKeywords(e.target.value)}
            placeholder="leetcode.com"
            helperText="Comma-separated keywords to search browser history"
            sx={{ mb: 2 }}
          />
          <TextField
            label="URL Match Pattern"
            fullWidth
            value={formUrlMatch}
            onChange={(e) => setFormUrlMatch(e.target.value)}
            placeholder="^https?://leetcode\.com/problems/[^/?#]+"
            helperText="Regex to match URLs (case-insensitive)"
            sx={{ mb: 2 }}
          />
          <TextField
            label="Dedup Key Pattern"
            fullWidth
            value={formDedupeKey}
            onChange={(e) => setFormDedupeKey(e.target.value)}
            placeholder="leetcode\.com/problems/([^/?#]+)"
            helperText="Regex with one capture group for the unique key"
            sx={{ mb: 2 }}
          />
          <TextField
            label="Title Strip Patterns"
            fullWidth
            multiline
            minRows={2}
            value={formTitleStrip}
            onChange={(e) => setFormTitleStrip(e.target.value)}
            placeholder={"\\s*-\\s*LeetCode.*$\n\\s*\\|\\s*LeetCode.*$"}
            helperText="Regex patterns to remove from page titles (one per line)"
            sx={{ mb: 2 }}
          />
          <Box display="flex" gap={2} mb={2}>
            <FormControl sx={{ flex: 1 }}>
              <InputLabel>Sort By</InputLabel>
              <Select value={formSortField} label="Sort By" onChange={(e) => setFormSortField(e.target.value)}>
                <MenuItem value="visitTime">Visit Time</MenuItem>
                <MenuItem value="title">Title</MenuItem>
              </Select>
            </FormControl>
            <FormControl sx={{ flex: 1 }}>
              <InputLabel>Sort Direction</InputLabel>
              <Select value={formSortDirection} label="Sort Direction" onChange={(e) => setFormSortDirection(e.target.value)}>
                <MenuItem value="desc">Newest / Z-A</MenuItem>
                <MenuItem value="asc">Oldest / A-Z</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <FormControlLabel control={<Switch checked={formEnabled} onChange={(e) => setFormEnabled(e.target.checked)} />} label="Enabled" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            {editingRule ? "Save" : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Bookmark Rule</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this bookmark rule? The bookmark subfolder will remain until the next reconciliation.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
