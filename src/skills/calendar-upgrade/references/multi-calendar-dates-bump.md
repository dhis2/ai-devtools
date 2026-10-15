# Bumping `@dhis2/multi-calendar-dates` to `3.2.0`+

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

## Write a before/after regression test for direct library usage

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
  app doesn't control — see the Troubleshooting entry on this in `SKILL.md`), have their own test coverage
  upstream, and testing them here wouldn't exercise the version this app is actually bumping.

Cover at least these three calendars for **every** function/hook under test above — they're
the most behaviorally distinct: `gregory` (the default, CLDR-backed), `ethiopian`
(CLDR-backed but uses `eraYear` instead of `year`), and `nepali` (the one calendar this
library implements itself rather than delegating to CLDR — per `#102`'s own description,
this is the part that got rewritten most substantially, so it's the highest-risk case for a
subtle regression, and it's exactly the kind of calendar a period-calculation helper or
`useDatePicker` could be driving just as easily as `getNowInCalendar`).

### If `ethiopian` fails before you've bumped anything (Node 24 / CLDR 48)

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
`0.5.1` patch after the upgrade. See `references/temporal-polyfill-upgrade.md`.

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
comparison as a temporary standalone script (plain Node, no browser needed):

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

## Bump the dependency

Bump the dependency to whatever version `npm view ... dist-tags` showed above resolves
`latest` to (`3.2.0` as of this writing, and at least `3.2.0`) and verify:

```json
"dependencies": {
    "@dhis2/multi-calendar-dates": "^3.2.0"
}
```

Also check that the lockfile ends up with a single `3.x` copy: older `@dhis2/ui` versions
(before `10.19.3`) bring their own `multi-calendar-dates`. Bump `@dhis2/ui` alongside if
needed (see "First: check `@dhis2/ui`" in `SKILL.md`), and deduplicate (`npx yarn-deduplicate --packages
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

## Replace hand-rolled calendar date code with the library's helpers (`3.2.0`+)

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
import (`references/temporal-polyfill-upgrade.md`'s scope, not this one).

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
