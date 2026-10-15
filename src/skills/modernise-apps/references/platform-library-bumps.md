# Bumping DHIS2 Platform Libraries

This is the recipe for updating an app's `@dhis2/ui`, `@dhis2/app-runtime`, and `@dhis2/d2-i18n`
dependencies. This is independent of the pnpm, style-configs,
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

## Calendar libraries: `@dhis2/multi-calendar-dates` and `@js-temporal/polyfill`

Not part of this skill. If the app depends on `@dhis2/multi-calendar-dates` or imports
`@js-temporal/polyfill` directly, upgrading them is a separate, behavioural migration
(`multi-calendar-dates` `3.x` is a real breaking change) — use the
`multi-calendar-dates-upgrade` skill for it. It needs `@dhis2/ui` `10.19.3`+ to end up with a
single `multi-calendar-dates` `3.x` and `@js-temporal/polyfill@0.5.1`, so if this step bumped
`@dhis2/ui` past that, mention in the summary that the calendar upgrade is now unblocked.

## Troubleshooting

| Symptom                                                                        | Fix                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@dhis2/ui`/`app-runtime`/`d2-i18n` bump surfaces new TypeScript/ESLint errors | If it was a same-major bump, the release wasn't purely non-breaking for a prop/export the app uses — check that library's changelog entry rather than suppressing the error, and consider pinning back a version if it's a real regression. If it was a deliberate cross-major bump, this is expected — fix it using the migration guide. |
