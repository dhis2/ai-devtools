# Modernising a DHIS2 App's CI Pipeline

This is the step-by-step recipe for moving an app's GitHub Actions workflows off bespoke,
hand-rolled jobs and onto the shared `dhis2/workflows-platform` reusable workflows wherever
one exists, bumping any action version and Node version that remains in a custom step. This
is independent of the pnpm and style-configs migrations (`references/pnpm-migration.md`,
`references/style-configs-migration.md`) — an app can need any combination of the three, in
any order. If doing more than one, land on one coherent CI end-state, not sequential passes
that half-undo each other.

Reference migrations: [`dhis2/app-management-app#554`](https://github.com/dhis2/app-management-app/pull/554)
(the actual migration — deletes three bespoke workflows and replaces them with reusable-workflow
wrappers) and [`dhis2/app-management-app#561`](https://github.com/dhis2/app-management-app/pull/561)
(a same-week follow-up fixing a `github.ref` typo introduced by #554 — read it too, it's a
realistic mistake to avoid: `contains(fromJSON('[...]'), github.ref)` needs the list of _refs_
spelled correctly, `refs/heads/main` not `ref/heads/main`, and the arguments to `contains()`
in the right order).

---

## Step 1: Inventory the current workflows

List everything under `.github/workflows/*.yml` and classify each job:

- Already `uses: dhis2/workflows-platform/.github/workflows/<name>.yml@<ref>` — done, skip it
  (but still check the `@ref` — see Step 3).
- A bespoke/inline job doing something a reusable workflow also covers (build, lint, test,
  release/publish, commit-message or PR-title linting, PR preview deploy, production deploy,
  issue triage-and-close) — a migration candidate for Step 2.
- A bespoke job doing something genuinely app-specific — leave it, but still bump its actions
  and Node version (Step 4).

## Step 2: Replace bespoke jobs with reusable workflows

`dhis2/workflows-platform` currently publishes: `test.yml`, `lint.yml`, `lint-commits.yml`,
`lint-pr-title.yml`, `release.yml`, `deploy-pr.yml`, `deploy-production.yml`,
`deploy-branch.yml`, `comment-and-close.yml`, `e2e.yml`/`legacy-e2e.yml`, and
`generate-and-upload-bom.yml`. Compose the ones the app needs the same way
`app-management-app#554` did — one small wrapper file per concern rather than one big custom
workflow:

```yaml
# .github/workflows/test-and-release.yml
name: test-and-release

on: push

concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: ${{ !contains(fromJSON('["refs/heads/master", "refs/heads/main"]'), github.ref) }}

jobs:
    lint-commits:
        uses: dhis2/workflows-platform/.github/workflows/lint-commits.yml@v1
    lint:
        uses: dhis2/workflows-platform/.github/workflows/lint.yml@v1
    test:
        uses: dhis2/workflows-platform/.github/workflows/test.yml@v1
    release:
        needs: [lint-commits, lint, test]
        uses: dhis2/workflows-platform/.github/workflows/release.yml@v1
        if: '!github.event.push.repository.fork'
        secrets: inherit
```

```yaml
# .github/workflows/lint-pr-title.yml
name: lint-pr-title

on:
    pull_request:
        types: ['opened', 'edited', 'reopened', 'synchronize']

concurrency:
    group: ${{ github.workflow }}-${{ github.head_ref }}
    cancel-in-progress: true

jobs:
    lint-pr-title:
        uses: dhis2/workflows-platform/.github/workflows/lint-pr-title.yml@v1
```

Delete the bespoke workflow file(s) each wrapper replaces once the wrapper is in place —
don't leave both around (the real `#554` migration deleted `dhis2-verify-app.yml`,
`dhis2-verify-commits.yml`, and `dhis2-preview-pr.yml` entirely).

## Step 3: Pick the right ref for a pnpm app

The `@v1` refs above match `#554`'s real migration (a yarn-based, still-on-`cli-style` app at
the time). If this app is still on yarn and still on `cli-style`, `@v1` is what you want too
and there's nothing further to decide here. The two cases worth pausing on are pnpm apps:

