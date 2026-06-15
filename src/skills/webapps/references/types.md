# API Types

Use `@dhis2/dhis2-api-types` for TypeScript types that match the DHIS2 Web API response
shapes. This avoids hand-writing types for common resources like `OrganisationUnit`,
`DataElement`, `Program`, `TrackedEntityType`, etc. — and it stays in sync with the API
as the library is updated alongside DHIS2 releases.

```bash
pnpm add @dhis2/dhis2-api-types
```

---

## Using types in hooks

Import types from the package and use them as the generic parameter on `useApiDataQuery`:

```typescript
import type { D2OrganisationUnit } from '@dhis2/dhis2-api-types'
import { useApiDataQuery } from '@/utils/useApiDataQuery'

type OrgUnitResponse = {
    organisationUnits: D2OrganisationUnit[]
}

export const useOrganisationUnits = () => {
    const { data, isLoading, error } = useApiDataQuery<OrgUnitResponse>({
        queryKey: ['organisationUnits'],
        query: {
            resource: 'organisationUnits',
            params: {
                fields: 'id,displayName,parent[id,displayName],level',
                pageSize: 50,
            },
        },
        cacheTime: Infinity,
        staleTime: Infinity,
    })

    return {
        organisationUnits: data?.organisationUnits,
        isLoading,
        error,
    }
}
```

The type guards that you're only accessing fields that exist on the resource. Note that
`useApiDataQuery` returns the full response object, so always unwrap the resource key
(`data?.organisationUnits`) rather than using `data` directly.

---

## Partial types

DHIS2 API responses are partial by nature — you request only the fields you need via the
`fields` parameter. Cast to `Pick` or a subset type to make this explicit:

```typescript
type OrgUnitSummary = Pick<D2OrganisationUnit, 'id' | 'displayName' | 'level'>

type OrgUnitResponse = {
    organisationUnits: OrgUnitSummary[]
}
```

This documents which fields are actually present and prevents accidental access of fields
that weren't fetched.

---

## Exploring available types

The package exports types for most standard DHIS2 resources. Names follow the pattern
`D2<ResourceName>` (e.g. `D2DataElement`, `D2Program`, `D2TrackedEntityType`).

Browse available types:

```bash
npx opensrc path dhis2/dhis2-api-types
# Then look at the index file or search for the resource you need
rg "export type D2" "$(npx opensrc path dhis2/dhis2-api-types)"
```

---

## When types aren't available

Not all DHIS2 resources have types in `@dhis2/dhis2-api-types`, and some custom or
implementation-specific endpoints won't be covered. In those cases, define the type
manually from the source you read with opensrc. The source is always the authority:

```typescript
// Derived from reading the DTO in dhis2-core source
type DataSetReport = {
    dataSet: { id: string; displayName: string }
    period: string
    organisationUnit: { id: string; displayName: string }
    dataValues: Array<{
        dataElement: string
        value: string
    }>
}
```

Keep manually defined types close to the hook or component that uses them — not in a
global `types.ts` file — unless multiple files need the same shape.
