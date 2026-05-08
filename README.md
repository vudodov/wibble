# Wibble

Wibble is an experimental TypeScript-first SPA framework with:

- a manifest-like `.wib` component DSL,
- a compiler that validates framework rules before runtime,
- a tiny fine-grained reactive DOM runtime,
- first-class stores and resources,
- Wibble-native HTTP, form, and UI primitives,
- a Vite plugin and CLI.

The framework is designed for AI-assisted development where generated changes still need to be easy for humans to review. Source files are intentionally sectioned and deterministic.

```wibble
component Counter

state
  count: number = 0

derived
  doubled: number = count * 2

actions
  increment()
    count = count + 1

view
  section class "counter"
    h1 text "Wibble Counter"
    p text "Count {count}"
    p text "Doubled {doubled}"
    button on click -> increment
      text "Increment"
```

Start with [docs/developer-guide.md](docs/developer-guide.md) for the framework ideology and examples. See [docs/architecture.md](docs/architecture.md) for the design, [docs/components.md](docs/components.md) for the DSL, [docs/runtime.md](docs/runtime.md), [docs/stores.md](docs/stores.md), [docs/http.md](docs/http.md), [docs/ui.md](docs/ui.md), and [docs/devtools.md](docs/devtools.md) for production app primitives. See [docs/releasing.md](docs/releasing.md) for GitHub/npm publishing setup, and [examples/playground](examples/playground) for a multi-page SPA that calls open weather and country APIs through Wibble resources.
