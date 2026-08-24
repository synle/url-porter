/** Reusable form for creating/editing a bookmark reconciler rule. */
import { useState } from "react";
import {
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Button,
} from "@mui/material";
import { validateRule } from "../helpers/genericBookmarkRuleUtils.js";
import { extractDomainFromRegex } from "../helpers/ruleDerivation.js";

/** @type {string[]} Folder names reserved by hardcoded reconcilers. */
const RESERVED_NAMES = [
  "prs",
  "github repos",
  "figma mocks",
  "jira tickets",
  "google drive",
  "onedrive",
];

/** @type {object} Default example values shown when adding a new rule without URL context. */
const DEFAULT_EXAMPLE = {
  name: "leetcode problems",
  historyKeywords: "leetcode.com",
  urlMatchPattern: "^https?://leetcode\\.com/problems/[^/?#]+",
  dedupeKeyPattern: "leetcode\\.com/problems/([^/?#]+)",
  titleStripPatterns: "\\s*-\\s*LeetCode.*$\n\\s*\\|\\s*LeetCode.*$",
};

/**
 * Form component for adding or editing a bookmark rule.
 *
 * State is initialized from `rule` on mount only. To edit a different rule,
 * the parent must remount this form (pass a `key` derived from the rule).
 *
 * @param {object} props
 * @param {object|null} props.rule - Existing rule to edit, or null for a new rule
 * @param {string[]} props.existingNames - Names of existing rules (for duplicate checking)
 * @param {(rule: object) => void} props.onSave - Called with the validated rule object on save
 * @param {() => void} props.onCancel - Called when the user cancels
 * @param {(message: string, severity?: string) => void} props.showSnackbar - Callback to display feedback
 * @returns {React.ReactElement}
 */
export default function BookmarkRuleForm({
  rule,
  existingNames = [],
  onSave,
  onCancel,
  showSnackbar,
}) {
  const [formName, setFormName] = useState(rule ? rule.name || "" : DEFAULT_EXAMPLE.name);
  const [formKeywords, setFormKeywords] = useState(
    rule ? (rule.historyKeywords || []).join(", ") : DEFAULT_EXAMPLE.historyKeywords,
  );
  const [formUrlMatch, setFormUrlMatch] = useState(
    rule ? rule.urlMatchPattern || "" : DEFAULT_EXAMPLE.urlMatchPattern,
  );
  const [formDedupeKey, setFormDedupeKey] = useState(
    rule ? rule.dedupeKeyPattern || "" : DEFAULT_EXAMPLE.dedupeKeyPattern,
  );
  const [formTitleStrip, setFormTitleStrip] = useState(
    rule ? (rule.titleStripPatterns || []).join("\n") : DEFAULT_EXAMPLE.titleStripPatterns,
  );
  const [formSortField, setFormSortField] = useState(rule?.sortField || "visitTime");
  const [formSortDirection, setFormSortDirection] = useState(rule?.sortDirection || "desc");
  const [formEnabled, setFormEnabled] = useState(rule ? rule.enabled !== false : true);

  /**
   * Auto-fill History Keywords from URL Match Pattern when keywords are empty.
   * Extracts the domain from the regex and sets it as the keyword.
   * @returns {void}
   */
  const handleUrlMatchBlur = () => {
    if (formKeywords.trim()) return;
    const domain = extractDomainFromRegex(formUrlMatch);
    if (domain) {
      setFormKeywords(domain);
    }
  };

  /**
   * Validate form inputs and call onSave with the built rule object.
   * @returns {void}
   */
  const handleSave = () => {
    const name = formName.trim();
    if (!name) {
      showSnackbar("Rule name is required.", "error");
      return;
    }

    if (RESERVED_NAMES.includes(name.toLowerCase())) {
      showSnackbar(`"${name}" is reserved by a built-in bookmark folder.`, "error");
      return;
    }

    const duplicate = existingNames.find(
      (n) =>
        n.toLowerCase() === name.toLowerCase() &&
        n.toLowerCase() !== (rule?.name || "").toLowerCase(),
    );
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

    const built = {
      id: rule?.id || crypto.randomUUID(),
      name,
      historyKeywords: keywords,
      urlMatchPattern: formUrlMatch.trim(),
      dedupeKeyPattern: formDedupeKey.trim(),
      titleStripPatterns,
      sortField: formSortField,
      sortDirection: formSortDirection,
      enabled: formEnabled,
    };

    const validation = validateRule(built);
    if (!validation.valid) {
      showSnackbar(validation.error, "error");
      return;
    }

    onSave(built);
  };

  return (
    <Box>
      <TextField
        label="Rule Name"
        fullWidth
        value={formName}
        onChange={(e) => setFormName(e.target.value)}
        placeholder="leetcode problems"
        helperText='Becomes the bookmark subfolder name (e.g. "leetcode problems")'
        sx={{ mt: 1, mb: 2 }}
      />
      <TextField
        label="URL Match Pattern"
        fullWidth
        value={formUrlMatch}
        onChange={(e) => setFormUrlMatch(e.target.value)}
        onBlur={handleUrlMatchBlur}
        placeholder="^https?://leetcode\.com/problems/[^/?#]+"
        helperText="Regex to match URLs (e.g. ^https?://leetcode\\.com/problems/[^/?#]+)"
        sx={{ mb: 2 }}
      />
      <TextField
        label="History Keywords"
        fullWidth
        value={formKeywords}
        onChange={(e) => setFormKeywords(e.target.value)}
        placeholder="leetcode.com"
        helperText="Comma-separated keywords to search browser history — auto-filled from URL pattern above"
        sx={{ mb: 2 }}
      />
      <TextField
        label="Dedup Key Pattern"
        fullWidth
        value={formDedupeKey}
        onChange={(e) => setFormDedupeKey(e.target.value)}
        placeholder="leetcode\.com/problems/([^/?#]+)"
        helperText="Regex with one capture group for the unique key (e.g. leetcode\\.com/problems/([^/?#]+))"
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
        helperText="Regex patterns to remove from page titles, one per line (e.g. \\s*-\\s*LeetCode.*$)"
        sx={{ mb: 2 }}
      />
      <Box display="flex" gap={2} mb={2}>
        <FormControl sx={{ flex: 1 }}>
          <InputLabel>Sort By</InputLabel>
          <Select
            value={formSortField}
            label="Sort By"
            onChange={(e) => setFormSortField(e.target.value)}
          >
            <MenuItem value="visitTime">Visit Time</MenuItem>
            <MenuItem value="title">Title</MenuItem>
          </Select>
        </FormControl>
        <FormControl sx={{ flex: 1 }}>
          <InputLabel>Sort Direction</InputLabel>
          <Select
            value={formSortDirection}
            label="Sort Direction"
            onChange={(e) => setFormSortDirection(e.target.value)}
          >
            <MenuItem value="desc">Newest / Z-A</MenuItem>
            <MenuItem value="asc">Oldest / A-Z</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <FormControlLabel
        control={
          <Switch checked={formEnabled} onChange={(e) => setFormEnabled(e.target.checked)} />
        }
        label="Enabled"
      />
      <Box display="flex" gap={1} justifyContent="flex-end" mt={2}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          {rule ? "Save" : "Add"}
        </Button>
      </Box>
    </Box>
  );
}
