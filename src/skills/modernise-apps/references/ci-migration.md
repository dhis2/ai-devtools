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

## Step 3: Check `@v1` vs `@pnpm` and known `cli-style` coupling before adopting a job

Not every reusable workflow is a drop-in replacement for every app — check both of these
before wiring one in:

- **If this app is also migrating to pnpm** (`references/pnpm-migration.md`), every reusable
  workflow's `@v1` tag runs `yarn install --frozen-lockfile` internally — point the `uses:`
  ref at the `@pnpm` branch instead (`uses: dhis2/workflows-platform/.github/workflows/<name>.yml@pnpm`),
  the same way `aggregate-data-entry-app#481` did. Confirm the branch still exists first
  (`gh api repos/dhis2/workflows-platform/branches --jq '.[].name'`) — this is expected to
  eventually merge into `@v1`.
- **`lint.yml`, `lint-commits.yml`, and `lint-pr-title.yml` all internally require
  `@dhis2/cli-style` to be installed in the app**, on both `@v1` and `@pnpm` — `lint.yml` runs
  `d2-style check` directly, and the other two resolve their commitlint config via
  `require('@dhis2/cli-style').config.commitlint`. If this app has migrated off `cli-style`
  (`references/style-configs-migration.md`), all three break with "Cannot find module
  '@dhis2/cli-style'" once adopted as-is. Don't adopt them for such an app as-is — check for a
  fixed branch first, and fall back to a custom step if none exists yet:

    ```bash
    gh api repos/dhis2/workflows-platform/branches --jq '.[].name'
    ```

    A `pnpm-no-cli-style` branch fixes all three (built on top of `@pnpm`: `lint.yml` runs the
    app's own `pnpm lint` instead of `pnpm d2-style check`, and `lint-commits.yml`/
    `lint-pr-title.yml` point commitlint straight at the app's own `commitlint.config.mjs`
    instead of resolving through `cli-style`). If it exists, use it —
    `uses: dhis2/workflows-platform/.github/workflows/<name>.yml@pnpm-no-cli-style` — the same
    way the `@pnpm` branch itself gets used once confirmed to exist (this is expected to
    eventually merge into `@pnpm`/`@v1`, at which point drop the special-cased ref). If it
    doesn't show up in that branch list yet (not pushed, or a yarn-based app with no equivalent
    branch), fall back to a small custom step:

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

    `lint.yml`'s job is moot anyway once `cli-style` is gone (whether via the fixed branch or a
    custom step) — `references/style-configs-migration.md` Step 11 already folds linting into
    an inline `pnpm lint`/`yarn lint` step in the `test` job rather than using a separate `lint`
    job at all, reusable or not.

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

| Symptom                                                                    | Fix                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A reusable-workflow job fails with "Cannot find module '@dhis2/cli-style'" | That job (`lint.yml`, `lint-commits.yml`, or `lint-pr-title.yml`) depends on `cli-style` internally — see Step 3. Check for the `pnpm-no-cli-style` branch first; fall back to a custom step if it isn't available. |
| `contains(fromJSON('[...]'), github.ref)` never matches the default branch | Check argument order (`contains(list, value)`, not `contains(value, list)`) and that every ref string is spelled `refs/heads/<branch>` in full — see `app-management-app#561`.                                      |
| A workflow silently never runs                                             | The `uses:` reference is wrong (org/repo/path/ref) — GitHub doesn't surface this as a run failure, the workflow just never appears in the Actions tab. Double-check the exact path against `workflows-platform`.    |
| `pnpm install --frozen-lockfile` fails inside a reusable workflow job      | The job is still pinned at `@v1` (yarn-based) rather than `@pnpm` — see Step 3.                                                                                                                                     |
