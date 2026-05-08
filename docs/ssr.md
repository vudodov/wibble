# SSR

`@wibble/ssr` is an early DOM-oriented server rendering package.

```ts
const result = renderToString(App, {}, {
  manifest,
  entry: "src/main.ts"
});
```

The result includes `html`, escaped `hydration` metadata, and selected manifest `assets`. In a non-DOM server runtime, Wibble returns a diagnostic HTML comment until a DOM adapter is provided. `hydrate(container, hydration)` marks the client container with hydration metadata; full reconciliation is a later phase.

