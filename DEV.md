# Development

[AGENTS.md](AGENTS.md) contains repository rules. [ARCHITECTURE.md](ARCHITECTURE.md) maps runtime boundaries; [README.md](README.md) describes user-facing behavior.

## Setup and Runtime

Use npm with the committed `package-lock.json`. `package.json` pins Node 20.19.1 through Volta. The repository-local coverage, PR-artifact, and release jobs select Node 20; the reusable build workflow owns its runtime separately.

```bash
npm ci
npm run dev
```

`npm run dev` generates declarations once, then runs a watch-mode extension build into `dist/`; it does not start a web development server.

Check `node --version` before recording validation results; shell PATH can bypass Volta's pin. With Volta installed, `volta run --bundled-npm npm run validate` uses the repository pin and its bundled npm. Native formatter/linter bindings must match that runtime's architecture; an x64 runtime cannot use installed arm64 bindings.

### Load in Chrome

1. Open `chrome://extensions/` and enable Developer mode.
2. Choose **Load unpacked** and select this checkout's `dist/`.
3. Keep the watch build running while editing. The development worker polls a build timestamp and reloads the extension.

The watch build names the extension **URL Porter (DEV)**. Pin its toolbar action to access the Add Link popup. Production builds do not inject the development reload worker.

## Commands

`package.json` is authoritative; do not infer commands from old plan logs.

| Command                 | Purpose                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`           | Generate declarations, then watch-build to `dist/`.                                              |
| `npm run build:types`   | Emit declarations into `types/`; currently only `src/helpers/configUtils.js` is included.        |
| `npm run build`         | Generate declarations and produce a one-off production build.                                    |
| `npm run bundle`        | Zip the existing `dist/`; synchronize source and packaged manifest versions from `package.json`. |
| `npm run package`       | Build, then bundle.                                                                              |
| `npm run package-syle`  | Package using the repository's configured sync-server override.                                  |
| `npm test`              | Run Vitest once, using JSDOM.                                                                    |
| `npm run test:coverage` | Run Vitest with V8 coverage and configured thresholds.                                           |
| `npm run lint`          | Run Oxlint with `.oxlintrc.json`, not ESLint.                                                    |
| `npm run format`        | Write repository formatting with oxfmt.                                                          |
| `npm run format:check`  | Check formatting without writing.                                                                |
| `npm run validate`      | Run tests → lint → declaration generation/build → formatting.                                    |

`build.sh` calls `npm run package-syle`. Bundling requires a pre-existing build; it does not rebuild application code. `npm run validate` does not create the zip or run coverage.

The `build:types` script emits declarations with `checkJs: false`; it is not a whole-project JavaScript type check. See `tsconfig.json`.

### Sync URL

`src/helpers/storage.js` uses `VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL` at build time, falling back to the default documented in README.md. `package-syle` supplies an explicit override. A nonempty saved `syncUrl` takes precedence over the build default; rebuilding does not migrate saved URLs.

Remote config can contain comments and trailing commas even when its URL ends in `.json`. This is a `SyncDialog` ingestion feature, not a general JSONC contract for every editor or viewer. See ARCHITECTURE.md for parsing boundaries.

## Testing and Debugging

Tests belong in root `tests/`. Vite's test configuration lives in `vite.config.js`, not a separate Vitest configuration. Chrome APIs are mocked; passing JSDOM tests do not establish native Chrome permissions, CSP, clipboard, or MV3 lifecycle behavior.

Run a focused file through the existing one-shot test script:

```bash
npm test -- tests/storage.test.js
npm test -- tests/SyncDialog.test.jsx
npm test -- tests/background.test.js
npm test -- tests/Options.production.test.jsx
```

Use related files for the area being changed:

| Area                              | Test entry points                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Redirects and storage             | `tests/background.test.js`, `tests/configUtils.test.js`, `tests/storage.test.js`                                         |
| Sync and settings                 | `tests/SyncDialog.test.jsx`, `tests/Options.test.jsx`, `tests/Options.production.test.jsx`, `tests/exportImport.test.js` |
| Bookmark staging and custom rules | `tests/bookmarkUtils.test.js`, `tests/managedFolderUtils.test.js`, `tests/genericBookmarkRuleUtils.test.js`              |
| Formatter and selection handoff   | `tests/rawFormatter.test.js`, `tests/formatDetect.test.js`, `tests/selectionViewer.test.js`, `tests/textview.test.js`    |
| Preview frames and downloads      | `tests/mdview.test.js`, `tests/jsonview.test.js`, `tests/downloadUtils.test.js`                                          |
| Source manifest version patching  | `tests/manifestVersion.test.js`                                                                                          |
| Local diagnostics                 | `tests/diagnostics.test.js`, `tests/DiagnosticsDialog.test.jsx`, `tests/background.test.js`                              |

The production Options test builds an in-memory bundle and exercises open/edit/save in JSDOM. Keep it when changing `EditorModule.default ?? EditorModule` in `src/pages/options/Options.jsx` or bundler interop. `.vscode/launch.json` provides run-all, debug-current-test, and watch-build configurations.

Known lifecycle gap: `tests/AddRule.test.jsx` cleans up rendered UI but does not drain the one-second `window.close()` timer in `src/pages/addrule/AddRule.jsx`. A full run can report `ReferenceError: window is not defined` after teardown even when all assertions pass. Treat that run as failed; a passing focused rerun does not fix timer ownership.

Inspect service-worker logs through the extension's inspection link at `chrome://extensions/`. Inspect the relevant page or content-script context for UI, raw formatting, and preview behavior.

