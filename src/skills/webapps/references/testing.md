# Testing DHIS2 Apps

Use **Jest** and **React Testing Library** for all component and hook tests. Tests live
alongside their source file (`useApps.test.ts` next to `useApps.ts`).

## What to read

| Scenario                                        | Section                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Component renders data from `useDataQuery`      | [Wrapping with CustomProvider](#wrapping-with-customprovider)                |
| Component uses TanStack Query hooks             | [CustomProvider + QueryClientProvider](#customprovider--queryclientprovider) |
| Mocking a custom hook's return value            | [Mocking a hook](#mocking-a-hook)                                            |
| Mocking a mutation (`useDataMutation`)          | [Mocking mutations](#mocking-mutations)                                      |
| Mocking `useConfig` or other app-runtime hooks  | [Mocking app-runtime hooks](#mocking-app-runtime-hooks)                      |
| Testing alerts shown via `useAlert`             | [Testing alerts](#testing-alerts)                                            |
| Testing navigation (`useNavigate`, `useParams`) | [Mocking navigation](#mocking-navigation)                                    |
| Testing loading / error states                  | [Testing loading and error states](#testing-loading-and-error-states)        |
| Testing a custom hook in isolation              | [Testing hooks directly](#testing-hooks-directly)                            |
| Clicking, typing, async interactions            | [User interactions](#user-interactions)                                      |
| Querying the DOM                                | [Querying the DOM](#querying-the-dom)                                        |

**Default rule:** test what the user sees, not how the code works internally. Mock at the
boundary (network, auth, third-party SDKs) — not at the hook or component level. Every
extra mock reduces confidence that the integration actually works.

---

## Jest setup

Create a `jest.setup.js` at the project root and reference it in `jest.config.js` via
`setupFilesAfterFramework`. Two things every DHIS2 project needs:

```js
import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'

configure({ testIdAttribute: 'data-test' })
```

`@dhis2/ui` uses `data-test`, not `data-testid`. Without this config, `getByTestId` will
not find DHIS2 UI components.

---

## Wrapping with CustomProvider

Most DHIS2 components and hooks require context from `@dhis2/app-runtime`. Wrap every
test in a render helper — do not call `render()` bare.

Use `CustomDataProvider` with `failOnMiss: true` so that any resource key accessed in a
test but not present in `data` throws immediately rather than silently returning undefined:

```tsx
import { CustomDataProvider, Provider } from '@dhis2/app-runtime'
import { render } from '@testing-library/react'
import { MockAlertStack } from './MockAlertStack'

export const renderWithProvider = (ui: React.ReactElement, data = {}) =>
    render(
        <Provider
            config={{ baseUrl: 'http://localhost:8080', apiVersion: 41 }}
            plugin={false}
            parentAlertsAdd={() => undefined}
            showAlertsInPlugin={true}
        >
            <CustomDataProvider data={data} options={{ failOnMiss: true }}>
                {ui}
                <MockAlertStack />
            </CustomDataProvider>
        </Provider>
    )
```

To mock `useDataQuery` responses, pass a `data` object — the key matches the `resource`
in your query. Do not mock `useDataQuery` at the module level; use `data` instead:

```tsx
renderWithProvider(<AppList />, {
    apps: {
        apps: [
            { key: 'app-1', displayName: 'App One', version: '1.0.0' },
            { key: 'app-2', displayName: 'App Two', version: '2.0.0' },
        ],
    },
})
```

---

## CustomProvider + QueryClientProvider

If the component uses TanStack Query, add a `QueryClientProvider` inside the wrapper.
Always set `retry: false` — without it, failing queries retry 3 times and slow the suite:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    })
    return ({ children }: { children: React.ReactNode }) => (
        <Provider config={{ baseUrl: 'http://localhost:8080', apiVersion: 41 }}>
            <CustomDataProvider data={{}} options={{ failOnMiss: true }}>
                <QueryClientProvider client={queryClient}>
                    {children}
                </QueryClientProvider>
            </CustomDataProvider>
        </Provider>
    )
}
```

---

## Mocking a hook

Only mock at the hook level when the hook wraps TanStack Query or does its own async
work that can't be controlled through `CustomDataProvider`. Use `jest.mock` at the module
level, then `jest.spyOn` per test:

```tsx
import * as useAppsModule from '@/hooks/useApps'

jest.mock('@/hooks/useApps')

it('renders a list of apps', () => {
    jest.spyOn(useAppsModule, 'useApps').mockReturnValue({
        apps: [{ key: 'app-1', displayName: 'App One' }],
        isLoading: false,
        error: null,
    })

    renderWithProvider(<AppList />)
    expect(screen.getByText('App One')).toBeInTheDocument()
})
```

---

## Mocking mutations

`useDataMutation` returns a `[mutateFn, { loading, error }]` tuple — mock the whole hook,
not just `useDataEngine`. Reset mocks after each test:

```tsx
import { useDataMutation } from '@dhis2/app-runtime'

jest.mock('@dhis2/app-runtime', () => ({
    ...jest.requireActual('@dhis2/app-runtime'),
    useDataMutation: jest.fn(),
}))

const mutateSpy = jest.fn()

beforeEach(() => {
    jest.mocked(useDataMutation).mockReturnValue([
        mutateSpy,
        { loading: false, error: null },
    ])
})

afterEach(() => {
    jest.resetAllMocks()
})
```

To test error UI, reject the mutate spy in a specific test:

```tsx
mutateSpy.mockImplementationOnce(() =>
    Promise.reject({
        details: {
            response: {
                errorReports: [{ message: 'Property `name` already exists' }],
            },
        },
    })
)
await user.click(getByText('Save'))
expect(getByText(/Failed to save: Property `name`/)).toBeInTheDocument()
```

---

## Mocking app-runtime hooks

Mock individual hooks from `@dhis2/app-runtime` while keeping the rest real. Use
`jest.mocked()` for TypeScript-aware access to the mock:

```tsx
import { useConfig } from '@dhis2/app-runtime'

jest.mock('@dhis2/app-runtime', () => ({
    ...jest.requireActual('@dhis2/app-runtime'),
    useConfig: jest.fn(),
}))

beforeEach(() => {
    jest.mocked(useConfig).mockReturnValue({
        baseUrl: 'http://localhost:8080',
        apiVersion: 41,
        serverVersion: { major: 2, minor: 41, full: '2.41.0' },
    } as ReturnType<typeof useConfig>)
})
```

Override per test to exercise version-gated code paths:

```tsx
it('shows OAuth2 option on DHIS2 2.42+', async () => {
    jest.mocked(useConfig).mockReturnValue({
        baseUrl: 'http://localhost:8080',
        apiVersion: 42,
        serverVersion: { major: 2, minor: 42, full: '2.42.0' },
    } as ReturnType<typeof useConfig>)
    // ...
})
```

---

## Testing alerts

Include a `MockAlertStack` component inside the provider wrapper. It renders alert
messages into the DOM so you can assert them with normal `getByText`:

```tsx
import { useAlerts } from '@dhis2/app-runtime'

export const MockAlertStack = () => {
    const alerts = useAlerts()
    return (
        <div>
            {alerts.map((alert) => (
                <div key={alert.id}>
                    {alert.message}
                    {alert?.options?.actions?.map((action, i) => (
                        <button key={i} onClick={action.onClick}>
                            {action.label}
                        </button>
                    ))}
                </div>
            ))}
        </div>
    )
}
```

Place `<MockAlertStack />` as a sibling to the component under test inside the provider
(see [Wrapping with CustomProvider](#wrapping-with-customprovider)). Then assert normally:

```tsx
expect(screen.getByText('Route saved successfully')).toBeInTheDocument()
```

---

## Mocking navigation

Mock `react-router` hooks to assert that navigation happened without needing a real
router history:

```tsx
import { useNavigate, useParams } from 'react-router'

jest.mock('react-router', () => ({
    ...jest.requireActual('react-router'),
    useNavigate: jest.fn(),
    useParams: jest.fn(),
}))

const navigateSpy = jest.fn()

beforeEach(() => {
    jest.mocked(useNavigate).mockReturnValue(navigateSpy)
    jest.mocked(useParams).mockReturnValue({})
})

// assert navigation:
expect(navigateSpy).toHaveBeenCalledWith('/')
// assert back navigation:
expect(navigateSpy).toHaveBeenCalledWith(-1)
```

---

## Testing loading and error states

Always test that the component renders a loader while data is in flight and an error
message when something goes wrong — do not assume the happy path covers enough:

```tsx
it('shows a loader while fetching', () => {
    jest.spyOn(useAppsModule, 'useApps').mockReturnValue({
        apps: undefined,
        isLoading: true,
        error: null,
    })

    renderWithProvider(<AppList />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
})

it('shows an error when the fetch fails', () => {
    jest.spyOn(useAppsModule, 'useApps').mockReturnValue({
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

Prefer testing hooks through their UI side effects. Test a hook directly only for edge
cases or when it is a standalone reusable utility. Use `renderHook` from RTL:

```tsx
import { renderHook, waitFor } from '@testing-library/react'

it('returns a list of apps', async () => {
    const { result } = renderHook(() => useApps(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.apps).toHaveLength(2)
})
```

---

## User interactions

Always call `userEvent.setup()` per test — do not use the static `userEvent.*` methods
directly (they are deprecated in userEvent v14):

```tsx
import userEvent from '@testing-library/user-event'

it('submits the form', async () => {
    const user = userEvent.setup()
    const { getByText, getByTestId } = renderWithProvider(<MyForm />)

    await user.type(
        within(getByTestId('input-name')).getByRole('textbox'),
        'My Route'
    )
    await user.click(getByText('Save'))

    expect(mutateSpy).toHaveBeenCalledWith({ data: { name: 'My Route' } })
})
```

Use `findBy*` queries to wait for async data to appear before interacting or asserting.
`getBy*` throws immediately if the element isn't present — `findBy*` polls until it is:

```tsx
const { findByText, getByText } = renderWithProvider(<EditRoute />)

await findByText('Edit route: route-x') // waits for async load to complete
await user.click(getByText('Save'))
```

---

## Querying the DOM

- Use `screen.getByRole` as the default — role-based queries match how a user or screen
  reader experiences the UI and are resilient to markup changes.
- Use `getByTestId` for elements with no semantic role. DHIS2 UI components use
  `data-test` (not `data-testid`) — configure this in `jest.setup.js` (see
  [Jest setup](#jest-setup)).
- Use `within()` to scope a query to a specific container when the same role or text
  appears multiple times on the page:

```tsx
import { within } from '@testing-library/react'

await user.click(within(getByTestId('select-authentication')).getByText('None'))
await user.click(within(getByTestId('popover-actions')).getByLabelText('Edit'))
```
