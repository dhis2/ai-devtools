# Sidebar Navigation and Page Layout

This reference contains everything needed to set up navigation in a DHIS2 app:
the sidebar components, the page layout grid, the content width wrapper, and
the router wiring that ties them together.

The sidebar is dark-themed and collapsible, built from small composable primitives
(`Sidenav`, `SidenavItems`, `SidenavLink`, `SidenavParent`, `SidenavFooter`) that
integrate with React Router's `NavLink` for active-route highlighting.

## Sidenav primitives

These are the building blocks. Create `src/components/sidebar/sidenav/Sidenav.tsx`:

```tsx
import React, { PropsWithChildren } from "react";
import { IconChevronDown16 } from "@dhis2/ui";
import cx from "classnames";
import styles from "./Sidenav.module.css";

export const Sidenav = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <nav className={cx(styles.sidenavWrap, className)}>{children}</nav>
);

export const SidenavItems = ({ children }: PropsWithChildren) => (
  <ul className={styles.sidenavItems}>{children}</ul>
);

export const SidenavFooter = ({ children }: PropsWithChildren) => (
  <div className={styles.sidenavFooter}>{children}</div>
);

interface SidenavParentProps {
  label: string;
  open: boolean;
  onClick: () => void;
}

export const SidenavParent = ({
  label,
  open,
  onClick,
  children,
}: PropsWithChildren<SidenavParentProps>) => (
  <li className={cx(styles.sidenavParent, { [styles.parentIsOpen]: open })}>
    <button onClick={onClick}>
      <span>{label}</span>
      <span className={styles.sidenavParentChevron}>
        <IconChevronDown16 />
      </span>
    </button>
    {open && <ul className={styles.sidenavSubmenu}>{children}</ul>}
  </li>
);

interface SidenavLinkProps {
  to: string;
  label: string;
  end?: boolean;
  disabled?: boolean;
  LinkComponent?: React.ComponentType<{
    to: string;
    end?: boolean;
    [key: string]: unknown;
  }>;
}

export const SidenavLink = ({
  to,
  label,
  end,
  disabled,
  LinkComponent,
}: SidenavLinkProps) => (
  <li
    className={cx(styles.sidenavLink, {
      [styles.sidenavLinkDisabled]: disabled,
    })}
  >
    {LinkComponent ? (
      <LinkComponent to={to} end={end}>
        {label}
      </LinkComponent>
    ) : (
      <a href={to}>{label}</a>
    )}
  </li>
);
```

### Sidenav styles

Create `src/components/sidebar/sidenav/Sidenav.module.css`:

```css
html {
  --sidenav-dark-bg: #151b23;
  --sidenav-dark-bg-hover: color-mix(
    in srgb,
    var(--sidenav-dark-bg),
    white 10%
  );
  --sidenav-dark-bg-selected: color-mix(
    in srgb,
    var(--sidenav-dark-bg),
    white 5%
  );
}

.sidenavWrap {
  width: 100%;
  height: 100%;
  background: var(--sidenav-dark-bg);
  overflow-y: auto;
  color: var(--colors-grey300);
  display: flex;
  flex-direction: column;
}

.sidenavWrap ul {
  list-style: none;
  margin: 0;
  padding-inline: 0;
}

.sidenavItems {
  overflow-y: auto;
  scrollbar-color: var(--colors-grey700) var(--sidenav-dark-bg);
  scrollbar-width: thin;
  padding-block-start: var(--spacers-dp8);
}

/* Parent (collapsible group) */

.sidenavParent button {
  border: none;
  background: var(--sidenav-dark-bg);
  color: var(--colors-grey300);
  font-size: 16px;
  text-align: left;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 32px;
  padding: 8px 8px 8px 12px;
  cursor: pointer;
}

.sidenavParent button:hover {
  text-decoration: underline;
  background: var(--sidenav-dark-bg-hover);
}

.sidenavParent button:focus {
  outline: 2px solid white;
  background: var(--sidenav-dark-bg-hover);
  outline-offset: -2px;
}

.sidenavParent button:focus:not(:focus-visible) {
  outline: none;
  background: var(--sidenav-dark-bg);
}

.sidenavParentChevron {
  margin-left: auto;
  width: 16px;
  height: 16px;
  transition: transform 0.1s linear;
}

.parentIsOpen .sidenavParentChevron {
  transform: rotate(180deg);
}

/* Link */

.sidenavLink a {
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 8px 8px 8px 12px;
  background: var(--sidenav-dark-bg);
  text-decoration: none;
  color: var(--colors-grey300);
  font-size: 16px;
}

.sidenavLink:hover,
.sidenavLink a:hover {
  text-decoration: underline;
  background: var(--sidenav-dark-bg-hover);
}

.sidenavLink a:focus {
  outline: 2px solid white;
  background: var(--sidenav-dark-bg-hover);
  outline-offset: -2px;
}

.sidenavLink a:focus:not(:focus-visible) {
  outline: none;
}

.sidenavLinkDisabled,
.sidenavLinkDisabled a {
  cursor: not-allowed;
  color: var(--colors-grey500);
}

.sidenavLinkDisabled:hover,
.sidenavLinkDisabled:hover > a {
  background: var(--sidenav-dark-bg);
}

/* Active state — works with NavLink's .active class */
.sidenavLink a.active,
.sidenavLink :global(.active) {
  color: var(--colors-grey300);
  background: var(--sidenav-dark-bg-selected);
  box-shadow: inset 6px 0px 0px 0px var(--colors-teal400);
}

/* Indent links inside a parent */
.sidenavParent .sidenavLink a {
  padding-left: var(--spacers-dp32);
}

/* Footer */

.sidenavFooter {
  margin-top: auto;
  padding-bottom: 52px;
}
```

