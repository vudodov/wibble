# Runtime Primitives

`@wibble/core` contains the low-level runtime used by compiled `.wib` files and lower-level TypeScript components.

Use refs for explicit DOM access:

```wibble
use
  import { createRef, type Ref } from "@wibble/core"

state
  panelRef: Ref<HTMLDivElement> = createRef()

view
  div ref panelRef
    text "Measured panel"
```

Refs are for focus, measuring, observers, and DOM integrations that cannot be expressed as normal view bindings.

Other runtime helpers:

- `onMount` for scope-owned post-mount work
- `autoFocus` for focused controls without query selectors
- `renderPortal` for overlays and app-level regions
- `observeResize`, `observeIntersection`, and `observeMutation` for browser observer APIs with automatic cleanup
- `asyncBoundary` for loading, ready, and error branches around a reactive async task

Prefer resources, actions, stores, and view bindings for ordinary application code. Use runtime helpers when the component really needs direct browser integration.
