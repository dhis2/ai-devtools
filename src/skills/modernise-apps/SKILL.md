---
name: modernise-apps
description: >
    Guide for modernising existing DHIS2 applications. Use this skill whenever the user
    wants to migrate, modernise, or upgrade an existing DHIS2 app to pnpm, move off yarn
    or yarn 1, update @dhis2/cli-app-scripts to a version that supports pnpm, or mentions
    pnpm-workspace.yaml, the packageManager field, or corepack, or wants to update a
    README's badges, app description, or Available Scripts/Get Started section, in the
    context of an existing DHIS2 app. Also use it when the user wants to move an app off @dhis2/cli-style
    or d2-style onto the shared @dhis2/config-eslint / @dhis2/config-prettier /
    @dhis2/config-stylelint / @dhis2/config-lslint / @dhis2/config-commitlint packages, or
    mentions eslint.config.mjs, flat config, shared lint config, stylelint, ls-lint,
    commitlint, migrating husky/git hooks, or bumping @dhis2/ui, @dhis2/app-runtime, or
    @dhis2/d2-i18n to a newer version, in the
    context of an existing DHIS2 app. Also use it when the user wants to modernise an
    existing app's CI/GitHub Actions pipeline, move it onto the dhis2/workflows-platform
    reusable workflows, bump outdated GitHub Actions, or update the Node version used in CI.
    This skill is for modernising an already-existing app — for scaffolding a brand new app,
    use the dhis2-apps skill instead.
---

# Modernising DHIS2 Apps

You are helping a developer bring an existing DHIS2 app up to date. "Modernising" currently
covers three independent tasks — an app can need any combination of them, or none:

1. **Migrating the package manager** from Yarn (typically Yarn 1) to pnpm.
   `@dhis2/cli-app-scripts` has supported pnpm since `12.7.0`, and this skill captures the
   concrete steps and gotchas involved — most of which come from Yarn 1's flat dependency
   hoisting silently covering up missing dependencies that pnpm's strict resolution exposes.
   This task also includes a README refresh: a pnpm badge, an app description pulled from
   the App Hub (apps.dhis2.org) if the app is published there, and collapsing the scaffold's
   verbose "Available Scripts" section into a concise "Get Started" one.
2. **Migrating off `@dhis2/cli-style`** (the `d2-style` CLI) onto the shared
   `@dhis2/config-*` packages — `config-eslint`/`config-prettier` always, plus
   `config-stylelint`/`config-lslint` for whichever of those the app already had configured
   — with plain `eslint`/`prettier`/`stylelint`/`ls-lint` and native `husky`/`lint-staged`,
   the same setup a fresh `pnpm create @dhis2/app` scaffold already uses by default. This
   task also includes bumping `@dhis2/ui`, `@dhis2/app-runtime`, and `@dhis2/d2-i18n` while
   the app's style tooling is already being touched — non-breaking by default, with an
   explicit choice offered if `latest` would cross a major version for any of them.
3. **Modernising the CI pipeline** — replacing bespoke GitHub Actions workflows with the
   shared `dhis2/workflows-platform` reusable workflows wherever one exists, and bumping any
   outdated action version or Node version left in whatever stays custom.

## First: confirm this is an existing DHIS2 app, and which task(s) apply

| Check                                                                                     | How                            | Result                                                                                             |
| ----------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `d2.config.js` exists and `@dhis2/cli-app-scripts` is in `package.json`                   | Glob + read `package.json`     | **DHIS2 app** — continue                                                                           |
| Neither found                                                                             | —                              | **Not a DHIS2 app** — this skill doesn't apply; see `dhis2-apps` if the user wants to scaffold one |
| `yarn.lock` exists and `pnpm-lock.yaml` does not                                          | `ls`                           | **Not yet migrated to pnpm** — proceed with `references/pnpm-migration.md` if that's what's needed |
| `pnpm-lock.yaml` already exists                                                           | `ls`                           | **Already migrated to pnpm** — nothing to do for that task                                         |
| `@dhis2/cli-style` is in `package.json`                                                   | Read `package.json`            | **Still on `d2-style`** — proceed with `references/style-configs-migration.md` if that's needed    |
| `.github/workflows/*.yml` has bespoke jobs, not just `uses: dhis2/workflows-platform/...` | Read `.github/workflows/*.yml` | **CI not fully modernised** — proceed with `references/ci-migration.md` if that's needed           |

## What does the user need?

| Scenario                                                                                              | References (read in order)                        |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Migrate an app from yarn to pnpm                                                                      | `references/pnpm-migration.md`                    |
| Refresh a migrated app's README (pnpm badge, App Hub description, concise "Get Started")              | `references/pnpm-migration.md` (Step 8)           |
| Sanity-check a migrated app renders correctly against a real server (opt-in)                          | `references/pnpm-migration.md` (Step 11)          |
| Move off `@dhis2/cli-style`/`d2-style` onto shared lint/format configs                                | `references/style-configs-migration.md`           |
| Bump `@dhis2/ui`/`@dhis2/app-runtime`/`@dhis2/d2-i18n` to the latest version                          | `references/style-configs-migration.md` (Step 12) |
| Modernise CI: adopt `dhis2/workflows-platform` reusable workflows, bump outdated actions/Node version | `references/ci-migration.md`                      |

More modernisation tasks (dependency upgrades, router migrations, etc.) may be added here
in the future — this table is deliberately structured to grow.

## Rules

- **Never delete `yarn.lock` before `pnpm import` has run successfully.** `pnpm import`
  reads `yarn.lock` to seed `pnpm-lock.yaml` — deleting it first throws away the information
  needed for a clean conversion.
