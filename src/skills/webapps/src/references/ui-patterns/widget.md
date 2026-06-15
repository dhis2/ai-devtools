# Widget

A bordered card component with a header, used to group content into discrete sections.
Comes in collapsible and non-collapsible variants. Place files in `src/components/Widget/`
and install `classnames` if not already present (`pnpm add classnames`).

## IconButton

The collapsible variant needs a small `IconButton` component.
Create `src/components/Widget/IconButton.tsx`:

```tsx
import cx from "classnames";
import type { ReactNode } from "react";
import styles from "./IconButton.module.css";

type Props = {
  children: ReactNode;
  className?: string;
  dataTest?: string;
  disabled?: boolean;
  onClick: (
    event:
      | React.KeyboardEvent<HTMLButtonElement>
      | React.MouseEvent<HTMLButtonElement>
      | React.TouchEvent<HTMLButtonElement>,
  ) => void;
};

export const IconButton = ({
  children,
  className,
  dataTest,
  onClick,
  disabled,
  ...passOnProps
}: Props) => (
  <button
    {...passOnProps}
    onClick={onClick}
    disabled={disabled}
    data-test={dataTest}
    className={cx(styles.button, {
      disabled,
      ...(className ? { [className]: true } : {}),
    })}
    type="button"
    tabIndex={0}
  >
    {children}
  </button>
);
```

Create `src/components/Widget/IconButton.module.css`:

```css
.button {
  cursor: pointer;
  border-radius: 3px;
  background: transparent;
  display: flex;
  align-items: center;
  padding: 2px;
  justify-content: center;
  color: var(--colors-grey700);
  border: 0.5px solid var(--colors-grey800);
}

.button:hover {
  background: var(--colors-grey200);
  color: var(--colors-grey500);
}

.button.disabled {
  color: var(--colors-grey500);
  cursor: not-allowed;
}
```

## Types

Create `src/components/Widget/widget.types.ts`:

```typescript
import type { ReactNode } from "react";

type WidgetCollapsibleProps = {
  noncollapsible?: false;
  header?: ReactNode;
  children: ReactNode;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  color?: string;
  borderless?: boolean;
};

type WidgetNonCollapsibleProps = {
  noncollapsible: true;
  header?: ReactNode;
  children: ReactNode;
  color?: string;
  borderless?: boolean;
};

export type WidgetProps = WidgetCollapsibleProps | WidgetNonCollapsibleProps;
```

## Styles

Create `src/components/Widget/Widget.module.css`:

```css
.headerContainer {
  border-radius: 3px;
  border: 1px solid #d5dde5;
}

.headerContainerChildrenVisible {
  border-block-end-width: 0;
  border-end-start-radius: 0;
  border-end-end-radius: 0;
}

.headerCollapsible {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  font-weight: 500;
  font-size: 16px;
  color: #404b5a;
}

.children {
  border-start-start-radius: 0;
  border-start-end-radius: 0;
  border-end-start-radius: 3px;
  border-end-end-radius: 3px;
  border: 1px solid #d5dde5;
  border-block-start-width: 0;
  transform-origin: 50% 0%;
}

.childrenOpen {
  animation: slidein 200ms normal forwards ease-in-out;
}

.childrenClose {
  animation: slideout 200ms normal forwards ease-in-out;
  transform-origin: 100% 0%;
}

.toggleButton {
  margin: 0 0 0 4px;
  block-size: 24px;
  border-radius: 3px;
  color: #6c7787;
  background: transparent;
  border: none;
}

.toggleButton:hover {
  background: #f3f5f7;
  color: #404b5a;
}

.toggleIcon {
  display: flex;
}

.toggleIconOpen {
  animation: flipOpen 200ms normal forwards linear;
}

.toggleIconClose {
  animation: flipClose 200ms normal forwards linear;
}

.toggleIconCloseInit {
  transform: rotateX(180deg);
}

.container {
  border-radius: 3px;
  border: 1px solid #d5dde5;
}

.headerNonCollapsible {
  display: flex;
  align-items: center;
  padding: 16px;
  font-weight: 500;
  font-size: 16px;
  color: #404b5a;
}

.borderless {
  border: none;
}

@keyframes slidein {
  from {
    transform: scaleY(0);
  }
  to {
    transform: scaleY(1);
  }
}

@keyframes slideout {
  from {
    transform: scaleY(1);
  }
  to {
    transform: scaleY(0);
  }
}

@keyframes flipOpen {
  from {
    transform: rotate(180deg);
  }
  to {
    transform: rotate(0deg);
  }
}

@keyframes flipClose {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(180deg);
  }
}
```

## Collapsible variant

