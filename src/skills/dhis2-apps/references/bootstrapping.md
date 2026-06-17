# Bootstrapping a DHIS2 App

This is the step-by-step recipe for setting up a new DHIS2 app with the opinionated
tech stack. Follow every step in order — don't skip or substitute.

**Tech stack:** TypeScript, pnpm, React Router, TanStack Query, TanStack Table,
`@` path alias, Vite.

---

## Before you begin: confirm the plan with the user

Before running any commands, tell the user what you're about to do. Present a short
summary like:

> "I'll scaffold a new DHIS2 app targeting the **latest DHIS2 API version (v43)** with the following setup:
>
> - **Scaffold**: `pnpm create @dhis2/app` with the `react-router` template (TypeScript)
> - **App name**: `<derived from directory or provided by user>`
> - **`d2.config.js`**: type `app`, entry point `./src/App.tsx`
> - **Libraries**: `@tanstack/react-query`, `@tanstack/react-table`
> - **Path alias**: `@` → `src/` (provided by template)
> - **Code quality**: DHIS2 shared ESLint + Prettier configs, husky pre-commit hook
> - **Navigation**: sidebar layout with React Router
>
> Ready to go? Let me know if you'd like to change anything, or just say yes to start."

Before presenting this summary, run `ls -A` to check whether the current directory is
empty and determine the app name:

- **Empty**: derive the app name from the directory name (`basename $PWD`) and use `.`
  as the scaffold target. Include the derived name in the plan summary above.
- **Not empty**: ask for the app name (kebab-cased, e.g. `facility-registry`) as part of
  gathering information before presenting the summary. Use the `AskUserQuestion` tool if
  available. Include the chosen name in the plan summary above.

Wait for the user to confirm before running any commands. If they request changes,
adjust accordingly. Once confirmed, proceed through the steps below without asking
further questions — make all decisions silently and use the defaults described here.

---

## Step 0: Scaffold target

App name and scaffold target were determined in the "Before you begin" step. Use them
directly — no further questions needed here.

Target the **latest DHIS2 API version (v43)** for all type imports and API decisions.
See `references/types.md` for version-specific import paths.

## Step 1: Scaffold

**If the current directory is empty:**

```bash
pnpm create @dhis2/app@latest . --typescript --template react-router --yes
```

**If the current directory is not empty:**

```bash
pnpm create @dhis2/app@latest <app-name> --typescript --template react-router --yes
cd <app-name>
```

Always use `--typescript` and `--template react-router`. The `--yes` flag accepts remaining defaults.

The `react-router` template already includes:

- `tsconfig.json` with the `@/*` path alias configured
- `viteConfigExtensions.mts` with the Vite `@` alias
- A base `d2.config.js` wired to `viteConfigExtensions.mts`

Steps 2–4 update these files — don't recreate them from scratch.

## Step 2: Update DHIS2 platform libraries

The scaffold pins specific versions. Update the DHIS2 platform libraries to their latest
and install the API types package before doing anything else:

```bash
pnpm update --latest @dhis2/app-runtime @dhis2/ui @dhis2/cli-app-scripts
pnpm add --save-dev @dhis2/api-types
```

If `@dhis2/api-types` is already in `package.json`, update it instead:

```bash
pnpm update --latest @dhis2/api-types
```

## Step 3: Install the stack

```bash
pnpm add @tanstack/react-query @tanstack/react-table
```

## Step 4: Update `d2.config.js`

