# Dashboards

Dashboard pages use a two-column flex layout to arrange Widget sections. The left
column (flex: 3) holds main content, the right column (flex: 1) holds summaries.
For the Widget component itself, read `references/ui-patterns/widget.md`.

## Two-column layout

Create a CSS Module for the dashboard page (e.g. `MyDashboard.module.css`):

```css
.container {
    margin-block-start: var(--spacers-dp24);
    display: flex;
    flex-direction: row;
    gap: 16px;
}

.leftColumn {
    flex: 3;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.rightColumn {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
}
```

## Usage

```tsx
import styles from './MyDashboard.module.css'

export const MyDashboard = () => (
    <div className={styles.container}>
        <div className={styles.leftColumn}>
            <ActionsWidget />
            <ResultsWidget />
        </div>
        <div className={styles.rightColumn}>
            <SummaryWidget />
        </div>
    </div>
)
```

## Key points

- **Dashboard routes** should set `fullWidth: true` on the route handle so content is not constrained by `PageWrapper`'s max-width. See `references/ui-patterns/sidebar.md` (§ Wiring it into the router).
