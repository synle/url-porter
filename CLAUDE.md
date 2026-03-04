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

There is no test suite. Node version is pinned to 20.19.1 via Volta.

The env var `VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL` customizes the sync server endpoint at build time.

## Local Development with Chrome

To test the extension locally during development:

1. Run `npm run dev` — this builds to `dist/` and watches for file changes, rebuilding automatically.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `dist/` folder from this project.
5. The extension is now loaded. You should see it in your extensions list.
6. As you edit source files, `npm run dev` will rebuild `dist/` automatically. After a rebuild, go back to `chrome://extensions/` and click the **reload** button (circular arrow) on the URL Porter card to pick up changes.

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
  - **Never deletes** existing bookmarks — old bookmarks not in config are kept as-is.
  - **Preserves sort order** — existing bookmarks are updated in-place; new ones are appended to the bottom.
  - **Resolves short links** — if a `to` URL matches another alias, it expands through the chain until reaching a full URL (e.g. `a` → `aaa` → `https://aaa.com`).

**Data flow**: UI saves config → `storage.js` → sends `"Myevent.updateConfig"` message → `background.js` updates `chrome.declarativeNetRequest.updateDynamicRules()` → history logged → bookmark folder reconciled.

**Theme** (`src/theme.jsx`): MUI theme with auto light/dark mode detection, all animations disabled, compact sizing (small defaults for all components), and ripple disabled.

## Build System Details

`vite.config.js` has custom post-build plugins that:

1. Copy `src/manifest.json` to `dist/`
2. Move generated HTML files to their expected extension paths (`dist/pages/[name]/`)
3. Fix relative asset paths in the moved HTML files
4. Clean up temporary `dist/src/` directory

Output structure must match paths declared in `manifest.json`. Be careful when modifying build config or adding new pages.

## Key Conventions

- ES modules throughout (`"type": "module"` in package.json and manifest.json background)
- React state management via hooks only (no external state library)
- URL normalization: `from` fields get `||` prefix and `^` suffix at redirect rule build time (in `normalizeFrom`); `to` fields get `https://` if no protocol
- All UI pages share `src/theme.jsx` for consistent styling — component sizes default to "small" globally via theme, so avoid setting `size="small"` on individual components
- Settings that auto-save on blur (homepage URL, bookmark folder name, history limits) send `"Myevent.updateConfig"` message to trigger background reconciliation
- No Monaco Editor — use `react-simple-code-editor` + Prism.js for the JSON editor (Monaco doesn't work in Chrome extensions)
