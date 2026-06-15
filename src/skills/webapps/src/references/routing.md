# Routing and Page Layout

DHIS2 apps run inside an iframe in the DHIS2 Global Shell, so they must use hash
routing (`createHashRouter`) to avoid conflicts with the platform's own routing.

## Recommended approach

We strongly recommend setting up a sidebar-based layout for navigation. Most DHIS2
apps grow into multi-page applications, and a sidebar gives users a consistent,
familiar way to move between sections — matching what they see in other DHIS2 apps.

Read `ui-patterns/sidebar.md` for the full implementation. It includes the sidebar
components, the page layout grid, a content width wrapper, route handles for
layout control (`collapseSidebar`, `fullWidth`), and the complete router wiring.

## URL as state — deep linking with query parameters

Store user selections as query parameters so that URLs are shareable and bookmarkable.
When a user picks a programme, org unit, or other context, reflect it in the URL
immediately — e.g. `#/enrollments?programId=IpHINAT79UW&orgUnitId=DiszpKrYNg8`.

Use `useSearchParams` from React Router to read and write query parameters:

```tsx
import { useSearchParams } from 'react-router-dom'

const [searchParams, setSearchParams] = useSearchParams()
const programId = searchParams.get('programId')

// Update a param (merges with existing params)
setSearchParams((prev) => {
    prev.set('programId', selectedId)
    return prev
})
```

This pattern makes the app feel stateless from the user's perspective — refreshing the
page, sharing the link, or pressing back all preserve exactly the state they expect.
