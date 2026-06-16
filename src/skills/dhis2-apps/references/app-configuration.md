# App Configuration

DHIS2 apps need admin-configurable settings to remain generalizable across instances —
which program to use, which org unit level to display, feature toggles, etc. Store these
in DataStore so the app works on any DHIS2 instance without code changes.

**Three rules that apply to every app configuration implementation:**

1. **Tell the user what's missing.** If config is absent, show a `NoticeBox` naming the
   exact setting that's missing and how to fix it — not a blank screen or a cryptic error.
2. **Gate the setup screen behind the right authority.** Only admin users should be able
   to reach or save config. See § Protecting config from unauthorized changes.
3. **Never hardcode instance-specific IDs.** Every program ID, data element ID, org unit
   ID, or option set ID must come from admin configuration — not from the source code.

## Namespace

Use your app name as the DataStore namespace. Define it as a constant so it's consistent
across all DataStore/UserDataStore calls:

```typescript
// src/constants.ts
export const APP_NAMESPACE = 'my-app'
```

Declare it in `d2.config.js` too so the App Hub can track ownership:

```javascript
const config = {
    type: 'app',
    name: 'my-app',
    dataStoreNamespace: 'my-app',
    // ...
}
```

## Config structure

Split config by who sets it:

| Config type                                       | Storage                                 | Scope        |
| ------------------------------------------------- | --------------------------------------- | ------------ |
| App settings (program, org unit level, etc.)      | `dataStore/<namespace>/config`          | All users    |
| User preferences (column visibility, theme, etc.) | `userDataStore/<namespace>/preferences` | Current user |

Store DHIS2 metadata by **ID, not name** — IDs are stable across renames.

## First-run check

On app boot, query the config key. A 404 means the app has never been configured —
show the setup screen instead of the main UI:

```typescript
// src/hooks/useAppConfig.ts
import { useApiDataQuery } from '@/utils/useApiDataQuery'
import { APP_NAMESPACE } from '@/constants'

export type AppConfig = {
    programId: string
    orgUnitLevelId: string
}

export const useAppConfig = () => {
    const {
        data: config,
        error,
        isLoading,
        refetch,
    } = useApiDataQuery<AppConfig>({
        queryKey: ['app-config'],
        query: { resource: `dataStore/${APP_NAMESPACE}/config` },
        // Don't retry on 404 — it means config doesn't exist yet
        retry: (_, err) => (err as any)?.httpStatusCode !== 404,
    })

    const isConfigured = Boolean(config)
    const notConfigured = !isLoading && !config

    return { config, isConfigured, notConfigured, isLoading, error, refetch }
}
```

Wire it in `App.tsx` (or a root layout component). Always handle the error state too —
don't let a DataStore failure silently swallow the app:

```tsx
import { CircularLoader, NoticeBox } from '@dhis2/ui'
import i18n from '@dhis2/d2-i18n'
import { useAppConfig } from '@/hooks/useAppConfig'
import { SetupScreen } from '@/components/SetupScreen'

const AppContent = () => {
    const { config, notConfigured, isLoading, error, refetch } = useAppConfig()

    if (isLoading) {
        return <CircularLoader />
    }

    if (error) {
        return (
            <NoticeBox error title={i18n.t('Failed to load app configuration')}>
                {error.message || i18n.t('An unknown error occurred.')}
            </NoticeBox>
        )
    }

    if (notConfigured) {
        return <SetupScreen onComplete={refetch} />
    }

    return <MainRoutes config={config} />
}
```

The `SetupScreen` must tell the admin exactly what needs to be configured — never show
a blank form without context. Add a heading and a short explanation:

```tsx
<NoticeBox title={i18n.t('Setup required')}>
    {i18n.t(
        'This app needs to be configured before it can be used. Select the program and org unit level below.'
    )}
</NoticeBox>
```

## Setup screen

The setup screen must use DHIS2 metadata pickers — never hardcode instance-specific IDs
or names. Fetch the options from the API and let the admin choose:

```tsx
// src/components/SetupScreen.tsx
import { Button, SingleSelectField, SingleSelectOption } from '@dhis2/ui'
import { Form, Field } from 'react-final-form'
import i18n from '@dhis2/d2-i18n'
import { hasValue } from '@dhis2/ui'
import { usePrograms } from '@/hooks/usePrograms'
import { useSaveAppConfig } from '@/hooks/useSaveAppConfig'
import type { AppConfig } from '@/hooks/useAppConfig'

type SetupScreenProps = {
    onComplete: () => void
}

export const SetupScreen = ({ onComplete }: SetupScreenProps) => {
    const { programs, isLoading: programsLoading } = usePrograms()
    const { saveConfig, isSaving } = useSaveAppConfig({ onSuccess: onComplete })

    return (
        <Form<AppConfig> onSubmit={saveConfig}>
            {({ handleSubmit }) => (
                <form onSubmit={handleSubmit}>
                    <Field
                        name="programId"
                        component={SingleSelectFieldFF}
                        label={i18n.t('Program')}
                        validate={hasValue}
                        loading={programsLoading}
                    >
                        {programs?.map((p) => (
                            <SingleSelectOption
                                key={p.id}
                                label={p.displayName}
                                value={p.id}
                            />
                        ))}
                    </Field>
                    <Button type="submit" primary loading={isSaving}>
                        {i18n.t('Save configuration')}
                    </Button>
                </form>
            )}
        </Form>
    )
}
```

For new apps using React Hook Form, replace `Form`/`Field` with `useForm` + `Controller`
(see `references/ui-patterns/forms.md`).

## Saving config

Use `create` on first save, `update` on subsequent saves. Pass `isConfigured` from
`useAppConfig` to branch:

```typescript
// src/hooks/useSaveAppConfig.ts
import { useDataEngine } from '@dhis2/app-runtime'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { APP_NAMESPACE } from '@/constants'
import type { AppConfig } from '@/hooks/useAppConfig'

export const useSaveAppConfig = ({
    isConfigured,
    onSuccess,
}: {
    isConfigured: boolean
    onSuccess?: () => void
}) => {
    const engine = useDataEngine()
    const queryClient = useQueryClient()

    const { mutate: saveConfig, isPending: isSaving } = useMutation(
        (config: AppConfig) =>
            engine.mutate({
                resource: `dataStore/${APP_NAMESPACE}/config`,
                type: isConfigured ? 'update' : 'create',
                data: config,
            }),
        {
            onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: ['app-config'] })
                onSuccess?.()
            },
        }
    )

    return { saveConfig, isSaving }
}
```

## Protecting config from unauthorized changes

Gate the setup screen and save action behind the appropriate authority — typically
`F_SYSTEM_SETTING` or an app-specific authority. See `references/access-control.md`.

Encrypt sensitive config values at rest:

```typescript
engine.mutate({
    resource: `dataStore/${APP_NAMESPACE}/config`,
    type: 'create',
    params: { encrypt: true },
    data: config,
})
```

See `references/security.md` for the full DataStore security rules.
