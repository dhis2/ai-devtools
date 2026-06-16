# Fetching Data from DHIS2

DHIS2's API changes between major versions — endpoint paths, request/response shapes, and
query parameters all evolve. Do not rely on memorized API structures.

**Every data-fetching task starts by reading the API contract for the endpoint you're
building.** This is not optional. Even well-known resources like `organisationUnits` or
`trackedEntities` have changed between versions. Read first, then write code.

---

## Step 1: Read the API contract

Use the OpenAPI spec shipped with `@dhis2/api-types` as the first source of truth — it's
already in `node_modules` and covers all standard endpoints:

```bash
# Check if the endpoint exists and see its parameters
cat node_modules/@dhis2/api-types/specs/v43.json | jq '.paths | keys[]' | grep -i orgUnit
cat node_modules/@dhis2/api-types/specs/v43.json | jq '.paths["/organisationUnits"].get'

# Read the resource schema
cat node_modules/@dhis2/api-types/specs/v43.json | jq '.components.schemas.OrganisationUnit'
```

Use the versioned spec if the project targets a specific DHIS2 version (e.g. `specs/v42.json`).

### Cross-version compatibility check

After confirming the endpoint and its parameters, **always diff the target version's spec
against all available versions** to catch anything that changed. Do this for every endpoint
you write a query for — not just when you suspect a difference:

```bash
# List all available spec versions
ls node_modules/@dhis2/api-types/specs/

# Compare parameters for an endpoint across all versions
for v in node_modules/@dhis2/api-types/specs/v*.json; do
    echo "=== $v ==="
    jq -r '.paths["/routes"].get.parameters[]?.name // empty' "$v" 2>/dev/null | sort
done

# Or diff two specific versions directly
diff \
  <(jq -r '.paths["/routes"].get.parameters[]?.name // empty' node_modules/@dhis2/api-types/specs/v41.json | sort) \
  <(jq -r '.paths["/routes"].get.parameters[]?.name // empty' node_modules/@dhis2/api-types/specs/v43.json | sort)

# Check if an endpoint exists at all in an older version
jq '.paths["/routes"]' node_modules/@dhis2/api-types/specs/v40.json
```

Report any differences to the user before writing code — missing endpoints, added or
removed parameters, changed response shapes. Don't silently implement a workaround; let
the user decide how to handle version gaps.

If the endpoint is **not in the spec** (some tracker endpoints, custom extensions) or the
spec shape looks incomplete, fall back to the DHIS2 backend source with `opensrc`:

```bash
CORE=$(npx opensrc path dhis2/dhis2-core)
rg "OrganisationUnitController" "$CORE"
```

If the user specifies a DHIS2 version, target that tag:

```bash
CORE=$(npx opensrc path dhis2/dhis2-core@2.42)
```

## Step 2: Read the API contracts from the source

Once the source is cached, read the relevant controller and DTOs for the endpoint you're
building. You need to extract:

1. The endpoint path and HTTP methods
2. Supported query parameters (filtering, paging, ordering, field selection)
3. The request body shape (for create/update/delete)
4. The response envelope structure

Controllers are typically in `dhis-2/dhis-web-api/`, DTOs and models in `dhis-2/dhis-api/`.
Search for the controller class name (e.g. `OrganisationUnitController`,
`ProgramIndicatorController`).

### Preferred: use an Explore subagent (if the Agent tool is available)

If you have access to the **Agent tool**, this is the best approach. The DHIS2 codebase is
large and reading Java source inline floods your context with code you only need a summary of.
Launch an **Explore subagent** that searches the source, extracts the API contract, and returns
a compact summary, keeping your main context clean.

Use `subagent_type: "Explore"` and a prompt like:

```
In the DHIS2 source cached by opensrc (run `npx opensrc path dhis2/dhis2-core` to get
the absolute path, typically `~/.opensrc/repos/github.com/dhis2/dhis2-core/<version>/`),
find the controller and request/response DTOs for the `{resource}` endpoint (e.g.
`trackedEntities`, `organisationUnits`, `programIndicators`). Return:
1. The endpoint path and HTTP methods
2. Supported query parameters (filtering, paging, ordering, field selection)
3. The request body shape (for create/update/delete)
4. The response envelope structure

Look in the Java backend — controllers are typically in dhis-2/dhis-web-api/,
DTOs and models in dhis-2/dhis-api/. Search for the controller class name
(e.g. OrganisationUnitController, ProgramIndicatorController).
```

