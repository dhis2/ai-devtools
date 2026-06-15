# Testing DHIS2 Apps

Use **React Testing Library** (RTL) for component and hook tests. DHIS2 apps scaffold
with Vitest (or Jest depending on the template) — check `package.json` for the test runner.

Tests live alongside their source file:

```
src/
  hooks/
    useApps.ts
    useApps.test.ts
  components/
    AppList.tsx
    AppList.test.tsx
```

---

## Wrapping with CustomProvider

Most DHIS2 components and hooks rely on context from `@dhis2/app-runtime` —
`useDataEngine`, `useConfig`, `useAlert`, etc. Wrap all tests that use these in
`CustomProvider`:

```tsx
import { CustomProvider } from '@dhis2/app-runtime'
import { render } from '@testing-library/react'

const renderWithProvider = (ui: React.ReactElement) =>
    render(
        <CustomProvider
            config={{
                baseUrl: 'http://localhost:8080',
                apiVersion: 41,
            }}
        >
            {ui}
        </CustomProvider>
    )
```

Add `QueryClientProvider` too if the component uses TanStack Query:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    })
    return ({ children }: { children: React.ReactNode }) => (
        <CustomProvider
            config={{ baseUrl: 'http://localhost:8080', apiVersion: 41 }}
        >
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </CustomProvider>
    )
}
```

Set `retry: false` on the test `QueryClient` — otherwise failing queries retry 3 times
and slow down the test suite significantly.

---

## Mocking data fetching

### Mocking useDataQuery (app-runtime)

Pass a `data` prop to `CustomProvider` to mock `useDataQuery` responses:

```tsx
<CustomProvider
    config={{ baseUrl: 'http://localhost:8080', apiVersion: 41 }}
    data={{
        apps: {
            apps: [
                { key: 'app-1', displayName: 'App One', version: '1.0.0' },
                { key: 'app-2', displayName: 'App Two', version: '2.0.0' },
            ],
        },
    }}
>
    <AppList />
</CustomProvider>
```

The key in the `data` object matches the `resource` in your `useDataQuery` call.

### Mocking useApiDataQuery (TanStack Query wrapper)

For hooks that wrap TanStack Query, mock at the module level with `vi.mock` (Vitest)
or `jest.mock` (Jest):

```tsx
import { vi } from 'vitest'
import * as useAppsModule from '@/hooks/useApps'

vi.mock('@/hooks/useApps')

it('renders a list of apps', () => {
    vi.spyOn(useAppsModule, 'useApps').mockReturnValue({
        apps: [{ key: 'app-1', displayName: 'App One' }],
        isLoading: false,
        error: null,
    })

    renderWithProvider(<AppList />)
    expect(screen.getByText('App One')).toBeInTheDocument()
})
```

### Mocking mutations

Mock `useDataEngine` to intercept mutation calls:

```tsx
import { useDataEngine } from '@dhis2/app-runtime'

vi.mock('@dhis2/app-runtime', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@dhis2/app-runtime')>()
    return {
        ...actual,
        useDataEngine: () => ({
            mutate: vi.fn().mockResolvedValue({ status: 'OK' }),
        }),
    }
})
```

---

## Testing loading and error states

Test that your component renders a loader while data is in flight and an error message
when something goes wrong:

```tsx
it('shows a loader while fetching', () => {
    vi.spyOn(useAppsModule, 'useApps').mockReturnValue({
        apps: undefined,
        isLoading: true,
        error: null,
    })

    renderWithProvider(<AppList />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
})

it('shows an error when the fetch fails', () => {
    vi.spyOn(useAppsModule, 'useApps').mockReturnValue({
        apps: undefined,
        isLoading: false,
        error: new Error('Network error'),
    })

    renderWithProvider(<AppList />)
    expect(screen.getByText(/error loading/i)).toBeInTheDocument()
})
```

---

## Testing hooks directly

Use `renderHook` from RTL to test custom hooks in isolation:

```tsx
import { renderHook, waitFor } from '@testing-library/react'

it('returns a list of apps', async () => {
    const { result } = renderHook(() => useApps(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.apps).toHaveLength(2)
})
```

---

## Key points

- Always set `retry: false` on the test `QueryClient` to prevent slow retries
- Use `screen.getByRole` over `getByTestId` where possible — role-based queries are more
  resilient to markup changes and closer to how users experience the UI
- Avoid testing implementation details (internal state, private functions) — test behavior
  that's visible to the user or to callers
- If a test requires a real DHIS2 instance, mark it clearly or skip it in CI with
  `it.skip` / environment guards
