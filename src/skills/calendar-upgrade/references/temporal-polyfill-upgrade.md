# Upgrading direct `@js-temporal/polyfill` usage to `0.5.1`

`@dhis2/multi-calendar-dates@3.x` and `@dhis2/ui@10.19+` both ask for
`@js-temporal/polyfill@0.5.1`. Apps that import the polyfill themselves often pin it to
`0.4.3`, either as a direct dependency or (more commonly, on yarn 1) as a `resolutions`
entry. A pinned resolution silently forces every library onto the old version too. On yarn,
it shows up as `warning Resolution field "@js-temporal/polyfill@0.4.3" is incompatible with
requested version "@js-temporal/polyfill@0.5.1"`.

## Find every direct usage

```bash
grep -rln "@js-temporal/polyfill" src                    # every file that imports it
grep -n "js-temporal" package.json                       # dependencies? or only resolutions?
```

An app that imports the polyfill but only has it in `resolutions` is relying on yarn 1
hoisting a transitive copy. Declare it as a real dependency as part of this step.

For each importing file, list the Temporal API it calls. `0.5` removed `Temporal.Calendar`/
`Temporal.TimeZone` objects (calendars are strings only), `getISOFields()`, `getCalendar()`,
`Temporal.Now.plainDate(calendar)` (only the `…ISO()` variants remain), and the `calendar`
property (now `calendarId`). It also renamed `era` codes, e.g. Ethiopic `era0`/`era1` became
`ethioaa`/`ethiopic`, and some calendars now report `era: undefined`. Grep for those:

```bash
grep -rnE "Temporal\.(Calendar|TimeZone)|getISOFields|getCalendar|Now\.plainDate\(|\.calendar\b|\.era\b" <importing files>
```

Typical DHIS2 app usage (`PlainDate.from`/`compare`, `PlainDateTime` with `'iso8601'`,
`Now.plainDateISO().withCalendar()`, `.since({ largestUnit, smallestUnit })`, `.subtract()`,
`.with({ year })`, `.eraYear`) is unaffected. Prove it with the snapshot test below, don't
assume it.

## Write snapshot tests for every usage _before_ upgrading

Same approach as `references/multi-calendar-dates-bump.md`: committed `toMatchSnapshot()` tests, captured on `0.4.3`, then re-run
unmodified with `--ci` on `0.5.1`. Cover **every** function that calls the polyfill, through
the app's own exported helpers or components, not raw polyfill calls. Run each one against
**`gregory`, `ethiopian` (Temporal `ethiopic`) and `nepali`**. These three are the ones that
matter, so don't spend effort on the others.

- **Pin "now"** (`jest.useFakeTimers()` + `jest.setSystemTime(...)`) for anything calling
  `Temporal.Now.*`, such as an age field computing years/months/days from today. The
  polyfill reads `Date.now()`, so fake timers control it.
- **Nepali isn't a Temporal calendar.** Apps usually guard it with an `isCalendarSupported`
  check and fall back to ISO arithmetic via `multi-calendar-dates`' `convertToIso8601`/
  `convertFromIso8601`. Test that fallback path explicitly.
- **Ethiopic**: Temporal's `year` here is counted from the Amete Alem era (e.g. `7519`), and
  `eraYear` is the Amete Mihret year DHIS2 users see (e.g. `2019`). Apps work around this
  with `date.with({ year: date.eraYear })`. Both versions keep the same semantics, but
  snapshot the result anyway.
- If a helper/function is module-private (e.g. a `getCalculatedValues` inside a component
  file), export it for testing rather than snapshotting through rendered UI.

### The Ethiopic era patch (applied by default, revertable)

