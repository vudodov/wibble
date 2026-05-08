# Roadmap

This roadmap describes the direction of the project. It is not a compatibility promise.

## Foundation

The first set of framework packages is in place:

- `.wib` components and stores
- parser, formatter, validator, and TypeScript emitter
- fine-grained DOM runtime
- browser resources for API reads
- stores and context
- SPA router
- Vite plugin
- CLI commands for check, format, explain, and create
- playground app

## Near Term

The next work is about making those packages more reliable:

- stronger accessibility diagnostics
- richer view syntax validation
- better generated `.d.ts` files
- more complete language-server behavior
- route-level resource examples
- stronger playground coverage
- more compiler fixtures for invalid `.wib` files

## App Primitives

These packages are the main building blocks for larger apps:

- `@wibble/http` for request ids, interceptors, retries, ETags, telemetry hooks, and typed responses
- `@wibble/ui` for reusable accessible controls
- `@wibble/store` for persistent fields, keyed feature stores, list workflows, store resources, and action timelines
- `@wibble/router` for basenames, route lifecycle hooks, lazy route errors, nested layouts, redirects, params, and route resources
- compiler validation for native HTML, DOM events, keyed lists, slots, forms, and mutation/resource placement

## Later

Server support is still early. Planned work includes:

- SSR
- hydration
- route resources on the server
- static generation
- server actions

Startup-performance experiments can come after the server story is stable:

- resumability-inspired loading
- partial hydration alternatives
- a renderer interface that is not tied to the DOM
