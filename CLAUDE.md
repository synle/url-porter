# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

URL Porter is a Chrome Extension (Manifest V3) that lets users configure custom URL redirect rules (short aliases → full URLs), set a custom new tab homepage, and sync config from a remote server. Built with React 19, MUI 7, and Vite 6.

## Build & Development Commands

```bash
npm run dev          # Build to dist/ in watch mode (rebuilds on file changes)
npm run build        # One-off production build → dist/ (also generates types/)
npm run bundle       # Bump minor version + create url-porter.zip from dist/
npm run package      # build + bundle (full release pipeline)
npm run format       # Prettier (140 char width)
```

Tests use Vitest: `npm test` runs all tests. Test files live in the `tests/` directory at the project root. Chrome APIs are mocked via `vi.stubGlobal`. Node version is pinned to 20.19.1 via Volta.

The env var `VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL` customizes the sync server endpoint at build time.

## Local Development with Chrome

1. Run `npm run dev` — builds to `dist/` and watches for file changes.
2. Open Chrome → `chrome://extensions/` → enable **Developer mode** → **Load unpacked** → select the `dist/` folder.
3. Edit source files — Vite rebuilds automatically and the extension auto-reloads (no manual reload needed).

> **Tip:** Pin the extension to your toolbar (click the puzzle-piece icon → pin URL Porter) for quick access to the Add Link popup.

## Architecture

**Extension entry points** (each is a separate Vite input with its own HTML/JSX):

- `src/background/background.js` — Service worker. Manages `chrome.declarativeNetRequest` redirect rules, context menus, omnibox suggestions ("go" keyword), and message handling.
- `src/pages/options/` — Main settings UI with "Clean" (table) and "Advanced" (syntax-highlighted JSON editor via `react-simple-code-editor` + Prism.js) modes. Also configures homepage URL, bookmark folder name, and history limits.
- `src/pages/addlink/` — Browser action popup for quick-adding the current page as a redirect rule.
- `src/pages/newtab/` — New tab override that auto-redirects to a configured homepage.
- `src/pages/history/` — Audit trail of redirect rule changes with search, restore, and bulk delete.

**Shared helpers** (`src/helpers/`):

- `storage.js` — Chrome storage API wrappers. Config rules use `chrome.storage.sync`; homepage URL, sync URL, bookmark folder name, and history use `chrome.storage.local`.
- `configUtils.js` — Normalizes redirect entries for `declarativeNetRequest` format. Only file with TypeScript declarations (emitted to `types/`).
- `historyUtils.js` — History tracking with configurable limits (5000 aliases, 20 entries per alias).
- `bookmarkUtils.js` — Bookmark sync. Maintains a configurable bookmark folder (default "url-porter") under Other Bookmarks that mirrors config entries. The folder name is stored in `chrome.storage.local` and editable on the Options page. Key behaviors:
  - **Deduplicates by title** — if multiple bookmarks share the same title, the later (newer) one is kept and older duplicates are removed. Unique bookmarks not in config are never deleted.
  - **Preserves sort order** — existing bookmarks are updated in-place; new ones are appended to the bottom.
  - **Resolves short links** — if a `to` URL matches another alias, it expands through the chain until reaching a full URL (e.g. `a` → `aaa` → `https://aaa.com`).

**Bookmark bucket reconcilers** (`src/helpers/{prUtils,githubRepoUtils,figmaMockUtils,jiraTicketUtils,googleDriveUtils,onedriveUtils}.js`):

Each reconciler scans browser history and bookmarks, then rebuilds a subfolder under the url-porter folder (e.g. "jira tickets", "prs", "github repos"). Key design rule: **all bookmark walkers must skip the url-porter folder** (by accepting `porterFolderId` and `continue`-ing when `node.id` matches) to prevent a feedback loop where previously-built bookmark titles get re-parsed and accumulate data (e.g. dates appending on each reconciliation cycle).

**Data flow**: UI saves config → `storage.js` → sends `"Myevent.updateConfig"` message → `background.js` updates `chrome.declarativeNetRequest.updateDynamicRules()` → history logged → bookmark folder reconciled.

**Theme** (`src/theme.jsx`): MUI theme with auto light/dark mode detection, all animations disabled, compact sizing (small defaults for all components), and ripple disabled.

## Build System Details

`vite.config.js` has custom post-build plugins that:

1. Copy `src/manifest.json` to `dist/`
2. Move generated HTML files to their expected extension paths (`dist/pages/[name]/`)
3. Fix relative asset paths in the moved HTML files
4. Clean up temporary `dist/src/` directory

Output structure must match paths declared in `manifest.json`. Be careful when modifying build config or adding new pages.

Content scripts (`src/content/`) are **not** Vite inputs — they are copied verbatim by the `copy-manifest` plugin. If adding new content scripts, add a `copyFileSync` call in `vite.config.js` and register them in `src/manifest.json`.

In dev/watch mode (`--watch`), the manifest's `name` is automatically changed to "URL Porter (DEV)" to distinguish from production builds. A dev-reload mechanism (`src/background/dev-reload.js`) is also injected — it polls a timestamp file and calls `chrome.runtime.reload()` on changes. This is dev-only and not included in production builds.

## Quality Checklist (mandatory, non-negotiable)

After every change, you MUST:

1. **Run `npm test`** — all tests must pass before considering a change complete
2. **Run `npm run format`** — format all code with Prettier
3. **Verify JSDoc** — JSDoc is mandatory for ALL functions (exported and internal). Every function must have a `/** */` block with `@param` and `@returns` annotations. Before finishing any task, scan changed files to confirm JSDoc is present on every function.

## Key Conventions

- ES modules throughout (`"type": "module"` in package.json and manifest.json background)
- React state management via hooks only (no external state library)
- URL normalization: `from` fields get `||` prefix and `^` suffix at redirect rule build time (in `normalizeFrom`); `to` fields get `https://` if no protocol
- All UI pages share `src/theme.jsx` for consistent styling — component sizes default to "small" globally via theme, so avoid setting `size="small"` on individual components
- Settings that auto-save on blur (homepage URL, bookmark folder name, history limits) send `"Myevent.updateConfig"` message to trigger background reconciliation
- No Monaco Editor — use `react-simple-code-editor` + Prism.js for the JSON editor (Monaco doesn't work in Chrome extensions)
