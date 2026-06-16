---
name: dhis2-apps
description: >
    Guide for building DHIS2 custom applications using the DHIS2 App Platform.
    Use this skill whenever the user wants to create, scaffold, or bootstrap a DHIS2 app,
    run or start a DHIS2 app, build for production or deploy,
    fetch data from the DHIS2 API, work with aggregate data, tracker data, metadata, or analytics,
    write mutations, or handle version differences across DHIS2 instances.
    Also use it when the user mentions DHIS2, d2, dhis2 app platform, or any DHIS2-specific
    terminology — even if they don't explicitly say "DHIS2 app."
allowed-tools:
    - Bash(npx opensrc *)
---

# DHIS2 Application Development

You are helping a developer build a custom DHIS2 web application. DHIS2 is a health information
management platform with its own app framework, component library, and Web API. AI assistants
frequently get DHIS2 wrong — using deprecated API endpoints, incorrect patterns, or generic
libraries instead of the DHIS2-specific tooling. This skill exists to prevent that.

## First: determine where you are

Before doing anything, figure out whether you're in an existing DHIS2 project or starting fresh.

| Check                                 | How                     | Result                                               |
| ------------------------------------- | ----------------------- | ---------------------------------------------------- |
| `d2.config.js` exists in project root | Glob for `d2.config.js` | **Existing project** — skip scaffolding              |
| `@dhis2/app-runtime` in package.json  | Read `package.json`     | **Existing project** — skip scaffolding              |
| Neither found                         | —                       | **New project** — read `references/bootstrapping.md` |

If it's an existing project, read `d2.config.js` and `package.json` to understand what's
already configured before making changes.

## What does the user need?

Read the references that match the user's task. Most real tasks combine data and UI —
read all that apply. When both are needed, read `data-fetching.md` first so you understand
the API shape before building the UI.

| Scenario                                                                   | References (read in order)                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Create or scaffold a new DHIS2 app                                         | `references/bootstrapping.md`                                                                               |
| Run, start, or deploy a DHIS2 app                                          | `references/running-your-app.md`                                                                            |
| Fetch or mutate data without building UI (hooks, scripts, bulk operations) | `references/data-fetching.md`                                                                               |
| Build a page that displays data (list, table, detail view)                 | `references/data-fetching.md` → `references/ui-patterns.md`                                                 |
| Build a form to create or edit a resource                                  | `references/data-fetching.md` → `references/ui-patterns.md`                                                 |
| Add navigation, page layout, or sidebar                                    | `references/routing.md` → `references/ui-patterns/sidebar.md`                                               |
| Build a dashboard or detail page with widgets                              | `references/data-fetching.md` → `references/ui-patterns/widget.md` → `references/ui-patterns/dashboards.md` |
| Creating user interfaces                                                   | `references/ui-patterns.md`                                                                                 |
| Handle API differences across DHIS2 versions                               | `references/data-fetching.md` (§ Step 5: Handle version differences with feature flags)                     |
| Type API responses with DHIS2 types                                        | `references/types.md`                                                                                       |
| Write tests for hooks or components                                        | `references/testing.md`                                                                                     |
| Check user authorities or gate UI by permission                            | `references/access-control.md`                                                                              |
| Store app config or user settings in DataStore                             | `references/security.md`                                                                                    |
| Call an external service or integrate a third-party API                    | `references/security.md`                                                                                    |

## How to work in this codebase

Before writing code, always read `CLAUDE.md` (or equivalent agent file) in the project root if it exists — it contains app-specific decisions, conventions, and structure that override general patterns.

**As you work:**

- **Write tests for new features and helper functions.** Read `references/testing.md` for patterns. Tests live alongside source files (e.g. `useApps.test.ts` next to `useApps.ts`).
- **Comment complex or non-obvious logic.** A comment should explain _why_ something works the way it does — a hidden constraint, a DHIS2 quirk, a workaround for a known bug. Skip comments that just restate the code.
- **Prefer legible code.** Use `Boolean(value)` rather than `!!value`, named variables for complex conditions, and explicit returns over ternary chains. Write for the next developer, not for brevity.
- **Keep `CLAUDE.md` up to date.** After adding a new feature, hook, or architectural decision, update `CLAUDE.md` with what was built and why. If there's no `CLAUDE.md`, create one. This is how future sessions (and teammates) understand the codebase.

**Library versions:**

