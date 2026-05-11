# Components

Wibble components are `.wib` files with ordered sections: `use`, `props`, `state`, `derived`, `resource`, `actions`, `effects`, and `view`.

The compiler now lowers the view section into typed view nodes for:

- elements and imported components,
- text bindings,
- `if`, `else if`, and `else`,
- `for item in items key item.id`,
- named slots,
- form bindings for text inputs, selects, checkboxes, radio groups, and files.

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

Generated TypeScript is deterministic and readable. Component props become `MaybeReadable<T>` so callers can pass literals, signals, or reactive functions. Every component also accepts `slots?: WibbleSlots`.

Native HTML elements are first-class in the DSL. Wibble emits direct `document.createElement()` calls and validates standard element and event names so typos show up during `wibble check`. Custom elements remain available when their tag name contains a dash.

```wibble
view
  select bind value form.fields.region
    option value "iad" text "Ashburn"
    option value "phx" text "Phoenix"
  input type "radio" value "compact" bind group form.fields.density
  input type "file" bind files form.fields.attachments
```

Classes are explicit directives. A quoted class list is emitted as a static class binding; an expression is emitted as a reactive binding. The same directive is forwarded as a `class` prop when used on an imported component.

```wibble
derived
  panelClass: string = compact ? "panel panelCompact" : "panel"

view
  section class panelClass
    text "Dynamic class"
  Card class "panelCard" title title
```

Very long quoted class lists produce a `WIB_LONG_CLASS` warning. Utility CSS is still usable, but Wibble nudges repeated or hard-to-review class chains toward named classes, derived class expressions, or Wibble UI variants.

When a component needs an explicit DOM reference, use a named ref instead of query selectors:

```wibble
view
  div ref panelRef
    text "Panel"
```

Effects are supported for synchronous reactive side effects that are not data fetching and do not mutate Wibble state directly. API reads belong in `resource`; state writes belong in `actions`.

```wibble
effects
  console.log("Selected", selectedId)
```
