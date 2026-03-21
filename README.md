# URL Porter

A Chrome extension that lets you configure redirect rules and set a custom homepage. Enhance your browsing experience by easily setting up URL redirects and a personalized new tab page.

## Features

- **URL Redirection** - Define rules to automatically redirect URLs based on patterns
- **Custom New Tab** - Replace Chrome's default new tab page with your own homepage
- **Add Link Page** - Quickly add new redirect rules from a dedicated popup or page
- **Bookmark Sync** - Automatically maintains a bookmark folder mirroring your redirect rules (configurable folder name)
- **Bookmark Bucket Reconcilers** - Auto-organizes bookmarks into subfolders by type: PRs, GitHub repos, Figma mocks, Jira tickets, Google Drive files, and OneDrive files — built from browser history and existing bookmarks
- **PR Status Tracking** - Content scripts on GitHub (including Enterprise) and Azure DevOps detect PR status (open/merged/closed) and prefix bookmark titles with status emoji
- **Jira Ticket Status Tracking** - Content script on Atlassian Cloud detects ticket status and prefixes bookmark titles with status emoji (🔵 in progress, ✅ done, ⚪ not started, ❌ blocked)
- **Google Keep Markdown Preview** - Content script that injects a markdown preview button into Google Keep note modals
- **Config Health Checks** - On-demand broken link detection and conflict/duplicate resolution from the Options page
- **History Tracking** - Audit trail of all redirect rule changes with configurable limits, search, restore, and bulk delete
- **Sync Server** - Optionally sync your configuration from a remote JSON file
- **JSON Editor** - Edit your configuration with syntax-highlighted JSON editor (Prism.js)
- **Omnibox Integration** - Type "go" in the address bar to search and navigate your redirect rules
- **Context Menu** - Right-click to quickly add the current page as a redirect rule
- **Light/Dark Mode** - Automatically adapts to your system theme preference

## Configuration

The config is a JSON array of redirect rules. Each rule can be:

- An object with `from` (pattern to match) and `to` (destination URL)
- A shorthand array `["keyword", "url"]`

### Sample Config JSON

```json
[
  {
    "from": "fav",
    "to": "https://synle.github.io/fav/"
  },
  {
    "from": "plex",
    "to": "https://app.plex.tv/desktop/#!/"
  },
  ["google", "google.com"]
]
```

## Development

### Prerequisites

- Node.js 20.19+ (use `nvm use` or [Volta](https://volta.sh/) — the project pins Node 20.19.1 via Volta)
- npm

### Setup

```bash
# Clone the repo
git clone https://github.com/synle/url-porter.git
cd url-porter

# Install dependencies
npm install
```

### Environment Variables

You can customize the default sync server URL by creating a `.env` file:

```bash
VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL=https://your-server.com/config.json
```

If no `.env` file exists, it defaults to: `https://synle.github.io/fav/url-porter.json`

### Dev Server

```bash
npm run dev
```

This builds to `dist/` in watch mode, rebuilding on file changes.

### Build the Extension

```bash
npm run build
```

The built extension will be output to the `dist` directory.

### Load in Chrome

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` directory

With `npm run dev`, the extension auto-reloads on file changes — no manual reload needed. For one-off builds (`npm run build`), click the reload button on the extension card.

### Scripts

| Script            | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| `npm run dev`     | Build to `dist/` in watch mode (rebuilds on file changes)  |
| `npm run build`   | One-off production build to `dist/` (also generates types) |
| `npm run bundle`  | Bump minor version + create `url-porter.zip` from `dist/`  |
| `npm run package` | Build + bundle (full release pipeline)                     |
| `npm run format`  | Format code with Prettier (140 char width)                 |
| `npm run lint`    | ESLint — catches undefined references, missing imports     |
| `npm test`        | Run all tests with Vitest                                  |

### Project Structure

```
src/
├── background/      # Service worker (redirect rules, context menus, omnibox, bookmark sync)
├── content/         # Content scripts (PR status, Jira status, Keep markdown, fav export)
├── helpers/         # Shared utilities (storage, config, history, bookmarks, reconcilers)
├── pages/
│   ├── addlink/     # Browser action popup for quick-adding redirect rules
│   ├── history/     # Audit trail of redirect rule changes
│   ├── newtab/      # New tab override (auto-redirects to configured homepage)
│   └── options/     # Main settings UI (Clean table mode + Advanced JSON editor)
├── manifest.json    # Chrome extension manifest (Manifest V3)
└── theme.jsx        # MUI theme (auto light/dark, compact sizing, no animations)
tests/               # Vitest test files (Chrome APIs mocked via vi.stubGlobal)
```

### Tech Stack

- **React 19** + **Vite 6** — build and dev tooling
- **MUI 7 (Material UI)** — component library and theming
- **react-simple-code-editor** + **Prism.js** — lightweight syntax-highlighted JSON editor
- **Vitest** — test runner with Chrome API mocking
- **Chrome Manifest V3** — declarativeNetRequest, storage, bookmarks, history, omnibox APIs

## Installation

### Mac / Linux

```bash
curl -L -o url-porter.zip https://github.com/synle/url-porter/raw/main/url-porter.zip && unzip url-porter.zip -d url-porter
```

### Windows

```bash
powershell -Command "Start-BitsTransfer -Source https://github.com/synle/url-porter/raw/main/url-porter.zip -Destination url-porter.zip"
powershell -Command "Expand-Archive -Path url-porter.zip -DestinationPath url-porter"
```

Then load the `url-porter` folder as an unpacked extension in Chrome (see [Load in Chrome](#load-in-chrome) above).
