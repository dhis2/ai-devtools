# API Types

Use `@dhis2/api-types` for TypeScript types and the OpenAPI schema for the DHIS2 REST API.
The package is the primary source of truth for API shapes — check it before reading DHIS2
backend source. Fall back to `dhis2/dhis2-core` only if a resource is missing or the type
looks wrong.

```bash
pnpm add --save-dev @dhis2/api-types
```

The package covers the last four DHIS2 API versions: **v40, v41, v42, v43**.
The default (unversioned) import resolves to the latest (**v43**). Use a versioned path
when the project targets an older version (see [Targeting a specific version](#targeting-a-specific-version)).

---

## Importing types

Named imports work directly — every schema in the spec is exported by name:

```typescript
import type {
    DataElement,
    OrganisationUnit,
    Program,
    ValueType,
} from '@dhis2/api-types'
```

The namespace form also works and gives access to `paths` and `components`:

```typescript
import type { components, paths } from '@dhis2/api-types'
type DataElement = components['schemas']['DataElement'] // identical to the named import
```

Use named imports for schema types. Use the namespace form only when composing utility
types at the type level.

---

## Utility types

Import from `@dhis2/api-types/utils` — these are version-agnostic and work with any version:

```typescript
import type {
    PickWithFieldFilters,
    PagedResponse,
} from '@dhis2/api-types/utils'
```

### `PickWithFieldFilters<T, Filters>`

Narrows a model type to exactly the fields in a `?fields=` query, including nested bracket
notation. Declare the fields array `as const` — the same array drives both the TypeScript
type and the runtime `fields` parameter so they can never drift apart:

```typescript
import type { DataElement } from '@dhis2/api-types'
import type { PickWithFieldFilters } from '@dhis2/api-types/utils'
import { useApiDataQuery } from '@/utils/useApiDataQuery'

const DATA_ELEMENT_FIELDS = [
    'id',
    'name',
    'valueType',
    'categoryCombo[id,displayName]',
] as const

type DataElementRow = PickWithFieldFilters<
    DataElement,
    typeof DATA_ELEMENT_FIELDS
>
// → { id?: string; name?: string; valueType?: ValueType; categoryCombo?: { id?: string; displayName?: string } }

type DataElementsResponse = {
    dataElements: PagedResponse<DataElementRow, 'dataElements'>
}

export const useDataElements = () => {
    const { data, isLoading, error } = useApiDataQuery<DataElementsResponse>({
        queryKey: ['dataElements'],
        query: {
            resource: 'dataElements',
            params: {
                fields: DATA_ELEMENT_FIELDS.join(','),
                pageSize: 50,
            },
        },
        staleTime: Infinity,
        cacheTime: Infinity,
    })

    return {
        dataElements: data?.dataElements.dataElements,
        pager: data?.dataElements.pager,
        isLoading,
        error,
    }
}
```

Do not call `.join(",")` before passing to `as const` — spreading the literal type is what
enables field narrowing. Joining at the `params` call site preserves the literal.

### `DeriveResourceTypeMap` and `InferQueryResult` — do not use yet

These utilities auto-infer response types from a query object. They are included in the
package but are **not stable** — they may be removed or changed before v1. Do not use
them until `@dhis2/api-types` reaches v1 and explicitly documents them as stable.

### `PagedResponse<T, Key>`

Types paginated list responses. All DHIS2 list endpoints return a `pager` + the resource
array keyed by the resource name:

```typescript
import type { PagedResponse } from '@dhis2/api-types/utils'
import type { OrganisationUnit } from '@dhis2/api-types'

type OrgUnitsResponse = {
    organisationUnits: PagedResponse<OrganisationUnit, 'organisationUnits'>
}
// → {
//     organisationUnits: {
//         pager: { page: number; pageCount: number; total: number; pageSize: number }
//         organisationUnits: OrganisationUnit[]
//     }
//   }
```

---

## Reference shapes

DHIS2 returns nested objects as bare identifiers by default — `categoryCombo` in a
`DataElement` is typed as `IdentifiableObject` (`{ id: string }`), not the full
`CategoryCombo`. This is intentional and accurate: the full shape only arrives when
you explicitly request it with `?fields=categoryCombo[id,name,categories[...]]`.

```typescript
// Without field expansion — correct, only id is present
de.categoryCombo?.id // ✓
de.categoryCombo?.categories // ✗ type error — IdentifiableObject has no 'categories'

// With PickWithFieldFilters + expanded fields — correct, categories is available
type DEWithCombo = PickWithFieldFilters<
    DataElement,
    ['id', 'categoryCombo[id,name,categories[id,name]]']
>
```

---

## Targeting a specific version

By default, target the **latest version** (`@dhis2/api-types` unversioned = v43). At the
start of a project or task, tell the user you're defaulting to the latest and ask if they
need to target a different version. If they specify an older version, use that versioned
import path for all types and API decisions throughout the session.

```typescript
// Latest (default)
import type { DataElement } from '@dhis2/api-types'

// Specific older version
import type { DataElement } from '@dhis2/api-types/v42'
```

| Import path            | DHIS2 version |
| ---------------------- | ------------- |
| `@dhis2/api-types`     | v43 (latest)  |
| `@dhis2/api-types/v43` | DHIS2 2.43    |
| `@dhis2/api-types/v42` | DHIS2 2.42    |
| `@dhis2/api-types/v41` | DHIS2 2.41    |
| `@dhis2/api-types/v40` | DHIS2 2.40    |

When targeting an older version, **compare it against the latest spec** and flag API
differences that affect what you're building. Use the OpenAPI specs shipped with the
package:

```bash
# Compare a resource between versions — look for added/removed/changed fields or params
diff <(jq '.components.schemas.DataElement' node_modules/@dhis2/api-types/specs/v42.json) \
     <(jq '.components.schemas.DataElement' node_modules/@dhis2/api-types/specs/v43.json)

# Compare endpoint parameters
diff <(jq '.paths["/dataElements"].get.parameters' node_modules/@dhis2/api-types/specs/v42.json) \
     <(jq '.paths["/dataElements"].get.parameters' node_modules/@dhis2/api-types/specs/v43.json)
```

Surface any meaningful differences to the user — new fields available in the latest,
parameters that changed, or endpoints that don't exist in their target version.

---

## Exploring available types

Browse types from the installed package — it ships with source:

```bash
rg "export type" node_modules/@dhis2/api-types/v43.d.ts | grep -v "components\|paths\|operations"
```

Browse the raw OpenAPI spec to understand the full API shape for a resource:

```bash
cat node_modules/@dhis2/api-types/specs/v43.json | jq '.paths | keys[]' | grep dataElement
cat node_modules/@dhis2/api-types/specs/v43.json | jq '.components.schemas.DataElement'
```

---

## When types aren't available

Some resources (tracker endpoints, custom extensions) are not fully typed in the spec —
their response resolves to `unknown`. In that case:

1. Check `node_modules/@dhis2/api-types/specs/vN.json` first — the resource may exist in
   the spec even if its type is opaque.
2. If not covered, read the DHIS2 backend source with opensrc to derive the shape:
    ```bash
    CORE=$(npx opensrc path dhis2/dhis2-core)
    rg "TrackerEnrollmentController" "$CORE" -l
    ```
3. Define the type manually, close to the hook that uses it:

```typescript
// Derived from reading the DTO in dhis2-core source
type TrackerEnrollment = {
    enrollment: string
    trackedEntity: string
    program: string
    status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
    orgUnit: string
    enrolledAt: string
    attributes: Array<{ attribute: string; value: string }>
}
```

Keep manually defined types close to the hook or component that uses them — not in a
global `types.ts` — unless multiple files need the same shape.
