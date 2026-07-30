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
  Switch,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import { getBookmarkRules, setBookmarkRules } from "../helpers/storage.js";
import BookmarkRuleForm from "./BookmarkRuleForm.jsx";

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
  const [editingRule, setEditingRule] = useState(null);

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
    setEditingRule(rule);
    setDialogOpen(true);
  };

  /**
   * Handle save from the BookmarkRuleForm component.
   * @param {object} rule - The validated rule object from the form
   * @returns {Promise<void>}
   */
  const handleFormSave = async (rule) => {
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
                  <Switch
                    checked={rule.enabled !== false}
                    onChange={() => handleToggleEnabled(rule.id)}
                  />
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
          <BookmarkRuleForm
            rule={editingRule}
            existingNames={rules.map((r) => r.name)}
            onSave={handleFormSave}
            onCancel={() => setDialogOpen(false)}
            showSnackbar={showSnackbar}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Bookmark Rule</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this bookmark rule? The bookmark subfolder will remain
            until the next reconciliation.
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
