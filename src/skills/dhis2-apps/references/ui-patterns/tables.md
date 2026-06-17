# Tables

Use **TanStack Table** (`@tanstack/react-table`) for column definitions, sorting, and
pagination state — then render with `@dhis2/ui` `DataTable` components for the visual layer.

Pagination and page size live in the URL so the state survives navigation and is shareable.
Only the current page of data is fetched from the API — never the entire collection.

The pattern has three layers:

1. **URL pagination hook** — reads/writes `page` and `pageSize` search params
2. **Container component** — owns URL state, fetches data, handles loading/error
3. **Presentational table component** — receives data and callbacks, renders the table

---

## URL pagination hook

A reusable hook that keeps pagination state in the URL. Place it in `src/hooks/`.

```tsx
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

const DEFAULT_PAGE_SIZE = 10

export const useTablePaginationParams = () => {
    const [searchParams, setSearchParams] = useSearchParams()

    const page = searchParams.get('page')
    const pageSize = searchParams.get('pageSize')

    const pageIndex = Math.max(0, (Number(page) || 1) - 1)
    const pageSizeValue = Number(pageSize) || DEFAULT_PAGE_SIZE

    const setPageIndex = useCallback(
        (newPageIndex: number) => {
            setSearchParams(
                (prev) => {
                    const updated = new URLSearchParams(prev)
                    const newPage = newPageIndex + 1
                    if (newPage <= 1) {
                        updated.delete('page')
                    } else {
                        updated.set('page', String(newPage))
                    }
                    return updated
                },
                { replace: true }
            )
        },
        [setSearchParams]
    )

    const setPageSize = useCallback(
        (newPageSize: number) => {
            setSearchParams(
                (prev) => {
                    const updated = new URLSearchParams(prev)
                    if (newPageSize === DEFAULT_PAGE_SIZE) {
                        updated.delete('pageSize')
                    } else {
                        updated.set('pageSize', String(newPageSize))
                    }
                    updated.delete('page')
                    return updated
                },
                { replace: true }
            )
        },
        [setSearchParams]
    )

    return useMemo(
        () => ({
            pageIndex,
            pageSize: pageSizeValue,
            setPageIndex,
            setPageSize,
        }),
        [pageIndex, pageSizeValue, setPageIndex, setPageSize]
    )
}
```

## Data-fetching hook

Fetches a single page of data from the DHIS2 API. The response includes the pager envelope
so the table knows the total count. See `references/data-fetching.md` for details on
`useApiDataQuery`, caching strategy, and building query params.

```tsx
import { useApiDataQuery } from '@/utils/useApiDataQuery'

type DataElement = {
    id: string
    name: string
    shortName: string
    valueType: string
    lastUpdated: string
}

type Pager = {
    page: number
    pageCount: number
    total: number
    pageSize: number
}

type DataElementsResponse = {
    pager: Pager
    dataElements: DataElement[]
}

type UseDataElementsOptions = {
    page: number
    pageSize: number
    search?: string
}

export const useDataElements = ({
    page,
    pageSize,
    search,
}: UseDataElementsOptions) => {
    const { data, isLoading, error } = useApiDataQuery<DataElementsResponse>({
        queryKey: ['dataElements', { page, pageSize, search }],
        query: {
            resource: 'dataElements',
            params: {
                fields: 'id,name,shortName,valueType,lastUpdated',
                order: 'lastUpdated:desc',
                page,
                pageSize,
                ...(search && {
                    filter: [`name:ilike:${search}`],
                }),
            },
        },
        staleTime: 5 * 60 * 1000,
        cacheTime: 10 * 60 * 1000,
    })

    return {
        dataElements: data?.dataElements ?? [],
        pager: data?.pager,
        isLoading,
        error,
    }
}
```

## Container component

The container owns URL state, calls the data-fetching hook, and handles loading and error
states. It passes resolved data and pagination callbacks to the presentational table.