## Step 3: Create a custom hook for the resource

Once you know the API shape, wrap the fetch in a dedicated hook. Every data-fetching hook
follows this pattern:

1. Define a TypeScript type for the expected response
2. Build a query object with the resource path and parameters
3. Set caching strategy based on whether the data is **metadata** or **data**

```typescript
import { useApiDataQuery } from '@/utils/useApiDataQuery'

type App = {
    key: string
    displayName: string
    version: string
    pluginLaunchUrl: string
}

type UseAppsOptions = {
    enabled?: boolean
    select?: (apps: App[]) => App[]
}

export const useApps = ({ enabled = true, select }: UseAppsOptions = {}) => {
    const {
        data: apps,
        isLoading,
        error,
    } = useApiDataQuery<App[]>({
        queryKey: ['apps'],
        query: {
            resource: 'apps',
            params: {
                fields: 'key,displayName,version,pluginLaunchUrl',
            },
        },
        cacheTime: Infinity,
        staleTime: Infinity,
        enabled,
        select,
    })

    return {
        apps,
        isLoading,
        error,
    }
}
```

### Caching strategy: metadata vs data

DHIS2 has two broad categories of API resources, and they should be cached differently:

- **Metadata** (organisation units, programs, data elements, option sets, apps, etc.) —
  changes rarely during a session. Cache aggressively:

    ```typescript
    cacheTime: Infinity,
    staleTime: Infinity,
    ```

    This fetches once and never refetches unless the user hard-refreshes. Metadata endpoints
    are expensive and the results don't change while the user is working.

- **Data** (tracked entities, events, data values, analytics, etc.) —
  changes frequently but doesn't need to refetch on every interaction. Use a sensible default:
    ```typescript
    staleTime: 5 * 60 * 1000,   // 5 minutes
    cacheTime: 10 * 60 * 1000,  // 10 minutes
    ```
    This avoids redundant requests while still keeping the UI reasonably current. Adjust
    down for data that must be near-realtime, or up for data that changes less often.

### Query parameters: filtering, ordering, and paging

The `params` object supports several standard parameters across DHIS2 endpoints:

```typescript
query: {
    resource: 'dataItems',
    params: {
        filter: [
            'displayName:ilike:vaccine',
            'dimensionItemType:in:[PROGRAM_DATA_ELEMENT,INDICATOR,PROGRAM_INDICATOR,DATA_ELEMENT]',
        ],
        fields: 'id,displayName,dimensionItemType',
        order: 'displayName:asc',
        page: 1,
        pageSize: 20,
    },
},
```

- **`fields`** — comma-separated list of properties to return. Always specify this.
- **`filter`** — array of filter expressions. Format: `property:operator:value`.
  Common operators: `eq`, `like`, `ilike` (case-insensitive), `in` (list), `gt`, `lt`, `ge`, `le`.
  Multiple filters are AND-ed together.
- **`order`** — sort expression, e.g. `displayName:asc` or `created:desc`.
- **`page`** / **`pageSize`** — pagination. **Always paginate — never fetch a full
  collection.** Fetching all records is a performance hazard on large DHIS2 instances
  (thousands of org units, data elements, etc.) and can time out or OOM the browser.
  Use a reasonable default page size (20–50). Wire the UI to the `pager` response using
  the `Pagination` component from `@dhis2/ui` — see `references/ui-patterns/tables.md`
  for the full pagination pattern.

Filters can be built dynamically — for example, only applying a search filter when the
user has typed something:

```typescript
filter: [
    ...(searchTerm ? [`displayName:ilike:${searchTerm}`] : []),
    'dimensionItemType:in:[DATA_ELEMENT,INDICATOR]',
],
```

## Step 4: Mutations

For create, update, and delete operations, use `useMutation` from TanStack Query with
`useDataEngine` directly. The mutation object uses `resource`, `id` (when applicable),
`type` (`'create'`, `'update'`, or `'delete'`), and `data` (for create/update).

