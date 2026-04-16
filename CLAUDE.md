# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

URL Porter is a Chrome Extension (Manifest V3) that lets users configure custom URL redirect rules (short aliases → full URLs), set a custom new tab homepage, and sync config from a remote server. Built with React 19, MUI 7, and Vite 6.

## Build & Development Commands

```bash
npm run dev          # Build to dist/ in watch mode (rebuilds on file changes)
npm run build        # One-off production build → dist/ (also generates types/)
npm run bundle       # Create url-porter.zip from dist/
npm run package      # build + bundle (creates url-porter.zip)
npm run lint         # ESLint — catches undefined references, missing imports
npm run format       # Prettier (140 char width)
npm run validate     # Run all quality checks: test + lint + build + format
```

Tests use Vitest: `npm test` runs all tests. Test files live in the `tests/` directory at the project root (NOT inside `src/` — build hooks can delete files there). Chrome APIs are mocked via `vi.stubGlobal`. Use fictional company names in test fixtures (Acme, Globex, Initech) and made-up ticket keys (FALCON, PLUTO, ORBIT) — never real company names. Node version is pinned to 20.19.1 via Volta.

The env var `VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL` customizes the sync server endpoint at build time.

## Local Development with Chrome

1. Run `npm run dev` — builds to `dist/` and watches for file changes.
2. Open Chrome → `chrome://extensions/` → enable **Developer mode** → **Load unpacked** → select the `dist/` folder.
3. Edit source files — Vite rebuilds automatically and the extension auto-reloads (no manual reload needed).

> **Tip:** Pin the extension to your toolbar (click the puzzle-piece icon → pin URL Porter) for quick access to the Add Link popup.

## Architecture

**Extension entry points** (each is a separate Vite input with its own HTML/JSX):

- `src/background/background.js` — Service worker. Manages `chrome.declarativeNetRequest` redirect rules, context menus, omnibox suggestions ("go" keyword), and message handling.
- `src/pages/options/` — Main settings UI with "Clean" (table) and "Advanced" (full-config JSON editor via `react-simple-code-editor` + Prism.js) modes. Also configures homepage URL, bookmark folder name, history limits, and custom bookmark rules.
- `src/pages/addlink/` — Browser action popup for quick-adding the current page as a redirect rule.
- `src/pages/addrule/` — Standalone page for adding a bookmark rule. Opened from context menu with auto-filled fields (domain + date rule name, history keywords, URL match/dedup patterns derived from the current page URL).
- `src/pages/newtab/` — New tab override that auto-redirects to a configured homepage.
- `src/pages/history/` — Audit trail of redirect rule changes with search, restore, and bulk delete.

**Shared helpers** (`src/helpers/`):

- `storage.js` — Chrome storage API wrappers. Config rules use `chrome.storage.sync`; homepage URL, sync URL, bookmark folder name, and history use `chrome.storage.local`.
- `configUtils.js` — Normalizes redirect entries for `declarativeNetRequest` format. Only file with TypeScript declarations (emitted to `types/`).
- `historyUtils.js` — History tracking with configurable limits (5000 aliases, 20 entries per alias).
- `configAnalysis.js` — Broken link detection and conflict/duplicate resolution. Pure functions used by the Options page for on-demand health checks.
- `historyStatsUtils.js` — Browse history stats aggregation (most visited URLs grouped by path, stripping query strings/hashes). Used by the HistoryStatsSection component on the Options page Stats tab.
- `fieldHelpers.js` — Shared placeholder and helper text constants for form fields (used by AddLink popup and Options dialogs).
- `ruleDerivation.js` — Pure functions for deriving bookmark rule fields from a URL (`escapeRegex`, `deriveRuleFromUrl`). Used by the AddRule page for auto-fill.
- `bookmarkUtils.js` — Bookmark sync. Maintains a configurable bookmark folder (default "url-porter") under Other Bookmarks that mirrors config entries. The folder name is stored in `chrome.storage.local` and editable on the Options page. Key behaviors:
  - **Deduplicates by title** — if multiple bookmarks share the same title, the later (newer) one is kept and older duplicates are removed. Unique bookmarks not in config are never deleted.
  - **Preserves sort order** — existing bookmarks are updated in-place; new ones are appended to the bottom.
  - **Resolves short links** — if a `to` URL matches another alias, it expands through the chain until reaching a full URL (e.g. `a` → `aaa` → `https://aaa.com`).

**Bookmark bucket reconcilers** (`src/helpers/{prUtils,githubRepoUtils,figmaMockUtils,jiraTicketUtils,googleDriveUtils,onedriveUtils}.js`):

Each reconciler scans browser history and bookmarks, then rebuilds a subfolder under the url-porter folder (e.g. "jira tickets", "prs", "github repos"). Key design rule: **all bookmark walkers must skip the url-porter folder** (by accepting `porterFolderId` and `continue`-ing when `node.id` matches) to prevent a feedback loop where previously-built bookmark titles get re-parsed and accumulate data (e.g. dates appending on each reconciliation cycle).

**Generic bookmark rule reconciler** (`src/helpers/genericBookmarkRuleUtils.js`):

User-configurable bookmark rules stored in `chrome.storage.local` under `bookmarkRules`. Each rule defines history search keywords, a URL match regex, a dedup key extraction regex, title cleanup patterns, and sort preferences. The generic reconciler generalizes the 5-step pattern (search history, walk bookmarks, dedup, delete old folder, rebuild) into a single reusable function. Rules are managed via the `BookmarkRulesSection` component on the Options page (which uses the `BookmarkRuleForm` reusable component) and can also be added via the context menu "Add Bookmark Rule for This Site" action (opens `src/pages/addrule/`). Rules are included in import/export. Reserved folder names (prs, github repos, etc.) are blocked to prevent conflicts with hardcoded reconcilers.

