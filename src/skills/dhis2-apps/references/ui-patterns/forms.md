# Forms

Use **React Hook Form** for form state management and **Zod** for schema validation.
Mutations go through TanStack Query with `useDataEngine` (see `references/data-fetching.md`
for the mutation pattern). Wire `@dhis2/ui` inputs to React Hook Form via `Controller`
since they don't expose a standard `ref`.

```tsx
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
    Button,
    ButtonStrip,
    InputField,
    Modal,
    ModalActions,
    ModalContent,
    ModalTitle,
    SingleSelectField,
    SingleSelectOption,
} from '@dhis2/ui'
import i18n from '@dhis2/d2-i18n'
import { useNavigationBlocker } from '@/hooks/useNavigationBlocker'

const schema = z.object({
    name: z.string().min(1, { message: i18n.t('Name is required') }),
    shortName: z.string().min(1, { message: i18n.t('Short name is required') }),
    valueType: z.string().min(1, { message: i18n.t('Select a value type') }),
})

type FormValues = z.infer<typeof schema>

type DataElementFormProps = {
    onSubmit: (values: FormValues) => void
    isPending?: boolean
}

const DataElementForm = ({ onSubmit, isPending }: DataElementFormProps) => {
    const {
        control,
        handleSubmit,
        formState: { isDirty },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: '', shortName: '', valueType: '' },
    })

    const {
        showConfirmModal,
        handleConfirmNavigation,
        handleCancelNavigation,
    } = useNavigationBlocker({ shouldBlock: isDirty })

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <Controller
                name="name"
                control={control}
                render={({ field, fieldState }) => (
                    <InputField
                        {...field}
                        label={i18n.t('Name')}
                        onChange={({ value }) => field.onChange(value)}
                        error={!!fieldState.error}
                        validationText={fieldState.error?.message}
                    />
                )}
            />
            <Controller
                name="shortName"
                control={control}
                render={({ field, fieldState }) => (
                    <InputField
                        {...field}
                        label={i18n.t('Short name')}
                        onChange={({ value }) => field.onChange(value)}
                        error={!!fieldState.error}
                        validationText={fieldState.error?.message}
                    />
                )}
            />
            <Controller
                name="valueType"
                control={control}
                render={({ field, fieldState }) => (
                    <SingleSelectField
                        label={i18n.t('Value type')}
                        selected={field.value}
                        onChange={({ selected }) => field.onChange(selected)}
                        error={!!fieldState.error}
                        validationText={fieldState.error?.message}
                    >
                        <SingleSelectOption label="Text" value="TEXT" />
                        <SingleSelectOption label="Number" value="NUMBER" />
                        <SingleSelectOption label="Boolean" value="BOOLEAN" />
                    </SingleSelectField>
                )}
            />
            <ButtonStrip>
                <Button
                    type="submit"
                    primary
                    loading={isPending}
                    disabled={isPending}
                >
                    {i18n.t('Save')}
                </Button>
            </ButtonStrip>
            {showConfirmModal && (
                <Modal>
                    <ModalTitle>{i18n.t('Unsaved changes')}</ModalTitle>
                    <ModalContent>
                        {i18n.t(
                            'You have unsaved changes. Are you sure you want to leave?'
                        )}
                    </ModalContent>
                    <ModalActions>
                        <ButtonStrip end>
                            <Button onClick={handleCancelNavigation}>
                                {i18n.t('Stay')}
                            </Button>
                            <Button
                                destructive
                                onClick={handleConfirmNavigation}
                            >
                                {i18n.t('Leave')}
                            </Button>
                        </ButtonStrip>
                    </ModalActions>
                </Modal>
            )}
        </form>
    )
}
```

## Help text and placeholders

`InputField` accepts `helpText` for instructional copy beneath the field and `placeholder`
for greyed-out hint text inside the input. Both are optional but improve usability for
non-obvious fields:

```tsx
<InputField
    label={i18n.t('Short name')}
    helpText={i18n.t('Used in exports and reports. Max 50 characters.')}
    placeholder={i18n.t('e.g. Facility count')}
    onChange={({ value }) => field.onChange(value)}
    {...field}
/>
```