Three things matter in every mutation hook:

1. **Invalidate or remove related query cache** so the UI reflects the change
2. **Show alerts** via `useAlert` from `@dhis2/app-runtime` to confirm success or report errors
3. **Expose pending state** (`isPending`) so the UI can show a spinner or disable buttons

```typescript
import { useDataEngine, useAlert } from '@dhis2/app-runtime'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import i18n from '@dhis2/d2-i18n'

type UseDeleteRouteOptions = {
    onSuccess?: () => void
    onError?: (error: unknown) => void
}

export const useDeleteRoute = ({
    id,
    onSuccess,
    onError,
}: { id: string } & UseDeleteRouteOptions) => {
    const dataEngine = useDataEngine()
    const queryClient = useQueryClient()

    const { show: showErrorAlert } = useAlert(i18n.t('Error deleting route'), {
        critical: true,
    })
    const { show: showSuccessAlert } = useAlert(
        i18n.t('Route deleted successfully'),
        { success: true }
    )

    const DeleteRouteMutation = {
        resource: 'routes',
        id,
        type: 'delete' as const,
    }

    const { mutate, isPending: isDeleting } = useMutation<unknown, Error, void>(
        () => dataEngine.mutate(DeleteRouteMutation),
        {
            onSuccess: () => {
                showSuccessAlert()
                queryClient.invalidateQueries({ queryKey: ['routes'] })
                onSuccess?.()
            },
            onError: (error) => {
                showErrorAlert()
                console.error('Error deleting route:', error)
                onError?.(error)
            },
        }
    )

    return {
        deleteRoute: mutate,
        isDeleting,
    }
}
```

Always invalidate the relevant query keys in `onSuccess` — this ensures any list or detail
view using that data refetches automatically. For deletions you can also use
`queryClient.removeQueries` to drop the specific item from cache immediately.

### useAlert full API

`useAlert` accepts either a static string or a dynamic message function as its first
argument. Use the function form when the message needs to include runtime values:

```typescript
const { show: showError } = useAlert(
    ({ message }: { message: string }) =>
        i18n.t('Failed to save route: {{message}}', { message }),
    { critical: true }
)

// Call with the value at runtime:
showError({ message: error.details.message })
```

Alert options:

| Option                              | Effect                                                      |
| ----------------------------------- | ----------------------------------------------------------- |
| `{ critical: true }`                | Red — for errors                                            |
| `{ success: true }`                 | Green — for confirmations                                   |
| `{ warning: true }`                 | Yellow — for warnings                                       |
| `{ duration: 5000 }`                | Auto-dismiss after N ms (default is permanent for critical) |
| `{ actions: [{ label, onClick }] }` | Render action buttons inside the alert                      |

`useAlert` also returns `hide()` to dismiss programmatically:

```typescript
const { show, hide } = useAlert(i18n.t('Processing…'))
```

### JSON Patch mutations

Use `type: 'json-patch'` for partial updates — changing one or a few fields without
sending the full object. The `data` array is a standard JSON Patch document:

```typescript
const toggleMutation = {
    resource: 'routes',
    id: route.id,
    type: 'json-patch' as const,
    data: [{ op: 'replace', path: '/disabled', value: !route.disabled }],
}

await dataEngine.mutate(toggleMutation)
```

Common operations: `replace` (update a field), `add` (append to an array), `remove`
(delete a field or array item). Use this instead of a full `update` mutation when only
one property changes — it avoids overwriting concurrent edits to other fields.

### After mutations: refetch vs invalidateQueries

How to refresh data after a mutation depends on which query layer the component uses:

- **TanStack Query (`useApiDataQuery`)** — call `queryClient.invalidateQueries({ queryKey: [...] })` in `onSuccess`. This marks cached data stale and triggers a background refetch for any mounted query with a matching key.
- **app-runtime (`useDataQuery`)** — the query result exposes a `refetch` function. Call it directly after the mutation resolves.

Don't mix the two — if a component uses `useDataQuery`, `invalidateQueries` won't trigger a refetch since that cache is managed by app-runtime, not TanStack Query.

## Step 5: Handle version differences with feature flags