**Content scripts** (`src/content/`) — copied verbatim (not Vite inputs). Each registered in `manifest.json`:

- `content-utils.js` — Shared utilities loaded before other content scripts. Provides error page detection and staggered reload with backoff.
- `pr-status-github.js` — Detects PR status (merged/closed/open) on GitHub pages (`github.com`, `*.githubprivate.com`, `*.ghe.com`) and sends `Myevent.prStatus` to background.
- `pr-status-azure.js` — Same for Azure DevOps (`*.visualstudio.com`, `dev.azure.com/{org}`). Both Azure URL formats share the same `dedupeKey` for deduplication.
- `jira-status.js` — Detects Jira ticket status on Atlassian Cloud (`*.atlassian.net/browse/*`) and sends `Myevent.jiraStatus` to background.
- `keep.js` — Google Keep content script that injects a markdown preview button into note modals.
- `fav.js` — Content script for `synle.github.io/fav/` that exports bookmark data from url-porter subfolders via `Myevent.getBookmarks`.

**Status tracking data flow**: Content scripts detect status on PR/Jira pages → send message to background → statuses stored in `chrome.storage.local` under `prStatuses` / `jiraStatuses` keys (keyed by canonical URL) → reconcilers prefix bookmark titles with status emoji. Status priority: stored (content script) > old bookmark title prefix > none.

**Data flow**: UI saves config → `storage.js` → sends `"Myevent.updateConfig"` message → `background.js` updates `chrome.declarativeNetRequest.updateDynamicRules()` → history logged → bookmark folder reconciled.

**Full config JSON format** (used in Advanced Mode editor, export, and import):

```json
{
  "homepage": "https://example.com",
  "configs": [{ "from": "alias", "to": "https://target.com" }],
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

The Advanced Mode editor and export/import use this single object. For backward compatibility, a plain `[]` configs array is also accepted in the Advanced Mode editor.

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

1. **Run `npm run validate`** — runs test, lint, build, and format in sequence. All must pass before considering a change complete. This is enforced by hooks in `.claude/settings.json`.
2. **Add JSDoc** — Mandatory on ALL functions, constants, types, and interfaces in every change — JavaScript and TypeScript alike. Script files must start with `/** Description. */` file header (note: `/**` not `/** *`). No exceptions.
3. **Update README** — When adding or updating a feature, update `README.md` to reflect the change (features list, project structure, scripts table, etc.).

## Status Emoji Convention

These 4 emojis are the standard status icons used in bookmark title prefixes across reconcilers (PRs, Jira tickets). Reuse them for any future status tracking:

| Emoji | Unicode        | Name                   | Meaning                           |
| ----- | -------------- | ---------------------- | --------------------------------- |
| 🔵    | `\uD83D\uDD35` | LARGE BLUE CIRCLE      | In progress / active / open       |
| ✅    | `\u2705`       | WHITE HEAVY CHECK MARK | Done / closed / resolved / merged |
| ⚪    | `\u26AA`       | MEDIUM WHITE CIRCLE    | Not started / to do / backlog     |
| ❌    | `\u274C`       | CROSS MARK             | Blocked / abandoned / failed      |

## CI/CD

- **build-main** (`build-main.yml`): Runs on push/PR to main. Uses reusable workflow from `synle/gha-workflows` which auto-detects and runs `package-syle`, formats code, commits changes, and deploys to GitHub Pages. On PRs, a separate `pr-artifacts` job uploads the zip and posts a download comment.
- **release** (`release.yml`): Manual `workflow_dispatch` only. Bumps version (`npm version minor`), runs `package-syle`, commits version bump, creates GitHub release with tag `v{version}` and `url-porter.zip` asset via `softprops/action-gh-release`.
- **Versioning**: `package.json` is the single source of truth. `src/manifest.json` and `dist/manifest.json` are synced automatically during build (by `vite.config.js` `copy-manifest` plugin) and bundle (by `scripts/bundle.js`). Version bumping only happens in the release workflow, never during CI builds.
- **cleanup-artifacts** / **cleanup-pr-artifacts**: Scheduled and PR-close cleanup workflows.

## GitHub Raw File URLs

When fetching raw file content from GitHub repos, always use the `?raw=true` blob URL format:

```
https://github.com/{owner}/{repo}/blob/head/{path}?raw=true
```

Do NOT use:

- `https://api.github.com/repos/{owner}/{repo}/contents/{path}` (GitHub Contents API)
- `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}`

## Key Conventions

- ES modules throughout (`"type": "module"` in package.json and manifest.json background)
- React state management via hooks only (no external state library)
- URL normalization: `from` fields get `||` prefix and `^` suffix at redirect rule build time (in `normalizeFrom`); `to` fields get `https://` if no protocol
- All UI pages share `src/theme.jsx` for consistent styling — component sizes default to "small" globally via theme, so avoid setting `size="small"` on individual components
- Settings that auto-save on blur (homepage URL, bookmark folder name, history limits) send `"Myevent.updateConfig"` message to trigger background reconciliation
- No Monaco Editor — use `react-simple-code-editor` + Prism.js for the JSON editor (Monaco doesn't work in Chrome extensions)