Use `helpText` for constraints or context the label alone can't convey. Use `placeholder`
sparingly — it disappears when the user types and shouldn't carry information that's needed
after that point.

## Async select options

When select options come from the API, always guard against the options not being loaded yet.
A `SingleSelectField` with a `selected` value that doesn't exist in the rendered options
list shows a blank selection — confusing to users.

Pattern: fetch options, show `loading` state on the field while fetching, and only render
`SingleSelectOption` children once data is available. Pass `selected` at all times — the
field handles the case where the matching option hasn't rendered yet as long as you keep
`loading` true until it has.

```tsx
import { CircularLoader, SingleSelectField, SingleSelectOption } from '@dhis2/ui'

// In a parent component or hook:
const { data, isLoading } = useValueTypes() // fetches from DHIS2 API

// Render:
<Controller
    name="valueType"
    control={control}
    render={({ field, fieldState }) => (
        <SingleSelectField
            label={i18n.t('Value type')}
            helpText={i18n.t('Determines what kind of data can be entered.')}
            selected={field.value}
            onChange={({ selected }) => field.onChange(selected)}
            error={Boolean(fieldState.error)}
            validationText={fieldState.error?.message}
            loading={isLoading}
        >
            {data?.valueTypes.map((vt) => (
                <SingleSelectOption
                    key={vt.id}
                    label={vt.displayName}
                    value={vt.id}
                />
            ))}
        </SingleSelectField>
    )}
/>
```

Check `SingleSelectField`'s actual props with opensrc before use — the `loading` prop
renders a spinner inside the dropdown and disables selection while options are in flight.
If the version in use doesn't have `loading`, disable the field with `disabled={isLoading}`
and render a `CircularLoader` alongside it instead.

> **Avoid setting a default `selected` value before options load.** If you prefill
> `defaultValues` in React Hook Form with an id that doesn't yet exist in the rendered
> options, the select shows a blank. Either set `defaultValues` to `''` and patch in the
> real value once data arrives (`reset()` or `setValue()`), or wait until options are loaded
> before rendering the form at all.

## Modal vs. dedicated page

Match form complexity to its container. Simple, low-field forms (e.g. rename, quick
create) work well in a modal. For larger or multi-step forms, navigate to a dedicated
page instead — this gives full control over layout, validation feedback, and navigation
blocking. The convention is to append `/new` to the current route (e.g. `/data-elements/new`)
and navigate there on "Create new" actions. See `references/routing.md` for route setup.

## Key points

- Spread `{...field}` then override `onChange` — `@dhis2/ui` uses `onChange({ value })`, not `onChange(event)`. `SingleSelectField` uses `selected` / `onChange({ selected })` instead.
- Use `fieldState` from Controller render props for error display.
- `InputField` bundles label + validation text. For simple modal forms, `Input` + `Label` with manual error display works too.
- Use `FormProvider` + `useFormContext` when a form spans multiple components.
- Pass `loading` and `disabled` to submit buttons from mutation pending state.

## Blocking navigation on unsaved changes

Prevent users from accidentally leaving a form with unsaved edits. Use React Router's
`useBlocker` wrapped in a custom hook that exposes a confirmation modal trigger:

```tsx
import { useBlocker } from 'react-router-dom'
import { useCallback } from 'react'

export const useNavigationBlocker = ({
    shouldBlock,
}: {
    shouldBlock: boolean
}) => {
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            shouldBlock && currentLocation.pathname !== nextLocation.pathname
    )

    const handleConfirmNavigation = useCallback(() => {
        if (blocker.state === 'blocked') blocker.proceed()
    }, [blocker])

    const handleCancelNavigation = useCallback(() => {
        if (blocker.state === 'blocked') blocker.reset?.()
    }, [blocker])

    return {
        showConfirmModal: blocker.state === 'blocked',
        handleConfirmNavigation,
        handleCancelNavigation,
    }
}
```

Pass `isDirty` from React Hook Form's `formState` as `shouldBlock`, and render a
confirmation dialog when `showConfirmModal` is true.