| App is on...                      | Use               | Why                                                                                                                                                                                               |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm, still on `@dhis2/cli-style` | the `pnpm` branch | pnpm-native, but `lint.yml`/`lint-commits.yml`/`lint-pr-title.yml` still resolve config through `cli-style` — the right fit if the app has done the pnpm migration but not the style-configs one. |
| pnpm, off `@dhis2/cli-style`      | `@v2`             | pnpm-native, and those same three jobs resolve config via the app's own `commitlint.config.mjs`/`pnpm lint` script instead — no `cli-style` involved at all.                                      |

If neither fits (e.g. this app needs a job those refs don't cover), fall back to a small
custom step rather than adopting one that's wrong for it:

```yaml
lint-commits:
    runs-on: ubuntu-latest
    steps:
        - uses: actions/checkout@v4
          with: { fetch-depth: 0 }
        - uses: pnpm/action-setup@v4 # omit if the app is still on yarn
        - uses: actions/setup-node@v4
          with:
              node-version: 20
              cache: pnpm # or yarn
        - run: pnpm install --frozen-lockfile
        - uses: wagoid/commitlint-github-action@v5
          with:
              configFile: commitlint.config.mjs
```

`lint.yml`'s job is moot anyway once `cli-style` is gone (whether via a `cli-style`-independent
ref or a custom step) — `references/style-configs-migration.md` Step 11 already folds linting
into an inline `pnpm lint`/`yarn lint` step in the `test` job rather than using a separate
`lint` job at all, reusable or not.

## Step 4: Bump remaining custom actions and the Node version

For whatever's left as a genuinely bespoke job (Step 1's third bucket), or any reusable-workflow
wrapper's own surrounding boilerplate:

- Bump `actions/checkout` to `@v4`, `actions/setup-node` to `@v4`, and any other
  `actions/*` action to its current major (`gh api repos/actions/<name>/releases/latest --jq .tag_name`
  per action, or check the marketplace listing) — outdated majors on `actions/*` are a common
  source of silent Node 16 deprecation warnings and, eventually, hard failures as GitHub
  retires old runners.
- Set `node-version: 20` (or later — check what the current reusable workflows use, since
  they're the reference for what DHIS2 CI currently standardizes on:
  `gh api repos/dhis2/workflows-platform/contents/.github/workflows/test.yml --jq '.content' | base64 -d`).
  Don't leave a bespoke job on Node 16 or 18 while adopting reusable workflows that run 20 —
  that's a worse, more confusing hybrid than either extreme.
- Third-party (non-`dhis2/*`, non-`actions/*`) actions — bump those too if a newer major
  exists (`nwtgck/actions-netlify`, `wagoid/commitlint-github-action`, etc.) unless the app
  has a specific reason to pin.

## Step 5: Verify

Push to a branch and confirm every workflow actually triggers and passes — a `uses:` typo in
a reusable workflow reference (wrong org, wrong ref, wrong file name) fails silently as "workflow
file not found" rather than a normal job failure, so don't just eyeball the YAML.

## Troubleshooting

| Symptom                                                                    | Fix                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A reusable-workflow job fails with "Cannot find module '@dhis2/cli-style'" | The ref this job is pinned to (`@v1` and the `pnpm` branch, as of this writing) still resolves its config through `cli-style` internally — see Step 3's table for which ref to use instead, or the custom-step fallback. |
| `contains(fromJSON('[...]'), github.ref)` never matches the default branch | Check argument order (`contains(list, value)`, not `contains(value, list)`) and that every ref string is spelled `refs/heads/<branch>` in full — see `app-management-app#561`.                                           |
| A workflow silently never runs                                             | The `uses:` reference is wrong (org/repo/path/ref) — GitHub doesn't surface this as a run failure, the workflow just never appears in the Actions tab. Double-check the exact path against `workflows-platform`.         |
| `yarn: command not found` (or similar) inside a reusable workflow job      | This job's ref is still yarn-based (`@v1`, as of this writing) but the app is on pnpm — pick a pnpm-native ref instead (`pnpm` branch or `@v2` depending on whether `cli-style` is also gone, see Step 3's table).       |