DHIS2 apps often need to support multiple server versions, and the API changes between them —
new query parameters, different payload shapes, features that only exist from a certain version
onward. Rather than scattering version checks throughout the codebase, use a centralized
feature support map.

Create `src/utils/support.ts` to define which minor version introduced each feature:

```typescript
export const FEATURES = Object.freeze({
    multiText: 'multiText',
    customIcons: 'customIcons',
})

const MINOR_VERSION_SUPPORT = Object.freeze({
    [FEATURES.multiText]: 41,
    [FEATURES.customIcons]: 40,
})

export const hasAPISupportForFeature = (
    minorVersion: string | number,
    featureName: string
) => MINOR_VERSION_SUPPORT[featureName] <= Number(minorVersion) || false
```

Then create `src/hooks/useFeature.ts` to expose this as a React hook:

```typescript
import { useMemo } from 'react'
import { useConfig } from '@dhis2/app-runtime'
import { hasAPISupportForFeature } from '@/utils/support'

export const useFeature = (featureName: string) => {
    const { serverVersion: { minor: minorVersion } = { minor: 0 } } =
        useConfig()
    return useMemo(
        () => hasAPISupportForFeature(minorVersion, featureName),
        [minorVersion, featureName]
    )
}
```

`useConfig` from `@dhis2/app-runtime` provides the connected server's version at runtime.
The hook returns a boolean — use it to conditionally include query parameters, adjust
payload shapes, or toggle UI features:

```typescript
const supportsMultiText = useFeature(FEATURES.multiText)

// Use in query params, payload construction, or UI rendering
const params = {
    fields: 'id,displayName',
    ...(supportsMultiText && { multiText: true }),
}
```

When the source code reveals a breaking change between versions, add an entry to `FEATURES`
and `MINOR_VERSION_SUPPORT` rather than hardcoding version checks inline.

## Step 6: Loading and error states

Every component that fetches data should handle loading and error before rendering content.
Use `CircularLoader` from `@dhis2/ui` for loading. For errors, use any component that
gives clear visual feedback — `NoticeBox` from `@dhis2/ui` works well, but an inline
message or alert is fine too as long as the user understands what went wrong:

```tsx
import { CircularLoader, NoticeBox } from '@dhis2/ui'
import i18n from '@dhis2/d2-i18n'
import styles from './MyComponent.module.css'

const MyComponent = () => {
    const { jobs, error, isLoading } = useJobs()

    if (isLoading) {
        return (
            <div className={styles.loadingContainer}>
                <CircularLoader />
            </div>
        )
    }

    if (error) {
        return (
            <div className={styles.errorContainer}>
                <NoticeBox error title={i18n.t('Error loading jobs')}>
                    {error.message || i18n.t('An unknown error occurred')}
                </NoticeBox>
            </div>
        )
    }

    // Safe to use `jobs` here — it's loaded and no error
    return <JobList jobs={jobs} />
}
```

Center the loader so it's visible regardless of page layout:

```css
.loadingContainer {
    display: flex;
    justify-content: center;
    align-items: center;
    min-block-size: 300px;
}
```

The goal is simple: never show a blank screen. Either the user sees their data, a spinner,
or a meaningful error message.

## Best practices

1. **Always fetch the source and read it before writing code.** Before writing any hook
   or mutation, run `npx opensrc path dhis2/dhis2-core` (or with a version tag like
   `dhis2/dhis2-core@2.41` if the user specified one) to get the absolute path to the
   cached source, then read the API contracts from it. If the Agent tool is available,
   launch an Explore subagent to keep your context clean. Otherwise, read the source
   inline with Grep and Read. This applies to every endpoint, no matter how common.

2. **Only fetch the fields you need.** Always use the `fields` parameter to request exactly
   the properties your component uses. The `fields` filter is available on all DHIS2 API
   endpoints and should never be omitted — fetching full objects wastes bandwidth and slows
   down both the server and the client.

3. **Set caching based on the data category.** Metadata gets `Infinity`/`Infinity`, data
   gets short or no cache. See the caching strategy section above.

4. **Always handle loading and error states.** Use `isLoading` and `error` from the query
   hook to provide clear feedback to the user while data is in flight or when something
   goes wrong.
