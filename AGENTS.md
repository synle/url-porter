# AGENTS

Guidance for agents working in this repo.

## Project Overview

URL Porter is a Chrome Extension (Manifest V3) for custom URL redirect rules (aliases → URLs), a custom new tab homepage, and remote config sync. Built with React 19, MUI 9, Vite 8.

## Build & Development Commands

```bash
npm run dev          # Watch-mode build to dist/
npm run build        # One-off production build → dist/ (also generates types/)
npm run bundle       # Create url-porter.zip from dist/
npm run package      # build + bundle
npm run lint         # ESLint
npm run format       # oxfmt
npm run validate     # test + lint + build + format
```

Tests use Vitest (`npm test`). Test files live in `tests/` at the project root (never inside `src/` — build hooks can delete files there). Chrome APIs are mocked via `vi.stubGlobal`. Use fictional names in fixtures (Acme, Globex, Initech; FALCON, PLUTO, ORBIT). Node pinned to 20.19.1 via Volta.

`.vscode/launch.json` has debug configs for Vitest run-all, Vitest current-file, and a watch-mode dev build.

Env var `VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL` customizes the sync server URL at build time.

## Local Development with Chrome

1. `npm run dev`
2. Chrome → `chrome://extensions/` → Developer mode → **Load unpacked** → select `dist/`.
3. Edit files — Vite rebuilds and the extension auto-reloads.

Tip: pin the extension to the toolbar for quick access to the Add Link popup.

## Architecture

**Extension entry points** (each a separate Vite input):

- `src/background/background.js` — Service worker: `chrome.declarativeNetRequest` redirect rules, context menus, omnibox ("go"), message handling.
- `src/pages/options/` — Settings UI: "Clean" (table) and "Advanced" (full-config JSON editor) modes, homepage, folder name, history limits, bookmark rules.
- `src/pages/addlink/` — Popup to quick-add current page as a redirect rule.
- `src/pages/addrule/` — Page to add a bookmark rule, opened from context menu with auto-filled fields derived from the current page.
- `src/pages/newtab/` — New tab override redirecting to the configured homepage.
- `src/pages/history/` — Audit trail of redirect rule changes (search, restore, bulk delete).

**Shared helpers** (`src/helpers/`):

- `storage.js` — Chrome storage wrappers. Config rules use `chrome.storage.sync`; homepage, sync URL, folder name, history use `chrome.storage.local`.
- `configUtils.js` — Normalizes entries for `declarativeNetRequest`. Only file with TypeScript declarations (emitted to `types/`).
- `historyUtils.js` — History tracking with configurable limits (5000 aliases, 20 entries per alias).
- `configAnalysis.js` — Broken link detection, conflict/duplicate resolution. Pure functions for Options page health checks.
- `historyStatsUtils.js` — Browse history stats aggregation (most visited URLs grouped by path). Used by HistoryStatsSection on the Stats tab.
- `fieldHelpers.js` — Shared form field placeholder/helper text constants.
- `ruleDerivation.js` — Derives bookmark rule fields from a URL (`escapeRegex`, `deriveRuleFromUrl`). Used by AddRule page.
- `bookmarkUtils.js` — Bookmark sync: maintains a configurable folder (default "url-porter") under Other Bookmarks mirroring config entries. Dedupes by title (later wins), preserves sort order (updates in-place, appends new), resolves short-link chains (`a` → `aaa` → full URL).
- Bucket reconcilers (`prUtils`, `githubRepoUtils`, `figmaMockUtils`, `jiraTicketUtils`, `googleDriveUtils`, `onedriveUtils`) — each rebuilds a subfolder under the url-porter folder from browser history and bookmarks. **All bookmark walkers must skip the url-porter folder** (accept `porterFolderId`, skip matching nodes) or previously-built titles get re-parsed and data accumulates every cycle.
- `managedFolderUtils.js` — `rebuildManagedSubfolder()`: builds a replacement in a staging folder (`<name> (updating…)`), swaps only once populated. Never `chrome.bookmarks.removeTree` your own folder first — the MV3 worker can die at any `await`, leaving no folder. Orphaned staging folders are cleaned up next run.
- `genericBookmarkRuleUtils.js` — User-defined rules (in `chrome.storage.local` key `bookmarkRules`) generalizing the reconciler pattern: history keywords, URL match regex, dedup key regex, title cleanup, sort. Managed by BookmarkRulesSection / context menu "Add Bookmark Rule for This Site". Included in import/export. Reserved folder names blocked.

