# Runtime Primitives

`@wibble/core` owns the low-level primitives that make production components possible without leaving Wibble.

Use refs for explicit DOM escape hatches:

```wibble
use
  import { createRef, type Ref } from "@wibble/core"

state
  panelRef: Ref<HTMLDivElement> = createRef()

view
  div ref panelRef
    text "Measured panel"
```

Refs are for focus, measuring, observers, and integrations that cannot be expressed as normal view bindings. Keep them local and name them clearly so review tools can find imperative work.

The runtime also includes:

- `onMount` for scope-owned post-mount work.
- `autoFocus` for focused controls without query selectors.
- `renderPortal` for overlays and app-level regions.
- `observeResize`, `observeIntersection`, and `observeMutation` for browser observer APIs with automatic cleanup.
- `asyncBoundary` for loading, ready, and error branches around a reactive async task.

These helpers are deliberately small. Framework code should still prefer resources, actions, stores, and view bindings first.
