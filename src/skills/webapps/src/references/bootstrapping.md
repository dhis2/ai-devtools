# Bootstrapping a DHIS2 App

This is the step-by-step recipe for setting up a new DHIS2 app with the opinionated
tech stack. Follow every step in order — don't skip or substitute.

**Tech stack:** TypeScript, pnpm, React Router DOM, TanStack Query v4, TanStack Table,
`@` path alias, Vite.

---

## Step 0: Ask for the app name

Ask the user for the app name (kebab-cased, e.g. `facility-registry`). This is the
only question — don't ask for anything else. Always use a tool to ask the question if available.
For claude code, this is the AskUserQuestion tool. Always use this tool or similar if available.

## Step 1: Scaffold

```bash
pnpm create @dhis2/app@latest <app-name> --typescript --yes
```

Always use `--typescript`. The `--yes` flag accepts defaults (pnpm, basic template).

```bash
cd <app-name>
```

## Step 2: Install the stack

```bash
pnpm add @tanstack/react-query@4 @tanstack/react-table react-router-dom
```

TanStack Query must be version 4 — do not install v5.

## Step 3: Configure `d2.config.js`

Replace the scaffolded config with:

```javascript
/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
  type: "app",
  name: "<app-name>",
  minDHIS2Version: "2.41",

  entryPoints: {
    app: "./src/App.tsx",
  },

  viteConfigExtensions: "./vite.config.mts",
};

module.exports = config;
```

## Step 4: Create `vite.config.mts`

Create this file in the project root:

```typescript
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

This enables `@/components/Foo` imports instead of relative paths.

## Step 5: Add the path alias to `tsconfig.json`

Add the `paths` mapping so TypeScript resolves the `@` alias:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx", // Overwrite the default jsx setting from the scaffolder
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Merge this into the existing `tsconfig.json` — don't overwrite the other compiler options
that the scaffolder set up.

## Step 6: Create `src/utils/SyncUrlWithGlobalShell.tsx`

```tsx
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

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
  const location = useLocation();

  useEffect(() => {
    dispatchEvent(new PopStateEvent("popstate"));
  }, [location.key]);

  return <Outlet />;
};
```

This is a layout route component — it wraps all routes so the Global Shell URL stays
in sync. Without it, the browser URL won't update when navigating. Every route should
be a child of this layout.

## Step 7: Set up `src/App.tsx`

Replace the contents of `src/App.tsx` with:

```tsx
import React from "react";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CssReset, CssVariables } from "@dhis2/ui";
import { SyncUrlWithGlobalShell } from "@/utils/SyncUrlWithGlobalShell";

const queryClient = new QueryClient();

const router = createHashRouter([
  {
    element: <SyncUrlWithGlobalShell />,
    children: [
      {
        path: "/",
        element: <div>Home</div>,
      },
    ],
  },
]);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <CssReset />
    <CssVariables theme spacers colors elevations />
    <RouterProvider router={router} />
  </QueryClientProvider>
);

export default App;
```

DHIS2 apps run inside an iframe in the DHIS2 shell, so use `createHashRouter` — not
`BrowserRouter` or `createBrowserRouter`. Hash routing avoids conflicts with the
platform's own routing.

`CssReset` normalizes browser styles. `CssVariables` injects the DHIS2 design tokens
(theme colors, spacers, elevations) as CSS custom properties so `@dhis2/ui` components
render correctly.

All routes are nested under the `SyncUrlWithGlobalShell` layout route, so every
page automatically keeps the Global Shell URL in sync. Add new routes as children
of that layout.

## Step 8: Create `src/interfaces/apiQueryTypes.ts`

```typescript
export type PossiblyDynamic<Type, InputType> =
  | Type
  | ((input: InputType) => Type);
export type QueryVariables = Record<string, unknown>;

type QueryParameterSingularValue = string | number | boolean;
interface QueryParameterAliasedValue {
  [name: string]: QueryParameterSingularValue;
}
type QueryParameterSingularOrAliasedValue =
  | QueryParameterSingularValue
  | QueryParameterAliasedValue;
type QueryParameterMultipleValue = QueryParameterSingularOrAliasedValue[];
export type QueryParameterValue =
  | QueryParameterSingularValue
  | QueryParameterAliasedValue
  | QueryParameterMultipleValue
  | undefined;

export interface QueryParameters {
  pageSize?: number;
  [key: string]: QueryParameterValue;
}

export interface ResourceQuery {
  resource: string;
  id?: PossiblyDynamic<string, QueryVariables>;
  data?: PossiblyDynamic<unknown, QueryVariables>;
  params?: PossiblyDynamic<QueryParameters, QueryVariables>;
}
```

These types describe the shape of a DHIS2 API query passed to the data engine.
`ResourceQuery` is the main one — it maps to a DHIS2 API resource with optional
id, request body, and query parameters.

## Step 9: Create `src/utils/useApiDataQuery.ts`

```typescript
import { useDataEngine } from "@dhis2/app-runtime";
import {
  useQuery,
  QueryFunction,
  UseQueryOptions,
  QueryKey,
} from "@tanstack/react-query";
import { ResourceQuery } from "../interfaces/apiQueryTypes";

type UseApiDataQueryProps<
  TResultData,
  TError = Error,
  TData = TResultData,
  TQueryKey extends QueryKey = QueryKey,
> = Omit<UseQueryOptions<TResultData, TError, TData, TQueryKey>, "queryFn"> & {
  query: ResourceQuery;
};

export const useApiDataQuery = <
  TResultData,
  TError = Error,
  TData = TResultData,
  TQueryKey extends QueryKey = QueryKey,
>({
  query,
  queryKey,
  ...options
}: UseApiDataQueryProps<TResultData, TError, TData, TQueryKey>) => {
  const dataEngine = useDataEngine();

  const queryFn: QueryFunction<TResultData, TQueryKey> = async () => {
    const response = await dataEngine.query({ apiDataQuery: query });
    return response.apiDataQuery as TResultData;
  };

  return useQuery<TResultData, TError, TData, TQueryKey>({
    queryKey,
    queryFn,
    ...options,
  });
};
```

Always use `useApiDataQuery` for data fetching — never use `useDataQuery` from
`@dhis2/app-runtime` directly.

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
