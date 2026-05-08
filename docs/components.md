# Components

Wibble components are `.wib` files with named sections.

Common sections:

- `use` for imports
- `props` for public inputs
- `state` for local mutable state
- `derived` for computed values
- `resource` for async reads
- `actions` for mutations and workflows
- `effects` for synchronous side effects
- `view` for DOM and child components

## View Syntax

The compiler understands native elements, imported components, text bindings, conditionals, keyed lists, named slots, refs, classes, events, and form bindings.

```wibble
component WeatherShell

use
  import Panel from "./Panel.wib"

props
  title: string
  loading: boolean

view
  Panel label "Weather" title title
    slot actions
      button text "Refresh"
    if loading
      p text "Loading"
    else
      slot default
        p text "Ready"
```

Component props become `MaybeReadable<T>` in generated TypeScript, so callers can pass literals, signals, or functions. Every component also accepts `slots?: WibbleSlots`.

## Native HTML

Native HTML elements are supported directly. Wibble emits `document.createElement()` calls and validates standard element and event names. Custom elements are allowed when the tag name contains a dash.

```wibble
view
  select bind value form.fields.region
    option value "iad" text "Ashburn"
    option value "phx" text "Phoenix"
  input type "radio" value "compact" bind group form.fields.density
  input type "file" bind files form.fields.attachments
```

## Classes

Use `class` for static or reactive classes:

```wibble
derived
  panelClass: string = compact ? "panel panelCompact" : "panel"

view
  section class panelClass
    text "Dynamic class"
  Card class "panelCard" title title
```

A quoted class list is emitted as a static binding. An expression is emitted as a reactive binding. On imported components, `class` is forwarded as a prop.

Very long quoted class lists produce `WIB_LONG_CLASS`. Utility CSS still works, but repeated class chains are usually clearer as named classes, derived expressions, or UI component variants.

## Refs

Use refs for explicit DOM integration:

```wibble
view
  div ref panelRef
    text "Panel"
```

Refs are useful for focus, measuring, observers, and third-party DOM integration.

## Effects

Effects are synchronous reactive side effects:

```wibble
effects
  console.log("Selected", selectedId)
```

Do not use effects for API reads or state mutation. Put API reads in `resource` blocks and writes in `actions`.