On newer Node / browsers with CLDR 48 (Node 24, and Node builds using system ICU 78), `Intl`
reports Ethiopic eras as `am`/`aa`. Neither `0.4.3` nor `0.5.1` recognises those codes, so
**any** Ethiopic date throws `RangeError: Era am (ISO year …) was not matched by any era`
([`js-temporal/temporal-polyfill#357`](https://github.com/js-temporal/temporal-polyfill/pull/357)).
Unlike the `multi-calendar-dates` bump, the app calls the polyfill directly here, so this isn't just a baseline problem:
it breaks the app in production for Ethiopian users. The upstream fix is tracked in
[LIBS-830](https://dhis2.atlassian.net/browse/LIBS-830).

There are two patches here, with different lifetimes:

- **`0.4.3`: temporary, never committed.** It exists only so the `ethiopian` snapshot cases
  can run before the upgrade. Apply and revert it as in `references/multi-calendar-dates-bump.md`.
- **`0.5.1`: kept, in its own commit.** This is the actual fix for the app's own Ethiopic
  dates after the upgrade. It's only needed because the app imports the polyfill itself.
  Apps that only go through `multi-calendar-dates` 3.x need no patch.

**Apply the `0.5.1` patch by default, then offer to revert it in the summary.** The patch is
big. The polyfill ships its `dist` files minified onto a single line, so
`patch-package`/`pnpm patch` store the whole line, not just the change. The patch file is
**~516 KB**, even though the actual edit is a few characters. Some teams won't want that in
their repo, so:

- **Default: patch.** Keep the `0.5.1` patch and the `ethiopian` snapshot cases in their own
  commit, separate from the upgrade, so they can be dropped cleanly. Remove the patch once
  LIBS-830 lands upstream.
- **In the final summary, always offer the revert**, stating the patch size and linking
  LIBS-830. For example: "The Ethiopic patch adds a ~516 KB file to `patches/` because the
  polyfill's dist is minified onto one line. If you'd rather not carry it, I can drop that
  commit and wait for the upstream fix (LIBS-830)."
- **If the user chooses to revert:** drop that commit (or move it to its own branch if they
  want to keep it around), and leave `ethiopian` out of the polyfill snapshot tests, since it
  throws on CLDR 48 runtimes either way. Then record the known issue in the PR description.
  Explain that both `0.4.3` and `0.5.1` are affected, link #357 and LIBS-830, and say which
  app code calls the polyfill directly for Ethiopic dates (e.g. an age field).
  `multi-calendar-dates@3.x` bundles its own copy of the fix, so conversions through it are
  unaffected and its own Ethiopian tests still pass.

Patch **both** `dist/index.cjs` (jest) and `dist/index.esm.js` (bundlers). The built code is
minified, so search for the exact strings below.

**`0.4.3`** (temporary, to capture the baseline only; see `references/multi-calendar-dates-bump.md` for applying and reverting
it): eras are named `era0`/`era1` with no alias list, so add a `reviseIntlEra` right after
`EthiopicHelper`'s constructor:

```diff
 super("ethiopic",[{name:"era0",isoEpoch:{year:-5492,month:7,day:17}},{name:"era1",isoEpoch:{year:8,month:8,day:27},anchorEpoch:{year:5501}}])}
+reviseIntlEra(e){let{era:t,eraYear:r}=e;return"am"===t&&(t="era1"),"aa"===t&&(t="era0"),{era:t,eraYear:r}}
```

**`0.5.1`** (keep this one after the upgrade, until LIBS-830 is fixed upstream): eras have `code` + `names` alias lists, so
#357's fix applies directly. Add `"aa"` and `"am"` as aliases:

```diff
-super("ethiopic",[{code:"ethioaa",names:["ethiopic-amete-alem","mundi"],isoEpoch:{year:-5492,month:7,day:17}},{code:"ethiopic",names:["incar"],isoEpoch:{year:8,month:8,day:27},anchorEpoch:{year:5501}}])}
+super("ethiopic",[{code:"ethioaa",names:["ethiopic-amete-alem","mundi","aa"],isoEpoch:{year:-5492,month:7,day:17}},{code:"ethiopic",names:["incar","am"],isoEpoch:{year:8,month:8,day:27},anchorEpoch:{year:5501}}])}
```

Apply the `0.5.1` patch with `pnpm patch @js-temporal/polyfill@0.5.1` → edit →
`pnpm patch-commit <dir>` on pnpm. On yarn 1, edit `node_modules/@js-temporal/polyfill/dist/*`
and run `npx patch-package @js-temporal/polyfill`, which needs `patch-package` in
`postinstall`. Verify with the following, which should print `2016` once patched (on either
version):

```bash
node -p "require('@js-temporal/polyfill').Temporal.PlainDate.from('2024-06-15').withCalendar('ethiopic').eraYear"
```

## The workflow

1. Temporarily apply the `0.4.3` patch so the `ethiopian` cases can run, write the snapshot
   tests, and run them to create the snapshots. Sanity-check the `.snap` values
   (Ethiopic/Nepali dates should look like real local dates). Revert the patch, then commit
   the tests and snapshots on their own. **Never commit the `0.4.3` patch.**
2. Upgrade: remove the `0.4.3` `resolutions`/`pnpm.overrides` pin, add
   `"@js-temporal/polyfill": "0.5.1"` to `dependencies`, reinstall, and confirm a single copy
   resolves (`yarn why`/`pnpm why @js-temporal/polyfill`). Commit the upgrade without any
   patch.
3. Add the `0.5.1` patch in its own commit.
4. Re-run the identical tests with `--ci`, plus `tsc` and lint. Don't `-u` a failing
   snapshot. The diff is the finding (see `references/multi-calendar-dates-bump.md`).
5. In the summary, offer to revert the patch commit, stating its size and linking LIBS-830
   (see above).