```tsx
import { CircularLoader, NoticeBox } from '@dhis2/ui'
import i18n from '@dhis2/d2-i18n'
import { useTablePaginationParams } from '@/hooks/useTablePaginationParams'
import { useDataElements } from '@/hooks/useDataElements'
import { DataElementTable } from './DataElementTable'
import styles from './DataElementTableContainer.module.css'

type DataElementTableContainerProps = {
    search?: string
}

export const DataElementTableContainer = ({
    search,
}: DataElementTableContainerProps) => {
    const { pageIndex, pageSize, setPageIndex, setPageSize } =
        useTablePaginationParams()

    const { dataElements, pager, isLoading, error } = useDataElements({
        page: pageIndex + 1,
        pageSize,
        search,
    })

    if (isLoading) {
        return (
            <div className={styles.loadingContainer}>
                <CircularLoader />
            </div>
        )
    }

    if (error) {
        return (
            <NoticeBox error title={i18n.t('Error loading data elements')}>
                {error.message || i18n.t('An unknown error occurred')}
            </NoticeBox>
        )
    }

    return (
        <DataElementTable
            dataElements={dataElements}
            pager={pager}
            pageIndex={pageIndex}
            pageSize={pageSize}
            onPageChange={setPageIndex}
            onPageSizeChange={setPageSize}
        />
    )
}
```

## Table component

The table is purely presentational — it receives data and callbacks as props and renders
using TanStack Table for column management and `@dhis2/ui` for the visual layer.

```tsx
import { useState } from 'react'
import {
    DataTable,
    DataTableHead,
    DataTableBody,
    DataTableFoot,
    DataTableRow,
    DataTableCell,
    DataTableColumnHeader,
    Pagination,
} from '@dhis2/ui'
import i18n from '@dhis2/d2-i18n'
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    Column,
    SortingState,
} from '@tanstack/react-table'

type DataElement = {
    id: string
    name: string
    shortName: string
    valueType: string
    lastUpdated: string
}

type Pager = {
    page: number
    pageCount: number
    total: number
    pageSize: number
}

const columnHelper = createColumnHelper<DataElement>()

const columns = [
    columnHelper.accessor('name', {
        header: i18n.t('Name'),
    }),
    columnHelper.accessor('shortName', {
        header: i18n.t('Short name'),
    }),
    columnHelper.accessor('valueType', {
        header: i18n.t('Value type'),
        enableSorting: false,
    }),
    columnHelper.accessor('lastUpdated', {
        header: i18n.t('Last updated'),
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
    }),
]

const getSortDirection = (column: Column<DataElement>) => {
    return column.getIsSorted() || 'default'
}

type DataElementTableProps = {
    dataElements: DataElement[]
    pager?: Pager
    pageIndex: number
    pageSize: number
    onPageChange: (pageIndex: number) => void
    onPageSizeChange: (pageSize: number) => void
}

const DataElementTable = ({
    dataElements,
    pager,
    pageIndex,
    pageSize,
    onPageChange,
    onPageSizeChange,
}: DataElementTableProps) => {
    const [sorting, setSorting] = useState<SortingState>([])

    const table = useReactTable({
        data: dataElements,
        columns,
        state: {
            sorting,
            pagination: { pageIndex, pageSize },
        },
        manualPagination: true,
        pageCount: pager?.pageCount ?? -1,
        getRowId: (row) => row.id,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
    })

    const rows = table.getRowModel().rows

    return (
        <DataTable>
            <DataTableHead>
                {table.getHeaderGroups().map((headerGroup) => (
                    <DataTableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                            <DataTableColumnHeader
                                key={header.id}
                                fixed
                                {...(header.column.getCanSort()
                                    ? {
                                          sortDirection: getSortDirection(
                                              header.column
                                          ),
                                          sortIconTitle: i18n.t('Sort'),
                                          onSortIconClick: () =>
                                              header.column.toggleSorting(),
                                      }
                                    : {})}
                            >
                                {flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                )}
                            </DataTableColumnHeader>
                        ))}
                    </DataTableRow>
                ))}
            </DataTableHead>

            <DataTableBody>
                {rows.length > 0 ? (
                    rows.map((row) => (
                        <DataTableRow key={row.id}>
                            {row.getVisibleCells().map((cell) => (
                                <DataTableCell key={cell.id}>
                                    {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext()
                                    )}
                                </DataTableCell>
                            ))}
                        </DataTableRow>
                    ))
                ) : (
                    <DataTableRow>
                        <DataTableCell
                            colSpan={String(columns.length)}
                            align="center"
                        >
                            {i18n.t('No data elements found')}
                        </DataTableCell>
                    </DataTableRow>
                )}
            </DataTableBody>

            <DataTableFoot>
                <DataTableRow>
                    <DataTableCell colSpan={String(columns.length)}>
                        <Pagination
                            page={pageIndex + 1}
                            pageSize={pageSize}
                            pageCount={pager?.pageCount ?? 0}
                            total={pager?.total ?? 0}
                            isLastPage={!table.getCanNextPage()}
                            onPageChange={(page: number) =>
                                onPageChange(page - 1)
                            }
                            onPageSizeChange={onPageSizeChange}
                        />
                    </DataTableCell>
                </DataTableRow>
            </DataTableFoot>
        </DataTable>
    )
}
```

