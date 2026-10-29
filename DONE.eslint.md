# DONE: oxlint rules addressed

Historical completion report for the Oxlint cleanup plan (formerly `TODO.eslint.md`). Every finding documented there was fixed and every rule re-enabled, except `react/react-in-jsx-scope`, intentionally kept off.

Completed against: oxlint 1.79.0, repo at v1.98.0 (2026-08-24). Results and test counts below describe that snapshot, not the current gate.

For current commands and test entry points, read [DEV.md](DEV.md). `.oxlintrc.json` owns active rules; [AGENTS.md](AGENTS.md#code-and-ui-conventions) owns current effect and form-state conventions.

## Result

`npm run lint` reported **0 findings** with this configuration:

```json
{
  "plugins": ["react"],
  "categories": { "correctness": "error" },
  "rules": {
    "no-empty": "error",
    "no-unused-vars": "error",
    "react/react-in-jsx-scope": "off",
    "react/immutability": "error",
    "react/set-state-in-effect": "error"
  }
}
```

`src/content/**` was removed from `ignorePatterns` — content scripts are now
linted like everything else. Validation: 627 tests pass, build green,
formatter clean (`npm run validate`).

## What was fixed

### 1. `no-empty` — fixed

- `src/helpers/onedriveUtils.js` — the empty `catch {}` now carries a comment
  explaining the intentional fall-through on malformed URLs.

### 2. `no-unused-vars` — all removed

- Deleted dead `formatDate` helpers from `prUtils.js` and `jiraTicketUtils.js`.
- Trimmed unused imports from `scripts/bundle.js`
  (`readdir`, `stat`, `relative`, `createGzip`) and `Options.jsx`
  (`OpenInNewIcon`).
- Removed an unused catch parameter in `Options.jsx` and unused locals in
  `tests/githubRepoUtils.test.js`, `tests/HistoryStatsSection.test.jsx`, and
  `HistoryStatsSection.jsx`.

### 3. `react/immutability` — all restructured

The flagged pattern was an effect reading a loader declared later (TDZ).
Effects now sit below their loaders; `showWelcome` in `NewTab.jsx` became a
hoisted function declaration declared before its first read.

Files: `BookmarkRulesSection.jsx`, `History.jsx`, `AddRule.jsx`, `NewTab.jsx`,
`AddLink.jsx`, `Options.jsx`.

### 4. `react/set-state-in-effect` — all restructured

- `BookmarkRuleForm.jsx`: state is now initialized from the `rule` prop at
  mount and the sync effect is gone. Parents remount the form via a `key`
  derived from rule identity — the React-recommended "reset state with a key"
  pattern.
- Data-loading effects call their loader through a local async wrapper
  (`const boot = async () => { await loadX(); }; boot();`) instead of invoking
  it directly, which keeps the synchronous-render warning away while preserving
  behavior.
- `HistoryStatsSection.jsx` also dropped an unused `hasVariants` binding.

## Rule kept off permanently

### `react/react-in-jsx-scope`

544 findings, all false positives: the build uses the automatic JSX runtime,
so `React` never needs to be in scope. Leave `"off"` in `.oxlintrc.json`.

## Bonus bug found by the lint sweep

`src/content/jira-status.js` referenced `CLOSED_RE` and `NOT_STARTED_RE`,
which were never defined anywhere — status detection threw a `ReferenceError`
on every Jira page. The usages now point at the declared
`CLOSED_PHRASE_RE` / `NOT_STARTED_PHRASE_RE`. The original report verified this fix by lint and manual reasoning only.

Content-script tests now exist, including `tests/rawFormatter.test.js` and `tests/diagnostics.test.js`. The historical verification gap is not a convention against adding tests.

## Notes for future agents

Follow [Code and UI Conventions in AGENTS.md](AGENTS.md#code-and-ui-conventions) for the preserved async `boot()` wrapper and identity-keyed form remount rules.