`@dhis2/ui`, `@dhis2/app-runtime`, and the app platform libraries ship with their source
code. **Read `node_modules/@dhis2/<package>/` directly** — it is the most accurate source
of truth for component props, hook signatures, and exports. Do not rely on training data
or opensrc for these packages.

| Library                  | Source location                                                      |
| ------------------------ | -------------------------------------------------------------------- |
| `@dhis2/ui`              | `node_modules/@dhis2/ui/` — component props, exports, design tokens  |
| `@dhis2/app-runtime`     | `node_modules/@dhis2/app-runtime/` — hook signatures and context API |
| `@dhis2/cli-app-scripts` | The build tool — scaffold command uses the latest by default         |

`opensrc` is a **last resort** for the DHIS2 backend (`dhis2/dhis2-core`) — use it only
when the `@dhis2/api-types` OpenAPI spec doesn't cover what you need or something looks
wrong. Start with the spec; reach for the Java source only when the spec isn't enough.

## Rules

These apply to all DHIS2 work, regardless of which references you read:

- **React 18 only.** No Suspense for data fetching, no React 19 APIs (`use()`, `useFormStatus`, etc.). Handle loading states explicitly with `isLoading` and `CircularLoader`.
- **Always use `@dhis2/ui`** for UI components. Not MUI, Chakra, Ant Design. Only use custom components if the ui library doesn't provide the component you need.
- **Accessibility is not optional.** `@dhis2/ui` handles ARIA roles, focus trapping, and keyboard support automatically — don't override these. Always add `aria-label` to icon-only buttons, use sequential heading levels, provide `alt` text on images, and never use color as the only signal for state. See `references/ui-patterns.md` § Accessibility.
- **Always read source code before writing code.** For DHIS2 frontend libraries (`@dhis2/ui`, `@dhis2/app-runtime`), read `node_modules/@dhis2/<package>/` directly — they ship with source. For the DHIS2 backend API, use `opensrc` (see `references/data-fetching.md`). Training data is not reliable for either.
- **Use `i18n.t()` from `@dhis2/d2-i18n`** for all user-facing strings. For strings with
  runtime values, use named interpolation: `i18n.t('Error: {{message}}', { message })`.
  If the interpolated value contains a colon, set `nsSeparator: '-:-'` to prevent `d2-i18n`
  from treating it as a namespace separator:
  `i18n.t('Type: {{type}}', { type, nsSeparator: '-:-' })`.
- **Use displayName instead of name** for all dhis2 resources (organisation units, data elements, etc.).
- **CSS Modules + DHIS2 design tokens** for spacing, color, and elevation — see `references/ui-patterns.md` § Design tokens. Never use hard-coded pixel values or hex colors.
- **Use logical CSS properties** for all spacing and positioning — `margin-inline-start` not `margin-left`, `padding-block` not `padding-top/bottom`, `inset-inline-end` not `right`, `border-inline-start` not `border-left`, `text-align: start/end` not `left/right`. This ensures correct layout in RTL languages.
- **UI copy conventions:** use "Add" for adding an existing item to a collection, "Create" for making a new object; "Delete" for permanent removal, "Remove" for detaching; "Edit" not "Change" or "Modify". No ampersands (`and` not `&`), no abbreviations in labels.
- **State management:** Most state in a DHIS2 app is covered by TanStack Query (server
  state), React Router (URL/navigation state), and `useState`/`useReducer` (local UI state).
  Do not introduce a global state library unless these genuinely can't cover the use case.
  For existing apps, check `package.json` first — if a library (Redux, MobX, etc.) is
  already in use, work with it. If no state management library is present and one is truly
  needed, add **Zustand** — it requires no boilerplate and integrates well with TanStack
  Query.
- **Never store third-party credentials client-side.** Use DHIS2 Routes for external service
  communication. Use `UserDataStore` over `DataStore` for sensitive config; add `?encrypt=true`
  for sensitive values. See `references/security.md`.
- **Verify after each turn.** Run `pnpm exec eslint` and `pnpm exec tsc --noEmit` after making changes to catch errors early. Fix any issues before moving on. No output means no errors.

## Troubleshooting

Common errors you may encounter when building DHIS2 apps:

| Symptom                                                                                         | Fix                                                                                 |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ESLint `import/named` errors for named exports that work fine at runtime and show no IDE errors | Install `eslint-import-resolver-typescript` and configure it in your ESLint config. |