## Sidebar component

The `Sidebar` composes the primitives and adds collapse behavior.
Create `src/components/sidebar/Sidebar.tsx`:

```tsx
import i18n from "@dhis2/d2-i18n";
import { IconChevronLeft24 } from "@dhis2/ui";
import cx from "classnames";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import styles from "./Sidebar.module.css";
import {
  Sidenav,
  SidenavFooter,
  SidenavItems,
  SidenavLink,
  SidenavParent,
} from "./sidenav";

type LinkItem = { to: string; label: string };

const SidebarNavLink = ({ to, label, end }: LinkItem & { end?: boolean }) => (
  <SidenavLink to={to} label={label} end={end} LinkComponent={NavLink} />
);

export const SidebarParent = ({
  label,
  links,
  initiallyOpen = true,
}: {
  label: string;
  links: LinkItem[];
  initiallyOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  if (links.length === 1) {
    return <SidebarNavLink to={links[0].to} label={links[0].label} end />;
  }

  return (
    <SidenavParent
      label={label}
      open={isOpen}
      onClick={() => setIsOpen(!isOpen)}
    >
      {links.map(({ to, label }) => (
        <SidebarNavLink key={to} to={to} label={label} end />
      ))}
    </SidenavParent>
  );
};

export const Sidebar = ({
  className,
  hideSidebar,
}: {
  className?: string;
  hideSidebar?: boolean;
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const isCollapsed = collapsed || hideSidebar;

  return (
    <aside
      className={cx(styles.asideWrapper, className, {
        [styles.collapsed]: isCollapsed,
      })}
    >
      <Sidenav>
        <SidenavItems>
          {/* Replace with your app's navigation */}
          <SidebarNavLink to="/" label={i18n.t("Home")} end />
        </SidenavItems>
        <SidenavFooter>
          <SidenavItems>
            <SidebarNavLink to="/settings" label={i18n.t("Settings")} />
          </SidenavItems>
        </SidenavFooter>
      </Sidenav>
      <button
        className={styles.collapseButton}
        type="button"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div
          className={cx(styles.iconWrapper, {
            [styles.collapsed]: isCollapsed,
          })}
        >
          <IconChevronLeft24 />
        </div>
      </button>
    </aside>
  );
};
```

### Sidebar styles

Create `src/components/sidebar/Sidebar.module.css`:

```css
.asideWrapper {
  --animation-duration: 0.3s;
  transition: ease inline-size var(--animation-duration);
  position: relative;
  overflow-x: hidden;
}

.asideWrapper.collapsed {
  inline-size: 52px;
}

.asideWrapper nav {
  min-inline-size: 240px;
  transition:
    opacity ease var(--animation-duration),
    visibility ease 0.5s;
}

.collapsed nav {
  opacity: 0;
  visibility: hidden;
}

.iconWrapper {
  display: flex;
  align-items: center;
}

.iconWrapper svg {
  transition: var(--animation-duration);
}

.collapsed svg {
  transform: rotate(180deg);
}

.collapseButton {
  transition: ease var(--animation-duration);
  position: absolute;
  inset-block-end: 0;
  inset-inline-start: 0;
  cursor: pointer;
  inline-size: 36px;
  block-size: 36px;
  margin: var(--spacers-dp8);
  background-color: color-mix(in srgb, var(--sidenav-dark-bg-hover), white 10%);
  color: var(--colors-grey050);
  border-radius: 4px;
  border: none;
}

@media (max-width: 768px) {
  .asideWrapper {
    max-inline-size: calc(100vw - 14px) !important;
    block-size: max-content;
  }

  .asideWrapper.collapsed {
    inline-size: 100%;
    max-block-size: 52px;
  }

  .iconWrapper svg {
    transform: rotate(90deg);
  }

  .iconWrapper.collapsed svg {
    transform: rotate(-90deg);
  }
}
```