Create `src/components/Widget/WidgetCollapsible.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import cx from "classnames";
import { colors, IconChevronUp24 } from "@dhis2/ui";
import { IconButton } from "./IconButton";
import type { WidgetProps } from "./widget.types";
import styles from "./Widget.module.css";

type Props = Extract<WidgetProps, { noncollapsible?: false }>;

export const WidgetCollapsible = ({
  header,
  open,
  onOpen,
  onClose,
  color = colors.white,
  borderless = false,
  children,
}: Props) => {
  const [childrenVisible, setChildrenVisibility] = useState(open);
  const [animationsReady, setAnimationsReadyStatus] = useState(false);
  const [postEffectOpen, setPostEffectOpenStatus] = useState(open);
  const hideChildrenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const initialRenderRef = useRef(true);

  useEffect(() => {
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      return;
    }

    if (!animationsReady) {
      setAnimationsReadyStatus(true);
    }

    setPostEffectOpenStatus(open);

    clearTimeout(
      hideChildrenTimeoutRef.current as ReturnType<typeof setTimeout>,
    );
    if (open) {
      setChildrenVisibility(true);
    } else {
      hideChildrenTimeoutRef.current = setTimeout(() => {
        setChildrenVisibility(false);
      }, 200);
    }
  }, [open, animationsReady]);

  return (
    <div style={{ backgroundColor: color, borderRadius: 3 }}>
      <div
        className={cx(styles.headerContainer, {
          [styles.headerContainerChildrenVisible]: childrenVisible,
          [styles.borderless]: borderless,
        })}
      >
        <div className={styles.headerCollapsible}>
          {header}
          <IconButton
            dataTest="widget-open-close-toggle-button"
            className={styles.toggleButton}
            onClick={open ? onClose : onOpen}
          >
            <span
              className={cx(styles.toggleIcon, {
                [styles.toggleIconCloseInit]:
                  !animationsReady && !postEffectOpen,
                [styles.toggleIconOpen]: animationsReady && postEffectOpen,
                [styles.toggleIconClose]: animationsReady && !postEffectOpen,
              })}
            >
              <IconChevronUp24 />
            </span>
          </IconButton>
        </div>
      </div>
      {childrenVisible ? (
        <div
          data-test="widget-contents"
          className={cx(styles.children, {
            [styles.childrenOpen]: animationsReady && open,
            [styles.childrenClose]: animationsReady && !open,
            [styles.borderless]: borderless,
          })}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
};
```

## Non-collapsible variant

Create `src/components/Widget/WidgetNonCollapsible.tsx`:

```tsx
import { colors } from "@dhis2/ui";
import cx from "classnames";
import type { WidgetProps } from "./widget.types";
import styles from "./Widget.module.css";

type Props = Extract<WidgetProps, { noncollapsible: true }>;

export const WidgetNonCollapsible = ({
  header,
  children,
  color = colors.white,
  borderless = false,
}: Props) => (
  <div
    className={cx(styles.container, { [styles.borderless]: borderless })}
    style={{ backgroundColor: color }}
  >
    <div className={styles.headerNonCollapsible} data-test="widget-header">
      {header}
    </div>
    <div data-test="widget-contents">{children}</div>
  </div>
);
```

## Main export

Create `src/components/Widget/Widget.tsx`:

```tsx
import React from "react";
import { WidgetCollapsible } from "./WidgetCollapsible";
import { WidgetNonCollapsible } from "./WidgetNonCollapsible";
import type { WidgetProps } from "./widget.types";

export { type WidgetProps } from "./widget.types";

export const Widget = ({
  noncollapsible = false,
  ...passOnProps
}: WidgetProps) => {
  if (!noncollapsible) {
    const collapsibleProps = passOnProps as React.ComponentProps<
      typeof WidgetCollapsible
    >;
    return (
      <div>
        <WidgetCollapsible {...collapsibleProps} />
      </div>
    );
  }
  const nonCollapsibleProps = passOnProps as React.ComponentProps<
    typeof WidgetNonCollapsible
  >;
  return (
    <div>
      <WidgetNonCollapsible {...nonCollapsibleProps} />
    </div>
  );
};
```

## Usage

### Non-collapsible

```tsx
import i18n from "@dhis2/d2-i18n";
import { Widget } from "@/components/Widget/Widget";

export const SummaryWidget = () => (
  <Widget header={i18n.t("Summary")} noncollapsible>
    <div style={{ padding: 16 }}>{/* widget content */}</div>
  </Widget>
);
```

### Collapsible

```tsx
import { useState } from "react";
import i18n from "@dhis2/d2-i18n";
import { Widget } from "@/components/Widget/Widget";

export const DetailsWidget = () => {
  const [open, setOpen] = useState(true);

  return (
    <Widget
      header={i18n.t("Details")}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    >
      <div style={{ padding: 16 }}>{/* widget content */}</div>
    </Widget>
  );
};
```

## Key points

- **Content padding** is the consumer's responsibility — Widget only provides the border and header. Add `padding: 16px` inside your widget content div.
- **Use `i18n.t()`** for all widget header strings.
