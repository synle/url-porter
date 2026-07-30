/** Browser history stats section showing most frequently visited URLs. */
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  TextField,
  Paper,
  IconButton,
  InputAdornment,
  Collapse,
  Link,
  Button,
  Chip,
  Divider,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import BarChartIcon from "@mui/icons-material/BarChart";
import FileDownloadIcon from "@mui/icons-material/FileDownload";

import { groupHistoryItems } from "../helpers/historyStatsUtils.js";
import {
  getStatsVisitThreshold,
  setStatsVisitThreshold,
  getStatsMaxResults,
  setStatsMaxResults,
  getStatsLookbackMonths,
  setStatsLookbackMonths,
} from "../helpers/storage.js";

/**
 * Section component for browsing history statistics.
 * Shows a sortable, filterable table of most frequently visited URLs grouped by path.
 *
 * @param {object} props
 * @param {(message: string, severity?: string) => void} props.showSnackbar - Callback to display snackbar messages
 * @returns {React.ReactElement}
 */
export default function HistoryStatsSection({ showSnackbar }) {
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("totalVisitCount");
  const [sortDir, setSortDir] = useState("desc");
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [lookbackMonths, setLookbackMonthsState] = useState(6);
  const [visitThreshold, setVisitThresholdState] = useState(3);
  const [maxResults, setMaxResultsState] = useState(200);

  /** Load persisted settings from storage. */
  const loadSettings = useCallback(async () => {
    const [months, threshold, max] = await Promise.all([
      getStatsLookbackMonths(),
      getStatsVisitThreshold(),
      getStatsMaxResults(),
    ]);
    setLookbackMonthsState(months);
    setVisitThresholdState(threshold);
    setMaxResultsState(max);
    return { months, threshold, max };
  }, []);

  /**
   * Fetch browser history and group by stripped URL.
   * @param {object} [overrides] - Optional setting overrides to use instead of state
   * @param {number} [overrides.months] - Lookback months override
   */
  const fetchHistoryStats = useCallback(
    async (overrides) => {
      setLoading(true);
      try {
        const months = overrides?.months ?? lookbackMonths;
        const startTime = Date.now() - months * 30.44 * 24 * 60 * 60 * 1000;
        const items = await chrome.history.search({
          text: "",
          maxResults: 100000,
          startTime,
        });
        const grouped = groupHistoryItems(items);
        setHistoryData(grouped);
        setExpandedRows(new Set());
      } catch (err) {
        console.error("[HistoryStatsSection] failed to fetch history:", err);
        showSnackbar("Failed to load history stats: " + err.message, "error");
      } finally {
        setLoading(false);
      }
    },
    [lookbackMonths, showSnackbar],
  );

  useEffect(() => {
    loadSettings().then(({ months }) => fetchHistoryStats({ months }));
  }, [loadSettings, fetchHistoryStats]);

  /** Filtered, sorted, and capped entries for display. */
  const filteredEntries = useMemo(() => {
    let entries = historyData;

    // Apply visit threshold filter
    entries = entries.filter((e) => e.totalVisitCount >= visitThreshold);

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter(
        (e) => e.strippedUrl.toLowerCase().includes(q) || (e.title || "").toLowerCase().includes(q),
      );
    }

    // Sort
    entries = [...entries].sort((a, b) => {
      if (sortBy === "totalVisitCount" || sortBy === "lastVisitTime") {
        return sortDir === "desc" ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy];
      }
      const aVal = (a[sortBy] || "").toLowerCase();
      const bVal = (b[sortBy] || "").toLowerCase();
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    // Cap results
    if (maxResults > 0) {
      entries = entries.slice(0, maxResults);
    }

    return entries;
  }, [historyData, searchQuery, sortBy, sortDir, visitThreshold, maxResults]);

  /**
   * Toggles sort direction or switches sort field.
   * @param {string} field - The field to sort by
   */
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir(field === "totalVisitCount" ? "desc" : "asc");
    }
  };

  /**
   * Returns a sort direction indicator arrow for a column header.
   * @param {string} field - The field name
   * @returns {string}
   */
  const sortIndicator = (field) => {
    if (sortBy !== field) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  /**
   * Toggle the expanded state of a row to show/hide variant URLs.
   * @param {string} strippedUrl - The grouped URL key to toggle
   */
  const toggleExpand = (strippedUrl) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(strippedUrl)) {
        next.delete(strippedUrl);
      } else {
        next.add(strippedUrl);
      }
      return next;
    });
  };

  /** Export the current filtered/sorted stats as a downloadable JSON file. */
  const handleExportStats = () => {
    const data = filteredEntries.map((e) => ({
      url: e.strippedUrl,
      title: e.title,
      visitCount: e.totalVisitCount,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `url-porter-stats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSnackbar("Stats exported!");
  };

  /** Sortable column header style. */
  const sortableHeaderSx = { cursor: "pointer", fontWeight: "bold", userSelect: "none" };

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={1} mb={1}>
        <BarChartIcon color="action" />
        <Typography variant="subtitle1" fontWeight="bold">
          Browse History Stats
        </Typography>
        <Chip label={`${filteredEntries.length} URLs`} variant="outlined" />
      </Box>

      {/* Controls */}
      <Box display="flex" gap={2} mb={2} alignItems="center" flexWrap="wrap">
        <TextField
          placeholder="Search URLs..."
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
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          Lookback:
        </Typography>
        <TextField
          type="number"
          value={lookbackMonths}
          onChange={(e) => setLookbackMonthsState(Number(e.target.value))}
          onBlur={async () => {
            const val = Math.max(1, lookbackMonths || 6);
            setLookbackMonthsState(val);
            await setStatsLookbackMonths(val);
            fetchHistoryStats({ months: val });
          }}
          slotProps={{ input: { inputProps: { min: 1 } } }}
          sx={{ width: 70 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          months
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          Min visits:
        </Typography>
        <TextField
          type="number"
          value={visitThreshold}
          onChange={(e) => setVisitThresholdState(Number(e.target.value))}
          onBlur={async () => {
            const val = Math.max(1, visitThreshold || 3);
            setVisitThresholdState(val);
            await setStatsVisitThreshold(val);
          }}
          slotProps={{ input: { inputProps: { min: 1 } } }}
          sx={{ width: 70 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          Max results:
        </Typography>
        <TextField
          type="number"
          value={maxResults}
          onChange={(e) => setMaxResultsState(Number(e.target.value))}
          onBlur={async () => {
            const val = Math.max(1, maxResults || 200);
            setMaxResultsState(val);
            await setStatsMaxResults(val);
          }}
          slotProps={{ input: { inputProps: { min: 1 } } }}
          sx={{ width: 80 }}
        />
        <Button
          startIcon={<RefreshIcon />}
          onClick={() => fetchHistoryStats()}
          disabled={loading}
          variant="outlined"
        >
          {loading ? "Loading..." : "Refresh"}
        </Button>
        <Button
          startIcon={<FileDownloadIcon />}
          onClick={handleExportStats}
          disabled={loading || filteredEntries.length === 0}
          variant="outlined"
        >
          Export
        </Button>
      </Box>

      {/* List */}
      <Paper>
        {/* Header */}
        <Box
          display="flex"
          alignItems="center"
          gap={1}
          px={2}
          py={1}
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Typography
            variant="body2"
            fontWeight="bold"
            onClick={() => handleSort("strippedUrl")}
            sx={sortableHeaderSx}
            flexGrow={1}
          >
            URL{sortIndicator("strippedUrl")}
          </Typography>
          <Typography
            variant="body2"
            fontWeight="bold"
            onClick={() => handleSort("totalVisitCount")}
            sx={{ ...sortableHeaderSx, width: 95, flexShrink: 0 }}
          >
            Visits{sortIndicator("totalVisitCount")}
          </Typography>
          <Typography
            variant="body2"
            fontWeight="bold"
            onClick={() => handleSort("lastVisitTime")}
            sx={{ ...sortableHeaderSx, width: 95, flexShrink: 0 }}
          >
            Last Visit{sortIndicator("lastVisitTime")}
          </Typography>
        </Box>

        {/* Rows */}
        {filteredEntries.length === 0 ? (
          <Box py={4} textAlign="center">
            <Typography color="text.secondary">
              {loading
                ? "Loading history..."
                : searchQuery
                  ? "No matching URLs."
                  : "No history data found."}
            </Typography>
          </Box>
        ) : (
          filteredEntries.map((entry, idx) => {
            const hasVariants = entry.variants.length > 1;
            const isExpanded = expandedRows.has(entry.strippedUrl);
            return (
              <Box key={entry.strippedUrl}>
                {idx > 0 && <Divider />}
                <Box
                  display="flex"
                  alignItems="center"
                  gap={1}
                  px={2}
                  py={0.75}
                  sx={{ "&:hover": { bgcolor: "action.hover" } }}
                >
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Link
                      href={entry.strippedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="hover"
                      variant="body2"
                      sx={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {entry.strippedUrl}
                    </Link>
                    {entry.title && (
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {entry.title}
                      </Typography>
                    )}
                  </Box>
                  <Box
                    sx={{
                      width: 95,
                      flexShrink: 0,
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                    onClick={() => toggleExpand(entry.strippedUrl)}
                  >
                    <Typography variant="body2" component="span">
                      {entry.totalVisitCount}
                    </Typography>
                    <IconButton>
                      {isExpanded ? (
                        <KeyboardArrowUpIcon fontSize="small" />
                      ) : (
                        <KeyboardArrowDownIcon fontSize="small" />
                      )}
                    </IconButton>
                  </Box>
                  <Typography variant="body2" sx={{ width: 95, flexShrink: 0 }}>
                    {entry.lastVisitTime ? new Date(entry.lastVisitTime).toLocaleDateString() : ""}
                  </Typography>
                </Box>
                {
                  <Collapse in={isExpanded} unmountOnExit>
                    <Box sx={{ pl: 4, pr: 2, pb: 1 }}>
                      {entry.variants
                        .sort((a, b) => b.visitCount - a.visitCount)
                        .map((v) => (
                          <Box key={v.url} sx={{ mb: 0.5 }}>
                            <Link
                              href={v.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              variant="body2"
                            >
                              {v.url}
                            </Link>
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                              ({v.visitCount} visits)
                            </Typography>
                          </Box>
                        ))}
                    </Box>
                  </Collapse>
                }
              </Box>
            );
          })
        )}
      </Paper>
    </Box>
  );
}
