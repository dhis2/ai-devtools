---
name: calendar-upgrade
description: >
    Guide for upgrading an existing DHIS2 app to @dhis2/multi-calendar-dates 3.x (3.2.0+) and
    @js-temporal/polyfill 0.5.1. Use this skill whenever the user wants to bump or update
    @dhis2/multi-calendar-dates or @js-temporal/polyfill, fix code broken by
    multi-calendar-dates 3.x (getNowInCalendar or convertFromIso8601/convertToIso8601 no longer
    returning Temporal objects), replace an app's own calendar date formatting/arithmetic with
    multi-calendar-dates' formatCalendarDate, addToCalendarDate or getDaysInMonth helpers,
    remove an @js-temporal/polyfill 0.4.3 resolutions pin, fix "Era am ... was not matched by
    any era" errors for Ethiopian dates, or check which Temporal copies end up in an app's
    bundle. For general tooling modernisation (pnpm, lint configs, CI, @dhis2/ui/app-runtime
    bumps), use the modernise-apps skill instead.
---

# Upgrading DHIS2 Calendar Libraries

You are helping a developer move an existing DHIS2 app onto `@dhis2/multi-calendar-dates`
`3.x` (target `3.2.0`+) and, where the app imports it directly, `@js-temporal/polyfill`
`0.5.1`. Unlike a routine dependency bump, this is a **behavioural migration**:
[`dhis2/multi-calendar-dates#102`](https://github.com/dhis2/multi-calendar-dates/pull/102)
removed Temporal types from the library's public API, so wrong results compile and run fine.
Every step is guarded by regression snapshots captured _before_ the change.

It covers four tasks, in this order — an app may need only some of them:

1. **Bump `@dhis2/multi-calendar-dates` to `3.2.0`+**, with a before/after regression test
   covering every direct import from the library.
2. **Migrate the app's own calendar date code onto the library's helpers**
   (`formatCalendarDate`, `addToCalendarDate`, `getDaysInMonth`), deleting the app's copies.
3. **Upgrade direct `@js-temporal/polyfill` usage from `0.4.3` to `0.5.1`**, and patch
   `0.5.1`'s Ethiopic era handling (applied by default, offered for revert).
4. **Check which Temporal copies end up in the production build**, and reduce them to the
   library's vendored copy plus `0.5.1`.

Nothing here fixes `multi-calendar-dates` `2.x` or the polyfill's `0.4.3`. Patching those is
only a temporary, uncommitted step to capture a test baseline before bumping.

## First: check `@dhis2/ui`

`@dhis2/ui` versions before `10.19.3` bring their own `multi-calendar-dates` `2.x` (and the
`0.4.3` polyfill), so the app can't end up with a single `3.x`/`0.5.1` copy until `@dhis2/ui`
is at least `10.19.3` — directly, or through the app shell (`@dhis2/cli-app-scripts`). Check:

```bash
node -p "require('./package.json').dependencies?.['@dhis2/ui']"
npm view @dhis2/ui@10 version
```

- **Already `10.19.3`+**: nothing to do.
- **On `10.x` below `10.19.3`**: bump `@dhis2/ui` to the latest `10.x` first, in its own
  commit. It's a same-major bump, so it should be safe; run `lint`/`test` after it. If the
  `modernise-apps` skill is installed, follow its platform library bump step
  (`references/platform-library-bumps.md`, Step 1).
- **On `9.x` or older**: that's a breaking upgrade of its own. Don't fold it into this
  migration — ask the user whether to do it first as a separate task, or to go ahead without
  it and accept the extra copies (reported in the summary, see
  `references/bundle-temporal-check.md`).

## Which tasks apply?

| Check                                                                                                                 | How                                                                    | Result                                                          |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| `@dhis2/multi-calendar-dates` is in `package.json` and below `3.2.0`                                                  | Read `package.json` + `npm view @dhis2/multi-calendar-dates dist-tags` | **Library behind** — `references/multi-calendar-dates-bump.md`  |
| `src` formats calendar dates (`eraYear`, `padStart`) or does month/day arithmetic around `multi-calendar-dates` calls | See the grep in `references/multi-calendar-dates-bump.md`              | **Hand-rolled date code** — migrate it to the `3.2.0` helpers   |
| `src` imports `@js-temporal/polyfill` and it's pinned below `0.5.1` (deps or `resolutions`)                           | `grep -rln "@js-temporal/polyfill" src` + read `package.json`          | **Polyfill behind** — `references/temporal-polyfill-upgrade.md` |
| Any of the above was done                                                                                             | —                                                                      | **Check the bundle** — `references/bundle-temporal-check.md`    |
| None of the packages is used                                                                                          | —                                                                      | **Nothing to do** — this skill doesn't apply                    |

## What does the user need?

| Scenario                                                                                      | References (read in order)                                                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Bump `@dhis2/multi-calendar-dates` to the latest version                                      | `references/multi-calendar-dates-bump.md`, then `references/bundle-temporal-check.md` |
| Replace the app's own calendar date formatting/arithmetic with `multi-calendar-dates` helpers | `references/multi-calendar-dates-bump.md` ("Replace hand-rolled calendar date code")  |
| Upgrade direct `@js-temporal/polyfill` usage from `0.4.3` to `0.5.1`                          | `references/temporal-polyfill-upgrade.md`, then `references/bundle-temporal-check.md` |
| Check which Temporal copies end up in the build, and reduce them to `0.5.1`                   | `references/bundle-temporal-check.md`                                                 |

## Rules

- **`@dhis2/multi-calendar-dates`'s `3.x` is a real breaking change — don't treat it like a
  routine bump.** `getNowInCalendar` no longer returns anything Temporal-shaped (calling
  `.add()` etc. on it throws). Target `3.2.0`+.
- **Migrate hand-rolled calendar date code to the library's helpers — don't re-implement it.**
  Every place the app formats a calendar date (`eraYear ?? year` + padding), adds months/
  years/days to one (13-month calendar lists, ISO round-trips, `validateDateString` clamping
  loops) or works out days in a month should use `formatCalendarDate`, `addToCalendarDate` or
  `getDaysInMonth` from `3.2.0`, and the app's own helper should be deleted. Do it in its own
  commit after the bump; the regression snapshots should stay unchanged, and any change must
  be explained. See `references/multi-calendar-dates-bump.md`.
- **Before bumping `@dhis2/multi-calendar-dates`, write a before/after regression test
  covering every direct import from the library** — `getNowInCalendar`, the
  period-calculation helpers (`getFixedPeriodByDate`, `getAdjacentFixedPeriods`, etc. —
  `#102` rewrote these too, not just `getNowInCalendar`), and `useDatePicker` if the app
  uses it directly. The exclusion is `@dhis2/ui`'s own bundled `Calendar`/`DatePicker`
  components (a separate internal copy this app doesn't control), not this library's own
  hook — check the import, not the visible UI. Cover `gregory`, `ethiopian`, and `nepali`
  for each; run the test against the currently-installed version first to confirm it's a
  real baseline, then bump and re-run it unmodified. Add it as a real committed test if the
  app has a test runner; otherwise use a temporary standalone script (a headless-hook test
  via `renderHook` for `useDatePicker` if used) and delete it once confirmed safe. Don't rely
  on a `lint`/generic `test` pass alone as proof this is safe. See
  `references/multi-calendar-dates-bump.md`.
- **Before upgrading a direct `@js-temporal/polyfill` dependency to `0.5.1`, snapshot-test
  every function in the app that calls it**, against `gregory`, `ethiopian` and `nepali`
  (those three matter, the rest don't), with "now" pinned. Capture the snapshots on `0.4.3`
  first, then re-run them unmodified with `--ci` on `0.5.1`. Declare `0.5.1` as a real
  dependency rather than a `resolutions` pin. On CLDR 48 runtimes, Ethiopic throws in **both**
  versions ([LIBS-830](https://dhis2.atlassian.net/browse/LIBS-830)). Patch `0.4.3` only
  temporarily, to capture the baseline, and **never commit that patch**. **Apply the `0.5.1`
  patch by default**, in its own commit. In the summary, **offer to revert it**: say that the patch
  file is ~516 KB because the dist is minified onto one line, and that the alternative is to
  wait for the upstream fix. If reverted, leave `ethiopian` out of these tests and note the
  known issue in the PR description. See `references/temporal-polyfill-upgrade.md`.
- **After bumping `@dhis2/multi-calendar-dates` or `@js-temporal/polyfill`, check the
  production build's source maps for Temporal copies.** The only one should be
  `multi-calendar-dates`' vendored copy (plus a direct `@js-temporal/polyfill@0.5.1` if the
  app imports it). Flag multiple versions in the lockfile, and any extra copy in the bundle.
  Try to get the bundle down to `0.5.1` only: bump the package that brings the old copy in,
  or else force `0.5.1` with `resolutions`/`pnpm.overrides` after snapshot-testing that code,
  plus the Ethiopic patch if Ethiopic matters for the app. See
  `references/bundle-temporal-check.md`.

## Troubleshooting

| Symptom                                                                                                                                                                                             | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The app has its own date formatting, month/day arithmetic or days-in-month code around `multi-calendar-dates` calls                                                                                 | Migrate it to `formatCalendarDate`/`addToCalendarDate`/`getDaysInMonth` and delete the app's copy. See "Replace hand-rolled calendar date code with the library's helpers" in `references/multi-calendar-dates-bump.md`.                                                                                                                                                                                                                   |
| A regression snapshot changes when moving onto the `3.2.0` helpers                                                                                                                                  | Explain it before updating: the `ethiopic` id getting the era year, a nonexistent date (e.g. month 13 in a 12-month calendar) now throwing, or Nepali month arithmetic no longer drifting are expected. Anything else is a regression. See `references/multi-calendar-dates-bump.md`.                                                                                                                                                      |
| `RangeError: Era am (ISO year ...) was not matched by any era` on the `ethiopian` calendar while capturing the baseline                                                                             | Unrelated `@js-temporal/polyfill@0.4.3` bug with CLDR 48's new Ethiopic era codes on newer Node. Temporarily patch the polyfill to capture the baseline, then revert it and never commit it (`3.x` vendors the fix). See "If `ethiopian` fails before you've bumped anything" in `references/multi-calendar-dates-bump.md`.                                                                                                                |
| The before/after regression test fails on the `nepali` calendar specifically, but `gregory`/`ethiopian` pass                                                                                        | Expected to be the highest-risk case — `#102` rewrote Nepali support from scratch (it's the one calendar this library implements itself rather than delegating to CLDR). Don't assume it's a test bug; diff the actual before/after values and check the library's own changelog/tests for that release before concluding it's safe.                                                                                                       |
| `warning Resolution field "@js-temporal/polyfill@0.4.3" is incompatible with requested version "@js-temporal/polyfill@0.5.1"`                                                                       | The app pins the polyfill in `resolutions`, forcing `multi-calendar-dates`/`@dhis2/ui` onto `0.4.3`. Follow `references/temporal-polyfill-upgrade.md`: snapshot-test direct usages, then move to `0.5.1` as a real dependency.                                                                                                                                                                                                             |
| `RangeError: Era am/aa … was not matched by any era` from app code (not just while capturing a baseline)                                                                                            | The app calls the polyfill directly for Ethiopic dates, and CLDR 48 era codes break it. After the upgrade, apply the `0.5.1` patch from `references/temporal-polyfill-upgrade.md` by default, then offer to revert it in the summary (~516 KB), noting the known issue in the PR if reverted. Don't fix it on `0.4.3`: that patch is only a temporary baseline aid. Upstream fix: [LIBS-830](https://dhis2.atlassian.net/browse/LIBS-830). |
| The `references/bundle-temporal-check.md` check shows an `@js-temporal/polyfill` entry other than a direct `0.5.1`, or a `multi-calendar-dates` below `3.x` (e.g. `1.3.2` under `@dhis2/analytics`) | An older `multi-calendar-dates` is bundled with its own polyfill (the polyfill may be hoisted to the top level, so check the versions, not the paths). Bump the package that brings it in; otherwise force `0.5.1` with `resolutions`/`pnpm.overrides`, snapshot-test that code, and add the Ethiopic patch from `references/temporal-polyfill-upgrade.md` if Ethiopic matters. See `references/bundle-temporal-check.md`.                 |
| No test runner is set up and it's unclear whether to add one just for this                                                                                                                          | Don't — that's a bigger decision than a dependency bump warrants. Use the standalone verify script instead, and delete it once the bump is confirmed safe.                                                                                                                                                                                                                                                                                 |
| Unsure whether `useDatePicker` is in scope for this app's regression test, since the app also uses `@dhis2/ui`'s `Calendar`/`DatePicker`                                                            | Check the import, not the visible UI — `import { useDatePicker } from '@dhis2/multi-calendar-dates'` is in scope (direct usage of the version this app controls); `@dhis2/ui`'s bundled `Calendar`/`DatePicker` components are not (they resolve their own separate internal copy).                                                                                                                                                        |
