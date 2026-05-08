# SSR

`@wibble/ssr` is an early server-rendering package for DOM-oriented Wibble apps.

```ts
const result = renderToString(App, {}, {
  manifest,
  entry: "src/main.ts"
});
```

`renderToString` returns HTML, escaped hydration metadata, and selected manifest assets.

Hydration is still limited. `hydrate(container, hydration)` records the hydration metadata on the client container; full client reconciliation is planned for a later phase.

In a server runtime without a DOM adapter, Wibble returns a diagnostic HTML comment instead of rendering the component tree.