- **Always bump `@dhis2/cli-app-scripts` to `>=12.7.0`** (check `npm view @dhis2/cli-app-scripts version` for the current latest) before attempting the migration — pnpm support does not exist in older versions.
- **Always install and build/test after migrating, and fix every resolution error before
  considering the migration done.** Don't leave `pnpm-workspace.yaml` hoist patterns
  incomplete just because `pnpm install` succeeded — module resolution errors often only
  surface at build or test time.
- **If the app's CI calls `dhis2/workflows-platform` reusable workflows, point them at the
  `pnpm` branch** (`uses: dhis2/workflows-platform/.github/workflows/<name>.yml@pnpm`),
  the same way `aggregate-data-entry-app#481` did — pnpm support hasn't been merged into
  the default `@v1` tag yet, but the `pnpm` branch has it. Confirm the branch still exists
  first (`gh api repos/dhis2/workflows-platform/branches --jq '.[].name'`) rather than
  assuming it forever, since this is expected to eventually merge into `@v1`.
- **`dhis2/workflows-platform`'s `lint.yml`, `lint-commits.yml`, and `lint-pr-title.yml`
  reusable workflows all internally require `@dhis2/cli-style` to be installed in the app**
  (on both `@v1` and `@pnpm`) — don't adopt them as-is for an app that has migrated off
  `cli-style`, they'll fail with "Cannot find module '@dhis2/cli-style'". Check whether the
  `pnpm-no-cli-style` branch exists yet (it fixes all three) before falling back to a custom
  step. See `references/ci-migration.md` Step 3.
- **The Step 11 sanity e2e check (`references/pnpm-migration.md`) is optional and opt-in.**
  Only run it if the user asks for extra confidence before deploying, or explicitly requests
  it — never run it automatically as part of a routine migration. It needs outbound network
  access to a real DHIS2 server, downloads a browser binary on first use, and takes real
  wall-clock time, none of which are appropriate defaults for every migration.
- **When migrating off `@dhis2/cli-style`, only migrate the tools the app actually had
  configured.** `d2-style` makes eslint/prettier/stylelint/ls-lint each independently
  opt-in — check for `.stylelintrc.js`/`.ls-lint.yml` before adding `@dhis2/config-stylelint`
  or `@dhis2/config-lslint`; don't introduce a tool the app never used.
- **Remove `@dhis2/cli-style` last, once every config it was proxying has a real
  replacement** — not as the first step. It stays installed while eslint/prettier/
  stylelint/ls-lint/commitlint are migrated one at a time so each can be verified against a
  still-working baseline, and only comes out once nothing references it (see
  `references/style-configs-migration.md` Step 10). Don't leave it listed but unused once
  removed — the reference PR (`route-manager-app#35`) missed this; don't repeat that
  oversight.
- **The `@dhis2/ui`/`@dhis2/app-runtime`/`@dhis2/d2-i18n` bump defaults to non-breaking**
  (current major only) for each library independently. If `latest` would cross a major for
  any of them, ask the user whether they want that library's latest non-breaking version or
  its true latest — don't silently pick one. If you can't ask (unattended), take the
  non-breaking default and say so in the summary. If a same-major bump surfaces new type or
  lint errors, that's a real regression to investigate via the changelog, not something to
  silence.
- **When matching an app to its App Hub listing, match on `d2.config.js`'s `id` first, not
  `title`.** The App Hub display name doesn't always match the repo/title name (e.g.
  `aggregate-data-entry-app`'s `title` is `Data Entry`, listed on the App Hub as just "Data
  Entry"), but `id` is the same UUID on both sides. Don't fabricate a description if the app
  genuinely isn't listed there.

## Troubleshooting

| Symptom                                                                              | Fix                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build/runtime error resolving a package that isn't declared as a direct dependency   | It was likely phantom-hoisted by yarn 1. Add it explicitly to `dependencies`/`devDependencies`, or add it to `publicHoistPattern` in `pnpm-workspace.yaml` if `@dhis2/app-shell` needs it directly.                                                            |
| Import from a scoped subpackage fails (e.g. `@dhis2-ui/checkbox`, `@dhis2/ui-forms`) | These have been consolidated into `@dhis2/ui`. Update the import rather than trying to hoist the old package.                                                                                                                                                  |
| pnpm warns about ignored build scripts for a dependency                              | Add the package to `onlyBuiltDependencies` (to allow it) or `ignoredBuiltDependencies` (to silence it) in `pnpm-workspace.yaml`, depending on whether the app actually needs that build step.                                                                  |
| ESLint errors "Cannot find config @dhis2/config-eslint" after moving off `d2-style`  | Either it wasn't installed, or the old `.eslintrc.js` still exists alongside the new flat `eslint.config.mjs` and ESLint is confused about which to use — delete the old one. See `references/style-configs-migration.md`.                                     |
| `stylelint`/`ls-lint` fails after moving off `d2-style`                              | The app never had `stylelint`/`@ls-lint/ls-lint` as a direct dependency before — `cli-style` bundled and ran its own copies. Add the real tool as a devDependency, not just its `@dhis2/config-*` package. See `references/style-configs-migration.md` Step 2. |
| A `dhis2/workflows-platform` job fails with "Cannot find module '@dhis2/cli-style'"  | That job (`lint.yml`, `lint-commits.yml`, or `lint-pr-title.yml`) requires `cli-style`. See `references/ci-migration.md` Step 3.                                                                                                                               |
| A CI workflow silently never runs after switching to a reusable workflow             | The `uses:` reference (org/repo/path/ref) is wrong — GitHub doesn't report this as a failure, the workflow just never appears in the Actions tab. See `references/ci-migration.md`.                                                                            |
