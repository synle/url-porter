# TODO: oxlint rules to address

Goal: get the codebase fully clean under oxlint so that every rule currently
turned off can be re-enabled (or be consciously kept off with a documented
reason). Another agent will pick this up later — each section below lists the
rule, why it was disabled, what it currently flags, and the suggested action.

Last measured against: oxlint 1.79.0, repo at v1.97.0 (2026-08-24).

## Current state

`.oxlintrc.json` enables the `react` plugin, sets `categories.correctness`
to `error`, and turns off five rules:

| Rule                        | Why it was turned off                                 |
| --------------------------- | ----------------------------------------------------- |
| `no-empty`                  | One empty catch-style block in `onedriveUtils.js`     |
| `no-unused-vars`            | 11 unused vars/params across scripts, src, and tests  |
| `react/react-in-jsx-scope`  | False positives: build uses the automatic JSX runtime |
| `react/immutability`        | 6 self-referencing callback patterns flagged          |
| `react/set-state-in-effect` | 2 synchronous setState calls inside effects           |

`ignorePatterns` also excludes `src/content/**`. Verified: content scripts
produce **0** findings when the ignore is removed, so the exclusion is stale
and can simply be dropped.

## Findings to fix (20 total)

### 1. `no-empty` — 1 finding

- `src/helpers/onedriveUtils.js:75` — empty block statement.
- Action: delete the dead branch or add a comment explaining why the block is
  intentionally empty, then re-enable the rule.

### 2. `no-unused-vars` — 11 findings across 7 files

Files:

- `scripts/bundle.js`
- `src/components/HistoryStatsSection.jsx`
- `src/helpers/jiraTicketUtils.js`
- `src/helpers/prUtils.js`
- `src/pages/options/Options.jsx` (includes an unused catch parameter `err`)
- `tests/HistoryStatsSection.test.jsx`
- `tests/githubRepoUtils.test.js`

Action: remove the unused bindings (or rename to `_name` if a signature must
keep the position), then re-enable the rule.

### 3. `react/immutability` — 6 findings across 6 files

Flagged pattern: a variable is read while its own declaration is still
initializing (self-referencing callbacks), e.g. `loadSettings` in
`Options.jsx:189`.

Files:

- `src/components/BookmarkRulesSection.jsx`
- `src/pages/addlink/AddLink.jsx`
- `src/pages/addrule/AddRule.jsx`
- `src/pages/history/History.jsx`
- `src/pages/newtab/NewTab.jsx`
- `src/pages/options/Options.jsx`

Action: convert the recursive/self-referencing callbacks to named function
declarations (hoisted) instead of arrow consts, then re-enable the rule.

### 4. `react/set-state-in-effect` — 2 findings

Synchronous `setState` inside `useEffect`, which triggers cascading renders:

- `src/components/BookmarkRuleForm.jsx:95`
- `src/components/HistoryStatsSection.jsx:95`

Action: derive the value during render, initialize state with the computed
value directly, or move the update to the event that caused it. Re-enable the
rule afterwards.

## Rules to keep off permanently (with reason)

### `react/react-in-jsx-scope` — 544 false positives

The build uses Vite + `@vitejs/plugin-react` with the **automatic JSX runtime**
(`jsx: "react-jsx"` semantics), so `React` never needs to be imported for JSX.
All 544 findings are false positives from the classic-runtime assumption.

Action: keep `"off"` and leave this comment next to it in `.oxlintrc.json`.

## Cleanup checklist for the next agent

1. Fix the 20 findings above (sections 1–4).
2. Remove `src/content/**` from `ignorePatterns` (verified clean).
3. Re-enable `no-empty`, `no-unused-vars`, `react/immutability`,
   `react/set-state-in-effect`.
4. Keep `react/react-in-jsx-scope` off, with the comment from section 5.
5. Run `npm run validate` (test + lint + build + format) — must stay green.
6. Rename this file to `DONE.eslint.md`, mirror the rename to the backup at
   `~/git/DONE.eslint.url-porter.md`, and update both statuses.
