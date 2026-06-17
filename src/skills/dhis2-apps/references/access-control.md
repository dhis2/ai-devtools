# Access Control

DHIS2 uses authority strings to gate features. Fetch the current user's authorities and
check them to conditionally render UI or block actions.

## Fetching the current user

Query the `me` endpoint with the fields you need. Always include `authorities`:

```typescript
import { useApiDataQuery } from '@/utils/useApiDataQuery'

type CurrentUser = {
    me: {
        id: string
        username: string
        authorities: string[]
    }
}

export const useCurrentUser = () => {
    const { data, isLoading, error } = useApiDataQuery<CurrentUser>({
        queryKey: ['me'],
        query: {
            resource: 'me',
            params: { fields: 'id,username,authorities' },
        },
        staleTime: Infinity,
        cacheTime: Infinity,
    })

    return {
        currentUser: data?.me,
        isLoading,
        error,
    }
}
```

Cache `me` aggressively (`staleTime: Infinity`) — authorities don't change during a
session.

## Checking authorities

Authority strings are feature-specific (e.g. `F_ROUTE_PUBLIC_ADD`, `F_ROUTE_DELETE`).
The special string `ALL` grants every authority. Always check for both:

```typescript
const hasAuthority = (authorities: string[], required: string) =>
    authorities.includes('ALL') || authorities.includes(required)
```

## Gating UI

Check the authority before rendering actions. Do not rely on the server rejecting
unauthorized requests as the only guard — hide or disable the UI too:

```tsx
const { currentUser } = useCurrentUser()

const canCreate = currentUser
    ? hasAuthority(currentUser.authorities, 'F_ROUTE_PUBLIC_ADD')
    : false

return (
    <div>
        {canCreate && (
            <Button onClick={onCreateNew}>{i18n.t('New route')}</Button>
        )}
    </div>
)
```

Show nothing (or a disabled state) while `currentUser` is loading — don't assume access
before the check completes.

## Finding authority strings

Authority strings are defined in the DHIS2 backend. To find the string for a feature:

```bash
CORE=$(npx opensrc path dhis2/dhis2-core)
rg "F_ROUTE" "$CORE" --include="*.java" -l
```

Or check the DHIS2 source in `dhis-2/dhis-services/dhis-service-core/src/main/resources/`
for `authorities.xml` or similar.
