# Wibble Architecture

Wibble v0 is an SPA framework with a manifest-like DSL, a TypeScript compiler, and a small fine-grained DOM runtime.

## API Requests

API reads belong in `resource` blocks. A resource declares a stable key and a load expression. The runtime dedupes identical in-flight keys, aborts stale local requests when params change, ignores late responses, and exposes `data`, `error`, `status`, `loading`, `refreshing`, `reload`, and `invalidate`.

API mutations belong in `actions`. Actions may call API clients, update state, and invalidate resources. The compiler rejects `fetch(...)` or `api.*` reads inside `view` and `derived`, and warns when effects perform API work.

## Rendering

Wibble does not use a virtual DOM. The compiler emits static DOM creation code plus bindings for text, attributes, classes, events, conditionals, and lists. Signals schedule dependent bindings in a microtask, so changing `count` updates only DOM nodes that read `count`.

The runtime pieces are:

- `signal` for mutable state,
- `computed` for derived values,
- `effect` for subscriptions and DOM bindings,
- `batch` for grouped writes,
- `scope` cleanup for components and branches,
- keyed DOM reconciliation for lists.

## Multi-component State

State is distributed by scope:

- Local component state stays in `state`.
- Parent-child data uses direct props.
- Layout customization uses component composition and slots.
- Shared feature state uses official stores.
- Stable dependencies use typed context.
- Route data uses route resources.
- API data uses resource caches.

Stores are explicit modules with state, derived values, and actions. Components subscribe to individual fields instead of whole-store snapshots.

## Prop Drilling

Passing props one or two levels is normal. Forwarding the same prop through deeper component chains should become either a slot, a typed store, or typed context. The compiler currently warns about obvious pass-through props inside one file; the CLI is structured so project-level prop-drilling analysis can be expanded across the whole graph.

## Compiler Pipeline

1. Parse `.wib` source into an AST.
2. Normalize and format section order.
3. Validate Wibble rules.
4. Emit readable TypeScript against `@wibble/core`, `@wibble/forms`, and official packages.
5. Emit adjacent `.wib.d.ts` declarations for IntelliSense and TypeScript consumers.
6. Provide diagnostics for Vite, CLI, and editor output.

The emitter is intentionally deterministic so generated output and diagnostics are stable for AI-generated pull requests.
