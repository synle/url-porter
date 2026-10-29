# AGENTS

Guidance for agents working in this repository.

## Project and Context

URL Porter is a Chrome Manifest V3 extension for redirect aliases, a custom new tab homepage, bookmark reconciliation, and remote config sync. Extension pages use React and MUI; Vite builds the pages and service worker. Content scripts and viewer pages also run outside React.

Read [DEV.md](DEV.md) for commands, Chrome development, and CI/release mechanics. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing entry points, storage, messages, reconcilers, formatters, or diagnostics. [README.md](README.md) owns user-facing features and configuration examples; manifests and source files override historical plan summaries.

## Quality Checklist (mandatory)

Batch related edits, then run `npm run validate`; all checks must pass. The script runs tests, Oxlint, declaration generation, production build, and oxfmt; formatting can modify files.

- Keep tests in root `tests/`, never inside `src/`.
- Use Vitest and mock Chrome APIs with `vi.stubGlobal`. Use fictional fixture names such as Acme, Globex, Initech, FALCON, PLUTO, and ORBIT.
- Prefer `toMatchInlineSnapshot` for stable, readable structured outputs instead of large literal `toEqual` expectations. Keep scalar, empty-result, relational, asymmetric, and intentional partial `toMatchObject` assertions explicit when clearer. Pin nondeterministic fields before snapshotting. Follow the regeneration and review workflow in DEV.md.
- Add JSDoc to all functions, constants, types, and interfaces. Script files start with a `/** Description. */` header.
- Update README.md when adding or changing features. Keep the developer and architecture maps aligned when their contracts change.
- `.claude/settings.json` has a Claude Stop hook that runs validation when tracked changes remain. Other agents must run the gate themselves.

## Runtime and Build Boundaries

- `package.json` owns commands, dependency versions, and the Volta Node pin. See DEV.md for runtime selection and CI differences.
- Keep generated `dist/`, `types/`, `coverage/`, and `url-porter.zip` out of source edits.
- `vite.config.js` and `src/manifest.json` must agree on packaged paths. Content scripts are copied verbatim, not Vite inputs; register them in the manifest and build-copy plugin.
- Static viewer assets and bundled formatter libraries also require build-copy entries. Preserve their manifest resource declarations when used from web pages.
- `package.json` is the version source. Vite writes the packaged manifest version; bundling also patches the tracked source manifest without reformatting it.
- Only `release-official` bumps the version. Ordinary builds and `build-main` never bump it.
- Keep local agent worktrees untracked. `/.claude/worktrees/` is ignored; the former accidental gitlink was removed, not restored as a submodule.

## Behavioral Invariants

- Keep redirect rebuilds serialized across install, message, and sync-storage events. The queue covers the complete remove/read/add cycle and must recover after failure.
- Bookmark reconciliation has a separate debounce/serialization mechanism. Do not substitute it for the redirect queue.
- Collectors feeding bookmark reconcilers must skip the managed root using `porterFolderId`, including nested walkers, or generated bookmarks feed back into later runs.
- Root alias reconciliation must skip subfolders during deduplication and URL updates. Managed folders may share titles with aliases.
- Use `rebuildManagedSubfolder()` from `managedFolderUtils.js`: populate staging before deleting the live folder. Never delete the live folder first; MV3 can stop at any `await`.
- Preserve alias-chain bookmark resolution, existing bookmark order, in-place updates, and later-title-wins deduplication.
- Keep built-in subfolder names reserved when validating custom bookmark rules.
- Persist settings before sending `Myevent.updateConfig`, including blur-based saves that require background reconciliation.
- Keep remote JSONC ingestion separate from stored structured configs and strict file-import/JSON-tree parsing. Advanced Mode also accepts legacy configs arrays; file import requires an object containing `configs`.
- Preserve the production editor interop adapter, `EditorModule.default ?? EditorModule`. Loader-only UI tests do not cover the production CommonJS export shape.
- Raw-page syntax detection and explicit selection formatting are different paths. Selection menus respect the chosen syntax; the old automatic/Markdown-only selection entries no longer exist.
- Preserve native `Ctrl/Cmd+C` handling and partial selections. Copy actions must retain the Clipboard API fallback without canceling copy shortcuts on failure.
- Preserve sandboxed Markdown rendering, the script-less fallback, JSON-tree sandbox restrictions, and background-mediated downloads on sandboxed pages.
- Pass parsed values to the JSON viewer's `.data` property. The library treats string data as a URL and fetches it; preserve the wrapper used for primitives.

