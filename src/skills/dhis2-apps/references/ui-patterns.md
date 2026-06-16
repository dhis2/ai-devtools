# UI Patterns for DHIS2 Apps

Always use `@dhis2/ui` for UI components — not generic libraries (MUI, Chakra, Ant Design). Only build custom components if the library doesn't provide the component you need. DHIS2 apps run inside the platform shell alongside other
apps, and `@dhis2/ui` implements the DHIS2 design system so everything looks consistent.
The library is included automatically when you scaffold a DHIS2 app.

Import components directly from `@dhis2/ui`:

```tsx
import {
    Button,
    Input,
    SingleSelect,
    SingleSelectOption,
    Modal,
    ModalTitle,
    ModalContent,
    ModalActions,
    CircularLoader,
    NoticeBox,
    DataTable,
    DataTableHead,
    DataTableBody,
    DataTableRow,
    DataTableCell,
    DataTableColumnHeader,
} from '@dhis2/ui'
```

The library has more components than you'd expect — `Transfer`, `SelectorBar`,
`OrganisationUnitTree`, `Pagination`, `Tag`, `Chip`, `Tooltip`, `Popover`, `Menu`,
`Tab`, `SplitButton`, `DropdownButton`, and many more. Check before building a custom one.

To see every available component, read `node_modules/@dhis2/ui/build/es/index.js` — it
re-exports everything the library provides.

## Accessibility

`@dhis2/ui` has invested heavily in accessibility — components handle ARIA roles, keyboard
navigation, focus trapping, and screen reader announcements out of the box. This only works
if you use the library correctly and don't undermine it with custom overrides. **Accessibility
is not optional — consider it at every UI decision.**

### What `@dhis2/ui` gives you automatically

- **Form fields** (`InputField`, `SingleSelectField`, etc.) associate labels with inputs via
  `htmlFor`/`id` — never use raw `<input>` without a label.
- **Modal** traps focus inside the dialog and restores it on close — don't override this with
  `tabIndex` hacks.
- **Button** has correct `role`, keyboard activation, and disabled state semantics.
- **DataTable** renders as a real `<table>` with proper `<th>` / `scope` attributes.
- **NoticeBox** / alerts use appropriate `role="alert"` or `role="status"` semantics.

### What you must still do

**Icon-only buttons** — always provide an accessible label:

```tsx
import { Button, IconDelete24 } from '@dhis2/ui'

// Wrong — screen reader announces nothing meaningful
<Button icon={<IconDelete24 />} onClick={onDelete} />

// Correct — use aria-label or a visually-hidden label
<Button icon={<IconDelete24 />} onClick={onDelete} aria-label={i18n.t('Delete route')} />
```

**Heading hierarchy** — don't skip levels. A page with an `<h1>` should use `<h2>` for
subsections, then `<h3>` — never jump from `<h1>` to `<h3>`. Screen readers use headings
to navigate the page.

**Images** — always provide `alt` text. Decorative images get an empty string so screen
readers skip them:

```tsx
<img src={logo} alt="" />                          // decorative
<img src={chart} alt={i18n.t('Monthly trend chart')} />  // meaningful
```

**Don't rely on color alone** to convey state or meaning. Pair color with text, icons, or
labels — for example, an error state should show both a red border _and_ validation text,
not just a color change.

**Keyboard navigation** — every interactive element must be reachable via `Tab` and
operable via `Enter`/`Space`. Avoid `onClick` on non-interactive elements (`<div>`,
`<span>`). Use `<button>` or `@dhis2/ui` `Button` instead.

**Dynamic content** — when content updates without a page load (search results, async
form feedback), ensure the update is announced. `useAlert` from `@dhis2/app-runtime`
handles this for toast messages — use it rather than custom status text.

### Checklist before shipping a UI feature

- [ ] All form fields have visible labels (not just placeholders)
- [ ] Icon-only buttons have `aria-label`
- [ ] Heading levels are sequential, not skipped
- [ ] Keyboard-navigable: all actions reachable without a mouse
- [ ] Error/success states use text, not just color

## Fetch and read the UI library source

