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
- **Raw Page Formatter** - Floating "Format <syntax> ▾" button on raw text responses (JSON, JS/TS/JSX/TSX as one option, CSS, SCSS, Less, HTML, Vue, XML, YAML, Markdown, GraphQL, Handlebars, ...). Pretty-prints with bundled Prettier (no CDN, no extra extension). Syntax auto-detected from Content-Type, then URL extension, then content sniffing; the caret menu (drops down from the top-right button) overrides it and toggles line wrapping (also `Cmd+Shift+Enter` on macOS / `Ctrl+Shift+Enter` on any OS). `Cmd/Ctrl+S` or `Alt+S` formats (the button always reads "Format <syntax>" — no Raw toggle); `Cmd/Ctrl+C` or `Alt+C` copies the entire content (a partial selection still copies normally; copies are plain text so indentation survives paste). The floating button is non-selectable, so `Cmd/Ctrl+A` selects only the content. Formatted output is monospace; Chrome's own "Pretty-print" checkbox is hidden on these pages. A small non-selectable toast at the bottom confirms each action (copied, word wrap ON/OFF, formatted as JSON, ...) for 2 seconds; a new toast replaces the previous one. When Markdown or MDX is the selected syntax, the caret menu adds a **Preview Markdown** toggle that renders the original text to HTML with bundled [marked](https://github.com/markedjs/marked) (GFM) in a script-less sandboxed frame; formatting or picking a non-Markdown syntax switches back to text.
- **Selection Viewer** - Highlight text on any page and right-click → **Preview Selection as Markdown** (renders it as HTML in a new tab, inside a script-less sandboxed frame) or **Format Selection as ▸ <syntax>** (opens a new tab with the text pretty-printed in monospace using the same bundled Prettier / XML formatter). Line breaks are preserved, including selections inside text boxes; on pages extensions cannot script (chrome://, the Web Store) it falls back to Chrome's whitespace-collapsed selection text. The selection is handed off through `chrome.storage.session` (cleared when the browser closes; only the 10 newest are kept).
- **Config Health Checks** - On-demand broken link detection and conflict/duplicate resolution
- **History Tracking** - Audit trail of rule changes with search, restore, bulk delete
- **Sync Server** - Optionally sync config from a remote JSON file
- **Browse History Stats** - Stats tab showing most visited URLs grouped by path, with filters and JSON export
- **Full Config JSON Editor** - All settings in one syntax-highlighted editor (Prism.js)
- **Full Config Export/Import** - Export/import all settings as a single JSON file
- **Omnibox Integration** - Type "go" in the address bar to search your rules
- **Context Menu** - Right-click to quick-add a rule or bookmark rule for the current site
- **Light/Dark Mode** - Adapts to system theme

## Configuration

The config is a JSON array of redirect rules. Each rule is an object with `from` (pattern) and `to` (destination), or a shorthand array `["keyword", "url"]`.

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

Prerequisites: Node.js 20.19+ ([Volta](https://volta.sh/) pins 20.19.1) and npm.

```bash
git clone https://github.com/synle/url-porter.git && cd url-porter
npm install
npm run dev    # watch-mode build to dist/
```

To customize the default sync server URL at build time:

```bash
VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL=https://your-server.com/config.json
```

Default: `https://synle.github.io/fav/url-porter.jsonc`. The response is parsed as JSONC (comments and trailing commas allowed).

### Load in Chrome

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**, select `dist/`

With `npm run dev`, the extension auto-reloads on file changes.

### Scripts

| Script             | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `npm run dev`      | Build to `dist/` in watch mode                       |
| `npm run build`    | One-off production build (also generates types)      |
| `npm run bundle`   | Create `url-porter.zip` from `dist/`                 |
| `npm run package`  | Build + bundle                                       |
| `npm test`         | Run all tests with Vitest                            |
| `npm run lint`     | ESLint                                               |
| `npm run format`   | Format code with oxfmt                               |
| `npm run validate` | Run all quality checks: test + lint + build + format |

### Project Structure

```
src/
├── background/      # Service worker (redirect rules, context menus, omnibox, bookmark sync)
├── content/         # Content scripts (PR status, Jira status, Keep markdown, fav export, raw formatter)
├── components/      # Reusable UI components (SyncDialog, BookmarkRulesSection, BookmarkRuleForm)
├── helpers/         # Shared utilities (storage, config, history, bookmarks, reconcilers)
├── pages/
│   ├── addlink/     # Popup for quick-adding redirect rules
│   ├── addrule/     # Page for adding bookmark rules (from context menu)
│   ├── history/     # Audit trail of redirect rule changes
│   ├── newtab/      # New tab override
│   └── options/     # Settings UI (table mode + JSON editor + Stats)
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

| Workflow                 | Trigger                                | What it does                                                                   |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------------------ |
| **build-main**           | Push/PR to main or `workflow_dispatch` | Builds, tests, formats, deploys to GitHub Pages                                |
| **build-main** (PR)      | Pull requests                          | Uploads `url-porter.zip` artifact + download comment                           |
| **release-official**     | Manual dispatch                        | Bumps version, builds, creates GitHub release, tags `v{version}`               |
| **release-beta**         | Manual dispatch                        | Draft prerelease tagged `release-beta-{date}-{sha}`, named "URL Porter (Beta)" |
| **cleanup-artifacts**    | Weekly (Sunday)                        | Deletes old artifacts, draft releases, stale workflow runs                     |
| **cleanup-pr-artifacts** | PR closed                              | Cleans up artifacts from closed PRs                                            |

Versioning: `package.json` is the single source of truth; `src/manifest.json` syncs during build/bundle.