## Layout

The layout puts the sidebar and main content in a CSS grid. It reads route handles
to decide whether to collapse the sidebar.

Create `src/components/layout/Layout.tsx`:

```tsx
import { Outlet, useMatches } from "react-router-dom";
import { Sidebar } from "../sidebar/Sidebar";
import styles from "./Layout.module.css";

export type RouteHandle = {
  fullWidth?: boolean;
  /* whether to automatically collapse the sidebar when route is active */
  collapseSidebar?: boolean;
};

export const Layout = () => {
  const collapseSidebar = useMatches().some(
    (match) => (match.handle as RouteHandle)?.collapseSidebar,
  );

  return (
    <div className={styles.wrapper}>
      <Sidebar className={styles.sidebar} hideSidebar={collapseSidebar} />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
};
```

### Layout styles

Create `src/components/layout/Layout.module.css`:

```css
.wrapper {
  display: grid;
  grid-template-areas: "sidebar" "main";
  grid-template-rows: auto 1fr;
  block-size: 100%;
  background: var(--sidenav-dark-bg);
  font-size: 14px;
}

.main {
  grid-area: main;
  background-color: var(--colors-grey200);
  display: flex;
  flex-direction: column;
  inline-size: 100%;
}

.sidebar {
  grid-area: sidebar;
}

@media (min-width: 768px) {
  .wrapper {
    grid-template-columns: auto 1fr;
    grid-template-areas: "sidebar main";
    grid-template-rows: 1fr;
  }

  .sidebar {
    inline-size: 240px;
    overflow-y: auto;
  }

  .main {
    overflow-y: auto;
  }
}
```

## Page wrapper

Content on wide screens needs a max-width constraint — without it, text and forms
stretch uncomfortably across the full viewport. `PageWrapper` centers content with a
default cap of `1400px`, but routes can opt out via the `fullWidth` route handle
(useful for comparison views, dashboards, or wide tables).

Create `src/components/layout/PageWrapper.tsx`:

```tsx
import { useMatches } from "react-router-dom";
import { RouteHandle } from "./Layout";

interface PageWrapperProps {
  children: React.ReactNode;
  maxWidth?: string;
}

export const defaultMaxWidth: string = "1400px";

const style: React.CSSProperties = {
  maxInlineSize: defaultMaxWidth,
  marginInlineStart: "auto",
  marginInlineEnd: "auto",
  padding: "20px 16px",
  inlineSize: "100%",
};

export const PageWrapper = ({ children, maxWidth }: PageWrapperProps) => {
  const fullWidthRoute = useMatches().some(
    (match) => !!(match.handle as RouteHandle)?.fullWidth,
  );

  return (
    <div
      style={{
        ...style,
        maxInlineSize: fullWidthRoute ? "none" : maxWidth || defaultMaxWidth,
        inlineSize: "100%",
      }}
    >
      {children}
    </div>
  );
};
```

`PageWrapper` is used as a layout route element wrapping `<Outlet />` — not inside
the `Layout` component. This way routes can exist as direct children of `Layout`
without the wrapper if they need a fully custom layout.

## Wiring it into the router

The full route tree follows this nesting:
`SyncUrlWithGlobalShell` → `Layout` → `PageWrapper` wrapping `<Outlet />` → page routes.

Set `collapseSidebar` on routes where the sidebar should be hidden (detail/edit pages).
Set `fullWidth` on routes that need the full viewport width (dashboards, comparison views).

```tsx
import { createHashRouter, Outlet } from "react-router-dom";
import { SyncUrlWithGlobalShell } from "@/utils/SyncUrlWithGlobalShell";
import { Layout, RouteHandle } from "@/components/layout/Layout";
import { PageWrapper } from "@/components/layout/PageWrapper";

const router = createHashRouter([
  {
    element: <SyncUrlWithGlobalShell />,
    children: [
      {
        element: <Layout />,
        children: [
          {
            element: (
              <PageWrapper>
                <Outlet />
              </PageWrapper>
            ),
            children: [
              { path: "/", element: <HomePage /> },
              { path: "/settings", element: <SettingsPage /> },
              {
                path: "/items/:id",
                element: <ItemDetailPage />,
                handle: { collapseSidebar: true } satisfies RouteHandle,
              },
              {
                path: "/dashboard",
                element: <DashboardPage />,
                handle: { fullWidth: true } satisfies RouteHandle,
              },
            ],
          },
        ],
      },
    ],
  },
]);
```