## Table actions

Row-level actions go in a dedicated `display` column that renders an overflow menu (three-dot
button). Each table gets its own actions menu component that manages menu state, conditional
items, and confirmation modals.

### Actions column definition

Add the actions column at the end of the `columns` array using `columnHelper.display`:

```tsx
columnHelper.display({
    id: 'actions',
    header: i18n.t('Actions'),
    cell: (info) => (
        <DataElementActionsMenu
            id={info.row.original.id}
            name={info.row.original.name}
        />
    ),
}),
```

Pass only the row data the menu needs via `info.row.original` — don't pass the whole row object.

### OverflowButton

The three-dot menu trigger is a reusable component built from `Button`, `Layer`, and `Popper`.
See `references/ui-patterns/overflow-button.md` for the full implementation — create it once
in `src/components/OverflowButton/` and reuse across all tables.

### Actions menu component

Each actions menu manages its own open/close state and any modal visibility state. Render
`FlyoutMenu` with `MenuItem` entries — show or hide items conditionally based on row data.
Mark destructive actions (delete, cancel) with the `destructive` prop.

```tsx
import { useState } from 'react'
import {
    FlyoutMenu,
    MenuItem,
    IconDelete16,
    IconEdit16,
    IconMore16,
} from '@dhis2/ui'
import i18n from '@dhis2/d2-i18n'
import { OverflowButton } from '@/components/OverflowButton/OverflowButton'
import { DeleteDataElementModal } from './DeleteDataElementModal'

type DataElementActionsMenuProps = {
    id: string
    name: string
}

export const DataElementActionsMenu = ({
    id,
    name,
}: DataElementActionsMenuProps) => {
    const [menuOpen, setMenuOpen] = useState(false)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)

    return (
        <>
            <OverflowButton
                small
                open={menuOpen}
                icon={<IconMore16 />}
                onClick={() => setMenuOpen((prev) => !prev)}
                component={
                    <FlyoutMenu dense>
                        <MenuItem
                            label={i18n.t('Edit')}
                            icon={<IconEdit16 />}
                            onClick={() => {
                                // navigate or open edit modal
                                setMenuOpen(false)
                            }}
                        />
                        <MenuItem
                            label={i18n.t('Delete')}
                            icon={<IconDelete16 />}
                            destructive
                            onClick={() => {
                                setDeleteModalOpen(true)
                                setMenuOpen(false)
                            }}
                        />
                    </FlyoutMenu>
                }
            />

            {deleteModalOpen && (
                <DeleteDataElementModal
                    id={id}
                    name={name}
                    onClose={() => setDeleteModalOpen(false)}
                />
            )}
        </>
    )
}
```

### Confirmation modals

Destructive actions should open a confirmation modal before executing. Use `Modal`,
`ModalTitle`, `ModalContent`, and `ModalActions` from `@dhis2/ui`:

```tsx
import {
    Button,
    Modal,
    ModalTitle,
    ModalContent,
    ModalActions,
    ButtonStrip,
} from '@dhis2/ui'
import i18n from '@dhis2/d2-i18n'
import { useDeleteDataElement } from '@/hooks/useDeleteDataElement'

type DeleteDataElementModalProps = {
    id: string
    name: string
    onClose: () => void
}

export const DeleteDataElementModal = ({
    id,
    name,
    onClose,
}: DeleteDataElementModalProps) => {
    const { mutate: deleteElement, isLoading } = useDeleteDataElement({
        onSuccess: onClose,
    })

    return (
        <Modal onClose={onClose} small>
            <ModalTitle>{i18n.t('Delete data element')}</ModalTitle>
            <ModalContent>
                {i18n.t(
                    'Are you sure you want to delete "{{name}}"? This action cannot be undone.',
                    { name }
                )}
            </ModalContent>
            <ModalActions>
                <ButtonStrip end>
                    <Button onClick={onClose} secondary disabled={isLoading}>
                        {i18n.t('Cancel')}
                    </Button>
                    <Button
                        onClick={() => deleteElement(id)}
                        destructive
                        disabled={isLoading}
                        loading={isLoading}
                    >
                        {i18n.t('Delete')}
                    </Button>
                </ButtonStrip>
            </ModalActions>
        </Modal>
    )
}
```

### File structure

Colocate the actions menu and its modals next to the table component:

```
DataElementTable/
├── DataElementTable.tsx
├── DataElementTableContainer.tsx
├── DataElementActionsMenu/
│   ├── DataElementActionsMenu.tsx
│   └── DeleteDataElementModal.tsx
```

## Architecture and pagination rules

- **Container / table split** — the container owns URL state, fetches data, and handles loading/error. The table component is purely presentational and receives everything via props. This keeps the table reusable and testable.
- **URL-based pagination** — `page` and `pageSize` live in the URL as search params. The `useTablePaginationParams` hook is a reusable utility shared across all tables in the app. Default values are omitted from the URL to keep it clean.
- **Server-side pagination** — pass `manualPagination: true` and `pageCount` to `useReactTable`. Do not use `getPaginationRowModel()` — the API handles pagination. The DHIS2 response envelope includes `pager.total` and `pager.pageCount` for the `Pagination` component.
- **Server-side filtering** — search terms are sent as DHIS2 `filter` params (e.g. `name:ilike:${search}`) rather than filtering client-side. Client-side filtering with `getFilteredRowModel` doesn't work with server-side pagination because only one page of data is loaded.
- **Column definitions live outside the component** — `createColumnHelper<T>()` gives type-safe accessors. Use `columnHelper.accessor` for data columns and `columnHelper.display` for non-data columns (selection checkboxes, action menus).
- **Sorting** — `getSortedRowModel()` sorts within the current page. For cross-page sorting, use the DHIS2 `order` API parameter and `manualSorting: true` on the table. Spread sort props conditionally onto `DataTableColumnHeader` only when `header.column.getCanSort()` is true.
- **Pagination bridging** — `@dhis2/ui` `Pagination` is 1-indexed while TanStack Table is 0-indexed, so offset by 1 when bridging them. Wrap pagination inside `DataTableFoot > DataTableRow > DataTableCell` with `colSpan`.
- **Empty state** — render a single row with `colSpan` covering all columns when there are no rows.
- **Custom cells** — use the `cell` property on a column definition to render links, status pills, tooltips, or action menus. Access the full row object via `info.row.original`.
- **Row selection** — add a `display` column with `Checkbox` and enable `enableRowSelection: true` + `onRowSelectionChange` on the table. Use `table.getSelectedRowModel().rows` to get selected items for batch actions.
- **Actions column** — use a `display` column rendering an `OverflowButton` (three-dot menu) with a `FlyoutMenu`. Colocate the actions menu component and its modals next to the table. Show/hide menu items conditionally based on row state, and always use a confirmation modal before destructive actions.
