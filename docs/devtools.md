# Devtools

`@wibble/devtools` provides a unified event stream for production debugging, tests, and future visual inspectors.

```ts
import { createDevtoolsTimeline, installWibbleDevtools } from "@wibble/devtools";

const timeline = createDevtoolsTimeline();
const stop = installWibbleDevtools({ router });
```

Current bridges:

- Store action timeline from `@wibble/store`.
- HTTP request lifecycle events from `@wibble/http`.
- Router transitions and route errors from `@wibble/router`.

The package is optional. Apps opt in from development entry points or test setup, keeping production bundles free of devtools code unless explicitly imported.
