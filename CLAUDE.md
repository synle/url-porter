# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

URL Porter is a Chrome Extension (Manifest V3) that lets users configure custom URL redirect rules (short aliases → full URLs), set a custom new tab homepage, and sync config from a remote server. Built with React 19, MUI 7, and Vite 6.

## Build & Development Commands

```bash
npm run dev          # Vite dev server with hot reload (localhost:5173)
npm run build        # Production build → dist/ (also generates types/)
npm run bundle       # Create url-porter.zip from dist/
npm run package      # build + bundle (full release pipeline)
npm run format       # Prettier (140 char width)
```

There is no test suite. Node version is pinned to 20.19.1 via Volta.

The env var `VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL` customizes the sync server endpoint at build time.

## Architecture

**Extension entry points** (each is a separate Vite input with its own HTML/JSX):
- `src/background/background.js` — Service worker. Manages `chrome.declarativeNetRequest` redirect rules, context menus, and message handling.
- `src/pages/options/` — Main settings UI with "Clean" (table) and "Advanced" (JSON editor) modes.
- `src/pages/addlink/` — Browser action popup for quick-adding the current page as a redirect rule.
- `src/pages/newtab/` — New tab override that auto-redirects to a configured homepage.
- `src/pages/history/` — Audit trail of redirect rule changes.

**Shared helpers** (`src/helpers/`):
- `storage.js` — Chrome storage API wrappers. Config rules use `chrome.storage.sync`; homepage URL, sync URL, and history use `chrome.storage.local`.
- `configUtils.js` — Normalizes redirect entries for `declarativeNetRequest` format. Only file with TypeScript declarations (emitted to `types/`).
- `historyUtils.js` — History tracking with configurable limits (5000 aliases, 20 entries per alias).

**Data flow**: UI saves config → `storage.js` → sends `"Myevent.updateConfig"` message → `background.js` updates `chrome.declarativeNetRequest.updateDynamicRules()` → history logged.

**Theme** (`src/theme.jsx`): MUI theme with auto light/dark mode detection.

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
- URL normalization: `from` fields get `||` prefix and `^` suffix; `to` fields get `https://` if no protocol
- All UI pages share `src/theme.jsx` for consistent styling