Before implementing any UI, fetch the `@dhis2/ui` source with [`opensrc`](https://opensrc.sh)
so you can read how components actually work. This is not optional — your training data does
not reliably know the props, composition patterns, or behavior of DHIS2 UI components. The
source does.

1. Read `package.json` to find the `@dhis2/ui` version. Strip range prefix (`^`, `~`)
   — e.g. `"^10.12.13"` → `10.12.13`.
2. Fetch with opensrc (tags are `v`-prefixed). `npx opensrc path` prints the absolute path
   to the cached source, fetching on cache miss:
    ```bash
    UI=$(npx opensrc path dhis2/ui@v10.12.13)
    ```
    The source is cached globally at `~/.opensrc/repos/github.com/dhis2/ui/v10.12.13/`.
3. Component source lives in `components/` — each has its own package with `src/`
   (e.g. `components/data-table/src/`). Search there for the component you need:
    ```bash
    ls "$UI/components"
    rg "DataTable" "$UI/components/data-table/src"
    ```

## Custom styling

Use CSS Modules (`.module.css`) with DHIS2 CSS variables for colors, spacing, and elevation.
**Always use logical CSS properties** — not physical ones — so layout works correctly in
RTL languages (Arabic, Hebrew, etc.):

| Instead of               | Use                       |
| ------------------------ | ------------------------- |
| `margin-left`            | `margin-inline-start`     |
| `margin-right`           | `margin-inline-end`       |
| `padding-top`            | `padding-block-start`     |
| `padding-bottom`         | `padding-block-end`       |
| `padding-left/right`     | `padding-inline`          |
| `left` / `right`         | `inset-inline-start/end`  |
| `border-left`            | `border-inline-start`     |
| `text-align: left/right` | `text-align: start/end`   |
| `float: left/right`      | `float: inline-start/end` |

```css
.container {
    padding: var(--spacers-dp16);
    background: var(--colors-white);
}

.header {
    margin-block-end: var(--spacers-dp12);
    color: var(--colors-grey900);
}

.sidebarItem {
    padding-inline-start: var(--spacers-dp8); /* not padding-left */
    border-inline-start: 2px solid var(--colors-teal400); /* not border-left */
}
```

## Design tokens

Use CSS custom properties from the DHIS2 design system for all spacing, color, and
elevation. Never use hard-coded pixel values or hex colors.

### Spacers (8-point scale)

```css
var(--spacers-dp4)   /* 4px  — tight inline gaps */
var(--spacers-dp8)   /* 8px  — default inline spacing */
var(--spacers-dp12)  /* 12px */
var(--spacers-dp16)  /* 16px — default block padding */
var(--spacers-dp24)  /* 24px — section padding */
var(--spacers-dp32)  /* 32px — large section gaps */
var(--spacers-dp48)  /* 48px */
var(--spacers-dp64)  /* 64px — page-level spacing */
```

### Color semantics

| Token prefix       | Semantic meaning          | Example use                      |
| ------------------ | ------------------------- | -------------------------------- |
| `--colors-red*`    | Error, destructive action | Delete button, error NoticeBox   |
| `--colors-yellow*` | Warning                   | Warning NoticeBox, caution badge |
| `--colors-green*`  | Success, positive         | Success alert, active indicator  |
| `--colors-teal*`   | Active, selected state    | Selected nav item, active tab    |
| `--colors-blue*`   | Primary action            | Primary button                   |
| `--colors-grey*`   | Neutral text and surfaces | Body text, card backgrounds      |

### Z-index layers

Use these named values — never invent z-index numbers:

```css
var(--z-index-application-top)  /* 2000 — sticky headers, floating panels */
var(--z-index-blocking)         /* 3000 — modal backdrops */
var(--z-index-alert)            /* 9999 — toast alerts */
```

## Forms

Check `package.json` before writing any form code. Most existing DHIS2 apps use
`react-final-form` + `@dhis2/ui-forms` (`InputFieldFF`, `SingleSelectFieldFF`, etc. as
direct `Field` components with built-in validators). New apps use React Hook Form + Zod
with `Controller`. Do not mix both in the same app.

For the full patterns for both approaches, read `references/ui-patterns/forms.md`.

## Tables

Use **TanStack Table** (`@tanstack/react-table`) for column definitions, sorting, filtering,
and pagination state — then render with `@dhis2/ui` `DataTable` components for the visual
layer. Important: `@dhis2/ui` `Pagination` is 1-indexed while TanStack Table is 0-indexed,
so offset by 1 when bridging them. Data is fetched at the parent level and passed as props.

For the full example and detailed key points, read `references/ui-patterns/tables.md`.

## Widgets

Use the `Widget` component for bordered card sections with a header — available in
collapsible and non-collapsible variants. For the full implementation, read
`references/ui-patterns/widget.md`.

## Dashboards

Arrange Widgets in a two-column flex layout with a 3:1 ratio (left column for main
content, right column for summaries). For the layout CSS and usage, read
`references/ui-patterns/dashboards.md`.

## Error display and silent failures

**No API call may fail silently.** Every network request, mutation, and async operation
must have a visible error state — not just a loading state. If the user takes an action and
it fails, they must be told. If data fails to load, they must see an error, not a blank
screen or spinner that never resolves. This is one of the most common quality issues in
DHIS2 apps.

### The three states every data-dependent component must handle

```tsx
const MyComponent = () => {
    const { data, isLoading, error } = useMyData()

    if (isLoading) return <CircularLoader />

    if (error) {
        return (
            <NoticeBox error title={i18n.t('Failed to load data')}>
                {error.message || i18n.t('An unknown error occurred')}
            </NoticeBox>
        )
    }

    return <MyContent data={data} />
}
```

Never render `null` or nothing for an error — the user has no way to know something went
wrong, and no way to act on it.

### Mutations must show success and failure feedback

Every mutation (create, update, delete) must call `useAlert` on both success and failure.
Do not rely solely on the UI updating — the user needs explicit confirmation:

```tsx
const { show: showSuccess } = useAlert(i18n.t('Route saved'), { success: true })
const { show: showError } = useAlert(
    ({ message }: { message: string }) =>
        i18n.t('Failed to save route: {{message}}', { message }),
    { critical: true }
)

useMutation(saveFn, {
    onSuccess: () => showSuccess(),
    onError: (err) => showError({ message: err.message }),
})
```

### Missing configuration must guide the user

If the app requires configuration that isn't set up yet, tell the user exactly what's
missing and how to fix it — never show a blank screen, a cryptic error, or silently skip
the feature:

```tsx
if (!config.programId) {
    return (
        <NoticeBox warning title={i18n.t('Setup required')}>
            {i18n.t(
                'No program is configured. Go to Settings to complete setup.'
            )}
        </NoticeBox>
    )
}
```

### External dependencies must fail visibly

If the app depends on an external service, a DHIS2 Route, or a backend component, and
that dependency is unavailable, surface the error — never let the app hang or appear to
work while silently doing nothing. Check availability at startup if possible.

### Use `NoticeBox` as the standard error component

Use `NoticeBox` for inline errors — not a custom `<div>` or `<p>`:

```tsx
import { NoticeBox } from '@dhis2/ui'
;<NoticeBox error title={i18n.t('Failed to load routes')}>
    {error.message}
</NoticeBox>
```

Props: `error` (red), `warning` (yellow), `title` (bold heading). Use `error` for
failures, `warning` for non-blocking issues. Use `useAlert` for transient feedback
on mutations — `NoticeBox` for persistent inline errors where the content can't load.

## Switch / toggle

Use `Switch` from `@dhis2/ui` for boolean toggles — not a checkbox or custom component:

```tsx
import { Switch } from '@dhis2/ui'
;<Switch
    label={i18n.t('Enable route')}
    checked={route.enabled}
    onChange={({ checked }) => onToggle(checked)}
    disabled={isUpdating}
/>
```

For enable/disable actions in a table row, wire `onChange` to a JSON Patch mutation (see
`references/data-fetching.md` § JSON Patch mutations).

## Sharing

Use `SharingDialog` from `@dhis2/ui` for object-level sharing — do not build a custom
sharing modal. It handles user/group search, access level selection, and public access:

```tsx
import { SharingDialog } from '@dhis2/ui'

{
    sharingDialogOpen && (
        <SharingDialog
            id={route.id}
            type="route"
            onClose={() => setSharingDialogOpen(false)}
        />
    )
}
```

`type` is the DHIS2 object type string (e.g. `'dataElement'`, `'program'`, `'route'`).
The dialog fetches and updates sharing settings itself — no extra data-fetching needed.
