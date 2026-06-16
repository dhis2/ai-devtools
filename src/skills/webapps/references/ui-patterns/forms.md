# Forms

## Which form library to use

Before writing any form code, check `package.json` to see which library is already in use:

| Already in `package.json`              | Pattern to follow                                               |
| -------------------------------------- | --------------------------------------------------------------- |
| `react-final-form` / `@dhis2/ui-forms` | [Final Form + ui-forms](#final-form--ui-forms)                  |
| `react-hook-form`                      | [React Hook Form + Zod](#react-hook-form--zod)                  |
| Neither                                | Use [React Hook Form + Zod](#react-hook-form--zod) for new apps |

Do not mix both libraries in the same app.

---

## Final Form + ui-forms

Most existing DHIS2 apps use `react-final-form` with `@dhis2/ui-forms`. The `@dhis2/ui-forms`
package ships `FF`-suffixed components (`InputFieldFF`, `SingleSelectFieldFF`, etc.) that
are purpose-built Final Form field adapters — pass them directly as the `component` prop
on `Field`, no `Controller` wrapper needed.

`@dhis2/ui-forms` is re-exported from `@dhis2/ui`, so import everything from `@dhis2/ui`:

```tsx
import {
    InputFieldFF,
    SingleSelectFieldFF,
    SwitchFieldFF,
    TextAreaFieldFF,
    hasValue,
    composeValidators,
    email,
    number,
} from '@dhis2/ui'
import { Form, Field } from 'react-final-form'
import i18n from '@dhis2/d2-i18n'

const MyForm = ({ onSubmit }) => (
    <Form onSubmit={onSubmit}>
        {({ handleSubmit, submitting, pristine }) => (
            <form onSubmit={handleSubmit}>
                <Field
                    name="name"
                    component={InputFieldFF}
                    label={i18n.t('Name')}
                    validate={hasValue}
                />
                <Field
                    name="email"
                    component={InputFieldFF}
                    label={i18n.t('Email')}
                    validate={composeValidators(hasValue, email)}
                />
                <Field
                    name="valueType"
                    component={SingleSelectFieldFF}
                    label={i18n.t('Value type')}
                    validate={hasValue}
                >
                    <SingleSelectOption label="Text" value="TEXT" />
                    <SingleSelectOption label="Number" value="NUMBER" />
                </Field>
                <Button
                    type="submit"
                    primary
                    loading={submitting}
                    disabled={submitting || pristine}
                >
                    {i18n.t('Save')}
                </Button>
            </form>
        )}
    </Form>
)
```

### Available FF components

| Component             | Use for                       |
| --------------------- | ----------------------------- |
| `InputFieldFF`        | Text, number, password inputs |
| `TextAreaFieldFF`     | Multi-line text               |
| `SingleSelectFieldFF` | Single-choice dropdown        |
| `MultiSelectFieldFF`  | Multi-choice dropdown         |
| `SwitchFieldFF`       | Boolean toggle                |
| `CheckboxFieldFF`     | Boolean checkbox              |
| `RadioFieldFF`        | Radio button group            |

### Built-in validators

Import from `@dhis2/ui` — compose with `composeValidators`:

```tsx
import { hasValue, email, number, integer, url, composeValidators } from '@dhis2/ui'

validate={composeValidators(hasValue, email)}
```

Available: `hasValue`, `email`, `number`, `integer`, `url`, `alphaNumeric`,
`dhis2Password`, `dhis2Username`, `internationalPhoneNumber`, `createMaxCharacterLength(n)`,
`createMinCharacterLength(n)`, `createMaxNumber(n)`, `createMinNumber(n)`.

---

## React Hook Form + Zod

Use for new apps not already using Final Form. Mutations go through TanStack Query with
`useDataEngine` (see `references/data-fetching.md` for the mutation pattern). Wire
`@dhis2/ui` inputs via `Controller` since they don't expose a standard `ref`.

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

## MultiSelect

Use `MultiSelectField` + `MultiSelectOption` for fields where the user picks multiple
values. Wire it to React Hook Form the same way as `SingleSelectField` — the value is a
`string[]`:

```tsx
import { MultiSelectField, MultiSelectOption } from '@dhis2/ui'
;<Controller
    name="authorities"
    control={control}
    render={({ field, fieldState }) => (
        <MultiSelectField
            label={i18n.t('Authorities')}
            selected={field.value ?? []}
            onChange={({ selected }) => field.onChange(selected)}
            error={Boolean(fieldState.error)}
            validationText={fieldState.error?.message}
            filterable
            clearable
        >
            {authorities.map((a) => (
                <MultiSelectOption
                    key={a.id}
                    label={a.displayName}
                    value={a.id}
                />
            ))}
        </MultiSelectField>
    )}
/>
```

`filterable` adds a search box inside the dropdown. `clearable` adds an × to reset the
selection. Both are recommended for lists longer than ~5 items.

For Final Form apps, use `MultiSelectFieldFF` instead — it handles the wiring automatically
(see [Final Form + ui-forms](#final-form--ui-forms)).

## Field wrapper for custom inputs

When a component from `@dhis2/ui` doesn't come with a built-in label and validation
display, wrap it in `Field` to get consistent label, help text, and error styling:

```tsx
import { Field, Switch } from '@dhis2/ui'
;<Controller
    name="disabled"
    control={control}
    render={({ field, fieldState }) => (
        <Field
            label={i18n.t('Disabled')}
            helpText={i18n.t('Disabled routes will not receive any traffic.')}
            error={Boolean(fieldState.error)}
            validationText={fieldState.error?.message}
        >
            <Switch
                label={i18n.t('Disable this route')}
                checked={field.value}
                onChange={({ checked }) => field.onChange(checked)}
            />
        </Field>
    )}
/>
```

`Field` is also useful for wrapping custom inputs, date pickers, or any component that
manages its own internal state but needs standard form field chrome.

For Final Form apps, use `SwitchFieldFF` directly as the `component` prop on `Field` —
no `Field` wrapper needed.

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

## Input type selection rules

Choose input components based on the number of options:

| Options count | Single choice       | Multiple choice    |
| ------------- | ------------------- | ------------------ |
| ≤ 5–7         | Radio buttons       | Checkboxes         |
| > 5–7         | `SingleSelectField` | `MultiSelectField` |

- A single standalone checkbox **must never be a required field** — use a `Switch` or a
  `SingleSelectField` instead if the choice is mandatory.
- Always place form actions (submit/cancel buttons) at the **end** of the form.
- A form should have **one clear primary action** — use `primary` on one button only.

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
