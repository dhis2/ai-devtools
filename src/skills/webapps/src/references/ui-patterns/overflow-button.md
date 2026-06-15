# OverflowButton

A reusable three-dot menu trigger built from `Button`, `Layer`, and `Popper` in `@dhis2/ui`.
Place it in a shared location (e.g. `src/components/OverflowButton/`).

`Layer` renders a full-viewport backdrop that closes the menu on outside clicks. `Popper`
anchors the dropdown to the button.

```tsx
import { useRef } from "react";
import { Button, Layer, Popper } from "@dhis2/ui";
import i18n from "@dhis2/d2-i18n";

type OverflowButtonProps = {
  icon: React.ReactElement;
  open: boolean;
  onClick: () => void;
  component: React.ReactNode;
  small?: boolean;
};

export const OverflowButton = ({
  icon,
  open,
  onClick,
  component,
  small,
}: OverflowButtonProps) => {
  const anchorRef = useRef<HTMLDivElement | null>(null);

  return (
    <div ref={anchorRef}>
      <Button
        title={i18n.t("More")}
        small={small}
        onClick={onClick}
        icon={icon}
      />

      {open && (
        <Layer onBackdropClick={onClick}>
          <Popper
            reference={anchorRef as React.RefObject<HTMLDivElement>}
            placement="bottom-start"
          >
            {component}
          </Popper>
        </Layer>
      )}
    </div>
  );
};
```

## Usage

Pass `open` and `onClick` to control the menu from the parent, and `component` for the
dropdown content (typically a `FlyoutMenu`):

```tsx
<OverflowButton
  small
  open={menuOpen}
  icon={<IconMore16 />}
  onClick={() => setMenuOpen((prev) => !prev)}
  component={
    <FlyoutMenu dense>
      <MenuItem
        label={i18n.t("Edit")}
        icon={<IconEdit16 />}
        onClick={handleEdit}
      />
      <MenuItem
        label={i18n.t("Delete")}
        icon={<IconDelete16 />}
        destructive
        onClick={handleDelete}
      />
    </FlyoutMenu>
  }
/>
```