### Diagnostics

Options → Diagnostics reads records on demand; **Export diagnostics** downloads `url-porter-diagnostics.json`. **Clear diagnostics** removes records, then reads them back through the worker. With no intervening events, successful clear/readback shows an empty `records` array. Failed actions display an error; inspect permissions and the service-worker console before retrying.

`tests/diagnostics.test.js` covers reporter, storage, and message contracts, including queue recovery and limits. `tests/DiagnosticsDialog.test.jsx` covers inspect/export/clear and visible failures. These tests do not establish native crash capture or affected-machine behavior.

For reporter wiring, ownership, privacy boundaries, and packaged script order, read [Local Diagnostics in ARCHITECTURE.md](ARCHITECTURE.md#local-diagnostics). For Brave/Windows evidence and controlled isolation, follow [Crash Triage in README.md](README.md#crash-triage-brave--windows).

### Coverage and Historical Results

Coverage thresholds live in `vite.config.js` under `test.coverage.thresholds`. The coverage job's step-summary text contains stale hardcoded floors; use the configuration and actual coverage result, not that text.

`DONE.eslint.md` is an archived v1.98.0 lint-cleanup report, not current validation evidence or a prohibition on content-script tests. `.oxlintrc.json` owns active rules; AGENTS.md owns current effect and form-state conventions.

## Making Changes

- **React page or entry point:** update `vite.config.js` inputs and HTML relocation logic when needed. Keep output paths consistent with `src/manifest.json`.
- **Content script:** register its matches and script order in `src/manifest.json`; add the corresponding copy step in `vite.config.js`.
- **Viewer or formatter library:** update the static asset/vendor copy list. Maintain `web_accessible_resources` for assets loaded from web-page contexts.
- **Setting:** trace storage helpers, Options loading/saving, Advanced Mode, import/export, and relevant background notifications. Remote sync currently applies only `configs` and `homepage`.
- **Bookmark reconciler:** preserve managed-root exclusion and staging-before-removal. Keep custom rule names from colliding with built-in folders.
- **Final gate:** run `npm run validate` after related edits. Inspect formatter changes before staging; do not commit unrelated generated or formatting churn.

## CI and Releases

### Build

`.github/workflows/build-main.yml` runs for push/PR to main/master and manual dispatch. Its `build` job depends on `coverage` and calls a reusable workflow with `amend-triggering-commit: true` and `deploy-to-pages: true`.

The shared workflow owns build/amend/Pages mechanics; inspect its referenced revision before modifying that contract. The selected mode validates before push-only amendment with an explicit triggering-SHA lease. PR and dispatch runs do not rewrite history or deploy Pages. Amendment can change local commit IDs recorded in older plans.

Coverage reports upload separately. The PR-artifact job separately builds and bundles `url-porter.zip`, uploads it, and creates or updates the download comment.

### Release

Read `.agents/skills/release/SKILL.md` before releasing; do not execute a release as a documentation or development check.

- `release-official.yml` is manually dispatched. It bumps the minor version, packages, commits the bump, and generates/finalizes the official release.
- Its version commit uses `GITHUB_TOKEN`, so the workflow explicitly dispatches `build-main` and checks the dispatched run's `head_sha` against the pushed commit.
- That dispatch check proves the correct revision was selected, not that the subsequent build finished successfully.
- `release-beta.yml` is explicit opt-in, optionally selects a SHA, marks the manifest as beta, and packages without an official version bump.
- The skill summarizes commits since the last official release and leaves custom notes unset. Do not restore separate official/beta skills.
- Cleanup workflows own scheduled artifact cleanup and PR-close artifact removal.

`package.json` owns version numbers. Vite updates `dist/manifest.json`; `scripts/bundle.js` also patches only the source manifest's version field through `scripts/manifestVersion.js`.
