# Devtools

`@wibble/devtools` collects framework events into a timeline for local debugging and tests.

```ts
import { createDevtoolsTimeline, installWibbleDevtools } from "@wibble/devtools";

const timeline = createDevtoolsTimeline();
const stop = installWibbleDevtools({ router });
```

Supported bridges:

- store actions from `@wibble/store`
- HTTP request lifecycle events from `@wibble/http`
- router transitions and route errors from `@wibble/router`

The package is optional. Import it from a development entry point or test setup when you need the event stream.