## Diagnostics and Crash Triage

Read `ARCHITECTURE.md` → Local Diagnostics before changing the recorder; read `README.md` → Crash Triage before changing attribution or isolation guidance.

- Keep the worker as the sole diagnostics storage writer. Serialize append, read, and clear through the same recovering queue.
- Preserve allowlisted fields, same-extension sender authentication, sender-derived context, and exact Options-page restrictions for read/clear. Keep diagnostics separate from settings export/import and remote sync.
- Preserve retention, event-rate, and pending-write bounds in `src/content/diagnostics.js`. Never persist arbitrary error messages, raw stacks, page URLs/titles, configuration, selected text, or installed-extension inventories.
- Preserve reporter wiring in the worker, React theme, manifest, and selection viewer. Keep script order and copied production assets aligned; sandboxed previews remain outside the recorder.
- Keep diagnostics local-only and actions on demand, with visible failures and clear readback. Never add telemetry, heartbeat timers, keepalive ports, or automatic culprit labels.
- Worker starts, idle gaps, and unfinished operations are observations, not crash proof. Native Brave/Windows attribution requires affected-machine evidence; JavaScript records alone do not establish the cause.

## Code and UI Conventions

- Use ES modules for bundled code and the background worker. Copied content scripts remain classic scripts; preserve their shared globals and manifest load order.
- Use React hooks for component state. React pages share `src/theme.jsx`: automatic light/dark mode, compact sizing, disabled animations and ripple.
- Do not repeat `size="small"` on components whose theme default already supplies it.
- Declare storage/history loaders before their effects. Keep the local async `boot()` wrapper when calling them from effects; direct calls trigger `react/set-state-in-effect`.
- Initialize prop-derived form state at mount and remount by identity `key`, not synchronization effects.
- Normalize redirect filters through `configUtils.js`: `from` receives `||` / `^`, and destinations without HTTP(S) receive `https://`.
- Use `react-simple-code-editor` with Prism.js for Advanced Mode; retain the extension-compatible editor rather than introducing Monaco.

## Status Emoji Convention

Reuse these bookmark-title status prefixes:

| Emoji | Meaning                                           |
| ----- | ------------------------------------------------- |
| 🔵    | In progress / active / open                       |
| ✅    | Done / merged / closed Jira ticket                |
| ⚪    | Not started / backlog                             |
| ❌    | Blocked / abandoned / failed / closed unmerged PR |

## Shared Agent Context and Skills

- `AGENTS.md` owns shared agent rules. Migrate same-scope `CLAUDE.md` guidance here, preserving distinct instructions and updating references.
- Retain a compatibility link or thin adapter only when a verified consumer requires the old context path.
- Store each repository skill at `.agents/skills/<name>/SKILL.md`. The kebab-case folder must match frontmatter `name`; portable frontmatter contains only `name` and `description`.
- Migrate legacy command files, Claude-specific skill directories, and flat skill files into that layout while preserving names, behavior, and references.
- Do not add skills under `.claude/commands/`, `.claude/skills/`, or flat `.agents/skills/<name>.md` paths.
- For releases, read `.agents/skills/release/SKILL.md`. Its official-by-default routing overrides generic release skills; beta requires explicit beta/prerelease/test wording.
- The release skill proceeds without confirmation prompts, summarizes commits since the last official release, and leaves custom notes and changesets unset.

## GitHub and Merge Policy

Fetch raw file content through `https://github.com/{owner}/{repo}/blob/head/{path}?raw=1`, never the Contents API or raw.githubusercontent.com.

Squash merge only: one commit per PR, no merge or rebase merges. Local branch synchronization may use `git merge origin/main`; PR merges remain squash.
