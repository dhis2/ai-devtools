# Migrating a DHIS2 App from Yarn to pnpm

This is the step-by-step recipe for moving an existing DHIS2 app off Yarn (typically Yarn 1)
and onto pnpm, using the pnpm support added to `@dhis2/cli-app-scripts` in `12.7.0`. Follow
every step in order — later steps assume earlier ones are done.

Reference migration: [`dhis2/aggregate-data-entry-app#481`](https://github.com/dhis2/aggregate-data-entry-app/pull/481),
enabled by [`dhis2/app-platform#933`](https://github.com/dhis2/app-platform/pull/933).

---

## Step 1: Pre-flight checks

Confirm before making any changes:

- `d2.config.js` exists in the project root.
- `yarn.lock` exists, `pnpm-lock.yaml` does not (if it already exists, the app is already
  migrated — stop here).
- Read the full `package.json` — note the current `@dhis2/cli-app-scripts` version and the
  complete `dependencies`/`devDependencies` lists. You'll need to compare against this after
  installing with pnpm to catch anything that was being phantom-hoisted by yarn 1.

## Step 2: Bump `@dhis2/cli-app-scripts`

pnpm support requires `@dhis2/cli-app-scripts >= 12.7.0`. Check the current latest version:

```bash
npm view @dhis2/cli-app-scripts version
```

Update `package.json` to that version (or at minimum `^12.7.0`) in `devDependencies`. Don't
run the install yet — do this alongside the other `package.json` changes below so it only
takes one install pass.

## Step 3: Add `pnpm-workspace.yaml`

`@dhis2/app-shell` directly imports several dependencies that yarn 1 used to hoist flatly
into `node_modules` without them being declared anywhere. pnpm's stricter resolution needs
these listed explicitly via `publicHoistPattern`. Start with this list (confirmed from both
reference PRs) and extend it if a build/lint/test error points at an unresolved module:

```yaml
# These hoists are needed for @dhis2/app-shell since it uses directly some libraries that
# were hoisted by yarn 1. This is a better alternative than pnpm's shamefullyHoist
# (https://pnpm.io/settings#shamefullyhoist) until app-shell's dependency handling changes.
publicHoistPattern:
    - '@dhis2/*'
    - 'typeface-roboto'
    - 'prop-types'
    - 'post-robot'
    - 'styled-jsx'
    - '@tanstack/*'
    - 'serialize-query-params'
```

If `pnpm install` or a subsequent build warns about ignored build scripts, add the relevant
packages to `onlyBuiltDependencies` (allow their build script) or `ignoredBuiltDependencies`
(silence the warning, if the build step genuinely isn't needed):

```yaml
onlyBuiltDependencies:
    - '@dhis2/cli-helpers-engine'
    - '@dhis2/cli-style'
    - cypress

ignoredBuiltDependencies:
    - core-js-pure
    - esbuild
```

## Step 4: Convert the lockfile

Run `pnpm import` first — it reads `yarn.lock` to produce `pnpm-lock.yaml` without doing a
full install, giving pnpm a starting point close to what's currently resolved:

```bash
pnpm import
```

Only after that succeeds, remove the yarn artifacts:

```bash
rm yarn.lock
rm -rf .yarn .yarnrc .yarnrc.yml  # remove whichever of these exist
```

## Step 5: Pin the package manager

Add a `packageManager` field to `package.json` so consumers (and corepack) know which
package manager and version to use. Check Node compatibility _before_ picking a pnpm version,
rather than trying `pnpm@latest` and reacting to a failure — that avoids a confirmed bad
interaction where a failed `corepack use pnpm@latest` still **writes the incompatible version
string into `package.json` before crashing**, leaving something to clean up either way. Don't
ask the user which pnpm version to use: this decision has one objectively correct answer
(whatever satisfies the local Node version) and asking every time would turn a one-line
command into a constant interruption, since most dev environments today are still on Node
<22.13.

Query what `pnpm@latest` actually requires (don't hardcode a Node version threshold — it's
specific to whichever pnpm major is current and will change as new majors ship), compare
against the local Node version, and pin whichever pnpm line is compatible:

```bash
REQUIRED_NODE=$(npm view pnpm@latest engines.node)   # e.g. ">=22.13"
NODE_OK=$(node -e "
    const req = '$REQUIRED_NODE'.replace(/[^0-9.]/g, '').split('.').map(Number)
    const cur = process.versions.node.split('.').map(Number)
    console.log(cur[0] > req[0] || (cur[0] === req[0] && cur[1] >= (req[1] || 0)) ? 'yes' : 'no')
")

if [ "$NODE_OK" = "yes" ]; then
    corepack use pnpm@latest
else
    corepack use pnpm@10   # fully current, actively maintained -- not a legacy fallback
fi
```

**Verify** `package.json`'s `packageManager` field actually starts with `pnpm@` afterward —
some environments set `COREPACK_ENABLE_AUTO_PIN=0`, which makes `corepack use` exit `0`
without writing anything at all. If the field is still missing (corepack unavailable, or
silently disabled), set it manually:

```bash
pnpm --version
# then hand-edit package.json:
# "packageManager": "pnpm@<version>"
```

## Step 6: Install and fix breakage

```bash
pnpm install
pnpm build
pnpm test
```

Work through any errors that surface:

- **Import from a split package fails** (e.g. `@dhis2-ui/checkbox`, `@dhis2/ui-forms`) —
  these have been consolidated into `@dhis2/ui`. Update the import to pull from `@dhis2/ui`
  instead of trying to make the old package resolve.
- **"Cannot find module" for anything else** — it was being phantom-hoisted by yarn 1. Add
  it explicitly to `dependencies` or `devDependencies` in `package.json` (common ones seen
  in real migrations: `react`, `react-dom`, `@dhis2/app-adapter`, `@dhis2/pwa`,
  `@dhis2/prop-types`).
- **A module `@dhis2/app-shell` needs directly still isn't resolving** — add it to
  `publicHoistPattern` in `pnpm-workspace.yaml` (Step 3) rather than as a project dependency.

Re-run `pnpm install` after each `package.json`/`pnpm-workspace.yaml` change until the build
and tests pass cleanly.

## Step 7: Update tooling that shells out to yarn

Search the repo for literal `yarn` invocations outside of `package.json`'s own dependency
list — these won't be caught by the install/build/test cycle above:

- Husky/git hooks (e.g. `.hooks/pre-commit`, `.hooks/commit-msg`) — replace `yarn <cmd>`
  with `pnpm <cmd>`.
- Any `package.json` `scripts` entries that call `yarn` directly.
- CONTRIBUTING docs referencing `yarn install`, `yarn start`, etc. The README itself gets a
  fuller pass — see Step 8.

## Step 8: Update the README

While the package manager is already being touched, bring the README's own presentation up
to date. Three independent changes — do whichever apply, don't force a section that isn't
relevant:

**Add a pnpm badge, keep every other badge as-is.** Don't replace or reorder existing badges
(React version, codecov, etc.) — just add pnpm's alongside them, same as any other badge in
that row:

```markdown
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
```

**Refresh the app description from the App Hub, if the app is published there.** Read
`d2.config.js`'s `id` and `title` fields, then check if the app is listed at
`https://apps.dhis2.org/api/v2/apps` (paginated, `?page=<n>&pageSize=25`, no working
server-side search — fetch pages and match client-side). Match on `id` first (most
reliable — `d2.config.js`'s `id` is the same UUID the App Hub uses), falling back to a fuzzy
match on `title` only if `id` isn't set. **The App Hub display name doesn't always match the
repo/title name** — `aggregate-data-entry-app`'s `d2.config.js` has `title: 'Data Entry'`,
and it's genuinely listed under just "Data Entry" on the App Hub, not "Aggregate Data Entry".
If you find a match, replace the paragraph(s) directly under the `#` title with the App Hub
`description` field (it's already written in prose, often markdown-formatted — use it near
verbatim, don't rewrite it). Keep everything else in the README untouched — operational notes
specific to the repo (required authorities, setup caveats, links to diagrams, live-demo URLs)
usually live below that description and aren't part of it. If the app isn't listed there (not
every app is — some are core/bundled, some just aren't published), leave the description as
whatever the README already has and don't fabricate one.

**Rename "Available Scripts" to "Get Started" and make it concise.** The
`pnpm create @dhis2/app` scaffold's default README has a verbose version of this section — a
`### yarn start`-style subheading plus a full paragraph, repeated separately for each of
`start`/`test`/`build`/`deploy`. Collapse that into one short block, and switch `yarn` to
`pnpm` while doing it:

````markdown
## Get Started

```sh
pnpm install   # install dependencies
pnpm start     # run the app locally
pnpm test      # run tests
pnpm build     # build for production
pnpm deploy    # deploy the built app to a DHIS2 instance
```
````

If the app has no "Available Scripts" section at all (common on older or heavily
customized READMEs — real `aggregate-data-entry-app`'s README has none, just a badge, a
title, a live-demo link, and app-specific docs), add a "Get Started" section rather than
renaming anything; don't invent scripts the app doesn't actually have — check
`package.json`'s `scripts` first.

## Step 9: Update CI

In `.github/workflows/*.yml`:

- Replace direct `yarn install`/`yarn build`/etc. steps with `pnpm install`/`pnpm build`.
- Add `pnpm/action-setup@v4` before `actions/setup-node`, and set `cache: pnpm` on the
  `actions/setup-node` step (instead of `cache: yarn`).

If the app consumes `dhis2/workflows-platform` reusable workflows (`uses: dhis2/workflows-platform/.github/workflows/...@<ref>`),
point them at the `pnpm` branch instead of the default `@v1` tag — the same approach
`aggregate-data-entry-app#481` used:

```yaml
uses: dhis2/workflows-platform/.github/workflows/test.yml@pnpm
```

pnpm support hasn't been merged into `@v1` yet as of this writing, so `@v1` workflows will
still run `yarn install` internally and fail once `yarn.lock` is gone. Confirm the `pnpm`
branch still exists before using it — it's expected to eventually merge into `@v1`, at which
point this step becomes unnecessary:

```bash
gh api repos/dhis2/workflows-platform/branches --jq '.[].name'
```

## Step 10: Verify

Do a clean reinstall to catch anything masked by stale `node_modules` state, then re-run the
app's usual checks:

```bash
rm -rf node_modules
pnpm install
pnpm build
pnpm test
pnpm start
```

`pnpm start` here just confirms the dev server boots without crashing — start it, confirm it
compiles and serves on its usual port, then stop it (Ctrl-C). That alone doesn't tell you
whether the app actually works once someone logs in; see Step 11 for that.

Confirm `pnpm-lock.yaml` is present and tracked in git, and `yarn.lock` is gone.

## Step 11: Sanity-check against a real server (optional)

`pnpm build` and `pnpm test` don't start the app or talk to a real DHIS2 server, so they can
miss runtime-only breakage — most commonly a dependency that yarn 1 was phantom-hoisting and
that only gets `import`ed from a code path the build/test suite doesn't exercise (e.g. a
lazy-loaded route, a conditional branch gated on server version). The only way to catch that
class of bug is to actually run the app against a server and see it render.

This step is **optional** — suggest it when the user wants extra confidence before deploying,
or asks for it directly. Don't run it as a routine part of every migration: it needs outbound
network access to a real DHIS2 instance, downloads a ~100–300MB Chromium binary on first use,
and takes real wall-clock time (dev server boot + login + render, typically 30s–2min).

A small bundled script (`scripts/smoke-test.mjs`, in this skill's own directory) does this
without adding anything to the migrated app's `package.json` or `pnpm-lock.yaml` — it's a
skill-owned tool with its own isolated dependencies, not a dependency of the app being
migrated.

### One-time setup

```bash
cd <this-skill's-directory>/scripts
pnpm install
npx playwright install chromium
```

(The Chromium download is cached globally under `~/.cache/ms-playwright` and shared across
every project on the machine — this is a one-time cost, not a per-migration one.)

### Per-run invocation

```bash
node <this-skill's-directory>/scripts/smoke-test.mjs \
  --cwd /path/to/migrated-app \
  --server https://play.im.dhis2.org/stable-2-43-1 \
  --screenshot /tmp/smoke-test-screenshot.png
```

`--cwd` must point at the migrated app's directory — that's where the dev server command
actually runs, distinct from wherever the script itself lives. All other flags have sensible
defaults (`admin`/`district` credentials, port 3000/proxy port 8080, a 120s startup timeout)
— read the header comment in `smoke-test.mjs` for the full flag list, or just pass `--cwd`
and accept the rest.

Point `--screenshot` somewhere outside the app's own working tree (e.g. `/tmp` or this
skill's scratch space) so the check doesn't leave a stray untracked file inside the app's git
repo.

### Interpreting the result

The script exits `0` on pass, `1` on any failure, and prints a summary covering: whether
login succeeded (and as which user), whether the expected app-shell element rendered, a count
and preview of browser console errors, any uncaught JS exceptions on the page, and the
screenshot path. Read the screenshot as well as the summary — a blank white page with zero
console errors can still mean something didn't render (e.g. permission-gated content
resolving to nothing).

If it fails:

- **Login failed** — check the demo server is actually reachable (`curl -I <server-url>`)
  and that `admin`/`district` (or whatever credentials were passed) are valid on that
  instance.
- **Dev server never came up** — read the printed dev-server output; this is almost always a
  build error that should have already surfaced in Step 10, not something new.
- **Shell never rendered, but login succeeded** — this is the case this step exists to catch.
  Look at the console-error preview in the summary for a "Cannot find module" / import
  resolution error — treat it the same as a build-time resolution error: add the missing
  dependency to `package.json` or `publicHoistPattern` (see Step 3 and Step 6's
  troubleshooting notes), then re-run.
- **App doesn't use the standard `@dhis2/ui` HeaderBar** — re-run with `--selector` pointed
  at something else that only appears once logged in (e.g. a known heading or nav element
  specific to the app).

## Troubleshooting

| Symptom                                                                                     | Fix                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` succeeds but the app fails at build or runtime                               | Module resolution errors from missing hoists often don't surface until build/test/start — always run all three, not just install.                                                                                               |
| ESLint or the bundler can't resolve a `@dhis2/*` import that used to work                   | Check `publicHoistPattern` in `pnpm-workspace.yaml` includes `@dhis2/*`, then reinstall.                                                                                                                                        |
| pnpm prints "Ignored build scripts" warnings                                                | Expected for packages not in `onlyBuiltDependencies`. Only add a package there if the app actually needs its build/postinstall step.                                                                                            |
| The Step 11 smoke-test script reports uncaught page errors or missing-module console errors | This is a runtime-only resolution error the build/test steps didn't catch — treat it like any other missing dependency (Step 3/Step 6): add it to `package.json` or `publicHoistPattern`, reinstall, and re-run the smoke-test. |
| The Step 11 smoke-test script fails to log in                                               | Confirm the demo server URL is reachable and the credentials are valid for that instance before assuming the app is broken — this step depends on network access to a real server.                                              |
| App Hub description not found even though the app is clearly published                      | The App Hub display name may not match the repo/`d2.config.js` title exactly — match on `d2.config.js`'s `id` (the App Hub UUID) first, and only fall back to fuzzy name matching. See Step 8.                                  |
