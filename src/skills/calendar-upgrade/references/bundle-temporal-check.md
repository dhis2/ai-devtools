# Checking which Temporal copies end up in the build

After bumping `@dhis2/multi-calendar-dates` (`references/multi-calendar-dates-bump.md`) or a direct
`@js-temporal/polyfill` (`references/temporal-polyfill-upgrade.md`), check what the **production build** contains. The only Temporal implementation in
the bundle should be the copy that `multi-calendar-dates` `3.x` vendors
(`@dhis2/multi-calendar-dates/build/es/vendor/temporal`, which already has the Ethiopic era
fix), plus `@js-temporal/polyfill@0.5.1` only if the app imports the polyfill itself.
`3.x` lists `@js-temporal/polyfill` as a dependency but doesn't import it at runtime.

The lockfile alone doesn't answer this. It often has more copies than the bundle does: for
example, `@dhis2/analytics` still depends on `multi-calendar-dates` `1.x` with
`@js-temporal/polyfill@0.4.3`, but if the app only imports components that don't use
calendars (such as `OrgUnitDimension`), that code is tree-shaken out of the build.

1. **List the copies in the lockfile**, and flag in the summary if there's more than one
   version of either package:

    ```bash
    yarn why @js-temporal/polyfill        # or: pnpm why @js-temporal/polyfill
    yarn why @dhis2/multi-calendar-dates
    ```

2. **Build, then list the `multi-calendar-dates` and `@js-temporal/polyfill` copies in the
   bundle**, from the source maps the platform build writes next to the bundles in
   `build/app`. Run this from the app's root after the build:

    ```bash
    node -e '
    const fs = require("fs")
    const path = require("path")
    const maps = []
    const walk = (dir) =>
        fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
            const p = path.join(dir, e.name)
            if (e.isDirectory()) walk(p)
            else if (p.endsWith(".js.map")) maps.push(p)
        })
    walk("build/app")
    const copies = {}
    for (const map of maps) {
        for (const source of JSON.parse(fs.readFileSync(map, "utf8")).sources) {
            const match = source.match(
                /node_modules\/(?:.*\/)?(?:@js-temporal\/polyfill|@dhis2\/multi-calendar-dates)(?=\/)/
            )
            if (match && !copies[match[0]]) {
                const { version } = require(path.resolve(match[0], "package.json"))
                copies[match[0]] = version
            }
        }
    }
    console.log(maps.length ? copies : "no source maps found in build/app")
    '
    ```

    **Expected:** only `multi-calendar-dates` `3.x` entries (its Temporal is the vendored
    copy, which these source maps show under `build/es/vendor/temporal`), and no
    `@js-temporal/polyfill` entry, unless the app imports the polyfill itself, in
    which case it must be `0.5.1`. **Flag anything else.** Look at versions, not paths: an old
    copy can be hoisted to the top-level `node_modules/@js-temporal/polyfill` even though only
    a nested package uses it. For example, maps-app (which uses analytics' period selectors)
    bundles:

    ```text
    { 'node_modules/@dhis2/multi-calendar-dates': '3.2.0',
      'node_modules/@js-temporal/polyfill': '0.4.3',
      'node_modules/@dhis2/analytics/node_modules/@dhis2/multi-calendar-dates': '1.3.2' }
    ```

    Here analytics' period selectors run on `multi-calendar-dates` `1.3.2` with the `0.4.3`
    polyfill, which has no Ethiopic era fix (and adds to the bundle's size). climate-app,
    which only imports `OrgUnitDimension` from analytics, bundles just
    `{ 'node_modules/@dhis2/multi-calendar-dates': '3.2.0' }`, although its lockfile has the
    same extra copies.

3. **If there are extra copies, try to get the bundle down to `0.5.1` only:**
    - First bump whatever pulls the old copy in, using `yarn why`/`pnpm why`: `@dhis2/ui`
      `10.19.3`+ (older versions bring `multi-calendar-dates` `2.x`), the app shell (the
      `@dhis2/cli-app-scripts`/app-platform release that has `@dhis2/ui` `10.19.3`+), or
      `@dhis2/analytics` once it's on `multi-calendar-dates` `3.x`.
    - If that's not possible, force the remaining copies to `0.5.1` with `resolutions` (yarn 1)
      or `pnpm.overrides` (pnpm): `"@js-temporal/polyfill": "0.5.1"`. Those packages weren't
      released against `0.5.1`, so before keeping the override, snapshot-test the app code that
      goes through them (the same approach as the other two references, with `gregory`, `ethiopian` and `nepali`).
      This is the only case where a `resolutions` pin is right here: `references/temporal-polyfill-upgrade.md` declares `0.5.1` as
      a direct dependency instead, because there the app imports it itself.
    - **If Ethiopic matters for the app** (it's used on Ethiopian-calendar instances, and the
      code that goes through the forced copy handles server-calendar dates, such as analytics'
      period selectors), also apply the `0.5.1` Ethiopic era patch from `references/temporal-polyfill-upgrade.md`. Unpatched,
      `0.5.1` still throws `Era am … was not matched by any era` on CLDR 48 runtimes. Say in the
      summary that the patch was applied, and offer to revert it, as there.
    - If neither works (e.g. the old copy is pinned exactly and overriding it breaks the
      snapshot tests), leave it and report it in the summary and the PR description, naming
      which package brings it in.

4. **Re-run the build and the source-map check**, and put the result in the PR description:
   which copies the lockfile has, which ones the bundle has, and why any extra one is still
   there.
