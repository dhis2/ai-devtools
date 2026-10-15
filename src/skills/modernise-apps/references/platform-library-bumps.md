# Bumping DHIS2 Platform Libraries

This is the recipe for updating an app's `@dhis2/ui`, `@dhis2/app-runtime`, `@dhis2/d2-i18n`,
and `@dhis2/multi-calendar-dates` dependencies. This is independent of the pnpm, style-configs,
and CI migrations (`references/pnpm-migration.md`, `references/style-configs-migration.md`,
`references/ci-migration.md`) — an app can need any combination, in any order.

---

## Step 1: Bump `@dhis2/ui`, `@dhis2/app-runtime`, and `@dhis2/d2-i18n`

Check each one independently; they don't necessarily move majors at the same time:

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

## Step 2: Bump `@dhis2/multi-calendar-dates` (skip if the app doesn't use it)

Check for `@dhis2/multi-calendar-dates` in `package.json`. Its `3.x` line is now `latest`.
Target **`3.2.0` or later**, which has the date helpers this step migrates the app onto (see
"Replace hand-rolled calendar date code with the library's helpers" below). Confirm the
current version:

```bash
npm view @dhis2/multi-calendar-dates dist-tags
```

This is a real breaking change, not a routine bump, regardless of which dist-tag it ships
under — [`dhis2/multi-calendar-dates#102`](https://github.com/dhis2/multi-calendar-dates/pull/102)
removed Temporal types from the public API entirely. Specifically, **`getNowInCalendar` now
returns a plain `{ year, month, day, eraYear?, hour, minute, second }` object instead of a
`Temporal.ZonedDateTime`**, with the time of day in the `timezone` it's given.
`convertFromIso8601`/`convertToIso8601` return the same plain `{ year, month, day, eraYear? }`
shape. Grep for `getNowInCalendar` (the app may wrap it, like
`aggregate-data-entry-app`'s `getNowInCalendarString` does) and check every call site for:

- **Calling a Temporal method on the result** (`.add()`, `.withCalendar()`, `.startOfDay()`,
  etc.) — these don't exist on the plain object anymore, and the call throws. Don't rebuild
  the arithmetic by hand: use `addToCalendarDate` (see the helpers section below).
- **Building a date-time string by hand** from `.hour`/`.minute`/`.second` — use
  `formatCalendarDate(now, { includeTime: true })` instead (see the helpers section below).
- **Reading `.year` for an Ethiopic date** — `year` is the Amete Alem year (e.g. `7516`);
  the year DHIS2 shows is `eraYear` (`2016`). Islamic has no `eraYear`. Always read
  `eraYear ?? year` (`formatCalendarDate` does this for you), never
  `calendar === 'ethiopian' ? eraYear : year`, which misses the `ethiopic` id.
- Plain reads of `.month`/`.day`/`.eraYear` need no changes — that part of the shape is
  unchanged.

### Write a before/after regression test for direct library usage

Don't just eyeball the call sites above — this is a real behavioral change that can silently
produce wrong output (not a compile error, not a thrown exception), so pin down the exact
current output with a test, confirm it passes against the version installed _right now_
(before bumping), then bump and re-run the identical test unmodified. If it still passes,
behavior is provably unchanged; if it fails, you've caught a real regression before it ships,
not after.

**Test every direct import from `@dhis2/multi-calendar-dates` itself, including
`useDatePicker` — the exclusion is `@dhis2/ui`'s own bundled `Calendar`/`DatePicker`
components, not this library's own hook.** It's easy to conflate the two, but they're not
the same thing:

- **In scope** — anything the app imports directly from `@dhis2/multi-calendar-dates`:
  `getNowInCalendar`, `convertFromIso8601`, `convertToIso8601`, the period-calculation
  helpers (`getFixedPeriodByDate`, `getAdjacentFixedPeriods`, `generateFixedPeriods`,
  `createFixedPeriodFromPeriodId`), `useDatePicker`, or a wrapper the app built on any of
  these. **`#102` touched the period-calculation internals extensively** (daily/monthly/
  weekly/yearly period generation, adjacent-period lookup, period-from-id construction) and
  rewrote `useDatePicker` to use the new plain-date shape — these are not lower-risk than
  `getNowInCalendar` just because they weren't named in the PR's headline breaking-change
  note.
- **Out of scope** — `@dhis2/ui`'s `Calendar`/`DatePicker` React components. Those bundle
  their _own_ internal `multi-calendar-dates` dependency (a separate resolved version this
  app doesn't control — see the Troubleshooting entry on this), have their own test coverage
  upstream, and testing them here wouldn't exercise the version this app is actually bumping.

Cover at least these three calendars for **every** function/hook under test above — they're
the most behaviorally distinct: `gregory` (the default, CLDR-backed), `ethiopian`
(CLDR-backed but uses `eraYear` instead of `year`), and `nepali` (the one calendar this
library implements itself rather than delegating to CLDR — per `#102`'s own description,
this is the part that got rewritten most substantially, so it's the highest-risk case for a
subtle regression, and it's exactly the kind of calendar a period-calculation helper or
`useDatePicker` could be driving just as easily as `getNowInCalendar`).

#### If `ethiopian` fails before you've bumped anything (Node 24 / CLDR 48)

On newer Node (anything after 20.19 — e.g. Node 24, which ships CLDR 48), the `ethiopian`
calendar can throw `RangeError: Era am (ISO year 2016) was not matched by any era` against
the **currently-installed** `2.x` — so the baseline can't be captured at all. This is an
unrelated upstream bug, not something the bump caused: CLDR 48 changed the Ethiopic era codes
`Intl` reports (to `am`/`aa`), and the `@js-temporal/polyfill@0.4.3` that `2.x` depends on
doesn't recognise them
([`js-temporal/temporal-polyfill#357`](https://github.com/js-temporal/temporal-polyfill/pull/357)).
**`3.x` doesn't have this problem** — it vendors the polyfill's calendar code with the era fix
applied — so this only blocks the _before_ run. Confirm the cause first:

```bash
# resolves the polyfill copy multi-calendar-dates actually uses (it isn't a direct app dependency)
node -p "const {Temporal}=require(require.resolve('@js-temporal/polyfill',{paths:[require.resolve('@dhis2/multi-calendar-dates')]})); Temporal.PlainDate.from('2024-06-15').withCalendar('ethiopic').eraYear"
```

To capture the baseline, temporarily patch `@js-temporal/polyfill@0.4.3` (confirm the version
with `pnpm why`/`yarn why @js-temporal/polyfill`). **This patch is a local baseline aid only.
Never commit it, and revert it once the baseline is captured.** It doesn't fix `2.x`, and
nothing here should. Edit **both** `dist/index.cjs` (what jest loads) and `dist/index.esm.js`
(what bundlers load). #357's diff doesn't apply to `0.4.x` as-is (eras here are named
`era0`/`era1`, with no alias list), so add a `reviseIntlEra` to `EthiopicHelper` that maps the
new codes onto them, right after its constructor. The built code is minified, so search for
this exact string:

```diff
 super("ethiopic",[{name:"era0",isoEpoch:{year:-5492,month:7,day:17}},{name:"era1",isoEpoch:{year:8,month:8,day:27},anchorEpoch:{year:5501}}])}
+reviseIntlEra(e){let{era:t,eraYear:r}=e;return"am"===t&&(t="era1"),"aa"===t&&(t="era0"),{era:t,eraYear:r}}
```

- **yarn 1:** edit the files in `node_modules/@js-temporal/polyfill/dist/` directly. No
  `patch-package` is needed, and the next `yarn install` undoes it.
- **pnpm:** don't edit `node_modules` in place. Its files are hard-linked to the global
  store, so the edit would leak into every other project. Use `pnpm patch
@js-temporal/polyfill@0.4.3`, edit the files in the directory it prints, then
  `pnpm patch-commit <dir>`. To revert, delete the `patches/` file and the
  `patchedDependencies` entry, then reinstall.

Re-run the one-liner above. It should print `2016`. Capture the baseline snapshots with the
patch in place, then **revert the patch before committing** the tests and snapshots. With the
patch gone, the `ethiopian` cases fail on `2.x` until the bump lands. That's expected, since
the next commit is the bump. `3.x` vendors the fix, so it needs no patch.
**Exception:** if the app also imports `@js-temporal/polyfill` itself, it needs a lasting
`0.5.1` patch after the upgrade. See Step 3.

**If the app already has a test runner** (jest/vitest — check for an existing
`*.test.ts`/`*.test.js` alongside the file that calls these functions, or a
`jest.config.js`/`vitest.config.ts`), add real, committed **snapshot tests**, following
whatever conventions already exist there. Use `toMatchSnapshot()` rather than hand-writing
expected values — the snapshot taken against the currently-installed version _is_ the
baseline, so there's no guessing or copy-pasting of "before" values, and it captures the full
output shape (every field of a period object, every cell of a date-picker grid) rather than
only the fields you thought to assert on. Pin "now" for date-dependent functions like
`getNowInCalendar` (e.g. `jest.useFakeTimers()` + `jest.setSystemTime()`), otherwise the
snapshot changes daily:

```javascript
// Testing a wrapper around getNowInCalendar directly -- not through a UI component
beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-06-15T10:30:00Z'))
})
afterAll(() => jest.useRealTimers())

describe.each(['gregory', 'ethiopian', 'nepali'])('%s calendar', (calendar) => {
    it('returns the expected date', () => {
        expect(getNowInCalendarString({ calendar })).toMatchSnapshot()
    })

    it('finds the expected adjacent period', () => {
        const period = getFixedPeriodByDate({
            periodType: 'Monthly',
            date: '2024-06-15',
            calendar,
        })
        const [next] = getAdjacentFixedPeriods({ period, calendar, steps: 1 })
        expect(next).toMatchSnapshot()
    })
})
```

If the app uses `useDatePicker` directly (check for `import { useDatePicker } from
'@dhis2/multi-calendar-dates'`), test it the same way via `@testing-library/react`'s
`renderHook` — it's a headless hook, no `@dhis2/ui` component needed to exercise it:

```javascript
import { renderHook } from '@testing-library/react'
import { useDatePicker } from '@dhis2/multi-calendar-dates'

describe.each(['gregory', 'ethiopian', 'nepali'])('%s calendar', (calendar) => {
    it('builds the expected calendar grid', () => {
        // pin the system time first, same as above -- isToday/isInCurrentMonth depend on it
        const { result } = renderHook(() =>
            useDatePicker({
                date: /* fixed date string */,
                options: { calendar },
                onDateSelect: () => {},
            })
        )
        expect(result.current.calendarWeekDays).toMatchSnapshot()
    })
})
```

**Snapshot what the app actually consumes, not raw `getNowInCalendar` return values.**
`getNowInCalendar`'s return type changes by design in `3.x` (Temporal object → plain object),
so a snapshot of the raw value is guaranteed to differ and tells you nothing. Snapshot the
app's own wrapper output (like `getNowInCalendarString` above) or the fields the app reads —
that's where a real regression would show up.

The workflow:

1. **Before bumping**, run the tests against the currently-installed version. The first run
   writes the `__snapshots__/*.snap` files — open them and sanity-check the values look
   right (it's a baseline, not proof of correctness). Commit the tests and snapshots on their
   own, before the bump, so the bump's diff is cleanly separate.
2. **Bump**, reinstall, and run the identical tests again, unmodified, with `--ci`
   (`pnpm test --ci`, or `jest --ci`) — in CI mode jest fails on a mismatch, and on a missing
   snapshot, instead of silently writing a new one.
3. **If a snapshot fails, don't update it (`-u`) to make it pass** — the diff _is_ the
   finding. Investigate each changed value: either it's a real regression to fix in the app
   code, or it's an expected change (confirm against `#102`/the changelog) and only then
   update that one snapshot deliberately, saying why in the commit message.

Keep the tests and snapshots in the codebase afterward — they're real regression coverage
for this library going forward, not a throwaway migration check. (Vitest supports the same
`toMatchSnapshot()` API, and fails on mismatch when run under `CI=true`.)

**If there's no test runner set up at all**, don't introduce one just for this — that's a
bigger decision than a dependency bump warrants. Instead, do the same before/after
comparison as a temporary standalone script (same idea as this skill's
`pnpm-migration.md` Step 11 smoke-test, but here it's plain Node, no Playwright/browser
needed):

```javascript
// verify-multi-calendar-dates.mjs -- run once before bumping, once after; diff the two outputs
import {
    getNowInCalendar,
    convertFromIso8601,
    convertToIso8601,
    getFixedPeriodByDate,
    getAdjacentFixedPeriods,
} from '@dhis2/multi-calendar-dates'

const CALENDARS = ['gregory', 'ethiopian', 'nepali']
const FIXED_ISO_DATE = '2024-06-15' // any date currently exercised by the app's real usage

for (const calendar of CALENDARS) {
    const period = getFixedPeriodByDate({
        periodType: 'Monthly',
        date: FIXED_ISO_DATE,
        calendar,
    })
    console.log(calendar, {
        now: getNowInCalendar(calendar, 'Etc/UTC'),
        fromIso: convertFromIso8601(FIXED_ISO_DATE, calendar),
        toIso: convertToIso8601(FIXED_ISO_DATE, calendar),
        period,
        adjacentPeriods: getAdjacentFixedPeriods({
            period,
            calendar,
            steps: 1,
        }),
        // add whichever other functions/period types this app actually calls directly
    })
}
```

Redirect the output to a file before bumping (`node verify-multi-calendar-dates.mjs >
/tmp/before.json`), bump the dependency, run it again (`> /tmp/after.json`), and `diff
/tmp/before.json /tmp/after.json`. Anything beyond `getNowInCalendar`'s return shape
(expected — already covered above) is a real behavioral difference to investigate before
shipping. Delete the script afterward — it's a verification aid for this migration,
not something to leave behind in the app's repo.

**`useDatePicker` doesn't fit this plain-Node script** — it's a React hook, not a pure
function, so exercising it needs at least `@testing-library/react`'s `renderHook`. If the
app uses `useDatePicker` directly but has no test runner at all, that's a real gap worth
raising with the user rather than silently skipping it — a plain-object diff script can't
cover it, only a real (even minimal, temporary) React test can.

Bump the dependency to whatever version `npm view ... dist-tags` showed above resolves
`latest` to (`3.2.0` as of this writing, and at least `3.2.0`) and verify:

```json
"dependencies": {
    "@dhis2/multi-calendar-dates": "^3.2.0"
}
```

Also check that the lockfile ends up with a single `3.x` copy: older `@dhis2/ui` versions
(before `10.19.3`) bring their own `multi-calendar-dates`. Bump `@dhis2/ui` alongside if
needed, and deduplicate (`npx yarn-deduplicate --packages
@dhis2/multi-calendar-dates --packages @dhis2/ui yarn.lock` on yarn 1). A nested `1.x` copy
under `@dhis2/analytics` is expected and can't be removed from the app.

```bash
pnpm install
pnpm lint
pnpm test
```

Since this is a real behavioral change (not just a type change), a passing `tsc`/`eslint`
pass doesn't guarantee correctness here on its own — a wrong result (e.g. Nepali month arithmetic
done in ISO terms, or the wrong Ethiopic year) compiles and runs fine, it just silently
produces wrong output. The
before/after regression test (or standalone script) above is what actually closes that gap;
don't skip it and rely on `tsc`/`eslint`/a generic `pnpm test` pass alone as proof this is
safe.

### Replace hand-rolled calendar date code with the library's helpers (`3.2.0`+)

The library has three helpers that cover what DHIS2 apps have historically written for
themselves. **Every instance of the patterns below should be migrated to the library**,
and the app's own helper deleted — not kept alongside, and not re-implemented when fixing a
`3.x` breakage (e.g. a `getNowInCalendar(calendar).add(...)` call that now throws):

| Helper                                                       | What it does                                                                                                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getDaysInMonth({ year, month }, calendar)`                  | Days in a month: 29 for February 2024, 5 or 6 for the Ethiopic 13th month, up to 32 for Nepali                                                                                                     |
| `addToCalendarDate(date, { years, months, days }, calendar)` | Adds (or, with negative values, subtracts) years and months in the calendar's own months, clamps the day to the end of the month, then adds days. Returns a plain `{ year, month, day, eraYear? }` |
| `formatCalendarDate(date, { format, includeTime })`          | `yyyy-MM-dd` (or `format: 'DD-MM-YYYY'`), with `includeTime: true` appending `Thh:mm:ss` from `getNowInCalendar`'s result (it throws if the date has no time)                                      |

All three read the year as `eraYear ?? year`, so `getNowInCalendar`/`convertFromIso8601`
results can be passed straight in. They accept DHIS2 calendar ids (`ethiopian`, `iso8601`,
`gregorian`, …) as well as Intl ids, and throw for a date that doesn't exist (e.g. month 13 in
a 12-month calendar) or a Nepali year outside 1970–2100.

**Find the patterns to migrate** — grep `src` around every `@dhis2/multi-calendar-dates`
import, including the app's own date utils (`date.js`, `time.js`, `dates.js`, `date-utils.js`
are common names):

```bash
grep -rnE "eraYear|padStart|padWithZero|THIRTEEN_MONTH|monthsInYear|daysInMonth|validateDateString|\.add\(" src
```

| Hand-rolled pattern                                                                                                                                                         | Replace with                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Building `yyyy-MM-dd`/`DD-MM-YYYY` from a calendar date with `padStart`/`padWithZeros` and `eraYear ?? year` (or `calendar === 'ethiopian' ? eraYear : year`)               | `formatCalendarDate(date)` / `formatCalendarDate(date, { format: 'DD-MM-YYYY' })`          |
| The same, plus `T${hour}:${minute}:${second}` from `getNowInCalendar`                                                                                                       | `formatCalendarDate(now, { includeTime: true })`                                           |
| Padding the result of `convertToIso8601`/`convertFromIso8601` into a string                                                                                                 | `formatCalendarDate(convertToIso8601(...))`                                                |
| Adding/subtracting months or years with a `THIRTEEN_MONTH_CALENDARS`-style list, `year * monthsInYear + month` index maths, or a `validateDateString` loop to clamp the day | `addToCalendarDate(date, { months }, calendar)`                                            |
| Adding days by converting to ISO, using `Date`/milliseconds, and converting back                                                                                            | `addToCalendarDate(date, { days }, calendar)` (keep any time part of the string as it was) |
| "One year ago" as `year - 1` with no clamping (breaks on 29 February and Ethiopic Pagume)                                                                                   | `addToCalendarDate(now, { years: -1 }, calendar)`                                          |
| Days in a month via native `Date` (`new Date(y, m, 0)`), a `validateDateString` loop from 32 down, or an app copy of the Nepali month table                                 | `getDaysInMonth({ year, month }, calendar)`                                                |
| `getNowInCalendar(calendar).add(period)` (throws on `3.x`)                                                                                                                  | `formatCalendarDate(addToCalendarDate(getNowInCalendar(calendar), period, calendar))`      |

What the library does **not** cover, so keep the app's own code for it: months in a year (no
helper — keep a 13-month calendar list if the app needs one), the `julian` calendar (not
supported; apps that map it to `gregory` need their own 29 February rule for century years),
and formatting Temporal objects the app creates itself with a direct `@js-temporal/polyfill`
import (Step 3's scope, not this one).

How to migrate:

1. Do it in its **own commit after the bump**, so the bump's snapshot diff stays separate from
   the refactor's. The regression snapshots from above should come through **unchanged**. Any
   snapshot that does change must be explained in the commit message — typically one of:
    - the `ethiopic` id now gives the era year (the old code only special-cased
      `ethiopian`) — a fix;
    - a nonexistent date (month 13 in a 12-month calendar) now throws instead of returning a
      made-up value — check that no caller can pass one;
    - Nepali month arithmetic keeps the day of the month instead of drifting by 1–5 days
      (it was done in ISO terms) — a fix.
2. Delete the app's helpers, constants and tests that are no longer used anywhere
   (`grep -rn <name> src` before deleting an export). Keep shared utilities such as a
   `padWithZeroes` that other, unrelated code still imports.
3. If a test mocks `@dhis2/multi-calendar-dates` with `jest.mock`, forward the new functions
   lazily inside the factory (`getDaysInMonth: (...args) =>
jest.requireActual('@dhis2/multi-calendar-dates').getDaysInMonth(...args)`); spreading
   `jest.requireActual` at the top of the factory can fail.
4. Re-enable tests the app had skipped or commented out because `2.x` threw for Ethiopic
   dates, and run them — they usually pass on `3.2.0`.

Examples from real migrations: climate-app's `getCalendarDate` (a `THIRTEEN_MONTH_CALENDARS`
list, `addMonths`, `addDays` and a local `formatCalendarDate`) became one
`formatCalendarDate(addToCalendarDate(getNowInCalendar(calendar), { years, months, days },
calendar))`; aggregate-data-entry-app's `stringifyDate` became `formatCalendarDate(now,
{ includeTime: long })`; maps-app's `getMaxDaysInMonth` became a `getDaysInMonth` call.

## Step 3: Upgrade direct `@js-temporal/polyfill` usage to `0.5.1` (skip if the app doesn't import it)

`@dhis2/multi-calendar-dates@3.x` and `@dhis2/ui@10.19+` both ask for
`@js-temporal/polyfill@0.5.1`. Apps that import the polyfill themselves often pin it to
`0.4.3`, either as a direct dependency or (more commonly, on yarn 1) as a `resolutions`
entry. A pinned resolution silently forces every library onto the old version too. On yarn,
it shows up as `warning Resolution field "@js-temporal/polyfill@0.4.3" is incompatible with
requested version "@js-temporal/polyfill@0.5.1"`.

### Find every direct usage

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

### Write snapshot tests for every usage _before_ upgrading

Same approach as Step 2: committed `toMatchSnapshot()` tests, captured on `0.4.3`, then re-run
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

#### The Ethiopic era patch (applied by default, revertable)

On newer Node / browsers with CLDR 48 (Node 24, and Node builds using system ICU 78), `Intl`
reports Ethiopic eras as `am`/`aa`. Neither `0.4.3` nor `0.5.1` recognises those codes, so
**any** Ethiopic date throws `RangeError: Era am (ISO year …) was not matched by any era`
([`js-temporal/temporal-polyfill#357`](https://github.com/js-temporal/temporal-polyfill/pull/357)).
Unlike Step 2, the app calls the polyfill directly here, so this isn't just a baseline problem:
it breaks the app in production for Ethiopian users. The upstream fix is tracked in
[LIBS-830](https://dhis2.atlassian.net/browse/LIBS-830).

There are two patches here, with different lifetimes:

- **`0.4.3`: temporary, never committed.** It exists only so the `ethiopian` snapshot cases
  can run before the upgrade. Apply and revert it as in Step 2.
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

**`0.4.3`** (temporary, to capture the baseline only; see Step 2 for applying and reverting
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

### The workflow

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
   snapshot. The diff is the finding (see Step 2).
5. In the summary, offer to revert the patch commit, stating its size and linking LIBS-830
   (see above).

## Step 4: Check which Temporal copies end up in the build (after Step 2 or Step 3)

After bumping `@dhis2/multi-calendar-dates` (Step 2) or a direct `@js-temporal/polyfill`
(Step 3), check what the **production build** contains. The only Temporal implementation in
the bundle should be the copy that `multi-calendar-dates` `3.x` vendors
(`@dhis2/multi-calendar-dates/build/es/vendor/temporal`, which already has the Ethiopic era
fix), plus `@js-temporal/polyfill@0.5.1` only if the app imports the polyfill itself (Step 3).
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
    `@js-temporal/polyfill` entry, unless the app imports the polyfill itself (Step 3), in
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
      goes through them (the Step 2/Step 3 approach, with `gregory`, `ethiopian` and `nepali`).
      This is the only case where a `resolutions` pin is right here: Step 3 declares `0.5.1` as
      a direct dependency instead, because there the app imports it itself.
    - **If Ethiopic matters for the app** (it's used on Ethiopian-calendar instances, and the
      code that goes through the forced copy handles server-calendar dates, such as analytics'
      period selectors), also apply the `0.5.1` Ethiopic era patch from Step 3. Unpatched,
      `0.5.1` still throws `Era am … was not matched by any era` on CLDR 48 runtimes. Say in the
      summary that the patch was applied, and offer to revert it, as in Step 3.
    - If neither works (e.g. the old copy is pinned exactly and overriding it breaks the
      snapshot tests), leave it and report it in the summary and the PR description, naming
      which package brings it in.

4. **Re-run the build and the source-map check**, and put the result in the PR description:
   which copies the lockfile has, which ones the bundle has, and why any extra one is still
   there.

## Troubleshooting

| Symptom                                                                                                                                                              | Fix                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@dhis2/ui`/`app-runtime`/`d2-i18n` bump surfaces new TypeScript/ESLint errors                                                                                       | If it was a same-major bump, the release wasn't purely non-breaking for a prop/export the app uses — check that library's changelog entry rather than suppressing the error, and consider pinning back a version if it's a real regression. If it was a deliberate cross-major bump, this is expected — fix it using the migration guide.                                                               |
| The app has its own date formatting, month/day arithmetic or days-in-month code around `multi-calendar-dates` calls                                                  | Migrate it to `formatCalendarDate`/`addToCalendarDate`/`getDaysInMonth` and delete the app's copy. See "Replace hand-rolled calendar date code with the library's helpers" in Step 2.                                                                                                                                                                                                                   |
| A regression snapshot changes when moving onto the `3.2.0` helpers                                                                                                   | Explain it before updating: the `ethiopic` id getting the era year, a nonexistent date (e.g. month 13 in a 12-month calendar) now throwing, or Nepali month arithmetic no longer drifting are expected. Anything else is a regression. See Step 2.                                                                                                                                                      |
| `RangeError: Era am (ISO year ...) was not matched by any era` on the `ethiopian` calendar while capturing the baseline                                              | Unrelated `@js-temporal/polyfill@0.4.3` bug with CLDR 48's new Ethiopic era codes on newer Node. Temporarily patch the polyfill to capture the baseline, then revert it and never commit it (`3.x` vendors the fix). See "If `ethiopian` fails before you've bumped anything" in Step 2.                                                                                                                |
| The before/after regression test fails on the `nepali` calendar specifically, but `gregory`/`ethiopian` pass                                                         | Expected to be the highest-risk case — `#102` rewrote Nepali support from scratch (it's the one calendar this library implements itself rather than delegating to CLDR). Don't assume it's a test bug; diff the actual before/after values and check the library's own changelog/tests for that release before concluding it's safe.                                                                    |
| `warning Resolution field "@js-temporal/polyfill@0.4.3" is incompatible with requested version "@js-temporal/polyfill@0.5.1"`                                        | The app pins the polyfill in `resolutions`, forcing `multi-calendar-dates`/`@dhis2/ui` onto `0.4.3`. Follow Step 3: snapshot-test direct usages, then move to `0.5.1` as a real dependency.                                                                                                                                                                                                             |
| `RangeError: Era am/aa … was not matched by any era` from app code (not just while capturing a baseline)                                                             | The app calls the polyfill directly for Ethiopic dates, and CLDR 48 era codes break it. After the upgrade, apply the `0.5.1` patch from Step 3 by default, then offer to revert it in the summary (~516 KB), noting the known issue in the PR if reverted. Don't fix it on `0.4.3`: that patch is only a temporary baseline aid. Upstream fix: [LIBS-830](https://dhis2.atlassian.net/browse/LIBS-830). |
| The Step 4 check shows an `@js-temporal/polyfill` entry other than a direct `0.5.1`, or a `multi-calendar-dates` below `3.x` (e.g. `1.3.2` under `@dhis2/analytics`) | An older `multi-calendar-dates` is bundled with its own polyfill (the polyfill may be hoisted to the top level, so check the versions, not the paths). Bump the package that brings it in; otherwise force `0.5.1` with `resolutions`/`pnpm.overrides`, snapshot-test that code, and add the Step 3 Ethiopic patch if Ethiopic matters. See Step 4.                                                     |
| No test runner is set up and it's unclear whether to add one just for this                                                                                           | Don't — that's a bigger decision than a dependency bump warrants. Use the standalone verify script instead, and delete it once the bump is confirmed safe.                                                                                                                                                                                                                                              |
| Unsure whether `useDatePicker` is in scope for this app's regression test, since the app also uses `@dhis2/ui`'s `Calendar`/`DatePicker`                             | Check the import, not the visible UI — `import { useDatePicker } from '@dhis2/multi-calendar-dates'` is in scope (direct usage of the version this app controls); `@dhis2/ui`'s bundled `Calendar`/`DatePicker` components are not (they resolve their own separate internal copy).                                                                                                                     |
