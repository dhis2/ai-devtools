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

Use CSS Modules (`.module.css`) with DHIS2 CSS variables for colors, spacing, and elevation:

```css
.container {
    padding: var(--spacers-dp16);
    background: var(--colors-white);
}

.header {
    margin-block-end: var(--spacers-dp12);
    color: var(--colors-grey900);
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

Use **React Hook Form** for form state management, **Zod** for schema validation, and
wire `@dhis2/ui` inputs via `Controller` (they use `onChange({ value })` not `onChange(event)`,
so they need the Controller wrapper rather than `register`). `SingleSelectField` uses
`selected` / `onChange({ selected })` instead.

For the full example and detailed key points, read `references/ui-patterns/forms.md`.

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

## Error display

Use `NoticeBox` as the standard component for displaying errors and warnings in the UI —
not a custom `<div>` or `<p>`. It renders a styled notice with a title and body:

```tsx
import { NoticeBox } from '@dhis2/ui'

if (error) {
    return (
        <NoticeBox error title={i18n.t('Failed to load routes')}>
            {error.message}
        </NoticeBox>
    )
}
```

Props: `error` (red), `warning` (yellow), `title` (bold heading). Use `error` for
failures, `warning` for non-blocking issues.

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
