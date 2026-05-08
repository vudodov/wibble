# Architecture

Wibble is a browser-first framework built from three pieces:

- a `.wib` source format,
- a compiler that validates and emits TypeScript,
- a fine-grained DOM runtime.

## Data Loading

API reads live in `resource` blocks. A resource declares a stable key and a load expression. The runtime dedupes matching in-flight requests, aborts superseded local requests, ignores late responses, and exposes `data`, `error`, `status`, `loading`, `refreshing`, `reload`, and `invalidate`.

Mutations live in `actions`. Actions can call API clients, update state, call store actions, and invalidate resources. The compiler rejects obvious API reads from `view` and `derived`.

## Rendering

Wibble does not use a virtual DOM. The compiler emits DOM creation code plus bindings for text, attributes, classes, events, conditionals, and lists.

Runtime primitives:

- `signal` stores mutable values.
- `computed` derives values from signals.
- `effect` powers subscriptions and DOM bindings.
- `batch` groups writes into one flush.
- scopes own cleanup for components and conditional branches.
- keyed reconciliation updates list DOM by stable key.

When a signal changes, dependent work is scheduled in a microtask. A text node that reads `count` updates when `count` changes; unrelated DOM does not re-render.

## Shared State

State is scoped deliberately:

- local component state stays in `state`,
- direct parent-child data uses props,
- layout customization uses slots,
- shared feature state uses stores,
- stable services use context,
- route data uses route resources,
- server data uses resource caches.

Stores are typed modules with state, derived values, resources, and actions. Components subscribe by reading individual fields instead of whole-store snapshots.

## Prop Forwarding

Passing props one or two levels is fine. If the same prop is forwarded through a deeper component chain, use a slot, store, or context instead. The compiler warns about obvious pass-through props in a single file; project-wide analysis can be added later without changing the component model.

## Compiler Pipeline

1. Parse `.wib` source into an AST.
2. Normalize section order for formatting.
3. Validate framework rules.
4. Emit TypeScript against Wibble runtime packages.
5. Emit `.wib.d.ts` declarations.
6. Return diagnostics for the CLI, Vite, and editor tooling.

The emitter keeps output deterministic so generated files do not change unless the source changes.
