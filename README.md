# Wibble

Wibble is a TypeScript-first framework for browser apps. It uses a small `.wib` component format, a compiler, and a fine-grained DOM runtime.

The main idea is simple: keep component files organized enough that data loading, state changes, and markup are easy to find.

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

The workspace includes:

- `@wibble/core` for signals, resources, DOM bindings, and component mounting
- `@wibble/compiler` for parsing, validation, formatting, and TypeScript output
- `@wibble/vite` for `.wib` imports in Vite apps
- `@wibble/router` for nested SPA routes
- `@wibble/store` for feature stores
- `@wibble/forms`, `@wibble/http`, and `@wibble/ui` for common app work
- `@wibble/cli` for checking, formatting, and explaining `.wib` files

Start with [docs/developer-guide.md](docs/developer-guide.md). The detailed references live in [docs/components.md](docs/components.md), [docs/resources.md](docs/resources.md), [docs/stores.md](docs/stores.md), [docs/routing.md](docs/routing.md), [docs/forms.md](docs/forms.md), [docs/runtime.md](docs/runtime.md), and [docs/releasing.md](docs/releasing.md).
