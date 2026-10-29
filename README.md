# URL Porter

A Chrome extension that lets you configure redirect rules and set a custom homepage.

## Features

- **URL Redirection** - Auto-redirect URLs based on pattern rules
- **Custom New Tab** - Replace the new tab page with your own homepage
- **Add Link Page** - Quick-add redirect rules from a popup or page
- **Bookmark Sync** - Maintains a bookmark folder mirroring your rules (configurable name)
- **Bookmark Bucket Reconcilers** - Auto-organizes bookmarks into subfolders by type: PRs, GitHub repos, Figma mocks, Jira tickets, Google Drive, OneDrive
- **Custom Bookmark Rules** - Define your own reconciler rules from settings — no code changes needed (e.g. LeetCode, StackOverflow, Confluence)
- **PR Status Tracking** - Content scripts on GitHub (incl. Enterprise) and Azure DevOps prefix bookmark titles with status emoji
- **Jira Status Tracking** - Content script on Atlassian Cloud does the same for ticket status (🔵 in progress, ✅ done, ⚪ not started, ❌ blocked)
- **Google Keep Markdown Preview** - Injects a markdown preview button into Keep note modals
- **Raw Page Formatter** - Floating "Format <syntax> ▾" button on raw text responses (JSON, JS/TS/JSX/TSX as one option, CSS, SCSS, Less, HTML, Vue, XML, YAML, Markdown, GraphQL, Handlebars, ...). Pretty-prints with bundled Prettier (no CDN, no extra extension). Syntax auto-detected from Content-Type, then URL extension, then content sniffing; the caret menu (drops down from the top-right button) overrides it, and its top section lists actions with their shortcuts: **Format** (`Alt+S` / `Option+S`), **Wrap lines** (`Ctrl+Shift+Enter` / `Cmd+Shift+Enter`), **Dark mode** (`Shift+Esc`; follows the OS color scheme via `prefers-color-scheme` — plain text is black on white or white on black), **Copy to clipboard**, and **Download** (`Ctrl+S` / `Cmd+S`, saves the content exactly as displayed — formatted if formatted, original otherwise; on pages served with a CSP `sandbox` such as raw.githubusercontent.com, which block in-page downloads, it saves through the `downloads` permission instead). The button always reads "Format <syntax>"; clicking it (or `Alt+S`) while formatted reverts to the original text, and the toast says which state you're in. `Cmd/Ctrl+C` or `Alt+C` copies the entire content (a partial selection still copies normally; copies are plain text so indentation survives paste). The floating button is non-selectable, so `Cmd/Ctrl+A` selects only the content. Formatted output is monospace; Chrome's own "Pretty-print" checkbox is hidden on these pages. A small non-selectable toast at the bottom confirms each action (copied, word wrap ON/OFF, formatted as JSON, ...) for 2 seconds; a new toast replaces the previous one. Format errors show in the same toast (for 6 seconds) with the parser's message; if the extension was updated under an open page, it says to reload the page. The preview toggle (`Alt+M` / `Option+M`) follows the syntax selected in the dropdown, never a content check: with Markdown or MDX selected the caret menu adds **Preview Markdown**, which renders the original text to HTML with bundled [marked](https://github.com/markedjs/marked) (GFM) in a sandboxed extension frame (simple black-on-white / white-on-black styling with clear link colors, matching the OS theme); double-click a code block or inline code in the preview to select and copy it. Scripts inside the Markdown never run (the frame's extension CSP blocks them). On pages served with a CSP `sandbox` (raw.githubusercontent.com), whose sandbox also blocks scripts in our frames, the preview falls back to a script-less render without double-click copy, and the JSON tree is unavailable; with JSON selected it adds **View JSON Tree**, a collapsible tree with a search box and copy buttons from bundled [@andypf/json-viewer](https://github.com/andypf/json-viewer) (its built-in `default-light` / `default-dark` themes). Formatting or picking a syntax without a preview switches back to text.
- **Selection Viewer** - Highlight text on any page and right-click → **Format Selection as ▸ <syntax>**. The chosen syntax is respected, and a new tab opens with the formatted text plus the same Format toolbar used by the Raw Page Formatter, so the syntax can still be changed. Line breaks are preserved, including selections inside text boxes; on pages extensions cannot script (chrome://, the Web Store) it falls back to Chrome's whitespace-collapsed selection text. The selection is handed off through `chrome.storage.session` (cleared when the browser closes; only the 10 newest are kept).
- **Config Health Checks** - On-demand broken link detection and conflict/duplicate resolution
- **Clipboard fallback** - Raw-page Copy and `Alt+C` fall back to the browser's native copy command when the Clipboard API is missing or denied. Copy errors are logged with their original error objects. `Ctrl+C` / `Cmd+C` use native browser copy; copy shortcuts stay uncanceled so failed extension copying cannot block OS handling.
- **History Tracking** - Audit trail of rule changes with search, restore, bulk delete
- **Sync Server** - Optionally sync config from a remote JSON file
- **Browse History Stats** - Stats tab showing most visited URLs grouped by path, with filters and JSON export
- **Full Config JSON Editor** - All settings in one syntax-highlighted editor (Prism.js)
- **Full Config Export/Import** - Export/import all settings as a single JSON file
- **Omnibox Integration** - Type "go" in the address bar to search your rules
- **Context Menu** - Right-click to quick-add a rule or bookmark rule for the current site
- **Light/Dark Mode** - Adapts to system theme
- **Local Diagnostics** - Options → Diagnostics shows, exports, and clears bounded JavaScript failure records and background-operation breadcrumbs. No telemetry uploads or extra permissions.

## Crash Triage (Brave / Windows)

**Options → Diagnostics → Export diagnostics** saves `url-porter-diagnostics.json`. Recording starts after this version loads; it cannot recover evidence from earlier crashes.

The recorder keeps the latest 100 observations in `chrome.storage.local`, surviving browser restarts until cleared or the extension is removed. Writes are serialized. Each reporter and worker accepts at most 60 events per minute; the worker allows at most 20 pending writes. Overload drops events instead of growing memory or retrying. The export includes the current worker's drop count.

Records contain timestamps, extension version, execution context, error type, extension-owned script positions, and known operation names. The export adds coarse OS and Chromium version information. Arbitrary error messages, raw stack text, website URLs/titles, configuration, selected text, and installed-extension inventories are excluded. Nothing is uploaded automatically. Review before sharing; normal browser consoles can still contain unrelated existing application logs.

Captured failures include uncaught JavaScript errors, unhandled rejections, and selected caught background failures: redirects, bookmark reconciliation/reads, downloads, selection viewing, and tracked-pattern loading. Content reporters only accept errors with this extension's script locations. React pages and the selection viewer also install global handlers. Sandboxed previews, handled errors elsewhere, native crashes, and OOM kills may leave no record. Abrupt termination can lose the latest writes.

**A worker start is not a crash.** MV3 normally stops idle service workers. An operation-start without completion is only an observation, not proof of abnormal termination. There are no heartbeat timers, keepalive ports, shutdown-cleanliness guesses, or automatic blame labels. Error records establish extension JavaScript involvement, not the cause of a native browser crash.

After the next Windows incident:

1. Record the local time and timezone, last action, and whether one tab, an extension page, or the whole browser closed. Export diagnostics after restarting.
2. Record the exact Brave version and OS from `brave://version`. Do not share that entire page; profile paths and command-line arguments can contain private information.
3. Open `brave://crashes`. If a report exists, manually submit it when appropriate and retain its **Uploaded crash report ID** for Brave support.
4. Compare the incident time with error types and script positions in the export. An empty log does not exonerate URL Porter or prove a browser bug.
5. Reproduce in a separate test profile without sync or sensitive data. Compare URL Porter alone, URL Porter disabled, and other extensions added individually.
6. Keep workload and versions unchanged; record attempts and failures. If crashes persist with URL Porter disabled, investigate Brave, other extensions, memory, GPU acceleration, and Windows drivers separately.

For Windows Event Viewer evidence, retain the event source, timestamp, severity, and incident-time details. A missing-description warning or an `INFO` extension-garbage-collection entry alone does not establish a crash cause. Correlate it with the native crash report and reproduction results before changing code or attributing fault.

Change one variable at a time. Correlation is not proof of fault. An extension cannot read the native dump or infer its signature from JavaScript logs.

Maintainers: URL Porter maintainers; triage guidance reviewed 2026-10-28. Native Brave/Windows reproduction is still required before claiming a crash fix.

Sources: [Chrome worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [storage persistence](https://developer.chrome.com/docs/extensions/reference/api/storage), [content-script isolation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), and [Brave manual crash reports](https://support.brave.app/hc/en-us/articles/22281484910221-How-do-I-manually-submit-crash-reports).

## Configuration

The config is a JSON array of redirect rules. Each rule is an object with `from` (pattern) and `to` (destination), or a shorthand array `["keyword", "url"]`.

Redirect-rule rebuilds run sequentially when install, sync, and UI updates overlap, preventing duplicate rule IDs. Alias-chain destinations such as `["acme/repos", "http://acme/repo"]` remain supported.

Use **Advanced Mode** to edit and save the full config below. A production-bundle regression test covers opening the editor, changing a setting, and saving it without React errors.

Full config format (Advanced Mode, export, import):

```json
{
  "homepage": "https://synle.github.io/fav/",
  "configs": [
    { "from": "fav", "to": "https://synle.github.io/fav/" },
    { "from": "plex", "to": "https://app.plex.tv/desktop/#!/" },
    ["google", "google.com"]
  ],
  "bookmarkRules": [],
  "bookmarkFolderName": "url-porter",
  "historyAliasLimit": 5000,
  "historyEntryLimit": 20,
  "githubOrgThreshold": 3,
  "statsVisitThreshold": 3,
  "statsMaxResults": 200,
  "statsLookbackMonths": 6
}
```

## Development

Contributor map: [DEV.md](DEV.md) for commands, debugging, and CI; [ARCHITECTURE.md](ARCHITECTURE.md) for runtime and storage boundaries; [AGENTS.md](AGENTS.md) for agent rules.

Prerequisites: Node.js 20.19+ ([Volta](https://volta.sh/) pins 20.19.1) and npm.

```bash
git clone https://github.com/synle/url-porter.git && cd url-porter
npm ci
npm run dev    # watch-mode build to dist/
```

To customize the default sync server URL at build time:

```bash
VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL=https://your-server.com/config.json
```

Default: `https://synle.github.io/fav/url-porter.json`, including `npm run package-syle` builds. This fallback applies only when no sync URL is saved; existing saved URLs are preserved.

The lenient `jsonc-parser` is used only when ingesting a remote sync response, allowing comments and trailing commas regardless of the URL's extension. Redirect configs are then serialized as JSON and stored as structured values, the homepage is saved separately, and `Myevent.updateConfig` tells the background worker to read storage and register redirects/reconcile bookmarks. The background worker does not parse JSONC. Advanced Mode saves strip comments before `JSON.parse`; file imports and the JSON tree viewer continue to use strict JSON parsing.

### Load in Chrome

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**, select `dist/`

With `npm run dev`, the extension auto-reloads on file changes.

### Scripts

| Script             | Description                                                   |
| ------------------ | ------------------------------------------------------------- |
| `npm run dev`      | Build to `dist/` in watch mode                                |
| `npm run build`    | One-off production build (also generates types)               |
| `npm run bundle`   | Create `url-porter.zip` from `dist/`                          |
| `npm run package`  | Build + bundle                                                |
| `npm test`         | Run all tests with Vitest                                     |
| `npm run lint`     | Oxlint                                                        |
| `npm run format`   | Format code with oxfmt                                        |
| `npm run validate` | Tests, lint, production build, then formatting (writes files) |

### Agent Skills

Repository skills live in `.agents/skills/<name>/SKILL.md`, a shared, agent-neutral layout. Each skill has its own kebab-case directory and `name` and `description` frontmatter. The release skill is defined in [`.agents/skills/release/SKILL.md`](.agents/skills/release/SKILL.md).

### Project Structure

```
.agents/skills/      # Shared agent skills (one <name>/SKILL.md per skill)
src/
├── background/      # Service worker (redirect rules, context menus, omnibox, bookmark sync)
├── content/         # Content scripts, raw formatter, and shared local diagnostics reporter
├── components/      # Reusable UI (sync, bookmark rules, history stats, diagnostics)
├── helpers/         # Shared utilities (storage, config, history, bookmarks, reconcilers)
├── pages/
│   ├── addlink/     # Popup for quick-adding redirect rules
│   ├── addrule/     # Page for adding bookmark rules (from context menu)
│   ├── history/     # Audit trail of redirect rule changes
│   ├── newtab/      # New tab override
│   └── options/     # Settings UI (table mode + JSON editor + Stats + Diagnostics)
├── viewer/          # Static selection, Markdown, and JSON tree viewers
├── manifest.json    # Chrome extension manifest (Manifest V3)
└── theme.jsx        # MUI theme (auto light/dark, compact sizing, no animations)
tests/               # Vitest test files (Chrome APIs mocked via vi.stubGlobal)
```

Tech stack: React 19, Vite 8, MUI 9, Vitest, Chrome Manifest V3 (`declarativeNetRequest`, storage, bookmarks, history, omnibox).

## Installation

Download the latest `url-porter.zip` from [GitHub Releases](https://github.com/synle/url-porter/releases/latest), or:

### Mac / Linux

```bash
curl -L -o url-porter.zip https://github.com/synle/url-porter/releases/latest/download/url-porter.zip && unzip url-porter.zip -d url-porter
```

### Windows

```powershell
Invoke-WebRequest -Uri https://github.com/synle/url-porter/releases/latest/download/url-porter.zip -OutFile url-porter.zip
Expand-Archive -Path url-porter.zip -DestinationPath url-porter
```

Then load the `url-porter` folder as an unpacked extension in Chrome.

## CI/CD

| Workflow                 | Trigger                                       | What it does                                                                      |
| ------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------- |
| **build-main**           | Push/PR to main/master or `workflow_dispatch` | Coverage-gated shared build, lint/tests, format; push-only amend and Pages deploy |
| **build-main** (PR)      | Pull requests                                 | Uploads `url-porter.zip` artifact + download comment                              |
| **release-official**     | Manual dispatch                               | Bumps version, builds, creates GitHub release, tags `v{version}`                  |
| **release-beta**         | Manual dispatch                               | Draft prerelease tagged `release-beta-{date}-{sha}`, named "URL Porter (Beta)"    |
| **cleanup-artifacts**    | Weekly (Sunday)                               | Deletes old artifacts, draft releases, stale workflow runs                        |
| **cleanup-pr-artifacts** | PR closed                                     | Cleans up artifacts from closed PRs                                               |

Build CI opts into the shared workflow's `amend-triggering-commit` mode. Successful branch pushes fold build/format changes into the triggering commit with an explicit SHA lease; PR and manual-dispatch runs validate without rewriting history or deploying Pages. Existing coverage reports and PR zip/comment jobs remain separate.

Versioning: `package.json` is the single source of truth. Vite updates `dist/manifest.json`; bundling also patches the version in `src/manifest.json`.
