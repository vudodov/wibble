# Wibble Roadmap

## V0: SPA foundation

- `.wib` component and store DSL
- Parser, formatter, validator, and TypeScript emitter
- Fine-grained DOM runtime
- Resources for browser-side API reads
- Store and context primitives
- SPA router
- Vite plugin
- CLI check, format, explain, and create commands
- Playground app and tests

## V1: Framework maturity

- Forms and validation
- Stronger accessibility diagnostics
- Devtools signal graph inspector
- Store action timeline
- Resource cache inspector
- More complete view syntax: conditionals, loops, slots, component invocation
- Wibble-native HTTP client primitives
- Wibble-owned UI controls for enterprise product screens
- Route lifecycle hooks, basenames, and error route rendering
- Native HTML schema diagnostics and complete form control bindings
- Runtime refs, portals, mount hooks, observers, focus helpers, and async boundaries
- Data table, virtual list, toast, and progress UI primitives
- Devtools bridges for HTTP, store, and router timelines

## Production rewrite readiness

Large product apps need a pure Wibble surface for app shells, API clients, shared feature state, route lifecycle, forms, and common controls. The current direction is to close those gaps with Wibble primitives:

- `@wibble/http` for request ids, interceptors, retries, ETags, telemetry hooks, and typed responses.
- `@wibble/ui` for generic accessible controls without tying Wibble to an outside UI kit.
- `@wibble/store` helpers for persistent fields, keyed feature stores, list workflows, store resources, and action timelines.
- Router support for basenames, route enter/leave hooks, lazy route errors, nested layouts, redirects, params, and route resources.
- Compiler validation for default HTML elements, DOM events, keyed lists, slots, native forms, and mutation/resource placement.

## V2: Server support

- SSR
- Streaming HTML
- Hydration
- Server route resources
- Static generation
- Server actions

## V3: Startup performance

- Resumability-inspired mode
- Partial hydration alternatives
- Optional non-DOM renderer interface
