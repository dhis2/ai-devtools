# Migrating a DHIS2 App from `@dhis2/cli-style` to Shared Configs

This is the step-by-step recipe for moving an existing DHIS2 app off `@dhis2/cli-style`
(the `d2-style` CLI) and onto the shared `@dhis2/config-*` packages (`config-eslint`,
`config-prettier`, `config-stylelint`, `config-lslint`, `config-commitlint`) with plain
`eslint`/`prettier`/`stylelint`/`ls-lint` and native `husky`/`lint-staged`. This is
independent of the pnpm migration (`references/pnpm-migration.md`) — an app can do either,
both, or neither. If doing both, order doesn't matter; do whichever the user asked for.

`d2-style` makes every tool opt-in (via a `tools:` block in its config) — most apps only
ever configured eslint + prettier, some also configured stylelint or ls-lint. **Only migrate
the tools the app actually has configured** (Step 1 tells you which). Don't add a stylelint
or ls-lint setup to an app that never had one.

Reference migrations: [`dhis2/route-manager-app#35`](https://github.com/dhis2/route-manager-app/pull/35)
and [`dhis2/app-runtime#1434`](https://github.com/dhis2/app-runtime/pull/1434) — both cover
only the eslint/prettier/commit-hook piece. `@dhis2/config-stylelint` and
`@dhis2/config-lslint` are newer additions to `style-configs` with no reference PR yet;
follow this doc directly for those. Fresh apps scaffolded via `pnpm create @dhis2/app`
already use the eslint/prettier/commitlint setup by default — this migration brings an
older app in line with what new apps already look like.

All five `@dhis2/config-*` packages are still in prerelease, published under the `alpha`
dist-tag (`npm view @dhis2/config-eslint dist-tags` shows the full set — they version in
lockstep from the same `style-configs` repo). Use the `alpha` tag for all of them until
they're promoted to `latest`; check dist-tags again if any install unexpectedly 404s.

---

## Step 1: Pre-flight checks

Confirm before making any changes — this determines which of Steps 3-6 actually apply:

- `@dhis2/cli-style` is in `package.json` (`dependencies` or `devDependencies`).
- `.eslintrc.js` and/or `.prettierrc.js` exist and `require('@dhis2/cli-style')` internally
  (that's the tell — `d2-style` configs are always proxied through that package, never
  self-contained). Almost every app has these.
- `.stylelintrc.js` exists and `require('@dhis2/cli-style')` internally (same proxy
  pattern — `module.exports = { extends: [require('@dhis2/cli-style').config.stylelint] }`
  or similar). Only some apps configure this.
- `.ls-lint.yml` exists in the project root. Unlike the others, this one is a **plain
  copied file with no reference to `cli-style`** — `ls-lint` has no `extends` mechanism, so
  its presence alone is the tell, not a `require()`.
- Note whether the app has `.hooks/pre-commit` + `.hooks/commit-msg` (the older
  `cli-app-scripts`-generated husky wrapper) or `.husky/pre-commit` already — this
  determines whether Steps 7-8 are a hook-manager migration or just a script swap.
- Check what `.hooks/commit-msg` (or `.husky/commit-msg`) actually does — delegates to a CI
  job, calls `d2-style check commit` directly, or something else — Step 8 branches on this.
- **`stylelint` and `@ls-lint/ls-lint` are NOT in the app's own `package.json`, even if the
  app uses them.** `cli-style` bundles both tools itself and runs its own copies — the app
  only ever had the config file, never the binary as a direct dependency. Both need adding
  as real devDependencies in Steps 5-6, not just their shared config package.

## Step 2: Add the shared config packages

Add the packages for whichever tools Step 1 found configured. **Don't remove
`@dhis2/cli-style` yet** — leave it installed until Step 7, once every config it was
proxying has a working replacement. Removing it up front just means every intermediate step
runs against a broken lint setup for no benefit.

```bash
npm view @dhis2/config-eslint dist-tags   # confirms the alpha tag + current version for all five
```

```json
"devDependencies": {
    "@dhis2/config-eslint": "alpha",
    "@dhis2/config-prettier": "alpha",
    "@eslint/compat": "^2.0.0",
    "eslint": "^9",
    "prettier": "^3",
    "husky": "^9.1.7",
    "lint-staged": "^16"
}
```

Add these two conditionally, only if Step 1 found them configured:

```json
"devDependencies": {
    "@dhis2/config-stylelint": "alpha",
    "stylelint": "^16",
    "@dhis2/config-lslint": "alpha",
    "@ls-lint/ls-lint": "^2"
}
```

`@dhis2/config-eslint` requires `eslint >= 9`; `@dhis2/config-prettier` requires
`prettier >= 3.0.0`; `@dhis2/config-stylelint` requires `stylelint >= 11 < 18` (it bundles
its own `postcss-styled-jsx`/`postcss-syntax`/`stylelint-use-logical` transitively — don't
add those to the app directly); `@dhis2/config-lslint` requires `@ls-lint/ls-lint >= 2`
(`cli-style` bundled `1.x` — the YAML rule format is unaffected by this major bump, but
re-run `ls-lint` after Step 6 to confirm).

## Step 3: Replace the ESLint config

Delete `.eslintrc.js` (the old config proxies through `@dhis2/cli-style`'s `config.eslintReact`
or similar — it won't work once that package is gone). Add a flat config instead:

```javascript
// eslint.config.mjs
import config from '@dhis2/config-eslint'
import { defineConfig } from 'eslint/config'
import { includeIgnoreFile } from '@eslint/compat'
import { fileURLToPath } from 'node:url'

const gitignorePath = fileURLToPath(new URL('.gitignore', import.meta.url))

export default defineConfig([
    includeIgnoreFile(gitignorePath, 'Imported .gitignore patterns'),
    {
        extends: [config],
    },
])
```

`@dhis2/config-eslint` (the base export) already covers standard React apps — that's what a
fresh `pnpm create @dhis2/app` scaffold uses. If the app needs stricter rules or is a
library rather than an app (e.g. exhaustive-deps as an error, tighter `no-unused-vars`),
import `@dhis2/config-eslint/react` instead and layer overrides — see
[`app-runtime#1434`](https://github.com/dhis2/app-runtime/pull/1434)'s `eslint.config.mjs`
for an example, but don't reach for this unless the base config genuinely isn't enough.

## Step 4: Replace the Prettier config

Delete `.prettierrc.js`, add:

```javascript
// .prettierrc.mjs
import prettierConfig from '@dhis2/config-prettier'

/**
 * @type {import("prettier").Config}
 */
const config = {
    ...prettierConfig,
}

export default config
```

## Step 5: Replace the Stylelint config (skip if the app doesn't use stylelint)

Delete `.stylelintrc.js`, add:

```javascript
// .stylelintrc.mjs
import config from '@dhis2/config-stylelint'

export default config
```

`stylelint` needs `type: "module"` in `package.json` (or a `.cjs`/`.mjs` extension it can
resolve) to load an ESM config — check that's already true from the eslint/prettier flat
configs; if not, add it. `@dhis2/config-stylelint`'s rules match `cli-style`'s bundled
config exactly (the logical-properties warnings, the styled-jsx custom syntax override for
`.jsx`/`.tsx` files) — expect no new violations here, unlike eslint/prettier.

## Step 6: Replace the ls-lint config (skip if the app doesn't use ls-lint)

There's no `extends` to wire up — `@dhis2/config-lslint` ships a canonical `.ls-lint.yml` to
copy in, not something you import:

```bash
cp node_modules/@dhis2/config-lslint/src/ls-lint.yml .ls-lint.yml
```

If the app's existing `.ls-lint.yml` has project-specific overrides beyond the base ruleset
(check with `git diff` against a fresh copy before overwriting), keep those — layer them
back in rather than losing them.

## Step 7: Update `package.json` scripts

Replace the `d2-style`-based scripts:

```diff
- "lint": "d2-style check",
- "lint:staged": "d2-style check --staged",
- "format": "d2-style apply",
- "format:staged": "d2-style apply --staged"
+ "lint": "eslint && prettier -c .",
+ "format": "prettier . -w",
+ "prepare": "husky"
```

If the app also runs a type-check as part of lint (common — `"lint": "yarn tsc && d2-style check"`),
keep that prefix: `"lint": "tsc --noEmit && eslint && prettier -c ."`. If Step 5/6 applied,
extend the `lint` script rather than leaving stylelint/ls-lint unchecked:
`"lint": "eslint && prettier -c . && stylelint '**/*.{css,js,jsx,ts,tsx}' && ls-lint"`. Drop
the `:staged` variants entirely — `lint-staged` (Step 8) replaces that mechanism.

## Step 8: Migrate git hooks to native husky + lint-staged

Add a `lint-staged` block to `package.json`, including stylelint if Step 5 applied
(ls-lint has no per-file mode, so it isn't a `lint-staged` candidate — it stays in the
plain `lint` script from Step 7 and runs against the whole tree):

```json
"lint-staged": {
    "*": ["yarn prettier . --write", "yarn lint"]
}
```

If the app has the older `.hooks/pre-commit` + `.hooks/commit-msg` (manually sourcing
`husky.sh`, generated by older `cli-app-scripts` templates), replace them with native husky
v9+ hooks:

```bash
rm -rf .hooks
mkdir -p .husky
echo 'yarn lint-staged' > .husky/pre-commit
```

`.hooks/commit-msg` is handled separately in Step 9 — don't delete it here.

## Step 9: Replace commit-msg linting with `@dhis2/config-commitlint`

**If `.hooks/commit-msg` (or `.husky/commit-msg`) just delegates to a CI job** (e.g. the repo
also has `lint-commits: uses: dhis2/workflows-platform/.github/workflows/lint-commits.yml@v1`)
and doesn't run its own linter, it's fine to drop the local hook entirely — CI still catches
bad commit messages, just later.

**If it calls `d2-style check commit` directly** (`d2-style`'s own commit-message linter,
distinct from any CI job), that check disappears once `cli-style` is gone and needs a real
replacement, not just deletion — otherwise commit messages go unchecked locally even though
the local hook was providing faster, pre-push feedback than CI. Use the shared
`@dhis2/config-commitlint` package instead of hand-rolling a `@commitlint/config-conventional`
setup:

```bash
npm view @dhis2/config-commitlint@alpha version   # check current alpha version
npm view @commitlint/cli version
```

```json
"devDependencies": {
    "@commitlint/cli": "^21.2.2",
    "@dhis2/config-commitlint": "alpha"
}
```

```javascript
// commitlint.config.mjs
import config from '@dhis2/config-commitlint'

export default config
```

```bash
echo 'npx --no -- commitlint --edit "$1"' > .husky/commit-msg
```

`@dhis2/config-commitlint` already extends `@commitlint/config-conventional` with the same
`header-max-length`/`body-max-line-length`/`[skip release]`/`[skip ci]` rules `d2-style`'s
bundled commitlint config used — don't add `@commitlint/config-conventional` as a direct
dependency or re-declare those rules locally, the shared config covers it.

## Step 10: Remove `@dhis2/cli-style`

Now that every config it was proxying (Steps 3-6, whichever applied) has a real
replacement, confirm nothing still references it before removing it:

```bash
grep -rn "require('@dhis2/cli-style')\|from '@dhis2/cli-style'" --include='*.js' --include='*.mjs' .
grep -n "d2-style" package.json
```

Both should come back empty (aside from the `.hooks/` files already deleted in Step 8, if
applicable). Then remove it from `package.json` entirely — don't leave it listed but unused
(the real `route-manager-app#35` migration missed this; it's worth doing properly here
rather than repeating that oversight).

## Step 11: Update CI

If `.github/workflows/*.yml` uses a separate reusable `lint` job
(`uses: dhis2/workflows-platform/.github/workflows/lint.yml@v1`) — that reusable workflow
is built around `d2-style` and won't work once it's gone. Fold linting into the existing
test job instead, the same way `route-manager-app#35` did:

```diff
  jobs:
      lint-commits:
          uses: dhis2/workflows-platform/.github/workflows/lint-commits.yml@v1
-     lint:
-         uses: dhis2/workflows-platform/.github/workflows/lint.yml@v1
-     test:
+     lint-and-test:
          runs-on: ubuntu-latest
          steps:
              - uses: actions/checkout@v2
              - run: yarn install --frozen-lockfile
              - run: yarn build
+             - run: yarn lint
              - run: yarn test --coverage
```

The inline `yarn lint`/`pnpm lint` step should be whatever Step 7 landed on — if stylelint
or ls-lint got folded into that script, CI picks them up automatically; don't add separate
CI steps for them.

**`lint-commits` is not unrelated to `cli-style` the way it looks.** Despite the name
suggesting it only checks commit message format, `dhis2/workflows-platform`'s
`lint-commits.yml` (and `lint-pr-title.yml`, if present) resolves its commitlint config via
`require('@dhis2/cli-style').config.commitlint)` — it breaks with "Cannot find module
'@dhis2/cli-style'" once this migration removes it (Step 10). Check whether the
`pnpm-no-cli-style` branch exists yet (`gh api repos/dhis2/workflows-platform/branches --jq '.[].name'`)
and point at that instead of `@v1`/`@pnpm` if so; otherwise replace it with a custom step
using `@dhis2/config-commitlint` (Step 9) instead of leaving it pointed at the reusable
workflow. See `references/ci-migration.md` Step 3 for the full writeup and the exact
replacement YAML — this doc's job is just to flag it here since Step 10 is what triggers it.

## Step 12: Bump `@dhis2/ui`, `@dhis2/app-runtime`, and `@dhis2/d2-i18n`

While touching the app's style/UI tooling, also bring these three platform libraries up to
date — a low-risk win that's easy to bundle into the same PR. Check each one independently;
they don't necessarily move majors at the same time:

```bash
node -e "
const p = require('./package.json')
for (const n of ['@dhis2/ui', '@dhis2/app-runtime', '@dhis2/d2-i18n'])
    console.log(n, p.dependencies?.[n] ?? p.devDependencies?.[n] ?? '(not present)')
"
npm view @dhis2/ui dist-tags
npm view @dhis2/app-runtime dist-tags
npm view @dhis2/d2-i18n dist-tags
```

For each library that's present, compare its current major against `latest`'s major:

- **Same major → just bump to `latest`.** This is the common case and needs no further
  decision — update `package.json` (keep whatever range style — `^`, `~`, exact — the app
  already uses) and move on.
- **Different major → this is a breaking bump, don't take it silently.** Ask the user which
  they want:
    - **Latest non-breaking** (the safer default if you can't ask — e.g. running
      unattended): stay within the app's current major.
        ```bash
        npm view @dhis2/ui@<current-major> version   # e.g. npm view @dhis2/ui@9 version
        ```
    - **Latest overall**: take the major bump. This needs real verification, not just an
      install — expect to fix actual breaking changes, not just lint noise. Check that
      library's changelog/migration guide for the specific major(s) being crossed before
      starting, and budget real time for it; don't bundle this silently into what's
      otherwise a low-risk PR.
      If you can't ask (no interactive user available) and choose the non-breaking default,
      say so explicitly in the summary — don't just skip the library without mentioning that a
      newer major exists.

Whichever path for whichever library, finish with:

```bash
pnpm install
pnpm lint      # tsc/eslint will flag any prop, export, or i18n API that actually changed
```

If a same-major bump breaks anything, that's a signal the release wasn't as non-breaking as
its version number implied — check that library's changelog for the affected
component/export before working around it, don't just silence the error. If a cross-major
bump breaks something, that's expected — fix it for real using the migration guide, don't
revert to avoid the work unless the user explicitly wants to defer it.

## Step 13: Verify

```bash
pnpm install
pnpm lint
pnpm format
```

The shared configs aren't a byte-for-byte match for `@dhis2/cli-style`'s rule set — expect
some new violations to fix, mostly formatting (`prettier . -w` handles most of it
automatically) and occasionally a rule that's now an error where it used to be a warning (or
vice versa). Fix real issues; don't disable rules just to make the diff smaller.

## Troubleshooting

| Symptom                                                                         | Fix                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint` errors "Cannot find config @dhis2/config-eslint"                       | It wasn't installed, or `.eslintrc.js` (old-style config) still exists alongside the new flat `eslint.config.mjs` and ESLint is confused about which to use — delete the old one.                                                                                                                                                         |
| A rule the app relied on is missing after switching                             | Check if `@dhis2/config-eslint/react` (not the base export) covers it before adding a manual override — see Step 3.                                                                                                                                                                                                                       |
| `prettier -c .` fails on `pnpm-lock.yaml` or another generated file             | Add it to `.prettierignore` — lockfiles and build output shouldn't be formatted.                                                                                                                                                                                                                                                          |
| `stylelint` errors "Cannot find module 'stylelint-use-logical'"                 | A dual-package-hazard/phantom-dependency issue, not a missing install — confirm you're consuming a real published/packed install of `@dhis2/config-stylelint`, not a `pnpm link:`'d local checkout; a real install resolves its bundled plugin correctly.                                                                                 |
| `ls-lint` reports violations that weren't there before                          | `@dhis2/config-lslint`'s ruleset isn't guaranteed identical to the app's old customized `.ls-lint.yml` — see the note in Step 6 about preserving project-specific overrides.                                                                                                                                                              |
| CI still fails after removing the reusable `lint.yml@v1` job                    | Confirm the new inline `yarn lint`/`pnpm lint` step was actually added to the remaining job — it's easy to drop the job without replacing the step.                                                                                                                                                                                       |
| `npm view @dhis2/config-commitlint@alpha` (or any `@dhis2/config-*@alpha`) 404s | The `style-configs` prerelease hasn't published yet, or `alpha` has since been promoted to `latest` — check `npm view @dhis2/config-commitlint dist-tags` and use whichever tag/version actually resolves.                                                                                                                                |
| `@dhis2/ui`/`app-runtime`/`d2-i18n` bump surfaces new TypeScript/ESLint errors  | If it was a same-major bump, the release wasn't purely non-breaking for a prop/export the app uses — check that library's changelog entry rather than suppressing the error, and consider pinning back a version if it's a real regression. If it was a deliberate cross-major bump, this is expected — fix it using the migration guide. |