The template generates a valid `d2.config.js` — only two things need changing: add the
`name` field and update the entry point to `App.tsx` (we consolidate router + providers
there instead of using the template's separate `AppWrapper.tsx`):

```javascript
/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
    type: 'app',
    name: '<app-name>',

    entryPoints: {
        app: './src/App.tsx',
    },

    viteConfigExtensions: './viteConfigExtensions.mts',
}

module.exports = config
```

Leave `viteConfigExtensions.mts` as-is — the template already configures the `@` alias
there. Do not rename it or create a separate `vite.config.mts`.

## Step 5: Create `src/utils/SyncUrlWithGlobalShell.tsx`

```tsx
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'

/*
 * When the app runs in the DHIS2 Global Shell, react-router@6+ no longer
 * fires "popstate" events on pushState/replaceState. The Global Shell
 * listens for "popstate" to keep the browser URL in sync, so we dispatch
 * it manually on every route change.
 *
 * Background on the react-router change:
 * https://github.com/remix-run/react-router/blob/44472360ec9ea045008f453280bb749cb58e90ea/decisions/0005-remixing-react-router.md#inline-the-history-library-into-the-router
 */

export const SyncUrlWithGlobalShell = () => {
    const location = useLocation()

    useEffect(() => {
        dispatchEvent(new PopStateEvent('popstate'))
    }, [location.key])

    return <Outlet />
}
```

This is a layout route component — it wraps all routes so the Global Shell URL stays
in sync. Without it, the browser URL won't update when navigating. Every route should
be a child of this layout.

## Step 6: Replace `src/App.tsx`

Replace the entire contents of `src/App.tsx` with:

```tsx
import { createHashRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CssReset, CssVariables } from '@dhis2/ui'
import { SyncUrlWithGlobalShell } from '@/utils/SyncUrlWithGlobalShell'

const queryClient = new QueryClient()

const router = createHashRouter([
    {
        element: <SyncUrlWithGlobalShell />,
        children: [
            {
                path: '/',
                element: <div>Home</div>,
            },
        ],
    },
])

const App = () => (
    <QueryClientProvider client={queryClient}>
        <CssReset />
        <CssVariables theme spacers colors elevations />
        <RouterProvider router={router} />
    </QueryClientProvider>
)

export default App
```

This replaces the template's `App.tsx` and absorbs the role of `AppWrapper.tsx` — you
can delete `AppWrapper.tsx` after this step.

DHIS2 apps run inside an iframe in the DHIS2 shell, so use `createHashRouter` — not
`BrowserRouter` or `createBrowserRouter`. Hash routing avoids conflicts with the
platform's own routing.

`CssReset` normalizes browser styles. `CssVariables` injects the DHIS2 design tokens
(theme colors, spacers, elevations) as CSS custom properties so `@dhis2/ui` components
render correctly.

All routes are nested under the `SyncUrlWithGlobalShell` layout route, so every
page automatically keeps the Global Shell URL in sync. Add new routes as children
of that layout.

## Step 7: Create `src/interfaces/apiQueryTypes.ts`

```typescript
export type PossiblyDynamic<Type, InputType> =
    | Type
    | ((input: InputType) => Type)
export type QueryVariables = Record<string, unknown>

type QueryParameterSingularValue = string | number | boolean
interface QueryParameterAliasedValue {
    [name: string]: QueryParameterSingularValue
}
type QueryParameterSingularOrAliasedValue =
    | QueryParameterSingularValue
    | QueryParameterAliasedValue
type QueryParameterMultipleValue = QueryParameterSingularOrAliasedValue[]
export type QueryParameterValue =
    | QueryParameterSingularValue
    | QueryParameterAliasedValue
    | QueryParameterMultipleValue
    | undefined

export interface QueryParameters {
    pageSize?: number
    [key: string]: QueryParameterValue
}

export interface ResourceQuery {
    resource: string
    id?: PossiblyDynamic<string, QueryVariables>
    data?: PossiblyDynamic<unknown, QueryVariables>
    params?: PossiblyDynamic<QueryParameters, QueryVariables>
}
```

These types describe the shape of a DHIS2 API query passed to the data engine.
`ResourceQuery` is the main one — it maps to a DHIS2 API resource with optional
id, request body, and query parameters.

## Step 8: Create `src/utils/useApiDataQuery.ts`

```typescript
import { useDataEngine } from '@dhis2/app-runtime'
import { useQuery, UseQueryOptions, QueryKey } from '@tanstack/react-query'
import { ResourceQuery } from '../interfaces/apiQueryTypes'

type UseApiDataQueryProps<
    TData,
    TError = Error,
    TQueryKey extends QueryKey = QueryKey,
> = Omit<UseQueryOptions<TData, TError, TData, TQueryKey>, 'queryFn'> & {
    query: ResourceQuery
}

export const useApiDataQuery = <
    TData,
    TError = Error,
    TQueryKey extends QueryKey = QueryKey,
>({
    query,
    queryKey,
    ...options
}: UseApiDataQueryProps<TData, TError, TQueryKey>) => {
    const dataEngine = useDataEngine()

    return useQuery<TData, TError, TData, TQueryKey>({
        queryKey,
        queryFn: async () => {
            const response = await dataEngine.query({ apiDataQuery: query })
            return response.apiDataQuery as TData
        },
        ...options,
    })
}
```

Always use `useApiDataQuery` for data fetching — never use `useDataQuery` from
`@dhis2/app-runtime` directly.

## After bootstrapping: set up code quality tooling

Set up the DHIS2 shared ESLint and Prettier configs — these are the standard choice for
DHIS2 apps and align with the wider ecosystem.

**Install packages:**

```bash
pnpm add -D eslint @eslint/compat prettier husky lint-staged @dhis2/config-eslint @dhis2/config-prettier eslint-import-resolver-typescript
```

**Create `eslint.config.mjs`** — use the `/react` export for React apps:

```js
import config from '@dhis2/config-eslint/react'
import { defineConfig } from 'eslint/config'
import { includeIgnoreFile } from '@eslint/compat'
import { fileURLToPath } from 'node:url'

const gitignorePath = fileURLToPath(new URL('.gitignore', import.meta.url))

export default defineConfig([
    includeIgnoreFile(gitignorePath, 'Imported .gitignore patterns'),
    {
        extends: [config],
        settings: {
            'import/resolver': {
                typescript: true,
            },
        },
    },
])
```

**Create `.prettierrc.mjs`:**

```js
import prettierConfig from '@dhis2/config-prettier'

/** @type {import("prettier").Config} */
const config = {
    ...prettierConfig,
}

export default config
```

Once ESLint is configured, run a fix pass to auto-correct import ordering in the
scaffolded files:

```bash
pnpm eslint --fix
```

### Husky + lint-staged

Initialize husky and add the pre-commit hook:

```bash
npx husky init
echo "pnpm lint-staged" > .husky/pre-commit
```

Add to `package.json`:

```json
{
    "scripts": {
        "prepare": "husky",
        "lint": "eslint && prettier -c .",
        "format": "prettier . -w"
    },
    "lint-staged": {
        "*": ["pnpm prettier . --write", "pnpm lint"]
    }
}
```

### CI lint step

Add a lint job to GitHub Actions. If a CI workflow already exists, add `pnpm lint` as
a step there. Otherwise create `.github/workflows/lint.yml`:

```yaml
name: Lint

on: [push, pull_request]

jobs:
    lint:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: pnpm/action-setup@v4
            - uses: actions/setup-node@v4
              with:
                  node-version: 20
                  cache: pnpm
            - run: pnpm install
            - run: pnpm lint
```

## After bootstrapping: set up sidebar navigation

Once the above steps are complete, read `references/routing.md` →
`references/ui-patterns/sidebar.md` and implement the sidebar navigation layout.
This is a standard part of bootstrapping — most DHIS2 apps need sidebar navigation,
so just set it up rather than asking. If you're already bootstrapping the app,
there's no reason to leave this out.

After the sidebar is in place, let the user know the app is fully bootstrapped
and ask if they'd like to make any changes to the sidebar layout or navigation
structure based on their specific needs.

## Troubleshooting

### `pnpm: command not found` or `node: command not found`

If Node.js is not installed, the user needs to install it first. Point them to
https://nodejs.org/en/download — download the `.pkg` installer on macOS or the
`.msi` installer on Windows.

After installing, restart your terminal so the `node` command is available on your PATH. Once `node -v` runs successfully, install pnpm:

```bash
node -v
npm -v
npm install -g corepack@latest
corepack enable pnpm
pnpm -v
```

After `pnpm -v` prints a version, retry from Step 1.
