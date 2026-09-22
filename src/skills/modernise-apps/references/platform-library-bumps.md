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

Check for `@dhis2/multi-calendar-dates` in `package.json`. Its `3.x` line (`3.0.0`) is now
`latest` — confirm the current version either way:

```bash
npm view @dhis2/multi-calendar-dates dist-tags
```

This is a real breaking change, not a routine bump, regardless of which dist-tag it ships
under — [`dhis2/multi-calendar-dates#102`](https://github.com/dhis2/multi-calendar-dates/pull/102)
removed Temporal types from the public API entirely. Specifically, **`getNowInCalendar` now
returns a plain `{ year, month, day, eraYear? }` object instead of a `Temporal.ZonedDateTime`
— and unlike before, that object carries no time-of-day information at all**, not just a
different date type. Grep for `getNowInCalendar` (the app may wrap it, like
`aggregate-data-entry-app`'s `getNowInCalendarString` does) and check every call site for:

- **Calling a Temporal method on the result** (`.withCalendar()`, `.startOfDay()`, etc.) —
  these don't exist on the plain object anymore. Re-derive what's needed via
  `getNowInCalendar`/`convertFromIso8601` again instead.
- **Reading `.hour`/`.minute`/`.second`/timezone-derived fields off the result** — these are
  silently `undefined` now (not an error, so this won't fail loudly — check output
  correctness, not just that it runs). If time-of-day is genuinely needed alongside the
  calendar date, get it separately — but **don't reach for a plain `new Date()`** if the
  original code accepted a `timezone` parameter (as `getNowInCalendar` itself still does):
  `new Date()` only gives the browser's own local time, silently dropping timezone-correction
  behavior the old Temporal-based code had. Use `Intl.DateTimeFormat` with `timeZone` instead,
  which needs no extra dependency:
    ```javascript
    const getTimeOfDayInTimezone = (timezone) => {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hourCycle: 'h23',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        }).formatToParts(new Date())
        const get = (type) => parts.find((p) => p.type === type)?.value
        return {
            hour: get('hour'),
            minute: get('minute'),
            second: get('second'),
        }
    }
    ```
- Plain reads of `.year`/`.month`/`.day`/`.eraYear` need no changes — that part of the shape
  is unchanged.

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

**If the app already has a test runner** (jest/vitest — check for an existing
`*.test.ts`/`*.test.js` alongside the file that calls these functions, or a
`jest.config.js`/`vitest.config.ts`), add real, committed tests, following whatever
conventions already exist there (e.g. `jest.useFakeTimers()` + `jest.setSystemTime()` to pin
"now" for date-dependent functions like `getNowInCalendar`, since its output changes daily
otherwise):

```javascript
// Testing a wrapper around getNowInCalendar directly -- not through a UI component
describe.each(['gregory', 'ethiopian', 'nepali'])('%s calendar', (calendar) => {
    it('returns the expected date', () => {
        // pin the system time first -- see jest.useFakeTimers() above
        expect(getNowInCalendarString({ calendar })).toBe(/* value captured before bumping */)
    })

    it('finds the expected adjacent period', () => {
        const period = getFixedPeriodByDate({ periodType: 'Monthly', date: /* fixed date */, calendar })
        const [next] = getAdjacentFixedPeriods({ period, calendar, steps: 1 })
        expect(next).toEqual(/* value captured before bumping */)
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
        expect(result.current.calendarWeekDays).toEqual(/* value captured before bumping */)
    })
})
```

Run this test _before_ bumping the dependency to confirm it passes against the
currently-installed version — that's what makes it a real baseline, not a guess. Then bump,
reinstall, and run the identical test again, unmodified. Keep it in the codebase
afterward — it's real regression coverage for this library going forward, not a throwaway
migration check.

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
/tmp/before.json /tmp/after.json`. Anything beyond `getNowInCalendar`'s missing time-of-day
fields (expected — already covered above) is a real behavioral difference to investigate
before shipping. Delete the script afterward — it's a verification aid for this migration,
not something to leave behind in the app's repo.

**`useDatePicker` doesn't fit this plain-Node script** — it's a React hook, not a pure
function, so exercising it needs at least `@testing-library/react`'s `renderHook`. If the
app uses `useDatePicker` directly but has no test runner at all, that's a real gap worth
raising with the user rather than silently skipping it — a plain-object diff script can't
cover it, only a real (even minimal, temporary) React test can.

Bump the dependency to whatever version `npm view ... dist-tags` showed above resolves
`latest` to (`3.0.0` as of this writing) and verify:

```json
"dependencies": {
    "@dhis2/multi-calendar-dates": "^3.0.0"
}
```

```bash
pnpm install
pnpm lint
pnpm test
```

Since this is a real behavioral change (not just a type change), a passing `tsc`/`eslint`
pass doesn't guarantee correctness here on its own — the broken case above (missing
time-of-day fields) compiles and runs fine, it just silently produces wrong output. The
before/after regression test (or standalone script) above is what actually closes that gap;
don't skip it and rely on `tsc`/`eslint`/a generic `pnpm test` pass alone as proof this is
safe.

## Troubleshooting

| Symptom                                                                                                                                       | Fix                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@dhis2/ui`/`app-runtime`/`d2-i18n` bump surfaces new TypeScript/ESLint errors                                                                | If it was a same-major bump, the release wasn't purely non-breaking for a prop/export the app uses — check that library's changelog entry rather than suppressing the error, and consider pinning back a version if it's a real regression. If it was a deliberate cross-major bump, this is expected — fix it using the migration guide. |
| A date/time string looks subtly wrong after bumping `@dhis2/multi-calendar-dates` (e.g. `T undefined:undefined:undefined`) but nothing errors | A `getNowInCalendar` call site is reading `.hour`/`.minute`/`.second` off the new plain object, which no longer has them — see Step 2. This won't throw, so check output values, not just exit codes.                                                                                                                                     |
| A timezone-corrected time string is wrong (e.g. off by the timezone offset) after re-deriving time-of-day                                     | The fix used `new Date()` (browser/system local time) instead of an `Intl.DateTimeFormat`-based lookup for the specific `timezone` the call site was passed — see the code sample in Step 2.                                                                                                                                              |
| The before/after regression test fails on the `nepali` calendar specifically, but `gregory`/`ethiopian` pass                                  | Expected to be the highest-risk case — `#102` rewrote Nepali support from scratch (it's the one calendar this library implements itself rather than delegating to CLDR). Don't assume it's a test bug; diff the actual before/after values and check the library's own changelog/tests for that release before concluding it's safe.      |
| No test runner is set up and it's unclear whether to add one just for this                                                                    | Don't — that's a bigger decision than a dependency bump warrants. Use the standalone verify script instead, and delete it once the bump is confirmed safe.                                                                                                                                                                                |
| Unsure whether `useDatePicker` is in scope for this app's regression test, since the app also uses `@dhis2/ui`'s `Calendar`/`DatePicker`      | Check the import, not the visible UI — `import { useDatePicker } from '@dhis2/multi-calendar-dates'` is in scope (direct usage of the version this app controls); `@dhis2/ui`'s bundled `Calendar`/`DatePicker` components are not (they resolve their own separate internal copy).                                                       |
