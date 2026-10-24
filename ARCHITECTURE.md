# Architecture

## Runtime Model

URL Porter is one Chrome Manifest V3 extension, not a hosted application or monorepo. A service worker owns redirect registration, bookmark reconciliation, context menus, omnibox suggestions, and message handling. React extension pages edit persisted settings; classic content scripts augment supported websites and raw text pages.

[AGENTS.md](AGENTS.md) contains edit-time invariants. [DEV.md](DEV.md) explains build, test, and release workflows. `src/manifest.json` and `vite.config.js` define actual entry points and packaged paths.

## Entry Points

| Source                          | Responsibility                                                                    | Packaging                                                    |
| ------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/background/background.js`  | Service worker, redirects, reconciliation, messages, context menus, `go` omnibox. | Vite input → `background/background.js`.                     |
| `src/pages/options/`            | Clean table, Advanced config editor, Stats, settings, import/export.              | Vite input → `pages/options/`.                               |
| `src/pages/addlink/`            | Toolbar popup for adding the current page as a redirect alias.                    | Vite input → `pages/addlink/`.                               |
| `src/pages/addrule/`            | Add a custom bookmark rule from context-menu-derived URL fields.                  | Vite input → `pages/addrule/`.                               |
| `src/pages/newtab/`             | New-tab override using the saved homepage.                                        | Vite input → `pages/newtab/`.                                |
| `src/pages/history/`            | Search, restore, and bulk-delete redirect change history.                         | Vite input → `pages/history/`.                               |
| `src/content/`                  | Website integration, status detection, raw formatting.                            | Copied verbatim; manifest controls script order and matches. |
| `src/viewer/textview.{html,js}` | Explicitly formatted selection with the shared raw-format toolbar.                | Static copy, not a Vite input.                               |
| `src/viewer/mdview.{html,js}`   | Markdown preview frame.                                                           | Static copy plus manifest resource declarations.             |
| `src/viewer/jsonview.{html,js}` | JSON tree preview frame.                                                          | Static copy plus manifest resource declarations.             |

React pages share `src/theme.jsx`: OS-based light/dark colors, compact component defaults, no ripple, and disabled transition creation. Static viewers and content scripts do not use that React theme.

## Configuration and Storage

`src/helpers/storage.js` wraps settings persistence. Redirect rules live under `chrome.storage.sync.jsonConfig` as structured arrays, not JSONC text. Homepage, sync URL, bookmark rules/folder name, limits, and stats settings use local storage. History and status helpers also persist locally.

Selection handoff uses `chrome.storage.session` keys prefixed with `textview:`. `selectionViewer.js` retains the newest ten handed-off selections; browser restart clears the session.

### Config Shape and Parsing Boundaries

README.md owns the full config example and current default values. The full object contains `homepage`, `configs`, `bookmarkRules`, `bookmarkFolderName`, history limits, `githubOrgThreshold`, and the three stats settings. Individual redirect entries support `{from, to}` objects and two-element `[from, to]` arrays.

| Input path                                       | Parsing and scope                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Remote sync in `src/components/SyncDialog.jsx`   | `jsonc-parser` accepts comments/trailing commas and requires `homepage` and `configs` properties. Applies only configs and homepage. |
| `setConfig()` in `src/helpers/storage.js`        | Strips comments, uses `JSON.parse`, then stores structured configs.                                                                  |
| Advanced Mode in `src/pages/options/Options.jsx` | Strips comments and uses `JSON.parse`; accepts the full object or a legacy plain configs array.                                      |
| File import in `Options.jsx`                     | Strict `JSON.parse`; requires an object containing a `configs` array. Restores supported settings when present.                      |
| JSON tree preview                                | Strict JSON parsing; remote-sync JSONC support does not extend to this viewer.                                                       |

Remote sync serializes `configs` before passing them to `setConfig`, saves the homepage separately, then sends `Myevent.updateConfig`. The background worker reads structured storage and does not parse JSONC. The default sync URL is a build-time fallback; a nonempty saved URL wins.

`configUtils.js` normalizes shapes and declarativeNetRequest filters. It adds `||` and `^` to `from`, and HTTP(S) prefixes to destinations when missing. It is the only current declaration-emission input in `tsconfig.json`.

## Redirect and Bookmark Updates

### Redirect Rules

In `src/background/background.js`, install, `Myevent.updateConfig`, and sync `jsonConfig` changes call `updateRedirectRules()`. The Promise queue at `src/background/background.js:283` serializes the complete rebuild:

1. Read current dynamic rules and remove their IDs.
2. Read the latest stored config and normalize entries.
3. Assign rule IDs and add main-frame redirects individually.
4. Log a bad rule without abandoning remaining rules; contain rebuild failure so later queued updates can run.

The queue prevents overlapping rebuilds from removing or adding each other's IDs. It is separate from bookmark scheduling; neither stored alias chains nor a sequential-only test substitutes for the concurrency boundary.

### Bookmark Reconciliation

`Myevent.updateConfig` and sync-storage changes schedule reconciliation after their redirect update completes. Status changes also schedule it. The bookmark scheduler debounces bursts, allows one scheduled reconciliation at a time, and records a follow-up request during an active run. Installation invokes reconciliation directly after its redirect update.

`bookmarkUtils.js` mirrors aliases into the configurable root folder. It creates a missing root under Other Bookmarks and can reuse a matching root under the Bookmarks Bar. It preserves bookmark order, updates matching titles in place, appends new entries, keeps later title duplicates, and resolves alias chains.

Root reconciliation skips subfolders during alias deduplication and URL changes. Otherwise an alias sharing a managed folder's title can delete that folder or attempt to assign it a URL.

The background then runs built-in bucket reconcilers and `reconcileAllBookmarkRules()`. Collector walks must skip the entire managed root using `porterFolderId`, preventing generated titles from becoming input on the next cycle. Export traversal intentionally reads inside that root and is a different operation.

`managedFolderUtils.js` creates `<name> (updating…)`, populates it, removes the old live folder only after success, then renames staging. The next run removes abandoned staging for that exact title. This preserves a populated folder across worker interruption; it is not an atomic Chrome bookmark transaction.

### Status and Custom Rules

GitHub/Azure status scripts send `Myevent.prStatus`; Jira sends `Myevent.jiraStatus`. Helpers persist `prStatuses` / `jiraStatuses`, and reconcilers decorate bookmark titles. Stored status takes priority over an old title prefix. Azure URL variants share a canonical deduplication key. Closed Jira tickets use ✅; closed, unmerged PRs use ❌.

Custom rules persist in local `bookmarkRules`. `genericBookmarkRuleUtils.js` handles history keywords, URL matching, deduplication keys, title cleanup, sorting, and reserved built-in folder names. `BookmarkRulesSection` / `BookmarkRuleForm` manage them; `ruleDerivation.js` derives fields for the AddRule page.

History is recorded by editing flows through `historyUtils.js`, not automatically by every background rebuild. Advanced saves and remote sync must not be described as a universal background audit trail.

## Content Scripts and Formatting

`src/manifest.json` controls supported sites and helper order:

- `content-utils.js` supplies error-page detection and staggered reload to GitHub, Azure, and Jira status scripts.
- `keep.js` / `keep.css` add Markdown preview in Keep note modals.
- `fav.js` requests nested managed bookmarks through `Myevent.getBookmarks` for the configured bookmark-export page.
- `format-detect.js` precedes `raw-formatter.js` on all URLs. These classic scripts expose `UrlPorterFormat` and `UrlPorterRawFormatter` for reuse.

### Raw Pages versus Selections

Raw pages detect syntax from response metadata, URL extension, then content. The formatter provides format/revert, syntax selection, wrapping, theme, copy, download, and syntax-specific previews. Prettier, marked, and the JSON viewer are bundled locally, not fetched from a CDN.

Selection context menus offer only **Format Selection as → syntax**. `selectionViewer.js` reads the exact selection through scripting when possible, including text fields, and falls back to Chrome's selection text when injection fails. It stores text in session storage and opens `viewer/textview.html` beside the source tab.

`textview.js` respects the selected syntax; it does not auto-detect or automatically open a preview. It formats the text and mounts the shared toolbar. Missing storage produces an error; unknown syntax or formatting failure keeps the original text available.

### Browser Boundaries

- Copy uses the Clipboard API when available, then a native-command fallback that restores selections. Native copy shortcuts remain uncanceled; partial selections remain native.
- Markdown renders in a sandboxed frame. On CSP-sandboxed pages, a script-less rendering fallback loses double-click copy; JSON tree preview is unavailable.
- Normal downloads use the displayed text. CSP-sandboxed pages send `Myevent.download`; `downloadUtils.js` validates text and sanitizes filenames before `chrome.downloads`.
- `src/viewer/jsonview.js` passes parsed data to the JSON viewer component, wrapping primitives. A string `.data` value would trigger the library's URL-fetch behavior.
- Viewer resource paths and script order must remain consistent across the manifest and Vite copy plugin.

## Supporting Modules

| Module                                                                                                                               | Responsibility                                             |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `src/helpers/configAnalysis.js`                                                                                                      | Config health checks: broken links, conflicts, duplicates. |
| `src/helpers/historyUtils.js`                                                                                                        | Redirect edit history and retention.                       |
| `src/helpers/historyStatsUtils.js`                                                                                                   | Browser history aggregation for Stats.                     |
| `src/helpers/fieldHelpers.js`                                                                                                        | Shared form placeholders and helper text.                  |
| `src/helpers/prUtils.js`, `githubRepoUtils.js`, `figmaMockUtils.js`, `jiraTicketUtils.js`, `googleDriveUtils.js`, `onedriveUtils.js` | Built-in bookmark buckets and related status handling.     |

## Build and Extension Points

Vite builds the worker and React entries, relocates generated HTML into `dist/pages/`, rewrites asset paths, and removes `dist/src/`. Its copy plugin adds content scripts, static viewers, the manifest, and vendor libraries. It disables module-preload links because Chrome rejects those cross-world extension preload hints.

Add pages through Vite inputs and relocation logic; add copied scripts/viewers through the copy plugin and manifest where applicable. Setting changes cross storage, UI, serialization, and background notification boundaries. Reconciler changes cross collector exclusion, root-folder preservation, and staged replacement boundaries. See DEV.md for the corresponding workflow and test files.