**Content scripts** (`src/content/`, copied verbatim, registered in `manifest.json`): `content-utils.js` (error page detection, staggered reload), `pr-status-github.js` (github.com, _.githubprivate.com, *.ghe.com → `Myevent.prStatus`), `pr-status-azure.js` (*.visualstudio.com, dev.azure.com → same `dedupeKey` for both URL formats), `jira-status.js` (_.atlassian.net/browse/* → `Myevent.jiraStatus`), `keep.js` (markdown preview button in Keep note modals), `fav.js` (bookmark export for synle.github.io/fav via `Myevent.getBookmarks`).

**Data flows**:

- Status tracking: content script detects status → message to background → stored in `chrome.storage.local` (`prStatuses` / `jiraStatuses`, keyed by canonical URL) → reconcilers prefix titles with status emoji. Priority: stored > old title prefix > none.
- Config: UI saves → `storage.js` → `"Myevent.updateConfig"` message → background updates dynamic rules → history logged → bookmarks reconciled.

**Full config JSON** (Advanced Mode editor, export, import; plain `[]` configs array also accepted for backward compat):

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

**Theme** (`src/theme.jsx`): auto light/dark, animations disabled, compact sizing, ripple disabled.

## Build System

`vite.config.js` post-build plugins copy the manifest, move generated HTML to `dist/pages/[name]/`, fix asset paths, clean up `dist/src/`. Output must match paths in `manifest.json`.

Content scripts are not Vite inputs — add a `copyFileSync` call in `vite.config.js` and register in `manifest.json`.

In dev mode (`--watch`), manifest name becomes "URL Porter (DEV)" and `dev-reload.js` polls a timestamp file to trigger reload. Dev-only.

Versioning: `package.json` is the single source of truth; `src/manifest.json` and `dist/manifest.json` sync during build/bundle. Version bumps happen only in release-official, never during CI builds.

## Quality Checklist (mandatory)

After every change:

1. Run `npm run validate` — all checks must pass (enforced by `.claude/settings.json` hooks).
2. Add JSDoc to all functions, constants, types, interfaces. Script files start with `/** Description. */` header.
3. Update README.md when adding or changing features.

## Status Emoji Convention

Standard status icons in bookmark title prefixes; reuse for any future status tracking:

| Emoji | Meaning                      |
| ----- | ---------------------------- |
| 🔵    | In progress / active / open  |
| ✅    | Done / closed / merged       |
| ⚪    | Not started / backlog        |
| ❌    | Blocked / abandoned / failed |

## CI/CD

- **build-main**: push/PR to main. Reusable workflow from `synle/workflows`: runs `package-syle`, formats, commits, deploys to GitHub Pages. PRs get a zip artifact + download comment.
- **release-official**: manual dispatch only. Bumps version (`npm version minor`) → draft → build → changelog → publish `url-porter.zip`, tag `v{version}`. Use `/release-official`.
- **release-beta**: manual dispatch only. Beta-marked draft prerelease, tag `release-beta-{date}-{sha}`, name "URL Porter (Beta)". Use `/release-beta`.
- **cleanup-artifacts / cleanup-pr-artifacts**: scheduled and PR-close cleanup.

## GitHub Raw File URLs

Fetch raw file content via `https://github.com/{owner}/{repo}/blob/head/{path}?raw=1` — never the Contents API or raw.githubusercontent.com.

## Key Conventions

- ES modules throughout (`"type": "module"` in package.json and manifest background).
- React state via hooks only.
- URL normalization: `from` gets `||` prefix and `^` suffix (`normalizeFrom`); `to` gets `https://` if no protocol.
- All pages share `src/theme.jsx`; component sizes default to small globally — don't set `size="small"` per component.
- Settings that auto-save on blur send `"Myevent.updateConfig"` to trigger background reconciliation.
- JSON editor uses `react-simple-code-editor` + Prism.js (Monaco doesn't work in extensions).

## Git / PR Merge Policy

- Squash merge only — one commit per PR, no merge or rebase merges.
- Local branch sync via `git merge origin/main` is fine; PR merges stay squash.
